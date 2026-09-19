import test from "node:test";
import assert from "node:assert/strict";
import {
  detectNavigation,
  executeSkill,
  findCase,
  parseDirectives,
  searchCases,
  stripDirectives,
} from "../src/agent-skills.js";

test("navigation fires when an action verb meets a destination", () => {
  assert.deepEqual(detectNavigation("带我去案例库看看"), { target: "cases" });
  assert.deepEqual(detectNavigation("帮我打开论坛"), { target: "forum" });
  assert.deepEqual(detectNavigation("怎么开始 AI 测评？"), { target: "assessment" });
  assert.deepEqual(detectNavigation("回到首页"), { target: "home" });
});

test("knowledge questions do not trigger navigation", () => {
  assert.equal(detectNavigation("案例库有什么好玩的？"), null);
  assert.equal(detectNavigation("测评都考些什么内容？"), null);
  assert.equal(detectNavigation("你好呀"), null);
});

test("stripDirectives removes skill directives but keeps the prose", () => {
  const text = "好嘞，案例库有很多宝藏！[[go:cases]]\n推荐这个：[[recommend-case:case-cat-glasses]]";
  assert.equal(stripDirectives(text), "好嘞，案例库有很多宝藏！\n推荐这个：");
});

test("stripDirectives also drops a half-streamed directive at the tail", () => {
  assert.equal(stripDirectives("没问题！[[go:for"), "没问题！");
  assert.equal(stripDirectives("干净的一句话"), "干净的一句话");
});

test("parseDirectives extracts actions and arguments in order", () => {
  const directives = parseDirectives("[[go:forum]] 随便说说 [[search-cases:黑猫]]");
  assert.deepEqual(directives, [
    { action: "go", argument: "forum" },
    { action: "search-cases", argument: "黑猫" },
  ]);
  assert.deepEqual(parseDirectives("没有指令"), []);
});

test("searchCases finds the glasses cat by keyword", () => {
  const [top] = searchCases("黑猫");
  assert.equal(top.id, "case-cat-glasses");
});

test("searchCases ranks the mario game for game keywords", () => {
  const [top] = searchCases("马里奥 游戏");
  assert.match(top.title, /马里奥/);
});

test("searchCases returns nothing for empty noise", () => {
  assert.deepEqual(searchCases(""), []);
});

test("executeSkill routes navigation and reports unknown ids", () => {
  const calls = [];
  const handlers = {
    go: (view) => calls.push(["go", view]),
    searchCases: (keyword) => calls.push(["search", keyword]),
    openCase: (id, action) => calls.push(["open", id, action]),
  };
  assert.equal(executeSkill({ action: "go", argument: "forum" }, handlers), true);
  assert.equal(executeSkill({ action: "go", argument: "mars" }, handlers), false);
  assert.equal(executeSkill({ action: "recommend-case", argument: "case-cat-glasses" }, handlers), true);
  assert.equal(executeSkill({ action: "open-case", argument: "not-a-case" }, handlers), false);
  assert.deepEqual(calls, [
    ["go", "forum"],
    ["open", "case-cat-glasses", "recommend-case"],
  ]);
});

test("findCase resolves real ids and rejects invented ones", () => {
  assert.equal(findCase("case-cat-glasses")?.tag, "AI 生图");
  assert.equal(findCase("nope"), null);
});
