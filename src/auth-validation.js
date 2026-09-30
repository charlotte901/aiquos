/**
 * 登录/注册信息校验 —— 学生端表单与管理端网关共用同一套规则，
 * worker（worker/auth.js）也直接 import 本模块，保证前后端校验口径
 * 永远一致：前端校验是为了即时反馈，服务端校验才是权威。
 *
 * 账号：中国大陆手机号或邮箱（二选一），注册后不可更改。
 * 密码：8–64 位，必须同时含字母与数字，不含空白字符，拒绝弱口令。
 */

const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,188}[A-Za-z0-9])?\.[A-Za-z]{2,24}$/;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;
export const NICKNAME_MAX = 24;
export const CLASS_NAME_MAX = 30;

/** 常见弱口令（小写比较）：注册与改密一律拒绝。 */
const WEAK_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "11111111", "00000000",
  "password", "password1", "passw0rd", "qwertyuiop", "1qaz2wsx",
  "abc12345", "abcd1234", "a1234567", "qq123456", "woaini520",
  "111111111", "88888888", "66666666", "123123123", "12121212",
]);

/** 去掉首尾空白；邮箱统一小写（手机号不含字母，大小写无关）。 */
export function normalizeAccount(raw) {
  const value = String(raw ?? "").trim();
  return EMAIL_PATTERN.test(value) ? value.toLowerCase() : value;
}

/** 校验账号：通过时返回 {ok:true, value}，否则 {ok:false, error}。 */
export function validateAccount(raw) {
  const value = normalizeAccount(raw);
  if (!value) return { ok: false, error: "请输入账号" };
  if (PHONE_PATTERN.test(value)) return { ok: true, value, kind: "phone" };
  if (EMAIL_PATTERN.test(value)) return { ok: true, value, kind: "email" };
  if (/[\u4e00-\u9fff]/.test(value)) {
    return { ok: false, error: "账号需为大陆手机号或邮箱地址" };
  }
  if (value.includes("@")) {
    return { ok: false, error: "邮箱格式不正确，例如 name@example.com" };
  }
  return { ok: false, error: "账号需为 11 位大陆手机号或邮箱地址" };
}

/** 校验密码：长度 8–64、字母+数字、无空白、非弱口令。 */
export function validatePassword(raw, account) {
  const value = String(raw ?? "");
  if (!value) return { ok: false, error: "请输入密码" };
  if (value.length < PASSWORD_MIN) {
    return { ok: false, error: `密码至少 ${PASSWORD_MIN} 位` };
  }
  if (value.length > PASSWORD_MAX) {
    return { ok: false, error: `密码不能超过 ${PASSWORD_MAX} 位` };
  }
  if (/\s/.test(value)) return { ok: false, error: "密码不能包含空格或制表符" };
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return { ok: false, error: "密码需同时包含字母和数字" };
  }
  if (WEAK_PASSWORDS.has(value.toLowerCase())) {
    return { ok: false, error: "密码过于简单，请更换更强的密码" };
  }
  const normalizedAccount = normalizeAccount(account);
  if (normalizedAccount && value.toLowerCase().includes(normalizedAccount.toLowerCase())) {
    return { ok: false, error: "密码不能包含账号信息" };
  }
  return { ok: true };
}

/** 昵称：可选，1–24 个字符，不能全为空白。 */
export function validateNickname(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true, value: "" };
  if (value.length > NICKNAME_MAX) {
    return { ok: false, error: `昵称不能超过 ${NICKNAME_MAX} 个字符` };
  }
  return { ok: true, value };
}

/** 班级名：可选，1–30 个字符。 */
export function validateClassName(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true, value: "" };
  if (value.length > CLASS_NAME_MAX) {
    return { ok: false, error: `班级名不能超过 ${CLASS_NAME_MAX} 个字符` };
  }
  return { ok: true, value };
}

export const ROLES = ["student", "teacher"];

/** 角色：仅接受 student / teacher，缺省 student。 */
export function validateRole(raw) {
  const value = String(raw ?? "student");
  return ROLES.includes(value) ? { ok: true, value } : { ok: false, error: "角色不合法" };
}
