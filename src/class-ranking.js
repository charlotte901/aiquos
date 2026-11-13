// 班级排名统一口径：每人的全部完成记录先取均分，再按均分降序排名。
export function classRanking(students, runs, myAccountId) {
  const totals = new Map(students.map((student) => [student.accountId, { sum: 0, count: 0 }]));
  for (const run of runs) {
    const total = totals.get(run.accountId);
    if (!total || !Number.isFinite(run.overallScore)) continue;
    total.sum += run.overallScore;
    total.count += 1;
  }
  const averages = new Map([...totals].filter(([, value]) => value.count > 0)
    .map(([id, value]) => [id, Math.round(value.sum / value.count * 100) / 100]));
  const scores = [...averages.values()];
  const myAverage = averages.get(myAccountId) ?? null;
  const scoreBins = Array.from({ length: 10 }, (_, index) => ({ score: index * 10 + 5, people: 0, current: false }));
  for (const score of scores) scoreBins[Math.max(0, Math.min(9, Math.floor(score / 10)))].people += 1;
  if (myAverage !== null) scoreBins[Math.max(0, Math.min(9, Math.floor(myAverage / 10)))].current = true;
  return { studentCount: students.length, completedCount: scores.length, rankedCount: scores.length,
    myAverage, myRank: myAverage === null ? null : scores.filter((score) => score > myAverage).length + 1,
    classAverage: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 100) / 100 : null,
    scoreBins };
}
