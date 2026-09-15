import {
  checkDraftCompatibility,
  createAttempt,
  finalizeDraft,
  freezeAssessmentHistory,
  putDraft,
  recordAttemptResponse,
  selectAttemptQuestion,
  updateAttemptLocation,
} from "./assessment-attempt.js";
import { loadAssessmentState, saveAssessmentState } from "./assessment-storage.js";
import { createAdaptiveController } from "./comprehensive-adaptive.js";
import { getComprehensiveLevel, judgeComprehensiveAnswer } from "./comprehensive-quiz.js";
import { createObjectivePaper, createObjectiveSeed } from "./objective-paper.js";
import { objectiveFeedback } from "./objective-quiz-state.js";
import { QUESTION_BANK, QUESTION_BANK_VERSION } from "./question-bank.js";

const questionsById = new Map(QUESTION_BANK.map((question) => [question.id, question]));
const emptyLocation = { currentQuestionId: null, phase: null, lineIndex: 0, selectedKeys: [], feedback: null };

export function isScoredAssessment(type) {
  return type === "comprehensive" || type === "objective";
}

function requireDraft(state, type) {
  const draft = state.drafts[type];
  if (!isScoredAssessment(type) || !draft) throw new Error("没有可继续的测评草稿");
  return draft;
}

function questionOffset(stage, questionIndex) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5
    || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 4) {
    throw new Error("测评题目位置无效");
  }
  return (stage - 1) * 5 + questionIndex;
}

function blockedSession(reason) {
  return { compatible: false, reason, controller: null, paper: null };
}

export function restoreScoredDraft(draft, { rng } = {}) {
  if (!draft) return null;
  const compatibility = checkDraftCompatibility(draft, QUESTION_BANK, QUESTION_BANK_VERSION);
  if (!compatibility.compatible) return blockedSession(compatibility.reason);
  try {
    if (draft.assessmentType === "objective") {
      // Regeneration is a compatibility check only. The saved order remains authoritative.
      const paper = createObjectivePaper(QUESTION_BANK, { seed: draft.seed });
      if (paper.questionIds.some((id, index) => id !== draft.questionIds[index])) {
        return blockedSession("已保存的试卷顺序与随机种子不匹配，请确认重新开始客观测评。");
      }
      return { ...compatibility, controller: null, paper };
    }
    if (!draft.adaptiveSession) return blockedSession("综合测评的选题进度缺失，请确认重新开始。");
    const controller = createAdaptiveController(QUESTION_BANK, { initialSession: draft.adaptiveSession, rng });
    const usedIds = controller.snapshot().usedQuestionIds;
    if (usedIds.length !== draft.questionIds.length || usedIds.some((id, index) => id !== draft.questionIds[index])) {
      return blockedSession("综合测评的选题进度与已保存题目不一致，请确认重新开始。");
    }
    return { ...compatibility, controller, paper: null };
  } catch {
    return blockedSession("已保存的测评进度无法恢复，请确认重新开始本次测评。");
  }
}

export function loadScoredAssessments(storage) {
  const loaded = loadAssessmentState(storage);
  return {
    ...loaded,
    state: freezeAssessmentHistory(loaded.state),
    sessions: {
      comprehensive: restoreScoredDraft(loaded.state.drafts.comprehensive),
      objective: restoreScoredDraft(loaded.state.drafts.objective),
    },
  };
}

export function startScoredAssessment(state, type, { id, startedAt, seed, rng } = {}) {
  if (!isScoredAssessment(type)) throw new Error("未知的计分测评类型");
  const draft = state.drafts[type];
  if (draft) {
    const session = restoreScoredDraft(draft, { rng });
    return { state, session, blocked: session.reason };
  }
  const controller = type === "comprehensive" ? createAdaptiveController(QUESTION_BANK, { rng }) : null;
  const paper = type === "objective"
    ? createObjectivePaper(QUESTION_BANK, { seed: seed ?? createObjectiveSeed(globalThis.crypto) })
    : null;
  const attempt = createAttempt({
    id: id ?? globalThis.crypto.randomUUID(),
    assessmentType: type,
    startedAt: startedAt ?? new Date().toISOString(),
    seed: paper?.seed,
    questionIds: paper?.questionIds ?? [],
    adaptiveSession: controller?.snapshot(),
    location: { phase: type === "comprehensive" ? "opening" : "quiz" },
  });
  return { state: putDraft(state, attempt), session: { compatible: true, reason: null, controller, paper }, blocked: null };
}

// SiteExperience publishes to its live ref and React state before attempting I/O.
export function persistScoredState(storage, state, publish) {
  publish(state);
  return saveAssessmentState(storage, state);
}

export function selectComprehensiveQuestion(state, controller, { stage, questionIndex }) {
  const draft = requireDraft(state, "comprehensive");
  const offset = questionOffset(stage, questionIndex);
  const savedId = draft.questionIds[offset];
  if (savedId) return { state, question: questionsById.get(savedId) };
  if (offset !== draft.answeredCount || stage !== draft.currentStage) {
    throw new Error("请先回答当前题目并完成当前关卡");
  }
  const previousSession = controller.snapshot();
  const question = controller.select(getComprehensiveLevel(stage).id, stage);
  if (!question) {
    controller.restore(previousSession);
    throw new Error("当前关卡暂无可用题目");
  }
  const selected = selectAttemptQuestion(draft, question.id, {
    ...emptyLocation,
    phase: questionIndex === 0 ? "opening" : "quiz",
    // The stage's running feedback count is a presentation value, not score evidence.
    feedback: questionIndex > 0 ? { result: null, reaction: "", correctCount: draft.location.feedback?.correctCount ?? 0 } : null,
    stage,
    questionIndex,
  });
  selected.adaptiveSession = controller.snapshot();
  return { state: putDraft(state, selected), question };
}

export function submitScoredAnswer(state, type, payload, { controller, answeredAt = new Date().toISOString() } = {}) {
  const draft = requireDraft(state, type);
  const question = questionsById.get(payload.question?.id);
  const offset = questionOffset(payload.stage, payload.questionIndex);
  if (!question || draft.questionIds[offset] !== question.id) throw new Error("提交题目不在已保存的位置");
  if (draft.responses.some((response) => response.questionId === question.id)) return state;
  if (draft.location.currentQuestionId !== question.id || draft.currentStage !== payload.stage
    || draft.currentQuestionIndex !== payload.questionIndex || offset !== draft.answeredCount) {
    throw new Error("请回答当前已保存的题目");
  }
  const previousSession = controller?.snapshot();
  try {
    let feedback;
    let adaptiveSession;
    if (type === "comprehensive") {
      // Adaptive routing uses its existing outcome contract independently of scoring credit.
      const result = judgeComprehensiveAnswer(question, payload.selectedKeys);
      controller.record(result.correct ? "correct" : result.partialCorrect ? "partial" : "wrong");
      adaptiveSession = controller.snapshot();
      feedback = {
        result,
        reaction: payload.feedback?.reaction ?? "",
        correctCount: (draft.location.feedback?.correctCount ?? 0) + (result.correct ? 1 : 0),
      };
    } else {
      feedback = objectiveFeedback(question, payload.selectedKeys);
    }
    const answered = recordAttemptResponse(draft, {
      ...payload, question, answeredAt, adaptiveSession, feedback, phase: "feedback",
    });
    return putDraft(state, answered);
  } catch (error) {
    if (previousSession) controller.restore(previousSession);
    throw error;
  }
}

export function updateScoredProgress(state, type, payload) {
  const draft = requireDraft(state, type);
  const offset = questionOffset(payload.stage, payload.questionIndex);
  // Reviewing a completed stage must not replace the unfinished stage's resume cursor.
  if (payload.stage < draft.currentStage) return state;
  if (payload.stage !== draft.currentStage || offset > draft.answeredCount) throw new Error("请先回答当前题目");
  const questionId = draft.questionIds[offset] ?? null;
  if (payload.question && payload.question.id !== questionId) throw new Error("题目与保存的试卷不匹配");
  const location = { ...payload };
  if (questionId) location.currentQuestionId = questionId;
  const updated = updateAttemptLocation(draft, location);
  updated.currentQuestionIndex = payload.questionIndex;
  if (JSON.stringify(updated) === JSON.stringify(draft)) return state;
  return putDraft(state, updated);
}

export function scoredAssessmentProgress(state, type) {
  return state.drafts[type]?.currentStage ?? (state.history.some((attempt) => attempt.assessmentType === type) ? 5 : 1);
}

export function completeScoredStage(state, type, stage, completedAt = new Date().toISOString()) {
  const draft = requireDraft(state, type);
  questionOffset(stage, 0);
  if (stage < draft.currentStage) return { state, stage: draft.currentStage, completed: false };
  const stageIds = draft.questionIds.slice((stage - 1) * 5, stage * 5);
  if (stage !== draft.currentStage || stageIds.length !== 5
    || stageIds.some((id) => !draft.responses.some((response) => response.questionId === id))) {
    throw new Error("请先完成本关的 5 道题目");
  }
  if (stage === 5) {
    return { state: finalizeDraft(state, type, completedAt), stage: 5, completed: true };
  }
  const next = updateAttemptLocation(draft, { ...emptyLocation, phase: type === "comprehensive" ? "opening" : "quiz" });
  next.currentStage = stage + 1;
  next.currentQuestionIndex = 0;
  return { state: putDraft(state, next), stage: stage + 1, completed: false };
}
