import { ARK_IMAGE_PATH, DEEPSEEK_CHAT_PATH, handleArkImage, handleDeepSeekChat } from "./deepseek.js";
import { OBJECTIVE_QUESTIONS_PATH, handleObjectiveQuestions } from "./objective-quiz.js";
import { PRACTICAL_TASKS_PATH, handlePracticalTasks } from "./practical-tasks.js";
import { PRACTICAL_SCORE_PATH, handlePracticalScore } from "./practical-score.js";
import { COMPREHENSIVE_QUESTION_PATH, handleComprehensiveQuestion } from "./comprehensive-quiz.js";
import { ADMIN_BANK_PATH, handleAdminBank } from "./admin.js";
import { AUTH_LOGIN_PATH, AUTH_ME_PATH, AUTH_REGISTER_PATH, handleAuthLogin, handleAuthMe, handleAuthRegister } from "./auth.js";
import {
  DATA_ASSIGNMENTS_PATH,
  DATA_ASSIGNMENT_STATUS_PATH,
  DATA_ME_PATH,
  DATA_RUNS_PATH,
  DATA_TEACHER_OVERVIEW_PATH,
  handleDataAssignments,
  handleDataAssignmentStatus,
  handleDataMe,
  handleDataRuns,
  handleDataTeacherOverview,
} from "./data.js";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === DEEPSEEK_CHAT_PATH) {
      return handleDeepSeekChat(request, env.DEEPSEEK_API_KEY);
    }
    if (new URL(request.url).pathname === OBJECTIVE_QUESTIONS_PATH) {
      return handleObjectiveQuestions(request);
    }
    if (new URL(request.url).pathname === PRACTICAL_TASKS_PATH) {
      return handlePracticalTasks(request);
    }
    if (new URL(request.url).pathname === PRACTICAL_SCORE_PATH) {
      return handlePracticalScore(request, env.DEEPSEEK_API_KEY);
    }
    if (new URL(request.url).pathname === COMPREHENSIVE_QUESTION_PATH) {
      return handleComprehensiveQuestion(request);
    }
    if (new URL(request.url).pathname === ADMIN_BANK_PATH) {
      return handleAdminBank(request);
    }
    if (new URL(request.url).pathname === AUTH_REGISTER_PATH) {
      return handleAuthRegister(request, env);
    }
    if (new URL(request.url).pathname === AUTH_LOGIN_PATH) {
      return handleAuthLogin(request);
    }
    if (new URL(request.url).pathname === AUTH_ME_PATH) {
      return handleAuthMe(request);
    }
    if (new URL(request.url).pathname === DATA_RUNS_PATH) {
      return handleDataRuns(request);
    }
    if (new URL(request.url).pathname === DATA_ME_PATH) {
      return handleDataMe(request);
    }
    if (new URL(request.url).pathname === DATA_ASSIGNMENTS_PATH) {
      return handleDataAssignments(request);
    }
    if (new URL(request.url).pathname === DATA_ASSIGNMENT_STATUS_PATH) {
      return handleDataAssignmentStatus(request);
    }
    if (new URL(request.url).pathname === DATA_TEACHER_OVERVIEW_PATH) {
      return handleDataTeacherOverview(request);
    }
    if (new URL(request.url).pathname === ARK_IMAGE_PATH) {
      return handleArkImage(request, env.ARK_API_KEY);
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
