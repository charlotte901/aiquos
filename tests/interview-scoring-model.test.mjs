/**
 * 对话测评独立评分模型的行为锁定。
 *
 * 这些断言既是回归保护，也是模型的**文档**：读测试就能知道
 * "什么样的回答拿多少分"。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BAND_SCORES,
  CREDIT_SCALE,
  DIMENSION_KEYS,
  PRIMARY_WEIGHT,
  SECONDARY_WEIGHT,
  SLOT_DIMENSION_WEIGHTS,
  creditToScore,
  gradeOverall,
  scoreDimension,
  scoreInterview,
  shrinkTowardPrior,
} from "../src/interview-scoring-model.js";
import { INTERVIEW_LADDER } from "../src/interviewer.js";
import { CREDIT_SCALE as RUBRIC_SCALE } from "../src/interview-scoring.js";

const uniform = (credit) =>
  Object.fromEntries(Object.keys(SLOT_DIMENSION_WEIGHTS).map((slot) => [slot, credit]));

test("档位锚点与项目的评分量表一致", () => {
  // 对话评分模型不能自创档位：它必须建立在 src/interview-scoring.js 的
  // 同一把尺子上，否则模型给出的 credit 会被这里错误映射。
  assert.deepEqual(CREDIT_SCALE, RUBRIC_SCALE);
  assert.equal(BAND_SCORES.length, CREDIT_SCALE.length);
  // 单调不减，且落在 60–100
  for (let i = 1; i < BAND_SCORES.length; i += 1) {
    assert.ok(BAND_SCORES[i] > BAND_SCORES[i - 1], "分数锚点必须严格递增");
  }
  assert.equal(BAND_SCORES[0], 60);
  assert.equal(BAND_SCORES[BAND_SCORES.length - 1], 100);
});

test("话题→维度绑定与题梯一致", () => {
  // 两处绑定必须同步：题梯决定问什么，评分模型决定分数算到哪个维度。
  const ladderSlots = INTERVIEW_LADDER.map((slot) => slot.id).sort();
  const modelSlots = Object.keys(SLOT_DIMENSION_WEIGHTS).sort();
  assert.deepEqual(modelSlots, ladderSlots, "话题 id 必须与题梯完全对应");
  for (const slot of INTERVIEW_LADDER) {
    const bound = SLOT_DIMENSION_WEIGHTS[slot.id].map(([key]) => key).sort();
    const declared = [...slot.dims].sort();
    assert.deepEqual(bound, declared, `${slot.id} 的维度绑定与题梯不一致`);
  }
});

test("主维度全权重、副维度八折", () => {
  for (const dims of Object.values(SLOT_DIMENSION_WEIGHTS)) {
    assert.equal(dims.length, 2, "每个话题绑定两个维度");
    assert.equal(dims[0][1], PRIMARY_WEIGHT);
    assert.equal(dims[1][1], SECONDARY_WEIGHT);
    assert.ok(PRIMARY_WEIGHT > SECONDARY_WEIGHT, "主维度权重必须高于副维度");
  }
});

test("creditToScore 单调、连续、覆盖两端", () => {
  // 7 档非等距量表（与 src/interview-scoring.js 的 CREDIT_SCALE 对应）
  assert.equal(creditToScore(0), 60);
  assert.equal(creditToScore(0.2), 66);
  assert.equal(creditToScore(0.45), 74);
  assert.equal(creditToScore(0.65), 86);
  assert.equal(creditToScore(0.8), 96);
  assert.equal(creditToScore(0.92), 99);
  assert.equal(creditToScore(1), 100);
  // 越界被钳制，不抛错
  assert.equal(creditToScore(-1), 60);
  assert.equal(creditToScore(2), 100);
  // 单调
  let prev = -1;
  for (let c = 0; c <= 1.0001; c += 0.05) {
    const s = creditToScore(c);
    assert.ok(s >= prev, `credit=${c} 处分数回落`);
    prev = s;
  }
});

test("证据少时向基准收缩，证据多时放开", () => {
  // 基准 68 分：当 base 高于基准时，收缩后必然低于 base，但高于基准
  const base = creditToScore(1); // 100
  const one = shrinkTowardPrior(base, PRIMARY_WEIGHT);
  const three = shrinkTowardPrior(base, PRIMARY_WEIGHT * 3);
  assert.ok(one < base && one > 66, `单证据应被明显收缩（得到 ${one}）`);
  assert.ok(three > one && three < base, "证据越多越接近真实值");
  assert.equal(shrinkTowardPrior(base, 0), 66, "零权重回落到基准");
});

test("各档位落进对应的能力等级", () => {
  // 档位与等级的对应关系（收缩后的实测落点）：
  //   0.2→C、0.45→B、0.65→A、0.92→S
  // 这是量表可解释性的核心：等级不能失去区分意义。
  const expect = [
    [0.2, "C"], [0.45, "B"], [0.65, "A"], [0.92, "S"], [1, "S"],
  ];
  let prev = -1;
  for (const [credit, wantGrade] of expect) {
    const r = scoreInterview(uniform(credit));
    assert.equal(r.grade, wantGrade, `${credit} 档应为 ${wantGrade}（实际 ${r.overallScore} = ${r.grade}）`);
    assert.ok(r.overallScore > prev, `分数应随档位单调上升（${credit} 处 ${r.overallScore} 未高于 ${prev}）`);
    prev = r.overallScore;
  }
});

test("单证据维度也能达到对应档位，不再被先验压到 60", () => {
  // 这是本模型存在的理由：D1/D3/D4 各只被一个话题覆盖。
  // 旧 IRT 链路下它们即使满分也只有 60；新模型必须能反映真实档位。
  const full = scoreInterview(uniform(1));
  for (const key of ["D1", "D3", "D4"]) {
    const score = full.dimensions.find((d) => d.key === key).score;
    assert.ok(score >= 85, `${key} 满分作答应达到 A 档以上（实际 ${score}）`);
  }
  const mid = scoreInterview(uniform(0.45));
  for (const key of ["D1", "D3", "D4"]) {
    const score = mid.dimensions.find((d) => d.key === key).score;
    assert.ok(score >= 70 && score < 80, `${key} 中档应在 B 档区间（实际 ${score}）`);
  }
});

test("未被任何话题覆盖的维度返回 null，不臆造分数", () => {
  // D6 伦理合规不在采访话题里 —— 模型必须诚实报告"无证据"，
  // 而不是给一个保底分假装测过。
  const result = scoreInterview(uniform(1));
  const d6 = result.dimensions.find((d) => d.key === "D6");
  assert.equal(d6.score, null, "无证据的维度必须是 null");
  assert.ok(!result.coveredDimensions.includes("D6"));
  assert.equal(result.coveredDimensions.length, 5, "五个维度有覆盖");
});

test("总分只在话题答完后给出，中途不给", () => {
  const partial = { experience: 0.65, goal: 0.45 };
  const result = scoreInterview(partial);
  assert.equal(result.completed, false);
  assert.equal(result.overallScore, null, "未答完不给出总分");
  assert.equal(result.grade, null);
  assert.equal(result.answeredSlots, 2);
  assert.equal(result.totalSlots, 5);
  // 但已有证据的维度分照常给出（报告页要显示进行中的画像）
  assert.ok(result.dimensions.find((d) => d.key === "D1").score !== null);
  assert.ok(result.dimensions.find((d) => d.key === "D2").score !== null);
  assert.equal(result.dimensions.find((d) => d.key === "D3").score, null);
});

test("纯函数：同样输入必然同样输出", () => {
  const credits = { experience: 0.65, goal: 1, constraints: 0.45, feedback: 0.65, consolidate: 0.2 };
  const a = JSON.stringify(scoreInterview(credits));
  const b = JSON.stringify(scoreInterview({ ...credits }));
  assert.equal(a, b, "评分必须可复现");
});

test("主维度比副维度更贴近该话题的档位", () => {
  // experience 的主维度是 D1、副维度是 D5。当只有 experience 答了高分时，
  // D1 应当比 D5 更接近高分（因为主维度权重更高、证据更"纯"）。
  const onlyExperience = { experience: 1 };
  const d1 = scoreDimension("D1", onlyExperience);
  const d5 = scoreDimension("D5", onlyExperience);
  // 两者证据权重相同（都是 1.0/0.8 的单条），收缩后 D1 更高
  assert.ok(d1 > d5, `D1（主）应高于 D5（副），实际 ${d1} vs ${d5}`);
});

test("多话题共同支撑的维度分数更稳定（不易被单条拉偏）", () => {
  // D2 被 goal/constraints/feedback/consolidate 四个话题覆盖。
  // 一个是全高、一个是全低 —— D2 的波动应小于只被一个话题覆盖的 D1。
  const allHigh = uniform(1);
  const allLow = uniform(0.2);
  const highD2 = scoreDimension("D2", allHigh);
  const lowD2 = scoreDimension("D2", allLow);
  const highD1 = scoreDimension("D1", allHigh);
  const lowD1 = scoreDimension("D1", allLow);
  // 两者都应区分开（不做反直觉的断言），但 D1 因收缩更强而更靠近基准
  assert.ok(highD2 > lowD2 && highD1 > lowD1, "高低档必须区分");
  assert.ok((highD1 - 68) < (highD2 - 68), "单证据维度的偏移应小于多证据维度");
});

test("极端档位不会越界", () => {
  for (const credit of [0, 0.2, 0.45, 0.65, 0.8, 0.92, 1]) {
    const result = scoreInterview(uniform(credit));
    for (const dimension of result.dimensions) {
      if (dimension.score === null) continue;
      assert.ok(dimension.score >= 60 && dimension.score <= 100,
        `${dimension.key} 在 credit=${credit} 时越界：${dimension.score}`);
    }
    if (result.overallScore !== null) {
      assert.ok(result.overallScore >= 60 && result.overallScore <= 100);
    }
  }
  // 缺字段、null、非法值都不应抛错
  assert.doesNotThrow(() => scoreInterview({}));
  assert.doesNotThrow(() => scoreInterview(null));
  assert.doesNotThrow(() => scoreInterview({ experience: null, goal: "abc" }));
  assert.equal(scoreInterview({}).overallScore, null);
});

test("维度键集合与项目六维一致", () => {
  assert.deepEqual(DIMENSION_KEYS, ["D1", "D2", "D3", "D4", "D5", "D6"]);
  const result = scoreInterview(uniform(0.65));
  assert.deepEqual(result.dimensions.map((d) => d.key), DIMENSION_KEYS);
});

// ── 与 Attempt 的接线 ──────────────────────────────────────────────────────

test("对话评分独立存入 attempt，不污染客观题证据", async () => {
  const { createAttempt, recordInterviewScore } = await import("../src/assessment-attempt.js");
  const attempt = createAttempt({ totalQuestions: 25 });
  assert.equal(attempt.interview, null, "新 attempt 的对话字段为空");

  const { attempt: next } = recordInterviewScore(attempt, {
    slotCredits: { experience: 0.75, goal: 1 },
    dimensions: [{ key: "D1", score: 84 }, { key: "D6", score: null }],
    overallScore: null,
    grade: null,
    completed: false,
    answeredSlots: 2,
    totalSlots: 5,
    coveredDimensions: ["D1"],
  });

  // 对话分数记录在独立字段里
  assert.equal(next.interview.answeredSlots, 2);
  assert.equal(next.interview.totalSlots, 5);
  assert.equal(next.interview.dimensions.length, 2);
  assert.ok(next.interview.recordedAt);
  // 关键：证据数组完全没被触碰 —— 对话不参与 IRT
  assert.equal(next.evidence.length, 0, "对话评分不得写入 evidence");
  assert.equal(next.questionIds.length, 0);
  assert.equal(attempt.interview, null, "不可变：原 attempt 不被修改");
});

test("对话评分对非法输入保持健壮", async () => {
  const { createAttempt, recordInterviewScore } = await import("../src/assessment-attempt.js");
  const attempt = createAttempt({ totalQuestions: 25 });
  for (const bad of [null, undefined, 42, "x"]) {
    const { attempt: next } = recordInterviewScore(attempt, bad);
    assert.equal(next.interview, null, "非法输入不应写入");
    assert.equal(next.evidence.length, 0);
  }
});

test("对话分数缺字段时归一化为安全默认值", async () => {
  const { createAttempt, recordInterviewScore } = await import("../src/assessment-attempt.js");
  const attempt = createAttempt({ totalQuestions: 25 });
  const { attempt: next } = recordInterviewScore(attempt, {});
  assert.deepEqual(next.interview.slotCredits, {});
  assert.deepEqual(next.interview.dimensions, []);
  assert.equal(next.interview.overallScore, null);
  assert.equal(next.interview.grade, null);
  assert.equal(next.interview.completed, false);
  assert.deepEqual(next.interview.coveredDimensions, []);
});

test("对话完成状态只在五个话题都作答后为真", () => {
  const partial = scoreInterview({ experience: 1, goal: 1, constraints: 1, feedback: 1 });
  assert.equal(partial.completed, false);
  assert.equal(partial.overallScore, null);
  assert.equal(partial.answeredSlots, 4);
  const full = scoreInterview(uniform(1));
  assert.equal(full.completed, true);
  assert.equal(full.answeredSlots, 5);
  assert.ok(full.overallScore !== null);
});

// ── 打分轨解析器（与聊天轨解析器必须区分）────────────────────────────────

test("parseScoreJson 解析纯评分 JSON，不像聊天轨那样要求 reply", async () => {
  const { parseScoreJson } = await import("../src/interview-score-parse.js");
  const { parseInterviewerJson } = await import("../src/interviewer.js");

  // 打分轨的真实返回：没有 reply 字段
  const gradingReply = '{"score":0.65,"evidence":"控制在五百字以内","note":"有做法有标准，可操作档"}';
  const parsed = parseScoreJson(gradingReply);
  assert.ok(parsed, "打分轨 JSON 必须能被 parseScoreJson 解析");
  assert.equal(parsed.score, 0.65);
  assert.equal(parsed.evidence, "控制在五百字以内");

  // 同一个返回用聊天轨解析器会失败 —— 这正是之前的 bug
  assert.equal(parseInterviewerJson(gradingReply), null,
    "parseInterviewerJson 要求 reply，不该用于打分轨");
});

test("parseScoreJson 把分数吸附到七档量表", async () => {
  const { parseScoreJson } = await import("../src/interview-score-parse.js");
  const cases = [
    [0.63, 0.65], [0.3, 0.2], [0.9, 0.92], [1.5, 1], [-0.2, 0],
    [0.7, 0.65], [0.85, 0.8], [0.5, 0.45],
  ];
  for (const [input, expected] of cases) {
    const r = parseScoreJson(`{"score":${input}}`);
    assert.equal(r.score, expected, `${input} 应吸附到 ${expected}`);
  }
});

test("parseScoreJson 容错：围栏、前后缀、坏输入", async () => {
  const { parseScoreJson } = await import("../src/interview-score-parse.js");
  assert.equal(parseScoreJson('```json\n{"score":0.8}\n```').score, 0.8);
  assert.equal(parseScoreJson('判定如下：{"score":0.65} 以上。').score, 0.65);
  for (const bad of ["", "not json", "{", '{"noScore":1}', '{"score":"abc"}', null, undefined]) {
    assert.equal(parseScoreJson(bad), null, `非法输入应返回 null：${bad}`);
  }
});
