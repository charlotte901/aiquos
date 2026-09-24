import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_EDITION,
  EDITIONS,
  editionCount,
  editionMeta,
  editionSummary,
  normalizeEdition,
} from "../src/bank-editions.js";
import { getBankState } from "../worker/bank-store.js";
import { createObjectiveQuestions } from "../worker/objective-quiz.js";
import { createPracticalTasks } from "../worker/practical-tasks.js";
import { validateQuestionBank } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

// ── 版本定义 ────────────────────────────────────────────────────────────────

test("edition ids normalize and default to the lite bank", () => {
  assert.equal(DEFAULT_EDITION, "B");
  for (const input of [null, undefined, "", "z", "C", 42, {}]) {
    assert.equal(normalizeEdition(input), "B", `unexpected edition for ${String(input)}`);
  }
  assert.equal(normalizeEdition("a"), "A", "lowercase must normalize to A");
  assert.equal(normalizeEdition(" A "), "A", "whitespace must be trimmed");
});

test("each edition declares the pool sizes its channels actually serve", () => {
  assert.deepEqual(EDITIONS.A.counts, { objective: 880, practical: 80, comprehensive: 880 });
  assert.deepEqual(EDITIONS.B.counts, { objective: 120, practical: 10, comprehensive: 120 });
  assert.equal(editionCount("A", "objective"), 880);
  assert.equal(editionCount("B", "objective"), 120);
  assert.equal(editionSummary("A"), "全量版 · 客观 880 · 实操 80");
  assert.match(editionMeta("b").label, /精选/);
});

// ── 题池文件 ────────────────────────────────────────────────────────────────

test("the full-edition comprehensive bank is complete and valid", () => {
  const bank = read("../src/banks/comprehensive-880.json");
  assert.equal(bank.questions.length, 880);
  // 综合测评不区分来源，导入时已剥掉 origin。
  assert.ok(bank.questions.every((question) => question.origin === undefined));
  validateQuestionBank(bank.questions);

  // 自适应路由要求每题恰好两个维度键、合法难度，且每关都能凑齐六维。
  const levels = ["academy", "labyrinth", "workshop", "station", "court"];
  for (const question of bank.questions) {
    assert.equal(question.dimKeys.length, 2, `${question.id} 维度键数`);
    assert.ok(["low", "medium", "high"].includes(question.difficulty), `${question.id} 难度`);
    assert.ok(levels.includes(question.levelId), `${question.id} 关卡`);
    assert.ok(question.answer.length > 0, `${question.id} 答案为空`);
  }
  for (const levelId of levels) {
    const inLevel = bank.questions.filter((question) => question.levelId === levelId);
    assert.ok(inLevel.length >= 24, `关卡 ${levelId} 题量不足：${inLevel.length}`);
    const dims = new Set(inLevel.flatMap((question) => question.dimKeys));
    assert.equal(dims.size, 6, `关卡 ${levelId} 只覆盖了 ${dims.size} 个维度`);
  }
});

test("the imported 880 answers are balanced, not skewed to one letter", () => {
  // 源文档 88% 的单选题答案是 B；导入时按题号定种洗牌修正了这一偏斜。
  const bank = read("../worker/objective-questions.json");
  const singles = bank.questions.filter((question) => question.origin === "ai" && question.type === "single");
  const tally = {};
  for (const question of singles) {
    for (const key of question.answer) tally[key] = (tally[key] ?? 0) + 1;
  }
  const total = singles.length;
  for (const key of ["A", "B", "C", "D"]) {
    const share = (tally[key] ?? 0) / total;
    assert.ok(share > 0.15 && share < 0.45, `答案 ${key} 占比异常：${(share * 100).toFixed(1)}%`);
  }
});

test("both practical banks are complete, with requirements on every task", () => {
  for (const [file, expected] of [["../src/banks/practical-80.json", 80], ["../src/banks/practical-10.json", 10]]) {
    const bank = read(file);
    assert.equal(bank.tasks.length, expected, `${file} 任务数`);
    for (const task of bank.tasks) {
      assert.ok(task.goal.length > 0, `${task.id} 缺任务说明`);
      // 源文档里代码类多数没有【实操任务】标签，导入时从评分标准推导；
      // 学员看不到要求就不知道该做什么，所以这里不允许为空。
      assert.ok(task.requirements.length > 0, `${task.id} 缺交付要求`);
      assert.ok(task.standardPrompt.length > 0, `${task.id} 缺标准提示词`);
      assert.ok(task.dimKeys.length >= 2, `${task.id} 维度键不足`);
      assert.ok(["low", "medium", "high"].includes(task.difficulty), `${task.id} 难度非法`);
    }
  }
});

test("the full practical bank covers every level", () => {
  const bank = read("../src/banks/practical-80.json");
  const levels = ["academy", "labyrinth", "workshop", "station", "court"];
  for (const levelId of levels) {
    const count = bank.tasks.filter((task) => task.levelId === levelId).length;
    // 每关都要有题，否则该关的实操环节无题可出。
    assert.ok(count > 0, `关卡 ${levelId} 没有实操任务`);
  }
});

test("tasks that need a reference image carry one that exists on disk", () => {
  const bank = read("../src/banks/practical-10.json");
  const withAssets = bank.tasks.filter((task) => Array.isArray(task.assets) && task.assets.length);
  assert.ok(withAssets.length >= 2, "at least the outpainting and style-transfer tasks need assets");
  for (const task of withAssets) {
    for (const asset of task.assets) {
      assert.match(asset.src, /^\/tasks\//, `${task.id} 资源路径应在 /tasks/ 下`);
      assert.ok(asset.role, `${task.id} 资源缺少 role`);
      // 文件必须真实存在：参考图 404 会让任务无法完成。
      const path = new URL(`../public${asset.src}`, import.meta.url);
      assert.doesNotThrow(() => readFileSync(path), `${asset.src} 不存在`);
    }
  }
});

// ── 服务端按版本选池 ─────────────────────────────────────────────────────────

test("bank store serves a separate pool and version per edition", () => {
  const full = getBankState("A");
  const lite = getBankState("B");
  assert.equal(full.questions.length, 880);
  assert.equal(lite.questions.length, 120);
  assert.equal(full.bankVersion, "objective-bank-v6-880");
  assert.equal(lite.bankVersion, "objective-bank-v6-120");
  assert.equal(full.edition, "A");
  assert.equal(lite.edition, "B");
  // 版本串不同是切版时丢弃旧草稿的依据。
  assert.notEqual(full.bankVersion, lite.bankVersion);
});

test("objective serving splits the two editions by origin", () => {
  // 全量版吃全部 1000 题，精选版只吃 120 道人工精选题。
  const fullAi = createObjectiveQuestions("academy", "ai", () => 0.2, "A");
  const liteAi = createObjectiveQuestions("academy", "ai", () => 0.2, "B");
  assert.equal(fullAi.length, 5);
  assert.equal(liteAi.length, 0, "精选版没有 ai 来源的题");
  assert.equal(createObjectiveQuestions("academy", "human", () => 0.2, "B").length, 5);
});

test("practical serving returns the edition's own tasks", () => {
  const full = createPracticalTasks({ levelId: "all", count: 80, rng: () => 0.2, edition: "A" });
  const lite = createPracticalTasks({ levelId: "all", count: 10, rng: () => 0.2, edition: "B" });
  assert.equal(full.length, 80);
  assert.equal(lite.length, 10);
  // 两个版本的 id 前缀不同，避免跨版本误引用。
  assert.ok(full.every((task) => task.id.startsWith("full-")));
  assert.ok(lite.every((task) => task.id.startsWith("lite-")));
});

test("an unknown edition falls back to the lite bank rather than failing", () => {
  const state = getBankState("nonsense");
  assert.equal(state.edition, "B");
  assert.equal(state.questions.length, 120);
  assert.equal(createPracticalTasks({ levelId: "academy", edition: "nonsense" }).length > 0, true);
});
