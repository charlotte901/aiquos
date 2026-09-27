import assert from "node:assert/strict";
import { test } from "node:test";

import practicalFull from "../src/banks/practical-80.json" with { type: "json" };
import {
  LEVEL_CREDIT,
  combinePracticalScore,
  deliveryRequirements,
  heuristicPracticalScore,
  normalizeLevel,
  parsePracticalJudgeJson,
  parseRubricPoints,
  practicalJudgeMessages,
  scorePracticalResult,
  scoreRubric,
  scoringSchemeRows,
} from "../src/practical-scoring.js";
import { handlePracticalScore, PRACTICAL_SCORE_PATH } from "../worker/practical-score.js";

const task = practicalFull.tasks[0];
const allExcellent = Object.fromEntries(task.rubricPrompt.map((row) => [row.dimension, { level: "excellent", comment: "到位" }]));
const allGood = Object.fromEntries(task.rubricPrompt.map((row) => [row.dimension, { level: "good" }]));

test("rubric points parse from Chinese point strings", () => {
  assert.equal(parseRubricPoints("2分"), 2);
  assert.equal(parseRubricPoints("3 分"), 3);
  assert.equal(parseRubricPoints(null), 2);
  assert.equal(parseRubricPoints("n/a"), 2);
});

test("level normalization accepts canonical keys and Chinese aliases", () => {
  assert.equal(normalizeLevel("excellent"), "excellent");
  assert.equal(normalizeLevel("GOOD"), "good");
  assert.equal(normalizeLevel("优"), "excellent");
  assert.equal(normalizeLevel("待改进"), "pass");
  assert.equal(normalizeLevel("banana"), null);
});

test("scoreRubric maps levels deterministically onto each dimension", () => {
  const full = scoreRubric(task.rubricPrompt, allExcellent);
  assert.equal(full.rows.length, 5);
  assert.equal(full.max, 10);
  assert.equal(full.awarded, 10);
  assert.equal(full.rows[0].levelLabel, "优秀");

  const good = scoreRubric(task.rubricPrompt, allGood);
  // 5 × 2 × 0.75 = 7.5
  assert.equal(good.awarded, 7.5);

  // 缺失维度按 pass 计：拿不到证据不奖励。
  const missing = scoreRubric(task.rubricPrompt, {});
  assert.equal(missing.awarded, 2.5);
  assert.equal(missing.rows.every((row) => row.level === "pass"), true);

  // 非法档位同样落到 pass，而不是抛错。
  const bogus = scoreRubric(task.rubricPrompt, { [task.rubricPrompt[0].dimension]: { level: "超级" } });
  assert.equal(bogus.rows[0].level, "pass");
});

test("combinePracticalScore clamps credit to 0..1 and keeps 20-point scale", () => {
  const productGood = Object.fromEntries(task.rubricProduct.map((row) => [row.dimension, { level: "good" }]));
  const prompt = scoreRubric(task.rubricPrompt, allExcellent);
  const product = scoreRubric(task.rubricProduct, productGood);
  const combined = combinePracticalScore(prompt, product);
  assert.equal(combined.maxScore, 20);
  assert.equal(combined.totalScore, 17.5);
  assert.equal(combined.credit, 0.88);

  const zero = combinePracticalScore(
    { rows: [], awarded: 0, max: 0 },
    { rows: [], awarded: 0, max: 0 },
  );
  assert.equal(zero.credit, 0);
});

test("requirements split into delivery items and scoring-scheme meta rows", () => {
  const delivery = deliveryRequirements(task);
  const scheme = scoringSchemeRows(task);
  assert.equal(scheme.length > 0, true);
  assert.equal(scheme.every((row) => /^评分标准/.test(row)), true);
  assert.equal(delivery.some((row) => /^评分标准/.test(row)), false);
  assert.equal(delivery.length + scheme.length, task.requirements.length);
});

test("judge message builder includes rubric and standards but stays bounded", () => {
  const messages = practicalJudgeMessages(task, {
    prompts: ["第一版", "第二版更具体"],
    finalPrompt: "第二版更具体",
    product: "产出文本",
    iterations: 2,
  });
  assert.equal(messages.length, 2);
  const user = messages[1].content;
  assert.match(user, /评分标准一/);
  assert.match(user, /评分标准二/);
  assert.match(user, /参考提示词/);
  assert.match(user, /第 2 次：第二版更具体/);
  assert.ok(user.length < 12000);
});

test("parsePracticalJudgeJson accepts fenced json and rejects broken payloads", () => {
  const fenced = "```json\n{\"prompt\":[{\"dimension\":\"角色设定\",\"level\":\"excellent\",\"comment\":\"有角色\"}],\"product\":[]}\n```";
  const parsed = parsePracticalJudgeJson(fenced);
  assert.equal(parsed.prompt["角色设定"].level, "excellent");
  assert.equal(parsePracticalJudgeJson("瞎写的"), null);
  assert.equal(parsePracticalJudgeJson('{"prompt": [], "product": []}'), null);
});

test("heuristic scoring is deterministic, rubric-shaped and bounded", () => {
  const input = {
    prompts: ["你是资深工程师。目标：修好这段代码。要求：指出问题，给出可直接运行的修正代码，输出格式为分点说明，附上异常处理。素材如下：import openai……"],
    finalPrompt: "你是资深工程师。目标：修好这段代码。要求：指出问题，给出可直接运行的修正代码，输出格式为分点说明，附上异常处理。素材如下：import openai……",
    product: "问题定位：旧版 SDK 接口弃用且未设 base_url。修正代码：client = openai.OpenAI(...)。解释：逐条解释问题和修正原因，代码规范含注释与异常处理。",
    iterations: 1,
  };
  const first = heuristicPracticalScore(task, input);
  const second = heuristicPracticalScore(task, input);
  assert.deepEqual(first, second);
  assert.equal(first.judged, "heuristic");
  assert.equal(first.prompt.rows.length, 5);
  assert.equal(first.product.rows.length, 5);
  assert.equal(first.maxScore, 20);
  assert.ok(first.credit > 0.5, `丰富作答应拿到过半分数，实际 ${first.credit}`);

  const weak = heuristicPracticalScore(task, {
    prompts: ["帮我看看"],
    finalPrompt: "帮我看看",
    product: "不知道",
    iterations: 1,
  });
  assert.ok(weak.credit < first.credit, "贫乏作答的得分应低于丰富作答");
  assert.ok(weak.credit >= 0 && weak.credit <= 1);
});

test("scorePracticalResult never leaks rubric or standards into its payload", () => {
  const result = scorePracticalResult(task, {
    prompt: allExcellent,
    product: allGood,
  }, "llm");
  const serialized = JSON.stringify(result);
  assert.equal(result.judged, "llm");
  assert.ok(!serialized.includes("standardPrompt"));
  assert.ok(!serialized.includes("standardProduct"));
});

// ── worker 路由 ──────────────────────────────────────────────────────────────

const post = (body) => new Request(`https://example.test${PRACTICAL_SCORE_PATH}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const judgeJson = JSON.stringify({
  prompt: task.rubricPrompt.map((row) => ({ dimension: row.dimension, level: "excellent", comment: "完整" })),
  product: task.rubricProduct.map((row) => ({ dimension: row.dimension, level: "good", comment: "基本达标" })),
});

const okDeepSeek = async () => new Response(JSON.stringify({
  choices: [{ message: { content: judgeJson } }],
}), { status: 200 });

test("practical score route: 405 on GET, 404 on unknown task", async () => {
  const get = await handlePracticalScore(new Request(`https://example.test${PRACTICAL_SCORE_PATH}`));
  assert.equal(get.status, 405);

  const missing = await handlePracticalScore(post({ taskId: "nope", prompt: "x" }));
  assert.equal(missing.status, 404);
});

test("practical score route: without an API key it returns heuristic rubric scoring", async () => {
  const response = await handlePracticalScore(post({
    taskId: task.id,
    edition: "A",
    prompt: "你是资深工程师，请指出问题并给出修正代码",
    prompts: ["你是资深工程师，请指出问题并给出修正代码"],
    product: "问题与修正说明",
    iterations: 1,
  }), undefined);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.judged, "heuristic");
  assert.equal(payload.prompt.rows.length, 5);
  assert.equal(payload.product.rows.length, 5);
  assert.ok(payload.credit >= 0 && payload.credit <= 1);
});

test("practical score route: LLM path maps levels to points and hides standards", async () => {
  const response = await handlePracticalScore(post({
    taskId: task.id,
    edition: "A",
    prompt: "最终提示词",
    prompts: ["最终提示词"],
    product: "最终产物",
    iterations: 1,
  }), "test-key", okDeepSeek);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.judged, "llm");
  assert.equal(payload.prompt.awarded, 10);
  assert.equal(payload.product.awarded, 7.5);
  assert.equal(payload.totalScore, 17.5);
  assert.equal(payload.credit, 0.88);
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes("standardPrompt"));
  assert.ok(!serialized.includes(task.standardProduct.slice(0, 24)));
});

test("practical score route: upstream garbage falls back to heuristic", async () => {
  const broken = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "评委今天不想说话" } }],
  }), { status: 200 });
  const response = await handlePracticalScore(post({
    taskId: task.id,
    edition: "A",
    prompt: "提示词",
    product: "产物",
  }), "test-key", broken);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).judged, "heuristic");
});
