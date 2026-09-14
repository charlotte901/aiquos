import test from "node:test";
import assert from "node:assert/strict";
import {
  checkDraftCompatibility,
  completeAttempt,
  createAssessmentState,
  createAttempt,
  finalizeDraft,
  putDraft,
  recordAttemptResponse,
  resolveLatestReport,
  restartDraft,
  selectAttemptQuestion,
  updateAttemptLocation,
} from "../src/assessment-attempt.js";
import { STORAGE_KEY, loadAssessmentState, saveAssessmentState } from "../src/assessment-storage.js";
import { QUESTION_BANK_VERSION } from "../src/question-bank.js";

const startedAt = "2026-09-14T08:00:00.000Z";
const completedAt = "2026-09-14T08:30:00.000Z";

function question(index) {
  return {
    id: `q-${index + 1}`,
    type: "single",
    difficulty: ["low", "medium", "high"][index % 3],
    options: [{ key: "A", text: "正确" }, { key: "B", text: "错误" }],
    answer: ["A"],
    dimKeys: [`D${index % 6 + 1}`, `D${(index + 1) % 6 + 1}`],
  };
}

const paperQuestions = Array.from({ length: 25 }, (_, index) => question(index));
const paperIds = paperQuestions.map((item) => item.id);

function objectiveAttempt(id = "attempt-1") {
  return createAttempt({
    id,
    assessmentType: "objective",
    startedAt,
    questionIds: paperIds,
    seed: 7,
  });
}

function answer(attempt, index, overrides = {}) {
  const current = selectAttemptQuestion(attempt, paperIds[index], {
    phase: "question",
    currentQuestionIndex: index % 5,
    currentStage: Math.floor(index / 5) + 1,
  });
  return recordAttemptResponse(current, {
    question: paperQuestions[index],
    selectedKeys: ["A"],
    answeredAt: `2026-09-14T08:${String(index).padStart(2, "0")}:00.000Z`,
    stage: Math.floor(index / 5) + 1,
    questionIndex: index % 5,
    adaptiveSession: null,
    ...overrides,
  });
}

function completedAttempt(id = "complete-1") {
  let attempt = objectiveAttempt(id);
  for (let index = 0; index < paperQuestions.length; index += 1) attempt = answer(attempt, index);
  return completeAttempt(attempt, completedAt);
}

test("the first response makes a draft the live report and completion freezes history", () => {
  let state = createAssessmentState();
  let attempt = objectiveAttempt();
  state = putDraft(state, attempt);
  assert.equal(resolveLatestReport(state), null);
  for (const [index] of paperQuestions.entries()) {
    attempt = answer(attempt, index);
    state = putDraft(state, attempt);
    if (index === 0) {
      assert.equal(resolveLatestReport(state).id, "attempt-1");
      assert.equal(resolveLatestReport(state).result.grade, null);
    }
  }
  state = finalizeDraft(state, "objective", completedAt);
  assert.equal(state.drafts.objective, null);
  assert.equal(state.history.length, 1);
  assert.equal(state.latestReportRef.kind, "history");
  assert.equal(state.history[0].status, "completed");
});

test("assessment types keep independent drafts and later updates cannot steal the live report reference", () => {
  let state = createAssessmentState();
  const first = answer(objectiveAttempt("first"), 0);
  state = putDraft(state, first);
  let adaptive = createAttempt({ id: "second", assessmentType: "comprehensive", startedAt });
  adaptive = selectAttemptQuestion(adaptive, "q-2", { phase: "question" });
  const second = recordAttemptResponse(adaptive, {
    question: paperQuestions[1], selectedKeys: ["A"], answeredAt: startedAt, stage: 1, questionIndex: 0,
  });
  state = putDraft(state, second);
  const firstUpdated = answer(first, 2);
  state = putDraft(state, firstUpdated);

  assert.equal(state.drafts.objective.id, "first");
  assert.equal(state.drafts.comprehensive.id, "second");
  assert.equal(resolveLatestReport(state).id, "second");
});

test("comprehensive selection persists an unanswered question once and responses must match it", () => {
  let attempt = createAttempt({ id: "adaptive", assessmentType: "comprehensive", startedAt, adaptiveSession: { step: 1 } });
  const selected = selectAttemptQuestion(attempt, "q-1", { phase: "question", currentStage: 1, currentQuestionIndex: 0 });

  assert.deepEqual(attempt.questionIds, []);
  assert.deepEqual(selected.questionIds, ["q-1"]);
  assert.equal(selected.location.currentQuestionId, "q-1");
  assert.equal(selectAttemptQuestion(selected, "q-1", selected.location).questionIds.length, 1);
  assert.throws(() => recordAttemptResponse(selected, {
    question: paperQuestions[1], selectedKeys: ["A"], answeredAt: startedAt, stage: 1, questionIndex: 0,
  }), /current question|当前题目/i);
});

test("comprehensive selection persists a non-default resume position through storage", () => {
  let attempt = createAttempt({ id: "adaptive-position", assessmentType: "comprehensive", startedAt });
  attempt = selectAttemptQuestion(attempt, "q-7", {
    currentStage: 4,
    currentQuestionIndex: 3,
    phase: "question",
    lineIndex: 6,
  });
  const state = putDraft(createAssessmentState(), attempt);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveAssessmentState(storage, state, completedAt);
  const loaded = loadAssessmentState(storage, completedAt);

  assert.equal(loaded.warning, null);
  assert.equal(loaded.state.drafts.comprehensive.currentStage, 4);
  assert.equal(loaded.state.drafts.comprehensive.currentQuestionIndex, 3);
  assert.equal(loaded.state.drafts.comprehensive.location.currentQuestionId, "q-7");
  assert.equal(loaded.state.drafts.comprehensive.location.lineIndex, 6);
});

test("objective selection only accepts its fixed paper position and never alters it", () => {
  const attempt = objectiveAttempt();
  assert.throws(() => selectAttemptQuestion(attempt, "not-on-paper", { currentStage: 1, currentQuestionIndex: 0 }), /paper|试卷/i);
  assert.throws(() => selectAttemptQuestion(attempt, "q-2", { currentStage: 1, currentQuestionIndex: 0 }), /position|位置/i);
  const selected = selectAttemptQuestion(attempt, "q-1", { currentStage: 1, currentQuestionIndex: 0 });
  assert.deepEqual(selected.questionIds, paperIds);
});

test("objective attempts reject a non-unique fixed paper", () => {
  assert.throws(() => createAttempt({
    id: "duplicate-paper", assessmentType: "objective", startedAt, questionIds: [...paperIds.slice(0, 24), "q-1"], seed: 7,
  }), /unique|唯一/i);
});

test("completion is gated on exactly 25 responses with evidence for every dimension", () => {
  const incomplete = answer(objectiveAttempt(), 0);
  assert.throws(() => completeAttempt(incomplete, completedAt), /25|responses|回答/i);
  const complete = completedAttempt();
  assert.equal(complete.status, "completed");
  assert.notEqual(complete.result.grade, null);
  assert.throws(() => recordAttemptResponse(complete, {
    question: paperQuestions[0], selectedKeys: ["A"], answeredAt: completedAt, stage: 1, questionIndex: 0,
  }), /completed|完成/i);
});

test("completion history is an immutable, newest-first, unbounded snapshot", () => {
  let state = createAssessmentState();
  for (let index = 0; index < 12; index += 1) {
    let attempt = objectiveAttempt(`history-${index}`);
    for (let questionIndex = 0; questionIndex < paperQuestions.length; questionIndex += 1) {
      attempt = answer(attempt, questionIndex);
    }
    state = putDraft(state, attempt);
    state = finalizeDraft(state, "objective", `2026-09-14T${String(8 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`);
  }
  assert.equal(state.history.length, 12);
  assert.equal(state.history[0].id, "history-11");
  const mutated = updateAttemptLocation(state.history[0], { feedback: { changed: true } });
  assert.notDeepEqual(mutated.location, state.history[0].location);
  assert.equal(state.history[0].location.feedback, null);
});

test("restart replaces only the requested draft and clears its live-report reference", () => {
  let state = createAssessmentState();
  state = putDraft(state, answer(objectiveAttempt("restart-me"), 0));
  const restarted = restartDraft(state, "objective");
  assert.equal(restarted.drafts.objective, null);
  assert.equal(restarted.latestReportRef, null);
  assert.equal(state.drafts.objective.id, "restart-me");
});

test("draft compatibility reports version, objective paper, and missing-question reasons without mutation", () => {
  const objective = objectiveAttempt();
  assert.deepEqual(checkDraftCompatibility(objective, paperQuestions, QUESTION_BANK_VERSION), { compatible: true, reason: null });
  assert.equal(checkDraftCompatibility(objective, paperQuestions, "next-bank").compatible, false);
  assert.equal(checkDraftCompatibility({ ...objective, questionIds: [...paperIds.slice(0, 24), paperIds[0]] }, paperQuestions, QUESTION_BANK_VERSION).compatible, false);
  const adaptive = selectAttemptQuestion(createAttempt({ id: "c", assessmentType: "comprehensive", startedAt }), "q-1", {});
  const before = structuredClone(adaptive);
  const result = checkDraftCompatibility(adaptive, paperQuestions.slice(1), QUESTION_BANK_VERSION);
  assert.equal(result.compatible, false);
  assert.match(result.reason, /missing|不存在|缺失/i);
  assert.deepEqual(adaptive, before);
});

test("attempt updates retain the required resume fields without mutating prior values", () => {
  const attempt = objectiveAttempt("immutable");
  const selected = selectAttemptQuestion(attempt, "q-1", {
    phase: "question", lineIndex: 3, selectedKeys: ["A"], feedback: { hint: "x" }, currentStage: 1, currentQuestionIndex: 0,
  });
  const fields = [
    "id", "assessmentType", "status", "startedAt", "completedAt", "answeredCount", "totalQuestions",
    "currentStage", "currentQuestionIndex", "questionIds", "seed", "responses", "adaptiveSession", "result",
    "scoringVersion", "questionBankVersion", "location",
  ];
  assert.deepEqual(Object.keys(attempt).sort(), fields.sort());
  assert.deepEqual(Object.keys(selected.location).sort(), ["currentQuestionId", "feedback", "lineIndex", "phase", "selectedKeys"]);
  assert.equal(attempt.location.currentQuestionId, null);
  assert.equal(selected.location.currentQuestionId, "q-1");
  assert.equal(selected.location.lineIndex, 3);
  assert.deepEqual(selected.location.feedback, { hint: "x" });
  assert.notEqual(selected.questionIds, attempt.questionIds);
});

test("a finalized history snapshot cannot be changed through the prior draft reference", () => {
  let draft = completedAttempt("snapshot");
  let state = putDraft(createAssessmentState(), draft);
  state = finalizeDraft(state, "objective", completedAt);
  draft.result.dimensions[0].score = -1;
  draft.responses[0].selectedKeys[0] = "B";
  assert.notEqual(state.history[0].result.dimensions[0].score, -1);
  assert.deepEqual(state.history[0].responses[0].selectedKeys, ["A"]);
});

test("nested feedback is isolated from caller input, earlier attempts, and history snapshots", () => {
  const creationFeedback = { detail: { source: "creation" } };
  const created = createAttempt({
    id: "feedback", assessmentType: "objective", startedAt, questionIds: paperIds, seed: 7,
    location: { feedback: creationFeedback },
  });
  creationFeedback.detail.source = "mutated caller";
  const selectionFeedback = { detail: { source: "selection" } };
  const selected = selectAttemptQuestion(created, "q-1", { currentStage: 1, currentQuestionIndex: 0, feedback: selectionFeedback });
  selectionFeedback.detail.source = "mutated selection caller";
  const updateFeedback = { detail: { source: "update" } };
  const updated = updateAttemptLocation(selected, { feedback: updateFeedback });
  updateFeedback.detail.source = "mutated update caller";
  const responseFeedback = { detail: { source: "response" } };
  const answered = recordAttemptResponse(updated, {
    question: paperQuestions[0], selectedKeys: ["A"], answeredAt: startedAt, stage: 1, questionIndex: 0, feedback: responseFeedback,
  });
  responseFeedback.detail.source = "mutated response caller";

  assert.equal(created.location.feedback.detail.source, "creation");
  assert.equal(selected.location.feedback.detail.source, "selection");
  assert.equal(updated.location.feedback.detail.source, "update");
  assert.equal(answered.location.feedback.detail.source, "response");

  let completed = completedAttempt("feedback-history");
  completed = updateAttemptLocation(completed, { feedback: { detail: { source: "history" } } });
  let state = putDraft(createAssessmentState(), completed);
  state = finalizeDraft(state, "objective", completedAt);
  completed.location.feedback.detail.source = "mutated draft";
  assert.equal(state.history[0].location.feedback.detail.source, "history");
});

test("completion validates timestamps and orders offset timestamps by their instants", () => {
  let incomplete = objectiveAttempt("missing-time");
  for (let index = 0; index < paperQuestions.length; index += 1) incomplete = answer(incomplete, index);
  assert.throws(() => completeAttempt(incomplete), /timestamp|时间/i);
  assert.throws(() => completeAttempt(incomplete, "not-a-time"), /timestamp|时间/i);

  let first = objectiveAttempt("offset-earlier");
  for (let index = 0; index < paperQuestions.length; index += 1) first = answer(first, index);
  let second = objectiveAttempt("utc-later");
  for (let index = 0; index < paperQuestions.length; index += 1) second = answer(second, index);
  let state = putDraft(createAssessmentState(), first);
  state = finalizeDraft(state, "objective", "2026-09-14T09:00:00+01:00");
  state = putDraft(state, second);
  state = finalizeDraft(state, "objective", "2026-09-14T08:30:00.000Z");
  assert.deepEqual(state.history.map((item) => item.id), ["utc-later", "offset-earlier"]);
});

test("storage serializes a valid state and preserves a distinct loaded copy", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const state = putDraft(createAssessmentState(), answer(objectiveAttempt(), 0));
  const saved = saveAssessmentState(storage, state, completedAt);
  const loaded = loadAssessmentState(storage, completedAt);
  assert.equal(saved.warning, null);
  assert.equal(values.has(STORAGE_KEY), true);
  assert.equal(loaded.warning, null);
  assert.deepEqual(loaded.state, state);
  assert.notEqual(loaded.state, state);
});

test("invalid stored JSON recovers safely and reports a failed corrupt backup", () => {
  const storage = {
    getItem: () => "{bad json",
    setItem: () => { throw new Error("write blocked"); },
  };
  const loaded = loadAssessmentState(storage, completedAt);
  assert.deepEqual(loaded.state, createAssessmentState());
  assert.match(loaded.warning, /恢复|损坏/i);
  assert.match(loaded.warning, /备份|失败/i);
});

test("structurally invalid saved state is backed up before recovery", () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    drafts: { objective: null, comprehensive: null },
    history: [],
    latestReportRef: { kind: "history", id: "missing" },
  })]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const loaded = loadAssessmentState(storage, completedAt);
  const backupKeys = [...values.keys()].filter((key) => key.startsWith("aiquos.assessment-state.corrupt."));
  assert.deepEqual(loaded.state, createAssessmentState());
  assert.equal(backupKeys.length, 1);
  assert.equal(values.get(backupKeys[0]), values.get(STORAGE_KEY));
});

test("storage rejects a draft stored under the wrong assessment type", () => {
  const invalidState = createAssessmentState();
  invalidState.drafts.objective = createAttempt({ id: "wrong-slot", assessmentType: "comprehensive", startedAt });
  const values = new Map([[STORAGE_KEY, JSON.stringify(invalidState)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const loaded = loadAssessmentState(storage, completedAt);
  assert.deepEqual(loaded.state, createAssessmentState());
  assert.match(loaded.warning, /恢复|损坏/i);
});

test("storage recovers from malformed history, draft fields, evidence, result, location, and counts", () => {
  const validDraft = putDraft(createAssessmentState(), answer(objectiveAttempt("malformed"), 0));
  const validComprehensive = putDraft(createAssessmentState(), createAttempt({
    id: "malformed-comprehensive", assessmentType: "comprehensive", startedAt,
  }));
  const cases = [
    ["null history", { ...createAssessmentState(), history: [null] }],
    ["incomplete objective paper", (() => { const state = structuredClone(validDraft); state.drafts.objective.questionIds.pop(); return state; })()],
    ["malformed evidence", (() => { const state = structuredClone(validDraft); state.drafts.objective.responses[0].credit = "one"; return state; })()],
    ["mismatched count", (() => { const state = structuredClone(validDraft); state.drafts.objective.answeredCount = 2; return state; })()],
    ["malformed result", (() => { const state = structuredClone(validDraft); state.drafts.objective.result.dimensions = []; return state; })()],
    ["result status inconsistent with response count", (() => { const state = structuredClone(validDraft); state.drafts.objective.result.status = "not_started"; return state; })()],
    ["malformed location", (() => { const state = structuredClone(validDraft); state.drafts.objective.location.selectedKeys = "A"; return state; })()],
    ["missing required attempt field", (() => { const state = structuredClone(validComprehensive); delete state.drafts.comprehensive.adaptiveSession; return state; })()],
  ];
  for (const [name, invalidState] of cases) {
    const values = new Map([[STORAGE_KEY, JSON.stringify(invalidState)]]);
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const loaded = loadAssessmentState(storage, completedAt);
    assert.deepEqual(loaded.state, createAssessmentState(), name);
    assert.match(loaded.warning, /恢复|损坏/i, name);
  }
});

test("bank-incompatible yet structurally valid drafts load for explicit compatibility handling", () => {
  const unknownIds = Array.from({ length: 25 }, (_, index) => `retired-${index + 1}`);
  const state = putDraft(createAssessmentState(), createAttempt({
    id: "retired-paper", assessmentType: "objective", startedAt, questionIds: unknownIds, seed: 3,
  }));
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const loaded = loadAssessmentState(storage, completedAt);

  assert.equal(loaded.warning, null);
  assert.equal(loaded.state.drafts.objective.id, "retired-paper");
  assert.equal(checkDraftCompatibility(loaded.state.drafts.objective, paperQuestions, QUESTION_BANK_VERSION).compatible, false);
});

test("quota failures leave the in-memory state intact and expose a save warning", () => {
  const state = putDraft(createAssessmentState(), answer(objectiveAttempt(), 0));
  let calls = 0;
  const saved = saveAssessmentState({ setItem: () => { calls += 1; throw new Error("quota exceeded"); } }, state, completedAt);
  assert.equal(saved.state, state);
  assert.equal(calls, 1);
  assert.match(saved.warning, /结果暂时无法保存/);
});
