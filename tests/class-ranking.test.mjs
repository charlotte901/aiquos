import test from "node:test";
import assert from "node:assert/strict";
import { classRanking } from "../src/class-ranking.js";

test("按个人平均分排名，记录数不同也等权，同分并列，无成绩不排名", () => {
  const students = ["a", "b", "c", "d"].map((accountId) => ({ accountId }));
  const runs = [["a", 20], ["a", 100], ["b", 70], ["c", 60], ["c", 80], ["other", 99], ["d", null]]
    .map(([accountId, overallScore]) => ({ accountId, overallScore }));
  const a = classRanking(students, runs, "a");
  assert.equal(a.myAverage, 60);
  assert.equal(a.myRank, 3);
  assert.equal(a.studentCount, 4);
  assert.equal(a.rankedCount, 3);
  assert.equal(a.classAverage, 66.67);
  assert.equal(classRanking(students, runs, "b").myRank, 1);
  assert.equal(classRanking(students, runs, "c").myRank, 1);
  assert.equal(classRanking(students, runs, "d").myRank, null);
  assert.equal(a.scoreBins.reduce((sum, bin) => sum + bin.people, 0), 3);
  assert.equal(a.scoreBins[6].current, true);
  assert.equal(classRanking(students, [], "a").classAverage, null);
});
