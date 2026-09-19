import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ARK_IMAGE_PATH, DEEPSEEK_CHAT_PATH, handleArkImage, handleDeepSeekChat } from "./worker/deepseek.js";
import { OBJECTIVE_QUESTIONS_PATH, handleObjectiveQuestions } from "./worker/objective-quiz.js";
import { PRACTICAL_TASKS_PATH, handlePracticalTasks } from "./worker/practical-tasks.js";
import { COMPREHENSIVE_QUESTION_PATH, handleComprehensiveQuestion } from "./worker/comprehensive-quiz.js";
import { ADMIN_BANK_PATH, handleAdminBank } from "./worker/admin.js";
import { setBankPersistence } from "./worker/bank-store.js";

// Admin bank edits persist to a gitignored overrides file next to the worker.
const bankOverridesPath = fileURLToPath(new URL("./worker/bank-overrides.json", import.meta.url));
setBankPersistence({
  load: () => {
    try {
      return readFileSync(bankOverridesPath, "utf8");
    } catch {
      return null;
    }
  },
  save: (raw) => writeFileSync(bankOverridesPath, raw),
  clear: () => {
    try {
      unlinkSync(bankOverridesPath);
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
        },
      },
    ],
  };
});
