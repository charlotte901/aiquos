import test from "node:test";
import assert from "node:assert/strict";
import { latestReportSnapshot, runReportSnapshot } from "../src/server-records.js";
import { reportFooter } from "../src/report-pdf.js";
import { reportPromptPayload } from "../src/report-text.js";

const run = (completedAt, score, assessmentId = "comprehensive") => ({ completedAt, overallScore: score,
  assessmentId, grade: "B", answeredCount: 25, totalQuestions: 25, bankVersion: "bank-v1",
  dimensions: [{ key: "D1", score }], channels: { objective: score, interview: 70, practical: 75 } });

test("报告选取最新完成时间，保留服务端总分、六维与通道分，不取平均分", () => {
  const older = run("2026-10-01T01:00:00Z", 65);
  const latest = run("2026-10-03T01:00:00Z", 85, "objective");
  const middle = run("2026-10-02T01:00:00Z", 75);
  const snapshot = latestReportSnapshot([latest, older, middle]);
  assert.equal(snapshot.completedAt, latest.completedAt);
  assert.equal(snapshot.assessmentId, "objective");
  assert.equal(snapshot.result.overallScore, 85);
  assert.deepEqual(snapshot.result.dimensions, latest.dimensions);
  assert.deepEqual(snapshot.channelOveralls, latest.channels);
  assert.equal(snapshot.evidence, undefined);
  assert.equal(snapshot.questionBankVersion, latest.bankVersion);
});

test("同次测评保留本机完整快照，较新的服务器测评会替换旧快照", () => {
  const server = run("2026-10-02T01:00:00Z", 80);
  const local = { ...runReportSnapshot(server), composite: { overallScore: 81 } };
  assert.equal(latestReportSnapshot([server], local), local);
  assert.equal(latestReportSnapshot([run("2026-10-03T01:00:00Z", 90)], local).result.overallScore, 90);
  assert.equal(latestReportSnapshot([], local), local);
  assert.equal(latestReportSnapshot([run("invalid", 100)]), null);
  assert.equal(latestReportSnapshot([]), null);
});

test("单独通道报告页脚使用对应测评类型，不宣称三通道", () => {
  const text = reportFooter({ assessmentId: "objective" }).text;
  assert.match(text, /客观题测评/);
  assert.doesNotMatch(text, /三通道/);
  assert.match(reportFooter({ assessmentId: "comprehensive" }).text, /三通道/);
});

test("报告撰写不把缺失通道编造成零分", () => {
  const payload = reportPromptPayload({ assessmentId: "objective", channelOveralls: { objective: 83, interview: null } }, {});
  assert.equal(payload.assessmentType, "客观题测评");
  assert.deepEqual(payload.channelOveralls, { 客观题: 83, 对话采访: null, 实操工作台: null });
});
