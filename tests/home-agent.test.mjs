import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentMessages } from "../src/home-agent-chat.js";
import { buildKnowledgeContext } from "../src/agent-skills.js";

test("agent payload leads with the mentor system prompt", () => {
  const messages = buildAgentMessages([{ role: "user", content: "你好" }]);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /学习导师/);
  assert.match(messages[0].content, /回答章法/);
  assert.deepEqual(messages[1], { role: "user", content: "你好" });
});

test("agent payload injects distilled knowledge into the system prompt", () => {
  const messages = buildAgentMessages(
    [{ role: "user", content: "黑猫那个案例的提示词好在哪？" }],
    buildKnowledgeContext("黑猫那个案例的提示词好在哪？"),
  );
  assert.match(messages[0].content, /内部参考数据/);
  assert.match(messages[0].content, /戴眼镜的黑猫/);
  assert.equal(messages[1].content, "黑猫那个案例的提示词好在哪？");
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
  assert.ok(messages.length <= 11, `expected at most system + 10 turns, got ${messages.length}`);
  assert.ok(messages.every((m) => ["system", "user", "assistant"].includes(m.role)));
  assert.equal(messages.at(-1).content, "回答 11");
});

test("agent payload clips oversized content instead of forwarding it", () => {
  const messages = buildAgentMessages([{ role: "user", content: "长".repeat(5000) }]);
  assert.ok(messages[1].content.length <= 1200);
});
