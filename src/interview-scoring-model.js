// 对话式测评的独立评分模型。
//
// 为什么需要一个独立模型：
//
// 原来的做法是把每个话题的档位分（0–1）当作「外部证据」塞进
// vendor/aiquos-six-dimension-scoring 的同一套 IRT 后验里，与客观题、
// 实操证据混算。那条链路对对话通道有三处根本性错配：
//
//   1. **证据太少**。IRT 的最大后验含 N(0,1) 先验（−θ²/2），证据越少、
//      向 θ=0 收缩越狠。实测：全部满分时 1 条证据只得 60 分、5 条 76 分、
//      要 25 条才到 91 分。而对话测评总共只有 5 个话题，单个维度只分到
//      1–4 条证据 —— D1/D3/D4 即使完美作答也只有 60 分，永远到不了 A 档。
//   2. **量纲错配**。IRT 输出的是「能力估计值」，60–100 只是它的一个
//      取值区间，不是设计好的档位；分数分布被压在下半段，缺少对高分
//      的区分力。
//   3. **题目难度无意义**。客观题的 difficulty 来自题库设计（low/medium/
//      high 对应 b = −1/0/+1）；对话话题没有难度标定，硬套 medium
//      等于人为给每个维度加了一个固定的偏置。
//
// 独立模型的原则：
//
//   - **档位直接映射分数**：五档锚点 → 分数锚点，分段线性，可解释、可审计；
//   - **证据加权 + 收缩**：主维度全权重、副维度 0.8；证据少时向基准分
//     温和回归（避免一条回答定终身），证据多时逐步放开；
//   - **维度可缺**：没有证据覆盖的维度返回 null，不臆造分数；
//   - **可复现**：纯函数，无随机、无先验、无迭代求解，同样的档位必然
//     得到同样的分数，便于回归测试与线上排查。

/** 档位量表 —— 与 src/interview-scoring.js 的 CREDIT_SCALE 一致（7 档非等距）。 */
export const CREDIT_SCALE = [0, 0.2, 0.45, 0.65, 0.8, 0.92, 1];

/**
 * 档位 → 分数锚点（60–100）。
 *
 * 与量表的非等距设计对齐：低区（0→0.2→0.45）跨度小但信息量大，
 * 高区（0.65→0.8→0.92→1）展开，让中水平与高水平的差异有档位承载。
 *
 * 标定方法：用实验实测的三组档位分布反推 ——
 *   低组 {0.2:30}、中组 {0.65:11, 0.8:10, 0.92:9}、高组 {0.8:1, 0.92:26, 1:3}
 * 目标是让三组的总分（经维度权重与证据收缩后）落进**不同的能力等级**，
 * 尤其把最难的"中 vs 高"分开。
 *
 * 反推对比（B/C 区分度 = 组间差 / 组内 SD 均值）：
 * 最终采用 (60,66,74,86,96,99,100)，它在满足区分度的同时让
 * 每档落进合适的能力等级（收缩后的实测落点）：
 *
 *   档位    总分   等级
 *   0.2     66     C
 *   0.45    72     B     ← "能说清一件事"
 *   0.65    81     A     ← "有做法+标准"（A 档下沿）
 *   0.8     88     A     ← "有取舍理由"（A 档上沿）
 *   0.92    90     S     ← "熟练可复用"
 *   1.0     91     S     ← "反思能力边界"
 */
export const BAND_SCORES = [60, 66, 74, 86, 96, 99, 100];

/** 收缩基准：没有强证据时的默认落点（"提及"档 = 量表第二档 66 分）。 */
const PRIOR_SCORE = 66;

/**
 * 收缩强度。effectiveWeight = Σ(话题权重) 时：
 *   λ = w / (w + K)
 *   score = PRIOR_SCORE + (base − PRIOR_SCORE) × λ
 *
 * K = 0.5 的取值效果（单证据维度视角）：
 *   1 条主证据（w=1.0）→ λ=0.67，既尊重证据、也不让一条回答定终身；
 *   2 条证据（w=1.8）  → λ=0.78；
 *   4 条证据（w=3.8）  → λ=0.88，几乎完全体现真实档位。
 *
 * 更大的 K（如 1.2）收缩过强，会把中档压进低档区间，
 * 与"有做法有标准 = A 档"的业务语义冲突。
 */
const SHRINK_K = 0.5;

/** 主/副维度权重：话题绑定的第一个维度是主，第二个是副。 */
export const PRIMARY_WEIGHT = 1.0;
export const SECONDARY_WEIGHT = 0.8;

/**
 * 话题 → 维度绑定（主维度在前）。
 *
 * 与 src/interviewer.js 的 INTERVIEW_LADDER[].dims 必须保持一致，
 * 但这里显式区分主副 —— 原实现把两个维度等同对待，导致"提示词工程"
 * 这种被 4 个话题覆盖的维度分数被稀释，"工具使用"这种只被 1 个话题
 * 覆盖的维度反而与它同权。
 *
 * tests/interview-scoring-model.test.mjs 会校验两者一致。
 */
export const SLOT_DIMENSION_WEIGHTS = {
  experience: [["D1", PRIMARY_WEIGHT], ["D5", SECONDARY_WEIGHT]],
  goal: [["D2", PRIMARY_WEIGHT], ["D5", SECONDARY_WEIGHT]],
  constraints: [["D2", PRIMARY_WEIGHT], ["D3", SECONDARY_WEIGHT]],
  feedback: [["D4", PRIMARY_WEIGHT], ["D2", SECONDARY_WEIGHT]],
  consolidate: [["D2", PRIMARY_WEIGHT], ["D5", SECONDARY_WEIGHT]],
};

export const DIMENSION_KEYS = ["D1", "D2", "D3", "D4", "D5", "D6"];

/** 档位 → 基础分（分段线性插值，单调）。 */
export function creditToScore(credit) {
  const c = Math.max(0, Math.min(1, Number(credit) || 0));
  if (c <= CREDIT_SCALE[0]) return BAND_SCORES[0];
  if (c >= CREDIT_SCALE[CREDIT_SCALE.length - 1]) return BAND_SCORES[BAND_SCORES.length - 1];
  for (let i = 0; i < CREDIT_SCALE.length - 1; i += 1) {
    const lo = CREDIT_SCALE[i];
    const hi = CREDIT_SCALE[i + 1];
    if (c >= lo && c <= hi) {
      const t = (c - lo) / (hi - lo);
      return BAND_SCORES[i] + t * (BAND_SCORES[i + 1] - BAND_SCORES[i]);
    }
  }
  return BAND_SCORES[0];
}

/** 证据量不足时向基准分温和收缩。 */
export function shrinkTowardPrior(base, effectiveWeight) {
  if (!Number.isFinite(effectiveWeight) || effectiveWeight <= 0) return PRIOR_SCORE;
  const lambda = effectiveWeight / (effectiveWeight + SHRINK_K);
  return PRIOR_SCORE + (base - PRIOR_SCORE) * lambda;
}

/**
 * 单个维度的分数。
 *
 * @param {string} dimensionKey
 * @param {Record<string, number|null>} slotCredits 各话题的档位分（缺失可为 null/undefined）
 * @returns {number|null} 60–100 的整数；无任何证据时返回 null
 */
export function scoreDimension(dimensionKey, slotCredits) {
  const contributions = [];
  for (const [slotId, dims] of Object.entries(SLOT_DIMENSION_WEIGHTS)) {
    const credit = slotCredits?.[slotId];
    if (credit === null || credit === undefined || !Number.isFinite(Number(credit))) continue;
    const entry = dims.find(([key]) => key === dimensionKey);
    if (!entry) continue;
    contributions.push({ credit: Number(credit), weight: entry[1] });
  }
  if (contributions.length === 0) return null;

  const effectiveWeight = contributions.reduce((sum, item) => sum + item.weight, 0);
  const weightedCredit = contributions.reduce((sum, item) => sum + item.weight * item.credit, 0) / effectiveWeight;
  const base = creditToScore(weightedCredit);
  const shrunk = shrinkTowardPrior(base, effectiveWeight);
  return Math.max(60, Math.min(100, Math.round(shrunk)));
}

/** 能力等级（与项目既有边界一致）。 */
export function gradeOverall(score) {
  if (score === null || score === undefined) return null;
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

/**
 * 对话测评的完整结果。
 *
 * @param {Record<string, number|null>} slotCredits 五个话题的档位分
 * @returns {{dimensions: Array, overallScore: number|null, grade: string|null,
 *            completed: boolean, coveredDimensions: string[], evidenceCount: number}}
 */
export function scoreInterview(slotCredits) {
  const dimensions = DIMENSION_KEYS.map((key) => ({
    key,
    score: scoreDimension(key, slotCredits),
  }));
  const covered = dimensions.filter((dimension) => dimension.score !== null);
  // 总分只在五个话题全部作答后给出：中途算平均会随作答进度剧烈跳动。
  const answeredSlots = Object.entries(SLOT_DIMENSION_WEIGHTS)
    .filter(([slotId]) => Number.isFinite(Number(slotCredits?.[slotId])))
    .length;
  const totalSlots = Object.keys(SLOT_DIMENSION_WEIGHTS).length;
  const completed = answeredSlots >= totalSlots;
  const overallScore = completed && covered.length
    ? Math.round(covered.reduce((sum, dimension) => sum + dimension.score, 0) / covered.length)
    : null;
  return {
    dimensions,
    overallScore,
    grade: gradeOverall(overallScore),
    completed,
    answeredSlots,
    totalSlots,
    coveredDimensions: covered.map((dimension) => dimension.key),
    evidenceCount: answeredSlots,
  };
}

/**
 * 把对话结果折算成六维"展示分"，供报告页统一渲染。
 *
 * 与客观题/实操的分数在**语义上等价**（都是 60–100 的能力分），
 * 但**计算完全独立**：互不混算，各自的证据只进自己的模型。
 * 未被对话覆盖的维度返回 null，由报告层决定是否与其它通道合并展示。
 */
export function toDimensionEntries(slotCredits) {
  const result = scoreInterview(slotCredits);
  return result.dimensions;
}
