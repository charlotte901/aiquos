// Server-authoritative adaptive serving for the comprehensive assessment.
// The selection algorithm is the SAME module the client used to run locally
// (src/comprehensive-adaptive.js): the worker imports its pure exports plus the
// single bank copy in src/, so engine and bank cannot drift between "backend"
// and "frontend". The client no longer selects questions; it threads the
// opaque routing session between requests and reports the outcome of the
// question it just answered. Scoring stays client-side per the vendored
// package's integration guide (pure ESM in browser code).
import bank from "../src/comprehensive-questions.json" with { type: "json" };
import { validateQuestionBank } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import {
  applyAdaptiveOutcome,
  createAdaptiveSession,
  estimateRunAbility,
  nextTargetDifficulty,
  selectAdaptiveQuestion,
  startAdaptiveStage,
} from "../src/comprehensive-adaptive.js";

export const COMPREHENSIVE_QUESTION_PATH = "/api/comprehensive-question";

// Fail fast at startup: the run contract depends on a valid bank.
validateQuestionBank(bank.questions);

const LEVEL_IDS = new Set(bank.questions.map((question) => question.levelId));
const byId = new Map(bank.questions.map((question) => [question.id, question]));

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Merge a client-supplied session over fresh defaults so partial or stale
// shapes can never crash selection. Extra fields pass through harmlessly.
function normalizeSession(raw) {
  const base = createAdaptiveSession();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    position: Number.isFinite(raw.position) ? Math.max(0, Math.min(2, raw.position)) : base.position,
    usedQuestionIds: Array.isArray(raw.usedQuestionIds)
      ? raw.usedQuestionIds.filter((id) => typeof id === "string")
      : [],
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.filter((item) => item && typeof item === "object" && typeof item.credit === "number")
      : [],
    dimensionCounts: { ...base.dimensionCounts, ...(raw.dimensionCounts ?? {}) },
    typeCounts: { ...base.typeCounts, ...(raw.typeCounts ?? {}) },
    typeStreak: Number.isFinite(raw.typeStreak) ? raw.typeStreak : 0,
  };
}

// Apply the just-answered question's outcome: position walk plus (when the
// client reports a credit) light evidence for the ability estimate. Difficulty
// and dimKeys are looked up server-side by question id, never trusted from the
// wire.
export function applyOutcomeToSession(session, { outcome, credit = null, questionId }) {
  let next = applyAdaptiveOutcome(session, outcome);
  if (typeof credit === "number" && questionId && byId.has(questionId)) {
    const question = byId.get(questionId);
    next = {
      ...next,
      evidence: [...next.evidence, { credit, difficulty: question.difficulty, dimKeys: [...question.dimKeys] }],
    };
  }
  return next;
}

export function selectComprehensive({ levelId, stage, session, exposure, rng = Math.random }) {
  const staged = startAdaptiveStage(session, stage);
  return selectAdaptiveQuestion({ questions: bank.questions, levelId, session: staged, rng, exposure });
}

// Same shape the old client-side controller exposed for the aiquos.debug chip.
export function debugSnapshot(session) {
  return {
    position: session.position,
    target: nextTargetDifficulty(session),
    typeStreak: session.typeStreak,
    evidenceCount: session.evidence.length,
    dimensionCounts: { ...session.dimensionCounts },
    ability: estimateRunAbility(session.evidence.length ? session : createAdaptiveSession()),
  };
}

export async function handleComprehensiveQuestion(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const levelId = payload?.levelId;
  if (typeof levelId !== "string" || !LEVEL_IDS.has(levelId)) {
    return json({ error: "unknown levelId" }, 400);
  }
  const stage = Math.max(1, Math.min(5, Number(payload.stage ?? 1) || 1));
  let session = normalizeSession(payload.session);
  if (payload.outcome && typeof payload.outcome === "object" && payload.outcome.questionId) {
    session = applyOutcomeToSession(session, payload.outcome);
  }
  const exposure = payload.exposure && typeof payload.exposure === "object" && !Array.isArray(payload.exposure)
    ? payload.exposure
    : {};
  const picked = selectComprehensive({ levelId, stage, session, exposure });
  if (!picked.question) return json({ error: "no question available for this level" }, 409);
  return json({
    question: picked.question,
    session: picked.session,
    exposure: picked.exposure ?? exposure,
    ...(payload.debug ? { debug: debugSnapshot(picked.session) } : {}),
  });
}
