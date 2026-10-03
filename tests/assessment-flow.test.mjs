import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { ASSESSMENT_THEMES, getAssessmentRoute, getStageMode, STAGE_LABELS, PHASE_STORIES } from "../src/assessment-flow.js";

test("every assessment has a five-stage journey and the blue route combines all three task modes", () => {
  for (const theme of Object.values(ASSESSMENT_THEMES)) {
    assert.equal(theme.stages.length, 5);
    assert.ok(theme.color.startsWith("#"));
    assert.ok(theme.glow.startsWith("#"));
    assert.ok(theme.deep.startsWith("#"));
  }
  assert.deepEqual(new Set(ASSESSMENT_THEMES.comprehensive.stages), new Set(["objective", "conversation", "practical"]));
  assert.equal(STAGE_LABELS.length, 5);
  assert.equal(getStageMode("comprehensive", 3), "practical");
  assert.equal(getStageMode("objective", 5), "objective");
});

test("the selected task template has real local IP artwork and all task surfaces", async () => {
  await access(new URL("../public/assets/crops/assessment-guides-crop.png", import.meta.url));
  const source = await readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8");
  for (const component of ["AdaptiveObjectivePhase", "InterviewPhase", "PracticalWorkbenchPhase", "AssessmentMap", "AssessmentTask"]) {
    assert.match(source, new RegExp(`function ${component}|export function ${component}`));
  }
  assert.match(source, /assessment-guides-crop\.png/);
  assert.match(source, /getImageData/);
  assert.match(source, /green > red \* 1\.35/);
  assert.match(source, /agent-canvas/);
  assert.match(source, /agent-send/);
  assert.match(source, /chat-bubble \$\{item\.role === "user"/);
  assert.match(source, /is-feedback/);
  assert.match(source, /streamDeepSeek/);
  assert.match(source, /generateArkImage/);
  assert.match(source, /agent-image/);
  assert.match(source, /查看原始素材/);
});

test("bare assessment routes open maps while level routes open tasks", () => {
  const originalLocation = globalThis.location;
  globalThis.location = { hash: "#assessment/objective" };
  assert.equal(getAssessmentRoute().mode, "map");
  globalThis.location = { hash: "#assessment/objective/level/2" };
  assert.deepEqual(getAssessmentRoute(), { id: "objective", mode: "task", stage: 2 });
  globalThis.location = originalLocation;
});

test("assessment cards now open their working five-stage flow", async () => {
  const [hub, experience] = await Promise.all([
    readFile(new URL("../src/AssessmentHub.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(hub, /onStart\?\.\(item\.id\)/);
  assert.match(experience, /onStart=\{startAssessment\}/);
  assert.match(experience, /assessmentHash\(assessmentRoute\.id, stage\)/);
});

test("comprehensive opens the paper picker instead of the stage map", async () => {
  // 2026-10-03 用户决策：试卷选择从 TEST hub 移入综合测评，作为进入综合
  // 测评的第一个界面，替换原关卡地图；阶段间改为任务页顶部节点直接推进。
  // 这条测试钉住关键契约，防止无声回退。
  const [experience, flow, hub] = await Promise.all([
    readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/AssessmentHub.jsx", import.meta.url), "utf8"),
  ]);
  // 选卷首屏组件存在，且由 assessment-map 视图在 comprehensive 下渲染。
  assert.match(flow, /export function ComprehensivePapers\(/);
  assert.match(experience, /view === "assessment-map" && assessmentRoute\.id === "comprehensive"[\s\S]{0,200}<ComprehensivePapers/);
  // 综合测评卡片不再直接开考：startAssessment 只导航到选卷屏，真正的
  // 开考动作在 startComprehensivePaper（选定试卷之后）。
  assert.match(experience, /function startComprehensivePaper\(assignment\)/);
  assert.match(experience, /writeActiveAssignmentId\(assignment\.id\)/);
  // 标准卷必须清作业上下文，否则一次中途放弃的作业会被误记成完成。
  assert.match(experience, /writeActiveAssignmentId\(null\)/);
  // 阶段完成直接进入下一阶段任务，不再回地图。
  assert.match(experience, /setAssessmentRoute\(\{ id, stage: nextStage, mode: "task" \}\)/);
  // 选卷屏保留官方标准卷兜底入口与续答横幅。
  assert.match(flow, /className="papers-standard"/);
  assert.match(flow, /检测到未完成的综合测评/);
  // 卡面精简（用户要求）：只保留卷名/截止/状态，教师端的下发口径与题库
  // 版本不上学生端。范围限定在 ComprehensivePapers 组件内检查，避免误伤
  // 文件其他区域的相近字样。
  const papersBlock = flow.slice(
    flow.indexOf("export function ComprehensivePapers("),
    flow.indexOf("function TaskHeader("),
  );
  assert.ok(papersBlock.length > 0, "ComprehensivePapers body not found");
  assert.doesNotMatch(papersBlock, /assignmentScopeLabel/);
  assert.doesNotMatch(papersBlock, /全部学员|指定学员|精选版题库|全量版题库/);
  assert.doesNotMatch(papersBlock, /三阶段约 20 分钟/);
  // TEST hub 不再承载老师推送区（该区已移入综合测评首屏）。
  assert.doesNotMatch(hub, /hub-assignments/);
});


test("every primary action button shows its label", async () => {
  const source = await readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8");
  // The base .task-action style is an icon-only circle (width 56px, font-size 0);
  // only the .comprehensive modifier renders the label. Any labelled action
  // must therefore carry the variant or the text disappears for the student.
  const bare = [...source.matchAll(/<TaskAction\b[^>]*\/>/g)]
    .map((match) => match[0])
    .filter((tag) => /label=/.test(tag) && !/variant="comprehensive"/.test(tag));
  assert.deepEqual(bare, [], `labelled TaskAction without comprehensive variant: ${bare.join(" | ")}`);
});

test("the comprehensive run is three timed phases in the product order", async () => {
  const { COMPREHENSIVE_PHASES, formatClock, phaseCount, getPhase } = await import("../src/assessment-timing.js");
  assert.deepEqual(COMPREHENSIVE_PHASES.map((phase) => phase.mode), ["conversation", "objective", "practical"]);
  for (const phase of COMPREHENSIVE_PHASES) {
    assert.equal(phase.seconds, 300);
    assert.ok(phase.guardian.length > 0);
  }
  assert.equal(phaseCount("comprehensive"), 3);
  assert.equal(phaseCount("objective"), 1);
  assert.equal(getPhase("comprehensive", 2).mode, "objective");
  assert.equal(getPhase("comprehensive", 9).mode, "practical");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(65_000), "01:05");
  assert.equal(formatClock(-1), "00:00");
});

test("phase stories exist for all three comprehensive phases", () => {
  for (const key of ["labyrinth", "academy", "workshop"]) {
    assert.equal(PHASE_STORIES[key].opening.length >= 3, true);
    assert.equal(PHASE_STORIES[key].ending.length >= 2, true);
  }
});
