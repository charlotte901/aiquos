/**
 * 完成记录上报与作业（组卷推送）关联。
 *
 * 学生端完成综合测评后，把历史快照的摘要上报到 /api/data/runs，教师端
 * 的数据概览/学员管理/组卷中心由此拿到真实数据。未登录时静默跳过——
 * 本地匿名体验不强制登录（登录后的数据才进教师视野，这正是互通的边界）。
 *
 * 作业关联：从推送进入测评时把 assignmentId 暂存（刷新不丢），完成上报
 * 时带上，服务端据此把这次完成计入该推送的完成名单。
 */
import { authFetch, readProfile } from "./auth-client";
import { scopedKey } from "./account-scope.js";

// 作业记账属个人数据：按账号命名空间存取。不能在模块加载时固化
// scopedKey 的结果——登录/登出后账号变了，必须每个使用点现取。
const ASSIGNMENT_BASE_KEY = "aiquos.active-assignment.v1";

export function readActiveAssignmentId() {
  try {
    return localStorage.getItem(scopedKey(ASSIGNMENT_BASE_KEY)) || null;
  } catch {
    return null;
  }
}

export function writeActiveAssignmentId(id) {
  try {
    if (id) localStorage.setItem(scopedKey(ASSIGNMENT_BASE_KEY), id);
    else localStorage.removeItem(scopedKey(ASSIGNMENT_BASE_KEY));
  } catch {
    /* 存储不可用时作业关联仅本次会话有效 */
  }
}

/** 历史快照 → 上报负载（只取摘要，题目与证据明细留在本地）。 */
export function snapshotToRunPayload(snapshot, assignmentId) {
  if (!snapshot || !snapshot.result) return null;
  const result = snapshot.result;
  const composite = snapshot.composite ?? null;
  const channels = composite?.channels
    ? {
      objective: composite.channels.objective?.overallScore ?? null,
      interview: composite.channels.interview?.overallScore ?? null,
      practical: composite.channels.practical?.overallScore ?? null,
    }
    : null;
  return {
    assessmentId: snapshot.assessmentId ?? "comprehensive",
    assignmentId: assignmentId ?? null,
    startedAt: snapshot.startedAt ?? null,
    completedAt: snapshot.completedAt,
    overallScore: composite?.overallScore ?? result.overallScore,
    grade: composite?.grade ?? result.grade,
    dimensions: result.dimensions?.map((dimension) => ({
      key: dimension.key,
      name: dimension.name,
      short: dimension.short,
      score: dimension.score,
    })) ?? [],
    answeredCount: result.answeredCount ?? null,
    totalQuestions: result.totalQuestions ?? null,
    bankVersion: snapshot.questionBankVersion ?? null,
    scoringVersion: snapshot.scoringVersion ?? null,
    weightingVersion: composite?.weightingVersion ?? null,
    channels,
  };
}

/**
 * 上报一次完成（fire-and-forget：失败不打断报告页，只在控制台留痕；
 * 下一次完成会重新上报，同一次完成重复上报服务端幂等替换）。
 */
export async function reportRunSnapshot(snapshot, assignmentId) {
  if (!readProfile()) return { skipped: true };
  const payload = snapshotToRunPayload(snapshot, assignmentId);
  if (!payload) return { skipped: true };
  try {
    const response = await authFetch("/api/data/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.info("[aiquos] 完成记录上报未成功", response.status);
      return { ok: false, status: response.status };
    }
    return { ok: true };
  } catch (error) {
    console.info("[aiquos] 完成记录上报失败", error?.message ?? error);
    return { ok: false };
  }
}
