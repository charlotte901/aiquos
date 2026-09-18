// Attempt lifecycle for the comprehensive assessment, following
// vendor/aiquos-six-dimension-scoring/references/integration-guide.md:
// evidence is re-created from the served question on every submission,
// scoring always recomputes from the complete answer collection, completed
// attempts become immutable history snapshots, and unfinished attempts stay
// resumable drafts. The scoring math itself lives only in the vendored core.
import {
  SCORING_VERSION,
  createResponseEvidence,
  scoreAssessment,
  validateQuestionBank,
} from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { clearExposureStore } from "./comprehensive-adaptive.js";

/**
 * @typedef {Object} ResponseEvidence
 * @property {string} questionId
 * @property {"single"|"multi"|"judge"} type
 * @property {"low"|"medium"|"high"} difficulty
 * @property {string[]} dimKeys
 * @property {string[]} selectedKeys
 * @property {number} credit
 * @property {string} [answeredAt]
 */

/**
 * @typedef {Object} Attempt
 * @property {string} assessmentId
 * @property {string} startedAt
 * @property {null|string} completedAt
 * @property {number} totalQuestions
 * @property {string[]} questionIds
 * @property {ResponseEvidence[]} evidence
 * @property {string} scoringVersion
 * @property {string} questionBankVersion
 */

/**
 * @typedef {Object} ScoreResult
 * @property {string} scoringVersion
 * @property {"not_started"|"in_progress"|"completed"} status
 * @property {number} answeredCount
 * @property {number} totalQuestions
 * @property {Array<{key: string, name: string, short: string, score: number|null, evidenceCount: number}>} dimensions
 * @property {number|null} overallScore
 * @property {string|null} grade
 */

/**
 * @typedef {Attempt & {result: ScoreResult}} HistorySnapshot
 */

export const QUESTION_BANK_VERSION = "objective-bank-v6-120";
const DRAFT_KEY = "aiquos.comprehensive-attempt.v1";
const HISTORY_KEY = "aiquos.comprehensive-history.v1";
const HISTORY_LIMIT = 12;

export function createAttempt({ questions, totalQuestions, assessmentId = "comprehensive" }) {
  // Validate the bank once before the session starts (integration guide).
  validateQuestionBank(questions);
  return {
    assessmentId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalQuestions,
    questionIds: [],
    evidence: [],
    scoringVersion: SCORING_VERSION,
    questionBankVersion: QUESTION_BANK_VERSION,
  };
}

export function recordAnswer(attempt, question, selectedKeys, answeredAt = new Date().toISOString()) {
  // A re-served question (possible after a mid-run reload resets the in-memory
  // adaptive state) replaces its earlier evidence in place, so the set handed
  // to scoreAssessment keeps unique question IDs; the latest answer wins.
  const evidence = createResponseEvidence(question, selectedKeys, answeredAt);
  let nextEvidence = attempt.evidence.some((item) => item.questionId === evidence.questionId)
    ? attempt.evidence.map((item) => (item.questionId === evidence.questionId ? evidence : item))
    : [...attempt.evidence, evidence];
  // A resumed run that re-enters finished stages can collect more unique
  // questions than the budget; keep the most recent `totalQuestions` answers
  // (FIFO) so the scoring contract — count never exceeds totalQuestions —
  // holds and the most recent work is what gets scored.
  if (nextEvidence.length > attempt.totalQuestions) {
    nextEvidence = nextEvidence.slice(nextEvidence.length - attempt.totalQuestions);
  }
  const next = {
    ...attempt,
    questionIds: nextEvidence.map((item) => item.questionId),
    evidence: nextEvidence,
  };
  return { attempt: next, result: scoreAssessment(next.evidence, { totalQuestions: next.totalQuestions }) };
}

export function currentResult(attempt) {
  if (!attempt || attempt.evidence.length === 0) return null;
  return scoreAssessment(attempt.evidence, { totalQuestions: attempt.totalQuestions });
}

// Pure per-answer credit for callers (e.g. adaptive routing) that need the
// number before the attempt state update commits.
export function answerCredit(question, selectedKeys) {
  return createResponseEvidence(question, selectedKeys).credit;
}

export function isAttemptComplete(result) {
  return Boolean(result && result.status === "completed");
}

// A completed attempt is stored exactly once and never revised afterwards.
export function snapshotAttempt(attempt, result) {
  if (!isAttemptComplete(result)) return null;
  return {
    assessmentId: attempt.assessmentId,
    startedAt: attempt.startedAt,
    completedAt: new Date().toISOString(),
    totalQuestions: attempt.totalQuestions,
    questionIds: [...attempt.questionIds],
    evidence: attempt.evidence.map((item) => ({ ...item })),
    result,
    scoringVersion: attempt.scoringVersion,
    questionBankVersion: attempt.questionBankVersion,
  };
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// In-memory fallbacks keep the run alive when setItem throws (Safari private
// mode, full quota): the current session reads its own writes, and a reload
// degrades to a fresh run instead of crashing mid-assessment.
const memoryStore = new Map();

function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw;
  } catch {
    // Reading threw: fall through to the memory copy.
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function storageSet(key, value) {
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence failed; the memory copy above is authoritative for now.
  }
}

function storageRemove(key) {
  memoryStore.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures; the in-memory attempt stays authoritative.
  }
}

// Draft/history migrators run in order on read. v1 is the current shape; future
// breaking changes append a step here (v1→v2→…) so stored snapshots upgrade in
// place instead of being silently dropped.
const DRAFT_MIGRATORS = [];
const HISTORY_MIGRATORS = [];

function migrate(value, steps) {
  return steps.reduce((current, step) => current ?? null, value ?? null);
}

export function saveAttemptDraft(attempt) {
  storageSet(DRAFT_KEY, JSON.stringify(attempt));
}

export function loadAttemptDraft() {
  const attempt = migrate(safeParse(storageGet(DRAFT_KEY)), DRAFT_MIGRATORS);
  if (!attempt || !Array.isArray(attempt.evidence)) return null;
  if (attempt.scoringVersion !== SCORING_VERSION) return null;
  if (attempt.questionBankVersion !== QUESTION_BANK_VERSION) return null;
  if (!Number.isInteger(attempt.totalQuestions)) return null;
  return attempt;
}

export function clearAttemptDraft() {
  storageRemove(DRAFT_KEY);
}

export function appendHistorySnapshot(snapshot) {
  if (!snapshot) return loadAttemptHistory();
  const history = loadAttemptHistory();
  if (history.some((item) => item.completedAt === snapshot.completedAt)) return history;
  const next = [...history, snapshot].slice(-HISTORY_LIMIT);
  storageSet(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function loadAttemptHistory() {
  const history = migrate(safeParse(storageGet(HISTORY_KEY)), HISTORY_MIGRATORS);
  if (!Array.isArray(history)) return [];
  return history.filter(
    (item) => item && item.scoringVersion === SCORING_VERSION
      && item.questionBankVersion === QUESTION_BANK_VERSION,
  );
}

export function latestCompletedSnapshot() {
  const history = loadAttemptHistory();
  return history.length ? history[history.length - 1] : null;
}

// True when the next completed run would evict the oldest snapshot — the UI
// surfaces this so records never disappear silently.
export function historyAtCapacity() {
  return loadAttemptHistory().length >= HISTORY_LIMIT;
}

// Wipes every locally stored assessment artifact (privacy panel in settings).
export function clearAllAssessmentData() {
  storageRemove(DRAFT_KEY);
  storageRemove(HISTORY_KEY);
  clearExposureStore();
}

// Download the full stored history as a JSON file (used by the cap notice).
export function exportAttemptHistory() {
  const history = loadAttemptHistory();
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), scoringVersion: SCORING_VERSION, questionBankVersion: QUESTION_BANK_VERSION, history }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.download = "aiquos-assessment-history.json";
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
  return history.length;
}
