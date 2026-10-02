import test from "node:test";
import assert from "node:assert/strict";
import { streamDeepSeek } from "../src/deepseek.js";

test("streamDeepSeek separates reasoning frames from final content frames", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"先核对"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"任务要求"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"最终答案"}}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(stream, { status: 200 });

  try {
    const reasoning = [];
    const output = [];
    const complete = await streamDeepSeek({
      messages: [{ role: "user", content: "任务" }],
      onReasoning: (message) => reasoning.push(message),
      onDelta: (message) => output.push(message),
    });

    assert.deepEqual(reasoning, ["先核对", "先核对任务要求"]);
    assert.deepEqual(output, ["最终答案"]);
    assert.equal(complete, "最终答案");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
