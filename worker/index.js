import { ARK_IMAGE_PATH, DEEPSEEK_CHAT_PATH, handleArkImage, handleDeepSeekChat } from "./deepseek.js";
import { PRACTICAL_TASKS_PATH, handlePracticalTasks } from "./practical-tasks.js";
import { PRACTICAL_SCORE_PATH, handlePracticalScore } from "./practical-score.js";
import { COMPREHENSIVE_QUESTION_PATH, handleComprehensiveQuestion } from "./comprehensive-quiz.js";
import { COMPREHENSIVE_SCORE_PATH, handleComprehensiveScore } from "./comprehensive-score.js";
import { ADMIN_BANK_PATH, handleAdminBank } from "./admin.js";
import { accountPersistenceEnabled } from "./account-store.js";
import { sharedDataPersistenceEnabled } from "./data-store.js";
import {
  AUTH_LOGIN_PATH,
  AUTH_ME_PATH,
  AUTH_PASSWORD_PATH,
  AUTH_PROFILE_PATH,
  AUTH_REGISTER_PATH,
  handleAuthLogin,
  handleAuthMe,
  handleAuthPassword,
  handleAuthProfile,
  handleAuthRegister,
} from "./auth.js";
import {
  DATA_CLASSES_PATH, handleDataClasses,
  DATA_ASSIGNMENTS_PATH,
  DATA_ASSIGNMENT_STATUS_PATH,
  DATA_DRAFT_PATH,
  DATA_ME_PATH,
  DATA_RUNS_PATH,
  DATA_TEACHER_OVERVIEW_PATH,
  handleDataAssignments,
  handleDataAssignmentStatus,
  handleDataDraft,
  handleDataMe,
  handleDataRuns,
  handleDataTeacherOverview,
} from "./data.js";
import { ensureFilePersistence } from "./storage.js";
import { setBankPersistence } from "./bank-store.js";
import { setAccountPersistence } from "./account-store.js";
import { setSharedDataPersistence } from "./data-store.js";

// 生产持久化接线（一次性）：AIQUOS_DATA_DIR 指向可写目录时，账号/共享
// 数据/题库覆盖三个 store 从 per-isolate 内存态切到该目录下的 JSON 文件
// （原子写与备份，见 worker/storage.js）。账号/班级接口拒绝未配置存储的
// 请求；配置目录却无法初始化时停止写入。打包产物是纯 Node 模块（dist/server），
// 单进程部署下这同时解决重启丢数据与跨 isolate 分叉两个问题。
let persistencePromise = null;
async function resolvePersistence(env) {
  if (!persistencePromise) persistencePromise = ensureFilePersistence(env, ({ account, shared, bank }) => {
    setAccountPersistence(account);
    setSharedDataPersistence(shared);
    setBankPersistence(bank);
  });
  return persistencePromise;
}

export default {
  async fetch(request, env) {
    try { await resolvePersistence(env); } catch {
      return new Response(JSON.stringify({ error: "服务端持久存储读取失败，已停止写入以保护已有数据" }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    const { pathname } = new URL(request.url);
    if ((pathname.startsWith("/api/auth/") || pathname.startsWith("/api/data/"))
      && (!accountPersistenceEnabled() || !sharedDataPersistenceEnabled())) {
      return new Response(JSON.stringify({ error: "服务端持久存储尚未配置，请完成存储配置后再使用账号和班级功能" }), {
        status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (pathname === DATA_CLASSES_PATH) return handleDataClasses(request);
    if (pathname === DEEPSEEK_CHAT_PATH) {
      return handleDeepSeekChat(request, env.DEEPSEEK_API_KEY);
    }
    if (pathname === PRACTICAL_TASKS_PATH) {
      return handlePracticalTasks(request);
    }
    if (pathname === PRACTICAL_SCORE_PATH) {
      return handlePracticalScore(request, env.DEEPSEEK_API_KEY);
    }
    if (pathname === COMPREHENSIVE_QUESTION_PATH) {
      return handleComprehensiveQuestion(request);
    }
    if (pathname === COMPREHENSIVE_SCORE_PATH) {
      return handleComprehensiveScore(request);
    }
    if (pathname === ADMIN_BANK_PATH) {
      return handleAdminBank(request);
    }
    if (pathname === AUTH_REGISTER_PATH) {
      return handleAuthRegister(request, env);
    }
    if (pathname === AUTH_LOGIN_PATH) {
      return handleAuthLogin(request);
    }
    if (pathname === AUTH_ME_PATH) {
      return handleAuthMe(request);
    }
    if (pathname === AUTH_PROFILE_PATH) {
      return handleAuthProfile(request);
    }
    if (pathname === AUTH_PASSWORD_PATH) {
      return handleAuthPassword(request);
    }
    if (pathname === DATA_RUNS_PATH) {

      return handleDataRuns(request);
    }
    if (pathname === DATA_ME_PATH) {
      return handleDataMe(request);
    }
    if (pathname === DATA_ASSIGNMENTS_PATH) {
      return handleDataAssignments(request);
    }
    if (pathname === DATA_ASSIGNMENT_STATUS_PATH) {
      return handleDataAssignmentStatus(request);
    }
    if (pathname === DATA_TEACHER_OVERVIEW_PATH) {
      return handleDataTeacherOverview(request);
    }
    if (pathname === DATA_DRAFT_PATH) {
      return handleDataDraft(request);
    }
    if (pathname === ARK_IMAGE_PATH) {
      return handleArkImage(request, env.ARK_API_KEY);
    }
    // 未匹配的 /api/* 返回明确的 404 JSON，而不是落进 SPA 回退
    // （那会给出 200 + index.html，调用方只能拿到一坨 HTML）。
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
