import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_LOGIN_PATH,
  AUTH_ME_PATH,
  AUTH_REGISTER_PATH,
  bearerToken,
  handleAuthLogin,
  handleAuthMe,
  handleAuthRegister,
} from "../worker/auth.js";
import { setAccountPersistence } from "../worker/account-store.js";
import {
  normalizeAccount,
  validateAccount,
  validateClassName,
  validateNickname,
  validatePassword,
} from "../src/auth-validation.js";

// 每个用例独立内存态（无 fs 持久化），避免跨用例污染。
function freshStore() {
  setAccountPersistence(null);
}

function request(path, { method = "POST", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(new URL(path, "http://127.0.0.1:4377"), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const STRONG = "aiquos2026play";

test("validateAccount accepts CN phones and emails, normalizes case", () => {
  assert.deepEqual(validateAccount(" 13800138000 "), { ok: true, value: "13800138000", kind: "phone" });
  const email = validateAccount(" Student@Example.COM ");
  assert.deepEqual(email, { ok: true, value: "student@example.com", kind: "email" });
  assert.equal(normalizeAccount("Student@Example.com"), "student@example.com");
  assert.equal(validateAccount("12345").ok, false);
  assert.equal(validateAccount("手机号12345678901").ok, false);
  assert.equal(validateAccount("abc@").ok, false);
  assert.equal(validateAccount("").ok, false);
});

test("validatePassword enforces length, letter+digit, whitespace, weak list, account echo", () => {
  assert.equal(validatePassword(STRONG).ok, true);
  assert.equal(validatePassword("12345678").ok, false); // 无字母
  assert.equal(validatePassword("abcdefgh").ok, false); // 无数字
  assert.equal(validatePassword("a1").ok, false); // 太短
  assert.equal(validatePassword("x".repeat(65)).ok, false); // 太长
  assert.equal(validatePassword("abcd 1234").ok, false); // 空白
  assert.equal(validatePassword("Password1").ok, false); // 弱口令表
  assert.equal(validatePassword("13800138000a", "13800138000").ok, false); // 含账号
  assert.equal(validatePassword(STRONG, "13800138000").ok, true);
});

test("validateNickname and validateClassName bound optional profile fields", () => {
  assert.deepEqual(validateNickname("  小智 "), { ok: true, value: "小智" });
  assert.equal(validateNickname("x".repeat(25)).ok, false);
  assert.deepEqual(validateClassName(""), { ok: true, value: "" });
  assert.equal(validateClassName("x".repeat(31)).ok, false);
});

test("register validates strictly, stores a hash (never plaintext), and issues a usable token", async () => {
  freshStore();
  const bad = await handleAuthRegister(request(AUTH_REGISTER_PATH, {
    body: { account: "13800138000", password: "123" },
  }));
  assert.equal(bad.status, 400);

  const response = await handleAuthRegister(request(AUTH_REGISTER_PATH, {
    body: { account: "13800138000", password: STRONG, nickname: "小智", className: "AI 应用 1 班" },
  }), { AIQUOS_TEACHER_INVITE_CODE: undefined });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.match(payload.profile.accountId, /^aiquos\d{6,}$/);
  assert.equal(payload.profile.role, "student");
  assert.equal(payload.profile.className, "AI 应用 1 班");
  assert.ok(payload.token.startsWith("v1."));

  // 令牌可通过 /api/auth/me 换回档案。
  const me = await handleAuthMe(request(AUTH_ME_PATH, { method: "GET", token: payload.token }));
  assert.equal(me.status, 200);
  assert.equal((await me.json()).profile.nickname, "小智");
});

test("duplicate registration is rejected with 409", async () => {
  freshStore();
  const body = { account: "student@example.com", password: STRONG };
  const first = await handleAuthRegister(request(AUTH_REGISTER_PATH, { body }));
  assert.equal(first.status, 201);
  const second = await handleAuthRegister(request(AUTH_REGISTER_PATH, { body }));
  assert.equal(second.status, 409);
});

test("teacher registration no longer requires an invite code", async () => {
  // 邀请码机制已按产品要求移除：教师账号与学员同一注册口，直接可注册。
  // 旧字段 teacherInviteCode 即使被带上也被忽略（不校验、不影响结果）。
  freshStore();
  const plain = await handleAuthRegister(request(AUTH_REGISTER_PATH, {
    body: { account: "teacher@example.com", password: STRONG, role: "teacher" },
  }));
  assert.equal(plain.status, 201);
  assert.equal((await plain.json()).profile.role, "teacher");

  const legacy = await handleAuthRegister(request(AUTH_REGISTER_PATH, {
    body: { account: "teacher2@example.com", password: STRONG, role: "teacher", teacherInviteCode: "whatever" },
  }));
  assert.equal(legacy.status, 201);
});

test("login rejects wrong credentials with one uniform message", async () => {
  freshStore();
  await handleAuthRegister(request(AUTH_REGISTER_PATH, {
    body: { account: "13800138000", password: STRONG },
  }));
  const wrong = await handleAuthLogin(request(AUTH_LOGIN_PATH, {
    body: { account: "13800138000", password: "wrongpass1" },
  }));
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error, "账号或密码不正确");

  const missing = await handleAuthLogin(request(AUTH_LOGIN_PATH, {
    body: { account: "13900139000", password: "whatever1" },
  }));
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error, "账号或密码不正确");

  const ok = await handleAuthLogin(request(AUTH_LOGIN_PATH, {
    body: { account: "13800138000", password: STRONG },
  }));
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).token.startsWith("v1."));
});

test("repeated failures lock the account out (429), success resets the counter", async () => {
  freshStore();
  await handleAuthRegister(request(AUTH_REGISTER_PATH, {
    body: { account: "13800138000", password: STRONG },
  }));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await handleAuthLogin(request(AUTH_LOGIN_PATH, {
      body: { account: "13800138000", password: "badpass1" },
    }));
    assert.equal(response.status, 401);
  }
  const locked = await handleAuthLogin(request(AUTH_LOGIN_PATH, {
    body: { account: "13800138000", password: STRONG },
  }));
  assert.equal(locked.status, 429);
  assert.match((await locked.json()).error, /分钟/);
});

test("tampered, malformed and expired tokens are all rejected", async () => {
  freshStore();
  const register = await handleAuthRegister(request(AUTH_REGISTER_PATH, {
    body: { account: "13800138000", password: STRONG },
  }));
  const token = (await register.json()).token;

  assert.equal(bearerToken(request(AUTH_ME_PATH, { method: "GET", token })), token);

  const tampered = await handleAuthMe(request(AUTH_ME_PATH, {
    method: "GET",
    token: `${token.slice(0, -3)}xyz`,
  }));
  assert.equal(tampered.status, 401);

  const garbage = await handleAuthMe(request(AUTH_ME_PATH, { method: "GET", token: "v1.not.a-token" }));
  assert.equal(garbage.status, 401);

  const none = await handleAuthMe(request(AUTH_ME_PATH, { method: "GET" }));
  assert.equal(none.status, 401);
});

test("register and me reject wrong methods; login body must be JSON", async () => {
  freshStore();
  const wrongMethod = await handleAuthRegister(request(AUTH_REGISTER_PATH, { method: "PUT" }));
  assert.equal(wrongMethod.status, 405);
  const badBody = new Request(new URL(AUTH_LOGIN_PATH, "http://127.0.0.1:4377"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  const rejected = await handleAuthLogin(badBody);
  assert.equal(rejected.status, 400);
});
