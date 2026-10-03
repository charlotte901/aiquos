/**
 * 学生端认证客户端：会话持久化（localStorage aiquos.auth.v1，只存令牌与
 * 公开档案，绝不存密码）+ 登录/注册/档案 API + 带 Authorization 的 fetch。
 *
 * 严格校验的口径在 src/auth-validation.js（与 worker 同一模块）；这里只
 * 负责传输与会话状态。
 */
import { migrateLegacyDataForAccount } from "./account-scope.js";

const SESSION_KEY = "aiquos.auth.v1";

function inMemory() {
  // 存储不可用时的兜底（与 assessment-attempt 同一策略）。
  let value = null;
  return {
    read: () => value,
    write: (next) => { value = next; },
  };
}

function storage() {
  try {
    const probe = "__aiquos_auth_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return {
      read: () => {
        try {
          const raw = localStorage.getItem(SESSION_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      },
      write: (next) => {
        try {
          if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
          else localStorage.removeItem(SESSION_KEY);
        } catch {
          /* 内存态兜底由外层保证 */
        }
      },
    };
  } catch {
    return inMemory();
  }
}

const store = storage();
let session = store.read();
if (session && typeof session.token !== "string") session = null;

export function readProfile() {
  return session?.profile ?? null;
}

export function saveSession(token, profile) {
  session = { token, profile, savedAt: Date.now() };
  store.write(session);
  return session;
}

export function clearSession() {
  session = null;
  store.write(null);
}

export function authFetch(input, init = {}) {
  if (!session) return Promise.reject(new Error("未登录"));
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${session.token}`,
    },
  });
}

async function parseError(response, fallback) {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error || fallback);
}

export async function apiRegister({ account, password, nickname, className }) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password, nickname, className, role: "student" }),
  });
  if (!response.ok) throw await parseError(response, `注册失败（${response.status}）`);
  const payload = await response.json();
  saveSession(payload.token, payload.profile);
  return payload.profile;
}

export async function apiLogin(account, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
  if (!response.ok) throw await parseError(response, `登录失败（${response.status}）`);
  const payload = await response.json();
  saveSession(payload.token, payload.profile);
  // 登录（非注册）：本设备匿名时期的成果类数据一次性迁入该账号命名空间。
  migrateLegacyDataForAccount();
  return payload.profile;
}

/** 改昵称（已登录）：成功后本地会话的 profile 同步刷新。 */
export async function apiUpdateNickname(nickname) {
  const response = await authFetch("/api/auth/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!response.ok) throw await parseError(response, `昵称保存失败（${response.status}）`);
  const payload = await response.json();
  session = { ...session, profile: payload.profile };
  store.write(session);
  return payload.profile;
}

/** 改密码（已登录）：服务端验旧密码后重哈希。 */
export async function apiChangePassword(oldPassword, newPassword) {
  const response = await authFetch("/api/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (!response.ok) throw await parseError(response, `密码修改失败（${response.status}）`);
  return true;
}
/** 会话有效性探针：401 时清掉本地会话（过期/服务端重启）。 */
export async function apiMe() {
  if (!session) return null;
  const response = await authFetch("/api/auth/me");
  if (response.status === 401) {
    clearSession();
    return null;
  }
  if (!response.ok) throw await parseError(response, `档案读取失败（${response.status}）`);
  const payload = await response.json();
  session = { ...session, profile: payload.profile };
  store.write(session);
  return payload.profile;
}

/** 学生收件箱：老师推送的组卷作业（含自己的完成情况 myRun）。 */
export async function apiListAssignments() {
  const response = await authFetch("/api/data/assignments");
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "作业列表获取失败");
  }
  const payload = await response.json();
  return Array.isArray(payload.assignments) ? payload.assignments : [];
}
