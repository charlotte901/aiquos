import {
  DIFFICULTY_ANCHORS,
  DIMENSIONS,
} from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const DIMENSION_KEYS = DIMENSIONS.map((dimension) => dimension.key);
const TYPES = ["single", "judge", "multi"];
const ANCHOR = { low: -1, medium: 0, high: 1 };

// Cross-run question exposure counters, best-effort persisted so repeat runs
// spread over the bank instead of re-serving the same favourites forever.
export const ADAPTIVE_EXPOSURE_KEY = "aiquos.adaptive-exposure.v1";
const EXPOSURE_CAP = 6;

// ── CAT v3 stopping configuration ─────────────────────────────────────────
// The objective phase is time-budgeted (~5min), not count-budgeted. Within the
// budget selection runs a classic item-information loop; three rules can end
// it early — the clock, the precision target (standard error of the ability
// estimate), or the item cap for speed demons. A dimension-coverage veto keeps
// any rule from stranding the six-dimension score without evidence.
//
// maxQuestions 是实测校准值，不是拍脑袋定的：用真实引擎 + 真题库跑满三种
// 能力水平（强/中/弱）× 两种作答速度（15s/22s 每题），**每一次都是撞上限
// 才停，没有一次因精度收敛提前结束**——也就是说在 5 分钟预算内，上限就是
// 实际题量。20 题给六维各留出约 3 题的证据量，同时让"能力估计收敛"这条
// 规则真正有机会发挥作用；更少的划线会让它永远不触发。
export const CAT_STOP = {
  minQuestions: 6,   // never stop before: scoring needs a usable evidence base
  precisionFloor: 8, // SE-based early stop only applies from this many answers
  maxQuestions: 20,  // hard cap per run
  seTarget: 0.42,    // ability SE (logit scale) at which theta is "settled"
};

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

// Store access for the backend-authoritative API client: the counters still
// live in localStorage (workers are stateless here), sent with each request
// and replaced by the server's updated copy on success.
export function loadExposureStore() {
  return loadExposure();
}

export function saveExposureStore(counts) {
  saveExposure(counts);
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

// ── CAT v3: item information & test precision ──────────────────────────────
// Under the 1PL model the Fisher information of an item at ability θ is
// p(1-p) — maximised when item difficulty matches θ. Ranking candidates by
// information IS maximum-information selection; dimension need and exposure
// multiply in as content-balance constraints (classic constrained-CAT).
export function itemInformation(theta, difficulty) {
  const p = 1 / (1 + Math.exp(-(theta - ANCHOR[difficulty])));
  return p * (1 - p);
}

// Standard error of the ability estimate: the inverse square root of test
// information (sum of item information over credited evidence). Drives the
// precision stopping rule — stop when theta is measured tightly enough.
export function abilityStandardError(session) {
  const evidence = session.evidence.filter((item) => typeof item.credit === "number");
  if (evidence.length === 0) return null;
  const theta = estimateRunAbility(session);
  let information = 0;
  for (const item of evidence) information += itemInformation(theta, item.difficulty);
  return information > 0 ? 1 / Math.sqrt(information) : null;
}

export function uncoveredDimensionKeys(session, evidenceDimCounts = null) {
  const counts = evidenceDimCounts ?? session.dimensionCounts;
  return DIMENSION_KEYS.filter((key) => (counts[key] ?? 0) === 0);
}

// Stopping decision for the timed objective phase. `bankCanCover` says whether
// the remaining unseen pool still holds items for every uncovered dimension —
// when it does not, the coverage veto steps aside rather than deadlocking.
export function shouldStopCat({
  answered,
  elapsedMs,
  budgetMs,
  standardError,
  uncoveredCount,
  candidatesCanCoverUncovered = true,
}) {
  const timeUp = elapsedMs >= budgetMs;
  if (uncoveredCount > 0 && candidatesCanCoverUncovered) {
    return { stop: false, reason: null };
  }
  if (answered < CAT_STOP.minQuestions) {
    return timeUp && !candidatesCanCoverUncovered
      ? { stop: true, reason: "time" }
      : { stop: false, reason: null };
  }
  if (answered >= CAT_STOP.maxQuestions) return { stop: true, reason: "cap" };
  if (timeUp) return { stop: true, reason: "time" };
  if (
    standardError !== null && standardError <= CAT_STOP.seTarget
    && answered >= CAT_STOP.precisionFloor
  ) {
    return { stop: true, reason: "precision" };
  }
  return { stop: false, reason: null };
}

function dimensionInfoWeights(session) {
  // Dimensions with fewer answered items carry more unknown information.
  return Object.fromEntries(
    DIMENSION_KEYS.map((key) => [key, 1 / (1 + (session.dimensionCounts[key] ?? 0))]),
  );
}

// Selects the next item. `levelId: null` means the whole bank (timed flow),
// which gives the router the full difficulty ladder and dimension spread to
// climb. `coverageCritical` hard-restricts candidates to items touching an
// uncovered dimension — the guarantee behind "the run can always finish".
export function selectAdaptiveQuestion({
  questions,
  levelId = null,
  session,
  rng = Math.random,
  exposure = null,
  coverageCritical = false,
}) {
  const used = new Set(session.usedQuestionIds);
  let candidates = questions.filter((question) =>
    (levelId === null || question.levelId === levelId) && !used.has(question.id));
  if (candidates.length === 0) return { question: null, session };

  const uncovered = new Set(uncoveredDimensionKeys(session));
  if (coverageCritical && uncovered.size > 0) {
    const covering = candidates.filter((question) => question.dimKeys.some((key) => uncovered.has(key)));
    if (covering.length > 0) candidates = covering;
  }

  // Hard variety guard: never serve a third consecutive question of one type
  // while any unused candidate of another type exists.
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
      const information = itemInformation(target, question.difficulty);
      const difficultyDistance = Math.abs(ANCHOR[question.difficulty] - target);
      const dimensionInfo = question.dimKeys.reduce((total, key) => total + (infoWeights[key] ?? 0), 0);
      const dimensionLoad = question.dimKeys.reduce(
        (total, key) => total + (session.dimensionCounts[key] ?? 0),
        0,
      );
      const repeatsType = question.type === session.lastType ? 1 : 0;
      const typeVariety = repeatsType === 0 ? 1 : session.typeStreak >= 2 ? 0 : 0.4;
      const exposurePenalty = 0.12 * Math.min(EXPOSURE_CAP, usage[question.id] ?? 0);
      // With credited evidence ranking is maximum-Fisher-information selection
      // under content-balance constraints; without it the walk-centred
      // information collapses to the v1 difficulty-distance ordering.
      const score = hasEvidence
        ? information * (1 + 1.6 * dimensionInfo) + 0.05 * typeVariety - exposurePenalty
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
        standardError: abilityStandardError(session),
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
