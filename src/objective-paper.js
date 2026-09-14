import { validateQuestionBank } from "../skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const DIMENSION_KEYS = ["D1", "D2", "D3", "D4", "D5", "D6"];
const ZERO_SEED_STATE = 0x9e3779b9;
const UINT32_MAX = 0xffffffff;
const BLUEPRINT = [
  ["low", "low", "low", "low", "low"],
  ["low", "low", "medium", "medium", "medium"],
  ["medium", "medium", "medium", "medium", "medium"],
  ["medium", "medium", "high", "high", "high"],
  ["high", "high", "high", "high", "high"],
];
const EXPECTED_DIFFICULTIES = { low: 7, medium: 10, high: 8 };

function requireUint32(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new TypeError("Objective paper seed must be a uint32");
  }
  return seed;
}

function createXorshift32(seed) {
  let state = seed === 0 ? ZERO_SEED_STATE : seed;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state >>>= 0;
    state ^= state << 5;
    state >>>= 0;
    return state / (UINT32_MAX + 1);
  };
}

function validatePaper(paper, questionsById) {
  if (paper.stages.length !== BLUEPRINT.length || paper.questionIds.length !== 25) {
    throw new Error("Objective paper is incomplete");
  }
  if (new Set(paper.questionIds).size !== paper.questionIds.length) {
    throw new Error("Objective paper contains duplicate question IDs");
  }

  const totals = { low: 0, medium: 0, high: 0 };
  const dimensions = new Set();
  for (const [stageIndex, stage] of paper.stages.entries()) {
    if (stage.stage !== stageIndex + 1 || stage.questionIds.length !== BLUEPRINT[stageIndex].length) {
      throw new Error("Objective paper stage quota is invalid");
    }
    for (const [slotIndex, id] of stage.questionIds.entries()) {
      const question = questionsById.get(id);
      if (!question || question.difficulty !== BLUEPRINT[stageIndex][slotIndex]) {
        throw new Error("Objective paper difficulty quota is invalid");
      }
      totals[question.difficulty] += 1;
      question.dimKeys.forEach((key) => dimensions.add(key));
    }
  }
  for (const [difficulty, count] of Object.entries(EXPECTED_DIFFICULTIES)) {
    if (totals[difficulty] !== count) throw new Error("Objective paper difficulty quota is invalid");
  }
  if (!DIMENSION_KEYS.every((key) => dimensions.has(key))) {
    throw new Error("Objective paper does not cover all six dimensions");
  }
}

export function createObjectivePaper(questions, { seed } = {}) {
  validateQuestionBank(questions);
  const originalSeed = requireUint32(seed);
  const random = createXorshift32(originalSeed);
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const usedIds = new Set();
  const dimensionLoads = Object.fromEntries(DIMENSION_KEYS.map((key) => [key, 0]));
  let lastType = null;

  const stages = BLUEPRINT.map((slots, stageIndex) => {
    const questionIds = slots.map((difficulty) => {
      const candidates = questions
        .filter((question) => question.difficulty === difficulty && !usedIds.has(question.id))
        .map((question) => ({
          question,
          dimensionLoad: question.dimKeys.reduce((sum, key) => sum + dimensionLoads[key], 0),
          repeatsType: question.type === lastType ? 1 : 0,
          tieValue: random(),
        }))
        .sort((left, right) =>
          left.dimensionLoad - right.dimensionLoad
          || left.repeatsType - right.repeatsType
          || left.tieValue - right.tieValue,
        );
      const selected = candidates[0]?.question;
      if (!selected) {
        throw new Error(`Cannot fill objective paper: no unused ${difficulty} question for stage ${stageIndex + 1}`);
      }
      usedIds.add(selected.id);
      selected.dimKeys.forEach((key) => {
        dimensionLoads[key] += 1;
      });
      lastType = selected.type;
      return selected.id;
    });
    return { stage: stageIndex + 1, questionIds };
  });
  const paper = { seed: originalSeed, stages, questionIds: stages.flatMap((stage) => stage.questionIds) };
  validatePaper(paper, questionsById);
  return paper;
}

export function createObjectiveSeed(cryptoObject) {
  if (!cryptoObject || typeof cryptoObject.getRandomValues !== "function") {
    throw new Error("Secure random generation is unavailable");
  }
  const values = new Uint32Array(1);
  cryptoObject.getRandomValues(values);
  return values[0];
}
