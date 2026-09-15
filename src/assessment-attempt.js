import {
  SCORING_VERSION,
  createResponseEvidence,
  scoreAssessment,
} from "../skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { QUESTION_BANK_VERSION } from "./question-bank.js";

const TOTAL_QUESTIONS = 25;
const ASSESSMENT_TYPES = new Set(["objective", "comprehensive"]);

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function freezeAssessmentHistory(state) {
  deepFreeze(state.history);
  return state;
}

function requireAssessmentType(type) {
  if (!ASSESSMENT_TYPES.has(type)) throw new Error("未知测评类型/unknown assessment type");
}

function emptyLocation() {
  return {
    currentQuestionId: null,
    phase: null,
    lineIndex: 0,
    selectedKeys: [],
    feedback: null,
  };
}

function normalizeLocation(location = {}) {
  return {
    currentQuestionId: location.currentQuestionId ?? null,
    phase: location.phase ?? null,
    lineIndex: location.lineIndex ?? 0,
    selectedKeys: Array.isArray(location.selectedKeys) ? [...location.selectedKeys] : [],
    feedback: location.feedback === null || location.feedback === undefined ? null : clone(location.feedback),
  };
}

function requireTimestamp(timestamp, label) {
  if (typeof timestamp !== "string" || !timestamp || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} timestamp is invalid/${label} 时间无效`);
  }
  return timestamp;
}

function emptyResult() {
  return scoreAssessment([], { totalQuestions: TOTAL_QUESTIONS });
}

function sortedHistory(history) {
  return history.toSorted((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}

function reportRefForDraft(type) {
  return { kind: "draft", assessmentType: type };
}

function reportRefForHistory(id) {
  return { kind: "history", id };
}

function expectedObjectiveId(attempt, location) {
  const stage = location.currentStage ?? location.stage ?? attempt.currentStage;
  const index = location.currentQuestionIndex ?? location.questionIndex ?? attempt.currentQuestionIndex;
  if (!Number.isInteger(stage) || !Number.isInteger(index) || stage < 1 || stage > 5 || index < 0 || index > 4) {
    throw new Error("Objective paper position is invalid/试卷位置无效");
  }
  return { id: attempt.questionIds[(stage - 1) * 5 + index], stage, index };
}

function requestedComprehensivePosition(attempt, location) {
  const stage = location.currentStage ?? location.stage ?? attempt.currentStage;
  const index = location.currentQuestionIndex ?? location.questionIndex ?? attempt.currentQuestionIndex;
  if (!Number.isInteger(stage) || !Number.isInteger(index) || stage < 1 || stage > 5 || index < 0 || index > 4) {
    throw new Error("Comprehensive question position is invalid/综合测评位置无效");
  }
  return { stage, index };
}

function assertAttemptShape(attempt) {
  if (!attempt || typeof attempt !== "object") throw new TypeError("测评记录无效/invalid attempt");
  requireAssessmentType(attempt.assessmentType);
}

function isCompleteResult(result) {
  return result?.answeredCount === TOTAL_QUESTIONS
    && Array.isArray(result.dimensions)
    && result.dimensions.length === 6
    && result.dimensions.every((dimension) => dimension.score !== null);
}

export function createAssessmentState() {
  return {
    schemaVersion: 1,
    drafts: { objective: null, comprehensive: null },
    history: [],
    latestReportRef: null,
  };
}

export function createAttempt(options = {}) {
  const {
    id,
    assessmentType,
    startedAt,
    questionIds = [],
    seed = null,
    adaptiveSession = null,
    location = {},
  } = options;
  requireAssessmentType(assessmentType);
  if (!id || typeof id !== "string") throw new Error("测评记录需要 id/attempt id required");
  requireTimestamp(startedAt, "startedAt");
  if (!Array.isArray(questionIds)) throw new TypeError("题目序列无效/question IDs must be an array");
  if (assessmentType === "objective" && questionIds.length !== TOTAL_QUESTIONS) {
    throw new Error("Objective paper must contain 25 question IDs/客观试卷必须有 25 题");
  }
  if (assessmentType === "objective" && new Set(questionIds).size !== TOTAL_QUESTIONS) {
    throw new Error("Objective paper must contain unique question IDs/客观试卷题目必须唯一");
  }
  if (assessmentType === "comprehensive" && questionIds.length !== 0) {
    throw new Error("Comprehensive attempt must start without question IDs/综合测评必须从空题目序列开始");
  }
  return {
    id,
    assessmentType,
    status: "not_started",
    startedAt,
    completedAt: null,
    answeredCount: 0,
    totalQuestions: TOTAL_QUESTIONS,
    currentStage: 1,
    currentQuestionIndex: 0,
    questionIds: clone(questionIds),
    seed: assessmentType === "objective" ? seed : null,
    responses: [],
    adaptiveSession: assessmentType === "comprehensive" ? clone(adaptiveSession) : null,
    result: emptyResult(),
    scoringVersion: SCORING_VERSION,
    questionBankVersion: QUESTION_BANK_VERSION,
    location: normalizeLocation(location),
  };
}

export function updateAttemptLocation(attempt, location) {
  assertAttemptShape(attempt);
  const nextLocation = normalizeLocation({ ...attempt.location, ...location });
  return { ...clone(attempt), location: nextLocation };
}

export function selectAttemptQuestion(attempt, questionId, location = {}) {
  assertAttemptShape(attempt);
  if (attempt.status === "completed") throw new Error("Cannot select a question for a completed attempt/已完成测评不能选题");
  if (!questionId || typeof questionId !== "string") throw new Error("题目 id 无效/question ID required");
  const selected = clone(attempt);
  if (selected.assessmentType === "objective") {
    const expected = expectedObjectiveId(selected, location);
    if (expected.id !== questionId) throw new Error("Question is not at the saved paper position/题目不在已保存的试卷位置");
    selected.currentStage = expected.stage;
    selected.currentQuestionIndex = expected.index;
  } else {
    const position = requestedComprehensivePosition(selected, location);
    selected.currentStage = position.stage;
    selected.currentQuestionIndex = position.index;
    if (!selected.questionIds.includes(questionId)) selected.questionIds.push(questionId);
  }
  selected.location = normalizeLocation({ ...selected.location, ...location, currentQuestionId: questionId });
  return selected;
}

export function recordAttemptResponse(attempt, payload = {}) {
  assertAttemptShape(attempt);
  if (attempt.status === "completed") throw new Error("Cannot record a response after completion/测评已完成");
  if (attempt.responses.length >= TOTAL_QUESTIONS) throw new Error("Response count exceeds 25/回答超过 25 题");
  const question = payload.question;
  if (!question || question.id !== attempt.location?.currentQuestionId) {
    throw new Error("Submitted question must match the current question/提交题目必须匹配当前题目");
  }
  if (attempt.responses.some((response) => response.questionId === question.id)) {
    throw new Error("Duplicate response question ID/重复回答题目");
  }
  if (attempt.assessmentType === "objective" && !attempt.questionIds.includes(question.id)) {
    throw new Error("Question is not in the objective paper/题目不在客观试卷中");
  }
  if (attempt.assessmentType === "comprehensive" && !attempt.questionIds.includes(question.id)) {
    throw new Error("Selected comprehensive question was not persisted/综合题目未保存");
  }
  requireTimestamp(payload.answeredAt, "answeredAt");
  const evidence = createResponseEvidence(question, payload.selectedKeys, payload.answeredAt);
  const responses = [...clone(attempt.responses), evidence];
  const result = scoreAssessment(responses, { totalQuestions: TOTAL_QUESTIONS });
  const next = clone(attempt);
  next.responses = responses;
  next.answeredCount = responses.length;
  // scoreAssessment can identify a mathematically complete result at answer 25,
  // but the lifecycle is not completed until completeAttempt freezes it with a time.
  next.status = responses.length === 0 ? "not_started" : "in_progress";
  next.result = result;
  next.currentStage = payload.stage ?? attempt.currentStage;
  next.currentQuestionIndex = payload.questionIndex ?? attempt.currentQuestionIndex;
  next.adaptiveSession = payload.adaptiveSession === undefined ? clone(attempt.adaptiveSession) : clone(payload.adaptiveSession);
  next.location = normalizeLocation({
    ...attempt.location,
    phase: payload.phase ?? attempt.location?.phase,
    lineIndex: payload.lineIndex ?? attempt.location?.lineIndex,
    selectedKeys: payload.selectedKeys,
    feedback: payload.feedback ?? attempt.location?.feedback,
  });
  return next;
}

export function completeAttempt(attempt, completedAt) {
  assertAttemptShape(attempt);
  requireTimestamp(completedAt, "completedAt");
  if (attempt.status === "completed") return clone(attempt);
  const result = scoreAssessment(attempt.responses, { totalQuestions: TOTAL_QUESTIONS });
  if (attempt.responses.length !== TOTAL_QUESTIONS || !isCompleteResult(result)) {
    throw new Error("Attempt requires 25 responses and six dimensions/测评需要 25 个回答及六维证据");
  }
  const completed = clone(attempt);
  completed.status = "completed";
  completed.completedAt = completedAt;
  completed.answeredCount = TOTAL_QUESTIONS;
  completed.result = result;
  return completed;
}

export function putDraft(state, attempt) {
  assertAttemptShape(attempt);
  const next = clone(state);
  const previous = next.drafts?.[attempt.assessmentType] ?? null;
  next.drafts = { ...next.drafts, [attempt.assessmentType]: clone(attempt) };
  if ((previous?.answeredCount ?? 0) === 0 && attempt.answeredCount === 1) {
    next.latestReportRef = reportRefForDraft(attempt.assessmentType);
  }
  return freezeAssessmentHistory(next);
}

export function finalizeDraft(state, type, completedAt) {
  requireAssessmentType(type);
  const draft = state?.drafts?.[type];
  if (!draft) throw new Error("没有可完成的草稿/no draft to finalize");
  const completed = completeAttempt(draft, completedAt);
  const next = clone(state);
  next.drafts[type] = null;
  next.history = sortedHistory([...next.history, clone(completed)]);
  next.latestReportRef = reportRefForHistory(completed.id);
  return freezeAssessmentHistory(next);
}

export function restartDraft(state, type) {
  requireAssessmentType(type);
  const next = clone(state);
  next.drafts[type] = null;
  if (next.latestReportRef?.kind === "draft" && next.latestReportRef.assessmentType === type) {
    next.latestReportRef = null;
  }
  return freezeAssessmentHistory(next);
}

export function resolveLatestReport(state) {
  const ref = state?.latestReportRef;
  if (!ref) return null;
  if (ref.kind === "draft") return state.drafts?.[ref.assessmentType] ? clone(state.drafts[ref.assessmentType]) : null;
  if (ref.kind === "history") {
    const history = state.history?.find((attempt) => attempt.id === ref.id);
    return history ? clone(history) : null;
  }
  return null;
}

export function checkDraftCompatibility(attempt, questions, questionBankVersion) {
  assertAttemptShape(attempt);
  if (attempt.questionBankVersion !== questionBankVersion) {
    return { compatible: false, reason: "题库版本不兼容/question bank version changed" };
  }
  const knownIds = new Set(Array.isArray(questions) ? questions.map((question) => question?.id) : []);
  if (attempt.assessmentType === "objective") {
    if (attempt.questionIds.length !== TOTAL_QUESTIONS || new Set(attempt.questionIds).size !== TOTAL_QUESTIONS) {
      return { compatible: false, reason: "客观试卷不是 25 个唯一题目/objective paper is invalid" };
    }
    if (attempt.questionIds.some((id) => !knownIds.has(id))) {
      return { compatible: false, reason: "客观试卷包含不存在题目/objective paper references missing question" };
    }
  }
  if (attempt.assessmentType === "comprehensive") {
    const referencedIds = [...attempt.questionIds, ...attempt.responses.map((response) => response.questionId)];
    if (referencedIds.some((id) => !knownIds.has(id))) {
      return { compatible: false, reason: "综合草稿包含不存在题目/comprehensive draft references missing question" };
    }
  }
  return { compatible: true, reason: null };
}
