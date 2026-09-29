// Server-authoritative adaptive serving for the comprehensive assessment.
// The selection algorithm is the SAME module the client used to run locally
// (src/comprehensive-adaptive.js): the worker imports its pure exports plus the
// single bank copy in src/, so engine and bank cannot drift between "backend"
// and "frontend". The client no longer selects questions; it threads the
// opaque routing session between requests and reports the outcome of the
// question it just answered. Scoring stays client-side per the vendored
// package's integration guide (pure ESM in browser code).
import { validateQuestionBank } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import {
  applyAdaptiveOutcome,
  createAdaptiveSession,
  estimateRunAbility,
  nextTargetDifficulty,
  selectAdaptiveQuestion,
  startAdaptiveStage,
} from "../src/comprehensive-adaptive.js";
import { normalizePrior, normalizeSeedPayload, seedSession } from "../src/cat-seeding.js";
import { getBankState } from "./bank-store.js";
import { DEFAULT_EDITION, normalizeEdition } from "../src/bank-editions.js";

export const COMPREHENSIVE_QUESTION_PATH = "/api/comprehensive-question";

// The bank is read through the override-aware store so admin edits reach
// serving immediately; derived maps are cached per bankVersion, and now per
// edition too — the two editions are separate pools with separate versions.
const bankCaches = new Map();

function currentBank(editionInput) {
  const edition = normalizeEdition(editionInput ?? DEFAULT_EDITION);
  const state = getBankState(edition);
  const cached = bankCaches.get(edition);
  if (cached && cached.bankVersion === state.bankVersion) return cached;
  validateQuestionBank(state.questions);
  const next = {
    ...state,
    byId: new Map(state.questions.map((question) => [question.id, question])),
    levelIds: new Set(state.questions.map((question) => question.levelId)),
  };
  bankCaches.set(edition, next);
  return next;
}

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
    // 定档先验随 session 回传；损坏/越界的先验在这里被丢弃，不会报错。
    prior: normalizePrior(raw.prior),
  };
}

// Apply the just-answered question's outcome: position walk plus (when the
// client reports a credit) light evidence for the ability estimate. Difficulty
// and dimKeys are looked up server-side by question id, never trusted from the
// wire.
export function applyOutcomeToSession(session, { outcome, credit = null, questionId }, edition) {
  let next = applyAdaptiveOutcome(session, outcome);
  if (typeof credit === "number" && questionId) {
    const question = currentBank(edition).byId.get(questionId);
    if (question) {
      next = {
        ...next,
        evidence: [...next.evidence, { credit, difficulty: question.difficulty, dimKeys: [...question.dimKeys] }],
      };
    }
  }
  return next;
}

export function selectComprehensive({
  levelId,
  stage,
  session,
  exposure,
  rng = Math.random,
  coverageCritical = false,
  edition,
}) {
  const bank = currentBank(edition);
  const staged = startAdaptiveStage(session, stage);
  return selectAdaptiveQuestion({
    questions: bank.questions,
    // scope:"bank" arrives as levelId:null — the timed CAT ranges over the
    // whole bank so the router can climb the full difficulty ladder.
    levelId,
    session: staged,
    rng,
    exposure,
    coverageCritical,
  });
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
    seeded: Boolean(session.prior),
    ...(session.prior ? { prior: { ...session.prior } } : {}),
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
  // 版本（edition）：决定用哪一套综合题池。缺省走精选版，老客户端不受影响。
  const edition = normalizeEdition(payload?.edition ?? DEFAULT_EDITION);
  const levelId = payload?.scope === "bank" ? null : payload?.levelId;
  const bank = currentBank(edition);
  if (payload?.scope !== "bank" && (typeof levelId !== "string" || !bank.levelIds.has(levelId))) {
    return json({ error: "unknown levelId" }, 400);
  }
  const stage = Math.max(1, Math.min(5, Number(payload.stage ?? 1) || 1));
  let session = normalizeSession(payload.session);
  // 对话定档：客观题阶段的第一题请求可携带对话通道的分数摘要，服务端
  // 折算成路由先验（normalizeSeedPayload 全程钳制，脏数据退化为不定档）。
  // 只在 session 尚无先验、尚无作答证据时生效一次，之后随 session 回传。
  const seed = normalizeSeedPayload(payload?.interviewSeed);
  if (seed) session = seedSession(session, seed);
  if (payload.outcome && typeof payload.outcome === "object" && payload.outcome.questionId) {
    session = applyOutcomeToSession(session, payload.outcome, edition);
  }
  const exposure = payload.exposure && typeof payload.exposure === "object" && !Array.isArray(payload.exposure)
    ? payload.exposure
    : {};
  const picked = selectComprehensive({
    levelId,
    stage,
    session,
    exposure,
    coverageCritical: payload?.coverageCritical === true,
    edition,
  });
  if (!picked.question) return json({ error: "no question available for this level" }, 409);
  return json({
    question: picked.question,
    session: picked.session,
    exposure: picked.exposure ?? exposure,
    bankVersion: bank.bankVersion,
    edition,
    ...(payload.debug ? { debug: debugSnapshot(picked.session) } : {}),
  });
}
