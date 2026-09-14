import { DIMENSIONS } from "../skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { createAssessmentState } from "./assessment-attempt.js";

export const STORAGE_KEY = "aiquos.assessment-state.v1";
export const SCHEMA_VERSION = 1;

const TOTAL_QUESTIONS = 25;
const ATTEMPT_TYPES = new Set(["objective", "comprehensive"]);
const ATTEMPT_STATUSES = new Set(["not_started", "in_progress", "completed"]);
const RESULT_STATUSES = new Set(["not_started", "in_progress", "completed"]);
const QUESTION_TYPES = new Set(["single", "multi", "judge"]);
const DIFFICULTIES = new Set(["low", "medium", "high"]);
const GRADES = new Set(["S", "A", "B", "C", "D"]);
const DIMENSION_KEYS = new Set(DIMENSIONS.map((dimension) => dimension.key));
const ATTEMPT_FIELDS = [
  "id", "assessmentType", "status", "startedAt", "completedAt", "answeredCount", "totalQuestions",
  "currentStage", "currentQuestionIndex", "questionIds", "seed", "responses", "adaptiveSession", "result",
  "scoringVersion", "questionBankVersion", "location",
];

function clone(value) {
  return structuredClone(value);
}

function corruptBackupKey(now) {
  return `aiquos.assessment-state.corrupt.${new Date(now).toISOString().replace(/[.:]/g, "-")}`;
}

function isValidTimestamp(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function hasUniqueStrings(values) {
  return Array.isArray(values)
    && values.every(isNonEmptyString)
    && new Set(values).size === values.length;
}

function validLocation(location, questionIds) {
  if (!location || typeof location !== "object" || Array.isArray(location)) return false;
  if (Object.keys(location).sort().join(",") !== "currentQuestionId,feedback,lineIndex,phase,selectedKeys") return false;
  if (location.currentQuestionId !== null && !isNonEmptyString(location.currentQuestionId)) return false;
  if (location.currentQuestionId !== null && !questionIds.includes(location.currentQuestionId)) return false;
  if (location.phase !== null && typeof location.phase !== "string") return false;
  if (!Number.isInteger(location.lineIndex) || location.lineIndex < 0) return false;
  return hasUniqueStrings(location.selectedKeys);
}

function validResponse(response, questionIds) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  if (!isNonEmptyString(response.questionId) || !questionIds.includes(response.questionId)) return false;
  if (!QUESTION_TYPES.has(response.type) || !DIFFICULTIES.has(response.difficulty)) return false;
  if (!hasUniqueStrings(response.dimKeys) || response.dimKeys.some((key) => !DIMENSION_KEYS.has(key))) return false;
  if (!hasUniqueStrings(response.selectedKeys)) return false;
  if (typeof response.credit !== "number" || !Number.isFinite(response.credit) || response.credit < 0 || response.credit > 1) return false;
  return isValidTimestamp(response.answeredAt);
}

function validResult(result, attempt) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  if (result.scoringVersion !== attempt.scoringVersion || !RESULT_STATUSES.has(result.status)) return false;
  if (result.answeredCount !== attempt.answeredCount || result.totalQuestions !== TOTAL_QUESTIONS) return false;
  if (!Array.isArray(result.dimensions) || result.dimensions.length !== DIMENSIONS.length) return false;
  const resultDimensionKeys = new Set();
  for (const dimension of result.dimensions) {
    if (!dimension || typeof dimension !== "object" || Array.isArray(dimension)) return false;
    if (!DIMENSION_KEYS.has(dimension.key) || resultDimensionKeys.has(dimension.key)) return false;
    if (!isNonEmptyString(dimension.name) || !isNonEmptyString(dimension.short)) return false;
    if (dimension.score !== null && (!Number.isInteger(dimension.score) || dimension.score < 0 || dimension.score > 100)) return false;
    if (!Number.isInteger(dimension.evidenceCount) || dimension.evidenceCount < 0) return false;
    if (dimension.evidenceCount !== attempt.responses.filter((response) => response.dimKeys.includes(dimension.key)).length) return false;
    resultDimensionKeys.add(dimension.key);
  }
  const complete = attempt.answeredCount === TOTAL_QUESTIONS
    && result.dimensions.every((dimension) => dimension.score !== null);
  if (attempt.answeredCount === 0 && result.status !== "not_started") return false;
  if (attempt.answeredCount > 0 && !complete && result.status !== "in_progress") return false;
  if (complete && result.status !== "completed") return false;
  if (result.status === "completed" && !complete) return false;
  if (result.status !== "completed" && (result.overallScore !== null || result.grade !== null)) return false;
  if (complete) {
    if (!Number.isInteger(result.overallScore) || result.overallScore < 0 || result.overallScore > 100) return false;
    if (!GRADES.has(result.grade)) return false;
  } else if (result.overallScore !== null || result.grade !== null) {
    return false;
  }
  return true;
}

function validAttempt(attempt, { history = false } = {}) {
  if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) return false;
  if (!ATTEMPT_FIELDS.every((field) => Object.hasOwn(attempt, field))) return false;
  if (!isNonEmptyString(attempt.id) || !ATTEMPT_TYPES.has(attempt.assessmentType) || !ATTEMPT_STATUSES.has(attempt.status)) return false;
  if (!isValidTimestamp(attempt.startedAt) || attempt.totalQuestions !== TOTAL_QUESTIONS) return false;
  if (!Number.isInteger(attempt.answeredCount) || attempt.answeredCount < 0 || attempt.answeredCount > TOTAL_QUESTIONS) return false;
  if (!Number.isInteger(attempt.currentStage) || attempt.currentStage < 1 || attempt.currentStage > 5) return false;
  if (!Number.isInteger(attempt.currentQuestionIndex) || attempt.currentQuestionIndex < 0 || attempt.currentQuestionIndex > 4) return false;
  if (!hasUniqueStrings(attempt.questionIds) || !Array.isArray(attempt.responses) || attempt.responses.length !== attempt.answeredCount) return false;
  if (!isNonEmptyString(attempt.scoringVersion) || !isNonEmptyString(attempt.questionBankVersion)) return false;
  if (attempt.assessmentType === "objective") {
    if (attempt.questionIds.length !== TOTAL_QUESTIONS || attempt.adaptiveSession !== null) return false;
    if (attempt.seed !== null && (!Number.isInteger(attempt.seed) || attempt.seed < 0 || attempt.seed > 0xffffffff)) return false;
  } else {
    if (attempt.questionIds.length > TOTAL_QUESTIONS || attempt.seed !== null) return false;
  }
  if (attempt.responses.some((response) => !validResponse(response, attempt.questionIds))) return false;
  if (new Set(attempt.responses.map((response) => response.questionId)).size !== attempt.responses.length) return false;
  if (!validLocation(attempt.location, attempt.questionIds) || !validResult(attempt.result, attempt)) return false;
  if (attempt.status === "not_started" && (attempt.answeredCount !== 0 || attempt.completedAt !== null)) return false;
  if (attempt.status === "in_progress" && (attempt.answeredCount === 0 || attempt.completedAt !== null)) return false;
  if (attempt.status === "completed" && (attempt.answeredCount !== TOTAL_QUESTIONS || !isValidTimestamp(attempt.completedAt))) return false;
  if (attempt.status === "completed" && attempt.result.status !== "completed") return false;
  if (history && (attempt.status !== "completed" || attempt.result.status !== "completed")) return false;
  return true;
}

function validHistory(history) {
  if (!Array.isArray(history) || !history.every((attempt) => validAttempt(attempt, { history: true }))) return false;
  if (new Set(history.map((attempt) => attempt.id)).size !== history.length) return false;
  return history.every((attempt, index) => index === 0 || Date.parse(history[index - 1].completedAt) >= Date.parse(attempt.completedAt));
}

function validLatestRef(ref, drafts, history) {
  if (ref === null) return true;
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return false;
  if (ref.kind === "draft") {
    return Object.keys(ref).sort().join(",") === "assessmentType,kind"
      && ATTEMPT_TYPES.has(ref.assessmentType)
      && drafts[ref.assessmentType] !== null
      && drafts[ref.assessmentType].answeredCount > 0;
  }
  if (ref.kind === "history") {
    return Object.keys(ref).sort().join(",") === "id,kind"
      && isNonEmptyString(ref.id)
      && history.some((attempt) => attempt.id === ref.id);
  }
  return false;
}

function validState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.schemaVersion !== SCHEMA_VERSION) return false;
  if (!state.drafts || typeof state.drafts !== "object" || Array.isArray(state.drafts)) return false;
  if (Object.keys(state.drafts).sort().join(",") !== "comprehensive,objective") return false;
  const { objective, comprehensive } = state.drafts;
  if (objective !== null && (!validAttempt(objective) || objective.assessmentType !== "objective")) return false;
  if (comprehensive !== null && (!validAttempt(comprehensive) || comprehensive.assessmentType !== "comprehensive")) return false;
  if (!validHistory(state.history)) return false;
  const ids = [objective, comprehensive, ...state.history].filter(Boolean).map((attempt) => attempt.id);
  if (new Set(ids).size !== ids.length) return false;
  return validLatestRef(state.latestReportRef, state.drafts, state.history);
}

function recoveryWarning(backupFailed) {
  return backupFailed
    ? "检测到损坏的测评记录，已恢复为空状态；损坏记录备份失败。"
    : "检测到损坏的测评记录，已恢复为空状态并备份损坏记录。";
}

export function loadAssessmentState(storage, now = new Date().toISOString()) {
  let raw;
  try {
    raw = storage?.getItem(STORAGE_KEY);
  } catch {
    return { state: createAssessmentState(), warning: "读取测评记录失败，已使用空状态。" };
  }
  if (raw === null || raw === undefined || raw === "") return { state: createAssessmentState(), warning: null };
  try {
    const parsed = JSON.parse(raw);
    if (!validState(parsed)) throw new Error("invalid assessment state schema");
    return { state: clone(parsed), warning: null };
  } catch {
    let backupFailed = false;
    try {
      storage?.setItem(corruptBackupKey(now), raw);
    } catch {
      backupFailed = true;
    }
    return { state: createAssessmentState(), warning: recoveryWarning(backupFailed) };
  }
}

export function saveAssessmentState(storage, state, now = new Date().toISOString()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return { state, warning: null };
  } catch {
    return { state, warning: "结果暂时无法保存，请稍后重试。" };
  }
}
