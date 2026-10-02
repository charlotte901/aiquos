/**
 * 账号级数据隔离。
 *
 * 问题（2026-10-02 实测）：觉醒报告等个人数据存全局 localStorage 键，同一
 * 浏览器注册新账号会直接「继承」旧账号的报告。同类泄漏还有：未完成草稿、
 * 我的记录、进行中的采访线程、作业记账。
 *
 * 方案：个人数据键追加账号后缀（`@<accountId>`）；未登录沿用旧键（匿名
 * 场景零迁移成本）。登录时若该账号首次使用本设备，把匿名时期的**成果类**
 * 数据（历史报告、我的记录）一次性迁移过去——同人换账号入口不丢历史；
 * 注册新账号不迁移，全新开始。草稿/采访线程任何情况都不跨账号（恢复
 * 别人的半场测评比丢一场草稿严重得多）。
 */

const LEGACY_MARKER = "aiquos.scope.migrated";

function readAccountId() {
  try {
    const raw = localStorage.getItem("aiquos.auth.v1");
    if (!raw) return null;
    const session = JSON.parse(raw);
    const id = session?.profile?.accountId;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/** 当前数据归属：accountId 或 null（匿名）。直接读 localStorage，避免与
 *  auth-client 形成循环依赖；auth-client 落盘后才读，顺序上总是新值。 */
export function currentAccountScope() {
  return readAccountId();
}

/** 个人数据键 → 账号命名空间键。匿名（未登录）返回原键。 */
export function scopedKey(base) {
  const account = readAccountId();
  return account ? `${base}@${account}` : base;
}

/**
 * 登录后调用：把匿名时期的成果类数据一次性搬进该账号的命名空间。
 * 只有该账号从未迁移过、且其命名空间为空时才执行（重复登录幂等）。
 */
export function migrateLegacyDataForAccount() {
  const account = readAccountId();
  if (!account) return;
  const marker = `${LEGACY_MARKER}@${account}`;
  try {
    if (localStorage.getItem(marker)) return;
  } catch { return; }
  const moves = [
    ["aiquos.comprehensive-history.v1", scopedKey("aiquos.comprehensive-history.v1")],
    ["aiquos.record-entries.v1", scopedKey("aiquos.record-entries.v1")],
  ];
  let moved = false;
  for (const [from, to] of moves) {
    if (from === to) continue;
    try {
      const data = localStorage.getItem(from);
      if (data && !localStorage.getItem(to)) {
        localStorage.setItem(to, data);
        moved = true;
      }
    } catch { /* 存储异常时跳过该键 */ }
  }
  try {
    localStorage.setItem(marker, new Date().toISOString());
  } catch { /* 标记写失败只意味着下次登录会重试迁移（幂等，无害） */ }
  if (moved) window.dispatchEvent(new CustomEvent("aiquos:account-data-migrated"));
}
