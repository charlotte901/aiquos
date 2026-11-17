import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapInitialCohort } from "../worker/initial-cohort.js";
import { setAccountPersistence, verifyLogin } from "../worker/account-store.js";
import { setSharedDataPersistence, teacherData, studentSummary } from "../worker/data-store.js";
import { filePersistence } from "../worker/file-persistence.js";

const fixture = fileURLToPath(new URL("../worker/initial-cohort.json", import.meta.url));
test("源码初始数据不包含签名密钥或其他注册账号", () => {
  const data = JSON.parse(readFileSync(fixture, "utf8"));
  assert.equal(data.secret, undefined);
  assert.equal(data.accounts.length, 121);
  assert.equal(data.accounts.filter((item) => item.role === "teacher").length, 1);
  assert.equal(data.data.classes.length, 3);
  assert.equal(data.data.runs.length, 848);
  assert.ok(data.accounts.every((item) => item.account === "virtual.teacher1@aiquos.local" || /^practice\.[a-f0-9]+\.\d{2}@aiquos\.local$/.test(item.account) || /^v[12]\.student\d{2}@aiquos\.local$/.test(item.account)));
  assert.ok(data.accounts.every((item) => item.hash && item.salt && !item.password && !item.token));
});

test("新机器首次启动即有一教师三班，重启不覆盖新注册账号", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aiquos-source-share-"));
  const accounts = join(dir, "accounts.json"), shared = join(dir, "data.json");
  assert.equal(bootstrapInitialCohort(accounts, shared, fixture), true);
  setAccountPersistence(filePersistence(accounts)); setSharedDataPersistence(filePersistence(shared));
  const teacher = await verifyLogin("virtual.teacher1@aiquos.local", "Teacher2026Demo");
  assert.equal(teacher.ok, true);
  assert.equal(teacherData(teacher.record).students.length, 120);
  assert.equal(teacherData(teacher.record).runs.length, 848);
  const student = await verifyLogin("v2.student01@aiquos.local", "Student2026Demo");
  assert.equal(student.ok, true);
  assert.equal(studentSummary(student.record).classStats.studentCount, 40);
  const practice = await verifyLogin("practice.d69688.01@aiquos.local", "Student2026Demo");
  assert.equal(practice.ok, true);
  const overview = teacherData(teacher.record);
  assert.equal(overview.assignments.filter(a => a.scope.classNames?.includes("AI 应用实践班 D69688")).length, 9);
  assert.equal(overview.runs.filter(r => r.className === "AI 应用实践班 D69688").length, 528);
  assert.ok(overview.runs.filter(r => r.className === "AI 应用实践班 D69688").every(r => r.simulated));
  const before = readFileSync(accounts, "utf8");
  assert.equal(bootstrapInitialCohort(accounts, shared, fixture), false);
  assert.equal(readFileSync(accounts, "utf8"), before);
  const secondDir = mkdtempSync(join(tmpdir(), "aiquos-source-secret-"));
  bootstrapInitialCohort(join(secondDir, "accounts.json"), join(secondDir, "data.json"), fixture);
  assert.notEqual(JSON.parse(before).secret, JSON.parse(readFileSync(join(secondDir, "accounts.json"), "utf8")).secret);
  setAccountPersistence(null); setSharedDataPersistence(null);
});

test("已有账号库但缺少班级库时禁止重新初始化覆盖", () => {
  const dir = mkdtempSync(join(tmpdir(), "aiquos-incomplete-"));
  const accounts = join(dir, "accounts.json");
  writeFileSync(accounts, '{"existing":true}');
  assert.throws(() => bootstrapInitialCohort(accounts, join(dir, "data.json"), fixture), /恢复缺失/);
  assert.equal(readFileSync(accounts, "utf8"), '{"existing":true}');
});


test("initial cohort export retains the new practice class rather than reverting the seed to two classes", async () => {
  const { exportInitialCohort } = await import("../scripts/export-initial-cohort.mjs");
  const { pathToFileURL } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "aiquos-cohort-export-"));
  mkdirSync(join(dir, "worker")); mkdirSync(join(dir, "docs"));
  bootstrapInitialCohort(join(dir, "worker/auth-accounts.json"), join(dir, "worker/aiquos-shared-data.json"), fixture);
  const counts = exportInitialCohort(pathToFileURL(dir + "/"));
  assert.deepEqual(counts, { accounts: 121, classes: 3, runs: 848 });
  const exported = JSON.parse(readFileSync(join(dir, "worker/initial-cohort.json"), "utf8"));
  assert.equal(exported.data.assignments.length, 11);
  assert.ok(exported.data.classes.some(item => item.code === "AIPD69688"));
});
