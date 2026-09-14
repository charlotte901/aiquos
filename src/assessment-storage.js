import { createAssessmentState } from "./assessment-attempt.js";

export const STORAGE_KEY = "aiquos.assessment-state.v1";
export const SCHEMA_VERSION = 1;

function clone(value) {
  return structuredClone(value);
}

function corruptBackupKey(now) {
  return `aiquos.assessment-state.corrupt.${new Date(now).toISOString().replace(/[.:]/g, "-")}`;
}

function validAttempt(attempt) {
  return attempt === null || (attempt
    && typeof attempt === "object"
    && typeof attempt.id === "string"
    && (attempt.assessmentType === "objective" || attempt.assessmentType === "comprehensive")
    && Array.isArray(attempt.questionIds)
    && Array.isArray(attempt.responses)
    && attempt.location
    && typeof attempt.location === "object");
}

function validState(state) {
  if (!state || typeof state !== "object" || state.schemaVersion !== SCHEMA_VERSION) return false;
  if (!state.drafts || typeof state.drafts !== "object" || !Array.isArray(state.history)) return false;
  if (!validAttempt(state.drafts.objective) || !validAttempt(state.drafts.comprehensive)) return false;
  if (state.drafts.objective?.assessmentType !== undefined && state.drafts.objective.assessmentType !== "objective") return false;
  if (state.drafts.comprehensive?.assessmentType !== undefined && state.drafts.comprehensive.assessmentType !== "comprehensive") return false;
  if (!state.history.every(validAttempt)) return false;
  const ref = state.latestReportRef;
  if (ref !== null && (!ref || typeof ref !== "object" || !["draft", "history"].includes(ref.kind))) return false;
  if (ref?.kind === "draft" && !["objective", "comprehensive"].includes(ref.assessmentType)) return false;
  if (ref?.kind === "history" && typeof ref.id !== "string") return false;
  if (ref?.kind === "draft" && !state.drafts[ref.assessmentType]) return false;
  if (ref?.kind === "history" && !state.history.some((attempt) => attempt.id === ref.id)) return false;
  return true;
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
