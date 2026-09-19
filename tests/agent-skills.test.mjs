import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKnowledgeContext,
  caseCatalogLine,
  searchCases,
} from "../src/agent-skills.js";

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

test("caseCatalogLine lists every real case title with its tag", () => {
  const line = caseCatalogLine();
  assert.match(line, /戴眼镜的黑猫 · 宣纸水墨神态捕捉（AI 生图）/);
  assert.match(line, /（AI 代码）/);
});

test("knowledge context injects matched cases with real data", () => {
  const context = buildKnowledgeContext("水墨风格的图怎么用提示词写出来？");
  assert.match(context, /戴眼镜的黑猫/);
  assert.match(context, /提示词开头/);
  assert.match(context, /模型/);
});

test("knowledge context injects the real assessment ladder for learning-path questions", () => {
  const context = buildKnowledgeContext("我该从哪一步开始学？给我一个学习路径");
  assert.match(context, /智核学院/);
  assert.match(context, /智核觉醒报告/);
  assert.match(context, /考察：/);
});

test("knowledge context injects forum channels for community questions", () => {
  const context = buildKnowledgeContext("论坛里大家都在讨论什么？");
  assert.match(context, /AI 生图 \d+ 帖/);
  assert.match(context, /提示词、模型参数/);
});

test("knowledge context stays empty for small talk that needs no data", () => {
  assert.equal(buildKnowledgeContext("你叫什么名字呀？"), "");
});
