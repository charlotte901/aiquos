import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";
import { createObjectiveQuestions, handleObjectiveQuestions } from "../worker/objective-quiz.js";
import { createPracticalTasks, handlePracticalTasks } from "../worker/practical-tasks.js";

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
  assert.equal(createObjectiveQuestions("academy", "human", () => .12).length, 5);
  assert.equal(createObjectiveQuestions("academy", "ai", () => .2).length, 5);

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

test("serves practical tasks from both marked banks without source metadata", async () => {
  assert.equal(createPracticalTasks("academy", "human", () => .2).length, 2);
  assert.equal(createPracticalTasks("academy", "ai", () => .2).length, 3);

  const tasks = createPracticalTasks("academy", "all", () => .2);
  assert.equal(tasks.length, 5);
  assert.ok(tasks.every((task) => task.requirements.length > 0 && task.source.length > 0));
  assert.ok(tasks.every((task) => !["ai", "human"].includes(task.source)));

  const response = await handlePracticalTasks(
    new Request("https://example.test/api/practical-tasks?levelId=academy"),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.tasks.length, 5);
  assert.ok(!JSON.stringify(payload).includes("standardPrompt"));
  assert.ok(!JSON.stringify(payload).includes('"origin"'));
});

test("routes direct assessment banks through the worker", async () => {
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
  assert.equal((await practicalResponse.json()).tasks.length, 5);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
