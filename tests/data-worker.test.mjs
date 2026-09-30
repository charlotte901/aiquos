import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_REGISTER_PATH, handleAuthRegister } from "../worker/auth.js";
import {
  DATA_ASSIGNMENTS_PATH,
  DATA_ASSIGNMENT_STATUS_PATH,
  DATA_ME_PATH,
  DATA_RUNS_PATH,
  DATA_TEACHER_OVERVIEW_PATH,
  handleDataAssignments,
  handleDataAssignmentStatus,
  handleDataMe,
  handleDataRuns,
  handleDataTeacherOverview,
} from "../worker/data.js";
import { setAccountPersistence } from "../worker/account-store.js";
import { setSharedDataPersistence } from "../worker/data-store.js";

const PASSWORD = "aiquos2026play";
const BASE = "http://127.0.0.1:4377";

function freshStores() {
  setAccountPersistence(null);
  setSharedDataPersistence(null);
}

function request(path, { method = "POST", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(new URL(path, BASE), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function makeAccount(account, { role = "student", className = "" } = {}, env) {
  const response = await handleAuthRegister(request(AUTH_REGISTER_PATH, {
    body: {
      account,
      password: PASSWORD,
      role,
      className,
      ...(role === "teacher" ? { teacherInviteCode: env?.AIQUOS_TEACHER_INVITE_CODE } : {}),
    },
  }), env);
  assert.equal(response.status, 201, `account ${account} should register`);
  const payload = await response.json();
  return { token: payload.token, profile: payload.profile };
}

const runPayload = (overrides = {}) => ({
  assessmentId: "comprehensive",
  completedAt: new Date("2026-10-01T10:00:00.000Z").toISOString(),
  overallScore: 82,
  grade: "A",
  dimensions: [
    { key: "D1", name: "需求定义", short: "需求", score: 80 },
    { key: "D2", name: "提示构建", short: "提示", score: 84 },
  ],
  answeredCount: 25,
  totalQuestions: 25,
  ...overrides,
});

test("unauthenticated data calls are rejected with 401", async () => {
  freshStores();
  assert.equal((await handleDataRuns(request(DATA_RUNS_PATH, { body: runPayload() }))).status, 401);
  assert.equal((await handleDataMe(request(DATA_ME_PATH, { method: "GET" }))).status, 401);
  assert.equal((await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, { method: "GET" }))).status, 401);
  assert.equal((await handleDataTeacherOverview(request(DATA_TEACHER_OVERVIEW_PATH, { method: "GET" }))).status, 401);
});

test("student run reporting feeds the teacher overview; hostile fields are sanitized", async () => {
  freshStores();
  const student = await makeAccount("13800138000", { className: "AI 应用 1 班" });
  const teacher = await makeAccount("teacher@example.com", { role: "teacher" }, { AIQUOS_TEACHER_INVITE_CODE: "INV" });

  const bad = await handleDataRuns(request(DATA_RUNS_PATH, {
    token: student.token,
    body: runPayload({ overallScore: 9999, grade: "X", completedAt: "not-a-date", dimensions: [{ key: "ZZ", score: 5 }] }),
  }));
  assert.equal(bad.status, 400);

  const hostile = await handleDataRuns(request(DATA_RUNS_PATH, {
    token: student.token,
    body: runPayload({
      overallScore: 9999,
      grade: "X",
      dimensions: [
        { key: "D1", score: 400, name: "x".repeat(500) },
        { key: "HACK", score: 50 },
      ],
      answeredCount: -3,
      bankVersion: "<script>",
    }),
  }));
  assert.equal(hostile.status, 201);
  const stored = (await hostile.json()).run;
  assert.equal(stored.overallScore, 100); // clamped
  assert.equal(stored.grade, null); // not a real grade band
  assert.equal(stored.dimensions.length, 1); // unknown dim key dropped
  assert.equal(stored.dimensions[0].score, 100);
  assert.equal(stored.dimensions[0].name.length <= 24, true);
  assert.equal(stored.answeredCount, 0);
  assert.equal(stored.bankVersion, "<script>"); // 原样保留，渲染端（React）自行转义

  const overview = await handleDataTeacherOverview(request(DATA_TEACHER_OVERVIEW_PATH, {
    method: "GET", token: teacher.token,
  }));
  assert.equal(overview.status, 200);
  const data = await overview.json();
  assert.equal(data.students.length, 1);
  assert.equal(data.students[0].className, "AI 应用 1 班");
  assert.equal(data.runs.length, 1);
  assert.equal(data.runs[0].accountId, student.profile.accountId);
  assert.deepEqual(data.classes, ["AI 应用 1 班"]);
});

test("re-reporting the same completion is idempotent (no duplicate rows)", async () => {
  freshStores();
  const student = await makeAccount("13800138000");
  const payload = runPayload({ overallScore: 70 });
  await handleDataRuns(request(DATA_RUNS_PATH, { token: student.token, body: payload }));
  await handleDataRuns(request(DATA_RUNS_PATH, { token: student.token, body: payload }));
  const me = await handleDataMe(request(DATA_ME_PATH, { method: "GET", token: student.token }));
  const data = await me.json();
  assert.equal(data.runs.length, 1);
});

test("students cannot reach teacher endpoints; teachers can", async () => {
  freshStores();
  const student = await makeAccount("13800138000");
  const teacher = await makeAccount("teacher@example.com", { role: "teacher" }, { AIQUOS_TEACHER_INVITE_CODE: "INV" });

  const forbidden = await handleDataTeacherOverview(request(DATA_TEACHER_OVERVIEW_PATH, {
    method: "GET", token: student.token,
  }));
  assert.equal(forbidden.status, 403);

  const createDenied = await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, {
    token: student.token,
    body: { title: "x" },
  }));
  assert.equal(createDenied.status, 403);

  const ok = await handleDataTeacherOverview(request(DATA_TEACHER_OVERVIEW_PATH, {
    method: "GET", token: teacher.token,
  }));
  assert.equal(ok.status, 200);
});

test("assignment lifecycle: create → student sees it → completion marks it → teacher stats", async () => {
  freshStores();
  const student = await makeAccount("13800138000", { className: "AI 应用 1 班" });
  const teacher = await makeAccount("teacher@example.com", { role: "teacher" }, { AIQUOS_TEACHER_INVITE_CODE: "INV" });

  // Empty scope rejected; class scope accepted.
  assert.equal((await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, {
    token: teacher.token, body: { title: "期中测评" },
  }))).status, 400);

  const created = await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, {
    token: teacher.token,
    body: { title: "期中 AI 综合能力测评", note: "认真作答", edition: "A", scope: { classNames: ["AI 应用 1 班"] } },
  }));
  assert.equal(created.status, 201);
  const assignment = (await created.json()).assignment;
  assert.match(assignment.id, /^asg-/);
  assert.equal(assignment.edition, "A");

  // Student inbox: visible with myRun = null.
  const inbox = await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, { method: "GET", token: student.token }));
  const list = (await inbox.json()).assignments;
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "期中 AI 综合能力测评");
  assert.equal(list[0].myRun, null);
  assert.equal(list[0].edition, "A");

  // Student completes it with an assignment-tagged run.
  const reported = await handleDataRuns(request(DATA_RUNS_PATH, {
    token: student.token,
    body: runPayload({ assignmentId: assignment.id, overallScore: 88, grade: "A" }),
  }));
  assert.equal(reported.status, 201);

  // Inbox now shows completion; teacher stats show 1/1 with average.
  const inboxAfter = (await (await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, {
    method: "GET", token: student.token,
  }))).json()).assignments;
  assert.equal(inboxAfter[0].myRun.overallScore, 88);

  const overview = (await (await handleDataTeacherOverview(request(DATA_TEACHER_OVERVIEW_PATH, {
    method: "GET", token: teacher.token,
  }))).json());
  assert.equal(overview.assignments.length, 1);
  assert.equal(overview.assignments[0].targetedCount, 1);
  assert.equal(overview.assignments[0].completedCount, 1);
  assert.equal(overview.assignments[0].averageScore, 88);
  assert.equal(overview.assignments[0].roster[0].completed, true);

  // Closing hides it from the student inbox; stats keep the roster.
  const closed = await handleDataAssignmentStatus(request(DATA_ASSIGNMENT_STATUS_PATH, {
    token: teacher.token, body: { id: assignment.id },
  }));
  assert.equal((await closed.json()).assignment.status, "closed");
  const inboxClosed = (await (await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, {
    method: "GET", token: student.token,
  }))).json()).assignments;
  assert.equal(inboxClosed.length, 0);
  const overviewAfter = (await (await handleDataTeacherOverview(request(DATA_TEACHER_OVERVIEW_PATH, {
    method: "GET", token: teacher.token,
  }))).json());
  assert.equal(overviewAfter.assignments[0].roster.length, 1);
  assert.equal(overviewAfter.assignments[0].completedCount, 1);
});

test("scope by studentIds only accepts registered students", async () => {
  freshStores();
  const student = await makeAccount("13800138000");
  const teacher = await makeAccount("teacher@example.com", { role: "teacher" }, { AIQUOS_TEACHER_INVITE_CODE: "INV" });

  const withGhost = await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, {
    token: teacher.token,
    body: { title: "定向补测", scope: { studentIds: [student.profile.accountId, "aiquos00000000"] } },
  }));
  const assignment = (await withGhost.json()).assignment;
  assert.deepEqual(assignment.scope.studentIds, [student.profile.accountId]);

  const all = await handleDataAssignments(request(DATA_ASSIGNMENTS_PATH, {
    token: teacher.token,
    body: { title: "全员摸底", scope: { all: true, classNames: ["不应出现"] } },
  }));
  assert.deepEqual((await all.json()).assignment.scope, { all: true, classNames: [], studentIds: [] });
});

test("student summary carries class stats with rank over latest runs", async () => {
  freshStores();
  const classEnv = { className: "AI 应用 1 班" };
  const weak = await makeAccount("13800138000", classEnv);
  const strong = await makeAccount("13800138001", classEnv);
  const loner = await makeAccount("13900139000", { className: "AI 应用 2 班" });

  await handleDataRuns(request(DATA_RUNS_PATH, {
    token: weak.token,
    body: runPayload({ overallScore: 60, grade: "C" }),
  }));
  await handleDataRuns(request(DATA_RUNS_PATH, {
    token: strong.token,
    body: runPayload({ completedAt: new Date("2026-10-01T11:00:00.000Z").toISOString(), overallScore: 90, grade: "S" }),
  }));
  await handleDataRuns(request(DATA_RUNS_PATH, {
    token: loner.token,
    body: runPayload({ overallScore: 75, grade: "B" }),
  }));

  const me = (await (await handleDataMe(request(DATA_ME_PATH, { method: "GET", token: strong.token }))).json());
  assert.equal(me.classStats.className, "AI 应用 1 班");
  assert.equal(me.classStats.studentCount, 2);
  assert.equal(me.classStats.classAverage, 75);
  assert.equal(me.classStats.myRank, 1);

  const weakMe = (await (await handleDataMe(request(DATA_ME_PATH, { method: "GET", token: weak.token }))).json());
  assert.equal(weakMe.classStats.myRank, 2);
});

test("wrong methods rejected on data endpoints", async () => {
  freshStores();
  const teacher = await makeAccount("teacher@example.com", { role: "teacher" }, { AIQUOS_TEACHER_INVITE_CODE: "INV" });
  assert.equal((await handleDataRuns(request(DATA_RUNS_PATH, { method: "GET", token: teacher.token }))).status, 405);
  assert.equal((await handleDataMe(request(DATA_ME_PATH, { method: "POST", token: teacher.token }))).status, 405);
  assert.equal((await handleDataTeacherOverview(request(DATA_TEACHER_OVERVIEW_PATH, { method: "POST", token: teacher.token }))).status, 405);
  assert.equal((await handleDataAssignmentStatus(request(DATA_ASSIGNMENT_STATUS_PATH, { method: "GET", token: teacher.token }))).status, 405);
});
