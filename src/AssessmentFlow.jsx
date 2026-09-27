import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChatCircleDots,
  ClipboardText,
  CircleNotch,
  ImageSquare,
  ListChecks,
  PaperPlaneTilt,
  Sparkle,
  Target,
  Timer,
  X,
} from "@phosphor-icons/react";
import { TestWordmark } from "./TestWordmark";
import {
  COMPREHENSIVE_LEVELS,
  COMPREHENSIVE_TYPE_LABELS,
  getComprehensiveLevel,
  getReaction,
  judgeComprehensiveAnswer,
} from "./comprehensive-quiz";
import {
  ASSESSMENT_THEMES,
  PHASE_MODE_NAMES,
  PHASE_STORIES,
  STAGE_LABELS,
  getStageMode,
} from "./assessment-flow";
import {
  COMPREHENSIVE_PHASES,
  PHASE_SECONDS,
  formatClock,
  phaseCount,
  usePhaseClock,
} from "./assessment-timing";
import { abilityStandardError, shouldStopCat } from "./comprehensive-adaptive";
import { answerCredit } from "./assessment-attempt";
import { readEdition } from "./bank-editions";
import { generateArkImage, streamDeepSeek } from "./deepseek";
import {
  INTERVIEW_LADDER,
  INTERVIEWER,
  interviewChatMessages,
  interviewClosing,
  interviewOpening,
  interviewScoreMessages,
  parseInterviewerJson,
  planDelivery,
} from "./interviewer";
import { heuristicSlotCredit } from "./interview-scoring";
import { scoreInterview } from "./interview-scoring-model";
import { parseScoreJson } from "./interview-score-parse";
import { onEnterSubmit } from "./ime";
import { MarkdownLite } from "./markdown-lite";
import { deliveryRequirements, scoringSchemeRows } from "./practical-scoring";
import { Task3DCharacter } from "./Task3DCharacter";
import { CharacterTuner } from "./character-tuner";
import TUNING_DEFAULTS from "./character-tuning.json";
import { useStageConfetti } from "./use-stage-confetti";
import { DIMENSIONS as SCORING_DIMENSIONS } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const GUIDES = "/assets/crops/assessment-guides-crop.png";

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
function inputAssets(task) {
  const list = Array.isArray(task?.assets) ? task.assets : [];
  return list.filter((asset) => asset && asset.src && asset.role !== "product");
}

/** 素材的图注与无障碍名称（label 优先，其次按角色推断）。 */
function assetLabel(asset) {
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
const INTERVIEW_KEY = "aiquos.interview-thread.v1";

/** 清掉历史版本可能留下的存档，避免旧数据在新逻辑下被误读。 */
function clearInterviewState() {
  try {
    localStorage.removeItem(INTERVIEW_KEY);
  } catch {
    /* 存储不可用时无从清理 */
  }
}
const DIMENSION_KEYS = SCORING_DIMENSIONS.map((dimension) => dimension.key);
const MAX_GENERATIONS = 3;

// 双轨采样温度：聊天轨要活（措辞多变、口癖、接话自然），打分轨要稳
// （同一段回答两次评分不该抖动）。worker 端会按请求钳制到 0–2。
//
// 打分温度取 0：由 30 份对话 × 10 个温度点的实测（每点 5–10 次重复）确定。
// 非思考模式下温度真实生效，T=0 的 ICC=0.998、完全一致率 73%、MDC95=1.39 分；
// 温度升到 1.0 时 ICC 掉到 0.953、一致率 3%、MDC95 涨到 6.21 分。
// 0–0.08 是平台区（ICC ≥ 0.9965），超过 0.1 明显恶化。
const CHAT_TEMPERATURE = 0.85;
const GRADING_TEMPERATURE = 0;

/**
 * 打分轨必须**关闭思考模式**。
 *
 * 官方文档：「Thinking mode does not support the temperature ... setting
 * these parameters will not trigger an error but will also have no effect.」
 * 即思考模式下温度被静默忽略 —— 不关的话，上面设的 GRADING_TEMPERATURE
 * 完全不起作用，打分退回服务端默认随机性。
 */
const GRADING_OPTIONS = { temperature: GRADING_TEMPERATURE, thinking: { type: "disabled" } };

async function chatOnce({ messages, temperature, thinking }) {
  const response = await fetch("/api/deepseek/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages,
      stream: false,
      ...(temperature != null ? { temperature } : {}),
      ...(thinking ? { thinking } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error || "AI 服务暂时不可用。");
  }
  const payload = await response.json();
  if (typeof payload.message !== "string") throw new Error("AI 服务未返回内容。");
  return payload.message;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length) % list.length];
}

function Progress({ current, complete, onPick, disabled = false, total = 5 }) {
  return (
    <div className="level-progress" aria-label={`第 ${current} 关，共 ${total} 关`}>
      <div className="level-nodes">
        {Array.from({ length: total }, (_, index) => index + 1).map((number) => {
          const state = number < current ? "complete" : number === current ? "active" : "locked";
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
      <span>{current} / {total}</span>
    </div>
  );
}

function Guides() {
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

function PhaseTimer({ remainingMs, className = "" }) {
  const low = remainingMs <= 60_000;
  const critical = remainingMs <= 15_000;
  return (
    <span className={`phase-timer${low ? " is-low" : ""}${critical ? " is-critical" : ""} ${className}`.trim()}>
      <Timer weight="fill" />
      剩余 {formatClock(remainingMs)}
    </span>
  );
}

export function AssessmentMap({ id, current, complete, onBack, onOpenStage, busy, resume = null }) {
  const theme = ASSESSMENT_THEMES[id];
  const total = phaseCount(id);
  const stageLabels = id === "comprehensive"
    ? COMPREHENSIVE_PHASES.map((phase) => phase.label)
    : STAGE_LABELS;
  const resumeStarted = resume?.startedAt
    ? new Date(resume.startedAt)
    : null;
  const resumeLabel = resumeStarted && !Number.isNaN(resumeStarted.getTime())
    ? `${resumeStarted.getMonth() + 1}月${resumeStarted.getDate()}日 ${String(resumeStarted.getHours()).padStart(2, "0")}:${String(resumeStarted.getMinutes()).padStart(2, "0")}`
    : "";
  return (
    <main className="assessment-flow map-flow" style={{ "--assessment-color": theme.color, "--assessment-soft": theme.soft, "--assessment-glow": theme.glow, "--assessment-deep": theme.deep }}>
      <button className="flow-back" type="button" onClick={onBack} disabled={busy}>
        <ArrowLeft weight="bold" /> 返回测评选择
      </button>
      <h1 className="flow-wordmark" aria-label="TEST! 闯关地图"><TestWordmark /></h1>
      <Progress current={current} complete={complete} onPick={onOpenStage} disabled={busy} total={total} />
      <section className="level-map" aria-label={`${theme.title}关卡地图`}>
        <p className="map-kicker">{theme.title}</p>
        <h2>从这一关开始</h2>
        <p>{theme.description}</p>
        {resume && (
          <div className="map-resume" role="status">
            <div>
              <strong>检测到未完成的综合测评</strong>
              <p>
                {/* 进度用"当前阶段 + 已答轮次"表述：只说"已完成 0 个阶段"会让
                    刚答了几轮的学员以为记录丢失。 */}
                {resume.phasesDone > 0
                  ? `已完成 ${resume.phasesDone} / ${total} 个阶段`
                  : `正在第 ${resume.currentStage} 关（${resume.currentStageLabel}）`}
                {resume.answered > 0 ? `，已作答 ${resume.answered} 轮` : ""}
                {resumeLabel ? ` · 开始于 ${resumeLabel}` : ""}，记录保存在本机，可随时继续。
              </p>
            </div>
            <div className="map-resume-actions">
              <button type="button" onClick={() => onOpenStage?.(current)}>继续测评</button>
              <button type="button" className="is-ghost" onClick={resume.onRestart}>重新开始</button>
            </div>
          </div>
        )}
        <div className="map-path" role="list" aria-label={`${total} 个闯关节点`}>
          {Array.from({ length: total }, (_, index) => index + 1).map((number) => {
            const state = number < current ? "complete" : number === current ? "active" : "locked";
            return (
              <button
                key={number}
                type="button"
                className={`map-stage is-${state}`}
                disabled={busy || number > complete}
                onClick={() => onOpenStage(number)}
                aria-label={`第 ${number} 关：${stageLabels[number - 1]}`}
              >
                <span className="map-stage-number">{state === "complete" ? <Check weight="bold" /> : number}</span>
                <span>{stageLabels[number - 1]}</span>
              </button>
            );
          })}
        </div>
        <Guides />
      </section>
    </main>
  );
}

function TaskHeader({ id, stage, mode }) {
  const theme = ASSESSMENT_THEMES[id];
  const phase = id === "comprehensive" ? COMPREHENSIVE_PHASES[stage - 1] : null;
  const icons = { objective: Target, conversation: ChatCircleDots, practical: ListChecks };
  const Icon = icons[mode] ?? ListChecks;
  const name = phase ? PHASE_MODE_NAMES[phase.mode] : { objective: "客观题", conversation: "对话面询", practical: "Agent 实操" }[mode];
  return <div className="task-heading"><Icon weight="fill" /><span>{phase ? `${phase.label} · 约 5 分钟` : `${theme.title}`}</span><strong>{name}</strong></div>;
}

function getStorySpeaker(guardian, who) {
  return who === "guardian" ? guardian : who === "xiao" ? "AI 导师 · 小源" : "你";
}

function TaskStoryDialogue({ guardian, phase, lines, lineIndex, onAdvance, onSkip }) {
  if (!lines || lines.length === 0) return null;
  const line = lines[Math.min(lineIndex, lines.length - 1)];
  return (
    <div
      className="comprehensive-dialogue-screen"
      role="button"
      tabIndex={0}
      aria-label={phase === "opening" ? "继续下一句对话" : "继续结尾对话"}
      onClick={onAdvance}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onAdvance();
        }
      }}
    >
      <div className="story-line">
        <div className="story-eyebrow">
          <span>{getStorySpeaker(guardian, line.who)}</span>
          <strong>{lineIndex + 1} / {lines.length}</strong>
        </div>
        <p>{line.text}</p>
        <span className="story-hint">
          {phase === "ending" && lineIndex === lines.length - 1 ? "点击完成本关 ▾" : "点击继续 ▾"}
        </span>
        {onSkip && lineIndex < lines.length - 1 && (
          <button
            type="button"
            className="story-skip"
            onClick={(event) => {
              event.stopPropagation();
              onSkip();
            }}
          >
            跳过对话
          </button>
        )}
      </div>
    </div>
  );
}

function useStorySequencer({ hasStory, story, phase, onCompletePhase }) {
  const [lineIndex, setLineIndex] = useState(0);
  const storyPhase = hasStory ? phase : "quiz";
  const lines = storyPhase === "ending" ? story?.ending ?? [] : storyPhase === "opening" ? story?.opening ?? [] : [];
  // Opening and ending have different line counts; entering a new story act
  // must restart at its first line or lines[lineIndex] goes out of bounds and
  // the whole panel crashes (TaskStoryDialogue reads line.who).
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

function TaskAction({ disabled, onClick, label, variant = "" }) {
  return <button type="button" className={`task-action ${variant}`.trim()} disabled={disabled} onClick={onClick}>{label}<ArrowRight weight="bold" /></button>;
}

/** 数字滚动：让"答了 N 题"这件事有到达感，而不是静态数字。 */
function CountUp({ value, duration = 720 }) {
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
function StageComplete({
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
function InterviewPhase({
  hasStory,
  story,
  guardian,
  seconds = PHASE_SECONDS,
  onComplete,
  onCharacterFeedback,
  onInterviewScore = null,
}) {
  // 每次进入都是全新采访：不读存档、不恢复线程、不补衔接语。
  // 进组件时顺手清掉旧版本可能留下的存档。
  useEffect(() => { clearInterviewState(); }, []);
  const [phase, setPhase] = useState(hasStory ? "opening" : "starting");
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [slotIndex, setSlotIndex] = useState(0);
  const [followUsed, setFollowUsed] = useState(0);
  // 已答轮数从会话记录派生（user 消息条数），不另设计数器——
  // 两个来源会在恢复/清空时不一致。
  const derivedExchanges = thread.filter((item) => item.role === "user").length;
  const [exchangeCount, setExchangeCount] = useState(() => derivedExchanges);
  const [judging, setIsJudging] = useState(false);
  const [interviewerBusy, setInterviewerBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [credits, setCredits] = useState([]);
  const [summaryReady, setSummaryReady] = useState(false);
  const [error, setError] = useState("");
  const threadNode = useRef(null);
  const follow = useRef(true);
  const timersRef = useRef([]);
  // Set while a follow-up probe is in flight so the next answer re-judges the
  // same slot and can only raise the recorded credit.
  const followSlotRef = useRef(null);
  const slot = INTERVIEW_LADDER[Math.min(slotIndex, INTERVIEW_LADDER.length - 1)];
  const ladderDone = slotIndex >= INTERVIEW_LADDER.length;

  const { storyPhase, lines, lineIndex, advanceStory, skipStory } = useStorySequencer({
    hasStory,
    story,
    phase,
    onCompletePhase: (next) => {
      if (next === "quiz") setPhase("starting");
      else onComplete();
    },
  });

  const clock = usePhaseClock({
    seconds,
    running: phase === "quiz" || phase === "starting" || phase === "closing",
    onExpire: () => {
      if (phase === "quiz") beginClosing();
    },
  });

  // 兜底：任何原因导致投递中断时，输入框不能被永久锁住。
  useEffect(() => {
    if (!interviewerBusy) return undefined;
    const guard = window.setTimeout(() => setInterviewerBusy(false), 12000);
    return () => window.clearTimeout(guard);
  }, [interviewerBusy]);

  // 同样的兜底给 judging：send() 管道（模型调用 + 打字投递）若因任何原因
  // 悬挂（弱网、隐藏标签页定时器节流、上游挂起），「正在斟酌」不能永久
  // 占住输入框。25s 覆盖最慢的正常往返仍留有余量。
  useEffect(() => {
    if (!judging) return undefined;
    const guard = window.setTimeout(() => setIsJudging(false), 25000);
    return () => window.clearTimeout(guard);
  }, [judging]);

  useEffect(() => () => {
    timersRef.current.forEach((clear) => clear());
    timersRef.current = [];
  }, []);

  // 会话记录变化后同步已答轮数，确保小结里的数字与实际对话一致。
  useEffect(() => {
    setExchangeCount(derivedExchanges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedExchanges]);

  useEffect(() => {
    const node = threadNode.current;
    if (node && follow.current) node.scrollTop = node.scrollHeight;
  }, [thread]);

  useEffect(() => {
    onCharacterFeedback?.({
      phase: summaryReady ? "ending" : "quiz",
      // Interviews have no right/wrong answers; a graded result would render
      // a misleading 回答正确 celebration on the mentor stage.
      result: null,
      reaction: interviewerBusy
        ? "苏记者正在打字…"
        : judging
          ? "苏记者正在斟酌你的回答…"
          : summaryReady
            ? "采访结束，点击「完成本关」继续！"
            : "写下你的回答，苏记者会追问细节。",
      speakerName: guardian,
    });
  }, [interviewerBusy, judging, summaryReady, guardian, onCharacterFeedback]);

  function clearTimers() {
    timersRef.current.forEach((clear) => clear());
    timersRef.current = [];
  }

  // 逐字投递一段消息：气泡先以「正在输入」出现，再按人设速度逐字浮现。
  // 更新按气泡自身的 uid 定位而不是「数组最后一项」：打分轨、角色反馈等
  // 并发 setState 都可能往线程里追加条目，按位置更新会把打字内容写进
  // 别人的气泡（实测出现过开场白写进学员气泡的串台）。
  const bubbleSeqRef = useRef(0);
  function typeSegment(segment) {
    return new Promise((resolve) => {
      const uid = `b${(bubbleSeqRef.current += 1)}`;
      setThread((items) => [...items, { uid, role: "assistant", content: "", typing: true }]);
      const chars = [...segment.text];
      const budget = Math.min(segment.typingMs, 1500);
      const step = Math.max(2, Math.ceil(chars.length / Math.max(1, Math.round(budget / 45))));
      let index = 0;
      const interval = window.setInterval(() => {
        index = Math.min(chars.length, index + step);
        const slice = chars.slice(0, index).join("");
        setThread((items) => items.map((item) => (item.uid === uid ? { ...item, content: slice } : item)));
        if (index >= chars.length) {
          window.clearInterval(interval);
          setThread((items) => items.map((item) => (item.uid === uid ? { ...item, typing: false } : item)));
          resolve();
        }
      }, 45);
      timersRef.current.push(() => window.clearInterval(interval));
    });
  }

  async function speak(plan) {
    setInterviewerBusy(true);
    await new Promise((resolve) => {
      const timer = window.setTimeout(resolve, Math.min(plan.thinkMs ?? 800, 1000));
      timersRef.current.push(() => window.clearTimeout(timer));
    });
    for (const segment of plan.segments) {
      await typeSegment(segment);
      if (segment.gapMs > 0) {
        await new Promise((resolve) => {
          const timer = window.setTimeout(resolve, Math.min(segment.gapMs, 500));
          timersRef.current.push(() => window.clearTimeout(timer));
        });
      }
    }
    setInterviewerBusy(false);
  }

  // ── 双轨采访引擎 ────────────────────────────────────────────────────────
  // 聊天轨：学员等待的唯一调用。只生成苏记者的话（纯文本、高温度、拟人化
  // 提示词），不产出分数——分数逼着模型在同一口采样里既演又判，两头都
  // 不稳。追问是否触发改用本地启发式判定：瞬时、确定、免费。
  // 打分轨：fire-and-forget。回答投递完就后台低温度评一次该话题的问答
  // 对，回来后原位覆盖证据（appendExternalEvidence 同 id 是替换语义）。
  // 学员读题打字的几秒钟正好是打分窗口，全程无感。
  const transcriptRef = useRef([]); // {role, content} 逐轮存档，打分轨的数据源
  const lastQuestionRef = useRef(""); // 学员最近回答的那句提问，喂给打分轨
  const gradedRef = useRef(new Map()); // slotId -> 权威分（两次评分取高者）

  function appendTranscript(role, content) {
    transcriptRef.current = [...transcriptRef.current, { role, content }];
  }

  function recordCredit(slotObj, credit, evidence = "") {
    // 追问后再评不能把已记录的分拉低（与旧同步流程同一条规则）。
    const prev = gradedRef.current.get(slotObj.id);
    const best = prev == null ? credit : Math.max(prev, credit);
    gradedRef.current.set(slotObj.id, best);
    setCredits((items) => [...items.filter((item) => item.id !== slotObj.id), { id: slotObj.id, label: slotObj.id, credit: best, evidence }]);

    // 对话通道走自己的评分模型（src/interview-scoring-model.js），
    // 不再把档位分当作「外部证据」塞进客观题的 IRT 后验 —— 那条链路
    // 证据太少时会把维度分压到 60 分（见该模块顶部注释）。
    // 每次记录后重算六维，把最新画像上抛给报告层。
    const slotCredits = Object.fromEntries(
      [...gradedRef.current.entries()].map(([slotId, value]) => [slotId, value]),
    );
    const interview = scoreInterview(slotCredits);
    onInterviewScore?.({
      slotCredits,
      dimensions: interview.dimensions,
      overallScore: interview.overallScore,
      grade: interview.grade,
      completed: interview.completed,
      answeredSlots: interview.answeredSlots,
      totalSlots: interview.totalSlots,
      coveredDimensions: interview.coveredDimensions,
    });
  }

  async function requestInterviewer({ followUp = false, lastNote = "", threadOverride = null } = {}) {
    const currentSlot = INTERVIEW_LADDER[Math.min(slotIndex, INTERVIEW_LADDER.length - 1)];
    if (!ladderDone) {
      try {
        const raw = await chatOnce({
          messages: interviewChatMessages({
            thread: threadOverride ?? thread,
            slot: { ...currentSlot, index: slotIndex, intent: currentSlot.rubric },
            followUp,
            lastNote,
          }),
          temperature: CHAT_TEMPERATURE,
        });
        // 聊天轨要求纯文本，但模型偶尔仍会包一层 JSON——容错取 reply。
        const parsed = parseInterviewerJson(raw);
        const reply = parsed ? parsed.reply : String(raw ?? "").trim();
        // 空回复等同于失败：如果直接返回空串，speak() 会因为没有分段而
        // 静默什么都不说，学员看到的是"记者不答复了"。走兜底话术，
        // 保证每一轮提问都有下文。
        if (!reply) throw new Error("empty-reply");
        setOffline(false);
        return { reply, note: "" };
      } catch {
        setOffline(true);
        return { reply: pick(followUp ? currentSlot.followUps : currentSlot.asks), note: "" };
      }
    }
    return { reply: "", note: "" };
  }

  // 打分轨：不阻塞 UI、不设 loading、失败静默（启发式临时分已垫底）。
  //
  // 解析用 parseScoreJson 而不是 parseInterviewerJson：后者是聊天轨的解析器，
  // 要求返回对象含非空 reply，而打分轨只返回 {score, evidence, note} ——
  // 用错解析器会让每一次打分都判为 unparseable，recordCredit 永不触发，
  // 学员的对话分数就此消失（实测踩过）。
  function gradeAnswerInBackground({ slot: slotObj, userAnswer, priorAnswer = "" }) {
    const questionAsked = lastQuestionRef.current || slotObj.asks[0];
    chatOnce({
      messages: interviewScoreMessages({ slot: slotObj, questionAsked, userAnswer, priorAnswer }),
      ...GRADING_OPTIONS,
    })
      .then((raw) => {
        const parsed = parseScoreJson(raw);
        if (parsed) recordCredit(slotObj, parsed.score, parsed.evidence);
      })
      .catch(() => { /* 临时启发式分保留，不打扰学员 */ });
  }

  async function startInterview() {
    setPhase("quiz");
    // 开场就是第一题：interviewOpening() 的第二句已经在问第一槽的问题。
    const opening = interviewOpening().join("\n");
    appendTranscript("assistant", opening);
    await speak(planDelivery(opening));
    lastQuestionRef.current = opening;
  }

  useEffect(() => {
    if (phase !== "starting") return;
    // 只剩一条路径：完整开场（两句），然后第一题。续答分支已移除。
    startInterview();
    // The phase transition drives the whole scripted opening exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const send = async () => {
    if (phase !== "quiz" || judging || interviewerBusy || summaryReady) return;
    const content = draft.trim();
    if (!content) return;
    setThread((items) => [...items, { uid: `u${(bubbleSeqRef.current += 1)}`, role: "user", content }]);
    appendTranscript("user", content);
    setDraft("");
    setError("");
    setIsJudging(true);
    try {
      const currentSlot = INTERVIEW_LADDER[Math.min(slotIndex, INTERVIEW_LADDER.length - 1)];
      const probing = followSlotRef.current;
      // 本地启发式分（瞬时、确定）：驱动「是否追问」的流程决策，并先垫底
      // 记进证据；权威分由打分轨在后台低温度评出后原位覆盖。
      const provisional = heuristicSlotCredit(currentSlot.id, content);
      setCredits((items) => [
        ...items.filter((item) => item.id !== currentSlot.id),
        { id: currentSlot.id, label: currentSlot.id, credit: provisional, evidence: "" },
      ]);
      // 临时分不上抛：它只是流程决策用的本地估计，等打分轨给出权威分后
      // 由 recordCredit 统一折算六维并上报，避免报告页看到抖动的中间值。

      const nextCount = exchangeCount + 1;
      setExchangeCount(nextCount);
      const threadWithAnswer = [...thread, { role: "user", content }];
      const timeLeft = clock.remainingMs;
      // The last slot never probes: asking a student to elaborate after the
      // final question would require a sixth answer before the interview can
      // close, which reads as a stuck conversation.
      const isLastSlot = slotIndex + 1 >= INTERVIEW_LADDER.length;
      const wantsProbe = !isLastSlot && provisional < 0.55 && followUsed < 1 && timeLeft > 50_000;

      // 学员等待的唯一模型调用：下一问（或追问）的记者话术。
      // 兜底话术可能为空（题梯数据缺失），此时至少保住追问文案，避免整轮哑火。
      let asked;
      if (wantsProbe) {
        setFollowUsed((current) => current + 1);
        followSlotRef.current = { id: currentSlot.id, answer: content };
        asked = await requestInterviewer({ followUp: true, lastNote: "有点笼统", threadOverride: threadWithAnswer });
      } else {
        followSlotRef.current = null;
        setSlotIndex((current) => current + 1);
        setFollowUsed(0);
        if (isLastSlot) {
          await beginClosing(nextCount);
          gradeAnswerInBackground({ slot: currentSlot, userAnswer: content, priorAnswer: probing?.answer ?? "" });
          return;
        }
        asked = await requestInterviewer({ threadOverride: threadWithAnswer });
      }
      if (!String(asked?.reply ?? "").trim()) {
        asked = { reply: pick(currentSlot.asks) || currentSlot.rubric, note: "" };
      }
      await speak(planDelivery(asked.reply));
      appendTranscript("assistant", asked.reply);
      lastQuestionRef.current = asked.reply;
      // 聊天已交付，打分轨启动：学员读题、打字的几秒钟就是评分窗口，
      // 全程无 loading、无感知，回来后原位覆盖临时分。
      gradeAnswerInBackground({ slot: currentSlot, userAnswer: content, priorAnswer: probing?.answer ?? "" });
    } catch (requestError) {
      setError(requestError.message || "发送失败，请重试。");
    } finally {
      setIsJudging(false);
    }
  };

  async function beginClosing(count = exchangeCount) {
    if (phase === "closing" || summaryReady) return;
    setPhase("closing");
    await speak(planDelivery(interviewClosing(count).join("\n")));
    setSummaryReady(true);
  }

  const finishSummary = () => {
    // 本关交卷后清掉对话存档，下一次进入是全新采访。
    clearInterviewState();
    if (hasStory) {
      setPhase("ending");
      return;
    }
    onComplete();
  };

  if (storyPhase === "opening" || storyPhase === "ending") {
    return (
      <div className="task-body conversation-task" data-phase={storyPhase}>
        <TaskStoryDialogue
          guardian={guardian}
          phase={storyPhase}
          lines={lines}
          lineIndex={lineIndex}
          onAdvance={advanceStory}
          onSkip={skipStory}
        />
      </div>
    );
  }

  return <div className="task-body conversation-task interview-task" data-phase={phase}>
    <div className="interview-head">
      <div className="interview-who">
        <span className="interview-avatar" aria-hidden="true">苏</span>
        <div>
          <strong>{INTERVIEWER.byline}</strong>
          <span>{summaryReady ? "采访已结束" : `话题 ${Math.min(slotIndex + 1, INTERVIEW_LADDER.length)} / ${INTERVIEW_LADDER.length} · 第 ${exchangeCount} 轮回答`}</span>
        </div>
      </div>
      <div className="interview-meta">
        {offline && <span className="offline-chip">离线演示模式</span>}
        <PhaseTimer remainingMs={clock.remainingMs} />
      </div>
    </div>
    <div
      ref={threadNode}
      className="chat-thread interview-thread"
      aria-live="polite"
      onScroll={(event) => {
        const node = event.currentTarget;
        follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
      }}
    >
      {thread.map((item, index) => (
        <div
          key={item.uid ?? `${item.role}-${index}`}
          className={`chat-bubble ${item.role === "user" ? "is-user" : "is-guide"}${item.typing ? " is-typing" : ""}${summaryReady && item.role === "assistant" && index === thread.length - 1 ? " is-feedback" : ""}`}
        >
          <span>{item.role === "user" ? "我" : "苏"}</span>
          <div className="chat-text">
            {item.typing && !item.content
              ? <span className="thinking-hint"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> 正在输入…</span>
              : <MarkdownLite text={item.content} />}
          
          </div>
        </div>
      ))}
      {judging && (
        <div className="chat-bubble is-guide is-judging"><span>苏</span><div className="chat-text"><span className="thinking-hint"><CircleNotch className="reply-spinner" weight="bold" /> 正在斟酌你的回答…</span></div></div>
      )}
    </div>
    {error && <p className="agent-error" role="alert">{error}</p>}
    {summaryReady ? (
      <div className="conversation-done interview-summary">
        {/* 采访小结只报「聊过哪些话题」，不报每轮的档位得分：这是进行中的
            阶段，学员看到半程评分会误以为已成定局，也容易被分数带偏后面的
            表现。分数在全部阶段结束后由智核觉醒报告统一给出。 */}
        <span>采访完成 · 共 {exchangeCount} 轮回答</span>
        <div className="interview-credits">
          {credits.map((item) => (
            <span key={item.id} className="is-recorded">
              {{ experience: "真实经历", goal: "目标表达", constraints: "约束设定", feedback: "反馈修正", verify: "验证意识", consolidate: "提示词整合" }[item.id] ?? item.label}
              <i>已记录</i>
            </span>
          ))}
        </div>
        <TaskAction onClick={finishSummary} label="完成本关" variant="comprehensive" />
      </div>
    ) : (
      <label className="task-composer interview-composer">
        <span className="sr-only">输入你的回答</span>
        <input
          disabled={judging || interviewerBusy || clock.remainingMs <= 0}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onEnterSubmit(send, { when: () => !judging && !interviewerBusy })}
          placeholder={interviewerBusy ? "苏记者正在说话…" : judging ? "苏记者正在斟酌…" : "写下你的回答，Enter 发送…"}
        />
        <button type="button" disabled={judging || interviewerBusy || !draft.trim()} onClick={send} aria-label="发送回答">
          {judging || interviewerBusy ? <CircleNotch className="reply-spinner" weight="bold" /> : <PaperPlaneTilt weight="fill" />}
        </button>
      </label>
    )}
  </div>;
}

// ── 客观题阶段：时间预算下的自适应 CAT ────────────────────────────────────
// 不再固定题数：5 分钟内按 Fisher 信息量选题，难度随表现实时收敛；
// 标准误达标可提前结束；收尾前强制补齐缺失维度的证据。
const STOP_REASON_TEXT = {
  time: "时间到",
  precision: "能力估计已收敛（标准误达标），提前完成",
  cap: "已达到单场题量上限",
  exhausted: "本轮可用题目已用尽",
};

function AdaptiveObjectivePhase({
  hasStory,
  story,
  guardian,
  stage,
  seconds = PHASE_SECONDS,
  onComplete,
  onCharacterFeedback,
  onFetchQuestion,
  onAnswer,
  comprehensiveResult = null,
  adaptiveTelemetry = null,
}) {
  const [phase, setPhase] = useState(hasStory ? "opening" : "quiz");
  const [question, setQuestion] = useState(null);
  const [questionStatus, setQuestionStatus] = useState("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [requestIndex, setRequestIndex] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [reaction, setReaction] = useState("");
  const [evidenceMirror, setEvidenceMirror] = useState([]);
  const [dimCounts, setDimCounts] = useState(() => Object.fromEntries(DIMENSION_KEYS.map((key) => [key, 0])));
  const [stopInfo, setStopInfo] = useState(null);
  const taskRef = useRef(null);
  const inflight = useRef(null);
  const uncoveredRef = useRef(0);
  const answered = evidenceMirror.length;
  const uncoveredCount = DIMENSION_KEYS.filter((key) => !dimCounts[key]).length;
  uncoveredRef.current = uncoveredCount;

  const { storyPhase, lines, lineIndex, advanceStory, skipStory } = useStorySequencer({
    hasStory,
    story,
    phase,
    onCompletePhase: (next) => {
      if (next === "quiz") setPhase("quiz");
      else onComplete();
    },
  });

  const clock = usePhaseClock({
    seconds,
    running: phase === "quiz",
    onExpire: () => {
      if (phase !== "quiz") return;
      if (!result) {
        // An unanswered question at the bell simply is not counted.
        setStopInfo({ reason: "time" });
        setPhase("summary");
      }
    },
  });

  useEffect(() => {
    onCharacterFeedback?.({
      phase: storyPhase === "opening" || storyPhase === "ending" ? storyPhase : phase,
      // The summary view has no single right/wrong answer to celebrate, and
      // it must not keep showing the previous question's verdict either.
      result: phase === "summary" ? null : result,
      reaction: phase === "summary"
        ? `本轮共作答 ${evidenceMirror.length} 题。题目难度一路跟着你的表现调整；成绩会在全部阶段结束后统一给出。`
        : reaction || (storyPhase === "opening" || storyPhase === "ending" ? lines[lineIndex]?.text : null),
      speakerName: storyPhase === "opening" || storyPhase === "ending" ? getStorySpeaker(guardian, lines[lineIndex]?.who) : guardian,
    });
  }, [phase, storyPhase, result, reaction, lineIndex, lines, guardian, onCharacterFeedback]);

  useEffect(() => {
    if (phase !== "quiz" || stopInfo) return undefined;
    let active = true;
    setQuestionStatus("loading");
    const key = `${stage}:${requestIndex}:${reloadToken}`;
    if (!inflight.current || inflight.current.key !== key) {
      inflight.current = {
        key,
        promise: onFetchQuestion(null, stage, {
          scope: "bank",
          coverageCritical: uncoveredRef.current > 0,
        }).catch((error) => {
          if (inflight.current?.key === key) inflight.current = null;
          throw error;
        }),
      };
    }
    inflight.current.promise
      .then((data) => {
        if (!active) return;
        setQuestion(data.question);
        setQuestionStatus("ready");
      })
      .catch(() => {
        if (active) setQuestionStatus("error");
      });
    return () => {
      active = false;
    };
  }, [phase, stage, requestIndex, reloadToken, stopInfo, onFetchQuestion]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => {
      const task = taskRef.current;
      const feedback = task?.querySelector(".quiz-feedback");
      if (!task || !feedback) return;
      const target = feedback.getBoundingClientRect().top
        - task.getBoundingClientRect().top
        + task.scrollTop
        - 26;
      task.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [result]);

  const isMulti = question?.type === "multi";
  const canSubmit = isMulti && selected.length > 0 && !result;
  const expired = clock.remainingMs <= 0;

  const answer = (keys) => {
    if (result || !question || expired) return;
    const selectedKeys = [...new Set(keys)];
    // Single/judge commit on pick, so `selected` was never populated and the
    // wrong-pick highlight (is-wrong) could not render — the student saw the
    // right answer but not what they had chosen. Record the pick first.
    setSelected(selectedKeys);
    // The picked keys ride on the result itself: classing the options off the
    // separate `selected` state raced the commit, so the wrong-pick highlight
    // could be skipped on the very render that shows the verdict.
    const answerResult = { ...judgeComprehensiveAnswer(question, selectedKeys), picked: selectedKeys };
    setResult(answerResult);
    setReaction(getReaction({ guardian }, answerResult.correct));
    const outcome = answerResult.correct ? "correct" : answerResult.partialCorrect ? "partial" : "wrong";
    setEvidenceMirror((mirror) => [...mirror, { credit: answerCredit(question, selectedKeys), difficulty: question.difficulty }]);
    setDimCounts((counts) => {
      const next = { ...counts };
      for (const key of question.dimKeys) next[key] = (next[key] ?? 0) + 1;
      return next;
    });
    onAnswer?.(question, selectedKeys, outcome);
  };

  const evaluateStop = () => shouldStopCat({
    answered: evidenceMirror.length,
    elapsedMs: seconds * 1000 - clock.remainingMs,
    budgetMs: seconds * 1000,
    standardError: abilityStandardError({ evidence: evidenceMirror }),
    uncoveredCount,
  });

  const nextQuestion = () => {
    if (advancing) return;
    const stop = evaluateStop();
    if (stop.stop) {
      setStopInfo(stop);
      setPhase("summary");
      return;
    }
    setAdvancing(true);
    setSelected([]);
    setResult(null);
    setReaction("");
    setRequestIndex((current) => current + 1);
    setAdvancing(false);
  };

  const toggleMulti = (key) => {
    if (result) return;
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  // Keyboard answering: 1-4 / A-D pick an option, Enter submits or continues.
  useEffect(() => {
    if (phase !== "quiz" || questionStatus !== "ready" || !question) return undefined;
    const keyIndex = (key) => {
      const digits = { 1: 0, 2: 1, 3: 2, 4: 3 };
      const letters = { a: 0, b: 1, c: 2, d: 3 };
      return digits[key] ?? letters[key] ?? null;
    };
    const handleKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // 焦点在可输入元素里时，键盘属于那个输入框（含输入法选词），
      // 全局快捷键必须让路，否则 Enter 会被当成"选项 A-D"或"继续"。
      const target = event.target;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.isComposing || event.keyCode === 229) return;
      const optionCount = question.options.length;
      if (event.key === "Enter") {
        if (result) {
          event.preventDefault();
          nextQuestion();
        } else if (isMulti && canSubmit) {
          event.preventDefault();
          answer(selected);
        }
        return;
      }
      const index = keyIndex(event.key.toLowerCase());
      if (index === null || index >= optionCount) return;
      const option = question.options[index];
      if (!option || result) return;
      event.preventDefault();
      if (isMulti) toggleMulti(option.key);
      else answer([option.key]);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  if (storyPhase === "opening" || storyPhase === "ending") {
    return (
      <div className="task-body objective-task comprehensive-task" data-phase={storyPhase}>
        <TaskStoryDialogue
          guardian={guardian}
          phase={storyPhase}
          lines={lines}
          lineIndex={lineIndex}
          onAdvance={advanceStory}
          onSkip={skipStory}
        />
      </div>
    );
  }

  if (phase === "summary") {
    // 关卡完成页。只报「答了多少题、覆盖了哪些维度、下一步去哪」——
    // 不报正确率与答对数：这是阶段性小结，提前摊开成绩会让学员据此推断
    // 最终结果（本项目"进行中不给分"的一贯做法），总分与等级留到觉醒报告。
    const covered = DIMENSION_KEYS.filter((key) => (dimCounts[key] ?? 0) > 0);
    const nextLevel = getComprehensiveLevel(stage + 1);
    const thisLevel = getComprehensiveLevel(stage);
    const isFinalStage = stage >= COMPREHENSIVE_LEVELS.length;
    return <StageComplete
      stage={stage}
      answered={answered}
      coveredCount={covered.length}
      dimCounts={dimCounts}
      seconds={seconds}
      remainingMs={clock.remainingMs}
      stopReason={stopInfo?.reason}
      thisLevel={thisLevel}
      nextLevel={nextLevel}
      isFinalStage={isFinalStage}
      onContinue={() => (hasStory ? setPhase("ending") : onComplete())}
    />;
  }

  if (questionStatus !== "ready" || !question) {
    return <div className="task-body objective-task comprehensive-task" data-phase="quiz">
      <div className="agent-empty quiz-loading">
        {questionStatus === "error" ? (
          <>
            <span>题目加载失败。</span>
            <button className="source-toggle" type="button" onClick={() => setReloadToken((current) => current + 1)}>重新加载</button>
          </>
        ) : (
          <>
            <CircleNotch className="reply-spinner" weight="bold" />
            <span>正在按你的水平挑题…</span>
          </>
        )}
      </div>
    </div>;
  }

  const isSelected = (key) => (result?.picked ?? selected).includes(key);
  const optionState = (key) => {
    if (!result) return isSelected(key) ? " is-selected" : "";
    return question.answer.includes(key)
      ? " is-correct"
      : isSelected(key) ? " is-wrong" : "";
  };

  return (
    <div ref={taskRef} className="task-body objective-task comprehensive-task" data-phase="quiz">
      {adaptiveTelemetry && (
        <p className="adaptive-telemetry" aria-hidden="true">
          {`自适应路由 · 目标难度 ${adaptiveTelemetry.target >= 0 ? "+" : ""}${adaptiveTelemetry.target.toFixed(2)}${adaptiveTelemetry.standardError !== undefined && adaptiveTelemetry.standardError !== null ? ` · 标准误 ${adaptiveTelemetry.standardError.toFixed(2)}` : ""} · 证据 ${adaptiveTelemetry.evidenceCount}`}
        </p>
      )}
      <h2>{question.q}</h2>
      <p className="quiz-brief">
        第 {answered + 1} 题
        <i aria-hidden="true">•</i>
        {COMPREHENSIVE_TYPE_LABELS[question.type]}
        {isMulti ? "，选完点击提交，漏选可得部分分" : "，点击选项即提交"}
        <i aria-hidden="true">•</i>
        <PhaseTimer remainingMs={clock.remainingMs} />
      </p>
      <div className="answer-options" role={isMulti ? "group" : "radiogroup"} aria-label={COMPREHENSIVE_TYPE_LABELS[question.type]}>
        {question.options.map((option) => (
          <button
            key={option.key}
            type="button"
            role={isMulti ? "checkbox" : "radio"}
            aria-checked={isSelected(option.key)}
            disabled={Boolean(result) || expired}
            className={`comprehensive-option${optionState(option.key)}`}
            onClick={() => (isMulti ? toggleMulti(option.key) : answer([option.key]))}
          >
            <span>{option.key}</span>
            {option.text}
            {(isSelected(option.key) || (result && question.answer.includes(option.key))) && <Check weight="bold" />}
          </button>
        ))}
      </div>

      {result && (
        <div className={`quiz-feedback is-${result.correct ? "correct" : result.partialCorrect ? "partial" : "wrong"}`} role="status">
          {/* 反馈条按多邻国的做法：浅色底 + 深色字 + 一枚实心圆形图标。
              之前是饱和绿/红底配白字，整块很扎眼、解析读起来也累；
              浅底深字把"对/错"的判定交给图标与标题色，正文恢复可读对比。 */}
          <header className="quiz-feedback-head">
            <span className="quiz-feedback-mark" aria-hidden="true">
              {result.correct
                ? <Check size={22} weight="bold" />
                : <X size={22} weight="bold" />}
            </span>
            <div className="quiz-feedback-heads">
              <strong>
                {result.correct ? "回答正确" : result.partialCorrect ? "部分正确" : "回答不正确"}
              </strong>
              <span className="quiz-feedback-sub">
                {result.correct
                  ? "判断准确，这一维度的能力已记录"
                  : result.partialCorrect
                    ? "方向对了，但漏选了一部分"
                    : "别急，看解析把这个考点补上"}
              </span>
            </div>
          </header>
          <p className="quiz-feedback-answer"><b>正确答案</b>{result.answerText}</p>
          <p className="quiz-feedback-analysis"><b>解析</b>{question.analysis}</p>
          <div className="quiz-feedback-dims">
            {question.dims.map((dim) => <span key={dim}>{dim}</span>)}
          </div>
        </div>
      )}

      {result && <div className="story-line is-inline"><p>{reaction}</p></div>}

      <div className="comprehensive-actions">
        {isMulti && !result
          ? <TaskAction disabled={!canSubmit || expired} onClick={() => answer(selected)} label={selected.length ? `提交答案（已选 ${selected.length} 项）` : "提交答案"} variant="comprehensive" />
          : result ? <TaskAction disabled={advancing} onClick={nextQuestion} label={evaluateStop().stop ? "查看本轮小结" : "继续"} variant="comprehensive" /> : null}
        {expired && !result && <TaskAction onClick={() => { setStopInfo({ reason: "time" }); setPhase("summary"); }} label="时间到，查看小结" variant="comprehensive" />}
      </div>
    </div>
  );
}

// ── 实操阶段：Agent 工作台（豆包式大字号操作台） ──────────────────────────
function offlineImage(title) {
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

function offlineAgentOutput(task, prompt) {
  const steps = task.requirements
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  return `> **离线演示输出** —— 当前未连接 AI 服务，以下为按交付标准整理的产出框架。\n\n**任务**：${task.title}\n\n**你的提示词**：${prompt}\n\n---\n\n${steps}\n\n---\n\n以上框架在接入 AI 服务后会由 Agent 依据原始素材实际生成完整交付内容。`;
}

function agentMessages(task, prompt, uploads = []) {
  const brief = `任务：${task.title}\n目标：${task.goal}\n要求：\n${task.requirements.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n原始素材：\n${task.source}\n\n用户提示词：\n${prompt}`;
  // 学员上传了参考图 → 用多模态 content，让 Agent 真的"看见"这张图。
  // deepseek-flash 支持 image 输入；没有上传时保持纯字符串，省带宽也省 token。
  if (!Array.isArray(uploads) || uploads.length === 0) {
    return [
      { role: "system", content: "你是 AIQUOS 实操测评的执行 Agent。请严格根据用户提示词和原始素材完成任务；保留关键数据，不补充素材中没有的信息。输出仅包含最终交付内容，不解释你的推理。" },
      { role: "user", content: brief },
    ];
  }
  return [
    {
      role: "system",
      content: "你是 AIQUOS 实操测评的执行 Agent。请严格根据用户提示词和原始素材完成任务；保留关键数据，不补充素材中没有的信息。用户可能附上参考图，请按图片内容行事。输出仅包含最终交付内容，不解释你的推理。",
    },
    {
      role: "user",
      content: [
        { type: "text", text: `${brief}\n\n（学员附上了 ${uploads.length} 张参考图）` },
        ...uploads.map((item) => ({ type: "image_url", image_url: { url: item.src } })),
      ],
    },
  ];
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
function practicalHeuristic(task, generation) {
  const output = `${generation.output ?? ""} ${generation.prompt}`;
  const hits = task.requirements.filter((requirement) => {
    const tokens = requirement.split(/[，。：:、\s]+/).filter((token) => token.length >= 2);
    return tokens.some((token) => output.includes(token));
  }).length;
  const coverage = task.requirements.length ? hits / task.requirements.length : 0.5;
  const promptDepth = Math.min(1, [...generation.prompt].length / 120);
  return Math.round(Math.min(1, 0.65 * coverage + 0.35 * promptDepth) * 100) / 100;
}

/** 评分报告里的单套评分标准卡片：逐维度档位 + 得分 + 评语。 */
function PracticalScoreCard({ title, part }) {
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

function PracticalWorkbenchPhase({
  hasStory,
  story,
  guardian,
  levelId = "workshop",
  taskId = null,
  seconds = PHASE_SECONDS,
  onComplete,
  onCharacterFeedback,
  onTaskEvidence = null,
}) {
  // phase: opening → brief（读任务）→ work（作答）→ score（评分报告）
  const [phase, setPhase] = useState(hasStory ? "opening" : "brief");
  const [task, setTask] = useState(null);
  const [taskStatus, setTaskStatus] = useState("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [draft, setDraft] = useState("");
  const [generations, setGenerations] = useState([]);
  const [liveOutput, setLiveOutput] = useState("");
  const [running, setIsRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [canvasTab, setCanvasTab] = useState("output");
  // 学员上传的参考图（data URI）。实操任务里常需要"我有一张图，请按它来"，
  // 没有上传就只能靠文字描述，很多任务没法做。
  const [uploads, setUploads] = useState([]);
  const uploadInputRef = useRef(null);
  // 评分报告（/api/practical-score 的返回；离线兜底时只有总档位分）。
  const [scoreReport, setScoreReport] = useState(null);
  // 两步态：先只呈现任务与交付标准（大字、留白充足），确认后再进入作答界面。
  // 一屏同时塞下标准+素材+画布+输入框，只能把字号压到 12–15px，反而看不清。
  const [briefAcknowledged, setBriefAcknowledged] = useState(false);
  const finalGeneration = generations[generations.length - 1];

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
            ? "生成完成！可以优化提示词再生成，也可以完成本关。"
            : (storyPhase === "opening" || storyPhase === "ending" ? lines[lineIndex]?.text : "在下方撰写提示词并点击发送，驱动 Agent 完成任务。"),
      speakerName: guardian,
    });
  }, [phase, storyPhase, running, generations.length, lineIndex, lines, guardian, onCharacterFeedback]);

  useEffect(() => {
    let active = true;
    setTaskStatus("loading");
    const params = new URLSearchParams();
    if (taskId) params.set("taskId", taskId);
    else params.set("levelId", levelId);
    params.set("count", "1");
    params.set("edition", readEdition());
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
  }, [levelId, taskId, reloadToken, hasStory]);

  if (storyPhase === "opening" || storyPhase === "ending") {
    return (
      <div className="task-body practical-task" data-phase={storyPhase}>
        <TaskStoryDialogue
          guardian={guardian}
          phase={storyPhase}
          lines={lines}
          lineIndex={lineIndex}
          onAdvance={advanceStory}
          onSkip={skipStory}
        />
      </div>
    );
  }

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
  async function toUploadItem(source, fallbackName = "参考图") {
    let dataUrl;
    let name = fallbackName;
    if (typeof source === "string") {
      dataUrl = source;
      name = source.split("/").pop() || fallbackName;
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
    return { src: canvas.toDataURL("image/jpeg", 0.82), name, width, height };
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
        const item = await toUploadItem(seed.src, seed.name);
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

  const imagePrompt = (prompt) => `${task.title}\n${task.goal}\n任务要求：${task.requirements.join("；")}\n活动素材：${task.source}\n用户补充：${prompt}`;

  const run = async () => {
    const prompt = draft.trim();
    // Past the bell a student may still submit one prompt they had already
    // started writing — the time budget gates new iterations, not this one.
    const expiredButStarted = expired && prompt.length > 0 && generations.length === 0;
    if (!prompt || running || atGenerationCap || (expired && !expiredButStarted)) return;
    setError("");
    setIsRunning(true);
    setLiveOutput("");
    const entry = { prompt, offline: false };
    try {
      if (isImageTask) {
        try {
          entry.imageUrl = await generateArkImage({ prompt: imagePrompt(prompt) });
        } catch {
          setOffline(true);
          entry.imageUrl = offlineImage(task.title);
          entry.offline = true;
        }
      } else {
        let output = "";
        let failed = false;
        try {
          output = await streamDeepSeek({
            messages: agentMessages(task, prompt, uploads),
            onDelta: (message) => {
              output = message;
              setLiveOutput(message);
            },
          });
        } catch {
          failed = true;
        }
        if (failed || !output.trim()) {
          setOffline(true);
          output = offlineAgentOutput(task, prompt);
          entry.offline = true;
        }
        entry.output = output;
      }
      setGenerations((current) => [...current, entry]);
      setDraft("");
      setCanvasTab("output");
    } catch (requestError) {
      setError(requestError.message || "运行失败，请重试。");
    } finally {
      setIsRunning(false);
      setLiveOutput("");
    }
  };

  const finish = async () => {
    if (finishing || !finalGeneration) return;
    setFinishing(true);
    let report = null;
    try {
      report = await requestPracticalScore({ task, generations, finalGeneration, isImageTask });
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
      label: "实操任务",
    });
    setFinishing(false);
    // 先看评分报告；报告页的「完成本关」才推进到结尾/下一阶段。
    setPhase("score");
  };

  if (phase === "brief" || (!briefAcknowledged && phase !== "work")) {
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
                  <img src={asset.src} alt={assetLabel(asset)} />
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
            }}
          >
            我已了解任务，开始作答
            <ArrowRight weight="bold" />
          </button>
        </div>
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
            onClick={() => (hasStory ? setPhase("ending") : onComplete())}
          >
            完成本关
            <ArrowRight weight="bold" />
          </button>
        </div>
      </div>
    );
  }

  return <div className="task-body practical-task workbench" data-phase="work">
    <div className="workbench-head">
      <h2>{task.title}</h2>
      <div className="workbench-meta">
        <span className="wb-chip">{isImageTask ? "图片生成" : "文本生成"}</span>
        <span className={`wb-chip${generations.length ? " is-active" : ""}`}>第 {Math.max(1, generations.length)} / {MAX_GENERATIONS} 次生成</span>
        {offline && <span className="offline-chip">离线演示模式</span>}
        <PhaseTimer remainingMs={clock.remainingMs} />
      </div>
    </div>
    <div className="agent-workspace workbench-grid">
      <section className="agent-checklist wb-brief" aria-label="任务简报">
        <p className="wb-goal">{task.goal}</p>
        <div className="agent-section-heading"><ClipboardText weight="fill" /><span>交付标准</span></div>
        <ol className="wb-requirements">
          {deliveryRequirements(task).map((item) => <li key={item}>{item}</li>)}
        </ol>
        <button className="source-toggle" type="button" onClick={() => setShowMaterial((value) => !value)}>{showMaterial ? "收起原始素材" : "查看原始素材"}</button>
        {showMaterial && <div className="source-copy wb-material"><MarkdownLite text={task.source} /></div>}
      </section>
      <section className="agent-canvas wb-canvas" aria-live="polite" aria-label="Agent 工作区域">
        {inputAssets(task).length > 0 && (
          <figure className="wb-reference" aria-label="任务参考素材">
            {inputAssets(task).map((asset) => (
              <figure className="wb-reference-item" key={asset.src}>
                <img src={asset.src} alt={assetLabel(asset)} />
                <figcaption>{assetLabel(asset)}</figcaption>
              </figure>
            ))}
          </figure>
        )}
        <div className="wb-canvas-tabs" role="tablist" aria-label="产出查看">
          <button type="button" role="tab" aria-selected={canvasTab === "output"} className={canvasTab === "output" ? "is-active" : ""} onClick={() => setCanvasTab("output")}>AI 输出</button>
          <button type="button" role="tab" aria-selected={canvasTab === "history"} className={canvasTab === "history" ? "is-active" : ""} onClick={() => setCanvasTab("history")}>提示词记录（{generations.length}）</button>
        </div>
        {canvasTab === "history" ? (
          generations.length ? (
            <div className="wb-history">
              {generations.map((generation, index) => (
                <div key={index} className="wb-history-item">
                  <strong>第 {index + 1} 次生成</strong>
                  <p>{generation.prompt}</p>
                </div>
              ))}
            </div>
          ) : <div className="agent-empty"><Sparkle weight="fill" /><span>还没有生成记录。</span></div>
        ) : running && !liveOutput && !finalGeneration?.imageUrl ? (
          <div className="agent-empty"><CircleNotch className="reply-spinner" weight="bold" /><span>{isImageTask ? "正在生成主视觉…" : "正在整理材料…"}</span></div>
        ) : running && liveOutput ? (
          <div className="agent-output wb-output is-streaming"><MarkdownLite text={liveOutput} /></div>
        ) : finalGeneration?.imageUrl ? (
          <figure className="wb-image-wrap">
            <img className="agent-image wb-image" src={finalGeneration.imageUrl} alt={`${task.title}生成结果`} />
            {finalGeneration.offline && <figcaption>离线演示图</figcaption>}
          </figure>
        ) : finalGeneration?.output ? (
          <div className="agent-output wb-output"><MarkdownLite text={finalGeneration.output} /></div>
        ) : (
          <div className="agent-empty"><Sparkle weight="fill" /><span>写好提示词后，Agent 将在这里完成交付。</span></div>
        )}
      </section>
    </div>
    {error && <p className="agent-error" role="alert">{error}</p>}
    <div className="workbench-actions">
      {uploads.length > 0 && (
        <div className="wb-uploads" aria-label="已上传的参考图">
          {uploads.map((item, index) => (
            <figure
              className={`wb-upload${item.fromTask ? " is-task-asset" : ""}`}
              key={`${item.name}-${index}`}
              title={item.fromTask ? `任务素材：${item.name}` : `我上传的：${item.name}`}
            >
              <img src={item.src} alt={item.name} />
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
        <button
          type="button"
          className="wb-upload-trigger"
          aria-label="上传参考图"
          title="上传参考图（最多 4 张）"
          disabled={running || uploads.length >= 4}
          onClick={() => uploadInputRef.current?.click()}
        >
          <ImageSquare weight="bold" size={20} />
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={handleUpload}
        />
        <textarea
          disabled={running || (expired && generations.length > 0) || atGenerationCap}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={onEnterSubmit(run, { withMeta: true, when: () => !running })}
          placeholder={atGenerationCap ? `已达 ${MAX_GENERATIONS} 次生成上限，请完成本关` : expired ? "时间到——可直接提交你已写好的提示词，或点击「完成本关」" : generations.length ? "优化你的提示词，让 Agent 重新生成…" : isImageTask ? "写下画面提示词（主体/场景/风格/构图/文字），可粘贴参考图，⌘+Enter 生成…" : "写下你的提示词（角色/任务/约束/格式），可粘贴图片，⌘+Enter 运行…"}
          rows={2}
        />
        <button
          type="button"
          className="agent-send"
          disabled={running || !draft.trim() || (expired && generations.length > 0) || atGenerationCap}
          onClick={run}
          aria-label={generations.length ? "重新生成" : isImageTask ? "生成图片" : "运行 Agent"}
        >
          {running ? <CircleNotch className="reply-spinner" weight="bold" /> : <PaperPlaneTilt weight="fill" />}
        </button>
      </label>
      {generations.length > 0 && (
        <div className="wb-complete-row">
          <span className="wb-hint">{generations.length > 1 ? `已迭代 ${generations.length} 次——会评估、会优化，正是高分信号` : "也可以优化提示词再生成一次"}</span>
          <TaskAction disabled={finishing || running} onClick={finish} label={finishing ? "AI 评委评分中…" : "交卷评分"} variant="comprehensive" />
        </div>
      )}
    </div>
  </div>;
}

/** 入场动画结束后摘掉 animation，避免残留 transform 改变后代 fixed 的定位基准。 */
function useSettledAfterAnimation() {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 620);
    return () => window.clearTimeout(timer);
  }, []);
  return settled;
}

export function AssessmentTask({
  id,
  stage,
  complete,
  onBack,
  onPick,
  onComplete,
  onFetchComprehensiveQuestion,
  onAnswerComprehensive,
  comprehensiveResult,
  adaptiveTelemetry = null,
  onExternalEvidence = null,
  onInterviewScore = null,
  busy,
}) {
  const layoutSettled = useSettledAfterAnimation();

  const theme = ASSESSMENT_THEMES[id];
  const comprehensive = id === "comprehensive";
  const total = phaseCount(id);
  const phaseDef = comprehensive ? COMPREHENSIVE_PHASES[stage - 1] : null;
  const mode = phaseDef ? phaseDef.mode : getStageMode(id, 1);
  const story = phaseDef ? PHASE_STORIES[phaseDef.id] : null;
  const guardian = phaseDef?.guardian
    ?? { conversation: "苏记者", objective: "林教授", practical: "陈创客" }[mode]
    ?? "导师";
  const taskKey = `${id}-${stage}-${mode}`;
  const props = {
    hasStory: comprehensive,
    story,
    guardian,
    onComplete: () => onComplete(stage),
  };
  const displayMode = comprehensive ? mode : mode;
  return (
    <main
      className="assessment-flow task-flow"
      data-mode={displayMode}      style={{
        "--assessment-color": theme.color,
        "--assessment-soft": theme.soft,
        "--assessment-glow": theme.glow,
        "--assessment-deep": theme.deep,
      }}
    >
      <button className="flow-back" type="button" onClick={onBack} disabled={busy}>
        <ArrowLeft weight="bold" /> {comprehensive ? "返回关卡地图" : "返回测评选择"}
      </button>
      <h1 className="flow-wordmark" aria-label="TEST! 测评关卡">
        <TestWordmark />
      </h1>
      <Progress current={stage} complete={complete} onPick={onPick} disabled={busy} total={total} />

      <div className={`task-stage-layout${layoutSettled ? " is-settled" : ""}`}>
        <section className="task-panel is-enlarged" aria-label={`${theme.title}第 ${stage} 关`}>
          <Guides />
          <TaskHeader id={id} stage={stage} mode={mode} />
          {mode === "objective" ? (
            <AdaptiveObjectivePhase
              key={`${taskKey}-cat`}
              {...props}
              stage={stage}
              onFetchQuestion={onFetchComprehensiveQuestion}
              onAnswer={onAnswerComprehensive}
              comprehensiveResult={comprehensiveResult}
              adaptiveTelemetry={adaptiveTelemetry}
            />
          ) : mode === "conversation" ? (
            <InterviewPhase
              key={`${taskKey}-interview`}
              {...props}
              onInterviewScore={comprehensive ? onInterviewScore : null}
            />
          ) : (
            <PracticalWorkbenchPhase
              key={`${taskKey}-workbench`}
              {...props}
              levelId={comprehensive ? "workshop" : "all"}
              taskId={new URLSearchParams(window.location.search).get("task")}
              onTaskEvidence={comprehensive ? onExternalEvidence : null}
            />
          )}
        </section>

        <aside className="task-character-stage" aria-label="AI 伴学导师舞台">
          <Task3DCharacter id={id} />
        </aside>
      </div>

      {/* 角色微调面板：仅在 ?tune=1 时挂载，生产页面完全不加载 */}
      {new URLSearchParams(window.location.search).has("tune") && (
        <CharacterTuner defaults={TUNING_DEFAULTS} />
      )}
    </main>
  );
}
