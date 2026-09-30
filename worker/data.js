// 数据互通端点（全部需要 Bearer 令牌）：
//   POST /api/data/runs             学生上报一次完成的综合测评
//   GET  /api/data/me               学生本人的记录 + 班级统计
//   GET  /api/data/assignments      学生收到的教师推送
//   POST /api/data/assignments      教师创建组卷推送（组卷中心）
//   POST /api/data/assignment-status 教师开启/关闭一个推送
//   GET  /api/data/teacher/overview 教师端全量数据（学员/记录/班级/推送）
//
// 角色约束：teacher/* 与创建/关闭推送仅教师；runs/me/assignments 对学生
// 与教师都开放（教师也可以自测）。
import { bearerToken, verifyToken } from "./auth.js";
import {
  closeAssignment,
  createAssignment,
  listAssignmentsFor,
  reportRun,
  storeStats,
  studentSummary,
  teacherData,
} from "./data-store.js";

export const DATA_RUNS_PATH = "/api/data/runs";
export const DATA_ME_PATH = "/api/data/me";
export const DATA_ASSIGNMENTS_PATH = "/api/data/assignments";
export const DATA_ASSIGNMENT_STATUS_PATH = "/api/data/assignment-status";
export const DATA_TEACHER_OVERVIEW_PATH = "/api/data/teacher/overview";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function authenticate(request) {
  const verified = await verifyToken(bearerToken(request));
  if (!verified) return { error: json({ error: "登录状态已失效，请重新登录" }, 401) };
  return { profile: verified.record };
}

async function readJson(request) {
  try {
    const payload = await request.json();
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export async function handleDataRuns(request) {
  if (request.method !== "POST") return json({ error: "方法不允许" }, 405);
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  const payload = await readJson(request);
  const result = reportRun(auth.profile, payload);
  if (result.error) return json({ error: result.error }, 400);
  return json({ run: result.run }, 201);
}

export async function handleDataMe(request) {
  if (request.method !== "GET") return json({ error: "方法不允许" }, 405);
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  return json({ ...studentSummary(auth.profile), store: storeStats() });
}

export async function handleDataAssignments(request) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  if (request.method === "GET") {
    return json({ assignments: listAssignmentsFor(auth.profile) });
  }
  if (request.method === "POST") {
    if (auth.profile.role !== "teacher") {
      return json({ error: "仅教师账号可以下发试卷" }, 403);
    }
    const payload = await readJson(request);
    const result = createAssignment(auth.profile, payload);
    if (result.error) return json({ error: result.error }, 400);
    return json({ assignment: result.assignment }, 201);
  }
  return json({ error: "方法不允许" }, 405);
}

export async function handleDataAssignmentStatus(request) {
  if (request.method !== "POST") return json({ error: "方法不允许" }, 405);
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  if (auth.profile.role !== "teacher") {
    return json({ error: "仅教师账号可以管理推送" }, 403);
  }
  const payload = await readJson(request);
  const result = closeAssignment(auth.profile, payload?.id);
  if (result.error) return json({ error: result.error }, result.forbidden ? 403 : 404);
  return json({ assignment: result.assignment });
}

export async function handleDataTeacherOverview(request) {
  if (request.method !== "GET") return json({ error: "方法不允许" }, 405);
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  if (auth.profile.role !== "teacher") {
    return json({ error: "仅教师账号可以查看整体数据" }, 403);
  }
  return json({ ...teacherData(), store: storeStats() });
}
