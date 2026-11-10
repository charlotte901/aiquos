// 对话式测评阶段（经验锚定式采访）。2026-11 自 AssessmentFlow.jsx 机械拆出。
import { CircleNotch, PaperPlaneTilt } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { PHASE_SECONDS, usePhaseClock } from "../assessment-timing";
import { autoResizeRef, onEnterSubmit } from "../ime";
import { parseScoreJson } from "../interview-score-parse";
import { heuristicSlotCredit } from "../interview-scoring";
import { scoreInterview } from "../interview-scoring-model";
import { INTERVIEW_LADDER, INTERVIEWER, interviewChatMessages, interviewClosing, interviewOpening, interviewScoreMessages, parseInterviewerJson, planDelivery } from "../interviewer";
import { MarkdownLite } from "../markdown-lite";
import { clearInterviewState, CHAT_TEMPERATURE, GRADING_OPTIONS, pick, PhaseTimer, TaskAction, useStorySequencer } from "./flow-shared";

export function InterviewPhase({
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

  async function requestInterviewer({ followUp = false, lastNote = "", threadOverride = null, slotOverride = null, slotIndexOverride = null } = {}) {
    // 槽位必须显式传入：send() 里 setSlotIndex 是异步的，直接读闭包里的
    // slotIndex 会拿到旧值——生成的问题比打分槽位滞后一档（experience 的
    // 追问被按 goal 量规判分、consolidate 的问题从未发出），2026-09-30 修复。
    const index = slotIndexOverride ?? slotIndex;
    const currentSlot = slotOverride ?? INTERVIEW_LADDER[Math.min(index, INTERVIEW_LADDER.length - 1)];
    if (!ladderDone) {
      try {
        const raw = await chatOnce({
          messages: interviewChatMessages({
            thread: threadOverride ?? thread,
            slot: { ...currentSlot, index, intent: currentSlot.rubric },
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

  // 打分轨：不阻塞 UI、不设 loading。失败时把本地启发式分垫底记进证据
  // （否则离线/断网时对话通道静默归零，六维里对话证据全部缺失——注释曾
  // 承诺过垫底但实现只更新了 UI 芯片，2026-09-30 补上）。recordCredit 的
  // 取高规则保证后续追问的权威分只会向上覆盖。
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
        else recordCredit(slotObj, heuristicSlotCredit(slotObj.id, userAnswer), "");
      })
      .catch(() => {
        // 打分轨不可用：启发式保守分垫底，对话通道不再无证据。
        recordCredit(slotObj, heuristicSlotCredit(slotObj.id, userAnswer), "");
      });
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
        const nextIndex = slotIndex + 1;
        setSlotIndex(nextIndex);
        setFollowUsed(0);
        if (isLastSlot) {
          await beginClosing(nextCount);
          gradeAnswerInBackground({ slot: currentSlot, userAnswer: content, priorAnswer: probing?.answer ?? "" });
          return;
        }
        // 下一问必须按 nextIndex 的槽位生成（见 requestInterviewer 的槽位说明）。
        asked = await requestInterviewer({
          threadOverride: threadWithAnswer,
          slotOverride: INTERVIEW_LADDER[Math.min(nextIndex, INTERVIEW_LADDER.length - 1)],
          slotIndexOverride: nextIndex,
        });
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
    onComplete();
  };


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
        <textarea
          rows={1}
          ref={autoResizeRef(96)}
          disabled={judging || interviewerBusy || clock.remainingMs <= 0}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onEnterSubmit(send, { when: () => !judging && !interviewerBusy })}
          placeholder={interviewerBusy ? "苏记者正在说话…" : judging ? "苏记者正在斟酌…" : "写下你的回答，Enter 发送 · Shift+Enter 换行…"}
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
