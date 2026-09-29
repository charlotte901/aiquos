import test from "node:test";
import assert from "node:assert/strict";
import { buildRecommendations } from "../src/report-recommendations.js";
import { buildComposite } from "../src/comprehensive-weighting.js";

// 构造一个最小 composite：六维 × 三通道分数（融合分按线性加权预计算，
// 与 src/comprehensive-weighting.js 的默认权重一致）。
function compositeWith({ objective, interview, practical }) {
  const dims = Object.keys(objective);
  const W = { objective: 0.5, interview: 0.25, practical: 0.25 };
  const fuse = (key) => {
    const parts = [
      [objective[key], W.objective],
      [interview[key], W.interview],
      [practical[key], W.practical],
    ].filter(([score]) => score !== null && score !== undefined);
    if (parts.length === 0) return null;
    const total = parts.reduce((sum, [, w]) => sum + w, 0);
    return Math.round(parts.reduce((sum, [score, w]) => sum + score * w, 0) / total);
  };
  const dimensionList = dims.map((key) => ({
    key,
    name: key,
    short: key,
    score: fuse(key),
    channels: { objective: objective[key], interview: interview[key], practical: practical[key] },
    evidenceCount: 2,
  }));
  const scored = dimensionList.filter((item) => item.score !== null);
  const overall = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length) : null;
  return {
    weightingVersion: "test",
    weights: W,
    channels: {
      objective: { answeredCount: 12, overallScore: null, dimensions: dims.map((key) => ({ key, score: objective[key] })) },
      interview: { answeredSlots: 5, totalSlots: 5, completed: true, overallScore: null, dimensions: dims.map((key) => ({ key, score: interview[key] })) },
      practical: { taskCount: 1, overallScore: null, dimensions: dims.map((key) => ({ key, score: practical[key] })) },
    },
    dimensions: dimensionList,
    overallScore: overall,
    grade: null,
  };
}

test("gap patterns diagnose talk-vs-do discrepancies", () => {
  const composite = compositeWith({
    objective: { D1: 70, D2: 70, D3: 74, D4: 76, D5: 78, D6: null },
    interview: { D1: 88, D2: 90, D3: 72, D4: 74, D5: 76, D6: null },
    practical: { D1: null, D2: null, D3: null, D4: null, D5: null, D6: null },
  });
  const advice = buildRecommendations(composite);
  const d2 = advice.priorities.find((item) => item.key === "D2");
  assert.equal(d2.gap.id, "talk-strong");
  assert.ok(d2.gap.note.includes("90"), "gap note cites the interview score as evidence");
  const d3 = advice.priorities.find((item) => item.key === "D3");
  assert.equal(d3.gap, null, "below-threshold gap is not diagnosed");
  // 两个维度出现大落差 → 一致性提示。
  assert.equal(advice.consistency.flag, true);
});

test("knowledge-to-product gaps are diagnosed when practical lags", () => {
  const composite = compositeWith({
    objective: { D1: 84, D2: 86, D3: 80, D4: 82, D5: 81, D6: null },
    interview: { D1: 80, D2: 82, D3: 79, D4: 81, D5: 80, D6: null },
    practical: { D1: null, D2: 60, D3: null, D4: null, D5: 62, D6: null },
  });
  const advice = buildRecommendations(composite);
  const d2 = advice.priorities.find((item) => item.key === "D2");
  assert.equal(d2.gap.id, "knowledge-gap");
  assert.ok(advice.consistency.flag === false);
});

test("priorities order focus dims first and weakest first", () => {
  const composite = compositeWith({
    objective: { D1: 55, D2: 58, D3: 72, D4: 88, D5: 82, D6: null },
    interview: { D1: 55, D2: 58, D3: 70, D4: 84, D5: 80, D6: null },
    practical: { D1: null, D2: null, D3: null, D4: null, D5: null, D6: null },
  });
  const advice = buildRecommendations(composite);
  const bands = advice.priorities.map((item) => item.band);
  // focus 升序 → developing → strong → 无证据维度永远垫底。
  assert.deepEqual(bands, ["focus", "focus", "developing", "strong", "strong", "unknown"]);
  // focus 内部：55 分的 D1 排在 58 分的 D2 前面。
  assert.equal(advice.priorities[0].key, "D1");
  assert.equal(advice.priorities[1].key, "D2");
  // 最强维度进入 strengths。
  assert.equal(advice.strengths[0].key, "D4");
  // 资源由薄弱维度驱动：D1/D2/D3（developing/focus）+ 最强 D4。
  const keys = advice.resources.map((item) => item.dim);
  assert.ok(keys.includes("D1") && keys.includes("D2") && keys.includes("D4"));
});

test("recommendations tolerate null dimensions and missing channels", () => {
  const composite = compositeWith({
    objective: { D1: null, D2: null, D3: null, D4: null, D5: null, D6: null },
    interview: { D1: null, D2: null, D3: null, D4: null, D5: null, D6: null },
    practical: { D1: null, D2: null, D3: null, D4: null, D5: null, D6: null },
  });
  const advice = buildRecommendations(composite);
  assert.ok(advice);
  assert.equal(advice.summary, null);
  assert.equal(buildRecommendations(null), null);
});

test("buildComposite output feeds buildRecommendations end-to-end", () => {
  const attempt = {
    evidence: [
      { questionId: "q001", difficulty: "medium", dimKeys: ["D1", "D2"], credit: 1 },
      { questionId: "q002", difficulty: "high", dimKeys: ["D3", "D5"], credit: 0 },
      { questionId: "q003", difficulty: "low", dimKeys: ["D4", "D6"], credit: 1 },
      { questionId: "prac-1", difficulty: "medium", dimKeys: ["D2", "D5"], credit: 0.75, external: "实操任务" },
    ],
    interview: {
      dimensions: [{ key: "D2", score: 90 }, { key: "D5", score: 85 }],
      overallScore: 87,
      completed: true,
      answeredSlots: 5,
      totalSlots: 5,
    },
  };
  const composite = buildComposite(attempt);
  const advice = buildRecommendations(composite);
  assert.ok(advice.priorities.length === 6);
  assert.ok(advice.summary.includes("综合评级"));
});
