// 觉醒报告的个性化建议生成器（纯函数、确定性、无 LLM）。
//
// 设计目标：建议必须「可追溯到证据」且「因人而异」——不是六条固定文案。
// 输入是三通道融合结果（src/comprehensive-weighting.js 的 composite），
// 输出按优先级排序的提升计划：
//
//   1. 每个维度按融合分定档（strong/developing/focus），focus 优先、分低者优先；
//   2. 同一维度内再叠加**通道落差**诊断：三个通道同测一个维度却给出不同
//      水平时，落差本身就是最有价值的个性化信息——
//        对话 ≫ 客观：「说得好但认得不准」→ 概念辨析补课
//        客观 ≫ 对话：「做得出来但说不清楚」→ 隐性经验显性化
//        客观 ≫ 实操：「知识没落成产出」→ 真实任务演练
//        实操 ≫ 客观：「手感好但基础有洞」→ 系统补基础
//   3. 跨通道一致性检查：≥2 个维度出现大幅「说/做」背离时给整体提示；
//   4. 资源推荐由薄弱维度驱动，而不是固定三条。
//
// 为什么不用 LLM 生成：建议在报告渲染时同步计算，必须可复现、可回归测试
// （本仓库一贯的「算分不用模型」纪律）；LLM 叙事层未来可叠加，但底座
// 应该是规则的。

import { gradeOverall } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

// 通道落差阈值（展示分差）。12 分 ≈ 对数尺度 0.5 个 logit，
// 足以越过单通道的测量噪声（对话 T=0 打分 MDC95 ≈ 1.4 分，实操 3 票取中
// 后跨档零重叠），低于该差值的落差不触发诊断。
const GAP_THRESHOLD = 12;

const BAND_OF = (score) => (score === null || score === undefined
  ? "unknown"
  : score >= 80 ? "strong" : score >= 60 ? "developing" : "focus");

const UNKNOWN_ADVICE = "本次测评没有覆盖到这个维度的证据（可能阶段未完成或中途退出）——下次完整走完三个阶段即可获得该维度画像。";

// 维度 × 档位的基础建议（沿用手写文案，保持报告语气一致）。
const BASE_ADVICE = {
  D1: {
    strong: "基础认知扎实。可以开始接触多模态、Agent 等进阶概念，并关注模型能力边界的最新变化。",
    developing: "用一句话说清每个主流模型擅长什么任务，补齐对训练数据与能力边界的理解。",
    focus: "从最常用的三款 AI 工具入手，先弄清它们各自擅长与不擅长什么，再谈进阶技巧。",
  },
  D2: {
    strong: "提示词能力出色。尝试把常用提示沉淀为可复用模板，并练习约束与验收标准的精确表达。",
    developing: "继续训练结构化提示：目标、背景、约束、示例和验收标准分开写，逐项检查。",
    focus: "从模仿优秀提示开始，练习「角色 + 目标 + 约束 + 示例」四段式结构，写完再自查一遍。",
  },
  D3: {
    strong: "工具使用娴熟。可以挑战把多个工具串成完整工作流，并建立自己的工具选择决策树。",
    developing: "围绕真实工作流练习联网检索、文件分析、图像生成与结果交叉验证。",
    focus: "每周选定一个真实任务，完整走一遍「选工具 → 下指令 → 核对结果」的流程。",
  },
  D4: {
    strong: "评估能力强。为关键输出建立量化核查清单，并练习让 AI 自检后再人工复核。",
    developing: "为关键输出建立核查清单，主动追问依据、风险和反例。",
    focus: "拿到 AI 结果先问三个问题：依据是什么？哪里可能错？和事实如何核对？",
  },
  D5: {
    strong: "人机协同流畅。尝试把复杂项目拆成 AI 可执行的阶段计划，并在关键节点保留人工判断。",
    developing: "把复杂任务拆成 AI 可执行步骤，并在关键节点保留人工判断。",
    focus: "从一个中等任务开始练习分工：哪些交给 AI、哪些必须自己判断、如何衔接。",
  },
  D6: {
    strong: "伦理意识可靠。在团队中主动推动隐私脱敏、版权检查与高风险决策复核的规范落地。",
    developing: "重点练习隐私脱敏、版权检查、偏见识别和高风险决策复核。",
    focus: "了解数据隐私、版权与偏见三类高频风险，养成提交前脱敏、引用前核权的习惯。",
  },
};

// 通道落差诊断：pattern → [标题, 行动]。按检查顺序命中第一个。
const GAP_PATTERNS = [
  {
    id: "talk-strong",
    match: (c) => c.interview != null && c.objective != null && c.interview - c.objective >= GAP_THRESHOLD,
    title: "说得好，认得不准",
    note: "对话中你能讲清做法（{interview} 分），但客观辨析失分较多（{objective} 分）——经验有了，概念边界还没对齐。",
    actions: ["把这个维度的常见误区题刷一遍，错了立刻读解析、回到你的做法里对号入座。"],
  },
  {
    id: "do-strong",
    match: (c) => c.objective != null && c.interview != null && c.objective - c.interview >= GAP_THRESHOLD,
    title: "做得出来，说不清楚",
    note: "客观题表现（{objective} 分）明显好于对话表达（{interview} 分）——会做但经验还是隐性的，换个人就接不走。",
    actions: ["用「背景—做法—为什么这样做」三段式，把这个维度的方法写成一页可交接的说明。"],
  },
  {
    id: "knowledge-gap",
    match: (c) => c.objective != null && c.practical != null && c.objective - c.practical >= GAP_THRESHOLD,
    title: "知识没落成产出",
    note: "你知道该怎么做（客观 {objective} 分），但实操产物没达到同等水平（{practical} 分）——差的是把要求写进提示词并迭代到位的那一步。",
    actions: ["挑一道这个维度的实操任务重做：先写验收标准，再写提示词，产物逐条对照标准改一轮。"],
  },
  {
    id: "skill-gap",
    match: (c) => c.practical != null && c.objective != null && c.practical - c.objective >= GAP_THRESHOLD,
    title: "手感好，基础有洞",
    note: "实操产物质量（{practical} 分）高于概念辨析（{objective} 分）——靠手感在补基础，边界情况容易翻车。",
    actions: ["系统补一遍该维度的概念清单，重点看你在客观题里答错的那几条。"],
  },
];

// 维度驱动的资源池：focus/developing 维度各推荐一个，最强维度给进阶向。
const RESOURCE_POOL = {
  D1: { tag: "模型通识", title: "AI 能力边界速览工作坊", result: "补强基础认知 · 预计 25 分钟" },
  D2: { tag: "提示词实战", title: "结构化提示改写训练", result: "提升提示词工程 · 预计 30 分钟" },
  D3: { tag: "工具实战", title: "联网检索与文件分析挑战", result: "提升工具使用 · 预计 35 分钟" },
  D4: { tag: "评估方法", title: "AI 输出核查清单实验室", result: "强化结果评估 · 预计 25 分钟" },
  D5: { tag: "人机协同", title: "任务拆解与分工推演", result: "提升协同能力 · 预计 30 分钟" },
  D6: { tag: "伦理案例", title: "偏见、隐私与版权审查实验室", result: "强化伦理合规 · 预计 30 分钟" },
};

function fill(text, channels) {
  return String(text ?? "").replace(/\{(interview|objective|practical)\}/g, (_, key) =>
    channels[key] != null ? String(channels[key]) : "—");
}

/**
 * 生成完整的个性化建议结构。
 * @param {object} composite buildComposite 的输出（可含 null 维度）
 */
export function buildRecommendations(composite) {
  if (!composite || !Array.isArray(composite.dimensions)) return null;
  const bandCount = (band) => composite.dimensions.filter((dimension) => BAND_OF(dimension.score) === band).length;

  const items = composite.dimensions.map((dimension) => {
    const channels = dimension.channels ?? {};
    const band = BAND_OF(dimension.score);
    const pattern = GAP_PATTERNS.find((candidate) => candidate.match(channels)) ?? null;
    return {
      key: dimension.key,
      name: dimension.name,
      short: dimension.short,
      score: dimension.score,
      band,
      grade: gradeOverall(dimension.score ?? 0),
      channels,
      advice: band === "unknown" ? UNKNOWN_ADVICE : BASE_ADVICE[dimension.key]?.[band] ?? "",
      gap: pattern
        ? { id: pattern.id, title: pattern.title, note: fill(pattern.note, channels), actions: pattern.actions }
        : null,
    };
  });

  // 排序：focus 优先且分低者先；其次带落差的 developing；再 strong；
  // 无证据维度（unknown）永远排最后——没有分数的维度不产生行动项。
  const rank = { focus: 0, developing: 1, strong: 2, unknown: 3 };
  const priorities = [...items].sort((left, right) => {
    const bandGap = rank[left.band] - rank[right.band];
    if (bandGap !== 0) return bandGap;
    if (left.band === "focus") return (left.score ?? 0) - (right.score ?? 0);
    const gapFlag = (right.gap ? 1 : 0) - (left.gap ? 1 : 0);
    if (gapFlag !== 0) return gapFlag;
    return (left.score ?? 0) - (right.score ?? 0);
  });

  const scored = items.filter((item) => item.score !== null);
  const strengths = [...scored].sort((left, right) => (right.score ?? 0) - (left.score ?? 0)).slice(0, 2);
  const weakest = [...scored].sort((left, right) => (left.score ?? 0) - (right.score ?? 0))[0] ?? null;

  const inconsistencies = items.filter((item) =>
    item.channels.interview != null && item.channels.objective != null
    && Math.abs(item.channels.interview - item.channels.objective) >= GAP_THRESHOLD);
  const consistency = inconsistencies.length >= 2
    ? {
      flag: true,
      note: `有 ${inconsistencies.length} 个维度出现「说的与做的不一致」（对话与客观分差 ≥ ${GAP_THRESHOLD} 分）。这类背离通常意味着经验还停留在具体案例上、没有泛化成方法——优先把强维度的做法写成可复用步骤，再迁移到弱维度。`,
    }
    : { flag: false, note: null };

  const resourceKeys = new Set();
  for (const item of priorities) {
    if (item.band === "focus" || item.band === "developing") resourceKeys.add(item.key);
  }
  if (strengths[0]) resourceKeys.add(strengths[0].key);
  const resources = [...resourceKeys]
    .filter((key) => RESOURCE_POOL[key])
    .map((key) => ({ dim: key, ...RESOURCE_POOL[key] }));

  const summary = weakest
    ? `综合评级 ${composite.grade ?? gradeOverall(composite.overallScore ?? 0)}：${strengths.map((item) => `${item.name}（${item.score}）`).join("、")} 是你的强项；优先补 ${weakest.name}（${weakest.score}），${bandCount("focus") > 0 ? "另有 " + (bandCount("focus") - 1) + " 个维度处于待提升区间" : "其余维度均在发展区间"}。`
    : null;

  return { summary, priorities, strengths, consistency, resources };
}
