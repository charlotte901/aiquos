import test from "node:test";
import assert from "node:assert/strict";
import {
  CHANNEL_KEYS,
  DEFAULT_WEIGHTS,
  WEIGHTING_VERSION,
  buildComposite,
  fuseChannels,
  interviewChannel,
  objectiveChannel,
  practicalChannel,
} from "../src/comprehensive-weighting.js";
import {
  createAttempt,
  appendExternalEvidence,
  finalizeAttempt,
  recordAnswer,
  recordInterviewScore,
  snapshotAttempt,
} from "../src/assessment-attempt.js";
import bank from "../src/comprehensive-questions.json" with { type: "json" };

function answeredAttempt(credits) {
  // 直接构造与 recordAnswer 等价的证据（这里要控制 credit 走遍 0/1，
  // 用选项作答无法精确控制部分分），只验证通道切分与融合算术。
  const questions = bank.questions.slice(0, credits.length);
  let attempt = createAttempt({ totalQuestions: 40 });
  attempt = {
    ...attempt,
    evidence: questions.map((question, index) => ({
      questionId: question.id,
      type: question.type,
      difficulty: question.difficulty,
      dimKeys: [...question.dimKeys],
      selectedKeys: [],
      credit: credits[index],
      answeredAt: new Date().toISOString(),
    })),
    questionIds: questions.map((question) => question.id),
  };
  return attempt;
}

test("channel extraction splits objective and practical evidence", () => {
  const attempt = {
    evidence: [
      { questionId: "q001", difficulty: "medium", dimKeys: ["D1", "D2"], credit: 1 },
      { questionId: "q002", difficulty: "high", dimKeys: ["D3", "D5"], credit: 0 },
      { questionId: "prac-low-001", difficulty: "low", dimKeys: ["D2", "D5"], credit: 0.75, external: "实操任务" },
      { questionId: "prac-high-002", difficulty: "high", dimKeys: ["D2", "D5"], credit: 0.75, external: "实操任务" },
    ],
  };
  const objective = objectiveChannel(attempt.evidence);
  const practical = practicalChannel(attempt.evidence);
  assert.equal(objective.answeredCount, 2);
  assert.equal(practical.taskCount, 2);
  // 难度等值校准：同样 credit=0.75（相对能力 θ≈0.38），easy 任务折算的
  // 绝对能力低、hard 任务折算的绝对能力高——两次任务平均后落在中间，
  // 不再是「得分率直读的 75」。
  assert.equal(practical.rawCredit, 0.75);
  const d2 = practical.dimensions.find((dimension) => dimension.key === "D2");
  assert.equal(d2.rawScore, 75);
  // θ = creditToTheta(0.75) + (−1 + 1)/2 = 0.5145 → 100·σ(0.5145) = 63。
  assert.equal(d2.score, Math.round(100 / (1 + Math.exp(-0.5145))));
  // D6 无人覆盖 → null。
  assert.equal(practical.dimensions.find((dimension) => dimension.key === "D6").score, null);
});

test("interview channel passes through the independent model output", () => {
  const channel = interviewChannel({
    answeredSlots: 5,
    totalSlots: 5,
    completed: true,
    overallScore: 84,
    dimensions: [{ key: "D2", score: 88 }, { key: "D5", score: 80 }],
  });
  assert.equal(channel.overallScore, 84);
  assert.equal(channel.dimensions.find((dimension) => dimension.key === "D2").score, 88);
  // 对话不覆盖的维度是 null，不是 0。
  assert.equal(channel.dimensions.find((dimension) => dimension.key === "D6").score, null);
  assert.equal(interviewChannel(null).overallScore, null);
});

test("latent fusion inverts each channel to the common theta scale", () => {
  const channels = {
    objective: { dimensions: [{ key: "D1", score: 70 }, { key: "D6", score: 90 }] },
    interview: { dimensions: [{ key: "D1", score: 90 }, { key: "D6", score: null }] },
    // 实操通道的 credit 口径在 rawScore；score 是 σ(θ) 展示分（量纲不同，
    // 误喂 credit 曲线正是 1.2.0 修掉的量纲错位）。
    practical: { dimensions: [{ key: "D1", score: 63, rawScore: 50 }, { key: "D6", score: null }] },
  };
  const fused = fuseChannels(channels, { objective: 0.5, interview: 0.25, practical: 0.25 });
  // D1：θ = 0.5·logit(.7) + 0.25·(90−80)/10 + 0.25·credit⁻¹(.50)。
  const logit = (p) => Math.log(p / (1 - p));
  const creditInv = (c) => -1 + (c - 0.312) / (0.555 - 0.312); // 0.50 落在 (−1,0) 段
  const thetaD1 = 0.5 * logit(0.7) + 0.25 * 1 + 0.25 * creditInv(0.5);
  const d1 = fused.dimensions.find((dimension) => dimension.key === "D1");
  assert.equal(d1.score, Math.round(100 / (1 + Math.exp(-thetaD1))));
  // D6 缺两个通道 → 权重归一化到只剩客观；高分被 θ 钳制压缩（90 → 83）。
  const d6 = fused.dimensions.find((dimension) => dimension.key === "D6");
  assert.equal(d6.score, Math.round(100 / (1 + Math.exp(-1.6))));
  assert.deepEqual(d6.channels, { objective: 90, interview: null, practical: null });
  // 旧快照兼容：无 rawScore 的 practical score 按 logit 反演（σ 的逆），
  // 而不是误走 credit 曲线——50 分展示分应给出 θ=0，而非 credit(0.5)≈−0.23。
  const legacy = fuseChannels({
    objective: { dimensions: [] },
    interview: { dimensions: [] },
    practical: { dimensions: [{ key: "D2", score: 50 }] },
  }, { objective: 0.6, interview: 0.25, practical: 0.15 });
  const d2 = legacy.dimensions.find((dimension) => dimension.key === "D2");
  assert.equal(d2.score, 50); // θ=0 → σ(0)=0.5
});

test("latent fusion removes the channel scale offset and stays bounded", () => {
  // 三通道的「80 分」在潜变量上并不同义（客观 80→θ1.39、对话 80→θ0、
  // 实操 80→θ0.65）——这正是线性融合会掩盖、latent 融合会显现的量表错位。
  const channels = {
    objective: { dimensions: [{ key: "D1", score: 80 }] },
    interview: { dimensions: [{ key: "D1", score: 80 }] },
    practical: { dimensions: [{ key: "D1", score: 80 }] },
  };
  const fused = fuseChannels(channels).dimensions[0].score;
  assert.ok(fused > 60 && fused < 85, `fused ${fused} reflects the scale disagreement, not a blind 80`);
  // 单通道满分（θ 钳制 1.6）不会把融合分拖到无穷：70 客观 + 100 对话各半
  // → θ̄ = (1.6·? ) 由钳制决定，融合分有界且显著低于 100。
  const extreme = fuseChannels({
    objective: { dimensions: [{ key: "D1", score: 70 }] },
    interview: { dimensions: [{ key: "D1", score: 100 }] },
    practical: { dimensions: [{ key: "D1", score: null }] },
  }, { objective: 0.5, interview: 0.5, practical: 0 }).dimensions[0].score;
  assert.ok(extreme < 95, `saturated channel stays bounded (${extreme})`);
  // 融合分夹在通道极端换算之间（凸组合性质在 θ 尺度上成立）。
  const mixed = fuseChannels({
    objective: { dimensions: [{ key: "D1", score: 62 }] },
    interview: { dimensions: [{ key: "D1", score: 95 }] },
    practical: { dimensions: [{ key: "D1", score: 40 }] },
  });
  assert.ok(mixed.dimensions[0].score > 40 && mixed.dimensions[0].score < 95);
});

test("snapshots carry the composite and the interview record", () => {
  // 六个维度都要有证据：从题库里找一组覆盖 D1–D6 的题。
  const chosen = [];
  const covered = new Set();
  for (const question of bank.questions) {
    const adds = question.dimKeys.filter((key) => !covered.has(key));
    if (adds.length === 0) continue;
    adds.forEach((key) => covered.add(key));
    chosen.push(question);
    if (covered.size === 6) break;
  }
  let attempt = createAttempt({ totalQuestions: 40 });
  for (const question of chosen) {
    attempt = recordAnswer(attempt, question, [question.answer[0]]).attempt;
  }
  attempt = recordInterviewScore(attempt, {
    dimensions: [{ key: "D2", score: 88 }],
    overallScore: 88,
    completed: true,
    answeredSlots: 5,
    totalSlots: 5,
  }).attempt;
  attempt = appendExternalEvidence(attempt, {
    id: "prac-lite-002",
    dimKeys: ["D2", "D5"],
    credit: 1,
    label: "实操任务",
  }).attempt;
  const finalized = finalizeAttempt(attempt);
  const snapshot = snapshotAttempt(finalized.attempt, finalized.result);
  assert.ok(snapshot, "run completes with all dimensions covered");
  assert.ok(snapshot.composite, "snapshot carries the weighted composite");
  assert.ok(snapshot.interview, "snapshot carries the interview record");
  assert.equal(snapshot.result.status, "completed");
  // 默认权重存在且可追溯。
  assert.deepEqual(Object.keys(snapshot.composite.weights), CHANNEL_KEYS);
  assert.equal(snapshot.composite.weights.objective, DEFAULT_WEIGHTS.objective);
});

test("null interview dimensions never enter fusion as zero", () => {
  // 回归：Number(null) === 0 曾把「对话未覆盖 D6」当作 0 分混进融合，
  // 把 D6 压低 11 分。null 必须保持缺失语义（权重重归一化）。
  const channels = {
    objective: { dimensions: [{ key: "D6", score: 49 }] },
    interview: { dimensions: [{ key: "D6", score: null }] },
    practical: { dimensions: [{ key: "D6", score: null }] },
  };
  const fused = fuseChannels(channels, DEFAULT_WEIGHTS);
  const d6 = fused.dimensions.find((dimension) => dimension.key === "D6");
  assert.equal(d6.score, 49);
  assert.equal(d6.channels.interview, null);
  // interviewChannel 层同样不产生 0。
  const channel = interviewChannel({ dimensions: [{ key: "D6", score: null }], overallScore: null });
  assert.equal(channel.dimensions.find((dimension) => dimension.key === "D6").score, null);
});
