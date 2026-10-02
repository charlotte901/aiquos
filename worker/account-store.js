// 账号存储：注册/登录的后端权威数据。
//
// 密码永不落明文：PBKDF2-SHA256（每账号独立 16 字节盐）派生 256 位
// 哈希后存储。会话令牌为无状态 HMAC-SHA256 签名串（服务端密钥随数据
// 文件持久化，首次启动随机生成）——worker 与 Node dev 中间件都能用
// globalThis.crypto.subtle，两环境同一实现。
//
// 持久化与 bank-store 同一模式：vite dev 中间件注入 fs 适配器
// （worker/auth-accounts.json，gitignored）；未注入的部署 worker 保留
// 模块内存态（per-isolate），persistent: false。
import {
  normalizeAccount,
  validateAccount,
  validateClassName,
  validateNickname,
  validatePassword,
  validateRole,
} from "../src/auth-validation.js";

const PBKDF2_ITERATIONS = 100_000;
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;
const ACCOUNT_ID_PATTERN = /^aiquos\d{6,}$/;

const encoder = new TextEncoder();

function b64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function hashPassword(password, saltBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return b64url(bits);
}

let persistence = null;
let state = null;

export function setAccountPersistence(next) {
  persistence = next;
  state = null;
}

function serialize() {
  return JSON.stringify(
    {
      secret: state.secret,
      accounts: [...state.accounts.values()],
    },
    null,
    2,
  );
}

function persist() {
  if (persistence) persistence.save(serialize());
}

function emptyState() {
  return { secret: b64url(randomBytes(32)), accounts: new Map() };
}

function loadState() {
  if (state) return state;
  state = emptyState();
  if (persistence) {
    try {
      const raw = persistence.load();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.secret === "string" && parsed.secret.length >= 32
          && Array.isArray(parsed.accounts)) {
          state.secret = parsed.secret;
          for (const record of parsed.accounts) {
            if (record && typeof record.account === "string" && typeof record.accountId === "string") {
              state.accounts.set(record.account, record);
            }
          }
        }
      }
    } catch {
      // 损坏的文件按空库处理：注册照常可用，旧数据不复活。
    }
  }
  persist();
  return state;
}

function generateAccountId(existing) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = `aiquos${String(1 + Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `aiquos${Date.now()}`;
}

export function publicProfile(record) {
  return {
    accountId: record.accountId,
    account: record.account,
    nickname: record.nickname,
    role: record.role,
    className: record.className ?? "",
    createdAt: record.createdAt,
  };
}

/** 注册：全部入参走严格校验；账号已存在返回 null（由调用方决定 409）。 */
export async function createAccount({ account, password, nickname, role, className }) {
  const accountCheck = validateAccount(account);
  if (!accountCheck.ok) return { error: accountCheck.error };
  const passwordCheck = validatePassword(password, account);
  if (!passwordCheck.ok) return { error: passwordCheck.error };
  const nicknameCheck = validateNickname(nickname);
  if (!nicknameCheck.ok) return { error: nicknameCheck.error };
  const classCheck = validateClassName(className);
  if (!classCheck.ok) return { error: classCheck.error };
  const roleCheck = validateRole(role);
  if (!roleCheck.ok) return { error: roleCheck.error };

  const normalized = normalizeAccount(account);
  const current = loadState();
  if (current.accounts.has(normalized)) {
    return { error: "该账号已注册，请直接登录", duplicate: true };
  }
  // TOCTOU 防护：has() 与 set() 之间隔着 await PBKDF2（约几十毫秒），
  // 同账号并发注册会双双通过检查、后者覆盖前者的密码。先同步占位，
  // 哈希失败再回滚。
  const placeholder = { accountId: "__pending__", account: normalized, pending: true };
  current.accounts.set(normalized, placeholder);
  try {
    const salt = b64url(randomBytes(16));
    const record = {
      accountId: generateAccountId(new Set(current.accounts.values().map((item) => item.accountId))),
      account: normalized,
      nickname: nicknameCheck.value || (roleCheck.value === "teacher" ? "教师" : "学员"),
      role: roleCheck.value,
      className: classCheck.value,
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: await hashPassword(password, fromB64url(salt)),
      createdAt: new Date().toISOString(),
    };
    current.accounts.set(normalized, record);
    persist();
    return { record };
  } catch (error) {
    if (current.accounts.get(normalized) === placeholder) current.accounts.delete(normalized);
    throw error;
  }
}

/** 改昵称（已登录）：校验复用注册规则；返回 {ok, record} 或 {error}。 */
export function updateNickname(accountId, nickname) {
  const check = validateNickname(nickname);
  if (!check.ok) return { error: check.error };
  const current = loadState();
  const record = findAccountById(accountId);
  if (!record) return { error: "账号不存在" };
  record.nickname = check.value;
  persist();
  return { ok: true, record };
}

/** 改密码（已登录）：验证旧密码 → 新盐重哈希。旧密码错误返回 {error}。 */
export async function updatePassword(accountId, oldPassword, newPassword) {
  const record = findAccountById(accountId);
  if (!record) return { error: "账号不存在" };
  const check = validatePassword(newPassword, record.account);
  if (!check.ok) return { error: check.error };
  const oldHash = await hashPassword(String(oldPassword ?? ""), fromB64url(record.salt));
  let diff = 0;
  const given = oldHash, expected = record.hash;
  if (given.length === expected.length) {
    for (let index = 0; index < given.length; index += 1) diff |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  } else diff = 1;
  if (diff !== 0) return { error: "当前密码不正确" };
  record.salt = b64url(randomBytes(16));
  record.iterations = PBKDF2_ITERATIONS;
  record.hash = await hashPassword(newPassword, fromB64url(record.salt));
  persist();
  return { ok: true, record };
}
/** 登录校验：账号不存在与密码错误返回同一句提示（不泄露注册面）。 */
export async function verifyLogin(account, password) {
  const normalized = normalizeAccount(account);
  const current = loadState();
  const record = current.accounts.get(normalized);
  if (!record || record.pending) {
    // 账号不存在（或注册中途崩溃留下的占位）也走一次完整派生：让「账号
    // 不存在」与「密码错误」耗时一致，避免用时序探测注册面。
    await hashPassword(String(password ?? "aiquos-dummy-salt-probe"), randomBytes(16));
    return { ok: false };
  }
  const hash = await hashPassword(String(password ?? ""), fromB64url(record.salt));
  // 恒定时间比较，避免时序侧信道。
  if (hash.length !== record.hash.length) return { ok: false };
  let diff = 0;
  for (let index = 0; index < hash.length; index += 1) {
    diff |= hash.charCodeAt(index) ^ record.hash.charCodeAt(index);
  }
  return diff === 0 ? { ok: true, record } : { ok: false };
}

async function hmacKey() {
  const current = loadState();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(current.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function issueToken(record) {
  const payload = {
    sub: record.accountId,
    role: record.role,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `v1.${body}.${b64url(signature)}`;
}

/** 校验令牌：通过时返回 payload，任何格式/签名/过期问题都返回 null。 */
export async function verifyToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp < Date.now()) return null;
  const key = await hmacKey();
  const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(parts[1]));
  // 签名段同样可能是任意垃圾字符：base64 解码放进 try，与 body 一致。
  let given;
  try {
    given = fromB64url(parts[2]);
  } catch {
    return null;
  }
  const expectedBytes = new Uint8Array(expected);
  if (given.length !== expectedBytes.length) return null;
  let diff = 0;
  for (let index = 0; index < given.length; index += 1) {
    diff |= given[index] ^ expectedBytes[index];
  }
  if (diff !== 0) return null;
  const record = findAccountById(payload.sub);
  if (!record) return null;
  return { payload, record };
}

export function findAccountById(accountId) {
  const current = loadState();
  for (const record of current.accounts.values()) {
    if (!record.pending && record.accountId === accountId) return record;
  }
  return null;
}

export function findAccountByLogin(account) {
  return loadState().accounts.get(normalizeAccount(account)) ?? null;
}

/** 全部已注册的学员账号（供数据层把「注册即存在」的学员纳入组卷范围）。 */
export function listStudentRecords() {
  const current = loadState();
  return [...current.accounts.values()]
    .filter((record) => record.role === "student" && !record.pending)
    .map((record) => ({
      accountId: record.accountId,
      account: record.account,
      nickname: record.nickname,
      className: record.className ?? "",
    }));
}

export function storeInfo() {
  const current = loadState();
  return {
    persistent: Boolean(persistence),
    accountCount: current.accounts.size,
  };
}
