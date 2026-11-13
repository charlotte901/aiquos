// 知识库 schema 守卫测试：分类骨架完整性、URL 具体页规则、三道门、六维配额。
// 知识库本体（src/knowledge/knowledge-base.json）的整库检查在
// tests/knowledge-library.test.mjs（阶段 2 接入后启用）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  SUBTOPICS, SUBTOPIC_IDS, subtopicsOf, subtopicById,
  validateKnowledgeEntry, admitKnowledgeEntry, isSpecificPageUrl,
  checkDimensionQuotas, findDuplicates,
  KNOWLEDGE_TYPES, DIFFICULTIES, BANDS, DIFFICULTY_OF_BAND, BAND_OF_DIFFICULTY, MIN_QUALITY,
} from "../src/knowledge/schema.js";

const validEntry = () => ({
  id: "kb-000001",
  title: "结构化提示四段式入门",
  url: "https://www.bilibili.com/video/BV1cy4y1p7vp",
  source: "bilibili",
  type: "video",
  dims: ["D2"],
  subtopic: "structured-prompt",
  difficulty: "medium",
  band: "developing",
  summary: "用角色、目标、约束、示例四段结构组织提示词，并逐项自查。",
  why: "对话通道显示你描述任务较笼统，四段式能直接补结构化短板。",
  quality: 4.5,
  signals: { views: 5353299, durationMin: 133, date: "2021-01-25", verifiedAt: "2026-11-12" },
});

test("150 子主题词表：六维各 25，id 全局唯一且与维度绑定", () => {
  assert.equal(SUBTOPICS.length, 150);
  assert.equal(new Set(SUBTOPIC_IDS).size, 150);
  for (const dim of ["D1", "D2", "D3", "D4", "D5", "D6"]) {
    assert.equal(subtopicsOf(dim).length, 25, `${dim} 应有 25 个子主题`);
  }
  for (const topic of SUBTOPICS) {
    assert.match(topic.id, /^[a-z0-9-]+$/, `${topic.id} 应为 kebab-case`);
    assert.ok(topic.label, `${topic.id} 缺中文标签`);
    assert.ok(topic.keywords.length >= 2, `${topic.id} 至少 2 个采集搜索词`);
    assert.equal(subtopicById(topic.id).id, topic.id);
  }
});

test("难度/档位成对映射与锚点对齐", () => {
  assert.deepEqual(DIFFICULTIES, ["low", "medium", "high"]);
  assert.deepEqual(DIFFICULTY_OF_BAND, { focus: "low", developing: "medium", strong: "high" });
  assert.deepEqual(BAND_OF_DIFFICULTY, { low: "focus", medium: "developing", high: "strong" });
  assert.equal(BANDS.length, 3);
  assert.equal(MIN_QUALITY, 4);
});

test("URL 必须指向具体页面而非裸域名", () => {
  assert.equal(isSpecificPageUrl("https://www.bilibili.com/video/BV1cy4y1p7vp"), true);
  assert.equal(isSpecificPageUrl("https://www.kaggle.com/learn"), true);
  assert.equal(isSpecificPageUrl("https://a.com/search?q=1"), true);
  assert.equal(isSpecificPageUrl("https://a.com/#docs"), true);
  assert.equal(isSpecificPageUrl("https://a.com/"), false, "裸域名不合格");
  assert.equal(isSpecificPageUrl("https://a.com"), false);
  assert.equal(isSpecificPageUrl("http://a.com/page"), false, "必须 https");
  assert.equal(isSpecificPageUrl("notaurl"), false);
});

test("validateKnowledgeEntry：合法样例通过", () => {
  const result = validateKnowledgeEntry(validEntry());
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("validateKnowledgeEntry：逐类拦截非法条目", () => {
  const cases = [
    [{ ...validEntry(), id: "x1" }, /id/],
    [{ ...validEntry(), title: "" }, /title/],
    [{ ...validEntry(), url: "https://bilibili.com/" }, /url/],
    [{ ...validEntry(), type: "podcast" }, /type/],
    [{ ...validEntry(), dims: [] }, /dims/],
    [{ ...validEntry(), dims: ["D1", "D2", "D3"] }, /dims/],
    [{ ...validEntry(), dims: ["D2"], subtopic: "privacy-basics" }, /subtopic .* D6/],
    [{ ...validEntry(), subtopic: "no-such-topic" }, /subtopic/],
    [{ ...validEntry(), difficulty: "easy" }, /difficulty/],
    [{ ...validEntry(), band: "medium" }, /band/],
    [{ ...validEntry(), difficulty: "low" }, /成对/],
    [{ ...validEntry(), summary: "x".repeat(121) }, /summary/],
    [{ ...validEntry(), why: "" }, /why/],
    [{ ...validEntry(), quality: 6 }, /quality/],
    [{ ...validEntry(), quality: "4" }, /quality/],
    [{ ...validEntry(), signals: { views: 100, verifiedAt: "yesterday" } }, /verifiedAt/],
    [{ ...validEntry(), signals: { verifiedAt: "2026-11-12", views: -1 } }, /views/],
    [{ ...validEntry(), signals: { verifiedAt: "2026-11-12", durationMin: 0 } }, /durationMin/],
  ];
  for (const [entry, pattern] of cases) {
    const { ok, errors } = validateKnowledgeEntry(entry);
    assert.equal(ok, false, JSON.stringify(entry).slice(0, 80));
    assert.ok(errors.some((error) => pattern.test(error)), `${errors.join(";")} 应命中 ${pattern}`);
  }
});

test("admitKnowledgeEntry 三道门：schema、质量分、视频播放量", () => {
  assert.equal(admitKnowledgeEntry(validEntry()).ok, true);
  const lowQuality = admitKnowledgeEntry({ ...validEntry(), quality: 3.5 });
  assert.equal(lowQuality.ok, false);
  assert.ok(lowQuality.reasons.some((reason) => reason.includes("quality")));
  const thinViews = admitKnowledgeEntry({ ...validEntry(), signals: { ...validEntry().signals, views: 5_000 } }, { minViews: 10_000 });
  assert.equal(thinViews.ok, false);
  assert.ok(thinViews.reasons.some((reason) => reason.includes("views")));
  // 非视频不受播放量门槛影响
  assert.equal(admitKnowledgeEntry({ ...validEntry(), type: "doc", url: "https://learn.microsoft.com/en-us/training/paths/introduction-generative-ai/", signals: { verifiedAt: "2026-11-12" } }, { minViews: 10_000 }).ok, true);
});

test("checkDimensionQuotas：六维配额下限与缺口报告", () => {
  const make = (dims) => ({ dims });
  const library = [
    ...Array.from({ length: 600 }, () => make(["D1"])),
    ...Array.from({ length: 599 }, () => make(["D2"])),
    ...Array.from({ length: 700 }, () => make(["D3"])),
    ...Array.from({ length: 700 }, () => make(["D4"])),
    ...Array.from({ length: 700 }, () => make(["D5"])),
    ...Array.from({ length: 700 }, () => make(["D6"])),
  ];
  const result = checkDimensionQuotas(library, { perDimMin: 600 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["D2"]);
  assert.equal(result.perDim.D1, 600);
});

test("findDuplicates：id 与 url 双键去重", () => {
  const a = validEntry();
  const b = { ...validEntry(), id: "kb-000002", url: "https://a.com/page" };
  const c = { ...validEntry(), id: "kb-000003", url: "https://a.com/page" };
  const result = findDuplicates([a, b, c, { ...a, url: "https://fresh.example.com/watch" }]);
  assert.deepEqual(result.duplicateIds, ["kb-000001"]);
  assert.deepEqual(result.duplicateUrls, ["https://a.com/page"]);
});

test("知识库若已生成，则整库合法、无重复且类型在枚举内（库本体守卫）", () => {
  const path = new URL("../src/knowledge/knowledge-base.json", import.meta.url);
  if (!existsSync(path)) return; // 阶段 1 之前允许缺席；一旦生成本测试即生效
  const library = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(Array.isArray(library) && library.length > 0, "库文件应是 JSON 数组");
  const duplicates = findDuplicates(library);
  assert.deepEqual(duplicates.duplicateIds, []);
  assert.deepEqual(duplicates.duplicateUrls, []);
  for (const entry of library) {
    assert.ok(KNOWLEDGE_TYPES.includes(entry.type), `${entry.id} 类型非法`);
    const { ok, errors } = validateKnowledgeEntry(entry);
    assert.ok(ok, `${entry.id}: ${errors.join(";")}`);
  }
});
