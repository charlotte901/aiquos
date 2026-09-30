// 认证端点：/api/auth/register · /api/auth/login · /api/auth/me。
//
// 严格校验在这里收口：所有字段先过 src/auth-validation.js（与前端同一
// 模块），登录带失败限速（按「账号 + 来源 IP」计数，15 分钟窗口内
// 连续 5 次失败锁定 10 分钟）。令牌为 HMAC 签名的无状态串，客户端以
// Authorization: Bearer 携带。
import {
  createAccount,
  issueToken,
  publicProfile,
  verifyLogin,
  verifyToken,
} from "./account-store.js";
import { normalizeAccount } from "../src/auth-validation.js";

export const AUTH_REGISTER_PATH = "/api/auth/register";
export const AUTH_LOGIN_PATH = "/api/auth/login";
export const AUTH_ME_PATH = "/api/auth/me";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
// 注册限速按 IP：机房/校园 NAT 下一个出口 IP 会集中注册整班学员，
// 阈值取「一个班的量」——既容得下真实课堂，也拦得住无脑刷库。
const MAX_REGISTRATIONS = 30;
const attempts = new Map();

/**
 * 真实客户端 IP：cf-connecting-ip 由 Cloudflare 附加、不可伪造，优先；
 * 自建部署只能信 x-forwarded-for 的**最后**一段（最靠近本服务的一跳），
 * 链首是客户端自报的，攻击者可以随意换着刷限速键。dev 中间件无代理头，
 * 归入 "local" —— 同源本机请求按账号维度限速。
 */
function clientIp(request) {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((piece) => piece.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "local";
}

function attemptKey(request, account) {
  return `${clientIp(request)}|${normalizeAccount(account)}`;
}

function lockedRemaining(key) {
  const entry = attempts.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return Math.ceil((entry.lockedUntil - Date.now()) / 60000);
  }
  return 0;
}

function recordFailure(key) {
  const now = Date.now();
  // 上限保护：按键（IP|账号）无界增长会被人为刷出内存膨胀，超限时整体
  // 丢弃过期条目（攻击窗口外的记录本就失效）。
  if (attempts.size > 4096) {
    for (const [entryKey, entry] of attempts) {
      const expired = now - entry.firstAt > WINDOW_MS
        || (entry.lockedUntil && entry.lockedUntil < now);
      if (expired) attempts.delete(entryKey);
    }
  }
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { firstAt: now, count: 1, lockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
  }
}

function clearFailures(key) {
  attempts.delete(key);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readJson(request) {
  try {
    const payload = await request.json();
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export async function handleAuthRegister(request, env) {
  if (request.method !== "POST") return json({ error: "方法不允许" }, 405);
  const payload = await readJson(request);
  if (!payload) return json({ error: "请求体不是合法 JSON" }, 400);
  // 注册也按 IP 限速：无限刷账号会把账号库撑大（信息面与磁盘都是成本）。
  const ipKey = `reg|${clientIp(request)}`;
  const now = Date.now();
  const entry = attempts.get(ipKey);
  if (entry && now - entry.firstAt <= WINDOW_MS) {
    if (entry.count >= MAX_REGISTRATIONS) {
      return json({ error: "注册过于频繁，请稍后再试" }, 429);
    }
    entry.count += 1;
  } else {
    attempts.set(ipKey, { firstAt: now, count: 1, lockedUntil: 0 });
  }
  const result = await createAccount({
    account: payload.account,
    password: payload.password,
    nickname: payload.nickname,
    role: payload.role,
    className: payload.className,
    teacherInviteCode: payload.teacherInviteCode,
    expectedInviteCode: env?.AIQUOS_TEACHER_INVITE_CODE
      ?? (typeof globalThis.process !== "undefined"
        ? globalThis.process.env?.AIQUOS_TEACHER_INVITE_CODE
        : undefined),
  });
  if (result.error) {
    return json({ error: result.error }, result.duplicate ? 409 : 400);
  }
  const token = await issueToken(result.record);
  return json({ token, profile: publicProfile(result.record) }, 201);
}

export async function handleAuthLogin(request) {
  if (request.method !== "POST") return json({ error: "方法不允许" }, 405);
  const payload = await readJson(request);
  if (!payload) return json({ error: "请求体不是合法 JSON" }, 400);
  const account = String(payload.account ?? "");
  const key = attemptKey(request, account);
  const locked = lockedRemaining(key);
  if (locked > 0) {
    return json({ error: `失败次数过多，请约 ${locked} 分钟后再试` }, 429);
  }
  const result = await verifyLogin(account, payload.password);
  if (!result.ok) {
    recordFailure(key);
    return json({ error: "账号或密码不正确" }, 401);
  }
  clearFailures(key);
  const token = await issueToken(result.record);
  return json({ token, profile: publicProfile(result.record) });
}

export async function handleAuthMe(request) {
  if (request.method !== "GET") return json({ error: "方法不允许" }, 405);
  const verified = await verifyToken(bearerToken(request));
  if (!verified) return json({ error: "登录状态已失效，请重新登录" }, 401);
  return json({ profile: publicProfile(verified.record) });
}

export function bearerToken(request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export { verifyToken };
