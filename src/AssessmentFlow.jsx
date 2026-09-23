import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChatCircleDots,
  ClipboardText,
  CircleNotch,
  ListChecks,
  PaperPlaneTilt,
  Sparkle,
  Target,
  Timer,
} from "@phosphor-icons/react";
import { TestWordmark } from "./TestWordmark";
import {
  COMPREHENSIVE_TYPE_LABELS,
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
import { generateArkImage, streamDeepSeek } from "./deepseek";
import {
  INTERVIEW_LADDER,
  INTERVIEWER,
  interviewClosing,
  interviewMessages,
  interviewOpening,
  parseInterviewerJson,
  planDelivery,
} from "./interviewer";
import { heuristicSlotCredit } from "./interview-scoring";
import { onEnterSubmit } from "./ime";
import { MarkdownLite } from "./markdown-lite";
import { Task3DCharacter } from "./Task3DCharacter";
import { DIMENSIONS as SCORING_DIMENSIONS } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const GUIDES = "/assets/crops/assessment-guides-crop.png";
// 对话线程的本地存档：刷新后恢复完整采访记录并跳过开场白，否则线程随内存
// 丢失，学员面对的是一片空白且进度显示与实际不符。
const INTERVIEW_KEY = "aiquos.interview-thread.v1";

function readInterviewState() {
  try {
    const raw = JSON.parse(localStorage.getItem(INTERVIEW_KEY) ?? "null");
    if (!raw || !Array.isArray(raw.thread)) return null;
    // 空记录不是可恢复的会话：丢弃它，让学员从干净的开场开始，
    // 而不是恢复出一个「已结束但没有内容」的界面。
    if (raw.thread.length === 0) {
      localStorage.removeItem(INTERVIEW_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function writeInterviewState(state) {
  try {
    if (state === null) localStorage.removeItem(INTERVIEW_KEY);
    else localStorage.setItem(INTERVIEW_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时退化为单次会话，不影响作答。
  }
}
const DIMENSION_KEYS = SCORING_DIMENSIONS.map((dimension) => dimension.key);
const MAX_GENERATIONS = 3;

async function chatOnce({ messages }) {
  const response = await fetch("/api/deepseek/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, stream: false }),
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

// ── 对话式测评：拟人化采访 ────────────────────────────────────────────────
// 采访者「苏记者」按题梯提问，回复经投递引擎分段连发、模拟打字节奏；
// 每轮回答由 LLM 按评分标准打分（离线时降级为启发式），低分追问一次。
function InterviewPhase({
  hasStory,
  story,
  guardian,
  seconds = PHASE_SECONDS,
  onComplete,
  onCharacterFeedback,
  onExchangeEvidence = null,
}) {
  const restored = useRef(readInterviewState());
  const resumed = Boolean(restored.current && restored.current.thread.length > 0);
  const [phase, setPhase] = useState(hasStory && !resumed ? "opening" : "starting");
  const [thread, setThread] = useState(() => restored.current?.thread ?? []);
  const [draft, setDraft] = useState("");
  const [slotIndex, setSlotIndex] = useState(() => restored.current?.slotIndex ?? 0);
  const [followUsed, setFollowUsed] = useState(() => restored.current?.followUsed ?? 0);
  // 已答轮数直接从会话记录派生（user 消息条数）。之前独立维护一个计数器，
  // 刷新恢复后会出现「共 0 轮回答」与实际对话条数不符的情况。
  const derivedExchanges = thread.filter((item) => item.role === "user").length;
  const [exchangeCount, setExchangeCount] = useState(() => derivedExchanges);
  const [judging, setIsJudging] = useState(false);
  const [interviewerBusy, setInterviewerBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [credits, setCredits] = useState(() => restored.current?.credits ?? []);
  // 只有会话记录确实存在时才恢复"已结束"状态。
  // 否则一个空会话（存档残留但对话已被清空）会直接显示"采访已结束"，
  // 学员看到的是一个没有内容、也无法作答的死页面。
  const [summaryReady, setSummaryReady] = useState(
    () => Boolean(restored.current?.summaryReady) && (restored.current?.thread?.length ?? 0) > 0,
  );
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

  useEffect(() => () => {
    timersRef.current.forEach((clear) => clear());
    timersRef.current = [];
  }, []);

  // 会话记录变化后同步已答轮数，确保小结里的数字与实际对话一致。
  useEffect(() => {
    setExchangeCount(derivedExchanges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedExchanges]);

  // 采访状态存档：thread/slot/credits 变化即写盘，供刷新与掉落恢复。
  useEffect(() => {
    if (thread.length === 0 && !summaryReady) return;
    writeInterviewState({
      thread,
      slotIndex,
      followUsed,
      exchangeCount,
      credits,
      summaryReady,
    });
  }, [thread, slotIndex, followUsed, exchangeCount, credits, summaryReady]);

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
  function typeSegment(segment) {
    return new Promise((resolve) => {
      setThread((items) => [...items, { role: "assistant", content: "", typing: true, sticker: segment.sticker }]);
      const chars = [...segment.text];
      const budget = Math.min(segment.typingMs, 1500);
      const step = Math.max(2, Math.ceil(chars.length / Math.max(1, Math.round(budget / 45))));
      let index = 0;
      const interval = window.setInterval(() => {
        index = Math.min(chars.length, index + step);
        const slice = chars.slice(0, index).join("");
        setThread((items) => items.map((item, position) => (position === items.length - 1 ? { ...item, content: slice } : item)));
        if (index >= chars.length) {
          window.clearInterval(interval);
          setThread((items) => items.map((item, position) => (position === items.length - 1 ? { ...item, typing: false } : item)));
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

  async function requestInterviewer({ followUp = false, lastNote = "", threadOverride = null } = {}) {
    const currentSlot = INTERVIEW_LADDER[Math.min(slotIndex, INTERVIEW_LADDER.length - 1)];
    if (!ladderDone) {
      try {
        const raw = await chatOnce({
          messages: interviewMessages({
            thread: threadOverride ?? thread,
            slot: { ...currentSlot, index: slotIndex },
            followUp,
            lastNote,
          }),
        });
        const parsed = parseInterviewerJson(raw);
        if (parsed) return { reply: parsed.reply, note: parsed.note };
        throw new Error("unparseable");
      } catch {
        setOffline(true);
        return { reply: pick(followUp ? currentSlot.followUps : currentSlot.asks), note: "" };
      }
    }
    return { reply: "", note: "" };
  }

  async function startInterview() {
    setPhase("quiz");
    await speak(planDelivery(interviewOpening().join("\n")));
    const first = await requestInterviewer();
    await speak(planDelivery(first.reply));
  }

  useEffect(() => {
    if (phase !== "starting") return;
    // 续答（有存档）只补一句衔接语；新会话才走完整开场。
    if (resumed) {
      speak(planDelivery("我们接着刚才的聊——继续吧。"));
      return;
    }
    startInterview();
    // The phase transition drives the whole scripted opening exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function judgeAnswer(content) {
    const currentSlot = INTERVIEW_LADDER[Math.min(slotIndex, INTERVIEW_LADDER.length - 1)];
    let score = null;
    let note = "";
    let evidence = "";
    let llmReply = null;
    try {
      const raw = await chatOnce({
        messages: interviewMessages({
          thread: [...thread, { role: "user", content }],
          slot: { ...currentSlot, index: slotIndex },
          followUp: false,
        }),
      });
      const parsed = parseInterviewerJson(raw);
      if (parsed) {
        score = parsed.score;
        note = parsed.note;
        evidence = parsed.evidence ?? "";
        llmReply = parsed.reply;
      }
    } catch {
      setOffline(true);
    }
    // Offline or unparseable: fall back to the same slot rubric, heuristically.
    if (score === null) {
      score = heuristicSlotCredit(currentSlot.id, content);
      evidence = "";
      note = note || "离线启发式判定";
    }
    return { score, note, evidence, llmReply };
  }

  const send = async () => {
    if (phase !== "quiz" || judging || interviewerBusy || summaryReady) return;
    const content = draft.trim();
    if (!content) return;
    setThread((items) => [...items, { role: "user", content }]);
    setDraft("");
    setError("");
    setIsJudging(true);
    try {
      const judged = await judgeAnswer(content);
      const probing = followSlotRef.current;
      // A follow-up answer re-judges the same slot: keep the better of the two
      // so asking a student to elaborate can never lower their recorded credit.
      const score = probing && probing.id === slot.id ? Math.max(probing.credit, judged.score) : judged.score;
      const note = judged.note;
      const evidence = judged.evidence;
      const llmReply = judged.llmReply;
      followSlotRef.current = null;
      const nextCount = exchangeCount + 1;
      setExchangeCount(nextCount);
      setCredits((items) => [...items.filter((item) => item.id !== slot.id), { id: slot.id, label: slot.id, credit: score, evidence }]);
      // Low-confidence answers may be probed once more; the re-judged score
      // replaces this evidence in place, so the higher of the two sticks.
      onExchangeEvidence?.({ id: `conv-${slot.id}`, dimKeys: slot.dims, credit: score, label: "对话式测评" });
      const threadWithAnswer = [...thread, { role: "user", content }];
      const timeLeft = clock.remainingMs;
      // The last slot never probes: asking a student to elaborate after the
      // final question would require a sixth answer before the interview can
      // close, which reads as a stuck conversation.
      const isLastSlot = slotIndex + 1 >= INTERVIEW_LADDER.length;
      if (!isLastSlot && score < 0.55 && followUsed < 1 && timeLeft > 50_000) {
        setFollowUsed((current) => current + 1);
        followSlotRef.current = { id: slot.id, credit: score };
        const asked = await requestInterviewer({ followUp: true, lastNote: note, threadOverride: threadWithAnswer });
        await speak(planDelivery(asked.reply));
      } else {
        setSlotIndex((current) => current + 1);
        setFollowUsed(0);
        if (isLastSlot) {
          await beginClosing(nextCount);
        } else if (llmReply && score >= 0.55) {
          // The judge call already phrased the next question — reuse it and
          // save a round trip.
          await speak(planDelivery(llmReply));
        } else {
          const asked = await requestInterviewer({ threadOverride: threadWithAnswer });
          await speak(planDelivery(asked.reply));
        }
      }
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
    writeInterviewState(null);
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
          key={`${item.role}-${index}`}
          className={`chat-bubble ${item.role === "user" ? "is-user" : "is-guide"}${item.typing ? " is-typing" : ""}${summaryReady && item.role === "assistant" && index === thread.length - 1 ? " is-feedback" : ""}`}
        >
          <span>{item.role === "user" ? "我" : "苏"}</span>
          <div className="chat-text">
            {item.typing && !item.content
              ? <span className="thinking-hint"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> 正在输入…</span>
              : <MarkdownLite text={item.content} />}
            {item.sticker && !item.typing ? <em className="bubble-sticker">{item.sticker}</em> : null}
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
    // 小结只报"答了多少题、用了多久"，不报正确率与答对数：这是阶段性小结，
    // 把成绩提前摊开会让学员据此推断最终结果（这也是本项目"进行中不给分"
    // 的一贯做法）。总分与等级在全部阶段结束后由觉醒报告给出。
    return <div className="task-body objective-task comprehensive-task" data-phase="summary">
      <div className="cat-summary">
        <div className="cat-summary-figure">{answered}</div>
        <div className="cat-summary-body">
          <strong>本轮作答 {answered} 题</strong>
          <p>{STOP_REASON_TEXT[stopInfo?.reason] ?? "本阶段完成"}</p>
          <ul className="cat-summary-stats">
            <li><span>本阶段用时</span><b>{formatClock(seconds * 1000 - clock.remainingMs)}</b></li>
            <li><span>题目难度</span><b>随表现实时调整</b></li>
            <li><span>成绩</span><b>全部阶段结束后给出</b></li>
          </ul>
          <p className="cat-summary-note">答对则下一题加难、答错则回落，直到能力估计收敛——所以题数不固定。</p>
        </div>
        <TaskAction onClick={() => (hasStory ? setPhase("ending") : onComplete())} label="完成本关" variant="comprehensive" />
      </div>
    </div>;
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
        <div className={`quiz-feedback is-${result.correct ? "correct" : "wrong"}`} role="status">
          <strong>{result.correct ? "回答正确" : result.partialCorrect ? "部分正确" : "回答不正确"}</strong>
          <p className="quiz-feedback-answer"><b>正确答案：</b>{result.answerText}</p>
          <p className="quiz-feedback-analysis"><b>解析：</b>{question.analysis}</p>
          <div>{question.dims.map((dim) => <span key={dim}>{dim}</span>)}</div>
          {result.correct && <span className="star-pop" aria-hidden="true">★</span>}
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

function agentMessages(task, prompt) {
  return [
    { role: "system", content: "你是 AIQUOS 实操测评的执行 Agent。请严格根据用户提示词和原始素材完成任务；保留关键数据，不补充素材中没有的信息。输出仅包含最终交付内容，不解释你的推理。" },
    {
      role: "user",
      content: `任务：${task.title}\n目标：${task.goal}\n要求：\n${task.requirements.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n原始素材：\n${task.source}\n\n用户提示词：\n${prompt}`,
    },
  ];
}

function judgeMessages(task, generation) {
  const product = generation.imageUrl
    ? "（本任务为图片生成，产出为一张按用户提示词生成的图片）"
    : String(generation.output ?? "").slice(0, 4000);
  return [
    { role: "system", content: '你是 AIQUOS 实操任务的验收评委。只输出一个 JSON 对象（不要 markdown 代码块）：{"score":0到1的小数,"note":"一句话评语"}。评分依据：最终产出满足每条交付标准的程度，以及用户提示词的具体性与可用性。' },
    {
      role: "user",
      content: `任务：${task.title}\n目标：${task.goal}\n交付标准：\n${task.requirements.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n用户提示词：\n${generation.prompt}\n\n最终产出：\n${product}\n\n共经历 ${generation.iterationText ?? "1"} 次生成迭代。`,
    },
  ];
}

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

function parseJudgeJson(raw) {
  const text = String(raw ?? "").trim().replace(/^```(?:json)?|```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) return null;
    return { score: Math.max(0, Math.min(1, score)), note: typeof parsed.note === "string" ? parsed.note : "" };
  } catch {
    return null;
  }
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
  // phase: opening → brief（读任务）→ work（作答）
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
  // 否则学员可以先读完简报再开始计时。
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
    fetch(`/api/practical-tasks?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("任务加载失败。");
        const payload = await response.json();
        if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
          throw new Error("任务数据不完整。");
        }
        if (!active) return;
        setTask(payload.tasks[0]);
        setTaskStatus("ready");
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
            messages: agentMessages(task, prompt),
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
    try {
      let credit = null;
      try {
        const raw = await chatOnce({
          messages: judgeMessages(task, {
            ...finalGeneration,
            iterationText: `${generations.length}`,
          }),
        });
        credit = parseJudgeJson(raw)?.score ?? null;
      } catch {
        setOffline(true);
      }
      if (credit === null) credit = practicalHeuristic(task, finalGeneration);
      onTaskEvidence?.({
        id: `prac-${task.id}`,
        dimKeys: Array.isArray(task.dimKeys) && task.dimKeys.length ? task.dimKeys : ["D3", "D4"],
        credit,
        label: "实操任务",
      });
      if (hasStory) setPhase("ending");
      else onComplete();
    } finally {
      setFinishing(false);
    }
  };

  if (phase === "brief" || (!briefAcknowledged && phase !== "work")) {
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

          {Array.isArray(task.assets) && task.assets.length > 0 && (
            <figure className="wb-reference wb-brief-refs" aria-label="任务参考素材">
              {task.assets.map((asset) => (
                <figure className="wb-reference-item" key={asset.src}>
                  <img
                    src={asset.src}
                    alt={asset.note || (asset.role === "reference" ? "风格参考图" : asset.role === "source" ? "待处理原图" : "任务素材图")}
                  />
                  {asset.note && <figcaption>{asset.note}</figcaption>}
                </figure>
              ))}
            </figure>
          )}

          <div className="wb-brief-criteria">
            <div className="agent-section-heading"><ClipboardText weight="fill" /><span>交付标准</span></div>
            <ol className="wb-requirements">
              {task.requirements.map((item) => <li key={item}>{item}</li>)}
            </ol>
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
    <p className="agent-brief">{task.goal}</p>
    <div className="agent-workspace workbench-grid">
      <section className="agent-checklist wb-brief" aria-label="任务简报">
        <div className="agent-section-heading"><ClipboardText weight="fill" /><span>交付标准</span></div>
        <ol className="wb-requirements">
          {task.requirements.map((item) => <li key={item}>{item}</li>)}
        </ol>
        <button className="source-toggle" type="button" onClick={() => setShowMaterial((value) => !value)}>{showMaterial ? "收起原始素材" : "查看原始素材"}</button>
        {showMaterial && <div className="source-copy wb-material"><MarkdownLite text={task.source} /></div>}
      </section>
      <section className="agent-canvas wb-canvas" aria-live="polite" aria-label="Agent 工作区域">
        {Array.isArray(task.assets) && task.assets.length > 0 && (
          <figure className="wb-reference" aria-label="任务参考素材">
            {task.assets.map((asset) => (
              <figure className="wb-reference-item" key={asset.src}>
                <img
                  src={asset.src}
                  alt={asset.note || (asset.role === "reference" ? "风格参考图" : asset.role === "source" ? "待处理原图" : "任务素材图")}
                />
                {asset.note && <figcaption>{asset.note}</figcaption>}
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
      <label className="agent-composer wb-composer">
        <span className="sr-only">给 Agent 的提示词</span>
        <textarea
          disabled={running || (expired && generations.length > 0) || atGenerationCap}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onEnterSubmit(run, { withMeta: true, when: () => !running })}
          placeholder={atGenerationCap ? `已达 ${MAX_GENERATIONS} 次生成上限，请完成本关` : expired ? "时间到——可直接提交你已写好的提示词，或点击「完成本关」" : generations.length ? "优化你的提示词，让 Agent 重新生成…" : isImageTask ? "写下画面提示词（主体/场景/风格/构图/文字），⌘+Enter 生成…" : "写下你的提示词（角色/任务/约束/格式），⌘+Enter 运行…"}
          rows={3}
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
          <TaskAction disabled={finishing || running} onClick={finish} label={finishing ? "导师评审中…" : "完成本关"} variant="comprehensive" />
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
  busy,
}) {
  const [characterState, setCharacterState] = useState({
    phase: "quiz",
    result: null,
    reaction: null,
    speakerName: null,
  });
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
    onCharacterFeedback: setCharacterState,
  };
  const displayMode = comprehensive ? mode : mode;
  return (
    <main
      className="assessment-flow task-flow"
      data-mode={displayMode}
      style={{
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
              onExchangeEvidence={comprehensive ? onExternalEvidence : null}
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

        <aside className="task-character-stage" aria-label="3D 伴学导师与守门人舞台">
          <Task3DCharacter
            id={id}
            stage={stage}
            mode={displayMode}
            phase={characterState.phase}
            result={characterState.result}
            reaction={characterState.reaction}
            speakerName={characterState.speakerName}
          />
        </aside>
      </div>
    </main>
  );
}
