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
} from "@phosphor-icons/react";
import { TestWordmark } from "./TestWordmark";
import {
  COMPREHENSIVE_LEVELS,
  COMPREHENSIVE_QUESTION_COUNT,
  COMPREHENSIVE_TYPE_LABELS,
  getComprehensiveLevel,
  getReaction,
  judgeComprehensiveAnswer,
} from "./comprehensive-quiz";
import {
  ASSESSMENT_THEMES,
  CONVERSATIONS,
  getStageMode,
  STAGE_LABELS,
} from "./assessment-flow";
import { generateArkImage, streamDeepSeek } from "./deepseek";
import { MarkdownLite } from "./markdown-lite";
import { DIMENSIONS as SCORING_DIMENSIONS } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const GUIDES = "/assets/crops/assessment-guides-crop.png";

function Progress({ current, complete, onPick, disabled = false }) {
  return (
    <div className="level-progress" aria-label={`第 ${current} 关，共 5 关`}>
      <div className="level-nodes">
        {[1, 2, 3, 4, 5].map((number) => {
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
      <span>{current} / 5</span>
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

export function AssessmentMap({ id, current, complete, onBack, onOpenStage, busy, resume = null }) {
  const theme = ASSESSMENT_THEMES[id];
  const stageLabels = id === "comprehensive"
    ? COMPREHENSIVE_LEVELS.map((level) => level.short)
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
      <Progress current={current} complete={complete} onPick={onOpenStage} disabled={busy} />
      <section className="level-map" aria-label={`${theme.title}关卡地图`}>
        <p className="map-kicker">{theme.title}</p>
        <h2>从这一关开始</h2>
        <p>{theme.description}</p>
        {resume && (
          <div className="map-resume" role="status">
            <div>
              <strong>检测到未完成的综合测评</strong>
              <p>已答 {resume.answered} / {resume.total} 题{resumeLabel ? ` · 开始于 ${resumeLabel}` : ""}，答题记录保存在本机，可随时继续。</p>
            </div>
            <div className="map-resume-actions">
              <button type="button" onClick={() => onOpenStage?.(current)}>继续测评</button>
              <button type="button" className="is-ghost" onClick={resume.onRestart}>重新开始</button>
            </div>
          </div>
        )}
        <div className="map-path" role="list" aria-label="五个闯关节点">
          {[1, 2, 3, 4, 5].map((number) => {
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

function TaskHeader({ id, stage }) {
  const theme = ASSESSMENT_THEMES[id];
  const mode = id === "comprehensive" ? "comprehensive" : getStageMode(id, stage);
  const icons = { objective: Target, conversation: ChatCircleDots, practical: ListChecks, comprehensive: ListChecks };
  const Icon = icons[mode];
  const names = { objective: "判断题", conversation: "对话练习", practical: "Agent 实操", comprehensive: "综合测评" };
  return <div className="task-heading"><Icon weight="fill" /><span>{`${theme.title} · 第 ${stage} 关`}</span><strong>{names[mode]}</strong></div>;
}

function getStorySpeaker(level, who) {
  return who === "guardian" ? level.guardian : who === "xiao" ? "AI 导师 · 小源" : "你";
}

function TaskStoryDialogue({ level, phase, lines, lineIndex, onAdvance, onSkip }) {
  const line = lines[lineIndex];
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
          <span>{getStorySpeaker(level, line.who)}</span>
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

function ObjectiveTask({ stage, onComplete }) {
  const taskRef = useRef(null);
  const level = getComprehensiveLevel(stage);
  const [questions, setQuestions] = useState([]);
  const [questionStatus, setQuestionStatus] = useState("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [phase, setPhase] = useState("opening");
  const [lineIndex, setLineIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const levelId = getComprehensiveLevel(stage).id;
  const question = questions[questionIndex];
  const storyLines = phase === "ending" ? level.ending : level.opening;

  const advanceStory = () => {
    if (lineIndex < storyLines.length - 1) {
      setLineIndex((current) => current + 1);
      return;
    }
    if (phase === "opening") {
      setPhase("quiz");
      return;
    }
    onComplete();
  };

  useEffect(() => {
    let active = true;
    setQuestionStatus("loading");
    fetch(`/api/objective-questions?levelId=${encodeURIComponent(levelId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("题目加载失败。");
        const payload = await response.json();
        if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
          throw new Error("题目数据不完整。");
        }
        if (!active) return;
        setQuestions(payload.questions);
        setQuestionStatus("ready");
      })
      .catch(() => {
        if (active) setQuestionStatus("error");
      });
    return () => {
      active = false;
    };
  }, [levelId, reloadToken]);

  const answer = (keys) => {
    if (result || !question) return;
    setResult(judgeComprehensiveAnswer(question, [...new Set(keys)]));
  };

  const nextQuestion = () => {
    if (questionIndex === questions.length - 1) {
      setPhase("ending");
      setLineIndex(0);
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelected([]);
    setResult(null);
  };

  const toggleMulti = (key) => {
    if (result) return;
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

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

  if (!question) {
    return <div className="task-body objective-task">
      <div className="agent-empty quiz-loading">
        {questionStatus === "error" ? (
          <>
            <span>题目加载失败。</span>
            <button className="source-toggle" type="button" onClick={() => setReloadToken((current) => current + 1)}>重新加载</button>
          </>
        ) : (
          <>
            <CircleNotch className="reply-spinner" weight="bold" />
            <span>正在准备题目…</span>
          </>
        )}
      </div>
    </div>;
  }

  const isMulti = question.type === "multi";
  const isSelected = (key) => selected.includes(key);
  const optionState = (key) => {
    if (!result) return isSelected(key) ? " is-selected" : "";
    return question.answer.includes(key)
      ? " is-correct"
      : isSelected(key) ? " is-wrong" : "";
  };

  return (
    <div ref={taskRef} className="task-body objective-task comprehensive-task" data-phase={phase}>
      {phase !== "quiz" && (
        <TaskStoryDialogue
          level={level}
          phase={phase}
          lines={storyLines}
          lineIndex={lineIndex}
          onAdvance={advanceStory}
          onSkip={() => setLineIndex(storyLines.length - 1)}
        />
      )}

      <h2>{question.q}</h2>
      <p className="quiz-brief">
        第 {questionIndex + 1} / {questions.length} 题
        <i aria-hidden="true">•</i>
        {question.dims.join(" · ")}
      </p>
      <div className="answer-options" role={isMulti ? "group" : "radiogroup"} aria-label="答案选项">
        {question.options.map((option) => (
          <button
            key={option.key}
            type="button"
            role={isMulti ? "checkbox" : "radio"}
            aria-checked={isSelected(option.key)}
            disabled={Boolean(result)}
            className={`comprehensive-option${optionState(option.key)}`}
            onClick={() => isMulti ? toggleMulti(option.key) : answer([option.key])}
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

      <div className="comprehensive-actions">
        {isMulti && !result
          ? <TaskAction disabled={selected.length === 0} onClick={() => answer(selected)} label="提交答案" variant="comprehensive" />
          : result ? <TaskAction onClick={nextQuestion} label={questionIndex === questions.length - 1 ? "完成本关" : "继续"} variant="comprehensive" /> : null}
      </div>
    </div>
  );
}

function ConversationTask({ stage, onComplete }) {
  const [draft, setDraft] = useState("");
  const threadNode = useRef(null);
  // Only auto-follow while the reader is already at the bottom, so looking
  // back through earlier replies is never fought by the stream.
  const follow = useRef(true);
  const [thread, setThread] = useState([
    { role: "assistant", content: "先说说你希望最终结果解决什么问题。" },
    { role: "user", content: "我希望目标更具体，也方便直接执行。", sample: true },
    { role: "assistant", content: CONVERSATIONS[stage - 1] },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  // Reasoning models think in silence before the first content token; label
  // that gap so the wait never reads as a stuck request.
  const [isThinking, setIsThinking] = useState(false);
  const thinkingTimer = useRef(null);
  useEffect(() => () => clearTimeout(thinkingTimer.current), []);
  const beginThinkingLabel = () => {
    clearTimeout(thinkingTimer.current);
    thinkingTimer.current = setTimeout(() => setIsThinking(true), 2500);
  };
  const endThinkingLabel = () => {
    clearTimeout(thinkingTimer.current);
    setIsThinking(false);
  };
  useEffect(() => {
    const node = threadNode.current;
    if (node && follow.current) node.scrollTop = node.scrollHeight;
  }, [thread]);
  const send = async () => {
    if (isReady) {
      onComplete();
      return;
    }
    const content = draft.trim();
    if (!content || isSending) return;
    const nextThread = [...thread, { role: "user", content }, { role: "assistant", content: "", pending: true, streaming: true }];
    setThread(nextThread);
    setDraft("");
    setError("");
    setIsSending(true);
    beginThinkingLabel();
    try {
      await streamDeepSeek({
        messages: [
          { role: "system", content: "你是 AIQUOS 的测评向导。请用中文简洁回应用户，帮助其把 AI 协作需求说得更具体；指出一个做得好的点和一个可执行的改进建议。不要替用户直接完成测评任务。" },
          ...nextThread.filter((item) => !item.sample && !item.pending).map(({ role, content: message }) => ({ role, content: message })),
        ],
        onDelta: (message) => {
          endThinkingLabel();
          setThread((items) => items.map((item, index) => index === items.length - 1 ? { role: "assistant", content: message, streaming: true } : item));
        },
      });
      endThinkingLabel();
      setThread((items) => items.map((item, index) => index === items.length - 1 ? { role: "assistant", content: item.content, streaming: false } : item));
      setIsReady(true);
    } catch (requestError) {
      setThread((items) => items.slice(0, -1));
      setError(requestError.message || "发送失败，请重试。");
    } finally {
      setIsSending(false);
    }
  };
  return <div className="task-body conversation-task">
    <h2>和 AI 向导一起想清楚</h2>
    <div
      ref={threadNode}
      className="chat-thread"
      aria-live="polite"
      onScroll={(event) => {
        const node = event.currentTarget;
        follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
      }}
    >
      {thread.map((item, index) => <div key={`${item.role}-${index}`} className={`chat-bubble ${item.role === "user" ? "is-user" : "is-guide"}${item.streaming ? " is-streaming" : ""}${item.role === "assistant" && !item.pending && isReady && index === thread.length - 1 ? " is-feedback" : ""}`}><span>{item.role === "user" ? "我" : "AI"}</span><p>{item.pending ? <span className="thinking-hint"><CircleNotch className="reply-spinner" weight="bold" />{isThinking ? "正在思考…" : ""}</span> : <MarkdownLite text={item.content} />}</p></div>)}
    </div>
    {error && <p className="agent-error" role="alert">{error}</p>}
    {isReady && <div className="conversation-done">
      <span>本轮反馈已完成</span>
      <TaskAction onClick={onComplete} label="完成本关" />
    </div>}
    <label className="task-composer"><span className="sr-only">输入你的回应</span><input disabled={isSending || isReady} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && send()} placeholder={isReady ? "本关已完成，点击「完成本关」继续" : "写下你的回应…"} /><button type="button" disabled={isSending} onClick={send} aria-label={isReady ? "进入下一关" : "发送回应"}>{isSending ? <CircleNotch className="reply-spinner" weight="bold" /> : isReady ? <ArrowRight weight="bold" /> : <PaperPlaneTilt weight="fill" />}</button></label>
  </div>;
}

function PracticalTask({ stage, onComplete }) {
  const level = getComprehensiveLevel(stage);
  const [tasks, setTasks] = useState([]);
  const [taskStatus, setTaskStatus] = useState("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [draft, setDraft] = useState("");
  const [showSource, setShowSource] = useState(false);
  const [output, setOutput] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("opening");
  const [lineIndex, setLineIndex] = useState(0);
  const levelId = getComprehensiveLevel(stage).id;
  const task = tasks[0];
  const storyLines = phase === "ending" ? level.ending : level.opening;

  const advanceStory = () => {
    if (lineIndex < storyLines.length - 1) {
      setLineIndex((current) => current + 1);
      return;
    }
    if (phase === "opening") {
      setPhase("quiz");
      return;
    }
    onComplete();
  };

  useEffect(() => {
    let active = true;
    setTaskStatus("loading");
    fetch(`/api/practical-tasks?levelId=${encodeURIComponent(levelId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("任务加载失败。");
        const payload = await response.json();
        if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
          throw new Error("任务数据不完整。");
        }
        if (!active) return;
        setTasks(payload.tasks);
        setTaskStatus("ready");
      })
      .catch(() => {
        if (active) setTaskStatus("error");
      });
    return () => {
      active = false;
    };
  }, [levelId, reloadToken]);

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
  const run = async () => {
    if (output || imageUrl) {
      setPhase("ending");
      setLineIndex(0);
      return;
    }
    const prompt = draft.trim();
    if (!prompt || isRunning) return;
    setError("");
    setOutput("");
    setImageUrl("");
    setIsRunning(true);
    try {
      if (isImageTask) {
        setImageUrl(await generateArkImage({ prompt: `${task.title}\n${task.goal}\n任务要求：${task.requirements.join("；")}\n活动素材：${task.source}\n用户补充：${prompt}` }));
        return;
      }
      await streamDeepSeek({
        messages: [
          { role: "system", content: "你是 AIQUOS 实操测评的执行 Agent。请严格根据用户提示词和原始素材完成任务；保留关键数据，不补充素材中没有的信息。输出仅包含最终交付内容，不解释你的推理。" },
          { role: "user", content: `任务：${task.title}\n目标：${task.goal}\n要求：\n${task.requirements.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n原始素材：\n${task.source}\n\n用户提示词：\n${prompt}` },
        ],
        onDelta: setOutput,
      });
    } catch (requestError) {
      setError(requestError.message || "运行失败，请重试。");
    } finally {
      setIsRunning(false);
    }
  };
  return <div className="task-body practical-task" data-phase={phase}>
    {phase !== "quiz" && (
      <TaskStoryDialogue
        level={level}
        phase={phase}
        lines={storyLines}
        lineIndex={lineIndex}
        onAdvance={advanceStory}
        onSkip={() => setLineIndex(storyLines.length - 1)}
      />
    )}
    <h2>{task.title}</h2>
    <p className="agent-brief">{task.goal}</p>
    <div className="agent-workspace">
      <section className="agent-checklist" aria-label="任务要求">
        <div className="agent-section-heading"><ClipboardText weight="fill" /><span>交付标准</span></div>
        <ul>{task.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
        <button className="source-toggle" type="button" onClick={() => setShowSource((value) => !value)}>{showSource ? "收起原始素材" : "查看原始素材"}</button>
        {showSource && <p className="source-copy">{task.source}</p>}
      </section>
      <section className="agent-canvas" aria-live="polite" aria-label="Agent 工作区域">
        <div className="agent-section-heading"><Sparkle weight="fill" /><span>AI 输出</span></div>
        {isRunning && !output && !imageUrl ? <div className="agent-empty"><CircleNotch className="reply-spinner" weight="bold" /><span>{isImageTask ? "正在生成主视觉…" : "正在整理材料…"}</span></div> : imageUrl ? <img className="agent-image" src={imageUrl} alt={`${task.title}生成结果`} /> : output ? <div className="agent-output"><MarkdownLite text={output} /></div> : <div className="agent-empty"><Sparkle weight="fill" /><span>写好提示词后，Agent 将在这里完成交付。</span></div>}
      </section>
    </div>
    {error && <p className="agent-error" role="alert">{error}</p>}
    <label className="agent-composer"><span className="sr-only">给 Agent 的提示词</span><textarea disabled={isRunning || Boolean(output) || Boolean(imageUrl)} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={output || imageUrl ? "任务已完成，点击箭头进入下一关" : isImageTask ? "写下画面提示词，让 Agent 生成主视觉…" : "写下你的提示词，让 Agent 开始执行…"} /><button type="button" className="agent-send" disabled={isRunning || (!draft.trim() && !output && !imageUrl)} onClick={run} aria-label={output || imageUrl ? "进入下一关" : isImageTask ? "生成图片" : "运行 Agent"}>{isRunning ? <CircleNotch className="reply-spinner" weight="bold" /> : output || imageUrl ? <ArrowRight weight="bold" /> : <PaperPlaneTilt weight="fill" />}</button></label>
  </div>;
}

function TaskAction({ disabled, onClick, label, variant = "" }) {
  return <button type="button" className={`task-action ${variant}`.trim()} disabled={disabled} onClick={onClick}>{label}<ArrowRight weight="bold" /></button>;
}

function LiveDimensionStrip({ result }) {
  // While the attempt is in progress only per-dimension estimates with
  // evidence are shown — no overall score or grade (integration guide).
  const dimensions = result?.dimensions ?? SCORING_DIMENSIONS;
  const answered = result?.answeredCount ?? 0;
  const total = result?.totalQuestions ?? COMPREHENSIVE_QUESTION_COUNT;
  const complete = result?.status === "completed";
  const missingDims = complete || !result
    ? []
    : dimensions.filter((dimension) => (dimension.evidenceCount ?? 0) === 0);
  return (
    <aside className="live-dimension-strip" aria-label="六维实时画像">
      <div className="live-dimension-head">
        <span>六维实时画像</span>
        <strong>{`已答 ${answered} / ${total}`}</strong>
      </div>
      <ul>
        {dimensions.map((dimension) => (
          <li
            key={dimension.key}
            className={dimension.score === null || dimension.score === undefined ? "is-pending" : ""}
          >
            <span title={dimension.name}>{dimension.short}</span>
            <div
              className="live-dimension-track"
              role="img"
              aria-label={`${dimension.name}${dimension.score === null || dimension.score === undefined ? "，待测评" : ` ${dimension.score} 分`}`}
            >
              <i style={{ width: `${dimension.score ?? 0}%` }} />
            </div>
            <b aria-hidden="true">{dimension.score ?? "—"}</b>
          </li>
        ))}
      </ul>
      {!complete && (
        <p className="live-dimension-note">
          {missingDims.length > 0 && total - answered <= missingDims.length
            ? `注意：剩余 ${total - answered} 题需覆盖 ${missingDims.map((dimension) => dimension.short).join("、")}，否则无法生成总分`
            : "已完成题目的维度实时估计；完成全部题目后生成总分与等级"}
        </p>
      )}
    </aside>
  );
}

function ComprehensiveTask({
  stage,
  onComplete,
  onFetchComprehensiveQuestion,
  onAnswerComprehensive,
  comprehensiveResult,
  adaptiveTelemetry = null,
}) {
  const level = getComprehensiveLevel(stage);
  const [question, setQuestion] = useState(null);
  const [questionStatus, setQuestionStatus] = useState("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [reaction, setReaction] = useState("");
  const [correctCount, setCorrectCount] = useState(0);
  const [phase, setPhase] = useState("opening");
  const [lineIndex, setLineIndex] = useState(0);
  const taskRef = useRef(null);

  const isLastQuestion = questionIndex === COMPREHENSIVE_QUESTION_COUNT - 1;
  const storyLines = phase === "ending"
    ? level.ending.map((line) => ({
      ...line,
      text: line.text.replace("[X]", String(Math.max(1, correctCount))),
    }))
    : level.opening;
  const storyLine = storyLines[lineIndex];

  const advanceStory = () => {
    if (lineIndex < storyLines.length - 1) {
      setLineIndex((current) => current + 1);
      return;
    }
    if (phase === "opening") {
      setPhase("quiz");
    } else {
      onComplete();
    }
  };

  const answer = (keys) => {
    if (result) return;
    const selectedKeys = [...new Set(keys)];
    const answerResult = judgeComprehensiveAnswer(question, selectedKeys);
    setResult(answerResult);
    setReaction(getReaction(level, answerResult.correct));
    if (answerResult.correct) setCorrectCount((current) => current + 1);
    const outcome = answerResult.correct
      ? "correct"
      : answerResult.partialCorrect
        ? "partial"
        : "wrong";
    onAnswerComprehensive?.(question, selectedKeys, outcome);
  };

  const nextQuestion = async () => {
    if (isLastQuestion) {
      setPhase("ending");
      setLineIndex(0);
      return;
    }
    if (advancing) return;
    setAdvancing(true);
    setQuestionStatus("loading");
    try {
      const data = await onFetchComprehensiveQuestion(level.id, stage);
      setQuestion(data.question);
      setQuestionIndex((current) => current + 1);
      setSelected([]);
      setResult(null);
      setReaction("");
      setQuestionStatus("ready");
    } catch {
      setQuestionStatus("error");
    } finally {
      setAdvancing(false);
    }
  };

  const speakerName = (who) => (who === "guardian" ? level.guardian : who === "xiao" ? "AI 导师 · 小源" : "你");
  const isMulti = question?.type === "multi";
  const canSubmit = isMulti && selected.length > 0 && !result;

  const inflightQuestion = useRef(null);
  useEffect(() => {
    // One request per stage entry (or manual retry): the backend owns routing,
    // so a duplicate call would consume a question from the run's budget. The
    // in-flight promise is shared across StrictMode's setup→cleanup→setup
    // cycle: the second setup reuses the first one's request instead of
    // issuing another, and applies it under its own active flag.
    const key = `${level.id}:${stage}:${reloadToken}`;
    let active = true;
    setQuestionStatus("loading");
    if (!inflightQuestion.current || inflightQuestion.current.key !== key) {
      inflightQuestion.current = {
        key,
        promise: onFetchComprehensiveQuestion(level.id, stage).catch((error) => {
          // A failed request must not be reused by the retry-less re-run.
          if (inflightQuestion.current?.key === key) inflightQuestion.current = null;
          throw error;
        }),
      };
    }
    inflightQuestion.current.promise
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
  }, [level.id, stage, reloadToken, onFetchComprehensiveQuestion]);

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

  const toggleMulti = (key) => {
    if (result) return;
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  // Keyboard answering: 1-4 / A-D pick an option, Enter submits or continues.
  // Single/judge commit immediately on pick (pinned flow); multi just selects.
  useEffect(() => {
    if (phase !== "quiz" || !question) return undefined;
    const keyIndex = (key) => {
      const digits = { 1: 0, 2: 1, 3: 2, 4: 3 };
      const letters = { a: 0, b: 1, c: 2, d: 3 };
      return digits[key] ?? letters[key] ?? null;
    };
    const handleKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
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

  return (
    <div ref={taskRef} className="task-body comprehensive-task" data-phase={phase}>
      {(phase === "opening" || phase === "ending") && (
        <div
          className="comprehensive-dialogue-screen"
          role="button"
          tabIndex={0}
          aria-label={phase === "opening" ? "继续下一句对话" : "继续结尾对话"}
          onClick={advanceStory}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              advanceStory();
            }
          }}
        >
          <div className="story-line">
            <div className="story-eyebrow">
              <span>{speakerName(storyLine.who)}</span>
              <strong>{lineIndex + 1} / {storyLines.length}</strong>
            </div>
            <p>{storyLine.text}</p>
            <span className="story-hint">
              {phase === "ending" && lineIndex === storyLines.length - 1 ? "点击完成本关 ▾" : "点击继续 ▾"}
            </span>
            {lineIndex < storyLines.length - 1 && (
              <button
                type="button"
                className="story-skip"
                onClick={(event) => {
                  event.stopPropagation();
                  setLineIndex(storyLines.length - 1);
                }}
              >
                跳过对话
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "quiz" && questionStatus !== "ready" && (
        <div className="agent-empty quiz-loading">
          {questionStatus === "error" ? (
            <>
              <span>题目加载失败。</span>
              <button className="source-toggle" type="button" onClick={() => setReloadToken((current) => current + 1)}>重新加载</button>
            </>
          ) : (
            <>
              <CircleNotch className="reply-spinner" weight="bold" />
              <span>正在准备题目…</span>
            </>
          )}
        </div>
      )}

      {phase === "quiz" && questionStatus === "ready" && question && (
        <>
          <LiveDimensionStrip result={comprehensiveResult} />
          {adaptiveTelemetry && (
            <p className="adaptive-telemetry" aria-hidden="true">
              {`自适应路由 · 目标难度 ${adaptiveTelemetry.target >= 0 ? "+" : ""}${adaptiveTelemetry.target.toFixed(2)} · 题型连击 ${adaptiveTelemetry.typeStreak} · 证据 ${adaptiveTelemetry.evidenceCount}`}
            </p>
          )}
          <h2>{question.q}</h2>
          <p className="quiz-brief">
            第 {questionIndex + 1} / {COMPREHENSIVE_QUESTION_COUNT} 题
            <i aria-hidden="true">•</i>
            {level.dims}
            <i aria-hidden="true">•</i>
            {COMPREHENSIVE_TYPE_LABELS[question.type]}
            {isMulti ? "，选完点击提交，漏选可得部分分" : "，点击选项即提交"}
          </p>
          <div className="answer-options" role={isMulti ? "group" : "radiogroup"} aria-label={COMPREHENSIVE_TYPE_LABELS[question.type]}>
            {question.options.map((option) => {
              const isSelected = selected.includes(option.key);
              const state = !result
                ? isSelected ? " is-selected" : ""
                : question.answer.includes(option.key)
                  ? " is-correct"
                  : isSelected ? " is-wrong" : "";
              return (
                <button
                  key={option.key}
                  type="button"
                  role={isMulti ? "checkbox" : "radio"}
                  aria-checked={isMulti ? isSelected : isSelected}
                  disabled={Boolean(result)}
                  className={`comprehensive-option${state}`}
                  onClick={() => isMulti ? toggleMulti(option.key) : answer([option.key])}
                >
                  <span>{option.key}</span>
                  {option.text}
                  {(isSelected || (result && question.answer.includes(option.key))) && <Check weight="bold" />}
                </button>
              );
            })}
          </div>

          {result && (
            <div className={`quiz-feedback is-${result.correct ? "correct" : "wrong"}`} role="status">
              <strong>{result.correct ? "回答正确" : result.partialCorrect ? "部分正确" : "回答不正确"}</strong>
              <p className="quiz-feedback-answer"><b>正确答案：</b>{result.answerText}</p>
              <p className="quiz-feedback-analysis"><b>解析：</b>{question.analysis}</p>
              <div>
                {question.dims.map((dim) => <span key={dim}>{dim}</span>)}
              </div>
              {result.correct && <span className="star-pop" aria-hidden="true">★</span>}
            </div>
          )}

          {result && <div className="story-line is-inline"><p>{reaction}</p></div>}

          <div className="comprehensive-actions">
            {isMulti && !result
              ? <TaskAction disabled={!canSubmit} onClick={() => answer(selected)} label={selected.length ? `提交答案（已选 ${selected.length} 项）` : "提交答案"} variant="comprehensive" />
              : result ? <TaskAction disabled={advancing} onClick={nextQuestion} label={advancing ? "正在准备下一题…" : isLastQuestion ? "完成本关" : "继续"} variant="comprehensive" /> : null}
          </div>
        </>
      )}
    </div>
  );
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
  busy,
}) {
  const theme = ASSESSMENT_THEMES[id];
  const mode = getStageMode(id, stage);
  const taskKey = `${id}-${stage}-${mode}`;
  const props = { stage, onComplete: () => onComplete(stage) };
  const comprehensive = id === "comprehensive";
  const displayMode = comprehensive ? "comprehensive" : mode;
  return <main className="assessment-flow task-flow" data-mode={displayMode} style={{ "--assessment-color": theme.color, "--assessment-soft": theme.soft, "--assessment-glow": theme.glow, "--assessment-deep": theme.deep }}>
    <button className="flow-back" type="button" onClick={onBack} disabled={busy}><ArrowLeft weight="bold" /> 返回关卡地图</button>
    <h1 className="flow-wordmark" aria-label="TEST! 测评关卡"><TestWordmark /></h1>
    <Progress current={stage} complete={complete} onPick={onPick} disabled={busy} />
    <section className="task-panel" aria-label={`${theme.title}第 ${stage} 关`}>
      <Guides />
      <TaskHeader id={id} stage={stage} />
      {comprehensive
        ? <ComprehensiveTask
          key={`${taskKey}-comprehensive`}
          {...props}
          onFetchComprehensiveQuestion={onFetchComprehensiveQuestion}
          onAnswerComprehensive={onAnswerComprehensive}
          comprehensiveResult={comprehensiveResult}
          adaptiveTelemetry={adaptiveTelemetry}
        />
        : mode === "objective" ? <ObjectiveTask key={taskKey} {...props} /> : mode === "conversation" ? <ConversationTask key={taskKey} {...props} /> : <PracticalTask key={taskKey} {...props} />}
    </section>
  </main>;
}
