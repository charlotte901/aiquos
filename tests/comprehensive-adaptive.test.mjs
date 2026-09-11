import test from "node:test";
import assert from "node:assert/strict";
import questionBank from "../src/comprehensive-questions.json" with { type: "json" };

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
