// 知识库推荐索引守卫：rec-index.json（scripts/build-knowledge-index.mjs 的产物）
// 与 knowledge-base.json 的一致性 + queryKnowledgeResources 的行为契约。
// 运行时推荐是纯函数查表，这里锁定「表坏了推荐层必须立刻知道」。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRecommendations, queryKnowledgeResources } from "../src/report-recommendations.js";

const here = dirname(fileURLToPath(import.meta.url));
const library = JSON.parse(readFileSync(join(here, "../src/knowledge/knowledge-base.json"), "utf8"));
const index = JSON.parse(readFileSync(join(here, "../src/knowledge/rec-index.json"), "utf8"));
const byId = new Map(library.map((entry) => [entry.id, entry]));

test("rec-index slots reference only real entries and match their slot key", () => {
  assert.ok(Object.keys(index.slots).length >= 90, "应有 6 维 × 3 档 × 5 变体 = 90 个槽位");
  for (const [key, ids] of Object.entries(index.slots)) {
    const [dim, difficulty] = key.split(":");
    for (const id of ids) {
      const entry = index.entries[id];
      assert.ok(entry, `槽 ${key} 引用了 entries 里不存在的 ${id}`);
      const source = byId.get(id);
      assert.ok(source, `槽 ${key} 引用了知识库外的 ${id}`);
      assert.ok(source.dims.includes(dim), `槽 ${key} 的 ${id} 不覆盖维度 ${dim}`);
      assert.equal(source.difficulty, difficulty, `槽 ${key} 的 ${id} 难度不符`);
    }
  }
});

test("queryKnowledgeResources honours band difficulty and gap variant", () => {
  // focus 档 → low 难度槽；落差 talk-strong → concept 变体。
  const focusConcept = queryKnowledgeResources({
    dim: "D1", score: 44, channels: { interview: 58, objective: 40, practical: 42 }, n: 3,
  });
  assert.ok(focusConcept.length > 0);
  assert.ok(focusConcept.every((item) => item.band === "focus" && item.variant === "concept"));
  // strong 档 → high 难度槽；无落差 → balanced。
  const strongBalanced = queryKnowledgeResources({ dim: "D1", score: 88, n: 2 });
  assert.ok(strongBalanced.every((item) => item.band === "strong" && item.variant === "balanced"));
  // unknown 分数（null）不产生推荐。
  assert.equal(queryKnowledgeResources({ dim: "D1", score: null, n: 3 }).length, 0);
});

test("queryKnowledgeResources is deterministic and deduplicates across dimensions", () => {
  const once = queryKnowledgeResources({ dim: "D3", score: 66, n: 3 });
  const again = queryKnowledgeResources({ dim: "D3", score: 66, n: 3 });
  assert.deepEqual(once.map((item) => item.id), again.map((item) => item.id));

  // 共享 state 时跨维度不重复、同子主题 ≤2。
  const shared = { urls: new Set(), subtopics: new Map(), lastType: null };
  const picks = [
    ...queryKnowledgeResources({ dim: "D1", score: 50, n: 3, state: shared }),
    ...queryKnowledgeResources({ dim: "D6", score: 52, n: 3, state: shared }),
  ];
  assert.equal(new Set(picks.map((item) => item.url)).size, picks.length);
  const perSubtopic = new Map();
  for (const item of picks) perSubtopic.set(item.subtopic, (perSubtopic.get(item.subtopic) ?? 0) + 1);
  assert.ok([...perSubtopic.values()].every((count) => count <= 2));
});

test("buildRecommendations resources stay in the requested dimension band", () => {
  const composite = {
    dimensions: [
      { key: "D2", name: "提示词工程", short: "提示词", score: 52, channels: { interview: 30, objective: 48, practical: 50 } },
      { key: "D1", name: "AI基础认知", short: "认知", score: 58, channels: {} },
      { key: "D3", name: "AI工具使用", short: "工具", score: 72, channels: {} },
      { key: "D4", name: "AI结果评估与优化", short: "评估", score: 81, channels: {} },
      { key: "D5", name: "人机协同解决问题", short: "协同", score: 66, channels: {} },
      { key: "D6", name: "AI伦理与合规", short: "伦理", score: 75, channels: {} },
    ],
    overallScore: 67,
    grade: "C",
    channels: { objective: {}, interview: {}, practical: {} },
  };
  const advice = buildRecommendations(composite);
  assert.ok(advice.resources.length > 0);
  for (const item of advice.resources) {
    // 知识库资源（带 id）的 band 必须与该维度档位一致；兜底资源（无 id）不约束。
    if (!item.id) continue;
    const dimension = composite.dimensions.find((candidate) => candidate.key === item.dim);
    const band = dimension.score >= 80 ? "strong" : dimension.score >= 60 ? "developing" : "focus";
    assert.equal(item.band, band, `${item.id} 的档位与维度 ${item.dim} 不符`);
  }
});
