// 实操工作台阶段（Agent 工作台 + 生图/文本产物 + 评分卡）。
// 2026-11 自 AssessmentFlow.jsx 机械拆出（纯移动，逻辑零改动）。
import { ArrowRight, Brain, CaretLeft, CaretRight, ClipboardText, CircleNotch, Download, FileDoc, ImageSquare, ListChecks, MagnifyingGlassPlus, PaperPlaneTilt, Sparkle, Target, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PHASE_SECONDS, usePhaseClock } from "../assessment-timing";
import { readEdition } from "../bank-editions";
import { generateArkImage, streamDeepSeek } from "../deepseek";
import { autoResizeRef, onEnterSubmit } from "../ime";
import {  } from "../interviewer";
import { MarkdownLite } from "../markdown-lite";
import { practicalAgentMessages, practicalImagePrompt, practicalImageRefs } from "../practical-agent";
import { deliveryRequirements, scoringSchemeRows, taskImageSize } from "../practical-scoring";
import { downloadTaskMaterialDocx } from "../task-material-docx";
import { IMAGE_DRAG_TYPE, inputAssets, productAssets, referenceDataUri, assetLabel, MAX_GENERATIONS, PracticalImageLightbox, PhaseTimer, TaskAction, useStorySequencer } from "./flow-shared";

export function offlineImage(title) {
  const words = String(title ?? "AI 生成任务");
  const lines = [];
  for (let index = 0; index < words.length && lines.length < 3; index += 10) {
    lines.push(words.slice(index, index + 10));
  }
  const text = lines.map((line, index) =>
    `<text x='512' y='${470 + index * 84}' text-anchor='middle' font-family='PingFang SC, sans-serif' font-size='58' font-weight='700' fill='#3d4a5c'>${line
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='#f6f8fb'/><stop offset='1' stop-color='#e8edf4'/>
    </linearGradient></defs>
    <rect width='1024' height='1024' fill='url(#g)'/>
    <circle cx='512' cy='300' r='120' fill='none' stroke='#c6d2e2' stroke-width='10'/>
    <circle cx='472' cy='262' r='16' fill='#c6d2e2'/><circle cx='552' cy='262' r='16' fill='#c6d2e2'/>
    <path d='M452 336 Q512 386 572 336' fill='none' stroke='#c6d2e2' stroke-width='10' stroke-linecap='round'/>
    ${text}
    <text x='512' y='760' text-anchor='middle' font-family='PingFang SC, sans-serif' font-size='34' fill='#8a97a8'>离线演示图 · 配置 API Key 后生成真实图片</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function offlineAgentOutput(task, prompt) {
  const steps = task.requirements
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  return `> **离线演示输出** —— 当前未连接 AI 服务，以下为按交付标准整理的产出框架。\n\n**任务**：${task.title}\n\n**你的提示词**：${prompt}\n\n---\n\n${steps}\n\n---\n\n以上框架在接入 AI 服务后会由 Agent 依据原始素材实际生成完整交付内容。`;
}

// 评分走服务端 /api/practical-score：题库的评分标准与参考答案只存在
// 服务端（publicTask 不下发），学员交卷后由服务端对照 rubric 逐维评分，
// 回传每一维的档位、得分与评语。
async function requestPracticalScore({ task, generations, finalGeneration, isImageTask }) {
  const response = await fetch("/api/practical-score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: task.id,
      edition: readEdition(),
      prompt: finalGeneration.prompt,
      prompts: generations.map((entry) => entry.prompt),
      product: finalGeneration.output ?? "",
      // 图片任务把产物图一并交给评委：产物维度里「原图保真」「边缘自然」
      // 只能看图判断，只给提示词等于让评委凭空判档。
      // 离线占位图不发（那是降级提示，不是学员产物）。
      productImage: isImageTask && !finalGeneration.offline ? (finalGeneration.imageUrl ?? "") : "",
      // 同时把任务自带的参考原图发给评委：判「原图保真」必须与原图比对，
      // 只给产物等于让评委凭空猜测原图长什么样。
      referenceImages: isImageTask
        ? (await Promise.all(inputAssets(task).map((asset) => referenceDataUri(asset.src)))).filter(Boolean)
        : [],
      // 标准产物范例（role=product）：评委判「优秀」的对照基准。
      // 之前只把它当输入素材过滤掉，评委没有参照 → 「色彩融合」等维度恒判满分。
      standardProductImage: isImageTask
        ? ((await Promise.all(productAssets(task).map((asset) => referenceDataUri(asset.src)))).find(Boolean) ?? "")
        : "",
      isImage: isImageTask,
      iterations: generations.length,
    }),
  });
  if (!response.ok) throw new Error("评分服务暂时不可用。");
  const payload = await response.json();
  if (!payload || !Number.isFinite(Number(payload.credit)) || !payload.prompt || !payload.product) {
    throw new Error("评分结果不完整。");
  }
  return payload;
}

// 评分路由本身不可达（断网/旧部署）时的最后兜底：沿用关键词覆盖启发式
// 只给一个总档位分，不带逐维明细——界面会明示这是离线估算。

export function practicalHeuristic(task, generation) {
  const output = `${generation.output ?? ""} ${generation.prompt}`;
  // 「评分标准…/达到评分标准…」是元信息行，不得进入覆盖率分母
  // （精选库 requirements 全是「达到评分标准：…」行，产物永远不含
  // 「基础符合度」这类词，离线兜底分会被压到底档）。
  const realRequirements = task.requirements.filter((item) => !/^(评分标准|达到评分标准)/.test(String(item).trim()));
  const hits = realRequirements.filter((requirement) => {
    const tokens = requirement.split(/[，。：:、\s]+/).filter((token) => token.length >= 2);
    return tokens.some((token) => output.includes(token));
  }).length;
  const coverage = realRequirements.length ? hits / realRequirements.length : 0.5;
  const promptDepth = Math.min(1, [...generation.prompt].length / 120);
  return Math.round(Math.min(1, 0.65 * coverage + 0.35 * promptDepth) * 100) / 100;
}

/** 评分报告里的单套评分标准卡片：逐维度档位 + 得分 + 评语。 */

export function PracticalScoreCard({ title, part }) {
  return (
    <section className="wb-score-card" aria-label={title}>
      <header className="wb-score-card-head">
        <strong>{title}</strong>
        <b>{part.awarded} / {part.max} 分</b>
      </header>
      <ol className="wb-score-rows">
        {part.rows.map((row) => (
          <li key={row.dimension} className={`is-${row.level}`}>
            <div className="wb-score-row-top">
              <span className="wb-score-dim">{row.dimension}</span>
              <span className="wb-score-level">{row.levelLabel}</span>
              <b className="wb-score-pts">{row.awarded} / {row.max}</b>
            </div>
            {row.comment ? <p className="wb-score-comment">{row.comment}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PracticalWorkbenchPhase({
  hasStory,
  story,
  guardian,
  levelId = "workshop",
  taskId = null,
  seconds = PHASE_SECONDS,
  onComplete,
  onCharacterFeedback,
  onTaskEvidence = null,
  abilityResult = null,
}) {
  // phase: opening → brief（读任务）→ work（作答）→ score（评分报告）
  const [phase, setPhase] = useState(hasStory ? "opening" : "brief");
  const [task, setTask] = useState(null);
  const [taskStatus, setTaskStatus] = useState("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [draft, setDraft] = useState("");
  const [generations, setGenerations] = useState([]);
  const [liveOutput, setLiveOutput] = useState("");
  // DeepSeek 的流式思考内容（reasoning_content）与最终产物分开展示；
  // 它只服务作答时的过程可视化，不进入评分请求。
  const [liveThinking, setLiveThinking] = useState("");
  // 正在生成的那一轮指令：先把它作为一条"我"的气泡放进线程，
  // 学员才不会在等待时觉得自己的输入消失了（旧版要等整轮结束才出现）。
  const [livePrompt, setLivePrompt] = useState("");
  const [running, setIsRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  // 学员上传的参考图（data URI）。实操任务里常需要"我有一张图，请按它来"，
  // 没有上传就只能靠文字描述，很多任务没法做。
  const [uploads, setUploads] = useState([]);
  const uploadInputRef = useRef(null);
  // 点击任何实操图片后进入全屏预览；Esc 或点遮罩关闭。
  const [imagePreview, setImagePreview] = useState(null);
  // 图片拖到 AI 工作台时的落点反馈。计数能避免进入子元素时的闪烁。
  const [dragOverComposer, setDragOverComposer] = useState(false);
  const dragDepthRef = useRef(0);
  // 线程滚动容器：新气泡出现时滚到底，保持最新一轮可见。
  const threadRef = useRef(null);
  // 评分报告（/api/practical-score 的返回；离线兜底时只有总档位分）。
  const [scoreReport, setScoreReport] = useState(null);
  // 两步态：先只呈现任务与交付标准（大字、留白充足），确认后再进入作答界面。
  // 一屏同时塞下标准+素材+画布+输入框，只能把字号压到 12–15px，反而看不清。
  const [briefAcknowledged, setBriefAcknowledged] = useState(false);
  // 作答页内的两个视图都保持挂载；切换只控制可见性，避免丢失草稿、上传和生成状态。
  const [workbenchView, setWorkbenchView] = useState("task");
  const finalGeneration = generations[generations.length - 1];
  const threadFollowRef = useRef(true);
  const thinkingFollowRef = useRef(true);
  const liveThinkingBodyRef = useRef(null);

  const { storyPhase, lines, lineIndex, advanceStory, skipStory } = useStorySequencer({
    hasStory,
    story,
    phase,
    onCompletePhase: (next) => {
      if (next === "quiz") setPhase("work");
      else onComplete();
    },
  });

  // 计时钟覆盖简报态与作答态：读任务同样消耗这 5 分钟，
  // 否则学员可以先读完简报再开始计时。评分报告阶段不再计时。
  const clock = usePhaseClock({
    seconds,
    running: phase === "work" || phase === "brief",
    onExpire: () => {
      if (phase !== "work" && phase !== "brief") return;
      // The clock never destroys work in progress: whatever the student has
      // already typed stays editable and can still be submitted once.
      setPhase("work");
    },
  });

  useEffect(() => {
    onCharacterFeedback?.({
      phase,
      result: running ? null : (generations.length ? { correct: true } : null),
      reaction: running
        ? "Agent 正在执行实操生成任务，请稍候…"
        : phase === "score"
          ? "评分出炉：每个维度都有档位、得分和评语，对照看看还能从哪里加分。"
          : generations.length
            ? "生成完成！可以继续提要求让 Agent 改，直到满意再交卷。"
            : "在下方撰写提示词并点击发送，驱动 Agent 完成任务。",
      speakerName: guardian,
    });
  }, [phase, running, generations.length, guardian, onCharacterFeedback]);

  // 新气泡出现或流式思考/输出增长时，把线程滚到底 —— 连续迭代时最新一轮
  // 必须在视野里，否则学员会以为"没反应"。若学员主动上翻，暂停跟随。
  useEffect(() => {
    const node = threadRef.current;
    const thought = liveThinkingBodyRef.current;
    if (node && threadFollowRef.current) node.scrollTop = node.scrollHeight;
    if (thought && thinkingFollowRef.current) thought.scrollTop = thought.scrollHeight;
  }, [generations.length, running, liveOutput, liveThinking]);

  // 能力知情选任务（实验 3 R1）：用当前（客观题 CAT 已收敛的）能力估计
  // 提示服务端挑难度匹配的实操任务。θ̂ = logit(维度分均值)，无结果时不带
  // hint（退化为随机，单通道/抢跑场景）。
  const abilityHint = useMemo(() => {
    const scored = abilityResult?.dimensions?.filter((dimension) => Number.isFinite(dimension.score));
    if (!scored?.length) return null;
    const overall = scored.reduce((sum, dimension) => sum + dimension.score, 0) / scored.length;
    const p = Math.max(0.02, Math.min(0.98, overall / 100));
    return Math.max(-1.6, Math.min(1.6, Math.log(p / (1 - p))));
  }, [abilityResult]);

  useEffect(() => {
    // 开始作答/评分后不再取任务：交卷时 abilityHint 会随实操证据进入 IRT
    // 结果而变化，若此时重取任务会把学员已评分的任务整个换掉（评分报告页
    // 标题与内容错配）。注意综合测评的实操阶段从剧情直接进 work 态、
    // 不经过 brief——守卫必须按「是否已在作答/评分」判断，不能按「是否
    // 在 brief」判断（后者会让综合测评永远取不到任务，实测踩过）。
    if (phase === "score" || generations.length > 0 || briefAcknowledged) return undefined;
    let active = true;
    setTaskStatus("loading");
    const params = new URLSearchParams();
    if (taskId) params.set("taskId", taskId);
    else params.set("levelId", levelId);
    params.set("count", "1");
    params.set("edition", readEdition());
    if (abilityHint !== null) params.set("difficultyHint", abilityHint.toFixed(2));
    fetch(`/api/practical-tasks?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("任务加载失败。");
        const payload = await response.json();
        if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
          throw new Error("任务数据不完整。");
        }
        if (!active) return;
        const loaded = payload.tasks[0];
        setTask(loaded);
        setTaskStatus("ready");
        // 任务自带的输入素材默认就处于"已上传"状态：图片类任务的前提是
        // "我有一张图"，素材本就是任务的组成部分，让学员手动再传一次既多余
        // 又容易漏。异步压缩，不阻塞界面呈现。
        toUploadList(seedTaskAssets(loaded)).then((items) => {
          if (active && items.length) setUploads((current) => (current.length ? current : items));
        }).catch(() => { /* 素材压缩失败不影响作答，学员仍可手动上传 */ });
        // 单通道（无开场剧情）同样先停在简报态：学员必须先读任务与交付标准，
        // 再由「开始作答」进入作答界面。这里曾经直接跳到 work，
        // 使简报态形同虚设、主按钮永不出现。
      })
      .catch(() => {
        if (active) setTaskStatus("error");
      });
    return () => {
      active = false;
    };
    // abilityHint 进依赖：θ̂ 在客观题阶段结束后才可用，续答场景下任务
    // 请求可能先于结果就绪发出，结果到位后重取一次匹配难度的任务
    // （仍限定 brief 态：学员还没开始作答，重取无副作用）。
  }, [levelId, taskId, reloadToken, hasStory, abilityHint, phase, generations.length, briefAcknowledged]);


  if (!task) {
    return <div className="task-body practical-task">
      <div className="agent-empty quiz-loading">
        {taskStatus === "error" ? (
          <>
            <span>任务加载失败。</span>
            <button className="source-toggle" type="button" onClick={() => setReloadToken((current) => current + 1)}>重新加载</button>
          </>
        ) : (
          <>
            <CircleNotch className="reply-spinner" weight="bold" />
            <span>正在准备实操任务…</span>
          </>
        )}
      </div>
    </div>;
  }

  const isImageTask = task.outputType === "image";

  /**
   * 把任意图片源（File 或 URL/data URI）压缩成统一规格的上传项。
   *
   * 为什么必须压缩：原图动辄 3–5 MB，转成 base64 后体积再涨 33%，
   * 既可能超过请求体限制，也让每轮生成都多传几 MB。这里统一缩到长边 1024px、
   * 以 JPEG 0.82 重编码，通常压到 100–300 KB，对"参考构图/风格"足够。
   *
   * 任务自带的素材（/tasks/*.jpg）也走这条路径 —— 它们同样是几 MB 的图，
   * 直接原样内联进请求会显著拖慢每轮生成。
   */
  async function toUploadItem(source, fallbackName = "参考图", explicitSourceId = null) {
    let dataUrl;
    let name = fallbackName;
    let sourceId = explicitSourceId;
    if (typeof source === "string") {
      dataUrl = source;
      name = source.split("/").pop() || fallbackName;
      sourceId = source;
    } else {
      if (!source.type?.startsWith("image/")) throw new Error("只支持图片文件。");
      name = source.name || fallbackName;
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("读取图片失败。"));
        reader.readAsDataURL(source);
      });
    }
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片格式无法识别。"));
      img.src = dataUrl;
    });
    const MAX_EDGE = 1024;
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    return { src: canvas.toDataURL("image/jpeg", 0.82), name, width, height, sourceId };
  }

  /**
   * 任务自带的输入素材默认就处于"已上传"状态。
   *
   * 图片类任务的前提是"我有一张图"，素材本来就是任务的组成部分；让学员
   * 再手动上传一次既多余又容易漏（文件在服务器上，学员手上未必有）。
   * 检测到任务带 reference/secondary 素材时自动预置，并标注为"任务素材"
   * 以便与学员自己传的图区分；学员可以移除或追加自己的图。
   */
  function seedTaskAssets(taskDef) {
    const list = inputAssets(taskDef);
    if (!list.length) return [];
    return list.map((asset) => ({
      src: asset.src,
      name: asset.label || assetLabel(asset),
      fromTask: true,
    }));
  }

  /** 批量压缩任务素材，保留 fromTask 标记（供 UI 区分来源）。 */
  async function toUploadList(seeds) {
    const items = [];
    for (const seed of seeds) {
      try {
        const item = await toUploadItem(seed.src, seed.name, seed.src);
        items.push({ ...item, name: seed.name, fromTask: true });
      } catch { /* 单张失败跳过 */ }
    }
    return items;
  }

  async function handleUpload(event) {
    const files = [...(event.target.files ?? [])].slice(0, 4);
    event.target.value = ""; // 允许重复选同一个文件
    if (!files.length) return;
    try {
      const items = [];
      for (const file of files) items.push(await toUploadItem(file, "上传的图"));
      setUploads((current) => [...current, ...items].slice(0, 4));
      setError("");
    } catch (uploadError) {
      setError(uploadError.message || "图片上传失败。");
    }
  }

  /** 拖拽进来的图复用现有压缩与挂载流程，并按来源去重。 */
  async function appendDroppedImages(items) {
    if (running) {
      setError("Agent 生成中暂时不能调整参考图。");
      return;
    }
    const usable = items.filter((item) => item?.src && !item.offline);
    if (!usable.length) {
      setError("离线占位图不能作为参考图。");
      return;
    }

    const ownedIds = new Set(uploads.map((item) => item.sourceId).filter(Boolean));
    const accepted = [];
    let overflow = false;
    for (const candidate of usable) {
      if (candidate.sourceId && ownedIds.has(candidate.sourceId)) continue;
      if (accepted.length + uploads.length >= 4) {
        overflow = true;
        continue;
      }
      try {
        const item = await toUploadItem(candidate.src, candidate.name || "参考图", candidate.sourceId || null);
        accepted.push({ ...item, fromTask: Boolean(candidate.fromTask) });
        if (candidate.sourceId) ownedIds.add(candidate.sourceId);
      } catch {
        setError("拖入的图片无法读取。");
      }
    }

    if (accepted.length) {
      setUploads((current) => [...current, ...accepted].slice(0, 4));
      setError("");
    }
    if (overflow) setError("最多挂载 4 张参考图。");
  }

  function handleImageDragStart(payload) {
    return (event) => {
      event.dataTransfer.setData(IMAGE_DRAG_TYPE, JSON.stringify(payload));
      event.dataTransfer.setData("text/uri-list", payload.src);
      event.dataTransfer.setData("text/plain", payload.src);
      event.dataTransfer.effectAllowed = "copy";
    };
  }

  function hasImageDrag(event) {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return types.includes(IMAGE_DRAG_TYPE) || types.includes("Files") || types.includes("text/uri-list");
  }

  function handleDragEnter(event) {
    if (!hasImageDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragOverComposer(true);
  }

  function handleDragOver(event) {
    if (!hasImageDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOverComposer(false);
  }

  async function handleImageDrop(event) {
    if (!hasImageDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragOverComposer(false);

    const customData = event.dataTransfer.getData(IMAGE_DRAG_TYPE);
    if (customData) {
      try {
        await appendDroppedImages([JSON.parse(customData)]);
      } catch {
        setError("拖入的图片无法读取。");
      }
      return;
    }

    const uri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    if (uri && /^(data:image\/|https?:\/\/)/i.test(uri)) {
      await appendDroppedImages([{ src: uri, name: "拖入的图" }]);
      return;
    }

    const files = [...(event.dataTransfer.files ?? [])].filter((file) => file.type.startsWith("image/"));
    if (files.length) {
      await appendDroppedImages(files.map((file) => ({ src: file, name: file.name || "拖入的图" })));
    }
  }

  /**
   * 粘贴图片：从剪贴板取图。
   *
   * 截图后直接粘贴是最自然的操作（比"先另存为文件再选文件"短得多），
   * 而浏览器默认只会把图片粘进 contenteditable 里 —— textarea 拿不到。
   * 这里监听 paste 事件，从 clipboardData 取图片文件。
   */
  async function handlePaste(event) {
    const items = [...(event.clipboardData?.items ?? [])];
    const files = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return; // 粘贴文字时不拦截
    event.preventDefault();
    try {
      const converted = [];
      for (const file of files) converted.push(await toUploadItem(file, "粘贴的图"));
      setUploads((current) => [...current, ...converted].slice(0, 4));
      setError("");
    } catch (pasteError) {
      setError(pasteError.message || "粘贴的图片无法读取。");
    }
  }
  const atGenerationCap = generations.length >= MAX_GENERATIONS;
  const expired = clock.remainingMs <= 0;

  const run = async () => {
    const prompt = draft.trim();
    // Past the bell a student may still submit one prompt they had already
    // started writing — the time budget gates new iterations, not this one.
    const expiredButStarted = expired && prompt.length > 0 && generations.length === 0;
    if (!prompt || running || atGenerationCap || (expired && !expiredButStarted)) return;
    threadFollowRef.current = true;
    thinkingFollowRef.current = true;
    setError("");
    setIsRunning(true);
    setLiveOutput("");
    setLiveThinking("");
    // 先把本轮指令放上屏：等待期间学员能看见"我说了什么"，
    // 而不是输入框清空后只剩一个转圈。
    setLivePrompt(prompt);
    // 发送即清空草稿；原文已进入线程记录，等待期间不继续占住输入框。
    setDraft("");
    // 本轮之前已完成的轮次：文本任务作为对话历史，图片任务作为修订底图。
    const history = generations;
    const previous = history[history.length - 1] ?? null;
    const turnNumber = history.length + 1;
    const entry = { prompt, offline: false };
    try {
      if (isImageTask) {
        // 参考图 = 学员上传的素材 + 上一轮产物（见 practicalImageRefs 的说明）。
        const refs = practicalImageRefs(uploads, previous, turnNumber);
        try {
          entry.imageUrl = await generateArkImage({
            prompt: practicalImagePrompt(task, prompt, refs.map((r) => r.name), turnNumber),
            images: refs.map((r) => r.src),
            // 尺寸由**学员提示词**决定（写明 16:9 才输出 16:9）。
            // 不用题面代办：那样「规格合规」对所有水平档恒为满分，白送分且无区分度。
            // 学员一个字的比例都没写 → 用服务端默认方形，由评分标准扣分。
            size: taskImageSize(prompt, task),
          });
          setOffline(false); // 真实生成成功即复位离线态（此前永不复位）。
        } catch (error) {
          // 生成失败要**说出来**，不能悄悄换成演示图。
          // 学员拿不到真图时，若只看得到一张"看着像成品"的占位图，
          // 会以为生成成功、照着它写提示词，评分也失去意义。
          // 只有确实没有配置生图服务（离线模式）才降级为演示图。
          setOffline(true);
          entry.imageUrl = offlineImage(task.title);
          entry.offline = true;
          setError(
            error?.message
              ? `本次生成未成功：${error.message} 已先用占位图代替，可修改提示词重试。`
              : "本次生成未成功，已先用占位图代替，可修改提示词重试。",
          );
        }
      } else {
        let output = "";
        let reasoning = "";
        let failed = false;
        try {
          // 多轮：把已完成的轮次一并交给 Agent，支持"在上一版上再改"。
          output = await streamDeepSeek({
            messages: practicalAgentMessages(task, history, prompt, uploads),
            onDelta: (message) => {
              output = message;
              setLiveOutput(message);
            },
            onReasoning: (message) => {
              reasoning = message;
              setLiveThinking(message);
            },
          });
        } catch {
          failed = true;
        }
        if (failed || !output.trim()) {
          setOffline(true);
          output = offlineAgentOutput(task, prompt);
          entry.offline = true;
        } else {
          // 一次瞬时失败不该把整个阶段永久钉在离线态：本轮真实生成成功
          // 即摘除离线 chip（此前只有 setOffline(true) 没有复位，用户重试
          // 成功后界面仍显示「离线演示模式」）。
          setOffline(false);
        }
        entry.output = output;
        entry.reasoning = reasoning;
      }
      setGenerations((current) => [...current, entry]);
    } catch (requestError) {
      setError(requestError.message || "运行失败，请重试。");
    } finally {
      setIsRunning(false);
      setLiveOutput("");
      setLiveThinking("");
      setLivePrompt("");
    }
  };

  const finish = async () => {
    if (finishing || !finalGeneration) return;
    setFinishing(true);
    let report = null;
    try {
      report = await requestPracticalScore({ task, generations, finalGeneration, isImageTask });
      setOffline(false); // 权威评分可达即在线，覆盖旧失败标记。
    } catch {
      setOffline(true);
    }
    if (!report) {
      // 评分路由不可达：只剩本地启发式总档位分，无逐维明细。
      report = {
        judged: "offline",
        taskId: task.id,
        prompt: null,
        product: null,
        totalScore: null,
        maxScore: null,
        credit: practicalHeuristic(task, finalGeneration),
      };
    }
    setScoreReport(report);
    onTaskEvidence?.({
      id: `prac-${task.id}`,
      dimKeys: Array.isArray(task.dimKeys) && task.dimKeys.length ? task.dimKeys : ["D3", "D4"],
      credit: report.credit,
      // 任务真实难度随证据入库：融合层按此做 IRT 等值校准（难度不同的
      // 任务上拿到同一 credit，折算的绝对能力不同）。缺省回退 medium。
      difficulty: task.difficulty ?? "medium",
      label: "实操任务",
    });
    setFinishing(false);
    // 先看评分报告；报告页的「完成本关」才推进到结尾/下一阶段。
    setPhase("score");
  };

  // score 必须排除在简报守卫外：综合测评走剧情路径（opening→work），
  // briefAcknowledged 恒为 false，若让 score 落进这个分支，交卷后的评分
  // 报告会被渲染成简报屏（实测：整场走完却看不到评分，data-phase=brief）。
  // 单通道经 brief→work 置位过 briefAcknowledged，从未暴露此路径。
  if (phase === "brief" || (!briefAcknowledged && phase !== "work" && phase !== "score")) {
    const scheme = scoringSchemeRows(task);
    return (
      <div className="task-body practical-task workbench" data-phase="brief">
        <div className="wb-brief-screen">
          <div className="wb-brief-scroll">
          <div className="wb-brief-head">
            <span className="wb-brief-kicker">{isImageTask ? "图片生成任务" : "文本生成任务"} · 先读任务，再开始作答</span>
            <PhaseTimer remainingMs={clock.remainingMs} />
          </div>
          <h2>{task.title}</h2>
          <p className="wb-brief-goal">{task.goal}</p>

          {inputAssets(task).length > 0 && (
            <figure className="wb-reference wb-brief-refs" aria-label="任务参考素材">
              {inputAssets(task).map((asset) => (
                <figure className="wb-reference-item" key={asset.src}>
                  <button
                    type="button"
                    className="wb-image-button"
                    draggable
                    onDragStart={handleImageDragStart({
                      src: asset.src,
                      name: assetLabel(asset),
                      sourceId: asset.src,
                      fromTask: true,
                    })}
                    onClick={() => setImagePreview({ src: asset.src, alt: assetLabel(asset), caption: assetLabel(asset) })}
                    title="点击放大，拖到 AI 工作台可挂载参考图"
                  >
                    <img src={asset.src} alt={assetLabel(asset)} draggable={false} />
                    <span className="wb-image-action"><MagnifyingGlassPlus weight="bold" /><span>放大</span></span>
                  </button>
                  <figcaption>{assetLabel(asset)}</figcaption>
                </figure>
              ))}
            </figure>
          )}

          <div className="wb-brief-criteria">
            <div className="agent-section-heading"><ClipboardText weight="fill" /><span>交付标准</span></div>
            <ol className="wb-requirements">
              {deliveryRequirements(task).map((item) => <li key={item}>{item}</li>)}
            </ol>
            {scheme.length > 0 && <p className="wb-scheme-note">交卷后逐维评分：{scheme.join("；")}，共 20 分。</p>}
          </div>

          {task.source && (
            <details className="wb-brief-source">
              <summary>查看原始素材</summary>
              <div className="wb-material"><MarkdownLite text={task.source} /></div>
            </details>
          )}
          </div>

          <button
            type="button"
            className="wb-brief-start"
            onClick={() => {
              setBriefAcknowledged(true);
              setPhase("work");
              setWorkbenchView("agent");
            }}
          >
            我已了解任务，开始作答
            <ArrowRight weight="bold" />
          </button>
        </div>
        {imagePreview && <PracticalImageLightbox image={imagePreview} onClose={() => setImagePreview(null)} />}
      </div>
    );
  }

  if (phase === "score") {
    const report = scoreReport ?? {
      judged: "offline", prompt: null, product: null, totalScore: null, maxScore: null, credit: 0,
    };
    const hasDetail = Boolean(report.prompt || report.product);
    return (
      <div className="task-body practical-task workbench" data-phase="score">
        <div className="wb-score-screen">
          <div className="wb-score-scroll">
            <div className="wb-score-head">
              <span className="wb-score-kicker">实操任务 · 评分报告</span>
              <span className={`wb-judge-chip is-${report.judged}`}>
                {report.judged === "llm" ? "AI 评委逐维评分" : report.judged === "heuristic" ? "离线规则评审" : "离线估算"}
              </span>
            </div>
            <div className="wb-score-hero">
              <div className="wb-score-total">
                <strong>
                  {Number.isFinite(Number(report.totalScore)) ? report.totalScore : Math.round(report.credit * 100)}
                  <em>{Number.isFinite(Number(report.totalScore)) ? ` / ${report.maxScore} 分` : " / 100"}</em>
                </strong>
                <span>{Number.isFinite(Number(report.totalScore)) ? `按 20 分制折算 ${Math.round(report.credit * 100)}%` : "任务综合档位分"}</span>
                <small className="wb-score-bridge">报告中的实操能力分按任务难度做测量校准，与得分率不同：满分任务在中档难度下折算约 83 分。</small>
              </div>
              <ul className="wb-score-parts">
                {report.prompt && (
                  <li><span>提示词评分</span><b>{report.prompt.awarded} / {report.prompt.max} 分</b></li>
                )}
                {report.product && (
                  <li><span>最终产物评分</span><b>{report.product.awarded} / {report.product.max} 分</b></li>
                )}
                <li><span>生成迭代</span><b>{generations.length} 次</b></li>
              </ul>
            </div>
            {hasDetail && (
              <div className="wb-score-tables">
                {report.prompt && <PracticalScoreCard title="评分标准一 · 提示词" part={report.prompt} />}
                {report.product && <PracticalScoreCard title="评分标准二 · 最终产物" part={report.product} />}
              </div>
            )}
            {!hasDetail && (
              <p className="wb-score-note">离线模式下按关键词覆盖估算总档位分；接入评分服务后将展示逐维得分与评语。</p>
            )}
            {report.judged === "heuristic" && (
              <p className="wb-score-note">当前为离线规则评审（逐维档位按要素覆盖估算）；接入 DeepSeek 后由 AI 评委对照评分标准判档。</p>
            )}
          </div>
          <button
            type="button"
            className="wb-brief-start"
            onClick={onComplete}
          >
            完成本关
            <ArrowRight weight="bold" />
          </button>
        </div>
      </div>
    );
  }

  const scheme = scoringSchemeRows(task);
  return (
    <div className="task-body practical-task workbench" data-phase="work">
      <div className="workbench-head">
        <div className="wb-view-switch" role="tablist" aria-label="实操任务内容切换">
          <button
            type="button"
            className="wb-view-arrow"
            onClick={() => setWorkbenchView("task")}
            disabled={workbenchView === "task"}
            aria-label="查看任务说明"
          >
            <CaretLeft weight="bold" />
          </button>
          <button
            type="button"
            className={`wb-view-tab${workbenchView === "task" ? " is-active" : ""}`}
            role="tab"
            aria-selected={workbenchView === "task"}
            aria-controls="practical-task-panel"
            onClick={() => setWorkbenchView("task")}
          >
            任务说明
          </button>
          <button
            type="button"
            className={`wb-view-tab${workbenchView === "agent" ? " is-active" : ""}`}
            role="tab"
            aria-selected={workbenchView === "agent"}
            aria-controls="practical-agent-panel"
            onClick={() => setWorkbenchView("agent")}
          >
            AI 工作台
          </button>
          <button
            type="button"
            className="wb-view-arrow"
            onClick={() => setWorkbenchView("agent")}
            disabled={workbenchView === "agent"}
            aria-label="查看 AI 工作台"
          >
            <CaretRight weight="bold" />
          </button>
        </div>
        <div className="workbench-meta">
          <span className="wb-chip">{isImageTask ? "图片生成任务" : "文本生成任务"}</span>
          {offline && <span className="offline-chip">离线演示模式</span>}
          <PhaseTimer remainingMs={clock.remainingMs} />
        </div>
      </div>
      <div className="agent-workspace workbench-grid" data-view={workbenchView}>
        {/* 任务说明视图：题目展示与交付标准、参考素材 */}
        <section
          id="practical-task-panel"
          className={`agent-checklist wb-brief wb-task-panel${workbenchView === "task" ? "" : " is-hidden"}`}
          aria-label="任务要求与交付标准"
          aria-hidden={workbenchView !== "task"}
        >
          <div className="wb-task-scroll">
            <div className="wb-task-card wb-goal-card">
              <div className="agent-section-heading">
                <Target weight="fill" />
                <span>任务背景与目标</span>
              </div>
              <p className="wb-goal">{task.goal}</p>
            </div>

            <div className="wb-task-card wb-requirements-card">
              <div className="agent-section-heading">
                <ClipboardText weight="fill" />
                <span>交付标准</span>
              </div>
              <ol className="wb-requirements">
                {deliveryRequirements(task).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              {scheme.length > 0 && (
                <div className="wb-scheme-note">
                  <Sparkle weight="fill" size={14} />
                  <span>评分对标：{scheme.join("；")}（共 20 分，AI 评委逐维评定）</span>
                </div>
              )}
            </div>

            {inputAssets(task).length > 0 && (
              <div className="wb-task-card wb-assets-card">
                <div className="agent-section-heading">
                  <ImageSquare weight="fill" />
                  <span>任务参考图（已挂载）</span>
                </div>
                <figure className="wb-reference" aria-label="任务参考素材">
                  {inputAssets(task).map((asset) => (
                    <figure className="wb-reference-item" key={asset.src}>
                      <button
                        type="button"
                        className="wb-image-button"
                        draggable
                        onDragStart={handleImageDragStart({
                          src: asset.src,
                          name: assetLabel(asset),
                          sourceId: asset.src,
                          fromTask: true,
                        })}
                        onClick={() => setImagePreview({ src: asset.src, alt: assetLabel(asset), caption: assetLabel(asset) })}
                        title="点击放大，拖到 AI 工作台可挂载参考图"
                      >
                        <img src={asset.src} alt={assetLabel(asset)} draggable={false} />
                        <span className="wb-image-action"><MagnifyingGlassPlus weight="bold" /><span>放大</span></span>
                      </button>
                      <figcaption>{assetLabel(asset)}</figcaption>
                    </figure>
                  ))}
                </figure>
              </div>
            )}

            {task.source && (
              <div className="wb-task-card wb-source-card">
                <div className="agent-section-heading">
                  <ListChecks weight="fill" />
                  <span>原始素材</span>
                </div>
                <div className="material-doc-row">
                  <span className="material-doc-icon" aria-hidden="true">
                    <FileDoc size={22} weight="duotone" />
                  </span>
                  <span className="material-doc-meta">
                    <strong>任务素材文档</strong>
                    <small>Word 文档 · 内含本任务所需的全部原始材料</small>
                  </span>
                  <button
                    type="button"
                    className="material-doc-download"
                    onClick={() => downloadTaskMaterialDocx(task)}
                    aria-label="下载素材 Word 文档"
                    title="下载 Word 文档"
                  >
                    <Download size={17} weight="bold" /> 下载 .docx
                  </button>
                </div>
                <button
                  className="source-toggle"
                  type="button"
                  onClick={() => setShowMaterial((value) => !value)}
                >
                  {showMaterial ? "收起原始素材" : "在页面中预览素材"}
                </button>
                {showMaterial && (
                  <div className="source-copy wb-material">
                    <MarkdownLite text={task.source} />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* AI 工作台视图：Codex / 豆包式 AI 对话工作台 */}
        <section
          id="practical-agent-panel"
          className={`agent-canvas wb-canvas wb-chat-panel${workbenchView === "agent" ? "" : " is-hidden"}`}
          aria-live="polite"
          aria-label="AI 对话工作区域"
          aria-hidden={workbenchView !== "agent"}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleImageDrop}
        >
          {/* 对话窗口顶部 Agent 状态栏 */}
          <header className="wb-chat-header">
            <div className="wb-chat-agent-info">
              <div className="wb-agent-avatar">
                <Sparkle weight="fill" />
              </div>
              <div className="wb-agent-titles">
                <strong>AI 伴学 Agent</strong>
                <span className="wb-agent-status-tag">
                  <span className={`wb-status-dot${running ? " is-pulsing" : ""}`} />
                  {running ? "正在执行任务…" : "在线就绪 · 支持多轮调整"}
                </span>
              </div>
            </div>
          </header>

          {/* 对话消息流（中间自适应滚动） */}
          <div
            className="wb-thread"
            ref={threadRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              threadFollowRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
            }}
          >

            {generations.length === 0 && !running && (
              <div className="agent-empty wb-chat-welcome">
                <h3>实操对话工作台已就绪</h3>
                <p>请对照任务说明与交付标准，在下方输入提示词驱动我完成交付。</p>
                <div className="wb-welcome-tips">
                  <span>💡 支持直接截图粘贴或上传图片</span>
                  <span>⚡️ 快捷键 ⌘+Enter 快速运行</span>
                  <span>🔄 生成后可多轮对话精细调整</span>
                </div>
              </div>
            )}
            {generations.map((generation, index) => (
              <div className="wb-turn" key={`turn-${index}`}>
                <div className="wb-turn-line wb-turn-user">
                  <span className="wb-turn-who">我</span>
                  <p className="wb-turn-prompt">{generation.prompt}</p>
                </div>
                <div className="wb-turn-line wb-turn-agent">
                  <span className="wb-turn-who">Agent</span>
                  {generation.reasoning && (
                    <details className="wb-thinking is-record">
                      <summary>
                        <Brain weight="fill" />
                        <span>思考过程</span>
                      </summary>
                      <div className="wb-thinking-body">
                        <MarkdownLite text={generation.reasoning} />
                      </div>
                    </details>
                  )}
                  {generation.imageUrl ? (
                    <figure className="wb-image-wrap">
                      <button
                        type="button"
                        className="wb-image-button wb-generated-image-button"
                        draggable
                        onDragStart={handleImageDragStart({
                          src: generation.imageUrl,
                          name: `第 ${index + 1} 轮生成结果`,
                          sourceId: generation.imageUrl,
                          offline: Boolean(generation.offline),
                        })}
                        onClick={() => setImagePreview({
                          src: generation.imageUrl,
                          alt: `第 ${index + 1} 轮生成结果`,
                          caption: `第 ${index + 1} 轮生成结果`,
                        })}
                        title="点击放大，拖到 AI 工作台可挂载参考图"
                      >
                        <img className="agent-image wb-image" src={generation.imageUrl} alt={`第 ${index + 1} 轮生成结果`} draggable={false} />
                        <span className="wb-image-action"><MagnifyingGlassPlus weight="bold" /><span>放大</span></span>
                      </button>
                      {generation.offline && <figcaption>离线演示图</figcaption>}
                    </figure>
                  ) : (
                    <div className="agent-output wb-output"><MarkdownLite text={generation.output ?? ""} /></div>
                  )}
                </div>
              </div>
            ))}
            {running && (
              <div className="wb-turn">
                <div className="wb-turn-line wb-turn-user">
                  <span className="wb-turn-who">我</span>
                  <p className="wb-turn-prompt">{livePrompt}</p>
                </div>
                <div className="wb-turn-line wb-turn-agent">
                  <span className="wb-turn-who">Agent</span>
                  {liveThinking && (
                    <details
                      className={`wb-thinking${liveOutput ? " is-complete" : " is-live"}`}
                      open={!liveOutput}
                    >
                      <summary className="wb-thinking-head">
                        <Brain weight="fill" />
                        <span>{liveOutput ? "思考完成" : "正在思考…"}</span>
                        {!liveOutput && <CircleNotch className="reply-spinner" weight="bold" />}
                      </summary>
                      <div
                        ref={liveThinkingBodyRef}
                        className="wb-thinking-body"
                        onScroll={(event) => {
                          const node = event.currentTarget;
                          thinkingFollowRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
                        }}
                      >
                        <MarkdownLite text={liveThinking} />
                      </div>
                    </details>
                  )}
                  {liveOutput ? (
                    <div className="agent-output wb-output is-streaming"><MarkdownLite text={liveOutput} /></div>
                  ) : !liveThinking ? (
                    <div className="agent-empty wb-turn-pending">
                      <CircleNotch className="reply-spinner" weight="bold" />
                      <span>{isImageTask ? "正在根据提示词生成主视觉…" : "正在整理材料并生成产出…"}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {dragOverComposer && <div className="wb-drag-overlay">松开图片，挂载为参考图</div>}

          {/* 底部输入与操作区：直接集成在右侧对话窗口底部 */}
          <div className="workbench-actions wb-chat-bottom">
            {task.source && (
              <div className="wb-material-doc-chip">
                <span className="material-doc-icon" aria-hidden="true">
                  <FileDoc size={20} weight="duotone" />
                </span>
                <span className="material-doc-meta">
                  <strong>任务素材 · Word 文档</strong>
                  <small>原始材料已随附（Agent 已读取）</small>
                </span>
                <button
                  type="button"
                  className="material-doc-mini is-primary"
                  onClick={() => downloadTaskMaterialDocx(task)}
                  aria-label="下载素材 Word 文档"
                >
                  下载
                </button>
              </div>
            )}
            {error && <p className="agent-error" role="alert">{error}</p>}

            {uploads.length > 0 && (
              <div className="wb-uploads" aria-label="已上传的参考图">
                {uploads.map((item, index) => (
                  <figure
                    className={`wb-upload${item.fromTask ? " is-task-asset" : ""}`}
                    key={`${item.name}-${index}`}
                    title={item.fromTask ? `任务素材：${item.name}` : `我上传的：${item.name}`}
                    draggable
                    onDragStart={handleImageDragStart({
                      src: item.src,
                      name: item.name,
                      sourceId: item.sourceId,
                      fromTask: Boolean(item.fromTask),
                    })}
                  >
                    <button
                      type="button"
                      className="wb-upload-preview"
                      onClick={() => setImagePreview({
                        src: item.src,
                        alt: item.name,
                        caption: item.fromTask ? `任务素材：${item.name}` : `我上传的：${item.name}`,
                      })}
                      aria-label={`放大 ${item.name}`}
                    >
                      <img src={item.src} alt={item.name} draggable={false} />
                    </button>
                    <button
                      type="button"
                      className="wb-upload-remove"
                      aria-label={`移除 ${item.name}`}
                      disabled={running}
                      onClick={() => setUploads((current) => current.filter((_, i) => i !== index))}
                    >
                      <X weight="bold" size={12} />
                    </button>
                    {item.fromTask && <figcaption className="wb-upload-tag">任务素材</figcaption>}
                  </figure>
                ))}
                <span className="wb-uploads-note">Agent 会参考这些图 · 也可直接粘贴截图</span>
              </div>
            )}

            <label className="agent-composer wb-composer">
              <span className="sr-only">给 Agent 的提示词</span>
              <div className="wb-composer-main">
                <textarea
                  ref={autoResizeRef(120)}
                  disabled={running || (expired && generations.length > 0) || atGenerationCap}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={onEnterSubmit(run, { withMeta: true, when: () => !running })}
                  placeholder={
                    atGenerationCap
                      ? "已达迭代上限，可点击下方「交卷评分」"
                      : expired
                        ? "时间到——可继续提交已写好的要求，或点击下方「交卷评分」"
                        : generations.length
                          ? "继续提要求（如「第三段再短一点」「色调偏暖」），Agent 会在上一版基础上改…"
                          : isImageTask
                            ? "写下画面提示词（主体/场景/风格/构图/色彩），可粘贴参考图，⌘+Enter 生成…"
                            : "写下你的提示词（角色/任务/约束/格式），可粘贴图片，⌘+Enter 运行…"
                  }
                  rows={1}
                />
                <div className="wb-composer-toolbar">
                  <div className="wb-composer-tools">
                    <button
                      type="button"
                      className="wb-upload-trigger"
                      aria-label="上传参考图"
                      title="上传参考图（最多 4 张）"
                      disabled={running || uploads.length >= 4}
                      onClick={() => uploadInputRef.current?.click()}
                    >
                      <ImageSquare weight="bold" size={18} />
                      {uploads.length > 0 && <span className="wb-upload-count">{uploads.length}/4</span>}
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={handleUpload}
                    />
                    <span className="wb-composer-hint">⌘ + Enter 发送</span>
                  </div>
                  <button
                    type="button"
                    className="agent-send"
                    disabled={running || !draft.trim() || (expired && generations.length > 0) || atGenerationCap}
                    onClick={run}
                    aria-label={generations.length ? "继续迭代" : isImageTask ? "生成图片" : "运行 Agent"}
                  >
                    {running ? <CircleNotch className="reply-spinner" weight="bold" /> : <PaperPlaneTilt weight="fill" />}
                  </button>
                </div>
              </div>
            </label>

            {generations.length > 0 && (
              <div className="wb-complete-row">
                <span className="wb-hint">
                  {generations.length > 1
                    ? "已多轮迭代——会评估、会优化，正是高分信号"
                    : "可以继续提要求让 Agent 改，满意后再交卷"}
                </span>
                <TaskAction
                  disabled={finishing || running}
                  onClick={finish}
                  label={finishing ? "AI 评委评分中…" : "交卷评分"}
                  variant="comprehensive"
                />
              </div>
            )}
          </div>
        </section>
      </div>
      {imagePreview && <PracticalImageLightbox image={imagePreview} onClose={() => setImagePreview(null)} />}
    </div>
  );
}

/** 入场动画结束后摘掉 animation，避免残留 transform 改变后代 fixed 的定位基准。 */
