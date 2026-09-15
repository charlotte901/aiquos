import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createAttempt, recordAttemptResponse, selectAttemptQuestion } from "../src/assessment-attempt.js";
import { ASSESSMENT_THEMES, getAssessmentRoute, getStageMode, STAGE_LABELS } from "../src/assessment-flow.js";
import {
  advanceObjectiveQuestionState,
  deriveObjectiveQuestionState,
  mapObjectiveStageQuestions,
} from "../src/objective-quiz-state.js";
import { createObjectivePaper } from "../src/objective-paper.js";
import { QUESTION_BANK } from "../src/question-bank.js";

function answeredObjectiveStage() {
  const paper = createObjectivePaper(QUESTION_BANK, { seed: 17 });
  const byId = new Map(QUESTION_BANK.map((question) => [question.id, question]));
  let attempt = createAttempt({
    id: "reopen-objective-stage",
    assessmentType: "objective",
    startedAt: "2026-09-14T08:00:00.000Z",
    questionIds: paper.questionIds,
    seed: paper.seed,
  });
  for (let questionIndex = 0; questionIndex < 5; questionIndex += 1) {
    const question = byId.get(paper.questionIds[questionIndex]);
    attempt = selectAttemptQuestion(attempt, question.id, {
      currentStage: 1,
      currentQuestionIndex: questionIndex,
      selectedKeys: question.answer,
      feedback: null,
    });
    attempt = recordAttemptResponse(attempt, {
      question,
      selectedKeys: question.answer,
      answeredAt: `2026-09-14T08:0${questionIndex + 1}:00.000Z`,
      stage: 1,
      questionIndex,
      feedback: { persisted: true },
    });
  }
  const nextQuestion = byId.get(paper.questionIds[5]);
  attempt = selectAttemptQuestion(attempt, nextQuestion.id, {
    currentStage: 2,
    currentQuestionIndex: 0,
    selectedKeys: [nextQuestion.options[0].key],
    feedback: null,
  });
  return { attempt, paper };
}

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
  for (const component of ["ConversationTask", "PracticalTask", "AssessmentMap", "AssessmentTask"]) {
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
  assert.match(source, /查看原始口语汇报/);
});

test("the comprehensive task restores draft location and emits answer and progress payloads", async () => {
  const source = await readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8");

  assert.match(source, /function ComprehensiveTask\(\{[\s\S]*?attempt,[\s\S]*?onComprehensiveAnswer,[\s\S]*?onComprehensiveProgress,/);
  assert.match(source, /location\.currentQuestionId/);
  assert.match(source, /attempt\.currentQuestionIndex/);
  assert.match(source, /location\.selectedKeys/);
  assert.match(source, /location\.feedback/);
  assert.match(source, /if \(onComprehensiveAnswer\) \{\s*onComprehensiveAnswer\(\{\s*question,\s*selectedKeys,\s*adaptiveOutcome: outcome,\s*stage,\s*questionIndex,\s*\}\);\s*\} else \{\s*onRecordComprehensiveOutcome\?\.\(outcome\);\s*\}/);
  assert.match(source, /onComprehensiveProgress\?\.\(\{[\s\S]*?phase:[\s\S]*?lineIndex:[\s\S]*?selectedKeys:[\s\S]*?feedback:[\s\S]*?stage,[\s\S]*?questionIndex:/);
  assert.match(source, /onRecordComprehensiveOutcome=\{onRecordComprehensiveOutcome\}/);

  for (const surface of [
    "comprehensive-dialogue-screen",
    "quiz-feedback",
    "quiz-feedback-analysis",
    "toggleMulti",
    "onSelectComprehensiveQuestion",
  ]) {
    assert.match(source, new RegExp(surface));
  }
});

test("objective assessment uses a five-question bank task with feedback", async () => {
  const [task, flow, data] = await Promise.all([
    readFile(new URL("../src/ObjectiveQuizTask.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/assessment-flow.js", import.meta.url), "utf8"),
  ]);
  assert.match(task, /第 \{questionIndex \+ 1\} \/ 5 题/);
  assert.match(task, /回答正确/);
  assert.match(task, /部分正确/);
  assert.match(task, /正确答案/);
  assert.match(task, /question\.analysis/);
  assert.match(task, /question\.type === "multi"/);
  assert.match(task, /onAnswer\(\{/);
  assert.match(task, /onComplete\(\)/);
  assert.match(flow, /<ObjectiveQuizTask/);
  assert.doesNotMatch(data, /export const QUESTIONS/);
});

test("reopening a completed objective stage rehydrates every saved response without another answer", () => {
  const { attempt } = answeredObjectiveStage();
  const stageQuestions = mapObjectiveStageQuestions(QUESTION_BANK, attempt, 1);
  let answerCalls = 0;
  let state = deriveObjectiveQuestionState(attempt, 1, stageQuestions, 0);

  for (let questionIndex = 0; questionIndex < 5; questionIndex += 1) {
    if (!state.submitted) answerCalls += 1;
    assert.equal(state.questionIndex, questionIndex);
    assert.deepEqual(state.selectedKeys, stageQuestions[questionIndex].answer);
    assert.equal(state.feedback.correct, true);
    if (questionIndex < 4) {
      state = advanceObjectiveQuestionState(attempt, 1, stageQuestions, state);
    }
  }

  assert.equal(answerCalls, 0);
  const selectionOnly = deriveObjectiveQuestionState(
    attempt,
    2,
    mapObjectiveStageQuestions(QUESTION_BANK, attempt, 2),
    0,
  );
  assert.deepEqual(selectionOnly.selectedKeys, attempt.location.selectedKeys);
  assert.equal(selectionOnly.feedback, null);
  assert.equal(selectionOnly.submitted, false);
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
