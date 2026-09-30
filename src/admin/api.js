// Admin API client. All calls go to the same-origin worker endpoints.
// 教师端自带独立会话（aiquos.admin-auth.v1）：登录走 /api/auth/login 且
// 仅接受 teacher 角色；数据读写全部携带 Bearer 令牌。
const ADMIN_SESSION_KEY = "aiquos.admin-auth.v1";

function readAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeAdminSession(session) {
  try {
    if (session) localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    /* 会话仅本次可用 */
  }
}

export function readAdminProfile() {
  return readAdminSession()?.profile ?? null;
}

async function errorMessage(response, fallback) {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error || fallback);
}

export async function adminLogin(account, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
  if (!response.ok) throw await errorMessage(response, `登录失败（${response.status}）`);
  const payload = await response.json();
  if (payload.profile?.role !== "teacher") {
    throw new Error("该账号是学生账号，请使用教师账号登录管理端");
  }
  writeAdminSession({ token: payload.token, profile: payload.profile });
  return payload.profile;
}

export async function adminRegisterTeacher({ account, password, nickname, inviteCode }) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account,
      password,
      nickname,
      role: "teacher",
      teacherInviteCode: inviteCode,
    }),
  });
  if (!response.ok) throw await errorMessage(response, `注册失败（${response.status}）`);
  const payload = await response.json();
  writeAdminSession({ token: payload.token, profile: payload.profile });
  return payload.profile;
}

/** 会话恢复探针：401 清会话返回 null，其他错误原样抛出。 */
export async function adminMe() {
  const session = readAdminSession();
  if (!session) return null;
  const response = await fetch("/api/auth/me", {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (response.status === 401) {
    writeAdminSession(null);
    return null;
  }
  if (!response.ok) throw await errorMessage(response, `会话校验失败（${response.status}）`);
  const payload = await response.json();
  if (payload.profile?.role !== "teacher") {
    writeAdminSession(null);
    return null;
  }
  writeAdminSession({ token: session.token, profile: payload.profile });
  return payload.profile;
}

export function adminLogout() {
  writeAdminSession(null);
}

async function authedFetch(path, init = {}) {
  const session = readAdminSession();
  if (!session) throw new Error("登录状态已失效，请重新登录");
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${session.token}`,
    },
  });
  if (response.status === 401) {
    writeAdminSession(null);
    throw new Error("登录状态已失效，请重新登录");
  }
  if (!response.ok) throw await errorMessage(response, `请求失败（${response.status}）`);
  return response.json();
}

/** 教师端全量数据：学员 / 测评记录 / 班级 / 推送作业。 */
export function fetchTeacherData() {
  return authedFetch("/api/data/teacher/overview");
}

export function createAssignment(payload) {
  return authedFetch("/api/data/assignments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function toggleAssignmentStatus(id) {
  return authedFetch("/api/data/assignment-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

export async function fetchBank() {
  const response = await fetch("/api/admin/bank");
  if (!response.ok) throw new Error(`题库读取失败（${response.status}）`);
  return response.json();
}

export async function saveBank(questions) {
  const session = readAdminSession();
  if (!session) throw new Error("登录状态已失效，请重新登录");
  const response = await fetch("/api/admin/bank", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ questions }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? `保存失败（${response.status}）`);
  return payload;
}

export async function resetBankToBundled() {
  const session = readAdminSession();
  if (!session) throw new Error("登录状态已失效，请重新登录");
  const response = await fetch("/api/admin/bank", {
    method: "DELETE",
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (!response.ok) throw new Error(`恢复失败（${response.status}）`);
  return response.json();
}
