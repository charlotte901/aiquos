import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { calculateQuestionCredit } from "../skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const QUESTIONS_PER_STAGE = 5;
const TYPE_LABELS = {
  single: "单选题",
  multi: "多选题",
  judge: "判断题",
};

function stagePaperQuestions(questions, attempt, stage) {
  if (!Array.isArray(questions) || attempt?.assessmentType !== "objective") return [];
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const offset = (stage - 1) * QUESTIONS_PER_STAGE;
  const stageIds = attempt.questionIds?.slice(offset, offset + QUESTIONS_PER_STAGE) ?? [];
  if (stageIds.length !== QUESTIONS_PER_STAGE) return [];
  const mapped = stageIds.map((id) => questionsById.get(id));
  return mapped.every(Boolean) ? mapped : [];
}

function feedbackFor(question, selectedKeys) {
  const credit = calculateQuestionCredit(question, selectedKeys);
  return {
    credit,
    correct: credit === 1,
    partialCorrect: credit > 0 && credit < 1,
    answerText: question.answer
      .map((key) => {
        const option = question.options.find((item) => item.key === key);
        return `${key}.${option?.text ?? ""}`;
      })
      .join("; "),
  };
}

function resumeState(attempt, stage, stageQuestions) {
  const matchesStage = attempt?.assessmentType === "objective" && attempt.currentStage === stage;
  const questionIndex = matchesStage
    && Number.isInteger(attempt.currentQuestionIndex)
    && attempt.currentQuestionIndex >= 0
    && attempt.currentQuestionIndex < QUESTIONS_PER_STAGE
    ? attempt.currentQuestionIndex
    : 0;
  const question = stageQuestions[questionIndex];
  const savedResponse = question
    ? attempt?.responses?.find((response) => response.questionId === question.id)
    : null;
  const locationKeys = matchesStage && Array.isArray(attempt.location?.selectedKeys)
    ? attempt.location.selectedKeys
    : [];
  const selectedKeys = locationKeys.length > 0
    ? [...locationKeys]
    : [...(savedResponse?.selectedKeys ?? [])];
  const submitted = Boolean(savedResponse) || Boolean(matchesStage && attempt.location?.feedback);

  return {
    questionIndex,
    selectedKeys,
    feedback: submitted && question ? feedbackFor(question, selectedKeys) : null,
  };
}

export function ObjectiveQuizTask({ stage, questions, attempt, onAnswer, onProgress, onComplete }) {
  const stageQuestions = useMemo(
    () => stagePaperQuestions(questions, attempt, stage),
    [attempt, questions, stage],
  );
  const initial = useRef(null);
  if (initial.current === null) initial.current = resumeState(attempt, stage, stageQuestions);
  const [questionIndex, setQuestionIndex] = useState(initial.current.questionIndex);
  const [selectedKeys, setSelectedKeys] = useState(initial.current.selectedKeys);
  const [feedback, setFeedback] = useState(initial.current.feedback);
  const submitted = useRef(Boolean(initial.current.feedback));
  const question = stageQuestions[questionIndex];

  useEffect(() => {
    if (!question) return;
    const alreadyAtQuestion = attempt?.assessmentType === "objective"
      && attempt.currentStage === stage
      && attempt.currentQuestionIndex === questionIndex
      && attempt.location?.currentQuestionId === question.id;
    if (alreadyAtQuestion) return;
    onProgress?.({
      question,
      selectedKeys,
      feedback,
      stage,
      questionIndex,
    });
  }, [attempt, feedback, onProgress, question, questionIndex, selectedKeys, stage]);

  if (stageQuestions.length !== QUESTIONS_PER_STAGE || !question) {
    return (
      <div className="task-body objective-task">
        <p className="agent-error" role="alert">当前关卡的五道客观题不可用，请返回关卡地图后重试。</p>
      </div>
    );
  }

  const answer = (keys) => {
    if (submitted.current) return;
    submitted.current = true;
    const uniqueKeys = [...new Set(keys)];
    const nextFeedback = feedbackFor(question, uniqueKeys);
    setSelectedKeys(uniqueKeys);
    setFeedback(nextFeedback);
    onAnswer({
      question,
      selectedKeys: uniqueKeys,
      stage,
      questionIndex,
    });
  };

  const toggleMulti = (key) => {
    if (submitted.current) return;
    const nextKeys = selectedKeys.includes(key)
      ? selectedKeys.filter((item) => item !== key)
      : [...selectedKeys, key];
    setSelectedKeys(nextKeys);
    onProgress?.({ question, selectedKeys: nextKeys, feedback: null, stage, questionIndex });
  };

  const continueQuiz = () => {
    if (!feedback) return;
    if (questionIndex === QUESTIONS_PER_STAGE - 1) {
      onComplete();
      return;
    }
    submitted.current = false;
    setQuestionIndex((current) => current + 1);
    setSelectedKeys([]);
    setFeedback(null);
  };

  const isMulti = question.type === "multi";
  const canSubmit = isMulti && selectedKeys.length > 0 && !feedback;

  return (
    <div className="task-body objective-task comprehensive-task">
      <h2>{question.q}</h2>
      <p className="quiz-brief">
        第 {questionIndex + 1} / 5 题
        <i aria-hidden="true">•</i>
        {TYPE_LABELS[question.type]}
      </p>
      <div className="answer-options" role={isMulti ? "group" : "radiogroup"} aria-label={TYPE_LABELS[question.type]}>
        {question.options.map((option) => {
          const isSelected = selectedKeys.includes(option.key);
          const state = !feedback
            ? isSelected ? " is-selected" : ""
            : question.answer.includes(option.key)
              ? " is-correct"
              : isSelected ? " is-wrong" : "";
          return (
            <button
              key={option.key}
              type="button"
              role={isMulti ? "checkbox" : "radio"}
              aria-checked={isSelected}
              disabled={Boolean(feedback)}
              className={`comprehensive-option${state}`}
              onClick={() => isMulti ? toggleMulti(option.key) : answer([option.key])}
            >
              <span>{option.key}</span>
              {option.text}
              {(isSelected || (feedback && question.answer.includes(option.key))) && <Check weight="bold" />}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className={`quiz-feedback is-${feedback.correct ? "correct" : feedback.partialCorrect ? "partial" : "wrong"}`} role="status">
          <strong>{feedback.correct ? "回答正确" : feedback.partialCorrect ? "部分正确" : "回答不正确"}</strong>
          <p className="quiz-feedback-answer"><b>正确答案：</b>{feedback.answerText}</p>
          <p className="quiz-feedback-analysis"><b>解析：</b>{question.analysis}</p>
          <div>{question.dims.map((dimension) => <span key={dimension}>{dimension}</span>)}</div>
        </div>
      )}

      <div className="comprehensive-actions">
        {isMulti && !feedback && (
          <button type="button" className="task-action comprehensive" disabled={!canSubmit} onClick={() => answer(selectedKeys)}>
            提交答案<ArrowRight weight="bold" />
          </button>
        )}
        {feedback && (
          <button type="button" className="task-action comprehensive" onClick={continueQuiz}>
            {questionIndex === QUESTIONS_PER_STAGE - 1 ? "完成本关" : "继续"}<ArrowRight weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
