const DIMENSION_KEYS = ["D1", "D2", "D3", "D4", "D5", "D6"];
const TYPES = ["single", "judge", "multi"];
const DIFFICULTY_INDEX = { low: 0, medium: 1, high: 2 };

export function createAdaptiveSession() {
  return {
    position: 1,
    usedQuestionIds: [],
    dimensionCounts: Object.fromEntries(DIMENSION_KEYS.map((key) => [key, 0])),
    typeCounts: Object.fromEntries(TYPES.map((type) => [type, 0])),
    lastType: null,
    activeStage: null,
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

export function selectAdaptiveQuestion({ questions, levelId, session, rng = Math.random }) {
  const used = new Set(session.usedQuestionIds);
  const candidates = questions
    .filter((question) => question.levelId === levelId && !used.has(question.id))
    .map((question, order) => ({
      question,
      order,
      difficultyDistance: Math.abs(DIFFICULTY_INDEX[question.difficulty] - session.position),
      dimensionLoad: question.dimKeys.reduce(
        (total, key) => total + (session.dimensionCounts[key] ?? 0),
        0,
      ),
      repeatsType: question.type === session.lastType ? 1 : 0,
    }))
    .sort((left, right) =>
      left.difficultyDistance - right.difficultyDistance
      || left.dimensionLoad - right.dimensionLoad
      || left.repeatsType - right.repeatsType
      || left.order - right.order,
    );

  if (candidates.length === 0) return { question: null, session };

  const shortlist = candidates.slice(0, 3);
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
    },
  };
}

function isCountMap(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length
    && keys.every((key) => Number.isInteger(value[key]) && value[key] >= 0);
}

function cloneAdaptiveSession(session, questions) {
  const knownQuestionIds = new Set(questions.map((question) => question.id));
  const validPosition = Number.isFinite(session?.position)
    && session.position >= DIFFICULTY_INDEX.low
    && session.position <= DIFFICULTY_INDEX.high;
  const validUsedIds = Array.isArray(session?.usedQuestionIds)
    && session.usedQuestionIds.every((id) => typeof id === "string" && id && knownQuestionIds.has(id))
    && new Set(session.usedQuestionIds).size === session.usedQuestionIds.length;
  const validLastType = session?.lastType === null || TYPES.includes(session?.lastType);
  const validStage = session?.activeStage === null
    || (Number.isInteger(session?.activeStage) && session.activeStage >= 1 && session.activeStage <= 5);

  if (
    !validPosition
    || !validUsedIds
    || !isCountMap(session?.dimensionCounts, DIMENSION_KEYS)
    || !isCountMap(session?.typeCounts, TYPES)
    || !validLastType
    || !validStage
  ) {
    throw new TypeError("Invalid adaptive session");
  }

  return {
    position: session.position,
    usedQuestionIds: [...session.usedQuestionIds],
    dimensionCounts: { ...session.dimensionCounts },
    typeCounts: { ...session.typeCounts },
    lastType: session.lastType,
    activeStage: session.activeStage,
  };
}

export function createAdaptiveController(questions, { rng = Math.random, initialSession } = {}) {
  let session = cloneAdaptiveSession(initialSession ?? createAdaptiveSession(), questions);

  return {
    select(levelId, stage) {
      session = startAdaptiveStage(session, stage);
      const selected = selectAdaptiveQuestion({ questions, levelId, session, rng });
      session = selected.session;
      return selected.question;
    },
    record(outcome) {
      session = applyAdaptiveOutcome(session, outcome);
    },
    snapshot() {
      return cloneAdaptiveSession(session, questions);
    },
    restore(nextSession) {
      session = cloneAdaptiveSession(nextSession, questions);
      return cloneAdaptiveSession(session, questions);
    },
    reset() {
      session = createAdaptiveSession();
    },
  };
}
