import { useSyncExternalStore } from "react";

const STORAGE_KEY = "aiquos-account";
const FAVORITES_PREFIX = "aiquos-favorites:";
/** 系统账号 ID 规则：aiquos + 一串数字，全局不重复。 */
const ID_PATTERN = /^aiquos\d{6,}$/;

/** 收集本地已占用过的账号 ID，保证新 ID 不会重复。 */
function usedAccountIds() {
  const used = new Set();
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(FAVORITES_PREFIX)) {
        used.add(key.slice(FAVORITES_PREFIX.length));
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.accountId === "string") used.add(parsed.accountId);
    }
  } catch {
    /* 读取失败时按空集合处理 */
  }
  return used;
}

/** 生成唯一的系统账号：aiquos + 8 位数字。 */
export function generateAccountId() {
  const used = usedAccountIds();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `aiquos${Math.floor(10000000 + Math.random() * 90000000)}`;
    if (!used.has(candidate)) return candidate;
  }
  return `aiquos${Date.now()}`;
}

function loadAccount() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.nickname === "string" &&
        typeof parsed.accountId === "string" &&
        parsed.nickname.trim()
      ) {
        // 旧格式 / 手填账号自动换发系统 ID（收藏随账号切换迁移）。
        const accountId = ID_PATTERN.test(parsed.accountId.trim())
          ? parsed.accountId.trim()
          : generateAccountId();
        return { nickname: parsed.nickname, accountId };
      }
    }
  } catch {
    /* 损坏的本地数据按新账号处理 */
  }
  return { nickname: "智核学员", accountId: generateAccountId() };
}

let account = loadAccount();
// 立即回写一次：换发的新 ID / 首次默认账号都要落盘。
try {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
} catch {
  /* 存储不可用时仅保留内存态 */
}

const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getAccount() {
  return account;
}

/** 账号 ID 由系统分配，调用方只能更新昵称等资料。 */
export function setAccount(patch) {
  account = { ...account, ...patch, accountId: account.accountId };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  } catch {
    /* 存储不可用时仅保留内存态 */
  }
  emit();
}

export function subscribeAccount(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAccount() {
  return useSyncExternalStore(subscribeAccount, getAccount, getAccount);
}
