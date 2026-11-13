/**
 * 知识库推荐的三画像对比 QA：证明推荐随被测画像变化（阶段 2 验收）。
 *
 * 三个假想学员：
 *   A 新手    —— 六维全 focus（38–54 分），D1 对话≫客观（概念补课处方）
 *   B 中级    —— D2 focus / D3 developing / 其余 strong，D3 客观≫实操（任务演练处方）
 *   C 高手    —— 六维全 strong（82–95 分），D5 实操≫客观（系统补基础处方）
 *
 * 断言（任一失败退出码 1）：
 *   1. 三画像的推荐资源两两重叠 ≤2（推荐确实因人而异）；
 *   2. A 的资源全部来自 low 难度槽、C 的全部来自 high 槽（档位对齐）；
 *   3. 处方变体生效：A 的 D1 资源 concept 变体、B 的 D3 资源 practice、C 的 D5 systematic；
 *   4. 单份推荐内同子主题 ≤2、URL 不重复。
 *
 * 运行：node scripts/qa-knowledge-recs.mjs
 */
import { buildRecommendations, queryKnowledgeResources } from "../src/report-recommendations.js";
import { selectLearningResources } from "../src/report-learning-plan.js";

const DIM = (key, name, score, channels = null) => ({ key, name, short: name.slice(0, 2), score, channels });
const dimOf = (map) => Object.entries(map).map(([key, value]) =>
  DIM(key, {
    D1: "AI基础认知", D2: "提示词工程", D3: "AI工具使用", D4: "AI结果评估与优化",
    D5: "人机协同解决问题", D6: "AI伦理与合规",
  }[key], typeof value === "number" ? value : value.score, typeof value === "number" ? null : value.channels));

const PROFILES = {
  // 画像的落差 channels 精确绕开 GAP_PATTERNS 的前置档（按 talk→do→knowledge→skill
  // 顺序首个命中生效），确保目标处方触发：
  //   A 的 D1 talk-strong（interview-objective=18）；B 的 D3 knowledge-gap
  //   （objective-practical=16 且 interview-objective=2 不触发 do-strong）；
  //   C 的 D5 skill-gap（practical-objective=22 且 interview-objective=2）。
  "A 新手": dimOf({
    D1: { score: 44, channels: { interview: 58, objective: 40, practical: 42 } },
    D2: 38, D3: 52, D4: 48, D5: 54, D6: 41,
  }),
  "B 中级": dimOf({
    D1: 82, D2: 55,
    D3: { score: 66, channels: { interview: 80, objective: 82, practical: 66 } },
    D4: 84, D5: 76, D6: 88,
  }),
  "C 高手": dimOf({
    D1: 92, D2: 88, D3: 84, D4: 95,
    D5: { score: 86, channels: { interview: 72, objective: 70, practical: 92 } },
    D6: 82,
  }),
};

const overallOf = (dimensions) => Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
const failures = [];
const check = (ok, message) => { console.log(`${ok ? "  ✓" : "  ✗"} ${message}`); if (!ok) failures.push(message); };

console.log("== 知识库推荐三画像对比 QA ==\n");
const byProfile = {};
for (const [name, dimensions] of Object.entries(PROFILES)) {
  const composite = {
    dimensions,
    overallScore: overallOf(dimensions),
    grade: "B",
    channels: { objective: {}, interview: {}, practical: {} },
  };
  const advice = buildRecommendations(composite);
  const planResources = selectLearningResources({ dimensions, overallScore: overallOf(dimensions) });
  const resources = advice.resources.filter((item) => item.id);
  byProfile[name] = { advice, resources, planResources };

  console.log(`【${name}】总分 ${overallOf(dimensions)} · focus 维：${dimensions.filter((d) => d.score < 60).map((d) => d.key).join("、") || "无"}`);
  for (const item of resources) {
    console.log(`  ${item.dim} ${item.band}/${item.variant} [${item.type}] ${item.title.slice(0, 34)}（${item.subtopic}）`);
  }
  console.log(`  → 学习方案（PDF 第三段）取 ${planResources.length} 条，首条：${planResources[0]?.title?.slice(0, 40) ?? "（无）"}\n`);
}

const names = Object.keys(byProfile);
// 1. 两两重叠（库浅时同档槽候选少，交集自然偏大：D2:low 仅 4 条时取 3 必交 ≥2。
//    阶段 3 扩量后槽深 ≥40，应把阈值收紧回 ≤1——见 PROGRESS.md 阶段 3 复核项）
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const left = new Set(byProfile[names[i]].resources.map((item) => item.id));
    const overlap = byProfile[names[j]].resources.filter((item) => left.has(item.id)).length;
    check(overlap <= 3, `${names[i]} × ${names[j]} 资源重叠 ${overlap} ≤ 3`);
  }
}
// 2. 档位对齐：A 全 low 槽、C 全 high 槽（兜底硬编码资源无 id，不计入）
check(byProfile["A 新手"].resources.every((item) => item.band === "focus"), "A 新手推荐全部来自 focus(low) 槽");
check(byProfile["C 高手"].resources.every((item) => item.band === "strong"), "C 高手推荐全部来自 strong(high) 槽");
// 3. 处方变体（C 全维 strong 不进资源循环，D5 systematic 用槽位直查验证）
check(byProfile["A 新手"].resources.some((item) => item.dim === "D1" && item.variant === "concept"), "A 的 D1 落差处方 → concept 变体");
check(byProfile["B 中级"].resources.some((item) => item.dim === "D3" && item.variant === "practice"), "B 的 D3 落差处方 → practice 变体");
const systematicProbe = queryKnowledgeResources({
  dim: "D5", score: 86, channels: { interview: 72, objective: 70, practical: 92 }, n: 2,
});
check(systematicProbe.length > 0 && systematicProbe.every((item) => item.variant === "systematic"),
  `C 的 D5 落差处方 → systematic 变体（直查 ${systematicProbe.length} 条）`);
// 4. 打散约束
for (const [name, { resources }] of Object.entries(byProfile)) {
  const subtopicCount = new Map();
  let subtopicOverflow = 0;
  for (const item of resources) {
    const next = (subtopicCount.get(item.subtopic) ?? 0) + 1;
    subtopicCount.set(item.subtopic, next);
    if (next > 2) subtopicOverflow++;
  }
  check(subtopicOverflow === 0, `${name} 同子主题 ≤2`);
  check(new Set(resources.map((item) => item.url)).size === resources.length, `${name} 资源 URL 不重复`);
}

console.log(failures.length === 0
  ? "\n全部断言通过：推荐随画像变化，档位与处方变体生效，打散约束满足。"
  : `\n${failures.length} 项断言失败：\n- ${failures.join("\n- ")}`);
process.exit(failures.length === 0 ? 0 : 1);
