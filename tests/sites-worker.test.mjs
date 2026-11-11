import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import worker from "../worker/index.js";
import { createObjectiveQuestions } from "./helpers/edition-pool.mjs";
import { createPracticalTasks, handlePracticalTasks } from "../worker/practical-tasks.js";

// Sites 打包产物（dist/）由 `npm run build` 生成，且其后置脚本还需要本地
// .openai/hosting.json（部署配置，不入库）。CI 的单测步骤在 build 之前跑，
// 本仓库刚克隆时也没有 dist —— 产物缺失时这两条测试显式 skip，而不是假红。
const DIST_BUILT = existsSync(fileURLToPath(new URL("../dist/server/worker/index.js", import.meta.url)));

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  // 未匹配的 /api/* 由路由层直接 404 JSON，完全不触碰资产层。
  let apiCalls = 0;
  const apiResponse = await worker.fetch(
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    { ASSETS: { fetch: async () => { apiCalls += 1; return new Response("missing", { status: 404 }); } } },
  );
  assert.equal(apiResponse.status, 404);
  assert.equal(apiCalls, 0);

  let flowCalls = 0;
  const flowResponse = await worker.fetch(
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => { flowCalls += 1; return new Response("missing", { status: 404 }); } } },
  );
  assert.equal(flowResponse.status, 404);
  assert.equal(flowCalls, 1);
});

test("splits the objective bank by edition and origin without source metadata", () => {
  // 两套版本共用一份题库文件，靠 origin 区分：全量版吃全部 1000 题，
  // 精选版只吃 120 道人工精选题。原 /api/objective-questions 端点已下线
  // （前端零调用且公开答案），这里只校验题库切分本身。
  assert.equal(createObjectiveQuestions("academy", "human", () => .12, "A").length, 5);
  assert.equal(createObjectiveQuestions("academy", "ai", () => .2, "A").length, 5);
  assert.equal(createObjectiveQuestions("academy", "human", () => .12, "B").length, 5);
  // 精选版没有 ai 来源的题。
  assert.equal(createObjectiveQuestions("academy", "ai", () => .2, "B").length, 0);

  const questions = createObjectiveQuestions("academy", "human", () => .12, "A");
  assert.deepEqual(
    questions.map((question) => Object.keys(question).sort()),
    Array.from({ length: 5 }, () => ["analysis", "answer", "dims", "options", "q", "type"]),
  );
  assert.ok(!JSON.stringify(questions).includes('"origin"'));
});

test("serves practical tasks from both editions without source metadata", async () => {
  // 全量版 80 题、精选版 10 题，各关自动补足到 5 题（池子够大时）。
  assert.equal(createPracticalTasks({ levelId: "all", count: 80, rng: () => .2, edition: "A" }).length, 80);
  assert.equal(createPracticalTasks({ levelId: "all", count: 10, rng: () => .2, edition: "B" }).length, 10);

  const tasks = createPracticalTasks({ levelId: "academy", origin: "all", rng: () => .2, edition: "A" });
  assert.equal(tasks.length, 5);
  // 每题必须给得出交付要求；素材（source）可以为空——有些任务自带全部上下文。
  assert.ok(tasks.every((task) => task.requirements.length > 0));
  assert.ok(tasks.every((task) => typeof task.source === "string"));
  assert.ok(tasks.every((task) => !["ai", "human"].includes(task.source)));

  // 精选版每关题量少于 5 时必须如实返回实际数量，而不是凑数。
  const lite = createPracticalTasks({ levelId: "court", origin: "all", rng: () => .2, edition: "B" });
  assert.ok(lite.length <= 5, "lite edition must not inflate the pool");

  const response = await handlePracticalTasks(
    new Request("https://example.test/api/practical-tasks?levelId=academy"),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.ok(payload.tasks.length > 0);
  assert.ok(!JSON.stringify(payload).includes("standardPrompt"));
  assert.ok(!JSON.stringify(payload).includes('"origin"'));
});

test("routes direct assessment banks through the worker", async () => {
  // 默认版本是精选版：workshop 的实操题来自 10 题精选池——题量小于 5，
  // 所以断言「有题」而不是「必 5 题」。客观题端点已下线，这里只走实操。
  const practicalResponse = await worker.fetch(
    new Request("https://example.test/api/practical-tasks?levelId=workshop"),
    { ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } },
  );
  assert.equal(practicalResponse.status, 200);
  assert.ok((await practicalResponse.json()).tasks.length > 0);

  // 全量版下同一关卡应能给出完整 5 题。
  const fullResponse = await worker.fetch(
    new Request("https://example.test/api/practical-tasks?levelId=workshop&edition=A"),
    { ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } },
  );
  assert.equal(fullResponse.status, 200);
  const fullPayload = await fullResponse.json();
  assert.equal(fullPayload.tasks.length, 5);
  assert.equal(fullPayload.edition, "A");
});

test("emits the files required by Sites packaging", { skip: !DIST_BUILT && "dist 未构建（npm run build + 本地 .openai/hosting.json）" }, async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  // 入口在 worker/ 下：worker 模块之间是 ./ 与 ../src 的相对导入，打包结果
  // 必须保留源码层级（server/worker、server/src、server/vendor 互为兄弟）。
  await access(new URL("../dist/server/worker/index.js", import.meta.url));
  await access(new URL("../dist/server/src/bank-editions.js", import.meta.url));
  await access(new URL("../dist/server/src/banks/comprehensive-880.json", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

test("the packaged worker boots and serves both editions", { skip: !DIST_BUILT && "dist 未构建（npm run build + 本地 .openai/hosting.json）" }, async () => {
  // 这条断言的意义在于：模块能否被解析只有真正 import 才知道。之前把 worker
  // 文件平铺到 server/ 根目录时，`../src/...` 会解析到 server 之外，静态检查
  // 看不出来，import 才报 ERR_MODULE_NOT_FOUND。
  const mod = await import(new URL("../dist/server/worker/index.js", import.meta.url).href);
  const worker = mod.default;
  const env = { ASSETS: { fetch: async () => new Response("", { status: 404 }) } };

  // 已下线的端点必须给出 404 JSON（而不是 SPA 回退的 HTML 200）。
  const gone = await worker.fetch(
    new Request("https://example.test/api/objective-questions?levelId=academy"),
    env,
  );
  assert.equal(gone.status, 404);

  const practical = await worker.fetch(
    new Request("https://example.test/api/practical-tasks?levelId=academy&edition=A"),
    env,
  );
  assert.equal(practical.status, 200);
  const payload = await practical.json();
  assert.equal(payload.edition, "A");
  assert.equal(payload.tasks.length, 5);
});
