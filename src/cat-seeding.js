// 对话式测评 → 客观题 CAT 的先验定档（纯函数，前端/worker/测试共用）。
//
// 升级前的客观题阶段是「盲启动」：position 从 1 起步、能力估计为空，
// 前几题只能按难度距离猜。实测（src/comprehensive-adaptive.js 顶部注释）
// 5 分钟预算内每场都撞 20 题上限，精度停止规则从未生效——因为从零积累
// Fisher 信息到 SE≤0.42 需要约 23 题，预算根本给不完。
//
// 对话式测评先于客观题发生，且已经产出一个 60–100 的能力分。把它折算成
// CAT 的初始先验 N(θ₀, 1/κ)，有三个直接作用：
//   1. 第一题就打在估计水平附近（target = θ₀），不再从 medium 盲试；
//   2. 先验本身就是信息（κ），让「精度停止」有机会在预算内触发 → 少答题；
//   3. 先验只影响路由（出哪道题、何时停），不进评分——最终分数仍由
//      vendor 评分核心按真实作答证据计算，谎报水平换不到高分：
//      高报 → 立刻接到难题、答错照样压分；低报 → 简单题全对、θ 提升有限。
//
// 量纲校准：对话分 s（60–100）与客观题维度分同族（都是 100·sigmoid(θ) 的
// 展示分）。线性映射 θ₀ = (s − 80) / 10 让档位落点对齐题目难度锚点
// （BAND_SCORES = 60/66/74/86/96/99/100）：
//   66（提及）→ −1.4   74（具体）→ −0.6   86（可操作）→ +0.6
//   96（有判断）→ +1.6（钳）  99（熟练）→ +1.6（钳）  100（专业）→ +1.6（钳）
// 题目难度锚点为 low/medium/high = −1/0/+1，θ₀ 钳制在 ±1.6 内：
// 超出后选题已饱和到最高/最低难度档，更大的值没有信息量。
//
// κ（先验信息量）默认按话题覆盖度给满 1.0，由 work/cat-seeding-study 的
// κ 网格实验（{0,0.5,1,2,4,8} × σ_I{4,8,12} × θ*5 档 × N=120×2）标定：
//   κ=0.5–1 是质量甜点——区分度 r 0.861→0.874、ICC 0.865→0.885、MDC95
//   18.1→16.9，且在三个噪声 regime 下稳健；信息论上访谈 5 话题的信息量
//   ≈ 1/σ_I² = 1.56（σ_I=8 分），κ=1 与之相容而不过度自信。
//   κ=2 是标定的**省时档位**：精度停止在 ~16 题触发（对照盲启动 20 题上
//   限，−20% 题量/−52s），客观通道 r 降 0.016，但经三通道融合（实验 2）
//   与任务匹配+难度校准（实验 3）后合成效度几乎无损（r −0.007）。
//   κ≥4 被实验否决：题量塌到下限 8 题，r 崩至 0.75。
// 改这里必须同步改实验结论与 tests/cat-seeding.test.mjs。

export const SEED_CENTER = 80;
export const SEED_SCALE = 10;
export const SEED_THETA_LIMIT = 1.6;
// 满话题覆盖时的先验信息量（质量优先档；省时档 = 2.0，见上）。
export const SEED_KAPPA_MAX = 1;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * 对话结果 → 先验均值 θ₀。
 *
 * 优先用总分（覆盖维度的均值，语义最稳）；总分缺失时退回维度分均值。
 * 没有任何可用分数返回 null（= 不定档，保持盲启动）。
 * 注意 null/undefined 必须显式排除：Number(null) 是 0，会把缺分当成零分。
 */
export function interviewSeedTheta(input) {
  const { overallScore = null, dimensions = [] } = input && typeof input === "object" ? input : {};
  const hasOverall = overallScore !== null && overallScore !== undefined && Number.isFinite(Number(overallScore));
  const dimScores = Array.isArray(dimensions)
    ? dimensions
        .filter((item) => item && item.score !== null && item.score !== undefined && Number.isFinite(Number(item.score)))
        .map((item) => Number(item.score))
    : [];
  // 契约是「优先总分」：总分本身已是覆盖维度的均值，再与维度分混平均会
  // 把种子稀释（overall 改加权口径时更甚）。总分缺失才退回维度分均值。
  const mean = hasOverall
    ? Number(overallScore)
    : (dimScores.length ? dimScores.reduce((sum, value) => sum + value, 0) / dimScores.length : null);
  if (mean === null) return null;
  return clamp((mean - SEED_CENTER) / SEED_SCALE, -SEED_THETA_LIMIT, SEED_THETA_LIMIT);
}

/**
 * 对话结果 → 先验信息量 κ。按已答话题数线性放大：对话证据越全，
 * 定档越可信；一个话题都没答（抢跑/离线）→ null，不定档。
 */
export function interviewSeedKappa({ answeredSlots = 0, totalSlots = 5 } = {}) {
  const answered = Number.isFinite(Number(answeredSlots)) ? Math.max(0, Number(answeredSlots)) : 0;
  const total = Number.isFinite(Number(totalSlots)) && Number(totalSlots) > 0 ? Number(totalSlots) : 5;
  if (answered <= 0) return null;
  return round2(SEED_KAPPA_MAX * Math.min(1, answered / total));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 服务端定档入口：把客户端上报的对话分数折算成 {theta, kappa}。
 *
 * 只接受白名单字段且全部钳制——这是路由的唯一外部输入，脏数据最多
 * 退化成「不定档」，不能让非法先验进 session。
 */
export function normalizeSeedPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const theta = interviewSeedTheta(raw);
  const kappa = interviewSeedKappa(raw);
  if (theta === null || kappa === null || kappa <= 0) return null;
  return { theta: round2(theta), kappa: round2(kappa) };
}

/**
 * 把先验装进路由 session（幂等：已有先验或已有作答证据则不动）。
 * 服务端在客观题阶段第一题请求时调用；之后 session 由客户端原样回传，
 * normalizePrior 保证回传途中的损坏先验被丢弃而不是报错。
 */
export function seedSession(session, seed) {
  if (!session || !seed) return session;
  if (session.prior) return session;
  if (Array.isArray(session.evidence) && session.evidence.length > 0) return session;
  return { ...session, prior: { theta: seed.theta, kappa: seed.kappa } };
}

/** session.prior 的防御性归一（worker normalizeSession 用）：坏先验→null。 */
export function normalizePrior(raw) {
  if (!raw || typeof raw !== "object") return null;
  const theta = Number(raw.theta);
  const kappa = Number(raw.kappa);
  if (!Number.isFinite(theta) || !Number.isFinite(kappa)) return null;
  if (theta < -SEED_THETA_LIMIT - 0.4 || theta > SEED_THETA_LIMIT + 0.4) return null;
  if (kappa <= 0 || kappa > SEED_KAPPA_MAX * 4) return null;
  return { theta: clamp(theta, -SEED_THETA_LIMIT, SEED_THETA_LIMIT), kappa: round2(kappa) };
}
