export const SCORING_VERSION = "1.0.0";
export const DIFFICULTY_ANCHORS = Object.freeze({ low: -1, medium: 0, high: 1 });
export const DIMENSIONS = Object.freeze([
  { key: "D1", name: "AI基础认知", short: "认知" },
  { key: "D2", name: "提示词工程", short: "提示" },
  { key: "D3", name: "AI工具使用", short: "工具" },
  { key: "D4", name: "AI结果评估与优化", short: "评估" },
  { key: "D5", name: "人机协同解决问题", short: "协同" },
  { key: "D6", name: "AI伦理与合规", short: "伦理" },
]);

const TYPES = new Set(["single", "multi", "judge"]);
const DIMENSION_KEYS = new Set(DIMENSIONS.map((dimension) => dimension.key));
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function validateQuestion(question) {
  if (!question || typeof question !== "object") throw new TypeError("题目必须是对象");
  if (!question.id || typeof question.id !== "string") throw new Error("题目需要 id");
  if (!TYPES.has(question.type)) throw new Error("未知题型/unknown question type");
  if (!Object.hasOwn(DIFFICULTY_ANCHORS, question.difficulty)) throw new Error("未知难度/unknown difficulty");
  if (!Array.isArray(question.options) || question.options.length === 0) throw new Error("选项不能为空/options required");
  const optionKeys = question.options.map((option) => option?.key);
  if (optionKeys.some((key) => typeof key !== "string" || !key)) throw new Error("选项 key 无效/invalid option key");
  if (new Set(optionKeys).size !== optionKeys.length) throw new Error("重复选项/duplicate option");
  if (!Array.isArray(question.answer) || question.answer.length === 0) throw new Error("答案不能为空/answer required");
  if (new Set(question.answer).size !== question.answer.length) throw new Error("重复答案/duplicate answer");
  if (question.answer.some((key) => !optionKeys.includes(key))) throw new Error("答案包含未知选项/answer option missing");
  if (!Array.isArray(question.dimKeys) || question.dimKeys.length === 0) throw new Error("维度不能为空/dimKeys required");
  if (new Set(question.dimKeys).size !== question.dimKeys.length || question.dimKeys.some((key) => !DIMENSION_KEYS.has(key))) {
    throw new Error("未知维度/unknown dimension");
  }
  return true;
}

export function validateQuestionBank(questions) {
  if (!Array.isArray(questions)) throw new TypeError("题库必须是数组/question bank must be an array");
  const ids = new Set();
  for (const question of questions) {
    validateQuestion(question);
    if (ids.has(question.id)) throw new Error("重复题目/duplicate question id");
    ids.add(question.id);
  }
  return true;
}

function validateSelectedKeys(question, selectedKeys) {
  if (!Array.isArray(selectedKeys)) throw new TypeError("选择必须是数组/selected keys must be an array");
  const optionKeys = new Set(question.options.map((option) => option.key));
  if (selectedKeys.some((key) => !optionKeys.has(key))) throw new Error("选择包含未知选项/unknown option");
}

export function calculateQuestionCredit(question, selectedKeys) {
  validateQuestion(question);
  validateSelectedKeys(question, selectedKeys);
  const selected = new Set(selectedKeys);
  const expected = new Set(question.answer);
  const exact = selected.size === expected.size && [...selected].every((key) => expected.has(key));
  if (exact) return 1;
  if (question.type !== "multi") return 0;
  if (selected.size === question.options.length && expected.size < question.options.length) return 0;
  if (selected.size === 0) return 0;
  const hits = [...selected].filter((key) => expected.has(key)).length;
  const wrong = [...selected].filter((key) => !expected.has(key)).length;
  return clamp(hits / expected.size - 0.6 * (wrong / selected.size), 0, 1);
}

export function createResponseEvidence(question, selectedKeys, answeredAt) {
  validateQuestion(question);
  validateSelectedKeys(question, selectedKeys);
  const uniqueSelectedKeys = [...new Set(selectedKeys)];
  return {
    questionId: question.id,
    type: question.type,
    difficulty: question.difficulty,
    dimKeys: [...new Set(question.dimKeys)],
    selectedKeys: uniqueSelectedKeys,
    credit: calculateQuestionCredit(question, uniqueSelectedKeys),
    answeredAt,
  };
}

const sigmoid = (value) => 1 / (1 + Math.exp(-value));

export function estimateDimension(evidence, dimensionKey) {
  const relevant = evidence.filter((item) => item.dimKeys.includes(dimensionKey));
  if (relevant.length === 0) return null;
  let low = -8;
  let high = 8;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const theta = (low + high) / 2;
    const derivative = relevant.reduce(
      (sum, item) => sum + item.credit - sigmoid(theta - DIFFICULTY_ANCHORS[item.difficulty]),
      -theta,
    );
    if (derivative > 0) low = theta;
    else high = theta;
  }
  return Math.round(100 * sigmoid((low + high) / 2));
}

export function gradeOverall(score) {
  if (score === null || score === undefined) return null;
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

export function scoreAssessment(evidence, { totalQuestions }) {
  if (!Array.isArray(evidence)) throw new TypeError("证据必须是数组/evidence must be an array");
  if (!Number.isInteger(totalQuestions) || totalQuestions < 0) throw new Error("题目总数无效/invalid totalQuestions");
  if (evidence.length > totalQuestions) throw new Error("回答数量超过题目总数/response count exceeds totalQuestions");
  const ids = new Set();
  for (const item of evidence) {
    if (!item || typeof item !== "object" || !item.questionId) throw new Error("回答证据无效/invalid response evidence");
    if (ids.has(item.questionId)) throw new Error("重复回答/duplicate response questionId");
    ids.add(item.questionId);
    if (!Object.hasOwn(DIFFICULTY_ANCHORS, item.difficulty)) throw new Error("未知难度/unknown difficulty");
    if (!Array.isArray(item.dimKeys) || item.dimKeys.some((key) => !DIMENSION_KEYS.has(key))) throw new Error("未知维度/unknown dimension");
  }
  const dimensions = DIMENSIONS.map((dimension) => {
    const evidenceCount = evidence.filter((item) => item.dimKeys.includes(dimension.key)).length;
    return { ...dimension, score: estimateDimension(evidence, dimension.key), evidenceCount };
  });
  const complete = evidence.length === totalQuestions && dimensions.every((dimension) => dimension.score !== null);
  const overallScore = complete ? Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / DIMENSIONS.length) : null;
  return {
    scoringVersion: SCORING_VERSION,
    status: evidence.length === 0 ? "not_started" : evidence.length === totalQuestions ? "completed" : "in_progress",
    answeredCount: evidence.length,
    totalQuestions,
    dimensions,
    overallScore,
    grade: complete ? gradeOverall(overallScore) : null,
  };
}
