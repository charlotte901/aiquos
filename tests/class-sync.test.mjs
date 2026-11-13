import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filePersistence } from "../worker/file-persistence.js";
import { setAccountPersistence, createAccount, verifyLogin, findAccountByLogin } from "../worker/account-store.js";
import { setSharedDataPersistence, createClass, changeClass, reportRun, teacherData, studentSummary } from "../worker/data-store.js";
import { serverRecordsByDay } from "../src/server-records.js";
import deployedWorker from "../worker/index.js";

test("班级归属、四通道记录、排名共享，退出和重启后仍一致", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aiquos-classes-"));
  const accountPath = join(dir, "accounts.json"), dataPath = join(dir, "data.json");
  const reload = () => { setAccountPersistence(filePersistence(accountPath)); setSharedDataPersistence(filePersistence(dataPath)); };
  reload();
  const make = async (account, role) => (await createAccount({ account, password: "TestClass2026", role })).record;
  const t1 = await make("t1@class.test", "teacher"), t2 = await make("t2@class.test", "teacher");
  assert.ok(createClass(t1, { name: "甲班", code: "CLASSA" }).class);
  assert.ok(createClass(t2, { name: "乙班", code: "CLASSB" }).class);
  const a = await make("a@class.test", "student"), b = await make("b@class.test", "student");
  changeClass(a, "CLASSA"); changeClass(b, "CLASSB");
  for (const [i, assessmentId] of ["conversation", "objective", "practical", "comprehensive"].entries()) {
    reportRun(a, { assessmentId, simulated: true, completedAt: `2026-10-0${i + 1}T01:00:00.000Z`, overallScore: 70 + i,
      dimensions: [{ key: "D1", score: 70 + i }] });
  }
  assert.equal(teacherData(t1).students.length, 1);
  assert.equal(teacherData(t2).runs.length, 0);
  assert.equal(studentSummary(a).classStats.classAverage, 71.5);
  assert.equal(studentSummary(a).classStats.teacherAccountId, t1.accountId);
  assert.equal(teacherData(t1).runs.length, 4);
  reload();
  assert.equal((await verifyLogin("a@class.test", "TestClass2026")).ok, true);
  const restored = findAccountByLogin("a@class.test");
  assert.equal(studentSummary(restored).runs.length, 4);
  assert.equal(studentSummary(restored).classStats.studentCount, 1);
  changeClass(restored, "CLASSB");
  assert.equal(teacherData(t1).students.length, 0);
  assert.equal(teacherData(t2).students.length, 2);
  assert.equal(teacherData(t2).runs.length, 4);
  changeClass(restored, null);
  reload();
  assert.equal(studentSummary(findAccountByLogin("a@class.test")).classStats, null);
  assert.equal(teacherData(t2).students.length, 1);
  assert.equal((await verifyLogin("a@class.test", "TestClass2026")).ok, true);
  assert.ok(!readFileSync(accountPath, "utf8").includes("TestClass2026"));
});

test("原子文件存储可恢复备份，全部损坏时不会覆盖账号库", () => {
  const dir = mkdtempSync(join(tmpdir(), "aiquos-backup-"));
  const path = join(dir, "store.json"), store = filePersistence(path);
  store.save('{"value":1}'); store.save('{"value":2}');
  writeFileSync(path, "broken");
  assert.deepEqual(JSON.parse(store.load()), { value: 1 });
  writeFileSync(`${path}.bak`, "broken too");
  setAccountPersistence(store);
  assert.throws(() => findAccountByLogin("someone@test.local"), /保护现有账号/);
  assert.equal(readFileSync(path, "utf8"), "broken");
  setAccountPersistence(null); setSharedDataPersistence(null);
});

test("学生日历显示服务器的四种记录并避免本地重复", () => {
  const runs = ["conversation", "objective", "practical", "comprehensive"].map((assessmentId, i) => ({
    id: String(i), assessmentId, completedAt: "2026-10-04T00:00:00.000Z", overallScore: 80, simulated: true,
  }));
  const records = Object.values(serverRecordsByDay(runs)).flat();
  assert.equal(records.length, 4);
  assert.ok(records.every((record) => !record.title.includes("模拟") && record.status === "已完成"));
  assert.equal(Object.values(serverRecordsByDay(runs, [{ completedAt: runs[3].completedAt }])).flat().length, 3);
});

test("未配置持久存储的部署拒绝注册，防止产生重启就丢的账号", async () => {
  setAccountPersistence(null); setSharedDataPersistence(null);
  const response = await deployedWorker.fetch(new Request("https://example.test/api/auth/register", {
    method: "POST", body: JSON.stringify({ account: "new@test.local", password: "TestClass2026" }),
  }), {});
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /持久存储/);
  assert.equal(findAccountByLogin("new@test.local"), null);
});

test("无班级教师不能读取或向他人的班级下发试卷", async () => {
  const { createAssignment } = await import("../worker/data-store.js");
  setAccountPersistence(null); setSharedDataPersistence(null);
  const make = async (account, role) => (await createAccount({ account, password: "TestClass2026", role })).record;
  const owner = await make("owner@scope.test", "teacher"), stranger = await make("stranger@scope.test", "teacher");
  const student = await make("student@scope.test", "student");
  createClass(owner, { name: "独立班级", code: "SCOPE123" });
  changeClass(student, "SCOPE123");
  assert.equal(teacherData(stranger).students.length, 0);
  assert.ok(createAssignment(stranger, { title: "越权推送", scope: { classNames: ["独立班级"] } }).error);
  assert.ok(createAssignment(stranger, { title: "全员越权", scope: { all: true } }).error);
  assert.ok(createAssignment(owner, { title: "班内试卷", scope: { all: true } }).assignment);
  setAccountPersistence(null); setSharedDataPersistence(null);
});
