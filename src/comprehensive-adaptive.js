import {
  DIFFICULTY_ANCHORS,
  DIMENSIONS,
} from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const DIMENSION_KEYS = DIMENSIONS.map((dimension) => dimension.key);
const TYPES = ["single", "judge", "multi"];
const DIFFICULTY_INDEX = { low: 0, medium: 1, high: 2 };
const ANCHOR = { low: -1, medium: 0, high: 1 };

// Cross-run question exposure counters, best-effort persisted so repeat runs
// spread over the bank instead of re-serving the same favourites forever.
export const ADAPTIVE_EXPOSURE_KEY = "aiquos.adaptive-exposure.v1";
const EXPOSURE_CAP = 6;

function loadExposure() {
  try {
    const raw = JSON.parse(localStorage.getItem(ADAPTIVE_EXPOSURE_KEY));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveExposure(counts) {
  try {
    localStorage.setItem(ADAPTIVE_EXPOSURE_KEY, JSON.stringify(counts));
  } catch {
    // Private mode or full quota: exposure balancing degrades to this run.
  }
}

export function clearExposureStore() {
  try {
    localStorage.removeItem(ADAPTIVE_EXPOSURE_KEY);
  } catch {
    // Ignore: nothing was persisted anyway.
  }
}

export function createAdaptiveSession() {
  return {
    position: 1,
    usedQuestionIds: [],
    dimensionCounts: Object.fromEntries(DIMENSION_KEYS.map((key) => [key, 0])),
    typeCounts: Object.fromEntries(TYPES.map((type) => [type, 0])),
    lastType: null,
    activeStage: null,
    // v2 fields: light per-answer evidence (credit + difficulty + dimKeys) and
    // the running same-type streak. Empty evidence keeps v1 behavior exactly.
    evidence: [],
    typeStreak: 0,
  };
}

export function startAdaptiveStage(session, stage) {
  if (session.activeStage === stage) return session;
  const position = session.activeStage === null
    ? session.position
    : 1 + (session.position - 1) * 0.65;
  return { ...session, position, activeStage: stage };
}

export function applyAdaptiveOutcome(session, outcome) {
  const delta = outcome === "correct" ? 0.4 : outcome === "wrong" ? -0.4 : 0;
  return {
    ...session,
    position: Math.max(0, Math.min(2, session.position + delta)),
  };
}

// 1-parameter logistic ability estimate over the run's light evidence — the
// same model family as the vendored scoring core, used here only to aim the
// next question's difficulty. Returns null before any credited answer.
export function estimateRunAbility(session) {
  const evidence = session.evidence.filter((item) => typeof item.credit === "number");
  if (evidence.length === 0) return null;
  let low = -8;
  let high = 8;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const theta = (low + high) / 2;
    const derivative = evidence.reduce(
      (sum, item) => sum + item.credit - 1 / (1 + Math.exp(-(theta - ANCHOR[item.difficulty]))),
      -theta,
    );
    if (derivative > 0) low = theta;
    else high = theta;
  }
  return (low + high) / 2;
}

// Blend the ability estimate with the position walk (both centred on 0) into
// the difficulty the next question should sit at.
export function nextTargetDifficulty(session) {
  const ability = estimateRunAbility(session);
  const walk = session.position - 1;
  if (ability === null) return walk;
  return 0.65 * Math.max(-1.8, Math.min(1.8, ability)) + 0.35 * walk;
}

function dimensionInfoWeights(session) {
  // Dimensions with fewer answered items carry more unknown information.
  return Object.fromEntries(
    DIMENSION_KEYS.map((key) => [key, 1 / (1 + (session.dimensionCounts[key] ?? 0))]),
  );
}

export function selectAdaptiveQuestion({ questions, levelId, session, rng = Math.random, exposure = null }) {
  const used = new Set(session.usedQuestionIds);
  let candidates = questions
    .filter((question) => question.levelId === levelId && !used.has(question.id));
  if (candidates.length === 0) return { question: null, session };

  // Hard variety guard: never serve a third consecutive question of one type
  // while any unused candidate of another type exists in this level.
  if (session.typeStreak >= 2 && session.lastType) {
    const varied = candidates.filter((question) => question.type !== session.lastType);
    if (varied.length > 0) candidates = varied;
  }

  const target = nextTargetDifficulty(session);
  const hasEvidence = session.evidence.length > 0;
  const infoWeights = dimensionInfoWeights(session);
  const usage = exposure ?? {};

  const ranked = candidates
    .map((question, order) => {
      const difficultyDistance = Math.abs(ANCHOR[question.difficulty] - target);
      const difficultyFit = 1 - difficultyDistance / 2;
      const dimensionInfo = question.dimKeys.reduce((total, key) => total + (infoWeights[key] ?? 0), 0);
      const dimensionLoad = question.dimKeys.reduce(
        (total, key) => total + (session.dimensionCounts[key] ?? 0),
        0,
      );
      const repeatsType = question.type === session.lastType ? 1 : 0;
      const typeVariety = repeatsType === 0 ? 1 : session.typeStreak >= 2 ? 0 : 0.4;
      const exposurePenalty = 0.12 * Math.min(EXPOSURE_CAP, usage[question.id] ?? 0);
      // Without credited evidence the composite collapses to the v1 ordering:
      // difficulty distance, then under-covered dimensions, then type change,
      // then bank order. Exposure balancing applies in both branches.
      const score = hasEvidence
        ? 2 * difficultyFit + 1.2 * dimensionInfo + 0.4 * typeVariety - exposurePenalty
        : -(difficultyDistance * 10 + dimensionLoad + repeatsType * 0.1) - exposurePenalty;
      return { question, order, score };
    })
    .sort((left, right) => right.score - left.score || left.order - right.order);

  const shortlist = ranked.slice(0, 3);
  const randomValue = Number(rng());
  const rawIndex = Number.isFinite(randomValue) ? Math.floor(randomValue * shortlist.length) : 0;
  const index = Math.max(0, Math.min(shortlist.length - 1, rawIndex));
  const question = shortlist[index].question;
  const dimensionCounts = { ...session.dimensionCounts };
  for (const key of question.dimKeys) {
    dimensionCounts[key] = (dimensionCounts[key] ?? 0) + 1;
  }

  return {
    question,
    session: {
      ...session,
      usedQuestionIds: [...session.usedQuestionIds, question.id],
      dimensionCounts,
      typeCounts: {
        ...session.typeCounts,
        [question.type]: (session.typeCounts[question.type] ?? 0) + 1,
      },
      lastType: question.type,
      typeStreak: question.type === session.lastType ? session.typeStreak + 1 : 1,
    },
    exposure: { ...usage, [question.id]: (usage[question.id] ?? 0) + 1 },
  };
}

export function createAdaptiveController(questions, { rng = Math.random } = {}) {
  let session = createAdaptiveSession();
  let exposure = loadExposure();

  return {
    select(levelId, stage) {
      session = startAdaptiveStage(session, stage);
      const selected = selectAdaptiveQuestion({ questions, levelId, session, rng, exposure });
      session = selected.session;
      if (selected.question) {
        exposure = selected.exposure;
        saveExposure(exposure);
        session = {
          ...session,
          lastDifficulty: selected.question.difficulty,
          lastDimKeys: [...selected.question.dimKeys],
        };
      }
      return selected.question;
    },
    // `credit` (0..1, e.g. from the scoring evidence) upgrades routing to the
    // evidence-informed composite; without it the v1 walk still applies.
    record(outcome, credit = null) {
      session = applyAdaptiveOutcome(session, outcome);
      if (typeof credit === "number" && session.lastDifficulty) {
        session = {
          ...session,
          evidence: [...session.evidence, { credit, difficulty: session.lastDifficulty, dimKeys: [...session.lastDimKeys] }],
        };
      }
    },
    reset() {
      session = createAdaptiveSession();
    },
    // Debug/telemetry view for the aiquos.debug flag; never rendered scores.
    debugInfo() {
      return {
        position: session.position,
        target: nextTargetDifficulty(session),
        typeStreak: session.typeStreak,
        evidenceCount: session.evidence.length,
        dimensionCounts: { ...session.dimensionCounts },
      };
    },
    clearExposure() {
      exposure = {};
      saveExposure(exposure);
    },
    getSession() {
      return session;
    },
  };
}
