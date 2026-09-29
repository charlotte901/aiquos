import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ARK_IMAGE_PATH, DEEPSEEK_CHAT_PATH, handleArkImage, handleDeepSeekChat } from "./worker/deepseek.js";
import { OBJECTIVE_QUESTIONS_PATH, handleObjectiveQuestions } from "./worker/objective-quiz.js";
import { PRACTICAL_TASKS_PATH, handlePracticalTasks } from "./worker/practical-tasks.js";
import { PRACTICAL_SCORE_PATH, handlePracticalScore } from "./worker/practical-score.js";
import { COMPREHENSIVE_QUESTION_PATH, handleComprehensiveQuestion } from "./worker/comprehensive-quiz.js";
import { ADMIN_BANK_PATH, handleAdminBank } from "./worker/admin.js";
import { STAGE_LAYOUT_TUNING_PATH, handleStageLayoutTuning, CHARACTER_TUNING_PATH, handleCharacterTuning } from "./worker/stage-layout-tuning.js";
import { setBankPersistence } from "./worker/bank-store.js";

// 三元素布局调参（?tune=1 面板「保存」）写回这份文件，成为新的默认值。
const stageLayoutTuningPath = fileURLToPath(new URL("./src/stage-layout-tuning.json", import.meta.url));
// 角色统一微调（?tune=1 右下面板「保存」）写回这份文件。
const characterTuningPath = fileURLToPath(new URL("./src/character-tuning.json", import.meta.url));

// Admin bank edits persist to a gitignored overrides file next to the worker —
// one file per edition, so publishing to the 全量版 cannot disturb the 精选版.
const bankOverridesPath = (edition) =>
  fileURLToPath(new URL(`./worker/bank-overrides${edition === "A" ? "-full" : ""}.json`, import.meta.url));
setBankPersistence({
  load: (edition) => {
    try {
      return readFileSync(bankOverridesPath(edition), "utf8");
    } catch {
      return null;
    }
  },
  save: (raw, edition) => writeFileSync(bankOverridesPath(edition), raw),
  clear: (edition) => {
    try {
      unlinkSync(bankOverridesPath(edition));
    } catch {
      // Nothing persisted: resetting to bundled is already complete.
    }
  },
});

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
          server.middlewares.use(OBJECTIVE_QUESTIONS_PATH, async (req, res) => {
            const base = `http://${req.headers.host || "127.0.0.1"}`;
            const response = await handleObjectiveQuestions(new Request(new URL(req.url, base)));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).pipe(res);
          });
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
              headers: { "content-type": req.headers["content-type"] || "application/json" },
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
