import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_SYSTEM_PROMPT, buildAgentMessages } from "../src/home-agent-chat.js";

test("agent payload leads with the system prompt", () => {
  const messages = buildAgentMessages([{ role: "user", content: "你好" }]);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /小Q/);
  assert.deepEqual(messages[1], { role: "user", content: "你好" });
});

test("agent payload keeps only the last few clean turns", () => {
  const noisy = [];
  for (let i = 0; i < 12; i += 1) {
    noisy.push({ role: "user", content: `问题 ${i}` });
    noisy.push({ role: "assistant", content: `回答 ${i}` });
    noisy.push({ role: "tool", content: "外来角色必须被丢弃" });
    noisy.push({ role: "user", content: "   " });
  }
  const messages = buildAgentMessages(noisy);
  assert.ok(messages.length <= 9, `expected at most system + 8 turns, got ${messages.length}`);
  assert.ok(messages.every((m) => ["system", "user", "assistant"].includes(m.role)));
  assert.equal(messages.at(-1).content, "回答 11");
});

test("agent payload clips oversized content instead of forwarding it", () => {
  const messages = buildAgentMessages([{ role: "user", content: "长".repeat(5000) }]);
  assert.ok(messages[1].content.length <= 1200);
});
