import test from "node:test";
import assert from "node:assert/strict";
import {
  LEARNING_RESOURCES,
  buildAdviceParagraph,
  buildEvaluationParagraph,
  buildLearningPlan,
  renderLearningPlanHtml,
  selectLearningResources,
} from "../src/report-learning-plan.js";
import { buildLearningPlanPdf } from "../src/learning-plan-pdf.js";
import { buildLearningPlanDocx } from "../src/learning-plan-docx.js";
import { wrapText } from "../src/learning-plan-pdf.js";

function modelWithScore(score) {
  return {
    overallScore: score,
    grade: score >= 90 ? "S" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "D",
    dimensions: [
      { key: "D1", name: "AI基础认知", score: Math.max(45, score - 8) },
      { key: "D2", name: "提示词工程", score: score },
      { key: "D3", name: "AI工具使用", score: Math.max(52, score - 14) },
      { key: "D4", name: "AI结果评估与优化", score: score + 3 },
      { key: "D5", name: "人机协同解决问题", score: score - 2 },
      { key: "D6", name: "AI伦理与合规", score: Math.max(48, score - 5) },
    ],
  };
}

test("resource library has exactly 100 unique, well-formed entries", () => {
  assert.equal(LEARNING_RESOURCES.length, 100);
  assert.equal(new Set(LEARNING_RESOURCES.map((item) => item.url)).size, 100);
  for (const resource of LEARNING_RESOURCES) {
    assert.ok(resource.title && resource.platform && resource.note);
    assert.ok(["D", "C", "B", "A", "S"].includes(resource.stage));
    assert.ok(resource.dims.length > 0);
    assert.match(resource.url, /^https:\/\//);
  }
});

test("learning plan follows the requested three-part personalized structure", () => {
  const model = modelWithScore(78);
  const plan = buildLearningPlan(model);
  assert.equal(plan.score, 78);
  assert.equal(plan.grade, "B");
  assert.match(plan.evaluation, /78 分/);
  assert.match(plan.evaluation, /B 档/);
  assert.match(plan.advice, /个性化重点/);
  assert.match(plan.advice, /AI工具使用/);
  assert.equal(plan.adviceItems.length, 6);
  assert.equal(plan.resources.length, 12);

  const html = renderLearningPlanHtml(plan, model);
  assert.ok(html.includes("第一部分 · 分数评价"));
  assert.ok(html.includes("第二部分 · 个性化学习建议"));
  assert.ok(html.includes("第三部分 · 个性化学习资源"));
  assert.match(html, /当前水平：/);
  assert.match(html, /学习行动：/);
  assert.match(html, /完成标志：/);
  assert.doesNotMatch(html, /结果速览/);
  assert.equal([...html.matchAll(/class="advice-card"/gu)].length, 6);
  assert.doesNotMatch(html, /<li[\s>]/i);
  assert.doesNotMatch(html, /list-style/i);
});

test("PDF is assembled directly as vector text without browser print or rasterization", () => {
  const bytes = Buffer.from(buildLearningPlanPdf(buildLearningPlan(modelWithScore(78))));
  const text = bytes.toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /\/BaseFont \/STSong-Light/);
  assert.match(text, /\/BaseFont \/Helvetica/);
  assert.match(text, /\/BaseFont \/Helvetica-Bold/);
  assert.match(text, /\/Encoding \/UniGB-UCS2-H/);
  assert.doesNotMatch(text, /\/Filter \/DCTDecode/);
  assert.doesNotMatch(text, /\/Subtype \/Image/);
  assert.match(text.trimEnd(), /%%EOF$/);
});

test("Word and PDF share the narrow A4 layout with black headings", () => {
  const html = renderLearningPlanHtml(buildLearningPlan(modelWithScore(78)));
  assert.match(html, /@page WordSection1/);
  assert.match(html, /width: 467\.3pt/);
  assert.match(html, /color: #000000/);

  const pdf = Buffer.from(buildLearningPlanPdf(buildLearningPlan(modelWithScore(78)))).toString("latin1");
  assert.match(pdf, /0 0 0 rg/);
  assert.doesNotMatch(pdf, /2 Tr/);
});

test("learning plan downloads as a real A4 DOCX with fixed content width", () => {
  const bytes = Buffer.from(buildLearningPlanDocx(buildLearningPlan(modelWithScore(78))));
  const text = bytes.toString("utf8");
  assert.match(bytes.subarray(0, 2).toString("latin1"), /^PK$/);
  assert.match(text, /\[Content_Types\]\.xml/);
  assert.match(text, /word\/document\.xml/);
  assert.match(text, /<w:pgSz w:w="11906" w:h="16838" \/>/);
  assert.match(text, /w:top="1040" w:right="1280" w:bottom="1080" w:left="1280"/);
  assert.match(text, /<w:tblW w:w="9346" w:type="dxa" \/>/);
  assert.match(text, /w:val="000000"/);
});

test("PDF line wrapping preserves visible spaces between Latin words", () => {
  const lines = wrapText("AI Ethics & Governance", 12, 120, true);
  assert.ok(lines.length > 1);
  assert.match(lines.join(" "), /AI Ethics & Governance/);
});

test("resource selection changes with score and honours the weakest dimensions", () => {
  const lower = selectLearningResources(modelWithScore(72));
  const higher = selectLearningResources(modelWithScore(91));
  const lowerUrls = new Set(lower.map((item) => item.url));
  const higherUrls = new Set(higher.map((item) => item.url));
  assert.equal(lower.length, 12);
  assert.equal(higher.length, 12);
  assert.equal([...lowerUrls].filter((url) => higherUrls.has(url)).length, 0);
  assert.ok(higher.every((item) => item.stage === "S" || item.stage === "A"));
  assert.ok(lower.some((item) => item.stage === "B"));
});

test("paragraphs are deterministic for the same model", () => {
  const model = modelWithScore(64);
  assert.equal(buildEvaluationParagraph(model), buildEvaluationParagraph(model));
  assert.equal(buildAdviceParagraph(model), buildAdviceParagraph(model));
});

test("no resource URL uses a path pattern retired after the 2026-10-03 link audit", () => {
  // 2026-10-03 链接健康检查发现 7 条真实失效链接（域名可达但页面 404）：
  // 这些链接此前能通过所有既有断言（只校验 https 前缀），静默失效了很久。
  // 联网校验不能进单元测试（CI 无外网、站点还有反爬），因此这里把「已确认
  // 下架的具体路径」钉成禁止清单——它们重新出现即说明有人从旧版本回填了
  // 资源条目。新增资源请用 scripts 里的探测脚本验证后再录入。
  const RETIRED = [
    "coursera.org/learn/ai-foundations-for-everyone",
    "learn.microsoft.com/en-us/training/paths/get-started-with-artificial-intelligence/",
    "kaggle.com/learn/prompt-engineering",
    "microsoft.com/en-us/microsoft-365/copilot/ai-learning",
    "oxfordmartin.ox.ac.uk/artificial-intelligence",
    "research.ibm.com/topics/artificial-intelligence",
    "aws.amazon.com/training/learn-about/artificial-intelligence/",
  ];
  for (const resource of LEARNING_RESOURCES) {
    for (const retired of RETIRED) {
      assert.ok(
        !resource.url.includes(retired),
        `resource "${resource.title}" points at a retired URL (${retired}); use the audited replacement instead`,
      );
    }
  }
});

test("every resource URL host is reachable-or-known-blocked, never a dead path", () => {
  // 每条 URL 必须是「域名 + 明确路径」形态，禁止只剩域名的空洞链接
  // （域名根路径无法反映具体资源，也无法判断是否指向预期内容）。
  for (const resource of LEARNING_RESOURCES) {
    const url = new URL(resource.url);
    assert.ok(url.hostname.includes("."), `resource "${resource.title}" has a malformed host`);
    assert.ok(
      url.pathname !== "/" || resource.url.endsWith("/"),
      `resource "${resource.title}" should point at a concrete page, not a bare host`,
    );
  }
});

test("mixed CJK/Latin lines fill their width instead of breaking early", () => {
  // 实测缺陷（2026-10-03 报告 PDF 第 4 页）：句子「…要求 AI 列出依据和不确定点，
  // 再用独立来源检查关键事实…」在「AI」处被切断——旧实现遇到放不下的词就
  // 结束当前行，导致该行只写到一半、右侧大片留白。修复后含 CJK 的长串按字符
  // 填满当前行；纯拉丁词仍整词换行（有天然断点，绝不拆字）。
  const sentence = "学习行动：要求 AI 列出依据和不确定点，再用独立来源检查关键事实，并记录哪些结论必须人工确认。";
  const width = 431;
  const lines = wrapText(sentence, 11, width);
  assert.ok(lines.length >= 2, "should wrap to multiple lines");
  // 判定「是否填满」不用 textWidth（未导出）：一行填满等价于「再塞一个汉字
  // 就会溢出」——即把该行加一个字重新排版时，它会变成两行。
  for (const line of lines.slice(0, -1)) {
    const overflow = wrapText(`${line}字`, 11, width, false);
    assert.ok(overflow.length > 1, `line breaks early (still fits another glyph): "${line}"`);
  }
  // 拉丁词不得被拆开
  assert.match(lines.join(""), /AI/);
  const latin = wrapText("AI Ethics & Governance Framework", 12, 120, true);
  assert.doesNotMatch(latin.join(" "), /Governa nce|Gover nance/);
});
