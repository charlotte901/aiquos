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
