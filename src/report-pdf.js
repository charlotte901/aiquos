// 个性化能力测评报告 PDF:封面 + 三段式正文(学员能力评价 → 个性化学习建议 → 推荐学习资源)。
// 正文与图表共用觉醒报告页的绿色视觉;图表由 report-charts.js 在浏览器端
// 渲染为 JPEG,无 canvas 环境(如 node 测试)时自动跳过配图,文本照常生成。

import {
  LEARNING_PLAN_STYLE,
  STAGE_META,
  buildAdviceItems,
  buildAdvicePace,
  buildLearningPlan,
  selectLearningResources,
} from "./report-learning-plan.js";
import { buildPdfBytes, createDocument, loadReportFonts, pdfColor, savePdfBytes } from "./learning-plan-pdf.js";
import { generateReportText, reportTemplateText } from "./report-text.js";
import { renderDimensionGlyphs } from "./report-charts.js";
import { assessmentLabel } from "./server-records.js";

const STYLE = LEARNING_PLAN_STYLE;
const PAGE = {
  width: STYLE.page.width,
  height: STYLE.page.height,
  margin: STYLE.page.marginLeft,
  contentWidth: STYLE.space.contentWidth,
};

// 自上而下的版式坐标:封面元素按「距页顶距离」排版,绘制时换算为 PDF 坐标。
const fromTop = (yTop, height = 0) => PAGE.height - yTop - height;

// 报告配色：对齐用户提供的正式研究报告体例——纯黑正文 + 灰阶辅助，
// 不使用品牌绿色。整份报告只在顶部保留 12 个灰色点阵字（六维能力字像），
// 其余为纯文字。
const C = {
  brand: pdfColor("#333333"),
  green: pdfColor("#555555"),
  ink: pdfColor("#000000"),
  muted: pdfColor("#666666"),
  line: pdfColor("#cccccc"),
  card: pdfColor("#f7f7f7"),
  cardBorder: pdfColor("#dddddd"),
  amber: pdfColor("#000000"),
  amberCard: pdfColor("#f7f7f7"),
  amberBorder: pdfColor("#dddddd"),
  white: pdfColor("#ffffff"),
};

const TYPE = {
  kicker: { size: 9.5, lineHeight: 15 },
  title: { size: 24, lineHeight: 32 },
  subtitle: { size: 11, lineHeight: 17 },
  summary: { size: 10.5, lineHeight: 19 },
  sectionKicker: { size: 9.5, lineHeight: 19 },
  sectionTitle: { size: 14, lineHeight: 20 },
  body: { size: 10.5, lineHeight: 17 },
  cardTitle: { size: 12, lineHeight: 18 },
  small: { size: 9.5, lineHeight: 14 },
  caption: { size: 8.5, lineHeight: 12 },
  footnote: { size: 8, lineHeight: 12 },
};

function scoreOf(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
}

function gradeOfScore(score) {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

function bandCounts(dimensions) {
  const counts = { strong: 0, developing: 0, focus: 0 };
  for (const dimension of dimensions ?? []) {
    const score = scoreOf(dimension.score);
    if (score === null) continue;
    counts[score >= 80 ? "strong" : score >= 60 ? "developing" : "focus"] += 1;
  }
  return counts;
}

function totalEvidence(dimensions) {
  return (dimensions ?? []).reduce((sum, dimension) => {
    const count = Number(dimension?.evidenceCount);
    return Number.isFinite(count) ? sum + count : sum;
  }, 0);
}

function bandCountSentence(counts) {
  const parts = [`${counts.strong} 个维度达到稳固水平（80 分及以上）`, `${counts.developing} 个维度处于发展区间（60–79 分）`];
  if (counts.focus) parts.push(`${counts.focus} 个维度低于 60 分，需要优先补强`);
  return `从分档看，${parts.join("，")}。`;
}

function channelSentence(model) {
  const channels = model.channelOveralls;
  if (!channels) return "";
  const known = ["objective", "interview", "practical"].filter((key) => channels[key] != null);
  if (!known.length) return "";
  const labels = { objective: "客观题", interview: "对话采访", practical: "实操工作台" };
  const summary = known.map((key) => `${labels[key]} ${Math.round(channels[key])} 分`).join("、");
  return known.length === 3 ? `三个通道的证据融合结果为：${summary}，综合画像由三类证据互相校准。` : `本次已有通道成绩为：${summary}。`;
}

// 第一部分正文：总体水平评价（总分 → 强弱项 → 分档结构 → 通道校准 → 阶段建议）。
function overallParagraph(model) {
  const score = Math.round(Number(model?.overallScore ?? 0));
  const grade = model?.grade ?? gradeOfScore(score);
  const stage = STAGE_META[grade] ?? STAGE_META.D;
  const dimensions = (model?.dimensions ?? [])
    .map((dimension) => ({ ...dimension, value: scoreOf(dimension.score) }))
    .filter((dimension) => dimension.value !== null)
    .sort((left, right) => right.value - left.value);
  const strongest = dimensions[0];
  const weakest = dimensions[dimensions.length - 1];
  const counts = bandCounts(model?.dimensions);
  const sentences = [`本次${assessmentLabel(model.assessmentId || "comprehensive")}总分 ${score} 分，对应 ${grade} 档（${stage.label}）。`];
  if (strongest && weakest && strongest !== weakest) {
    sentences.push(`你在${strongest.name}上表现相对突出（${strongest.value} 分），${weakest.name}（${weakest.value} 分）是当前最值得优先补强的方向。`);
  }
  sentences.push(bandCountSentence(counts));
  const channels = channelSentence(model);
  if (channels) sentences.push(channels);
  sentences.push(stage.action);
  return sentences.join("");
}

function problemIntroParagraph(model) {
  const counts = bandCounts(model?.dimensions);
  const priorities = model.recommendations?.priorities ?? [];
  const gapCount = priorities.filter((item) => item.gap).length;
  const gapPart = gapCount
    ? `另有 ${gapCount} 个维度在客观题、对话采访与实操工作台之间存在明显分差，这类落差是最有价值的个性化线索，已写入对应维度的诊断。`
    : "";
  return `六个维度中，${counts.strong} 个达到稳固水平，${counts.developing} 个处于发展区间${counts.focus ? `，${counts.focus} 个低于 60 分` : ""}。以下逐项说明当前水平、学习行动与完成标志，薄弱维度排在前面。${gapPart}`;
}

function diagnosisText(item, gap) {
  const base = item.overview;
  return gap ? `${base}通道数据还显示「${gap.title}」：${gap.note}` : base;
}

function figureCaption(doc, text) {
  doc.text(text, { size: TYPE.caption.size, color: C.muted, align: "center", lineHeight: TYPE.caption.lineHeight });
}

// 章节标题：对齐参考报告的体例——编号 + 黑体标题 + 细线，不用彩色前缀块。
function sectionHeading(doc, kicker, title) {
  if (doc.pages.at(-1).cursor < 150) doc.startPage();
  doc.text("", { size: 1, lineHeight: 10 });
  doc.text(`${kicker}、${title}`, { size: TYPE.sectionTitle.size, color: C.ink, bold: true, lineHeight: TYPE.sectionTitle.lineHeight });
  doc.text("", { size: 1, lineHeight: 3 });
  doc.rule(0, 10, C.line);
}

/**
 * 封面（第一页开头）：标题 + 一行档案信息 + 12 字能力字像，随后正文直接续排。
 *
 * 用户 2026-10-03 确认的最终体例：最上面是标题「AIQUOS测评报告」，下面就是
 * 那 12 个字，然后是正文；白底黑字，不要卡片背景，页脚含生成时间与账号。
 * 因此这里不再有彩色面板、评级徽标、三段导览——只有一条档案行。
 */
function renderCover(doc, model, plan, charts = {}) {
  const page = () => doc.pages.at(-1);
  // 顶部按「距页顶距离」固定排版：基线 = 页高 - yTop。
  const at = (yTop) => {
    page().cursor = PAGE.height - yTop;
  };
  const ink = (value, options = {}) => doc.text(value, { noBreak: true, ...options });

  // 标题
  at(72);
  ink("AIQUOS测评报告", { size: TYPE.title.size, color: C.ink, bold: true, lineHeight: TYPE.title.lineHeight });
  // 档案行：得分/档位/完成时间/题量（真实数据，来自快照）
  at(110);
  const metaLine = [
    `综合得分 ${plan.score} 分（${plan.grade} 档 · ${plan.stage.label}）`,
    model.detail?.completedAtText ? `完成于 ${model.detail.completedAtText}` : null,
    model.detail?.questionCountText ? `作答 ${model.detail.questionCountText}` : null,
    model.isDemo ? "演示数据" : null,
  ].filter(Boolean).join(" · ");
  ink(metaLine, { size: TYPE.small.size, color: C.muted, lineHeight: TYPE.small.lineHeight });

  // 12 个字（六维能力字像）：灰点阵，实心 = 已有积累，空心 = 成长空间。
  // 残缺程度直接来自各维度真实分数（glyphCoverage 按 score/100 决定实心格数）。
  // 字像下方不写图注（2026-10-03 用户要求去掉那行说明文字）：点阵本身的
  // 图例已由网页报告页承担，印在报告里只是重复。
  let nextTop = 132;
  if (charts?.glyphs) {
    const innerWidth = PAGE.contentWidth - 20;
    const glyphHeight = Math.round((innerWidth * charts.glyphs.height) / charts.glyphs.width);
    doc.image(charts.glyphs, {
      x: PAGE.margin + 10, width: innerWidth, height: glyphHeight,
      align: "left", anchor: "fixed", yTop: nextTop,
    });
    nextTop += glyphHeight + 14;
  }
  // 正文从字像下方续排（同一个 doc，自动接续页游标）。
  at(nextTop + 6);
}

/**
 * 正文（三段连续排版，同一 doc 内自动分页，总长控制在两页内）。
 *
 * 版式要点（用户 2026-10-03 确认）：全部白底黑字、无卡片背景、无彩色；
 * 段与段之间只用细线分隔，维度与资源都压成紧凑的单行条目——两页的硬约束
 * 要求每条信息尽量一行说完，因此把「平台 · 类型 · 档位 · 说明」并进同一行，
 * 资源链接也接在说明之后。
 */
function renderBody(doc, model, plan, text = null) {
  const priorities = model.recommendations?.priorities ?? [];
  const gapByKey = new Map(priorities.filter((item) => item.gap).map((item) => [item.key, item.gap]));
  // 三段文案优先用模型生成的版本（src/report-text.js 的规则集），
  // 没有时回退到确定性模板——两条路径都只用真实分数陈述。
  const copy = text ?? reportTemplateText(model, plan);

  // ── 一、学员能力评价 ──
  sectionHeading(doc, "一", "学员能力评价");
  doc.text(copy.evaluation, { size: TYPE.body.size, lineHeight: TYPE.body.lineHeight, blockGap: 6 });

  // ── 二、个性化学习建议 ──
  sectionHeading(doc, "二", "个性化学习建议");
  doc.text(copy.advice, { size: TYPE.small.size, color: C.muted, lineHeight: TYPE.small.lineHeight, blockGap: 6 });
  plan.adviceItems.forEach((item, index) => {
    const gap = gapByKey.get(item.key) ?? null;
    doc.text(`${index + 1}. ${item.name} · ${item.score} 分 · ${item.gradeLabel}`, {
      size: TYPE.small.size, color: C.ink, bold: true, lineHeight: TYPE.small.lineHeight, blockGap: 1,
    });
    doc.text(`当前水平：${diagnosisText(item, gap)}`, { size: TYPE.footnote.size, color: C.muted, lineHeight: TYPE.footnote.lineHeight, blockGap: 1 });
    doc.text(`学习行动：${item.practice}`, { size: TYPE.footnote.size, color: C.muted, lineHeight: TYPE.footnote.lineHeight, blockGap: 1 });
    doc.text(`完成标志：${item.checkpoint}`, { size: TYPE.footnote.size, color: C.muted, lineHeight: TYPE.footnote.lineHeight, blockGap: 4 });
  });
  doc.text(`练习节奏：${plan.advicePace ?? buildAdvicePace(model)}`, {
    size: TYPE.footnote.size, color: C.ink, lineHeight: TYPE.footnote.lineHeight, blockGap: 4,
  });

  // ── 三、推荐学习资源 ──
  sectionHeading(doc, "三", "推荐学习资源");
  doc.text(copy.resources, { size: TYPE.footnote.size, color: C.muted, lineHeight: TYPE.footnote.lineHeight, blockGap: 4 });
  plan.resources.forEach((resource, index) => {
    // 紧凑条目：编号 + 标题（加粗）一行，说明一行，链接单独一行。
    // 链接必须独占一行——与说明同排会因超长被推到纸外（实测）。
    doc.text(`${String(index + 1).padStart(2, "0")}. ${resource.title}`, {
      size: TYPE.footnote.size, color: C.ink, bold: true, lineHeight: TYPE.footnote.lineHeight, blockGap: 0,
    });
    doc.text(`${resource.platform} · ${resource.type} · ${resource.stage} 档 · 匹配 ${resource.matchedDimension} · ${resource.note}`, {
      size: TYPE.footnote.size, color: C.muted, lineHeight: TYPE.footnote.lineHeight, blockGap: 0,
    });
    doc.text(resource.url, { size: TYPE.footnote.size, color: C.muted, lineHeight: TYPE.footnote.lineHeight, blockGap: 3 });
  });
}

/**
 * 生成 AIQUOS 测评报告 PDF（两页以内）。
 *
 * 体例（2026-10-03 用户最终确认）：
 *   第一页：标题「AIQUOS测评报告」→ 12 字能力字像 → 正文（学员评价 / 学习建议 / 学习资源）
 *   白底黑字，不用卡片背景、不用彩色，页脚为「基于…生成 + 生成时间 + 账号 + 页码」。
 *
 * @param {object} model 觉醒报告数据模型（AwakeningReportContent 的 reportModel 输出）
 * @param {object} options { glyphs, fonts, footer }
 */
export function buildAbilityReportPdf(model, options = {}) {
  if (!model || model.isEmpty) throw new Error("暂无可用的测评快照，无法生成报告");
  const { glyphs = null, fonts = null, footer = null, text = null } = options;
  const plan = buildLearningPlan(model);
  const doc = createDocument();
  doc.startPage();
  renderCover(doc, model, plan, { glyphs });
  renderBody(doc, model, plan, text);
  return buildPdfBytes(doc.pages, fonts, footer);
}

/**
 * 报告页脚：基于什么生成 + 真实生成时间 + 真实账号信息。
 *
 * 三样都是运行期真实数据（用户明确要求，不接受占位符）：
 *   · 证据来源固定为本次测评的三通道（客观题 CAT / 对话采访 / 实操工作台）
 *   · 生成时间取 new Date()，即导出这一刻
 *   · 账号信息取登录档案（昵称 + 账号），未登录时退化为「未登录本机」
 */
export function reportFooter(model, profile = null) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const who = profile
    ? `${profile.nickname ?? "学员"}（${profile.account ?? profile.accountId ?? "—"}）`
    : "未登录本机";
  return {
    // 一行放得下：页脚空间只够约 60 个半角字符（见 learning-plan-pdf 的
    // addFooter 截断逻辑），因此把三通道列表压成「三通道证据」四个字。
    text: `本报告基于本次${model?.assessmentId && model.assessmentId !== "comprehensive" ? `${assessmentLabel(model.assessmentId)}的成绩` : "综合测评的三通道证据"}生成 · 生成时间 ${stamp} · ${who}`,
    generatedAt: stamp,
    account: who,
  };
}

export function abilityReportFileName(plan) {
  return `AIQUOS-测评报告-${plan.grade}档-${plan.score}分`;
}

export async function downloadAbilityReportPdf(model, profile = null, chat = null) {
  if (typeof document === "undefined" || typeof Blob === "undefined") return;
  const plan = buildLearningPlan(model);
  // 报告正文为纯文字 + 顶部 12 字字像；字体子集在构建期产出、运行期加载。
  // 文字部分交给接入的模型撰写（规则见 report-text.js），失败自动降级模板。
  const [glyphs, fonts, copy] = await Promise.all([
    renderDimensionGlyphs(model?.dimensions),
    loadReportFonts(),
    generateReportText(model, plan, chat),
  ]);
  const bytes = buildAbilityReportPdf(model, {
    glyphs, fonts, text: copy.text, footer: reportFooter(model, profile),
  });
  savePdfBytes(bytes, abilityReportFileName(plan));
}
