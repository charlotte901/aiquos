// AssessmentFlow 的共享构件：常量、纯助手、叶子展示组件与阶段级 hook。
// 2026-11 自 AssessmentFlow.jsx 机械拆出（纯移动，逻辑零改动）——三个阶段
// 组件与编排器共用这里的件；按需 import，不引入阶段间耦合。
import { ArrowRight, Check, ChatCircleDots, ListChecks, Target, Timer, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DIMENSIONS as SCORING_DIMENSIONS } from "../../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { scopedKey } from "../account-scope.js";
import { ASSESSMENT_THEMES, PHASE_MODE_NAMES } from "../assessment-flow";
import { COMPREHENSIVE_PHASES, formatClock } from "../assessment-timing";
import {  } from "../interviewer";
import { useStageConfetti } from "../use-stage-confetti";

export const GUIDES = "/assets/crops/assessment-guides-crop.png";

export const IMAGE_DRAG_TYPE = "application/x-aiquos-image";

/**
 * 任务素材里，哪些是**学员该看到的输入**。
 *
 * 题库的 assets 有两种角色：
 *   reference / source / secondary —— 完成任务的输入材料（原图、风格参考）
 *   product                       —— 标准答案的产出范例（如「扩图结果范例」）
 *
 * product 是评分对标用的，绝不能给学员看：那等于把答案摊开，照着抄即可。
 * 之前两处渲染都无差别遍历所有 assets，把范例图与参考图并排显示了出来。
 */

export function inputAssets(task) {
  const list = Array.isArray(task?.assets) ? task.assets : [];
  return list.filter((asset) => asset && asset.src && asset.role !== "product");
}

export function productAssets(task) {
  const list = Array.isArray(task?.assets) ? task.assets : [];
  return list.filter((asset) => asset && asset.src && asset.role === "product");
}

/** 素材的图注与无障碍名称（label 优先，其次按角色推断）。 */

export function assetLabel(asset) {
  if (asset?.label) return asset.label;
  if (asset?.note) return asset.note;
  if (asset?.role === "reference") return "参考图";
  if (asset?.role === "source") return "待处理原图";
  if (asset?.role === "secondary") return "补充素材";
  return "任务素材图";
}

// 对话线程不做本地存档。
//
// 之前每次进入都会恢复上一次的对话线程，并补一句「我们接着刚才的聊——继续吧。」
// ——学员一进来面对的是满屏历史气泡，而且反复进入会不断追加这句衔接语，同一
// 句话叠出七八条（实测截图就是这样）。现在每次进入都是全新采访：开场两句，
// 然后直接进入第一题。
//
// 代价是中途刷新会重来，这是刻意的：面试类对话本身是一次完整的 5 分钟过程，
// 刷新后续上一段断裂的历史，比重新开始更让人困惑。
// 注意：不能在此处固化账号域键（模块加载时求值会把后缀冻结成当时的账号）。
// 使用点每次现取：scopedKey("aiquos.interview-thread.v1")。

/** 清掉历史版本可能留下的存档，避免旧数据在新逻辑下被误读。 */

export function clearInterviewState() {
  try {
    localStorage.removeItem(scopedKey("aiquos.interview-thread.v1"));
  } catch {
    /* 存储不可用时无从清理 */
  }
}

export const DIMENSION_KEYS = SCORING_DIMENSIONS.map((dimension) => dimension.key);
// 迭代轮次上限。豆包式的连续迭代本来就是"改到满意为止"，3 次太少
// （「结构对了再抠标题」这类局部微调很快用完）；但也要有上限，
// 否则一次实操会长到无法收尾。8 轮 + 5 分钟计时共同约束节奏。

export const MAX_GENERATIONS = 8;

// 双轨采样温度：聊天轨要活（措辞多变、口癖、接话自然），打分轨要稳
// （同一段回答两次评分不该抖动）。worker 端会按请求钳制到 0–2。
//
// 打分温度取 0：由 30 份对话 × 10 个温度点的实测（每点 5–10 次重复）确定。
// 非思考模式下温度真实生效，T=0 的 ICC=0.998、完全一致率 73%、MDC95=1.39 分；
// 温度升到 1.0 时 ICC 掉到 0.953、一致率 3%、MDC95 涨到 6.21 分。
// 0–0.08 是平台区（ICC ≥ 0.9965），超过 0.1 明显恶化。

export const CHAT_TEMPERATURE = 0.85;

export const GRADING_TEMPERATURE = 0;

/**
 * 打分轨必须**关闭思考模式**。
 *
 * 官方文档：「Thinking mode does not support the temperature ... setting
 * these parameters will not trigger an error but will also have no effect.」
 * 即思考模式下温度被静默忽略 —— 不关的话，上面设的 GRADING_TEMPERATURE
 * 完全不起作用，打分退回服务端默认随机性。
 */

export const GRADING_OPTIONS = { temperature: GRADING_TEMPERATURE, thinking: { type: "disabled" } };

async function chatOnce({ messages, temperature, thinking }) {
  // 断链自愈：连接被中途掐断（AbortError，dev 长链路偶发实测）时静默补一发；
  // 服务端明确返回的业务错误（4xx/5xx 已转 Error）不重试，浪费且无意义。
  const request = async () => {
    const response = await fetch("/api/deepseek/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages,
        stream: false,
        ...(temperature != null ? { temperature } : {}),
        ...(thinking ? { thinking } : {}),
      }),
      // 等待预算：单次尝试最多 20 秒（用户约定），超时按可重试错误处理。
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      const error = new Error(detail?.error || "AI 服务暂时不可用。");
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (typeof payload.message !== "string") throw new Error("AI 服务未返回内容。");
    return payload.message;
  };
  try {
    return await request();
  } catch (error) {
    // 可重试：断链/超时/网络 + 服务端瞬时（5xx/429——上游限流与抖动）。
    // 4xx 业务错误确定性失败，重试无意义。
    const transient = error?.name === "AbortError"
      || error?.name === "TimeoutError"
      || error?.name === "TypeError"
      || error?.status === 429
      || (typeof error?.status === "number" && error.status >= 500);
    if (!transient) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return request();
  }
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length) % list.length];
}

export function PracticalImageLightbox({ image, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={image.caption || "图片预览"}>
      <button className="image-lightbox-backdrop" type="button" aria-label="关闭图片预览" onClick={onClose} />
      <figure className="image-lightbox-card">
        <button className="image-lightbox-close" type="button" aria-label="关闭图片预览" onClick={onClose}>
          <X weight="bold" />
        </button>
        <img className="image-lightbox-media" src={image.src} alt={image.alt || image.caption || "图片预览"} draggable={false} />
        {image.caption && <figcaption>{image.caption}</figcaption>}
      </figure>
    </div>,
    document.body,
  );
}

/**
 * 把任务自带的参考图读成 data URI，供评分时与产物比对。
 *
 * 为什么需要：判「原图保真」这类维度必须同时看到原图与产物。
 * 早期只把产物发给评委，评委无从知道原图长什么样，
 * 只能凭"产物本身好看"给分 —— 这类维度因而恒为满分。
 *
 * 失败时返回空串（该张跳过），不影响评分主流程。
 */
async function referenceDataUri(src) {
  if (typeof src !== "string" || !src) return "";
  if (src.startsWith("data:image/")) return src;
  try {
    const response = await fetch(src);
    if (!response.ok) return "";
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return "";
    // 压到长边 768px：评委只需看清构图与色调，原图直传会让请求体过大
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return "";
  }
}

/** 题库的标准产物范例（role=product）：评分时的对照基准，不是学员输入。 */

export function Progress({ current, complete, onPick, disabled = false, total = 5 }) {
  // 关卡号来自 URL 路由，可能是越界值（例如手改地址栏成 level/2 而该测评只有 1 关），
  // 直接渲染会显示「2 / 1」这种分子大于分母的进度。这里钳到 [1, total]。
  const active = Math.min(Math.max(1, current), total);
  return (
    <div className="level-progress" aria-label={`第 ${active} 关，共 ${total} 关`}>
      <div className="level-nodes">
        {Array.from({ length: total }, (_, index) => index + 1).map((number) => {
          const state = number < active ? "complete" : number === active ? "active" : "locked";
          return (
            <button
              key={number}
              type="button"
              className={`level-node is-${state}`}
              disabled={disabled || number > complete}
              aria-label={`第 ${number} 关${number <= complete ? "，可进入" : "，尚未解锁"}`}
              onClick={() => onPick?.(number)}
            >
              {state === "complete" ? <Check weight="bold" /> : number}
            </button>
          );
        })}
      </div>
      <span>{active} / {total}</span>
    </div>
  );
}

export function Guides() {
  const canvas = useRef(null);
  useEffect(() => {
    const image = new Image();
    image.src = GUIDES;
    image.onload = () => {
      const node = canvas.current;
      if (!node) return;
      node.width = image.naturalWidth;
      node.height = image.naturalHeight;
      const context = node.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, node.width, node.height);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, node.width, node.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        // The supplied guide render has a green matte. Preserve the white
        // strokes while keying out only pixels dominated by that matte.
        if (green > 108 && green > red * 1.35 && green > blue * 1.35)
          pixels.data[index + 3] = 0;
      }
      context.putImageData(pixels, 0, 0);
    };
  }, []);
  return <canvas ref={canvas} className="assessment-guides" width="900" height="620" role="img" aria-label="两位测评向导" />;
}

export function PhaseTimer({ remainingMs, className = "" }) {
  const low = remainingMs <= 60_000;
  const critical = remainingMs <= 15_000;
  return (
    <span className={`phase-timer${low ? " is-low" : ""}${critical ? " is-critical" : ""} ${className}`.trim()}>
      <Timer weight="fill" />
      剩余 {formatClock(remainingMs)}
    </span>
  );
}

export function TaskHeader({ id, stage, mode }) {
  const theme = ASSESSMENT_THEMES[id];
  const phase = id === "comprehensive" ? COMPREHENSIVE_PHASES[stage - 1] : null;
  const icons = { objective: Target, conversation: ChatCircleDots, practical: ListChecks };
  const Icon = icons[mode] ?? ListChecks;
  const name = phase ? PHASE_MODE_NAMES[phase.mode] : { objective: "客观题", conversation: "对话面询", practical: "Agent 实操" }[mode];
  return <div className="task-heading"><Icon weight="fill" /><span>{phase ? `${phase.label} · 约 5 分钟` : `${theme.title}`}</span><strong>{name}</strong></div>;
}

export function TaskAction({ disabled, onClick, label, variant = "" }) {
  return <button type="button" className={`task-action ${variant}`.trim()} disabled={disabled} onClick={onClick}>{label}<ArrowRight weight="bold" /></button>;
}

/** 数字滚动：让"答了 N 题"这件事有到达感，而不是静态数字。 */

export function CountUp({ value, duration = 720 }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    // easeOutExpo：起手快、落点稳，适合"计数到某一值"这种收束型动画。
    const ease = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      setShown(Math.round(value * ease(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{shown}</>;
}

/**
 * 关卡完成页。
 *
 * 讲三件事：这一关走完了（环形勾 + 计数 + 彩带）、刚刚采到什么（六维覆盖）、
 * 下一步去哪（下一关名字写在按钮左边）。
 *
 * 不报正确率与答对数——这是阶段性小结，提前摊开成绩会让学员据此推断最终
 * 结果（本项目"进行中不给分"的一贯做法），总分与等级留到觉醒报告。
 */

export function StageComplete({
  stage,
  answered,
  coveredCount,
  dimCounts,
  seconds,
  remainingMs,
  stopReason,
  thisLevel,
  nextLevel,
  isFinalStage,
  onContinue,
}) {
  // 完成标记固定用绿，不跟随关卡主题色：「完成」是全局语义，用关卡色会让
  // 每一关的完成页看起来像不同状态。彩带同色系，与环形勾一致。
  useStageConfetti(true, "#34c759");
  return (
    <div className="task-body objective-task comprehensive-task" data-phase="summary">
      <div className="stage-complete">
        <div className="stage-complete-badge">
          <svg viewBox="0 0 120 120" className="stage-complete-ring" aria-hidden="true">
            <circle className="ring-track" cx="60" cy="60" r="52" />
            <circle className="ring-fill" cx="60" cy="60" r="52" />
          </svg>
          <div className="stage-complete-figure">
            <span className="stage-complete-check" aria-hidden="true"><Check size={26} weight="bold" /></span>
            <b><CountUp value={answered} /></b>
            <i>题</i>
          </div>
        </div>

        <div className="stage-complete-copy">
          <p className="stage-complete-kicker">第 {stage} 关 · {thisLevel.short}</p>
          <h2>本关已完成</h2>
          <p className="stage-complete-lead">
            {STOP_REASON_TEXT[stopReason] ?? "本阶段作答完成"}。
            {isFinalStage ? "五关全部走完，成绩单已经准备好了。" : `接下来进入第 ${stage + 1} 关。`}
          </p>
        </div>

        <section className="stage-complete-dims" aria-label="本关维度覆盖">
          <p className="stage-complete-section">本关覆盖的维度</p>
          <ul>
            {SCORING_DIMENSIONS.map((dimension, index) => {
              const count = dimCounts[dimension.key] ?? 0;
              return (
                <li
                  key={dimension.key}
                  className={count > 0 ? "is-covered" : "is-open"}
                  style={{ "--i": index }}
                >
                  <span>{dimension.short}</span>
                  <b>{count > 0 ? `${count} 题` : "待补"}</b>
                </li>
              );
            })}
          </ul>
        </section>

        <dl className="stage-complete-stats">
          <div>
            <dt>本关用时</dt>
            <dd>{formatClock(seconds * 1000 - remainingMs)}</dd>
          </div>
          <div>
            <dt>覆盖维度</dt>
            <dd>{coveredCount} / {SCORING_DIMENSIONS.length}</dd>
          </div>
          <div>
            <dt>题目难度</dt>
            <dd>随表现实时调整</dd>
          </div>
        </dl>

        <footer className="stage-complete-next">
          <div className="stage-complete-next-copy">
            <span>{isFinalStage ? "全部关卡完成" : "下一关"}</span>
            <strong>
              {isFinalStage ? "查看智核觉醒报告" : `${nextLevel?.name ?? ""} · ${nextLevel?.guardian ?? ""}`}
            </strong>
          </div>
          <button type="button" className="duo-key is-green" onClick={onContinue}>
            {isFinalStage ? "查看报告" : "完成本关"}
            <ArrowRight weight="bold" />
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── 对话式测评：拟人化采访 ────────────────────────────────────────────────
// 采访者「苏记者」按题梯提问，回复经投递引擎分段连发、模拟打字节奏；
// 每轮回答由 LLM 按评分标准打分（离线时降级为启发式），低分追问一次。
// 分数由 src/interview-scoring-model.js 折算成六维能力分（60–100），
// 通过 onInterviewScore 上抛；对话通道不再向客观题的 IRT 模型塞证据。

export const STOP_REASON_TEXT = {
  time: "时间到",
  precision: "能力估计已收敛（标准误达标），提前完成",
  cap: "已达到单场题量上限",
  exhausted: "本轮可用题目已用尽",
};

export function useStorySequencer({ hasStory, story, phase, onCompletePhase }) {
  const [lineIndex, setLineIndex] = useState(0);
  const storyPhase = hasStory ? phase : "quiz";
  const lines = storyPhase === "ending" ? story?.ending ?? [] : storyPhase === "opening" ? story?.opening ?? [] : [];
  // Opening and ending have different line counts; entering a new story act
  // must restart at its first line or lines[lineIndex] goes out of bounds and
  useEffect(() => {
    setLineIndex(0);
  }, [storyPhase]);
  const advanceStory = () => {
    if (lineIndex < lines.length - 1) {
      setLineIndex((current) => current + 1);
      return;
    }
    if (storyPhase === "opening") {
      onCompletePhase("quiz");
      return;
    }
    onCompletePhase("done");
  };
  return { storyPhase, lines, lineIndex, advanceStory, skipStory: () => setLineIndex(Math.max(0, lines.length - 1)) };
}

export function useSettledAfterAnimation() {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 620);
    return () => window.clearTimeout(timer);
  }, []);
  return settled;
}
