import { ARK_IMAGE_PATH, DEEPSEEK_CHAT_PATH, handleArkImage, handleDeepSeekChat } from "./deepseek.js";
import { OBJECTIVE_QUESTIONS_PATH, handleObjectiveQuestions } from "./objective-quiz.js";
import { PRACTICAL_TASKS_PATH, handlePracticalTasks } from "./practical-tasks.js";

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
