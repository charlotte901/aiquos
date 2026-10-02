// 综合测评三通道加权融合（纯函数，无 React/DOM）。
//
// 升级前的汇总方式是「证据同池」：实操的 rubric credit 伪装成 medium 单选
// 证据进 vendor IRT 后验，对话分走独立模型、且不进最终快照——觉醒报告里
// 只有一张雷达（客观+实操混算），对话通道的贡献不可见，也不存在
// 「三部分怎么加权」这个可调的产品参数。
//
// 本模块给出显式的三通道融合：
//   客观题通道  evidence 中非 external 的条目 → vendor IRT 六维分
//   实操通道    evidence 中 external（prac-*）条目 → 各维 credit → 百分制
//   对话通道    attempt.interview（独立评分模型）→ 六维分（60–100）
//
// 融合先**反演到共同潜变量 θ 再加权**（实验 2 对比了线性/统一logit/校准
// 潜变量三种融合，校准版把合成 RMSE 从 16.9 降到 4.4——线性融合存在
// 通道量表错位：对话模型输出 60–100、IRT 展示分均值≈50、实操是得分率
// 百分比，直接平均会让对话通道把 D1–D5 系统性抬高 15–25 分）。各通道用
// 自己的测量函数反演：
//   客观  θ = logit(s/100)            —— vendor 展示映射 100·σ(θ) 的逆
//   对话  θ = (s − 80)/10             —— interview-scoring-model 设计映射的逆
//                                          （与 cat-seeding 的定档映射同一条）
//   实操  θ = credit 锚点曲线的逆      —— work/scoring-study 90 次真实打分锚定
//                                          （credit .312/.555/.934 ↔ θ −1/0/+1）
// θ 均值映射回展示分。缺失通道按维度重新归一化（对话不覆盖 D6：
// D6 由客观+实操决定，不把没发生的观测算进权重）。反演值钳制 ±1.6，
// 单通道满分不会把融合分拖到无穷——线性融合的饱和稳健性保留。
//
// 展示映射（1.3.0）：线性定标 score = 50 + θ̄·(50/1.6)，θ 钳制界 ±1.6
// 恰好对应 0/100 分。此前的 100·σ(θ̄) 把天花板压在 σ(1.6)=83——三通道
// 全满分也只有 82-83 分，S 级（≥90）在任何表现下都不可达，等级阶梯名存
// 实亡。线性定标下：θ=0→50（中等）、θ≈1.28→90（S 线）、θ=1.6→100
// （全通道满分的理论上限），全距斜率恒定 31.25 分/θ，区分度均匀。
//
// 权重默认值 {objective 0.6, interview 0.25, practical 0.15} 来自实验 2
// （work/weighting-study）：效度优先（合成 RMSE 4.41，r=0.981）+ 两条防线
// （对话通道博弈漂移 ≤6 分限制其权重上限；实操单次观测的重测 SD 限制其
// 权重上限）。σ_P 敏感性扫描下最优解稳定在 {0.6-0.7, 0.2, 0.1-0.2}。
// 改这里必须同步 WEIGHTING_VERSION 与实验结论。

import {
  DIMENSIONS,
  DIFFICULTY_ANCHORS,
  gradeOverall,
  scoreAssessment,
} from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

export const WEIGHTING_VERSION = "1.3.0"; // 1.3.0: 融合展示改线性定标（±1.6θ ↔ 0/100 分，满分可达）
export const CHANNEL_KEYS = ["objective", "interview", "practical"];
export const DEFAULT_WEIGHTS = Object.freeze({ objective: 0.6, interview: 0.25, practical: 0.15 });

const THETA_LIMIT = 1.6;
const sigmoid = (value) => 1 / (1 + Math.exp(-value));

/** 融合 θ̄ → 展示分：线性定标，θ 钳制界 ±1.6 对应 0/100（见文件头）。 */
export function thetaToDisplayScore(theta) {
  if (!Number.isFinite(Number(theta))) return null;
  const linear = 50 + (Number(theta) / THETA_LIMIT) * 50;
  return Math.max(0, Math.min(100, Math.round(linear)));
}

// 实操 credit → θ 的逆锚点曲线（与 work/scoring-study 的校准锚点一致）。
const PRACTICAL_INVERSE = [[-1, 0.312], [0, 0.555], [1, 0.934]];
export function practicalCreditToTheta(credit) {
  const c = Math.max(0.05, Math.min(0.99, credit));
  if (c <= 0.312) return Math.max(-THETA_LIMIT, -1 - (0.312 - c) / 0.19);
  if (c >= 0.934) return Math.min(THETA_LIMIT, 1 + (c - 0.934) / 0.056);
  for (let i = 0; i < PRACTICAL_INVERSE.length - 1; i += 1) {
    const [x1, y1] = PRACTICAL_INVERSE[i];
    const [x2, y2] = PRACTICAL_INVERSE[i + 1];
    if (c >= y1 && c <= y2) return x1 + (x2 - x1) * (c - y1) / (y2 - y1);
  }
  return 0;
}

/** 各通道展示分 → 潜变量 θ（各自的测量函数之逆，钳 ±1.6）。 */
export function channelTheta(channel, score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return null;
  const value = Math.max(0, Math.min(100, Number(score)));
  if (channel === "objective") {
    const p = Math.max(0.02, Math.min(0.98, value / 100));
    return Math.max(-THETA_LIMIT, Math.min(THETA_LIMIT, Math.log(p / (1 - p))));
  }
  if (channel === "interview") {
    return Math.max(-THETA_LIMIT, Math.min(THETA_LIMIT, (value - 80) / 10));
  }
  if (channel === "practical") {
    return practicalCreditToTheta(value / 100);
  }
  return null;
}

function normalizeWeights(weights) {
  const source = weights && typeof weights === "object" ? weights : DEFAULT_WEIGHTS;
  const entries = CHANNEL_KEYS
    .map((key) => [key, Number(source[key])])
    .filter(([, value]) => Number.isFinite(value) && value >= 0);
  if (entries.length === 0) return { ...DEFAULT_WEIGHTS };
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}

/** 客观题通道：只用真实作答证据（非 external）过 vendor 评分核心。 */
export function objectiveChannel(evidence) {
  const items = (Array.isArray(evidence) ? evidence : []).filter((item) => !item.external);
  if (items.length === 0) {
    return { answeredCount: 0, dimensions: DIMENSIONS.map(({ key }) => ({ key, score: null })), overallScore: null };
  }
  const result = scoreAssessment(items, { totalQuestions: items.length });
  const scored = result.dimensions.filter((dimension) => dimension.score !== null);
  return {
    answeredCount: items.length,
    dimensions: result.dimensions.map(({ key, score, evidenceCount }) => ({ key, score, evidenceCount })),
    overallScore: scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length) : null,
  };
}

/**
 * 实操通道：external 证据（prac-*）按维度聚合 credit，并做**任务难度等值
 * 校准**（实验 3 的 R2 规则）。
 *
 * 背景：raw credit 是「相对任务难度」的函数——随机抽到难题的弱学员与
 * 抽到易题的强学员可能拿到同样的 credit，未校准的通道分把任务抽样噪声
 * 直接写进学员分数。IRT 等值：θ_绝对 = creditToTheta(credit) + b_task
 * （逆锚点曲线给出相对能力，加回任务难度锚点得绝对能力），展示分 =
 * 100·σ(θ_绝对)。证据里没带任务难度的旧记录按 medium(0) 处理。
 * rawCredit 字段保留「得分率」直读口径（全良好 75、全优秀 100）。
 */
export function practicalChannel(evidence) {
  const items = (Array.isArray(evidence) ? evidence : []).filter((item) => item.external);
  const taskIds = [...new Set(items.map((item) => item.questionId))];
  if (items.length === 0) {
    return { taskCount: 0, dimensions: DIMENSIONS.map(({ key }) => ({ key, score: null })), overallScore: null, credit: null, rawCredit: null };
  }
  const perDim = new Map();
  for (const item of items) {
    const anchor = DIFFICULTY_ANCHORS[item.difficulty] ?? 0;
    for (const key of item.dimKeys ?? []) {
      const list = perDim.get(key) ?? [];
      list.push({ credit: item.credit, anchor });
      perDim.set(key, list);
    }
  }
  const sigmoidLocal = (value) => 1 / (1 + Math.exp(-value));
  const dimensions = DIMENSIONS.map(({ key }) => {
    const list = perDim.get(key);
    if (!list || list.length === 0) return { key, score: null, evidenceCount: 0 };
    const thetas = list.map(({ credit, anchor }) => practicalCreditToTheta(credit) + anchor);
    const thetaAbs = thetas.reduce((sum, value) => sum + value, 0) / thetas.length;
    const rawMean = list.reduce((sum, { credit }) => sum + credit, 0) / list.length;
    return {
      key,
      score: Math.round(100 * sigmoidLocal(Math.max(-2.4, Math.min(2.4, thetaAbs)))),
      rawScore: Math.round(100 * rawMean),
      evidenceCount: list.length,
    };
  });
  const rawCredit = items.reduce((sum, item) => sum + item.credit, 0) / items.length;
  const anchors = items.map((item) => DIFFICULTY_ANCHORS[item.difficulty] ?? 0);
  const meanAnchor = anchors.length ? anchors.reduce((sum, value) => sum + value, 0) / anchors.length : 0;
  return {
    taskCount: taskIds.length,
    taskIds,
    dimensions,
    overallScore: Math.round(100 * sigmoidLocal(Math.max(-2.4, Math.min(2.4, practicalCreditToTheta(rawCredit) + meanAnchor)))),
    rawCredit: Math.round(rawCredit * 100) / 100,
    credit: Math.round(rawCredit * 100) / 100,
  };
}

/** 对话通道：attempt.interview（独立评分模型的输出）直接取六维分。 */
export function interviewChannel(interview) {
  if (!interview || typeof interview !== "object") {
    return { answeredSlots: 0, dimensions: DIMENSIONS.map(({ key }) => ({ key, score: null })), overallScore: null, completed: false };
  }
  // null/undefined 必须显式排除：Number(null) 是 0，会把「无证据维度」
  // 变成 0 分混进融合（实测 D6 被压低 11 分）。
  const byKey = new Map(
    (Array.isArray(interview.dimensions) ? interview.dimensions : [])
      .filter((item) => item && item.key
        && item.score !== null && item.score !== undefined
        && Number.isFinite(Number(item.score)))
      .map((item) => [item.key, Number(item.score)]),
  );
  return {
    answeredSlots: Number.isFinite(Number(interview.answeredSlots)) ? Number(interview.answeredSlots) : 0,
    totalSlots: Number.isFinite(Number(interview.totalSlots)) ? Number(interview.totalSlots) : 5,
    completed: Boolean(interview.completed),
    dimensions: DIMENSIONS.map(({ key }) => ({ key, score: byKey.get(key) ?? null })),
    overallScore: Number.isFinite(Number(interview.overallScore)) ? Number(interview.overallScore) : null,
  };
}

/**
 * 三通道 → 六维融合分 + 总分。
 *
 * @param {object} channels {objective, interview, practical}（上面的 *Channel 输出）
 * @param {object} weights 通道权重（自动归一化）
 * @returns 每维 {key, name, short, score, channels, evidenceCount} + overallScore/grade
 */
export function fuseChannels(channels, weights = DEFAULT_WEIGHTS) {
  const normalized = normalizeWeights(weights);
  const byChannel = {
    objective: channels.objective ?? { dimensions: [] },
    interview: channels.interview ?? { dimensions: [] },
    practical: channels.practical ?? { dimensions: [] },
  };
  // 实操通道有两个分数字段且量纲不同：score = σ(θ) 的展示分，
  // rawScore = 得分率 credit（×100）。channelTheta 的实操逆函数是
  // credit 锚点曲线，只能吃 credit——喂展示分会量纲错位（credit 0.555
  // 的中等表现被记为 θ≈−0.23，满分也只有 0.73）。有 rawScore 用它；
  // 旧快照没有时退回 logit 反演展示分（即其自身 sigmoid 的逆）。
  const practicalTheta = (item) => {
    if (!item) return null;
    if (Number.isFinite(Number(item.rawScore))) return channelTheta("practical", item.rawScore);
    return channelTheta("objective", item.score);
  };
  const channelDim = (channel) => new Map(
    (channel.dimensions ?? []).map((item) => [item.key, item]),
  );
  const maps = {
    objective: channelDim(byChannel.objective),
    interview: channelDim(byChannel.interview),
    practical: channelDim(byChannel.practical),
  };
  const evidenceByDim = new Map(
    (byChannel.objective.dimensions ?? [])
      .filter((item) => Number.isFinite(item.evidenceCount))
      .map((item) => [item.key, item.evidenceCount]),
  );

  const dimensions = DIMENSIONS.map(({ key, name, short }) => {
    const parts = [];
    const channelScores = {};
    for (const channel of CHANNEL_KEYS) {
      const item = maps[channel].get(key);
      const score = item?.score ?? null;
      channelScores[channel] = score;
      const theta = channel === "practical" ? practicalTheta(item) : channelTheta(channel, score);
      if (theta !== null && normalized[channel] > 0) parts.push([theta, normalized[channel]]);
    }
    if (parts.length === 0) {
      return { key, name, short, score: null, channels: channelScores, evidenceCount: evidenceByDim.get(key) ?? 0 };
    }
    const weightSum = parts.reduce((sum, [, weight]) => sum + weight, 0);
    const thetaMean = parts.reduce((sum, [theta, weight]) => sum + theta * weight, 0) / weightSum;
    return {
      key,
      name,
      short,
      score: thetaToDisplayScore(thetaMean),
      channels: channelScores,
      evidenceCount: evidenceByDim.get(key) ?? 0,
    };
  });

  const scored = dimensions.filter((dimension) => dimension.score !== null);
  const overallScore = scored.length
    ? Math.round(scored.reduce((sum, dimension) => sum + dimension.score, 0) / scored.length)
    : null;
  return { dimensions, overallScore, grade: gradeOverall(overallScore) };
}

/**
 * 从一次 attempt 构建完整的融合结果（快照与报告共用）。
 * vendor `result` 保持原样（纯 IRT 证据分），composite 是加权视图。
 */
export function buildComposite(attempt, weights = DEFAULT_WEIGHTS) {
  if (!attempt || !Array.isArray(attempt.evidence)) return null;
  const channels = {
    objective: objectiveChannel(attempt.evidence),
    interview: interviewChannel(attempt.interview),
    practical: practicalChannel(attempt.evidence),
  };
  const fused = fuseChannels(channels, weights);
  return {
    weightingVersion: WEIGHTING_VERSION,
    weights: normalizeWeights(weights),
    channels: {
      objective: {
        answeredCount: channels.objective.answeredCount ?? 0,
        overallScore: channels.objective.overallScore,
        dimensions: channels.objective.dimensions,
      },
      interview: {
        answeredSlots: channels.interview.answeredSlots ?? 0,
        totalSlots: channels.interview.totalSlots ?? 5,
        completed: channels.interview.completed ?? false,
        overallScore: channels.interview.overallScore,
        dimensions: channels.interview.dimensions,
      },
      practical: {
        taskCount: channels.practical.taskCount ?? 0,
        taskIds: channels.practical.taskIds ?? [],
        credit: channels.practical.credit ?? null,
        overallScore: channels.practical.overallScore,
        dimensions: channels.practical.dimensions,
      },
    },
    dimensions: fused.dimensions,
    overallScore: fused.overallScore,
    grade: fused.grade,
  };
}
