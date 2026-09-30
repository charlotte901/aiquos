import test from "node:test";
import assert from "node:assert/strict";
import {
  SEED_KAPPA_MAX,
  interviewSeedKappa,
  interviewSeedTheta,
  normalizePrior,
  normalizeSeedPayload,
  seedSession,
} from "../src/cat-seeding.js";
import {
  abilityStandardError,
  createAdaptiveSession,
  estimateRunAbility,
  nextTargetDifficulty,
} from "../src/comprehensive-adaptive.js";
import {
  COMPREHENSIVE_QUESTION_PATH,
  handleComprehensiveQuestion,
} from "../worker/comprehensive-quiz.js";

const post = (payload) => handleComprehensiveQuestion(
  new Request(`https://example.com${COMPREHENSIVE_QUESTION_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }),
);

test("interview scores map onto the item-anchor theta scale", () => {
  // 档位锚点 → θ₀（对照 cat-seeding.js 的校准表）。
  assert.equal(interviewSeedTheta({ overallScore: 66 }), -1.4);
  assert.equal(interviewSeedTheta({ overallScore: 74 }), -0.6);
  assert.equal(interviewSeedTheta({ overallScore: 81 }), 0.1);
  assert.equal(interviewSeedTheta({ overallScore: 88 }), 0.8);
  // 钳制：96+ 分不再超出 ±1.6。
  assert.equal(interviewSeedTheta({ overallScore: 99 }), 1.6);
  assert.equal(interviewSeedTheta({ overallScore: 40 }), -1.6);
  // 总分缺失时退回维度均值。
  assert.equal(interviewSeedTheta({ dimensions: [{ key: "D1", score: 70 }, { key: "D2", score: 90 }] }), 0);
  // 完全没有分数 → 不定档。
  assert.equal(interviewSeedTheta({}), null);
  assert.equal(interviewSeedTheta(null), null);
});

test("prior kappa scales with answered interview slots", () => {
  assert.equal(interviewSeedKappa({ answeredSlots: 0 }), null);
  assert.equal(interviewSeedKappa({}), null);
  assert.equal(interviewSeedKappa({ answeredSlots: 5, totalSlots: 5 }), SEED_KAPPA_MAX);
  assert.equal(interviewSeedKappa({ answeredSlots: 3, totalSlots: 5 }), 0.6);
});

test("normalizeSeedPayload clamps dirty client input", () => {
  const clean = normalizeSeedPayload({ overallScore: 88, answeredSlots: 5, totalSlots: 5, completed: true });
  assert.deepEqual(clean, { theta: 0.8, kappa: SEED_KAPPA_MAX });
  // 非法输入全部退化为不定档，绝不抛错。
  assert.equal(normalizeSeedPayload(null), null);
  assert.equal(normalizeSeedPayload("junk"), null);
  assert.equal(normalizeSeedPayload({ overallScore: "abc", answeredSlots: 5 }), null);
  assert.equal(normalizeSeedPayload({ overallScore: 88, answeredSlots: 0 }), null);
  // 极端分数被钳制而不是拒绝：1000 分 ≙ 顶格定档。
  assert.deepEqual(normalizeSeedPayload({ overallScore: 1000, answeredSlots: 5 }), { theta: 1.6, kappa: SEED_KAPPA_MAX });
});

test("seedSession is idempotent and evidence-safe", () => {
  const base = createAdaptiveSession();
  const seeded = seedSession(base, { theta: 0.8, kappa: 2 });
  assert.deepEqual(seeded.prior, { theta: 0.8, kappa: 2 });
  // 已有先验 → 不覆盖。
  assert.deepEqual(seedSession(seeded, { theta: -1, kappa: 1 }).prior, { theta: 0.8, kappa: 2 });
  // 已有作答证据（中途回放/重复携带）→ 不再定档。
  const withEvidence = { ...createAdaptiveSession(), evidence: [{ credit: 1, difficulty: "medium", dimKeys: ["D1"] }] };
  assert.equal(seedSession(withEvidence, { theta: 0.8, kappa: 2 }).prior, null);
  assert.equal(seedSession(base, null), base);
});

test("normalizePrior repairs a prior damaged in transit", () => {
  assert.deepEqual(normalizePrior({ theta: 0.8, kappa: 2 }), { theta: 0.8, kappa: 2 });
  assert.equal(normalizePrior(null), null);
  assert.equal(normalizePrior({ theta: "x", kappa: 2 }), null);
  assert.equal(normalizePrior({ theta: 99, kappa: 2 }), null); // 超出容差 → 丢弃
  assert.equal(normalizePrior({ theta: 0.5, kappa: 99 }), null);
  assert.deepEqual(normalizePrior({ theta: 1.9, kappa: 1 }), { theta: 1.6, kappa: 1 }); // 钳回界内
});

test("a prior-only session estimates exactly at the seed theta", () => {
  const prior = { theta: 1.6, kappa: 2 };
  const session = { ...createAdaptiveSession(), prior };
  // 无证据时估计恰为 θ₀：定档先验**替换**隐式 N(0,1) 基线（旧实现叠加
  // 基线把种子收缩成 κθ₀/(1+κ)=1.07，与「第一题打在 θ₀ 附近」的文档承诺
  // 矛盾——2026-09-30 修复）。估计器与 SE 现在同口径（κ+ΣI）。
  assert.ok(Math.abs(estimateRunAbility(session) - 1.6) < 1e-6);
  // 选题目标 = 0.65·θ₀ + 0.35·游走（游走起点 0）。
  assert.ok(Math.abs(nextTargetDifficulty(session) - 0.65 * 1.6) < 1e-9);
  // 先验信息量计入 SE：1/√κ。
  assert.ok(Math.abs(abilityStandardError(session) - 1 / Math.sqrt(2)) < 1e-9);
});

test("objective evidence washes the prior out monotonically", () => {
  // 同样的全对证据下：低定档 < 无定档 < 高定档；且证据越多，定档的
  // 影响单调收窄——这就是「先验随证据自然衰减」的冲刷性质。
  const evidenceOf = (count) => Array.from({ length: count }, () => (
    { credit: 1, difficulty: "medium", dimKeys: ["D1"] }
  ));
  const abilityAt = (count, prior) => estimateRunAbility({
    ...createAdaptiveSession(),
    ...(prior ? { prior } : {}),
    evidence: evidenceOf(count),
  });
  for (const count of [4, 12, 30]) {
    const low = abilityAt(count, { theta: -1.4, kappa: 2 });
    const high = abilityAt(count, { theta: 1.6, kappa: 2 });
    assert.ok(low < high, `count=${count}: low(${low}) < high(${high})`);
  }
  // 证据从 4 → 30，定档造成的差距必须收窄。
  const spreadSmall = abilityAt(4, { theta: 1.6, kappa: 2 }) - abilityAt(4, { theta: -1.4, kappa: 2 });
  const spreadLarge = abilityAt(30, { theta: 1.6, kappa: 2 }) - abilityAt(30, { theta: -1.4, kappa: 2 });
  assert.ok(spreadLarge < spreadSmall, `spread should shrink with evidence (${spreadSmall} → ${spreadLarge})`);
  // 30 条反向证据（全错 low 题）最终压过高定档。
  const contradicted = estimateRunAbility({
    ...createAdaptiveSession(),
    prior: { theta: 1.6, kappa: 2 },
    evidence: Array.from({ length: 30 }, () => ({ credit: 0, difficulty: "low", dimKeys: ["D1"] })),
  });
  assert.ok(contradicted < -1, `contradicted ability ${contradicted} should fall below -1`);
});

test("no prior keeps v3 behaviour untouched", () => {
  const session = createAdaptiveSession();
  assert.equal(estimateRunAbility(session), null);
  assert.equal(nextTargetDifficulty(session), 0);
  assert.equal(abilityStandardError(session), null);
});

test("the endpoint seeds the session from an interview summary", async () => {
  const response = await post({
    scope: "bank",
    stage: 2,
    interviewSeed: { overallScore: 90, dimensions: [], answeredSlots: 5, totalSlots: 5, completed: true },
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.session.prior, { theta: 1, kappa: SEED_KAPPA_MAX });
  // 高定档的第一题应明显偏难：目标难度 +1 附近的信息量排序倾向 high。
  const response2 = await post({
    scope: "bank",
    stage: 2,
    interviewSeed: { overallScore: 68, answeredSlots: 5, totalSlots: 5 },
  });
  const data2 = await response2.json();
  assert.deepEqual(data2.session.prior, { theta: -1.2, kappa: SEED_KAPPA_MAX });
  const easyBias = (await post({ scope: "bank", stage: 2, session: data2.session })).json();
  // 脏 seed 不改变行为：session 无 prior、仍正常出题。
  const dirty = await post({ scope: "bank", stage: 2, interviewSeed: { overallScore: "高" } });
  assert.equal(dirty.status, 200);
  assert.equal((await dirty.json()).session.prior, null);
  void easyBias;
});

test("the seeded prior survives the session round-trip exactly once", async () => {
  const first = await post({
    scope: "bank",
    stage: 2,
    interviewSeed: { overallScore: 84, answeredSlots: 5, totalSlots: 5 },
  });
  const data = await first.json();
  assert.deepEqual(data.session.prior, { theta: 0.4, kappa: SEED_KAPPA_MAX });
  // 回传（携带先验、携带新的 seed）：先验不被覆盖。
  const again = await post({
    scope: "bank",
    stage: 2,
    session: data.session,
    interviewSeed: { overallScore: 60, answeredSlots: 5, totalSlots: 5 },
  });
  const dataAgain = await again.json();
  assert.deepEqual(dataAgain.session.prior, { theta: 0.4, kappa: SEED_KAPPA_MAX });
  // 回传途中先验被损坏 → 丢弃，不报错。
  const broken = { ...data.session, prior: { theta: "oops", kappa: 2 } };
  const repaired = await post({ scope: "bank", stage: 2, session: broken });
  assert.equal(repaired.status, 200);
  assert.equal((await repaired.json()).session.prior, null);
});
