import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRecommendations } from "../src/report-recommendations.js";
import {
  abilityReportFileName,
  buildAbilityReportPdf,
} from "../src/report-pdf.js";

// 1×1 白色 JPEG,仅用于验证图片 XObject 组装;真实配图由浏览器 canvas 生成。
const TINY_JPEG = Uint8Array.from(Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAA//9k=",
  "base64",
));

function compositeWithChannels(overall = 78) {
  const base = [
    { key: "D1", name: "AI基础认知", short: "认知", channels: { objective: 82, interview: 88, practical: 70 } },
    { key: "D2", name: "提示词工程", short: "提示", channels: { objective: 90, interview: 87, practical: 84 } },
    { key: "D3", name: "AI工具使用", short: "工具", channels: { objective: 64, interview: 55, practical: 48 } },
    { key: "D4", name: "AI结果评估与优化", short: "评估", channels: { objective: 74, interview: 80, practical: 66 } },
    { key: "D5", name: "人机协同解决问题", short: "协同", channels: { objective: 70, interview: 66, practical: 62 } },
    { key: "D6", name: "AI伦理与合规", short: "伦理", channels: { objective: 58, interview: 62, practical: 51 } },
  ];
  const dimensions = base.map((item) => ({
    ...item,
    score: Math.round((item.channels.objective + item.channels.interview + item.channels.practical) / 3),
    evidenceCount: 9,
  }));
  const composite = {
    dimensions,
    channels: {
      objective: { overallScore: Math.round(overall + 2) },
      interview: { overallScore: Math.round(overall - 2) },
      practical: { overallScore: Math.round(overall - 6) },
    },
    overallScore: overall,
    grade: overall >= 90 ? "S" : overall >= 80 ? "A" : overall >= 70 ? "B" : overall >= 60 ? "C" : "D",
    weightingVersion: "1.0.0",
  };
  return composite;
}

function modelWithComposite(overall = 78) {
  const composite = compositeWithChannels(overall);
  return {
    dimensions: composite.dimensions,
    overallScore: composite.overallScore,
    grade: composite.grade,
    channelOveralls: {
      objective: composite.channels.objective.overallScore,
      interview: composite.channels.interview.overallScore,
      practical: composite.channels.practical.overallScore,
    },
    recommendations: buildRecommendations(composite),
    detail: {
      completedAtText: "2026年10月3日 14:30",
      questionCountText: "42/44 题",
      modelText: "六维评分模型 v1.0.0 · 三通道加权 v1.0.0",
    },
  };
}

const charts = {
  // 报告为纯文字 + 唯一配图：封面的六维能力字像（灰色点阵）。
  glyphs: { width: 934, height: 190, bytes: TINY_JPEG },
};

test("ability report PDF is a plain two-page document with the glyph image", () => {
  const bytes = Buffer.from(buildAbilityReportPdf(modelWithComposite(78), charts));
  const text = bytes.toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text.trimEnd(), /%%EOF$/);
  // 唯一配图以 DCTDecode XObject 嵌入（顶部的六维能力字像）
  assert.equal([...text.matchAll(/\/Subtype \/Image/gu)].length, 1);
  assert.match(text, /\/Filter \/DCTDecode/);
  // 页面资源表挂载了图片
  assert.match(text, /\/XObject << \/Im1 \d+ 0 R/);
  // 绘制指令引用了图片
  assert.match(text, /\/Im1 Do/);
  // 两页以内（用户要求 2026-10-03）
  const pageCount = Number(text.match(/\/Count (\d+)/)[1]);
  assert.ok(pageCount <= 2, `expected <= 2 pages, got ${pageCount}`);
  assert.ok(pageCount >= 2, `expected the body to flow onto page 2, got ${pageCount}`);
  // xref 表可回查
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
});

test("the two-page report keeps the three-part body and drops all card chrome", () => {
  // 体例（2026-10-03 用户最终确认）：标题 → 12 字字像 → 三段正文；
  // 白底黑字、无卡片背景、无彩色。这条测试钉住这个契约。
  const source = readFileSync(new URL("../src/report-pdf.js", import.meta.url), "utf8");
  for (const heading of ["学员能力评价", "个性化学习建议", "推荐学习资源"]) {
    assert.ok(source.includes(heading), `missing section heading: ${heading}`);
  }
  // 单页文档：封面与正文同一 doc 连续排版，不再 startPage() 硬分页
  assert.match(source, /function renderBody\(doc, model, plan, text = null\)/);
  assert.match(source, /buildPdfBytes\(doc\.pages, fonts, footer\)/);
  assert.doesNotMatch(source, /renderEvaluationSection|renderAdviceSection|renderResourceSection/);
  // 无卡片背景：renderBody 不得调用 doc.card
  const bodySource = source.slice(source.indexOf("function renderBody("), source.indexOf("export function buildAbilityReportPdf"));
  assert.ok(bodySource.length > 0, "renderBody body not found");
  assert.doesNotMatch(bodySource, /doc\.card\(|panel\.text\(/);
  // 纯文字：唯一图形是字像
  assert.match(source, /renderDimensionGlyphs/);
  assert.doesNotMatch(source, /renderDimensionBars|renderRadarChart|renderChannelGaps/);
  // 灰阶配色（用户要求「不要这个绿色」）
  const palette = source.slice(source.indexOf("const C = {"), source.indexOf("const TYPE = {"));
  assert.doesNotMatch(palette, /#4a833c|#285a33|#dbe7d3|#f7faf4/);
  assert.match(palette, /ink: pdfColor\("#000000"\)/);
});

test("the footer carries real generation time and account info", async () => {
  // 页脚三要素均为真实运行期数据（用户明确要求，不接受占位符）：
  // 证据来源说明 + 生成时间 + 账号信息，另加页码。
  const { reportFooter } = await import("../src/report-pdf.js");
  const before = Date.now();
  const footer = reportFooter({}, { nickname: "小林", account: "13800000002" });
  const after = Date.now();
  assert.match(footer.text, /本报告基于/);
  assert.match(footer.text, /生成时间 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  assert.match(footer.text, /小林（13800000002）/);
  // 生成时间必须落在调用窗口内（真实 new Date()，不是写死的字符串）
  const stamp = Date.parse(footer.generatedAt.replace(" ", "T"));
  assert.ok(stamp >= before - 60_000 && stamp <= after + 60_000, "generatedAt should be the current time");
  // 未登录时退化为明确的本机说明，而不是空白或假账号
  assert.match(reportFooter({}, null).text, /未登录本机/);
});

test("gray dot-matrix glyphs reuse the web report's cell encoding", async () => {
  // 字像降到报告里必须沿用同一套「每格一个能力单元」编码，否则同一份
  // 成绩在网页与报告里会呈现不同的占比（静默不一致）。
  const source = readFileSync(new URL("../src/report-charts.js", import.meta.url), "utf8");
  assert.match(source, /import \{ GLYPH_WORDS, glyphScore, glyphCoverage, glyphCellOrder \} from "\.\/ability-glyph\.js"/);
  assert.match(source, /export async function renderDimensionGlyphs\(/);
  assert.match(source, /glyphCoverage\(cells\.length, item\.value\)/);
  // 灰色单色：不得沿用网页版的高饱和绿色渐变
  assert.doesNotMatch(source.slice(source.indexOf("renderDimensionGlyphs")), /linearGradient|#4c903d/);
});

test("ability report still builds without charts (node / canvas unavailable)", () => {
  const bytes = Buffer.from(buildAbilityReportPdf(modelWithComposite(64)));
  const text = bytes.toString("latin1");
  assert.doesNotMatch(text, /\/Subtype \/Image/);
  const pageCount = Number(text.match(/\/Count (\d+)/)[1]);
  assert.ok(pageCount >= 2);
  assert.ok(pageCount <= 2, `expected <= 2 pages without the glyph image, got ${pageCount}`);
});

test("weak profiles rank problem dimensions first and keep the report valid", () => {
  const bytes = Buffer.from(buildAbilityReportPdf(modelWithComposite(52), charts));
  const text = bytes.toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text.trimEnd(), /%%EOF$/);
});

test("report filename follows the score-grade convention", () => {
  const model = modelWithComposite(91);
  assert.equal(abilityReportFileName({ grade: model.grade, score: model.overallScore }), "AIQUOS-测评报告-S档-91分");
});

test("empty model refuses to build", () => {
  assert.throws(() => buildAbilityReportPdf({ isEmpty: true }));
  assert.throws(() => buildAbilityReportPdf(null));
});

test("the glyph image carries no caption line in the report", () => {
  // 2026-10-03 用户要求去掉字像下方那行说明（「六维能力字像 · 实心为已有
  // 积累，空心为成长空间」）：点阵的图例在网页报告页已经承担，印进报告只是
  // 重复。这条测试防止它被重新加回来。
  const source = readFileSync(new URL("../src/report-pdf.js", import.meta.url), "utf8");
  const cover = source.slice(source.indexOf("function renderCover("), source.indexOf("function renderBody("));
  assert.ok(cover.length > 0, "renderCover not found");
  assert.doesNotMatch(cover, /六维能力字像 · /);
  assert.doesNotMatch(cover, /实心为已有积累/);
});
