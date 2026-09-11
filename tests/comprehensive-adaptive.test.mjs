import test from "node:test";
import assert from "node:assert/strict";
import questionBank from "../src/comprehensive-questions.json" with { type: "json" };
import {
  applyAdaptiveOutcome,
  createAdaptiveController,
  createAdaptiveSession,
  selectAdaptiveQuestion,
  startAdaptiveStage,
} from "../src/comprehensive-adaptive.js";

const DIFFICULTIES = ["low", "medium", "high"];
const LEVELS = ["academy", "labyrinth", "workshop", "station", "court"];

test("the comprehensive bank has explicit balanced difficulty metadata", () => {
  assert.equal(questionBank.questions.length, 120);
  assert.equal(new Set(questionBank.questions.map((question) => question.id)).size, 120);

  for (const question of questionBank.questions) {
    assert.ok(DIFFICULTIES.includes(question.difficulty), `${question.id} has a valid difficulty`);
    assert.ok(["single", "judge", "multi"].includes(question.type), `${question.id} has a valid type`);
    assert.equal(question.dimKeys.length, 2, `${question.id} has two dimensions`);
    assert.ok(question.dimKeys.every((key) => /^D[1-6]$/.test(key)), `${question.id} has valid dimensions`);
  }

  for (const difficulty of DIFFICULTIES) {
    assert.equal(
      questionBank.questions.filter((question) => question.difficulty === difficulty).length,
      40,
    );
  }

  for (const levelId of LEVELS) {
    for (const difficulty of DIFFICULTIES) {
      assert.equal(
        questionBank.questions.filter(
          (question) => question.levelId === levelId && question.difficulty === difficulty,
        ).length,
        8,
      );
    }
  }
});

test("adaptive routing starts in the middle and applies bounded evidence", () => {
  const initial = createAdaptiveSession();
  assert.equal(initial.position, 1);
  assert.equal(applyAdaptiveOutcome(initial, "correct").position, 1.4);
  assert.equal(applyAdaptiveOutcome(initial, "partial").position, 1);
  assert.equal(applyAdaptiveOutcome(initial, "wrong").position, 0.6);

  let high = initial;
  let low = initial;
  for (let index = 0; index < 10; index += 1) {
    high = applyAdaptiveOutcome(high, "correct");
    low = applyAdaptiveOutcome(low, "wrong");
  }
  assert.equal(high.position, 2);
  assert.equal(low.position, 0);
});

test("a new stage partially regresses once toward medium", () => {
  const high = { ...createAdaptiveSession(), position: 2 };
  const stageOne = startAdaptiveStage(high, 1);
  const stageTwo = startAdaptiveStage(stageOne, 2);
  assert.equal(stageOne.position, 2);
  assert.equal(stageTwo.position, 1.65);
  assert.deepEqual(startAdaptiveStage(stageTwo, 2), stageTwo);
});

function candidate(id, difficulty, dimKeys, type = "single", levelId = "academy") {
  return { id, difficulty, dimKeys, type, levelId };
}

test("selection favors difficulty before under-covered dimensions and type variety", () => {
  const session = {
    ...createAdaptiveSession(),
    position: 1.8,
    dimensionCounts: { D1: 4, D2: 4, D3: 0, D4: 0, D5: 2, D6: 2 },
    lastType: "single",
  };
  const questions = [
    candidate("medium-gap", "medium", ["D3", "D4"], "judge"),
    candidate("high-covered", "high", ["D1", "D2"], "single"),
    candidate("high-gap", "high", ["D3", "D4"], "single"),
    candidate("high-gap-varied", "high", ["D3", "D4"], "judge"),
  ];

  const result = selectAdaptiveQuestion({ questions, levelId: "academy", session, rng: () => 0 });

  assert.equal(result.question.id, "high-gap-varied");
  assert.deepEqual(result.session.usedQuestionIds, ["high-gap-varied"]);
  assert.equal(result.session.dimensionCounts.D3, 1);
  assert.equal(result.session.dimensionCounts.D4, 1);
  assert.equal(result.session.typeCounts.judge, 1);
  assert.equal(result.session.lastType, "judge");
});

test("selection excludes used and foreign-level questions", () => {
  const session = { ...createAdaptiveSession(), usedQuestionIds: ["used"] };
  const questions = [
    candidate("used", "medium", ["D1", "D2"]),
    candidate("foreign", "medium", ["D1", "D2"], "single", "court"),
    candidate("fresh", "medium", ["D1", "D2"]),
  ];

  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session, rng: () => 0 }).question.id,
    "fresh",
  );
});

test("selection randomizes within the top three and returns null for an empty pool", () => {
  const questions = [1, 2, 3, 4].map((number) =>
    candidate(`q${number}`, "medium", ["D1", "D2"]),
  );

  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => 0.999 }).question.id,
    "q3",
  );

  const initial = createAdaptiveSession();
  const empty = selectAdaptiveQuestion({ questions: [], levelId: "academy", session: initial });
  assert.equal(empty.question, null);
  assert.equal(empty.session, initial);
});

test("selection clamps invalid random values to a valid shortlist index", () => {
  const questions = [1, 2, 3].map((number) =>
    candidate(`q${number}`, "medium", ["D1", "D2"]),
  );

  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => -2 }).question.id,
    "q1",
  );
  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => Number.NaN }).question.id,
    "q1",
  );
});

test("the controller carries routing across stages and reset starts a new medium route", () => {
  const questions = [
    candidate("academy-medium-1", "medium", ["D1", "D2"], "single", "academy"),
    candidate("academy-medium-2", "medium", ["D3", "D4"], "judge", "academy"),
    candidate("academy-high", "high", ["D5", "D6"], "multi", "academy"),
    candidate("labyrinth-medium", "medium", ["D1", "D3"], "single", "labyrinth"),
    candidate("labyrinth-high", "high", ["D2", "D4"], "judge", "labyrinth"),
  ];
  const controller = createAdaptiveController(questions, { rng: () => 0 });

  assert.equal(controller.select("academy", 1).difficulty, "medium");
  controller.record("correct");
  assert.equal(controller.select("academy", 1).difficulty, "medium");
  controller.record("correct");
  assert.equal(controller.select("academy", 1).difficulty, "high");
  controller.record("correct");
  assert.equal(controller.select("labyrinth", 2).difficulty, "high");

  controller.reset();
  assert.equal(controller.select("labyrinth", 2).difficulty, "medium");
});
