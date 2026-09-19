// Admin data layer. Two sources merge into one roster:
//  1. A deterministic seeded cohort (演示班级, clearly labelled) so the
//     console has realistic volume in a demo without any backend.
//  2. The local machine's real comprehensive runs from the student app
//     (aiquos.comprehensive-history.v1) as the student 本机学员.
// Swap this module's loaders for API calls when a real backend exists.
import { DIMENSIONS } from "../../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { loadAttemptHistory } from "../assessment-attempt.js";

const DEMO_CLASSES = ["AI 应用 1 班", "AI 应用 2 班"];
const DEMO_NAMES = [
  "陈昱彤", "林可唯", "周子谦", "苏念安", "顾明轩", "何雨桐", "罗一帆", "沈知遥",
  "江晚晴", "秦朗", "章鱼跃", "许南乔", "邓子墨", "冯清越", "曹亦辰", "彭予安",
  "吕星野", "蒋见鹿", "崔听澜", "钟意", "阮苏苏", "黎望舒", "任思远", "方晓叙",
];

// Deterministic per-index generator: same roster on every load, no Math.random
// drift between the table and the charts.
function seededStream(seed) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function gradeOf(score) {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

// Cohort ability profile: each student gets a latent level plus a per-dimension
// tilt so averages differ across the six dimensions.
function buildDemoCohort() {
  const rand = seededStream(20260919);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return DEMO_NAMES.map((name, index) => {
    const latent = 0.42 + rand() * 0.46; // population mean drifts mid-band
    const tilt = DIMENSIONS.map(() => (rand() - 0.5) * 0.22);
    const runCount = 1 + Math.floor(rand() * 3);
    const runs = [];
    for (let run = 0; run < runCount; run += 1) {
      const progress = runCount > 1 ? (run / (runCount - 1)) * 0.05 : 0; // gentle growth
      const dims = DIMENSIONS.map((dimension, dimIndex) => {
        const raw = latent + tilt[dimIndex] + progress + (rand() - 0.5) * 0.12;
        return {
          key: dimension.key,
          name: dimension.name,
          short: dimension.short,
          score: Math.max(28, Math.min(98, Math.round(raw * 100))),
        };
      });
      const overall = Math.round(dims.reduce((sum, item) => sum + item.score, 0) / dims.length);
      // Spread runs across the past eight weeks, most recent last.
      const daysAgo = Math.round(6 + rand() * 50 - run * (40 / Math.max(1, runCount - 1 || 1)));
      const completedAt = new Date(today.getTime() - Math.max(1, daysAgo) * 86400000);
      runs.push({
        id: `demo-${index}-${run}`,
        studentId: `demo-${index}`,
        completedAt: completedAt.toISOString(),
        overallScore: overall,
        grade: gradeOf(overall),
        dimensions: dims,
        answeredCount: 25,
        totalQuestions: 25,
        source: "demo",
      });
    }
    return {
      id: `demo-${index}`,
      name,
      className: DEMO_CLASSES[index % DEMO_CLASSES.length],
      source: "demo",
      runs: runs.sort((left, right) => left.completedAt.localeCompare(right.completedAt)),
    };
  });
}

// The machine's own real runs become one roster entry.
function localStudent() {
  const history = loadAttemptHistory();
  if (history.length === 0) return null;
  const runs = history.map((snapshot) => ({
    id: `local-${snapshot.completedAt}`,
    studentId: "local",
    completedAt: snapshot.completedAt,
    overallScore: snapshot.result.overallScore,
    grade: snapshot.result.grade,
    dimensions: snapshot.result.dimensions.map((dimension) => ({
      key: dimension.key,
      name: dimension.name,
      short: dimension.short,
      score: dimension.score,
    })),
    answeredCount: snapshot.result.answeredCount,
    totalQuestions: snapshot.result.totalQuestions,
    source: "local",
    bankVersion: snapshot.questionBankVersion,
    scoringVersion: snapshot.scoringVersion,
  }));
  return {
    id: "local",
    name: "本机学员",
    className: "本机（真实作答）",
    source: "local",
    runs: runs.sort((left, right) => left.completedAt.localeCompare(right.completedAt)),
  };
}

export function buildRoster() {
  const roster = buildDemoCohort();
  const local = localStudent();
  if (local) roster.unshift(local);
  return roster;
}

export function allRuns(roster) {
  return roster.flatMap((student) =>
    student.runs.map((run) => ({ ...run, studentName: student.name, className: student.className })),
  );
}

export { gradeOf };
