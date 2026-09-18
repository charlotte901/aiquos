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
  // adaptive state) replaces its earlier evidence so the set handed to
  // scoreAssessment keeps unique question IDs; the latest answer wins.
  const evidence = createResponseEvidence(question, selectedKeys, answeredAt);
  const previous = attempt.evidence.filter((item) => item.questionId !== evidence.questionId);
  const nextEvidence = [...previous, evidence].sort(
    (left, right) => attempt.questionIds.indexOf(left.questionId) - attempt.questionIds.indexOf(right.questionId),
  );
  const questionIds = attempt.questionIds.includes(question.id)
    ? attempt.questionIds
    : [...attempt.questionIds, question.id];
  const next = {
    ...attempt,
    questionIds,
    evidence: nextEvidence,
  };
  return { attempt: next, result: scoreAssessment(next.evidence, { totalQuestions: next.totalQuestions }) };
}

export function currentResult(attempt) {
  if (!attempt || attempt.evidence.length === 0) return null;
  return scoreAssessment(attempt.evidence, { totalQuestions: attempt.totalQuestions });
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

export function saveAttemptDraft(attempt) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(attempt));
  } catch {
    // Best-effort persistence, tolerant of private mode (see forum-view note).
  }
}

export function loadAttemptDraft() {
  try {
    const attempt = safeParse(localStorage.getItem(DRAFT_KEY));
    if (!attempt || !Array.isArray(attempt.evidence)) return null;
    if (attempt.scoringVersion !== SCORING_VERSION) return null;
    if (attempt.questionBankVersion !== QUESTION_BANK_VERSION) return null;
    if (!Number.isInteger(attempt.totalQuestions)) return null;
    return attempt;
  } catch {
    return null;
  }
}

export function clearAttemptDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore storage failures; the in-memory attempt stays authoritative.
  }
}

export function appendHistorySnapshot(snapshot) {
  if (!snapshot) return loadAttemptHistory();
  try {
    const history = loadAttemptHistory();
    if (history.some((item) => item.completedAt === snapshot.completedAt)) return history;
    const next = [...history, snapshot].slice(-HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadAttemptHistory();
  }
}

export function loadAttemptHistory() {
  try {
    const history = safeParse(localStorage.getItem(HISTORY_KEY));
    if (!Array.isArray(history)) return [];
    return history.filter(
      (item) => item && item.scoringVersion === SCORING_VERSION
        && item.questionBankVersion === QUESTION_BANK_VERSION,
    );
  } catch {
    return [];
  }
}

export function latestCompletedSnapshot() {
  const history = loadAttemptHistory();
  return history.length ? history[history.length - 1] : null;
}
