import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import worker from "../worker/index.js";
import { createObjectiveQuestions, handleObjectiveQuestions } from "../worker/objective-quiz.js";
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
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("serves objective questions from both marked banks without source metadata", async () => {
  // 两套版本共用一份题库文件，靠 origin 区分：全量版吃全部 1000 题，
  // 精选版只吃 120 道人工精选题。
  assert.equal(createObjectiveQuestions("academy", "human", () => .12, "A").length, 5);
  assert.equal(createObjectiveQuestions("academy", "ai", () => .2, "A").length, 5);
  assert.equal(createObjectiveQuestions("academy", "human", () => .12, "B").length, 5);
  // 精选版没有 ai 来源的题。
  assert.equal(createObjectiveQuestions("academy", "ai", () => .2, "B").length, 0);

  const response = await handleObjectiveQuestions(
    new Request("https://example.test/api/objective-questions?levelId=academy"),
  );
  const { questions } = await response.json();

  assert.equal(response.status, 200);
  assert.equal(questions.length, 5);
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
  // 默认版本是精选版：court 的客观题来自 120 道精选题，workshop 的实操题
  // 来自 10 题精选池——两处的题量都小于 5，所以断言「有题」而不是「必 5 题」。
  const objectiveResponse = await worker.fetch(
    new Request("https://example.test/api/objective-questions?levelId=court"),
    { ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } },
  );
  assert.equal(objectiveResponse.status, 200);
  assert.equal((await objectiveResponse.json()).questions.length, 5);

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

  const objective = await worker.fetch(
    new Request("https://example.test/api/objective-questions?levelId=academy"),
    env,
  );
  assert.equal(objective.status, 200);
  assert.equal((await objective.json()).questions.length, 5);

  const practical = await worker.fetch(
    new Request("https://example.test/api/practical-tasks?levelId=academy&edition=A"),
    env,
  );
  assert.equal(practical.status, 200);
  const payload = await practical.json();
  assert.equal(payload.edition, "A");
  assert.equal(payload.tasks.length, 5);
});
