import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createAssessmentState, createAttempt, putDraft, recordAttemptResponse, resolveLatestReport, restartDraft, selectAttemptQuestion } from "../src/assessment-attempt.js";
import { ASSESSMENT_THEMES, getAssessmentRoute, getStageMode, STAGE_LABELS } from "../src/assessment-flow.js";
import {
  advanceObjectiveQuestionState,
  deriveObjectiveQuestionState,
  mapObjectiveStageQuestions,
} from "../src/objective-quiz-state.js";
import { createObjectivePaper } from "../src/objective-paper.js";
import { QUESTION_BANK, QUESTION_BANK_VERSION } from "../src/question-bank.js";
import { STORAGE_KEY, loadAssessmentState } from "../src/assessment-storage.js";

const orchestration = await import("../src/assessment-orchestration.js").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
const instant = "2026-09-14T10:00:00.000Z";
const byId = new Map(QUESTION_BANK.map((question) => [question.id, question]));

function resolveTaskEntry(view, type, state, session = null) {
  assert.equal(
    typeof orchestration.resolveAssessmentTaskEntry,
    "function",
    "task render eligibility must be implemented",
  );
  return orchestration.resolveAssessmentTaskEntry(view, type, state, session);
}

function storedFlow(initial = createAssessmentState()) {
  assert.equal(typeof orchestration.loadScoredAssessments, "function", "scored orchestration must be implemented");
  const values = new Map([[STORAGE_KEY, JSON.stringify(initial)]]);
  let reads = 0;
  let writes = 0;
  let failWrites = false;
  const storage = {
    getItem(key) { reads += 1; return values.get(key) ?? null; },
    setItem(key, value) { writes += 1; if (failWrites) throw new Error("quota"); values.set(key, value); },
  };
  const loaded = orchestration.loadScoredAssessments(storage);
  let state = loaded.state;
  let warning = loaded.warning;
  const commit = (next) => {
    const saved = orchestration.persistScoredState(storage, next, (value) => { state = value; });
    warning = saved.warning;
  };
  return {
    storage, loaded, commit,
    get state() { return state; },
    get warning() { return warning; },
    get reads() { return reads; },
    get writes() { return writes; },
    failWrites() { failWrites = true; },
    start(type, id = `${type}-flow`) {
      const started = orchestration.startScoredAssessment(state, type, { id, startedAt: instant, seed: 11, rng: () => 0 });
      if (!started.blocked && started.state !== state) commit(started.state);
      return started;
    },
  };
}

function answerObjective(flow, count = 1) {
  for (let index = 0; index < count; index += 1) {
    const draft = flow.state.drafts.objective;
    const offset = draft.answeredCount;
    const question = byId.get(draft.questionIds[offset]);
    const stage = Math.floor(offset / 5) + 1;
    const questionIndex = offset % 5;
    flow.commit(orchestration.updateScoredProgress(flow.state, "objective", { question, stage, questionIndex }));
    flow.commit(orchestration.submitScoredAnswer(flow.state, "objective", {
      question, selectedKeys: question.answer, stage, questionIndex,
    }, { answeredAt: instant }));
  }
}

test("empty-storage home does not render or redirect an assessment task", () => {
  assert.deepEqual(
    resolveTaskEntry("home", "comprehensive", createAssessmentState()),
    { renderTask: false, redirect: null },
  );
});

test("a direct scored task route without a draft redirects before rendering", () => {
  assert.deepEqual(
    resolveTaskEntry("assessment-task", "objective", createAssessmentState()),
    { renderTask: false, redirect: "assessments" },
  );
});

test("browser storage getter failures load a safe in-memory state with a warning", () => {
  assert.equal(
    typeof orchestration.loadBrowserScoredAssessments,
    "function",
    "guarded browser storage loading must be implemented",
  );
  let getterReads = 0;
  const browser = {};
  Object.defineProperty(browser, "localStorage", {
    get() {
      getterReads += 1;
      throw new Error("storage denied");
    },
  });
  const loaded = orchestration.loadBrowserScoredAssessments(browser);
  assert.equal(getterReads, 1);
  assert.deepEqual(loaded.state, createAssessmentState());
  assert.equal(loaded.storage, null);
  assert.match(loaded.warning, /存储|记录/);
  assert.match(loaded.storageWarning, /存储|记录/);
});

test("an unavailable browser storage object still publishes the next state", () => {
  assert.equal(
    typeof orchestration.loadBrowserScoredAssessments,
    "function",
    "guarded browser storage loading must be implemented",
  );
  const browser = {};
  Object.defineProperty(browser, "localStorage", {
    get() { throw new Error("storage denied"); },
  });
  const loaded = orchestration.loadBrowserScoredAssessments(browser);
  const started = orchestration.startScoredAssessment(loaded.state, "comprehensive", {
    id: "memory-only",
    startedAt: instant,
    rng: () => 0,
  });
  let published = null;
  const saved = orchestration.persistScoredState(
    loaded.storage,
    started.state,
    (state) => { published = state; },
    loaded.storageWarning,
  );
  assert.equal(published, started.state);
  assert.equal(saved.state, started.state);
  assert.match(saved.warning, /存储|保存/);
});

test("objective starts persist a paper once and resume its seed, IDs, selection and feedback", () => {
  const flow = storedFlow();
  const started = flow.start("objective");
  assert.equal(flow.reads, 1);
  assert.equal(flow.writes, 1);
  assert.equal(started.session.paper.questionIds.length, 25);
  const ids = [...flow.state.drafts.objective.questionIds];
  answerObjective(flow);
  const reloaded = orchestration.loadScoredAssessments(flow.storage);
  const resumed = orchestration.startScoredAssessment(reloaded.state, "objective", { seed: 999, id: "must-not-replace", startedAt: instant });
  assert.equal(resumed.state, reloaded.state);
  assert.equal(resumed.state.drafts.objective.id, "objective-flow");
  assert.deepEqual(resumed.session.paper.questionIds, ids);
  assert.deepEqual(resumed.state.drafts.objective.location.selectedKeys, byId.get(ids[0]).answer);
  assert.equal(resumed.state.drafts.objective.location.feedback.correct, true);
});

test("both incompatible drafts are retained and objective seed/ID mismatches also block resume", () => {
  const seed11 = createObjectivePaper(QUESTION_BANK, { seed: 11 });
  let state = putDraft(createAssessmentState(), createAttempt({
    id: "bad-seed", assessmentType: "objective", startedAt: instant, seed: 12, questionIds: seed11.questionIds,
  }));
  state = putDraft(state, { ...createAttempt({ id: "old-bank", assessmentType: "comprehensive", startedAt: instant }), questionBankVersion: "retired-bank" });
  const before = structuredClone(state);
  const flow = storedFlow(state);
  for (const type of ["objective", "comprehensive"]) {
    assert.equal(flow.loaded.sessions[type].compatible, false);
    const started = flow.start(type);
    assert.ok(started.blocked);
    assert.equal(started.state, flow.state);
  }
  assert.deepEqual(flow.state, before);
  assert.equal(flow.writes, 0);
  assert.match(flow.loaded.sessions.objective.reason, /试卷|seed|顺序/);
  assert.match(flow.loaded.sessions.comprehensive.reason, /版本/);
});

test("missing or inconsistent comprehensive snapshots block without recreating routing state", () => {
  let state = putDraft(createAssessmentState(), createAttempt({ id: "missing-session", assessmentType: "comprehensive", startedAt: instant }));
  const flow = storedFlow(state);
  assert.equal(flow.start("comprehensive").session.controller, null);
  assert.equal(flow.loaded.sessions.comprehensive.compatible, false);
  assert.equal(flow.writes, 0);
});

test("comprehensive selects and saves before answering, then records adaptive outcome and evidence once", () => {
  const flow = storedFlow();
  const { session } = flow.start("comprehensive");
  const selected = orchestration.selectComprehensiveQuestion(flow.state, session.controller, { stage: 1, questionIndex: 0 });
  flow.commit(selected.state);
  const persisted = loadAssessmentState(flow.storage).state.drafts.comprehensive;
  assert.equal(persisted.location.currentQuestionId, selected.question.id);
  assert.deepEqual(persisted.adaptiveSession.usedQuestionIds, [selected.question.id]);
  assert.equal(persisted.responses.length, 0);
  const before = flow.writes;
  const payload = { question: selected.question, selectedKeys: selected.question.answer, stage: 1, questionIndex: 0, adaptiveOutcome: "wrong", feedback: { reaction: "保留反馈" } };
  flow.commit(orchestration.submitScoredAnswer(flow.state, "comprehensive", payload, { controller: session.controller, answeredAt: instant }));
  assert.equal(flow.writes - before, 1);
  assert.equal(flow.state.drafts.comprehensive.responses.length, 1);
  assert.equal(flow.state.drafts.comprehensive.adaptiveSession.position, 1.4);
  assert.equal(flow.state.drafts.comprehensive.location.feedback.result.correct, true);
  assert.equal(flow.state.drafts.comprehensive.location.feedback.reaction, "保留反馈");
  const repeated = orchestration.submitScoredAnswer(flow.state, "comprehensive", payload, { controller: session.controller, answeredAt: instant });
  assert.equal(repeated, flow.state);
  assert.equal(session.controller.snapshot().position, 1.4);
  const reloaded = orchestration.loadScoredAssessments(flow.storage);
  const resumed = orchestration.selectComprehensiveQuestion(reloaded.state, reloaded.sessions.comprehensive.controller, { stage: 1, questionIndex: 0 });
  assert.equal(resumed.question.id, selected.question.id);
  assert.equal(resumed.state, reloaded.state);
  assert.deepEqual(reloaded.sessions.comprehensive.controller.snapshot(), session.controller.snapshot());
});

test("invalid or premature comprehensive submissions never advance adaptive state", () => {
  const flow = storedFlow();
  const { session } = flow.start("comprehensive");
  const selected = orchestration.selectComprehensiveQuestion(flow.state, session.controller, { stage: 1, questionIndex: 0 });
  flow.commit(selected.state);
  const before = session.controller.snapshot();
  assert.throws(() => orchestration.selectComprehensiveQuestion(flow.state, session.controller, { stage: 1, questionIndex: 1 }), /回答|answer/);
  assert.throws(() => orchestration.submitScoredAnswer(flow.state, "comprehensive", {
    question: selected.question, selectedKeys: ["invalid-key"], stage: 1, questionIndex: 0,
  }, { controller: session.controller, answeredAt: instant }));
  assert.deepEqual(session.controller.snapshot(), before);
  assert.equal(flow.state.drafts.comprehensive.responses.length, 0);
});

test("story and selection progress persist without evidence, even when saving fails", () => {
  const flow = storedFlow();
  const { session } = flow.start("comprehensive");
  const selected = orchestration.selectComprehensiveQuestion(flow.state, session.controller, { stage: 1, questionIndex: 0 });
  flow.commit(selected.state);
  flow.commit(orchestration.updateScoredProgress(flow.state, "comprehensive", { stage: 1, questionIndex: 0, phase: "opening", lineIndex: 2, selectedKeys: [selected.question.options[0].key] }));
  assert.equal(flow.state.drafts.comprehensive.responses.length, 0);
  assert.equal(flow.state.drafts.comprehensive.location.lineIndex, 2);
  flow.failWrites();
  flow.commit(orchestration.submitScoredAnswer(flow.state, "comprehensive", {
    question: selected.question, selectedKeys: selected.question.answer, stage: 1, questionIndex: 0,
  }, { controller: session.controller, answeredAt: instant }));
  assert.equal(flow.state.drafts.comprehensive.responses.length, 1);
  assert.equal(resolveLatestReport(flow.state).id, "comprehensive-flow");
  assert.match(flow.warning, /保存/);
});

test("stage completion requires its five answers and only stage five finalizes 25 responses", () => {
  const flow = storedFlow();
  flow.start("objective");
  assert.throws(() => orchestration.completeScoredStage(flow.state, "objective", 1, instant), /5|五/);
  for (let stage = 1; stage <= 5; stage += 1) {
    answerObjective(flow, 5);
    const result = orchestration.completeScoredStage(flow.state, "objective", stage, instant);
    flow.commit(result.state);
    assert.equal(result.completed, stage === 5);
    assert.equal(result.stage, Math.min(5, stage + 1));
    assert.equal(flow.state.history.length, stage === 5 ? 1 : 0);
    if (stage < 5) {
      assert.equal(flow.state.drafts.objective.currentStage, stage + 1);
      assert.equal(flow.state.drafts.objective.currentQuestionIndex, 0);
      assert.equal(flow.state.drafts.objective.location.feedback, null);
      assert.equal(loadAssessmentState(flow.storage).warning, null);
    }
  }
  assert.equal(flow.state.drafts.objective, null);
  assert.equal(flow.state.history[0].status, "completed");
  assert.equal(Object.isFrozen(flow.state.history[0].responses[0]), true);
  assert.equal(resolveLatestReport(flow.state).id, "objective-flow");
  flow.start("objective", "objective-fresh");
  assert.equal(flow.state.drafts.objective.answeredCount, 0);
  assert.equal(flow.state.history.length, 1);
  assert.equal(resolveLatestReport(flow.state).id, "objective-flow");
});

test("browser Back after completion redirects instead of remounting the cleared task", () => {
  const flow = storedFlow();
  const started = flow.start("objective");
  for (let stage = 1; stage <= 5; stage += 1) {
    answerObjective(flow, 5);
    flow.commit(orchestration.completeScoredStage(flow.state, "objective", stage, instant).state);
  }
  assert.equal(flow.state.drafts.objective, null);
  assert.deepEqual(
    resolveTaskEntry("assessment-task", "objective", flow.state, started.session),
    { renderTask: false, redirect: "assessments" },
  );
});

test("later answers in an older draft cannot steal latest and restart clears only its type", () => {
  const flow = storedFlow();
  flow.start("objective");
  answerObjective(flow);
  const { session } = flow.start("comprehensive");
  const selected = orchestration.selectComprehensiveQuestion(flow.state, session.controller, { stage: 1, questionIndex: 0 });
  flow.commit(selected.state);
  flow.commit(orchestration.submitScoredAnswer(flow.state, "comprehensive", { question: selected.question, selectedKeys: selected.question.answer, stage: 1, questionIndex: 0 }, { controller: session.controller, answeredAt: instant }));
  answerObjective(flow);
  assert.equal(resolveLatestReport(flow.state).id, "comprehensive-flow");
  const other = structuredClone(flow.state.drafts.objective);
  flow.commit(restartDraft(flow.state, "comprehensive"));
  const restarted = flow.start("comprehensive", "new-comprehensive");
  assert.deepEqual(flow.state.drafts.objective, other);
  assert.equal(flow.state.drafts.comprehensive.answeredCount, 0);
  assert.deepEqual(restarted.session.controller.snapshot().usedQuestionIds, []);
});

test("SiteExperience keeps unscored conversation and practical progress and wires durable callbacks", async () => {
  const source = await readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8");
  assert.match(source, /conversation:\s*1/);
  assert.match(source, /practical:\s*1/);
  assert.match(source, /assessmentRoute\.id === "conversation"|id === "conversation"/);
  assert.match(source, /assessmentRoute\.id === "practical"|id === "practical"/);
  assert.match(source, /questions=\{QUESTION_BANK\}/);
  assert.match(source, /onComprehensiveAnswer=\{submitAssessmentAnswer\}/);
  assert.match(source, /onComprehensiveProgress=\{updateAssessmentProgress\}/);
  assert.match(source, /onAnswer=\{submitAssessmentAnswer\}/);
  assert.match(source, /onProgress=\{updateAssessmentProgress\}/);
  assert.match(source, /attempt=\{assessmentState\.drafts\[assessmentRoute\.id\]\}/);
  assert.match(source, /storageWarning/);
  assert.match(source, /loadBrowserScoredAssessments/);
  assert.match(source, /resolveAssessmentTaskEntry/);
  assert.match(source, /taskEntry\.renderTask/);
  assert.match(source, /taskEntry\.redirect === "assessments"/);
  assert.match(source, /if \(completed\.completed\)[\s\S]*?go\("assessments"\)/);
  assert.match(source, /isScoredAssessment\(assessmentRoute\.id\)[\s\S]*?!assessmentStateRef\.current\.drafts\[assessmentRoute\.id\]/);
  assert.doesNotMatch(source, /adaptiveController\.current\.reset\(\)/);
});

test("scored drafts can restart only through an explicit confirmation UI", async () => {
  const [flow, hub, experience] = await Promise.all([
    readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/AssessmentHub.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(flow, /重新开始本次测评/);
  assert.match(flow, /未完成的回答将被移除/);
  assert.match(flow, /onConfirmRestart/);
  assert.match(hub, /blockedDraft\.reason/);
  assert.match(hub, /export function BlockedDraftPanel/);
  assert.match(hub, /确认重新开始/);
  assert.match(hub, /onConfirmRestart/);
  assert.match(experience, /initialAssessments\.sessions\[assessmentRoute\.id\]/);
  assert.match(experience, /blockedDraft\?\.type === assessmentRoute\.id/);
  assert.match(experience, /<BlockedDraftPanel/);
  assert.match(experience, /onRestart=\{restartAssessment\}/);
  assert.match(experience, /onConfirmRestart=\{restartAssessment\}/);
});

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
  const answerBlock = source.slice(source.indexOf("const answer = (keys) =>"), source.indexOf("const nextQuestion = () =>"));

  assert.match(source, /function ComprehensiveTask\(\{[\s\S]*?attempt,[\s\S]*?onComprehensiveAnswer,[\s\S]*?onComprehensiveProgress,/);
  assert.match(source, /location\.currentQuestionId/);
  assert.match(source, /attempt\.currentQuestionIndex/);
  assert.match(source, /location\.selectedKeys/);
  assert.match(source, /location\.feedback/);
  assert.match(answerBlock, /if \(onComprehensiveAnswer\) \{[\s\S]*?onComprehensiveAnswer\(\{[\s\S]*?question,[\s\S]*?selectedKeys,[\s\S]*?adaptiveOutcome: outcome,[\s\S]*?feedback:/);
  assert.match(answerBlock, /\} else \{[\s\S]*?onRecordComprehensiveOutcome\?\.\(outcome\);[\s\S]*?persistProgress\(/);
  assert.equal(answerBlock.match(/persistProgress\(/g)?.length, 1);
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
