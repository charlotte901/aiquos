import test from "node:test";
import assert from "node:assert/strict";
import { QUESTION_BANK } from "../src/question-bank.js";
import { createObjectivePaper, createObjectiveSeed } from "../src/objective-paper.js";

const byId = new Map(QUESTION_BANK.map((question) => [question.id, question]));
const questionsFor = (paper) => paper.questionIds.map((id) => byId.get(id));
const difficultyTotals = (paper) => questionsFor(paper).reduce(
  (totals, question) => ({ ...totals, [question.difficulty]: totals[question.difficulty] + 1 }),
  { low: 0, medium: 0, high: 0 },
);
const stageDifficulties = (paper) => paper.stages.map((stage) =>
  stage.questionIds.map((id) => byId.get(id).difficulty),
);

test("objective papers satisfy all five stage quotas", () => {
  const paper = createObjectivePaper(QUESTION_BANK, { seed: 0x12345678 });

  assert.equal(paper.stages.length, 5);
  assert.ok(paper.stages.every((stage) => stage.questionIds.length === 5));
  assert.equal(new Set(paper.questionIds).size, 25);
  assert.deepEqual(difficultyTotals(paper), { low: 7, medium: 10, high: 8 });
  assert.deepEqual(stageDifficulties(paper), [
    ["low", "low", "low", "low", "low"],
    ["low", "low", "medium", "medium", "medium"],
    ["medium", "medium", "medium", "medium", "medium"],
    ["medium", "medium", "high", "high", "high"],
    ["high", "high", "high", "high", "high"],
  ]);
  assert.deepEqual(
    new Set(paper.questionIds.flatMap((id) => byId.get(id).dimKeys)),
    new Set(["D1", "D2", "D3", "D4", "D5", "D6"]),
  );
});

test("same seed is reproducible and different seeds vary", () => {
  assert.deepEqual(
    createObjectivePaper(QUESTION_BANK, { seed: 7 }),
    createObjectivePaper(QUESTION_BANK, { seed: 7 }),
  );
  assert.notDeepEqual(
    createObjectivePaper(QUESTION_BANK, { seed: 7 }).questionIds,
    createObjectivePaper(QUESTION_BANK, { seed: 8 }).questionIds,
  );
});

function syntheticQuestion(id, difficulty, dimKeys, type = "single") {
  return {
    id,
    difficulty,
    levelId: "academy",
    type,
    q: id,
    options: [
      { key: "A", text: "yes" },
      { key: "B", text: "no" },
    ],
    answer: ["A"],
    analysis: id,
    dims: dimKeys,
    dimKeys,
  };
}

function tieBreakBank() {
  return [
    ...["a", "b", "c", "d", "e", "f", "g"].map((suffix) =>
      syntheticQuestion(`low-loaded-${suffix}`, "low", ["D1", "D2"]),
    ),
    syntheticQuestion("low-gap", "low", ["D3", "D4"]),
    ...["a", "b", "c", "d", "e", "f"].map((suffix) =>
      syntheticQuestion(`medium-single-${suffix}`, "medium", ["D5", "D6"], "single"),
    ),
    ...["a", "b", "c", "d", "e"].map((suffix) =>
      syntheticQuestion(`medium-judge-${suffix}`, "medium", ["D5", "D6"], "judge"),
    ),
    ...Array.from({ length: 9 }, (_, index) =>
      syntheticQuestion(`high-full-tie-${index}`, "high", ["D1", "D3"], "multi"),
    ),
  ];
}

test("selection prioritizes dimension load, then type variety, then seeded full ties", () => {
  const questions = tieBreakBank();
  const first = createObjectivePaper(questions, { seed: 1 });
  const second = createObjectivePaper(questions, { seed: 2 });
  const questionById = new Map(questions.map((question) => [question.id, question]));

  assert.equal(first.stages[0].questionIds[1], "low-gap");
  assert.equal(questionById.get(first.stages[1].questionIds[2]).type, "judge");
  assert.notEqual(first.stages[3].questionIds[2], second.stages[3].questionIds[2]);
});

test("secure objective seeds preserve zero and nonzero uint32 values", () => {
  const zeroCrypto = {
    getRandomValues(values) {
      values[0] = 0;
      return values;
    },
  };
  const nonzeroCrypto = {
    getRandomValues(values) {
      values[0] = 0x12345678;
      return values;
    },
  };

  const zeroSeed = createObjectiveSeed(zeroCrypto);
  const nonzeroSeed = createObjectiveSeed(nonzeroCrypto);
  assert.equal(zeroSeed, 0);
  assert.equal(nonzeroSeed, 0x12345678);
  assert.ok(Number.isInteger(zeroSeed) && zeroSeed >= 0 && zeroSeed <= 0xffffffff);
  assert.ok(Number.isInteger(nonzeroSeed) && nonzeroSeed >= 0 && nonzeroSeed <= 0xffffffff);
  assert.deepEqual(
    createObjectivePaper(QUESTION_BANK, { seed: zeroSeed }),
    createObjectivePaper(QUESTION_BANK, { seed: zeroSeed }),
  );
  assert.deepEqual(
    createObjectivePaper(QUESTION_BANK, { seed: nonzeroSeed }),
    createObjectivePaper(QUESTION_BANK, { seed: nonzeroSeed }),
  );
});

test("paper generation rejects incomplete and invalid banks", () => {
  assert.throws(
    () => createObjectivePaper(QUESTION_BANK.filter((question) => question.difficulty !== "high"), { seed: 1 }),
    /cannot fill objective paper/i,
  );
  assert.throws(
    () => createObjectivePaper([{ id: "invalid" }], { seed: 1 }),
    /题型|question type/i,
  );
});

test("secure objective seed generation rejects unavailable randomness", () => {
  assert.throws(() => createObjectiveSeed(), /secure random/i);
  assert.throws(() => createObjectiveSeed({}), /secure random/i);
});
