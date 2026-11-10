// 测评草稿的服务端同步（登录态生效；localStorage 仍是一级缓存）。
//
// 两个方向的策略：
//   推送  saveAttemptDraft 每次都会触发 listener（每答一题一次），这里做
//         1.5s 尾随防抖，只把最新一份 PUT 到 /api/data/draft；未登录静默跳过。
//   拉取  启动时 GET 一次，savedAt 更新者胜出（mergeDraftChoice）；本地
//         已在本会话作答（状态离开挂载点）时不采纳，避免覆盖进行中的作答。
import { authFetch } from "./auth-client.js";

const DRAFT_ENDPOINT = "/api/data/draft";

/** 纯函数：本地/服务端草稿取新者。返回 { draft, source } 或 null。 */
export function mergeDraftChoice(local, server) {
  const localDraft = local && typeof local === "object" ? local : null;
  const serverDraft = server && typeof server === "object" ? server : null;
  if (!localDraft && !serverDraft) return null;
  if (!serverDraft) return { draft: localDraft, source: "local" };
  if (!localDraft) return { draft: serverDraft, source: "server" };
  const localAt = Date.parse(localDraft.savedAt ?? "");
  const serverAt = Date.parse(serverDraft.savedAt ?? "");
  if (Number.isFinite(serverAt) && (!Number.isFinite(localAt) || serverAt > localAt)) {
    return { draft: serverDraft, source: "server" };
  }
  return { draft: localDraft, source: "local" };
}

let pushTimer = null;
let pushInFlight = null;

/** 防抖推送：高频调用只发最后一次；上一次未完成则等它结束后再排。 */
export function pushDraftToServer(draft) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      if (pushInFlight) await pushInFlight.catch(() => {});
      const savedAt = draft?.savedAt ?? new Date().toISOString();
      pushInFlight = authFetch(DRAFT_ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft, savedAt }),
      }).then((response) => {
        if (!response.ok) throw new Error(`draft sync ${response.status}`);
        return response.json();
      });
      await pushInFlight;
    } catch {
      // 未登录 / 离线 / 服务端不可达：localStorage 是权威，静默跳过。
    } finally {
      pushInFlight = null;
    }
  }, 1500);
}

/** 拉取服务端草稿；未登录/离线返回 null。 */
export async function pullServerDraft() {
  try {
    const response = await authFetch(DRAFT_ENDPOINT, { method: "GET" });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.draft?.draft ?? null;
  } catch {
    return null;
  }
}

/** 清除服务端草稿（完成/放弃测评时随本地一起清）。 */
export function clearServerDraft() {
  clearTimeout(pushTimer);
  authFetch(DRAFT_ENDPOINT, { method: "DELETE" }).catch(() => {
    // 离线/未登录：下次推送会覆盖，无需重试。
  });
}
