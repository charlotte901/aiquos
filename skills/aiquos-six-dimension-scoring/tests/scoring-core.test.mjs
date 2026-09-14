import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateQuestionCredit,
  createResponseEvidence,
  estimateDimension,
  gradeOverall,
  scoreAssessment,
  validateQuestionBank,
} from "../scripts/scoring-core.mjs";

const multi = {
  id: "multi-1",
  type: "multi",
  difficulty: "medium",
  options: ["A", "B", "C", "D"].map((key) => ({ key, text: key })),
  answer: ["A", "B", "D"],
  dimKeys: ["D2", "D4"],
};

test("multi-select gives partial credit and blocks select-all guessing", () => {
  assert.equal(calculateQuestionCredit(multi, ["A", "B", "D"]), 1);
  assert.ok(Math.abs(calculateQuestionCredit(multi, ["A", "B"]) - 2 / 3) < 1e-12);
  assert.ok(Math.abs(calculateQuestionCredit(multi, ["A", "B", "C"]) - 7 / 15) < 1e-12);
  assert.equal(calculateQuestionCredit(multi, ["A", "B", "C", "D"]), 0);
  assert.equal(calculateQuestionCredit(multi, ["C"]), 0);
});

test("single/judge scoring and input validation are exact", () => {
  const single = { ...multi, id: "single-1", type: "single", answer: ["A"] };
  const judge = { ...single, id: "judge-1", type: "judge", options: single.options.slice(0, 2) };
  assert.equal(calculateQuestionCredit(single, ["A"]), 1);
  assert.equal(calculateQuestionCredit(single, ["B"]), 0);
  assert.equal(calculateQuestionCredit(judge, ["A"]), 1);
  assert.throws(() => calculateQuestionCredit(single, ["Z"]), /选项|option/i);
  assert.throws(() => validateQuestionBank([single, { ...single }]), /重复|duplicate/i);
});

test("Rasch estimates reward hard success and soften hard failure", () => {
  const evidence = (difficulty, credit) => Array.from({ length: 8 }, (_, index) => ({
    questionId: `${difficulty}-${credit}-${index}`,
    type: "single",
    difficulty,
    dimKeys: ["D1"],
    selectedKeys: [],
    credit,
    answeredAt: `2026-09-14T00:00:0${index}.000Z`,
  }));
  assert.ok(estimateDimension(evidence("high", 1), "D1") > estimateDimension(evidence("low", 1), "D1"));
  assert.ok(estimateDimension(evidence("high", 0), "D1") > estimateDimension(evidence("low", 0), "D1"));
});

test("scoring is order independent and incomplete work has no grade", () => {
  const responses = [
    createResponseEvidence({ ...multi, id: "m1" }, ["A", "B"], "2026-09-14T00:00:00.000Z"),
    createResponseEvidence({ ...multi, id: "m2", difficulty: "high" }, ["A", "B", "D"], "2026-09-14T00:00:01.000Z"),
  ];
  assert.deepEqual(scoreAssessment(responses, { totalQuestions: 25 }), scoreAssessment([...responses].reverse(), { totalQuestions: 25 }));
  assert.equal(scoreAssessment(responses, { totalQuestions: 25 }).overallScore, null);
  assert.equal(scoreAssessment(responses, { totalQuestions: 25 }).grade, null);
  assert.equal(gradeOverall(90), "S");
  assert.equal(gradeOverall(89), "A");
  assert.equal(gradeOverall(79), "B");
  assert.equal(gradeOverall(69), "C");
  assert.equal(gradeOverall(59), "D");
});

test("a complete 25-response result uses the equal mean of all six dimensions", () => {
  const evidence = Array.from({ length: 25 }, (_, index) => ({
    questionId: `complete-${index + 1}`,
    type: "single",
    difficulty: ["low", "medium", "high"][index % 3],
    dimKeys: [`D${index % 6 + 1}`],
    selectedKeys: [index % 2 ? "A" : "B"],
    credit: index % 2,
    answeredAt: `2026-09-14T01:${String(index).padStart(2, "0")}:00.000Z`,
  }));
  const result = scoreAssessment(evidence, { totalQuestions: 25 });
  const expected = Math.round(result.dimensions.reduce((sum, item) => sum + item.score, 0) / 6);
  assert.equal(result.status, "completed");
  assert.equal(result.overallScore, expected);
  assert.equal(result.grade, gradeOverall(expected));
});
