import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import {
  SCORING_VERSION,
  createResponseEvidence,
  scoreAssessment,
  validateQuestionBank,
} from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import bank from "../src/comprehensive-questions.json" with { type: "json" };
import { createAdaptiveController } from "../src/comprehensive-adaptive.js";
import {
  QUESTION_BANK_VERSION,
  appendHistorySnapshot,
  clearAttemptDraft,
  createAttempt,
  currentResult,
  isAttemptComplete,
  loadAttemptDraft,
  loadAttemptHistory,
  recordAnswer,
  saveAttemptDraft,
  snapshotAttempt,
} from "../src/assessment-attempt.js";

const questions = bank.questions;
// comprehensive-quiz.js imports the bank through Vite, so derive the level
// contract here from the bank itself: five stages of five questions.
const LEVEL_IDS = [...new Set(questions.map((question) => question.levelId))];
const COMPREHENSIVE_QUESTION_COUNT = 5;
const TOTAL = LEVEL_IDS.length * COMPREHENSIVE_QUESTION_COUNT;

test("the vendored scoring package is intact and validates the project bank", async () => {
  assert.equal(SCORING_VERSION, "1.0.0");
  assert.equal(validateQuestionBank(questions), true);
  assert.equal(questions.length, 120);
  assert.equal(LEVEL_IDS.length, 5);
  // The bank version recorded on attempts must track the actual bank size.
  assert.match(QUESTION_BANK_VERSION, /120$/);
});

test("the package's own CLI and examples still agree with the core", async () => {
  // Golden check: running the vendored CLI over its bundled example must
  // produce the same numbers as importing the core here.
  const require = createRequire(import.meta.url);
  const { execFileSync } = require("node:child_process");
  const cli = new URL("../vendor/aiquos-six-dimension-scoring/scripts/score-responses.mjs", import.meta.url);
  const example = new URL("../vendor/aiquos-six-dimension-scoring/examples/comprehensive-responses.json", import.meta.url);
  const output = JSON.parse(execFileSync(process.execPath, [cli.href.replace("file://", ""), example.href.replace("file://", "")], { encoding: "utf8" }));
  const manual = JSON.parse(await readFile(example, "utf8"));
  const evidence = manual.responses.map(({ question, selectedKeys, answeredAt }) =>
    createResponseEvidence(question, selectedKeys, answeredAt),
  );
  const result = scoreAssessment(evidence, { totalQuestions: manual.totalQuestions });
  assert.deepEqual(result, output.result);
  assert.equal(result.status, "completed");
  assert.equal(typeof result.overallScore, "number");
  assert.equal(result.grade !== null, true);
});

test("an attempt reports live dimensions only and completes exactly at the end", () => {
  const attempt = createAttempt({ questions, totalQuestions: TOTAL });
  assert.equal(attempt.scoringVersion, "1.0.0");
  assert.equal(attempt.questionBankVersion, QUESTION_BANK_VERSION);
  assert.equal(currentResult(attempt), null);

  // First answer: only the answered dimensions have estimates, no overall.
  const first = questions[0];
  const afterFirst = recordAnswer(attempt, first, first.answer);
  assert.equal(afterFirst.result.status, "in_progress");
  assert.equal(afterFirst.result.overallScore, null);
  assert.equal(afterFirst.result.grade, null);
  for (const dimension of afterFirst.result.dimensions) {
    const hasEvidence = first.dimKeys.includes(dimension.key);
    assert.equal(dimension.score !== null, hasEvidence, `${dimension.key} evidence gating`);
  }

  // A full correct run completes and carries an overall score with a grade.
  let state = { attempt, result: null };
  const asked = [];
  for (const question of questions.slice(0, TOTAL)) {
    if (asked.includes(question.id)) continue;
    asked.push(question.id);
    state = recordAnswer(state.attempt, question, question.answer);
    if (state.attempt.evidence.length < TOTAL) {
      assert.equal(isAttemptComplete(state.result), false);
    }
  }
  assert.equal(state.attempt.evidence.length, TOTAL);
  assert.equal(state.result.answeredCount, TOTAL);
  assert.equal(isAttemptComplete(state.result), true);
  assert.equal(state.result.status, "completed");
  assert.ok(state.result.overallScore >= 0 && state.result.overallScore <= 100);
  assert.ok(["S", "A", "B", "C", "D"].includes(state.result.grade));
  for (const dimension of state.result.dimensions) {
    assert.notEqual(dimension.score, null);
  }
});

test("a re-served question replaces its evidence instead of duplicating it", () => {
  const attempt = createAttempt({ questions, totalQuestions: TOTAL });
  const question = questions[0];
  const wrong = recordAnswer(attempt, question, [question.options.find((option) => !question.answer.includes(option.key)).key]);
  const right = recordAnswer(wrong.attempt, question, question.answer);
  assert.equal(right.attempt.evidence.length, 1);
  assert.equal(right.attempt.evidence[0].credit, 1);
  assert.equal(right.result.answeredCount, 1);
});

test("scoring is order independent across the whole run", () => {
  const attempt = createAttempt({ questions, totalQuestions: TOTAL });
  const run = questions.slice(0, TOTAL);
  const forward = run.reduce((state, question) => recordAnswer(state.attempt, question, question.answer), { attempt });
  const backward = [...run].reverse().reduce((state, question) => recordAnswer(state.attempt, question, question.answer), { attempt });
  assert.deepEqual(forward.result, backward.result);
});

test("the adaptive product path always yields a completable attempt", () => {
  // Drive the real selector the UI uses: five stages, five questions each,
  // outcomes recorded exactly like ComprehensiveTask does. A wrong-prone run
  // must still reach completed with all six dimensions evidenced.
  for (const rngSeed of [0.1, 0.5, 0.9]) {
    let rngValue = rngSeed;
    const controller = createAdaptiveController(questions, {
      rng: () => {
        rngValue = (rngValue * 9301 + 49297) % 233280;
        return rngValue / 233280;
      },
    });
    let attempt = createAttempt({ questions, totalQuestions: TOTAL });
    let result = null;
    for (let stage = 1; stage <= LEVEL_IDS.length; stage += 1) {
      for (let index = 0; index < COMPREHENSIVE_QUESTION_COUNT; index += 1) {
        const question = controller.select(LEVEL_IDS[stage - 1], stage);
        assert.ok(question, `a question must be available (stage ${stage} #${index + 1})`);
        const outcome = (stage + index) % 3 === 0 ? "wrong" : "correct";
        controller.record(outcome);
        const next = recordAnswer(attempt, question, outcome === "correct" ? question.answer : []);
        attempt = next.attempt;
        result = next.result;
      }
    }
    assert.equal(result.status, "completed", `run with rng ${rngSeed} completes`);
    assert.equal(result.answeredCount, TOTAL);
    assert.equal(new Set(attempt.questionIds).size, TOTAL);
    for (const dimension of result.dimensions) {
      assert.notEqual(dimension.score, null, `dimension ${dimension.key} evidenced`);
    }
  }
});

test("draft and history persistence round-trip through storage", () => {
  const saved = { ...globalThis };
  const backing = new Map();
  globalThis.localStorage = {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: (key) => backing.delete(key),
  };
  try {
    let attempt = createAttempt({ questions, totalQuestions: TOTAL });
    for (const question of questions.slice(0, 10)) {
      attempt = recordAnswer(attempt, question, question.answer).attempt;
    }
    saveAttemptDraft(attempt);
    assert.deepEqual(loadAttemptDraft(), attempt);

    const result = scoreAssessment(attempt.evidence, { totalQuestions: TOTAL });
    // An in-progress attempt never snapshots.
    assert.equal(snapshotAttempt(attempt, result), null);

    for (const question of questions.slice(10, TOTAL)) {
      attempt = recordAnswer(attempt, question, question.answer).attempt;
    }
    const complete = scoreAssessment(attempt.evidence, { totalQuestions: TOTAL });
    const snapshot = snapshotAttempt(attempt, complete);
    assert.ok(snapshot);
    const history = appendHistorySnapshot(snapshot);
    assert.equal(history.length, 1);
    // Appending the same snapshot twice stores it exactly once.
    appendHistorySnapshot(snapshot);
    assert.equal(loadAttemptHistory().length, 1);

    clearAttemptDraft();
    assert.equal(loadAttemptDraft(), null);
    assert.equal(loadAttemptHistory().length, 1);

    // Corrupt or foreign-version data is ignored rather than crashing.
    backing.set("aiquos.comprehensive-history.v1", JSON.stringify([{ scoringVersion: "0.0.0" }]));
    assert.deepEqual(loadAttemptHistory(), []);
  } finally {
    if (saved.localStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = saved.localStorage;
  }
});

test("history snapshots are immutable copies of the attempt", () => {
  let attempt = createAttempt({ questions, totalQuestions: TOTAL });
  for (const question of questions.slice(0, TOTAL)) {
    attempt = recordAnswer(attempt, question, question.answer).attempt;
  }
  const complete = scoreAssessment(attempt.evidence, { totalQuestions: TOTAL });
  const snapshot = snapshotAttempt(attempt, complete);
  attempt.evidence.push({ questionId: "tampered" });
  attempt.questionIds.push("tampered");
  assert.ok(!snapshot.evidence.some((item) => item.questionId === "tampered"));
  assert.ok(!snapshot.questionIds.includes("tampered"));
});

test("a resumed run that over-answers stays within the scoring budget", () => {
  let attempt = createAttempt({ questions, totalQuestions: TOTAL });
  // Answer 25 unique questions, then re-enter earlier stages and answer 5 more.
  for (const question of questions.slice(0, TOTAL)) {
    attempt = recordAnswer(attempt, question, question.answer).attempt;
  }
  assert.equal(attempt.evidence.length, TOTAL);
  for (const question of questions.slice(TOTAL, TOTAL + 5)) {
    const next = recordAnswer(attempt, question, question.answer);
    // FIFO keeps the most recent 25; scoring never sees an over-count.
    assert.equal(next.attempt.evidence.length, TOTAL);
    assert.equal(next.result.answeredCount, TOTAL);
    assert.equal(next.result.status, "completed");
    attempt = next.attempt;
  }
  // The earliest five answers were evicted; the newest five are present.
  assert.ok(!attempt.evidence.some((item) => item.questionId === questions[0].id));
  assert.ok(attempt.evidence.some((item) => item.questionId === questions[TOTAL + 4].id));
  assert.equal(new Set(attempt.questionIds).size, TOTAL);
});
