// Pure aggregations for the admin console. All inputs are plain rosters/runs
// (see cohort.js) so every figure is unit-testable without a DOM.
import { DIMENSIONS } from "../../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { gradeOf } from "./cohort.js";

const DAY = 86400000;

export function overviewKpis(roster) {
  const runs = allRunsOf(roster);
  const now = Date.now();
  const recentWeek = runs.filter((run) => now - new Date(run.completedAt).getTime() <= 7 * DAY);
  const activeFortnight = new Set(
    runs.filter((run) => now - new Date(run.completedAt).getTime() <= 14 * DAY).map((run) => run.studentId),
  );
  const averageOverall = runs.length
    ? Math.round((runs.reduce((sum, run) => sum + run.overallScore, 0) / runs.length) * 10) / 10
    : 0;
  return {
    studentCount: roster.length,
    runCount: runs.length,
    averageOverall,
    weeklyCompletions: recentWeek.length,
    activeStudents: activeFortnight.size,
  };
}

export function gradeDistribution(roster) {
  const runs = allRunsOf(roster);
  const buckets = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const run of runs) buckets[run.grade] += 1;
  return buckets;
}

export function dimensionAverages(roster) {
  const runs = allRunsOf(roster);
  return DIMENSIONS.map((dimension) => {
    const scores = runs
      .map((run) => run.dimensions.find((item) => item.key === dimension.key)?.score)
      .filter((score) => typeof score === "number");
    return {
      key: dimension.key,
      name: dimension.name,
      short: dimension.short,
      average: scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : 0,
    };
  });
}

// Eight ISO-week buckets ending with the current week.
export function weeklyTrend(roster, now = new Date()) {
  const runs = allRunsOf(roster);
  const endOfThisWeek = new Date(now);
  endOfThisWeek.setHours(23, 59, 59, 999);
  const buckets = [];
  for (let index = 7; index >= 0; index -= 1) {
    const to = endOfThisWeek.getTime() - index * 7 * DAY;
    const from = to - 7 * DAY;
    const inBucket = runs.filter((run) => {
      const time = new Date(run.completedAt).getTime();
      return time > from && time <= to;
    });
    buckets.push({
      label: weekLabel(new Date(to)),
      count: inBucket.length,
      average: inBucket.length
        ? Math.round((inBucket.reduce((sum, run) => sum + run.overallScore, 0) / inBucket.length) * 10) / 10
        : null,
    });
  }
  return buckets;
}

function weekLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// Bank quality audit: balance checks the serving contract depends on.
export function bankAudit(questions) {
  const levels = {};
  const byDifficulty = { low: 0, medium: 0, high: 0 };
  const byType = { single: 0, multi: 0, judge: 0 };
  const dimCounts = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension.key, 0]));
  for (const question of questions) {
    levels[question.levelId] = levels[question.levelId] ?? { low: 0, medium: 0, high: 0, total: 0 };
    levels[question.levelId][question.difficulty] += 1;
    levels[question.levelId].total += 1;
    byDifficulty[question.difficulty] += 1;
    byType[question.type] = (byType[question.type] ?? 0) + 1;
    for (const key of question.dimKeys) dimCounts[key] += 1;
  }
  const warnings = [];
  for (const [levelId, bucket] of Object.entries(levels)) {
    if (bucket.low === 0 || bucket.medium === 0 || bucket.high === 0) {
      warnings.push(`关卡 ${levelId} 存在空难度档，自适应选题将受限`);
    }
  }
  for (const [key, count] of Object.entries(dimCounts)) {
    if (count === 0) warnings.push(`维度 ${key} 无覆盖题目，完成判定将无法满足`);
    else if (count < questions.length / 24) warnings.push(`维度 ${key} 覆盖偏低（${count} 题）`);
  }
  const ids = new Set(questions.map((question) => question.id));
  if (ids.size !== questions.length) warnings.push("存在重复题目 id");
  return { levels, byDifficulty, byType, dimCounts, warnings, total: questions.length };
}

// Leaderboard-style weakest/strongest dimensions with the grade bands applied.
export function dimensionHighlights(roster) {
  const averages = dimensionAverages(roster);
  const sorted = [...averages].sort((left, right) => left.average - right.average);
  return {
    weakest: sorted[0] ?? null,
    strongest: sorted[sorted.length - 1] ?? null,
    averages,
    gradeOf,
  };
}

function allRunsOf(roster) {
  return roster.flatMap((student) => student.runs);
}
