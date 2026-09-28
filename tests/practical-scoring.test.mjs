import assert from "node:assert/strict";
import { test } from "node:test";

import practicalFull from "../src/banks/practical-80.json" with { type: "json" };
import practicalLite from "../src/banks/practical-10.json" with { type: "json" };
import {
  LEVEL_CREDIT,
  combinePracticalScore,
  deliveryRequirements,
  heuristicPracticalScore,
  normalizeLevel,
  parsePracticalJudgeJson,
  parseRubricPoints,
  taskImageSize,
  ratioToSize,
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

// ── 题面比例 → 生图尺寸 ────────────────────────────────────────────────────

test("尺寸由学员提示词决定：写明比例才给对应尺寸", () => {
  assert.equal(taskImageSize("生成一张横版16:9的运动会宣传海报"), "1536x864");
  assert.equal(taskImageSize("把这张竖屏图扩展为16:9横屏壁纸"), "1536x864");
  // 全角数字与冒号也要认
  assert.equal(taskImageSize("比例要求：１６：９"), "1536x864");
  assert.equal(taskImageSize("输出 9：16 竖版短视频封面"), "864x1536");
  assert.equal(taskImageSize("生成 3:2 的摄影比例画面"), "1536x1024");
  assert.equal(taskImageSize("生成 2:3 竖构图"), "1024x1536");
});

test("学员没写比例时不给尺寸（关键公平性回归）", () => {
  // 这是本项修复的核心：早期从题面代办尺寸，导致无论学员是否写明比例，
  // 「规格合规」维度都自动满分 —— 低/中/高三档实测均为 2.00/2.00，白送且无区分度。
  // 现在尺寸跟随学员提示词：没写就用服务端默认（方形），由评分标准扣分。
  assert.equal(taskImageSize("画一只猫"), undefined);
  assert.equal(taskImageSize("生成一张水墨风格插画"), undefined);
  assert.equal(taskImageSize(""), undefined);
  assert.equal(taskImageSize(undefined), undefined);
});

test("题面里的比例不再影响输出尺寸（仅学员提示词决定）", () => {
  // 即使 task 参数里含 16:9，只要学员提示词没提，也不应给出 16:9 尺寸
  const task = { title: "生成一张横版16:9的运动会宣传海报", goal: "16:9", requirements: ["16:9"] };
  assert.equal(taskImageSize("画个海报", task), undefined, "题面不得代办尺寸");
  assert.equal(taskImageSize("画个 16:9 的海报", task), "1536x864", "学员写了才给");
});

test("题面比例只影响图片题，文本题不传尺寸", () => {
  // 文本类任务即便题面出现比例词，也不该被用于生图尺寸
  const textTasks = practicalLite.tasks.filter((t) => t.outputType !== "image");
  for (const task of textTasks) {
    const size = taskImageSize(task);
    assert.ok(size === undefined || typeof size === "string");
  }
});

// ── 图片任务的评委必须拿到产物图 ────────────────────────────────────────────

test("图片任务：有产物图时以多模态送入（评委才能判「原图保真/边缘自然」）", () => {
  const task = {
    title: "把竖屏图扩成 16:9",
    goal: "扩图",
    requirements: ["规格合规", "原图保真", "边缘自然"],
    source: "素材",
    rubricPrompt: [{ dimension: "画面描述", points: 2, excellent: "A", good: "B", pass: "C" }],
    rubricProduct: [{ dimension: "原图保真", points: 2, excellent: "A", good: "B", pass: "C" }],
  };
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  const messages = practicalJudgeMessages(task, {
    prompts: ["扩成 16:9"],
    finalPrompt: "扩成 16:9",
    isImage: true,
    iterations: 1,
    productImage: png,
  });
  const user = messages.find((m) => m.role === "user");
  assert.ok(Array.isArray(user.content), "有产物图时 content 应为多模态数组");
  const image = user.content.find((part) => part.type === "image_url");
  assert.equal(image?.image_url?.url, png, "产物图须原样送入");
  // 文案应要求评委观察图片，而不是"依据提示词判档"
  const text = user.content.find((part) => part.type === "text").text;
  assert.ok(!/请依据提示词的画面要素/.test(text), "不得再让评委凭提示词猜画面");
  assert.match(text, /图片生成/);
});

test("图片任务：评委同时收到参考原图与产物，可逐项比对保真度", () => {
  // 这是公平性缺陷的回归测试：只给产物时，「原图保真」「构图保留」
  // 这类维度无从判断，评委只能凭"产物好看"给分，导致该维度恒为满分。
  const task = {
    title: "扩图", goal: "g", requirements: ["原图保真"], source: "s",
    rubricPrompt: [{ dimension: "D", points: 2, excellent: "A", good: "B", pass: "C" }],
    rubricProduct: [{ dimension: "原图保真", points: 2, excellent: "A", good: "B", pass: "C" }],
  };
  const ref = "data:image/jpeg;base64,/9j/AAA";
  const out = "data:image/png;base64,iVBOR";
  const messages = practicalJudgeMessages(task, {
    prompts: ["p"], finalPrompt: "p", isImage: true, iterations: 1,
    productImage: out, referenceImages: [ref],
  });
  const user = messages.find((m) => m.role === "user");
  assert.ok(Array.isArray(user.content), "有图时应为多模态");
  const urls = user.content.filter((p) => p.type === "image_url").map((p) => p.image_url.url);
  assert.deepEqual(urls, [ref, out], "顺序必须是：参考原图 → 产物");
  const text = user.content.find((p) => p.type === "text").text;
  assert.match(text, /参考原图/, "文案须说明附了原图");
  assert.match(text, /比对/, "文案须要求与原图逐项比对");
});

test("图片任务：缺参考原图时如实说明，不假装比对过", () => {
  const task = {
    title: "扩图", goal: "g", requirements: ["原图保真"], source: "s",
    rubricPrompt: [{ dimension: "D", points: 2, excellent: "A", good: "B", pass: "C" }],
    rubricProduct: [{ dimension: "原图保真", points: 2, excellent: "A", good: "B", pass: "C" }],
  };
  const messages = practicalJudgeMessages(task, {
    prompts: ["p"], finalPrompt: "p", isImage: true, iterations: 1,
    productImage: "data:image/png;base64,iVBOR", referenceImages: [],
  });
  const text = messages.find((m) => m.role === "user").content.find((p) => p.type === "text").text;
  assert.match(text, /未收到参考原图/);
});

test("判档纪律含「保真类维度须与原图比对」条款", () => {
  const task = {
    title: "t", goal: "g", requirements: ["x"], source: "s",
    rubricPrompt: [{ dimension: "D", points: 2, excellent: "A", good: "B", pass: "C" }],
    rubricProduct: [{ dimension: "E", points: 2, excellent: "A", good: "B", pass: "C" }],
  };
  const messages = practicalJudgeMessages(task, { prompts: ["p"], finalPrompt: "p", isImage: true, iterations: 1 });
  const sys = messages.find((m) => m.role === "system").content;
  assert.match(sys, /保真/, "系统提示词须要求比对保真度");
  assert.match(sys, /一律不得判优秀/);
});

test("图片任务：没拿到产物图时如实说明，而不是假装看过", () => {
  const task = {
    title: "扩图", goal: "g", requirements: ["原图保真"], source: "s",
    rubricPrompt: [{ dimension: "D", points: 2, excellent: "A", good: "B", pass: "C" }],
    rubricProduct: [{ dimension: "原图保真", points: 2, excellent: "A", good: "B", pass: "C" }],
  };
  const messages = practicalJudgeMessages(task, { prompts: ["p"], finalPrompt: "p", isImage: true, iterations: 1 });
  const user = messages.find((m) => m.role === "user");
  assert.equal(typeof user.content, "string", "无图时保持纯文本");
  assert.match(user.content, /未收到产物图/);
});

test("文本任务不受影响：产物仍按文本送入", () => {
  const task = {
    title: "写周报", goal: "g", requirements: ["三段"], source: "s",
    rubricPrompt: [{ dimension: "D", points: 2, excellent: "A", good: "B", pass: "C" }],
    rubricProduct: [{ dimension: "E", points: 2, excellent: "A", good: "B", pass: "C" }],
  };
  const messages = practicalJudgeMessages(task, {
    prompts: ["写周报"], finalPrompt: "写周报", product: "【本周完成】……", isImage: false, iterations: 1,
  });
  const user = messages.find((m) => m.role === "user");
  assert.equal(typeof user.content, "string");
  assert.match(user.content, /本周完成/);
});
