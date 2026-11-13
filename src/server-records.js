export function assessmentLabel(id) {
  return { comprehensive: "综合测评", objective: "客观题测评", conversation: "对话式测评", practical: "实操测评" }[id] || "测评";
}

/** 服务端成绩摘要转为报告输入，不补造答题证据或重新计算成绩。 */
export function runReportSnapshot(run) {
  if (!run || !Number.isFinite(run.overallScore) || !Array.isArray(run.dimensions)
    || !run.dimensions.length || !Number.isFinite(Date.parse(run.completedAt))) return null;
  return { assessmentId: run.assessmentId || "comprehensive", startedAt: run.startedAt,
    completedAt: run.completedAt, scoringVersion: run.scoringVersion,
    questionBankVersion: run.bankVersion, channelOveralls: run.channels || null,
    result: { status: "completed", overallScore: run.overallScore, grade: run.grade,
      dimensions: run.dimensions.map((dimension) => ({ ...dimension })),
      answeredCount: run.answeredCount, totalQuestions: run.totalQuestions } };
}

export function latestReportSnapshot(runs, localSnapshot = null) {
  const candidates = (Array.isArray(runs) ? runs : []).map(runReportSnapshot).filter(Boolean);
  if (localSnapshot?.result && Number.isFinite(Date.parse(localSnapshot.completedAt))) candidates.push(localSnapshot);
  // 同一条记录优先保留本机的完整三通道快照（候选数组最后一项）。
  return candidates.reduce((latest, snapshot) => !latest || Date.parse(snapshot.completedAt) >= Date.parse(latest.completedAt)
    ? snapshot : latest, null);
}

export function serverRecordsByDay(runs, localHistory = []) {
  const local = new Set(localHistory.map((item) => `${item.assessmentId || "comprehensive"}:${item.completedAt}`));
  const days = {};
  for (const run of runs) {
    if (local.has(`${run.assessmentId}:${run.completedAt}`)) continue;
    const date = new Date(run.completedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    (days[key] ||= []).push({ id: `server-${run.id}`, type: assessmentLabel(run.assessmentId),
      title: assessmentLabel(run.assessmentId),
      score: `${run.overallScore} 分 · ${run.grade || "—"}`,
      time: date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
      status: "已完成" });
  }
  return days;
}
