import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFile, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BUNDLED_BANK_VERSION,
  getBankState,
  resetBank,
  setBank,
  setBankPersistence,
} from "../worker/bank-store.js";
import { handleAdminBank } from "../worker/admin.js";
import { handleComprehensiveQuestion } from "../worker/comprehensive-quiz.js";
import bundledBank from "../src/comprehensive-questions.json" with { type: "json" };
import { withBankVersion } from "../src/assessment-attempt.js";
import { buildRoster, allRuns, gradeOf } from "../src/admin/cohort.js";
import {
  bankAudit,
  dimensionAverages,
  gradeDistribution,
  overviewKpis,
  weeklyTrend,
} from "../src/admin/stats.js";

const request = (method, body) => handleAdminBank(
  new Request("https://example.com/api/admin/bank", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
);
const postQuestion = (payload) => handleComprehensiveQuestion(
  new Request("https://example.com/api/comprehensive-question", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }),
);

test("the store serves the bundled bank by default and validates overrides", () => {
  resetBank();
  const initial = getBankState();
  assert.equal(initial.bankVersion, BUNDLED_BANK_VERSION);
  assert.equal(initial.source, "bundled");
  assert.equal(initial.questions.length, 120);

  // A broken bank is rejected without touching the current one.
  const broken = structuredClone(bundledBank.questions);
  broken[0].answer = ["Z"];
  assert.throws(() => setBank(broken), /unknown option|答案/i);
  assert.equal(getBankState().bankVersion, BUNDLED_BANK_VERSION);
});

test("saving publishes the next bank version and serving reflects the edit", async () => {
  resetBank();
  const edited = structuredClone(bundledBank.questions);
  edited[0] = { ...edited[0], q: "管理端编辑后的题干：以下哪项是AI与传统软件的本质区别？", difficulty: "high" };

  const saved = await request("PUT", { questions: edited });
  assert.equal(saved.status, 200);
  const state = await saved.json();
  assert.equal(state.source, "override");
  assert.equal(state.bankVersion, "objective-bank-v7-120");
  assert.match(state.updatedAt, /^\d{4}-/);

  // The serving endpoint returns the edited text and the new version.
  const served = await postQuestion({ levelId: edited[0].levelId, stage: 1 });
  const payload = await served.json();
  assert.equal(payload.bankVersion, "objective-bank-v7-120");

  // A second publish bumps again.
  const again = await (await request("PUT", { questions: edited })).json();
  assert.equal(again.bankVersion, "objective-bank-v8-120");

  // Reset returns to the bundled baseline.
  const restored = await (await request("DELETE")).json();
  assert.equal(restored.source, "bundled");
  assert.equal(restored.bankVersion, BUNDLED_BANK_VERSION);
});

test("fs persistence round-trips across store reloads", () => {
  const dir = mkdtempSync(join(tmpdir(), "aiquos-bank-"));
  const file = join(dir, "bank-overrides.json");
  try {
    setBankPersistence({
      load: () => { try { return readFileSync(file, "utf8"); } catch { return null; } },
      save: (raw) => writeFileSync(file, raw),
      clear: () => { try { rmSync(file); } catch { /* already gone */ } },
    });
    const edited = structuredClone(bundledBank.questions);
    edited[5].q = "持久化验证题干";
    const saved = setBank(edited);
    assert.equal(saved.source, "override");
    // Simulate a process restart: drop the in-memory state and reload.
    setBankPersistence({
      load: () => { try { return readFileSync(file, "utf8"); } catch { return null; } },
      save: (raw) => writeFileSync(file, raw),
      clear: () => { try { rmSync(file); } catch { /* already gone */ } },
    });
    const reloaded = getBankState();
    assert.equal(reloaded.bankVersion, saved.bankVersion);
    assert.equal(reloaded.questions[5].q, "持久化验证题干");

    // Corrupt persistence falls back to the bundled bank instead of throwing.
    writeFileSync(file, "{ not json");
    setBankPersistence({
      load: () => readFileSync(file, "utf8"),
      save: () => {},
      clear: () => {},
    });
    const fallback = getBankState();
    assert.equal(fallback.source, "bundled");
    assert.equal(fallback.bankVersion, BUNDLED_BANK_VERSION);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    setBankPersistence(null);
    resetBank();
  }
});

test("in-progress attempts re-label to a published bank version, completed never", () => {
  const attempt = { questionBankVersion: "objective-bank-v6-120" };
  assert.equal(withBankVersion(attempt, "objective-bank-v7-120").questionBankVersion, "objective-bank-v7-120");
  assert.equal(withBankVersion(attempt, "objective-bank-v6-120"), attempt);
  assert.equal(withBankVersion(null, "x"), null);
});

test("the roster is deterministic, labelled, and merges local runs", () => {
  const saved = { localStorage: globalThis.localStorage };
  const backing = new Map();
  globalThis.localStorage = {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: (key) => backing.delete(key),
  };
  try {
    const first = buildRoster();
    const second = buildRoster();
    assert.deepEqual(
      first.map((student) => `${student.name}:${student.runs.map((run) => run.overallScore).join(",")}`),
      second.map((student) => `${student.name}:${student.runs.map((run) => run.overallScore).join(",")}`),
      "cohort must be deterministic",
    );
    assert.equal(first.filter((student) => student.source === "demo").length, 24);
    assert.ok(first.every((student) => student.runs.every((run) => run.grade === gradeOf(run.overallScore))));

    // A real local history joins the roster as its own student.
    const snapshot = {
      assessmentId: "comprehensive",
      startedAt: "2026-09-10T02:00:00.000Z",
      completedAt: "2026-09-10T02:20:00.000Z",
      totalQuestions: 25,
      questionIds: [],
      evidence: [],
      result: {
        scoringVersion: "1.0.0",
        status: "completed",
        answeredCount: 25,
        totalQuestions: 25,
        dimensions: [],
        overallScore: 77,
        grade: "B",
      },
      scoringVersion: "1.0.0",
      questionBankVersion: "objective-bank-v6-120",
    };
    backing.set("aiquos.comprehensive-history.v1", JSON.stringify([snapshot]));
    const withLocal = buildRoster();
    const local = withLocal.find((student) => student.id === "local");
    assert.ok(local, "local student merged");
    assert.equal(local.runs[0].overallScore, 77);
    assert.equal(local.runs[0].source, "local");
    assert.equal(withLocal.length, first.length + 1);
  } finally {
    if (saved.localStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = saved.localStorage;
  }
});

test("stats aggregate correctly on the demo roster", () => {
  const roster = buildRoster();
  const runs = allRuns(roster);

  const kpis = overviewKpis(roster);
  assert.equal(kpis.studentCount, roster.length);
  assert.equal(kpis.runCount, runs.length);
  assert.ok(kpis.averageOverall >= 40 && kpis.averageOverall <= 90);

  const grades = gradeDistribution(roster);
  const gradedTotal = Object.values(grades).reduce((sum, count) => sum + count, 0);
  assert.equal(gradedTotal, runs.length);

  const dims = dimensionAverages(roster);
  assert.equal(dims.length, 6);
  for (const dim of dims) assert.ok(dim.average > 0 && dim.average <= 100);

  const trend = weeklyTrend(roster, new Date("2026-09-19T12:00:00"));
  assert.equal(trend.length, 8);
  assert.equal(trend.reduce((sum, bucket) => sum + bucket.count, 0), runs.length);
});

test("the bank audit flags real imbalance and accepts the shipped bank", () => {
  const audit = bankAudit(bundledBank.questions);
  assert.equal(audit.total, 120);
  assert.deepEqual(audit.warnings, []);

  const lopsided = structuredClone(bundledBank.questions).slice(0, 40);
  const lopsidedAudit = bankAudit(lopsided);
  assert.ok(lopsidedAudit.warnings.length >= 1);
  assert.equal(lopsidedAudit.byDifficulty.low + lopsidedAudit.byDifficulty.medium + lopsidedAudit.byDifficulty.high, 40);
});
