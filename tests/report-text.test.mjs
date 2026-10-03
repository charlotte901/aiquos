import test from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_TEXT_LIMITS,
  findUnfoundedNumbers,
  generateReportText,
  parseReportText,
  reportChatMessages,
  reportPromptPayload,
  reportTemplateText,
} from "../src/report-text.js";
import { buildLearningPlan } from "../src/report-learning-plan.js";

function modelWithScore(overall = 78) {
  const base = [
    ["D1", "AI基础认知", 84], ["D2", "提示词工程", 91], ["D3", "AI工具使用", 58],
    ["D4", "AI结果评估与优化", 74], ["D5", "人机协同解决问题", 66], ["D6", "AI伦理与合规", 62],
  ].map(([key, name, score]) => ({ key, name, short: name.slice(0, 2), score, evidenceCount: 8 }));
  return {
    dimensions: base,
    overallScore: overall,
    grade: overall >= 90 ? "S" : overall >= 80 ? "A" : overall >= 70 ? "B" : overall >= 60 ? "C" : "D",
    channelOveralls: { objective: 80, interview: 74, practical: 70 },
    recommendations: { priorities: [] },
    detail: { completedAtText: "2026年10月3日 14:30", questionCountText: "42/44 题", modelText: "六维评分模型 v1.0.0" },
  };
}

const planFor = (model) => buildLearningPlan(model);

test("prompt payload carries only real measurement data, no invented context", () => {
  const model = modelWithScore();
  const payload = reportPromptPayload(model, planFor(model));
  assert.equal(payload.overallScore, 78);
  assert.equal(payload.dimensions.length, 6);
  assert.deepEqual(payload.dimensions.map((d) => d.score), [84, 91, 58, 74, 66, 62]);
  assert.equal(payload.channelOveralls["客观题"], 80);
  assert.ok(payload.resourceTitles.length > 0);
  // 不得夹带任何未提供的信息（经历、案例、时间等）
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /经历|案例|项目|story|example/iu);
});

test("system prompt fixes the three-part structure with per-section limits", () => {
  const messages = reportChatMessages(modelWithScore(), planFor(modelWithScore()));
  assert.equal(messages[0].role, "system");
  const system = messages[0].content;
  assert.match(system, /evaluation/);
  assert.match(system, /advice/);
  assert.match(system, /resources/);
  // 字数上限必须写进 prompt（报告要在两页内）
  for (const limit of Object.values(REPORT_TEXT_LIMITS)) {
    assert.ok(system.includes(String(limit)), `prompt should state the ${limit}-character limit`);
  }
  // 关键约束：只用给定数据、JSON 输出
  assert.match(system, /只能使用给定数据/);
  assert.match(system, /JSON/);
  assert.equal(messages[1].role, "user");
});

test("parser tolerates code fences and chatter but rejects unusable output", () => {
  const good = '```json\n{"evaluation":"评价内容一","advice":"建议内容二","resources":"资源导语三"}\n```';
  const parsed = parseReportText(good);
  assert.equal(parsed.evaluation, "评价内容一");
  assert.equal(parsed.advice, "建议内容二");

  const chatty = '好的，这是结果：\n{"evaluation":"甲","advice":"乙","resources":"丙"}\n希望有帮助！';
  assert.equal(parseReportText(chatty).evaluation, "甲");

  assert.equal(parseReportText(""), null);
  assert.equal(parseReportText("完全不是 JSON"), null);
  assert.equal(parseReportText("{ 坏掉的 json"), null);
  // 超限 1.5 倍判为不可用（模型没守规则）：该段置空，由模板补齐
  const tooLong = JSON.stringify({ evaluation: "字".repeat(REPORT_TEXT_LIMITS.evaluation * 2), advice: "乙", resources: "丙" });
  assert.equal(parseReportText(tooLong).evaluation, null);
  // 轻微超出直接截断并加省略号
  const slight = JSON.stringify({ evaluation: "字".repeat(REPORT_TEXT_LIMITS.evaluation + 10), advice: "乙", resources: "丙" });
  const trimmed = parseReportText(slight);
  assert.ok(trimmed.evaluation.length <= REPORT_TEXT_LIMITS.evaluation);
  assert.match(trimmed.evaluation, /…$/u);
});

test("template fallback is derived from real scores only", () => {
  const model = modelWithScore();
  const plan = planFor(model);
  const text = reportTemplateText(model, plan);
  for (const key of ["evaluation", "advice", "resources"]) {
    assert.ok(typeof text[key] === "string" && text[key].length > 10, `${key} should be filled`);
  }
  // 模板里的数字必须来自真实数据
  assert.deepEqual(findUnfoundedNumbers(text.evaluation, model, plan), []);
  assert.deepEqual(findUnfoundedNumbers(text.advice, model, plan), []);
  // 最弱维度必须被点名
  assert.match(text.advice, /AI工具使用/);
});

test("generateReportText prefers the model and degrades to the template", async () => {
  const model = modelWithScore();
  const plan = planFor(model);

  // 模型可用：用模型文案
  const fromModel = await generateReportText(model, plan, async () =>
    JSON.stringify({ evaluation: "模型写的评价。", advice: "模型写的建议。", resources: "模型写的导语。" }));
  assert.equal(fromModel.source, "model");
  assert.equal(fromModel.text.evaluation, "模型写的评价。");

  // 模型抛错：整体降级
  const onError = await generateReportText(model, plan, async () => { throw new Error("offline"); });
  assert.equal(onError.source, "template");
  assert.match(onError.text.evaluation, /总分/);

  // 模型返回垃圾：降级
  const onJunk = await generateReportText(model, plan, async () => "不是 JSON");
  assert.equal(onJunk.source, "template");

  // 模型只写了一段：缺的用模板补，不整份丢弃
  const partial = await generateReportText(model, plan, async () =>
    JSON.stringify({ evaluation: "只有这一段。" }));
  assert.equal(partial.source, "model");
  assert.equal(partial.text.evaluation, "只有这一段。");
  assert.ok(partial.text.advice.length > 10, "missing sections should fall back to the template");

  // 没有注入 chat：直接用模板（node 环境）
  const noChat = await generateReportText(model, plan, null);
  assert.equal(noChat.source, "template");
});

test("findUnfoundedNumbers flags invented figures", () => {
  const model = modelWithScore();
  const plan = planFor(model);
  // 真实数字：放行
  assert.deepEqual(findUnfoundedNumbers("总分 78 分，提示词工程 91 分，满分 100。", model, plan), []);
  // 编造数字：拦截
  const flagged = findUnfoundedNumbers("你在 3 个月里完成了 17 个项目，超过 95% 的同学。", model, plan);
  assert.ok(flagged.includes("3"));
  assert.ok(flagged.includes("17"));
  assert.ok(flagged.includes("95"));
});
