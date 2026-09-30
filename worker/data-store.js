// 学生端 ↔ 教师端共享数据存储：学员档案、测评完成记录（runs）、组卷推送
// （assignments）。学生端在完成综合测评时上报 run；教师端的数据概览/
// 学员管理/测评记录/组卷中心全部从这里读。
//
// 入站数据一律净化（分数夹紧、维度键白名单、字符串限长、NaN 丢弃），
// 与 worker 会话证据的净化先例一致——教师端渲染的每个数字都可追溯。
//
// 持久化与 bank-store / account-store 同一模式：dev 中间件注入 fs 适配器
// （worker/aiquos-shared-data.json，gitignored）；未注入的部署 worker 保留
// 模块内存态（per-isolate）。
import { DIMENSIONS } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { normalizeEdition } from "../src/bank-editions.js";
import { listStudentRecords } from "./account-store.js";

const DIM_KEYS = new Set(DIMENSIONS.map((dimension) => dimension.key));
const STRING_MAX = 120;
const MAX_RUNS = 5000;
const MAX_ASSIGNMENTS = 500;

let persistence = null;
let state = null;

export function setSharedDataPersistence(next) {
  persistence = next;
  state = null;
}

function emptyState() {
  return { students: {}, runs: [], assignments: [], counter: 0 };
}

function persist() {
  if (persistence) persistence.save(JSON.stringify(state, null, 2));
}

function loadState() {
  if (state) return state;
  state = emptyState();
  if (persistence) {
    try {
      const raw = persistence.load();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (parsed.students && typeof parsed.students === "object") state.students = parsed.students;
          if (Array.isArray(parsed.runs)) state.runs = parsed.runs;
          if (Array.isArray(parsed.assignments)) state.assignments = parsed.assignments;
          if (Number.isFinite(parsed.counter)) state.counter = parsed.counter;
        }
      }
    } catch {
      // 损坏文件按空库处理。
    }
  }
  return state;
}

function nextId(prefix) {
  const current = loadState();
  current.counter += 1;
  return `${prefix}-${current.counter}`;
}

function cleanString(value, max = STRING_MAX) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function cleanScore(value) {
  // null/undefined/空串必须保持「无数据」：Number(null)===0 会把缺分静默
  // 存成 0 分（对话/实操通道缺分是常态），先挡空再谈数值。
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

function cleanCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(999, Math.round(numeric)));
}

function cleanGrade(value) {
  return ["S", "A", "B", "C", "D"].includes(value) ? value : null;
}

function cleanDimensions(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Map();
  for (const item of input) {
    if (!item || typeof item !== "object" || !DIM_KEYS.has(item.key)) continue;
    const score = cleanScore(item.score);
    if (score === null) continue;
    seen.set(item.key, {
      key: item.key,
      name: cleanString(item.name, 24),
      short: cleanString(item.short, 8),
      score,
    });
  }
  return [...seen.values()];
}

/** 学生档案从令牌档案 upsert（昵称/班级以最近一次上报为准）。 */
export function upsertStudent(profile) {
  const current = loadState();
  const existing = current.students[profile.accountId];
  const now = new Date().toISOString();
  const record = {
    accountId: profile.accountId,
    account: existing?.account ?? profile.account ?? "",
    nickname: cleanString(profile.nickname, 24) || existing?.nickname || "学员",
    role: profile.role === "teacher" ? "teacher" : "student",
    className: cleanString(profile.className, 30) || existing?.className || "",
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastActiveAt: now,
  };
  current.students[profile.accountId] = record;
  return record;
}

/**
 * 已知学员 = 账号库里注册的学员 ∪ 上报/访问过数据端点的学员。
 * 只用后者会把「注册后还没作答」的学员漏掉——教师组卷时无法指定他们。
 */
function allKnownStudents() {
  const merged = new Map();
  for (const record of listStudentRecords()) {
    merged.set(record.accountId, {
      accountId: record.accountId,
      account: record.account,
      nickname: record.nickname,
      className: record.className,
      firstSeenAt: null,
      lastActiveAt: null,
      source: "registered",
    });
  }
  for (const student of Object.values(loadState().students)) {
    if (student.role === "student") merged.set(student.accountId, student);
  }
  return [...merged.values()];
}

/**
 * 学生上报一次完成的综合测评。净化的字段缺失关键数据（总分/完成时间）
 * 时拒绝。同一次完成（accountId + completedAt + assessmentId）重复上报
 * 为幂等替换，防抖防重复。
 */
export function reportRun(profile, payload) {
  if (!payload || typeof payload !== "object") return { error: "请求体不是合法对象" };
  const completedAt = cleanString(payload.completedAt, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(completedAt)) return { error: "completedAt 不是合法时间戳" };
  const overallScore = cleanScore(payload.overallScore);
  if (overallScore === null) return { error: "overallScore 缺失或非法" };
  const dimensions = cleanDimensions(payload.dimensions);
  if (dimensions.length === 0) return { error: "dimensions 缺失或无合法维度" };

  const student = upsertStudent(profile);
  const assessmentId = cleanString(payload.assessmentId, 40) || "comprehensive";
  const run = {
    id: nextId("run"),
    accountId: student.accountId,
    studentName: student.nickname,
    className: student.className,
    assessmentId,
    assignmentId: cleanString(payload.assignmentId, 40) || null,
    startedAt: cleanString(payload.startedAt, 40) || null,
    completedAt,
    overallScore,
    grade: cleanGrade(payload.grade),
    dimensions,
    answeredCount: cleanCount(payload.answeredCount),
    totalQuestions: cleanCount(payload.totalQuestions),
    bankVersion: cleanString(payload.bankVersion, 40) || null,
    scoringVersion: cleanString(payload.scoringVersion, 40) || null,
    weightingVersion: cleanString(payload.weightingVersion, 40) || null,
    channels: payload.channels && typeof payload.channels === "object"
      ? {
        objective: cleanScore(payload.channels.objective),
        interview: cleanScore(payload.channels.interview),
        practical: cleanScore(payload.channels.practical),
      }
      : null,
    reportedAt: new Date().toISOString(),
  };

  const current = loadState();
  const duplicate = current.runs.find((item) =>
    item.accountId === run.accountId
    && item.completedAt === run.completedAt
    && item.assessmentId === run.assessmentId);
  if (duplicate) {
    // 幂等：同一次完成重复上报时原位替换，不产生第二条记录。
    Object.assign(duplicate, run, { id: duplicate.id });
  } else {
    current.runs.push(run);
    if (current.runs.length > MAX_RUNS) {
      current.runs = current.runs.slice(-MAX_RUNS);
    }
  }
  persist();
  return { run: duplicate ?? run };
}

function assignmentMatches(assignment, student) {
  if (assignment.status === "closed") return false;
  if (assignment.scope.all) return true;
  if (student.className && assignment.scope.classNames.includes(student.className)) return true;
  return assignment.scope.studentIds.includes(student.accountId);
}

/** 学生可见的推送（含自己的完成情况）。 */
export function listAssignmentsFor(profile) {
  const current = loadState();
  const student = upsertStudent(profile);
  return current.assignments
    .filter((assignment) => assignmentMatches(assignment, student))
    .map((assignment) => {
      const myRun = current.runs.find((run) =>
        run.assignmentId === assignment.id && run.accountId === student.accountId) ?? null;
      return {
        ...assignment,
        createdBy: assignment.createdByName,
        myRun: myRun
          ? { completedAt: myRun.completedAt, overallScore: myRun.overallScore, grade: myRun.grade }
          : null,
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function cleanScope(input, knownStudents) {
  const scope = { all: false, classNames: [], studentIds: [] };
  if (!input || typeof input !== "object") return scope;
  if (input.all === true) return { all: true, classNames: [], studentIds: [] };
  if (Array.isArray(input.classNames)) {
    scope.classNames = [...new Set(input.classNames.map((name) => cleanString(name, 30)).filter(Boolean))];
  }
  if (Array.isArray(input.studentIds)) {
    const valid = new Set(knownStudents.map((student) => student.accountId));
    scope.studentIds = [...new Set(input.studentIds
      .map((id) => cleanString(id, 40))
      .filter((id) => valid.has(id)))];
  }
  return scope;
}

/** 教师创建组卷推送。 */
export function createAssignment(teacherProfile, payload) {
  if (!payload || typeof payload !== "object") return { error: "请求体不是合法对象" };
  const title = cleanString(payload.title, 60);
  if (!title) return { error: "请填写试卷标题" };
  const current = loadState();
  const scope = cleanScope(payload.scope, allKnownStudents());
  if (!scope.all && scope.classNames.length === 0 && scope.studentIds.length === 0) {
    return { error: "请至少选择一个班级或学员" };
  }
  const edition = normalizeEdition(payload.edition);
  const dueAt = cleanString(payload.dueAt, 40);
  const assignment = {
    id: nextId("asg"),
    title,
    note: cleanString(payload.note, 300),
    edition,
    dueAt: /^\d{4}-\d{2}-\d{2}/.test(dueAt) ? dueAt : null,
    scope,
    status: "active",
    createdByName: cleanString(teacherProfile.nickname, 24) || "教师",
    createdByAccountId: teacherProfile.accountId,
    createdAt: new Date().toISOString(),
  };
  current.assignments.unshift(assignment);
  if (current.assignments.length > MAX_ASSIGNMENTS) {
    current.assignments = current.assignments.slice(0, MAX_ASSIGNMENTS);
  }
  persist();
  return { assignment };
}

/** 教师侧列表：附每个推送的完成统计与逐人完成明细。 */
export function listAssignmentsForTeacher() {
  const current = loadState();
  const students = allKnownStudents();
  return current.assignments.map((assignment) => {
    const targeted = students.filter((student) => matchesIgnoringStatus(assignment, student));
    const runsOf = (accountId) => current.runs.find((run) =>
      run.assignmentId === assignment.id && run.accountId === accountId) ?? null;
    const rows = targeted.map((student) => {
      const run = runsOf(student.accountId);
      return {
        accountId: student.accountId,
        nickname: student.nickname,
        className: student.className,
        completed: Boolean(run),
        completedAt: run?.completedAt ?? null,
        overallScore: run?.overallScore ?? null,
        grade: run?.grade ?? null,
      };
    });
    const done = rows.filter((row) => row.completed);
    const scores = done.map((row) => row.overallScore).filter((score) => score !== null);
    return {
      ...assignment,
      targetedCount: rows.length,
      completedCount: done.length,
      averageScore: scores.length > 0
        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
        : null,
      roster: rows,
    };
  });
}

function matchesIgnoringStatus(assignment, student) {
  if (assignment.scope.all) return true;
  if (student.className && assignment.scope.classNames.includes(student.className)) return true;
  return assignment.scope.studentIds.includes(student.accountId);
}

/** 教师 开启/关闭 自己下发的推送（只允许属主操作，避免多教师互相干扰）。 */
export function closeAssignment(teacherProfile, assignmentId) {
  const current = loadState();
  const assignment = current.assignments.find((item) => cleanString(assignmentId, 40) === item.id);
  if (!assignment) return { error: "推送不存在" };
  if (assignment.createdByAccountId !== teacherProfile.accountId) {
    return { error: "只能管理自己下发的试卷", forbidden: true };
  }
  assignment.status = assignment.status === "closed" ? "active" : "closed";
  persist();
  return { assignment };
}

/** 学生本人的档案 + 记录 + 班级统计。 */
export function studentSummary(profile) {
  const current = loadState();
  const student = upsertStudent(profile);
  const runs = current.runs
    .filter((run) => run.accountId === student.accountId)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  let classStats = null;
  if (student.className) {
    const classmates = allKnownStudents().filter((item) => item.className === student.className);
    // 班级排名口径：每位学员的「最近一次完成记录」（含作业与自主测评）。
    const latestByStudent = new Map();
    for (const run of [...current.runs].sort((left, right) => left.completedAt.localeCompare(right.completedAt))) {
      latestByStudent.set(run.accountId, run);
    }
    const latest = classmates
      .map((mate) => latestByStudent.get(mate.accountId))
      .filter(Boolean);
    const myLatest = latestByStudent.get(student.accountId) ?? null;
    const scores = latest.map((run) => run.overallScore);
    classStats = {
      className: student.className,
      studentCount: classmates.length,
      classAverage: scores.length > 0
        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
        : null,
      myRank: myLatest
        ? scores.filter((score) => score > myLatest.overallScore).length + 1
        : null,
    };
  }
  return { student, runs, classStats };
}

/** 教师侧原始数据：学员 + 全部 run（管理端自行聚合渲染）。 */
export function teacherData() {
  const current = loadState();
  const students = allKnownStudents().map((student) => ({
    accountId: student.accountId,
    account: student.account ?? "",
    nickname: student.nickname,
    className: student.className || "",
    firstSeenAt: student.firstSeenAt,
    lastActiveAt: student.lastActiveAt,
  }));
  return {
    students,
    runs: current.runs.map((run) => ({ ...run })),
    classes: [...new Set(students.filter((student) => student.className).map((student) => student.className))],
    assignments: listAssignmentsForTeacher(),
  };
}

export function storeStats() {
  const current = loadState();
  return {
    persistent: Boolean(persistence),
    studentCount: allKnownStudents().length,
    runCount: current.runs.length,
    assignmentCount: current.assignments.length,
  };
}


