import test from "node:test";
import assert from "node:assert/strict";
import { buildReportView, radarGeometry, adviceForDimensions, buildReportSvg } from "../src/report-model.js";
import { createAttempt, recordAttemptResponse, selectAttemptQuestion } from "../src/assessment-attempt.js";
import { QUESTION_BANK } from "../src/question-bank.js";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { transform } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as reportModel from "../src/report-model.js";
import * as icons from "@phosphor-icons/react";

const IN_PROGRESS_ATTEMPT = {
  id: "draft-1", assessmentType: "objective", status: "in_progress",
  startedAt: "2026-09-14T08:00:00.000Z", answeredCount: 7, totalQuestions: 25,
  result: {
    dimensions: [
      { key: "D1", score: 72, evidenceCount: 3 },
      { key: "D2", score: 68, evidenceCount: 2 },
      { key: "D3", score: 75, evidenceCount: 2 },
      { key: "D4", score: 70, evidenceCount: 2 },
      { key: "D5", score: 66, evidenceCount: 1 },
      { key: "D6", score: null, evidenceCount: 0 },
    ], overallScore: null, grade: null,
  },
};
const COMPLETED_ATTEMPT = {
  ...IN_PROGRESS_ATTEMPT, id: "complete-1", status: "completed", answeredCount: 25,
  completedAt: "2026-09-14T08:30:00.000Z",
  result: {
    dimensions: IN_PROGRESS_ATTEMPT.result.dimensions.map((item) => ({
      ...item, score: item.score ?? 74, evidenceCount: Math.max(item.evidenceCount, 6),
    })), overallScore: 71, grade: "B",
  },
};
const HISTORY = [
  { ...COMPLETED_ATTEMPT, id: "c-new", assessmentType: "comprehensive", completedAt: "2026-09-14T10:00:00.000Z", result: { ...COMPLETED_ATTEMPT.result, overallScore: 83, grade: "A" } },
  { ...COMPLETED_ATTEMPT, id: "o-new", assessmentType: "objective", completedAt: "2026-09-14T09:00:00.000Z", result: { ...COMPLETED_ATTEMPT.result, overallScore: 71, grade: "B" } },
  { ...COMPLETED_ATTEMPT, id: "c-old", assessmentType: "comprehensive", completedAt: "2026-08-20T09:00:00.000Z", result: { ...COMPLETED_ATTEMPT.result, overallScore: 65, grade: "C" } },
];

test("history filters by type and groups completed records newest-first by Chinese month", () => {
  assert.equal(typeof reportModel.filterReportHistory, "function");
  assert.equal(typeof reportModel.groupReportHistory, "function");
  assert.deepEqual(
    reportModel.filterReportHistory(HISTORY.toReversed(), "comprehensive").map((item) => item.id),
    ["c-new", "c-old"],
  );
  const groups = reportModel.groupReportHistory(HISTORY.toReversed());
  assert.deepEqual(groups.map((group) => [group.key, group.label]), [
    ["2026-09", "2026年9月"],
    ["2026-08", "2026年8月"],
  ]);
  assert.deepEqual(groups[0].records.map((item) => item.id), ["c-new", "o-new"]);
});

test("history selection initializes to the newest visible record and falls back after filtering", () => {
  assert.equal(typeof reportModel.resolveReportHistorySelection, "function");
  assert.equal(reportModel.resolveReportHistorySelection(HISTORY.toReversed(), "all", null)?.id, "c-new");
  assert.equal(reportModel.resolveReportHistorySelection(HISTORY, "comprehensive", "o-new")?.id, "c-new");
  assert.equal(reportModel.resolveReportHistorySelection(HISTORY, "objective", "o-new")?.id, "o-new");
  assert.equal(reportModel.resolveReportHistorySelection(HISTORY, "missing-type", "c-new"), null);
});

test("a malformed history record is isolated instead of breaking or hiding valid records", () => {
  assert.equal(typeof reportModel.groupReportHistory, "function");
  const groups = reportModel.groupReportHistory([
    { id: "broken", completedAt: null },
    ...HISTORY.toReversed(),
    { ...COMPLETED_ATTEMPT, id: "bad-grade", result: { ...COMPLETED_ATTEMPT.result, grade: null } },
    { ...COMPLETED_ATTEMPT, id: "draft", status: "in_progress", completedAt: null },
  ]);
  assert.deepEqual(groups.flatMap((group) => group.records).map((item) => item.id), ["c-new", "o-new", "c-old", "broken", "bad-grade"]);
  const broken = groups.flatMap((group) => group.records).find((item) => item.id === "broken");
  assert.equal(broken.unavailable, true);
  assert.equal(groups.flatMap((group) => group.records).find((item) => item.id === "bad-grade").unavailable, true);
  assert.equal(groups.at(-1).label, "数据不可用");
  assert.equal(groups.flatMap((group) => group.records).some((item) => item.id === "draft"), false);
});

test("no Attempt has an explicit empty view and cannot export a demo report", () => {
  const view = buildReportView(null);
  assert.equal(view.hasReport, false);
  assert.equal(view.overallScore, null);
  assert.equal(view.grade, null);
  assert.equal(view.exportFilename, null);
  assert.equal(buildReportSvg(view), null);
  assert.ok(view.dimensions.every((item) => item.score === null && item.displayScore === "待测"));
});

test("an in-progress report exposes measured dimensions without a grade", () => {
  const view = buildReportView(IN_PROGRESS_ATTEMPT);
  assert.equal(view.hasReport, true);
  assert.equal(view.statusLabel, "进行中 · 7/25");
  assert.equal(view.typeLabel, "客观题测评");
  assert.equal(view.timestamp, "2026-09-14T08:00:00.000Z");
  assert.equal(view.overallScore, null);
  assert.equal(view.grade, null);
  assert.equal(view.dimensions.find((item) => item.key === "D6").displayScore, "待测");
  assert.equal(view.dimensions.find((item) => item.key === "D4").name, "AI结果评估与优化");
  assert.equal(view.dimensions[0].displayScore, "72%");
});

test("a completed report displays its frozen result without recalculating an average or grade", () => {
  const before = structuredClone(COMPLETED_ATTEMPT);
  const view = buildReportView(COMPLETED_ATTEMPT);
  assert.equal(view.statusLabel, "已完成");
  assert.equal(view.overallScore, 71);
  assert.equal(view.grade, "B");
  assert.equal(view.timestamp, "2026-09-14T08:30:00.000Z");
  assert.match(view.exportFilename, /objective.*2026-09-14.*complete-1/);
  assert.deepEqual(COMPLETED_ATTEMPT, before);
  const historical = buildReportView({ ...COMPLETED_ATTEMPT, result: { ...COMPLETED_ATTEMPT.result, overallScore: 81, grade: "A" } });
  assert.equal(historical.overallScore, 81);
  assert.equal(historical.grade, "A");
});

test("answer 25 awaiting stage completion still has no formal overall or grade", () => {
  const view = buildReportView({ ...COMPLETED_ATTEMPT, status: "in_progress" });
  assert.equal(view.statusLabel, "进行中 · 25/25");
  assert.equal(view.overallScore, null);
  assert.equal(view.grade, null);
});

test("the first real comprehensive response shows only dimensions with submitted evidence", () => {
  const question = QUESTION_BANK[0];
  let attempt = createAttempt({ id: "real-first", assessmentType: "comprehensive", startedAt: IN_PROGRESS_ATTEMPT.startedAt });
  attempt = selectAttemptQuestion(attempt, question.id, { stage: 1, questionIndex: 0 });
  attempt = recordAttemptResponse(attempt, {
    question, selectedKeys: question.answer, answeredAt: IN_PROGRESS_ATTEMPT.startedAt, stage: 1, questionIndex: 0,
  });
  const view = buildReportView(attempt);
  assert.equal(view.typeLabel, "综合测评");
  assert.equal(view.statusLabel, "进行中 · 1/25");
  assert.deepEqual(view.dimensions.filter((item) => item.score !== null).map((item) => item.key).sort(), [...new Set(question.dimKeys)].sort());
  assert.equal(view.grade, null);
});

const dimensions = (scores) => scores.map((score, index) => ({ key: `D${index + 1}`, score }));

test("an empty radar contains no plotted points, line segments or filled polygon", () => {
  const geometry = radarGeometry(dimensions([null, null, null, null, null, null]), 100);
  assert.deepEqual(geometry.points, []);
  assert.deepEqual(geometry.segments, []);
  assert.equal(geometry.polygon, null);
});

test("zero is a measured center point while null remains absent", () => {
  const geometry = radarGeometry(dimensions([0, null, null, null, null, null]), 100);
  assert.equal(geometry.points.length, 1);
  assert.equal(Math.abs(geometry.points[0].x), 0);
  assert.equal(Math.abs(geometry.points[0].y), 0);
  assert.deepEqual(geometry.segments, []);
  assert.equal(geometry.polygon, null);
});

test("partial radar lines connect only contiguous measured axes, including the wraparound edge", () => {
  const geometry = radarGeometry(dimensions([100, 80, null, 60, null, 40]), 100);
  assert.deepEqual(geometry.segments.map((segment) => segment.points.map((point) => point.key)), [["D6", "D1", "D2"]]);
  assert.deepEqual(geometry.points.map((point) => point.key), ["D1", "D2", "D4", "D6"]);
  assert.ok(Math.abs(geometry.points[0].x) < 1e-9);
  assert.equal(geometry.points[0].y, -100);
  assert.equal(geometry.polygon, null);
  assert.ok(geometry.segments.every((segment) => !segment.path.includes("Z")));
});

test("separated points never connect across unknown axes and two separate runs stay separate", () => {
  assert.deepEqual(radarGeometry(dimensions([80, null, 60, null, 40, null]), 100).segments, []);
  const split = radarGeometry(dimensions([80, 60, null, 40, 20, null]), 100);
  assert.deepEqual(split.segments.map((segment) => segment.points.map((point) => point.key)).sort(), [["D1", "D2"], ["D4", "D5"]]);
});

test("six measured axes close the radar in canonical order even when input is shuffled", () => {
  const geometry = radarGeometry(dimensions([100, 100, 100, 100, 100, 100]).reverse(), 100);
  assert.equal(geometry.points.length, 6);
  assert.equal(geometry.segments.length, 0);
  assert.match(geometry.polygon, /^0\.0,-100\.0 /);
  assert.deepEqual(geometry.points.map((point) => point.key), ["D1", "D2", "D3", "D4", "D5", "D6"]);
  assert.ok(Math.abs(geometry.points[1].x - 86.6025403784) < 1e-9);
  assert.ok(Math.abs(geometry.points[1].y + 50) < 1e-9);
});

test("advice prioritizes the lowest measured dimension and never calls an unknown dimension weak", () => {
  const advice = adviceForDimensions(IN_PROGRESS_ATTEMPT.result.dimensions);
  assert.equal(advice[0].key, "D5");
  assert.equal(advice[0].priority, "优先练习");
  const unknown = advice.find((item) => item.key === "D6");
  assert.equal(unknown.priority, "待测");
  assert.match(unknown.text, /完成.*测评/);
  const alternate = adviceForDimensions(dimensions([10, 90, 90, 90, 90, 90]));
  assert.equal(alternate[0].key, "D1");
});

test("image export uses the selected type, timestamp, six values and frozen completed result", () => {
  const view = buildReportView(COMPLETED_ATTEMPT);
  const svg = buildReportSvg(view);
  for (const text of [view.title, "客观题测评", view.dateLabel, "71%", "综合评级 B", "72%", "68%", "75%", "70%", "66%", "74%"]) {
    assert.ok(svg.includes(text), `missing export text ${text}`);
  }
  const partial = buildReportSvg(buildReportView(IN_PROGRESS_ATTEMPT));
  assert.match(partial, /进行中 · 7\/25/);
  assert.match(partial, /待测/);
  assert.doesNotMatch(partial, /综合评级 [SABCD]/);
  assert.doesNotMatch(partial, /class="radar-value"/);
});

const source = await readFile(new URL("../src/AwakeningReport.jsx", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "jsx", jsx: "automatic", format: "cjs" });
const compiled = { exports: {} };
const require = createRequire(import.meta.url);
new Function("require", "module", "exports", code)(
  (name) => name === "./report-model.js"
    ? reportModel
    : name === "./ReportHistory"
      ? { ReportHistory: () => null }
      : name === "@phosphor-icons/react"
        ? icons
        : require(name), compiled, compiled.exports,
);
const { AwakeningReport, AwakeningReportContent, AwakeningReportModal } = compiled.exports;
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

async function compileReportHistory() {
  const historySource = await readFile(new URL("../src/ReportHistory.jsx", import.meta.url), "utf8");
  const transformed = await transform(historySource, { loader: "jsx", jsx: "automatic", format: "cjs" });
  const historyModule = { exports: {} };
  new Function("require", "module", "exports", transformed.code)(
    (name) => name === "./report-model.js" ? reportModel : name === "@phosphor-icons/react" ? icons : require(name),
    historyModule,
    historyModule.exports,
  );
  return historyModule.exports;
}

test("history cards expose filters, frozen values, malformed isolation and the exact selected snapshot", async () => {
  const { ReportHistory } = await compileReportHistory();
  const selected = HISTORY[1];
  const opened = [];
  const html = render(ReportHistory, {
    history: [{ id: "broken", completedAt: null }, ...HISTORY],
    selectedId: selected.id,
    filter: "all",
    onFilter() {},
    onSelect() {},
    onOpen: (report) => opened.push(report),
  });
  for (const text of ["全部", "综合测评", "客观题测评", "2026年9月", "2026年8月", "25/25", "83%", "71%", "65%", "最新", "数据不可用", "查看完整报告"]) {
    assert.ok(html.includes(text), `missing history content: ${text}`);
  }
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /disabled=""/);

  const tree = ReportHistory({
    history: HISTORY,
    selectedId: selected.id,
    filter: "all",
    onFilter() {},
    onSelect() {},
    onOpen: (report) => opened.push(report),
  });
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "function") {
      visit(node.type(node.props));
      return;
    }
    if (node.props?.className === "report-history-open") node.props.onClick();
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) visit(child);
  };
  visit(tree);
  assert.equal(opened.length, 1);
  assert.equal(opened[0], selected);
  assert.equal(opened[0].result.overallScore, 71);
});

test("shared report content renders an empty state instead of fixed demo scores", () => {
  const html = render(AwakeningReportContent, { report: null });
  assert.match(html, /尚未生成能力报告/);
  assert.doesNotMatch(html, /radar-value|综合评级/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});

test("partial shared content keeps all six bars, measured points, guidance and both enabled exports", () => {
  const html = render(AwakeningReportContent, { report: IN_PROGRESS_ATTEMPT });
  assert.match(html, /客观题测评/);
  assert.match(html, /进行中 · 7\/25/);
  assert.match(html, /待测/);
  assert.match(html, /初步结果/);
  assert.equal((html.match(/class="score-track/g) ?? []).length, 6);
  assert.equal((html.match(/class="radar-point"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /class="radar-value"|综合评级|disabled=""/);
  for (const label of ["个性化学习建议", "推荐学习资源", "保存截图", "保存 PDF"]) assert.ok(html.includes(label));
});

test("completed shared content and profile-compatible modal use the selected snapshot", () => {
  for (const html of [
    render(AwakeningReportContent, { report: COMPLETED_ATTEMPT, compact: true }),
    render(AwakeningReportModal, { report: COMPLETED_ATTEMPT, open: true, onClose() {} }),
  ]) {
    assert.match(html, /71%/);
    assert.match(html, /综合评级 B/);
    assert.match(html, /class="radar-value"/);
    assert.match(html, /客观题测评/);
    assert.doesNotMatch(html, /小源/);
  }
});

test("historical modal uses neutral selected-report context and omits the current-page history prompt", () => {
  const historical = HISTORY[0];
  const html = render(AwakeningReportModal, { report: historical, open: true, onClose() {} });
  assert.match(html, /83%/);
  assert.match(html, /综合测评/);
  assert.match(html, /所选报告/);
  assert.doesNotMatch(html, /最新测评|查看历史记录|完成测评后将在这里持续积累/);
  assert.match(html, /保存截图/);
  assert.match(html, /保存 PDF/);
  assert.match(html, /aria-label="关闭觉醒报告"/);
});

test("the current report shows storage warnings, dialogue and a recent-history entry before guidance", () => {
  const html = render(AwakeningReport, {
    report: IN_PROGRESS_ATTEMPT, history: [COMPLETED_ATTEMPT], storageWarning: "结果暂时无法保存",
    onBack() {}, onStartAssessment() {}, busy: true, active: true,
  });
  assert.match(html, /role="alert"[^>]*>结果暂时无法保存/);
  assert.match(html, /小源/);
  assert.match(html, /1\s*\/\s*3/);
  assert.match(html, /查看历史记录/);
  assert.ok(html.indexOf("查看历史记录") < html.indexOf("个性化学习建议"));
  const actions = html.slice(html.indexOf('class="report-actions"'));
  assert.doesNotMatch(actions, /disabled=""/);
  const empty = render(AwakeningReport, { report: null, onStartAssessment() {} });
  assert.match(empty, /开始测评/);
  assert.doesNotMatch(empty, /觉醒完成/);
});

test("SiteExperience supplies the persisted latest Attempt and report context", async () => {
  const experience = await readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8");
  assert.match(experience, /resolveLatestReport/);
  assert.match(experience, /report=\{resolveLatestReport\(assessmentState\)\}/);
  assert.match(experience, /history=\{assessmentState\.history\}/);
  assert.match(experience, /storageWarning=\{storageWarning\}/);
  assert.match(experience, /onStartAssessment=\{\(\) => go\("assessments"\)\}/);
});

test("report styling stacks responsively and isolates the selected modal report for print", async () => {
  const css = await readFile(new URL("../src/awakening-report.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.report-hero\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media print[\s\S]*?\.profile-detail-screen\[data-screen="records"\]:has\(\.report-modal-overlay\)/);
});

test("history styling uses a sticky desktop preview, mobile preview-first order, focus rings and print exclusion", async () => {
  const css = await readFile(new URL("../src/awakening-report.css", import.meta.url), "utf8");
  assert.match(css, /\.report-history-layout\s*\{[\s\S]*?grid-template-areas:\s*"list preview"/);
  assert.match(css, /\.report-history-preview\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:/);
  assert.match(css, /\.report-history-card\[data-type="comprehensive"\][\s\S]*?#(?:247cf1|155cca)/i);
  assert.match(css, /\.report-history-card\[data-type="objective"\][\s\S]*?#(?:18a66a|168457)/i);
  assert.match(css, /\.report-history-filters button:focus-visible[\s\S]*?outline:/);
  assert.match(css, /@media \(max-width:\s*780px\)[\s\S]*?\.report-history-layout\s*\{[\s\S]*?grid-template-areas:\s*"preview"\s*"list"/);
  const printCss = css.slice(css.indexOf("@media print"));
  assert.match(printCss, /\.report-history,[\s\S]*?\{\s*display:\s*none/);
});

test("print releases current-report and selected-modal ancestors for multi-page content", async () => {
  const css = await readFile(new URL("../src/awakening-report.css", import.meta.url), "utf8");
  const media = css.slice(css.indexOf("@media print"));
  const printCss = media.slice(media.indexOf("{") + 1, media.lastIndexOf("}"));
  const rules = [...printCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
    selectors: selectors.split(",").map((selector) => selector.trim()),
    declarations,
  }));
  const expectRelease = (selector, { minHeight = true } = {}) => {
    const rule = rules.find((item) => item.selectors.includes(selector));
    assert.ok(rule, `missing print release rule for ${selector}`);
    assert.match(rule.declarations, /height:\s*auto(?:\s*!important)?\s*;/, `${selector} must release height`);
    assert.match(rule.declarations, /max-height:\s*none(?:\s*!important)?\s*;/, `${selector} must release max-height`);
    if (minHeight) assert.match(rule.declarations, /min-height:\s*0(?:\s*!important)?\s*;/, `${selector} must release min-height`);
    assert.match(rule.declarations, /overflow:\s*visible(?:\s*!important)?\s*;/, `${selector} must release overflow`);
  };

  for (const selector of [
    'html:has(.site-experience[data-view="reports"])',
    'body:has(.site-experience[data-view="reports"])',
    'body:has(.site-experience[data-view="reports"]) #root',
    '.site-experience[data-view="reports"]',
    '.site-experience[data-view="reports"] > .experience-panel:not([hidden])',
    '.site-experience[data-view="reports"] .awakening-screen',
    'html:has(.profile-detail-screen[data-screen="records"] .report-modal-overlay)',
    'body:has(.profile-detail-screen[data-screen="records"] .report-modal-overlay)',
    'body:has(.profile-detail-screen[data-screen="records"] .report-modal-overlay) #root',
    '.site-experience:has(.profile-detail-screen[data-screen="records"] .report-modal-overlay)',
    '.site-experience:has(.profile-detail-screen[data-screen="records"] .report-modal-overlay) > .experience-panel:not([hidden])',
    '.profile-detail-screen[data-screen="records"]:has(.report-modal-overlay)',
    '.profile-detail-screen[data-screen="records"]:has(.report-modal-overlay) .report-modal-overlay',
    '.profile-detail-screen[data-screen="records"]:has(.report-modal-overlay) .report-modal',
    '.profile-detail-screen[data-screen="records"]:has(.report-modal-overlay) .report-modal-body',
  ]) expectRelease(selector);

  for (const selector of [".awakening-report-card", ".report-guidance", ".advice-list", ".resource-list"]) {
    expectRelease(selector, { minHeight: false });
  }
  const guidance = rules
    .filter((item) => item.selectors.includes(".report-guidance"))
    .map((item) => item.declarations)
    .join("\n");
  assert.match(guidance, /break-inside:\s*auto\s*;/);
  const modal = rules
    .filter((item) => item.selectors.includes(".report-modal"))
    .map((item) => item.declarations)
    .join("\n");
  assert.match(modal, /display:\s*block\s*;/);
});
