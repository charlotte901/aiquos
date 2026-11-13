import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ARK_IMAGE_PATH, DEEPSEEK_CHAT_PATH, handleArkImage, handleDeepSeekChat } from "./worker/deepseek.js";
import { PRACTICAL_TASKS_PATH, handlePracticalTasks } from "./worker/practical-tasks.js";
import { PRACTICAL_SCORE_PATH, handlePracticalScore } from "./worker/practical-score.js";
import { COMPREHENSIVE_QUESTION_PATH, handleComprehensiveQuestion } from "./worker/comprehensive-quiz.js";
import { COMPREHENSIVE_SCORE_PATH, handleComprehensiveScore } from "./worker/comprehensive-score.js";
import { ADMIN_BANK_PATH, handleAdminBank } from "./worker/admin.js";
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
} from "./worker/auth.js";
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
} from "./worker/data.js";
import { STAGE_LAYOUT_TUNING_PATH, handleStageLayoutTuning, CHARACTER_TUNING_PATH, handleCharacterTuning } from "./worker/stage-layout-tuning.js";
import { setBankPersistence } from "./worker/bank-store.js";
import { setAccountPersistence } from "./worker/account-store.js";
import { bootstrapInitialCohort } from "./worker/initial-cohort.js";
import { setSharedDataPersistence } from "./worker/data-store.js";
import { filePersistenceAdapters } from "./worker/storage.js";

// 三元素布局调参（?tune=1 面板「保存」）写回这份文件，成为新的默认值。
const stageLayoutTuningPath = fileURLToPath(new URL("./src/stage-layout-tuning.json", import.meta.url));
// 角色统一微调（?tune=1 右下面板「保存」）写回这份文件。
const characterTuningPath = fileURLToPath(new URL("./src/character-tuning.json", import.meta.url));

// 三个 store 的 fs 适配器统一走 worker/storage.js 的原子写（tmp+rename）。
// 文件落在 worker/ 目录下（均 gitignored）：bank-overrides[-full].json、
// auth-accounts.json（同时保管令牌签名密钥，首次注册随机生成）、
// aiquos-shared-data.json。
const workerDir = fileURLToPath(new URL("./worker", import.meta.url));
bootstrapInitialCohort(`${workerDir}/auth-accounts.json`, `${workerDir}/aiquos-shared-data.json`, fileURLToPath(new URL("./worker/initial-cohort.json", import.meta.url)));
const devAdapters = filePersistenceAdapters(fs, (dir, name) => `${dir}/${name}`, workerDir);
setBankPersistence(devAdapters.bank);
setAccountPersistence(devAdapters.account);
setSharedDataPersistence(devAdapters.shared);


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
  build: {
    outDir: "dist/client",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    // 全量 no-store：内嵌 webview 对模块做启发式缓存，改码后刷新仍见旧界面（回滚时丢失本修复，2026-10-02 恢复）。
    headers: { "cache-control": "no-store, must-revalidate" },
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
    plugins: [
      react(),
      {
        name: "deepseek-local-proxy",
        configureServer(server) {
          const proxy = (kind) => async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const path = kind === "image" ? ARK_IMAGE_PATH : DEEPSEEK_CHAT_PATH;
            const request = new Request(new URL(path, base), {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] || "application/json" },
              body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
            });
            const response = kind === "image"
              ? await handleArkImage(request, env.ARK_API_KEY)
              : await handleDeepSeekChat(request, env.DEEPSEEK_API_KEY);
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          };
          server.middlewares.use(DEEPSEEK_CHAT_PATH, proxy("chat"));
          server.middlewares.use(ARK_IMAGE_PATH, proxy("image"));
          server.middlewares.use(PRACTICAL_TASKS_PATH, async (req, res) => {
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handlePracticalTasks(new Request(new URL(req.url, base)));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          server.middlewares.use(PRACTICAL_SCORE_PATH, async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handlePracticalScore(new Request(new URL(PRACTICAL_SCORE_PATH, base), {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] || "application/json" },
              body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
            }), env.DEEPSEEK_API_KEY);
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          server.middlewares.use(ADMIN_BANK_PATH, async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleAdminBank(new Request(new URL(ADMIN_BANK_PATH, base), {
              method: req.method,
              // authorization 必须透传：管理端写操作（PUT/DELETE）验教师令牌，
              // 此前只带 content-type，dev 下永远 401（生产 worker 不经此层）。
              headers: {
                "content-type": req.headers["content-type"] || "application/json",
                ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
              },
              body: ["GET", "HEAD", "DELETE"].includes(req.method) ? undefined : Buffer.concat(chunks),
            }));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          server.middlewares.use(COMPREHENSIVE_QUESTION_PATH, async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleComprehensiveQuestion(new Request(new URL(COMPREHENSIVE_QUESTION_PATH, base), {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] || "application/json" },
              body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
            }));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          server.middlewares.use(COMPREHENSIVE_SCORE_PATH, async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleComprehensiveScore(new Request(new URL(COMPREHENSIVE_SCORE_PATH, base), {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] || "application/json" },
              body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
            }));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          server.middlewares.use(AUTH_REGISTER_PATH, async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleAuthRegister(new Request(new URL(AUTH_REGISTER_PATH, base), {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] || "application/json" },
              body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
            }));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          server.middlewares.use(AUTH_LOGIN_PATH, async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleAuthLogin(new Request(new URL(AUTH_LOGIN_PATH, base), {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] || "application/json" },
              body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
            }));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          server.middlewares.use(AUTH_ME_PATH, async (req, res) => {
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleAuthMe(new Request(new URL(AUTH_ME_PATH, base), {
              method: req.method,
              headers: { authorization: req.headers.authorization },
            }));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          const jsonHandler = (handler, path, options = {}) => async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const endpoint = new URL(path, base);
            endpoint.search = new URL(req.url, base).search;
            const response = await handler(new Request(endpoint, {
              method: req.method,
              headers: {
                "content-type": req.headers["content-type"] || "application/json",
                authorization: req.headers.authorization,
              },
              body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
            }), options.env);
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          };
          server.middlewares.use(AUTH_PROFILE_PATH, jsonHandler(handleAuthProfile, AUTH_PROFILE_PATH, { authorization: true }));
          server.middlewares.use(AUTH_PASSWORD_PATH, jsonHandler(handleAuthPassword, AUTH_PASSWORD_PATH, { authorization: true }));
          server.middlewares.use(DATA_CLASSES_PATH, jsonHandler(handleDataClasses, DATA_CLASSES_PATH));
          server.middlewares.use(DATA_RUNS_PATH, jsonHandler(handleDataRuns, DATA_RUNS_PATH));
          server.middlewares.use(DATA_ME_PATH, jsonHandler(handleDataMe, DATA_ME_PATH));
          server.middlewares.use(DATA_ASSIGNMENTS_PATH, jsonHandler(handleDataAssignments, DATA_ASSIGNMENTS_PATH));
          server.middlewares.use(DATA_ASSIGNMENT_STATUS_PATH, jsonHandler(handleDataAssignmentStatus, DATA_ASSIGNMENT_STATUS_PATH));
          server.middlewares.use(DATA_TEACHER_OVERVIEW_PATH, jsonHandler(handleDataTeacherOverview, DATA_TEACHER_OVERVIEW_PATH));
          server.middlewares.use(DATA_DRAFT_PATH, jsonHandler(handleDataDraft, DATA_DRAFT_PATH));
          server.middlewares.use(STAGE_LAYOUT_TUNING_PATH, async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleStageLayoutTuning(new Request(new URL(STAGE_LAYOUT_TUNING_PATH, base), {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] || "application/json" },
              body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
            }), stageLayoutTuningPath);
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
          server.middlewares.use(CHARACTER_TUNING_PATH, async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleCharacterTuning(new Request(new URL(CHARACTER_TUNING_PATH, base), {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] || "application/json" },
              body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
            }), characterTuningPath);
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
        },
      },
    ],
  };
});
