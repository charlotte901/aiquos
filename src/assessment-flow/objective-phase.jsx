// 客观题 CAT 阶段（时间预算 + 信息量选题）。2026-11 自 AssessmentFlow.jsx 机械拆出。
import { Check, CircleNotch, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { answerCredit } from "../assessment-attempt";
import { PHASE_SECONDS, usePhaseClock } from "../assessment-timing";
import { abilityStandardError, shouldStopCat } from "../comprehensive-adaptive";
import { COMPREHENSIVE_LEVELS, COMPREHENSIVE_TYPE_LABELS, getComprehensiveLevel, getReaction, judgeComprehensiveAnswer } from "../comprehensive-quiz";
import {  } from "../interviewer";
import { DIMENSION_KEYS, pick, PhaseTimer, TaskAction, StageComplete, useStorySequencer } from "./flow-shared";

export function AdaptiveObjectivePhase({
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
  adaptivePrior = null,
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
      phase,
      // The summary view has no single right/wrong answer to celebrate, and
      // it must not keep showing the previous question's verdict either.
      result: phase === "summary" ? null : result,
      reaction: phase === "summary"
        ? `本轮共作答 ${evidenceMirror.length} 题。题目难度一路跟着你的表现调整；成绩会在全部阶段结束后统一给出。`
        : reaction || null,
      speakerName: guardian,
    });
  }, [phase, result, reaction, guardian, onCharacterFeedback]);

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
    // 定档先验计入信息量：与服务端路由同一口径，否则 SE 永远偏高，
    // 「精度达标提前结束」在定档模式下不会触发（服务端 session 的镜像）。
    standardError: abilityStandardError({ evidence: evidenceMirror, prior: adaptivePrior }),
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
      onContinue={onComplete}
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
          {question.analysis?.trim() && <p className="quiz-feedback-analysis"><b>解析</b>{question.analysis}</p>}
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
