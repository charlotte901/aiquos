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
