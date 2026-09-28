import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HISTORY_OUTPUT_LIMIT,
  practicalAgentMessages,
  practicalImagePrompt,
  practicalImageRefs,
} from "../src/practical-agent.js";

const TASK = {
  title: "把口语汇报整理成周报",
  goal: "整理成正式周报",
  requirements: ["分三段", "保留关键数据"],
  source: "原始素材：组长口述内容……",
};

test("首轮只有 system + user（简报与提示词合并，不重复）", () => {
  const messages = practicalAgentMessages(TASK, [], "帮我整理这份周报", []);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, /原始素材/);
  assert.match(messages[1].content, /帮我整理这份周报/);
  // 首轮提示词只出现一次（并入简报，不再单独追加一条 user）
  assert.equal(messages.filter((m) => m.content === "帮我整理这份周报").length, 0);
});

test("第二轮带上第一轮产物与新指令（这是'再改一点'能生效的前提）", () => {
  const turns = [{ prompt: "整理成周报", output: "【本周完成】1. 完成 A 2. 完成 B" }];
  const messages = practicalAgentMessages(TASK, turns, "第三段压缩到 40 字", []);
  assert.equal(messages[0].role, "system");
  // system 必须提示"局部修改"的纪律，否则模型会重写全文
  assert.match(messages[0].content, /局部修改/);
  // 历史产物以 assistant 身份回灌
  const assistant = messages.filter((m) => m.role === "assistant");
  assert.equal(assistant.length, 1);
  assert.match(assistant[0].content, /本周完成/);
  // 最后一条是本轮新指令
  assert.equal(messages[messages.length - 1].role, "user");
  assert.equal(messages[messages.length - 1].content, "第三段压缩到 40 字");
});

test("三轮时历史按 assistant/user 交替展开，顺序不乱", () => {
  const turns = [
    { prompt: "P1", output: "O1" },
    { prompt: "P2", output: "O2" },
  ];
  const roles = practicalAgentMessages(TASK, turns, "P3", []).map((m) => m.role);
  assert.deepEqual(roles, ["system", "user", "assistant", "user", "assistant", "user"]);
  const contents = practicalAgentMessages(TASK, turns, "P3", []).map((m) => m.content);
  // 第一轮的指令在简报里（首条 user），P2 是"轮次交替"里的那条
  assert.match(contents[1], /P1/);
  assert.equal(contents[3], "P2");
  assert.equal(contents[5], "P3");
});

test("历史产物超长时被截断，避免上下文膨胀", () => {
  const long = "字".repeat(HISTORY_OUTPUT_LIMIT + 5000);
  const messages = practicalAgentMessages(TASK, [{ prompt: "P1", output: long }], "P2", []);
  const assistant = messages.find((m) => m.role === "assistant");
  assert.equal(assistant.content.length, HISTORY_OUTPUT_LIMIT);
});

test("参考图挂在首条用户消息上，且为多模态结构", () => {
  const uploads = [{ src: "data:image/jpeg;base64,AAA" }, { src: "data:image/jpeg;base64,BBB" }];
  const messages = practicalAgentMessages(TASK, [], "按图改", uploads);
  const user = messages[1];
  assert.ok(Array.isArray(user.content), "有图时 content 应为数组");
  assert.equal(user.content[0].type, "text");
  const images = user.content.filter((part) => part.type === "image_url");
  assert.equal(images.length, 2);
  assert.equal(images[0].image_url.url, "data:image/jpeg;base64,AAA");
});

test("没有参考图时 content 保持纯字符串（省带宽）", () => {
  const messages = practicalAgentMessages(TASK, [], "写一份", []);
  assert.equal(typeof messages[1].content, "string");
});

test("参考图只在首条出现，不在后续轮次重复发送", () => {
  const uploads = [{ src: "data:image/jpeg;base64,AAA" }];
  const messages = practicalAgentMessages(TASK, [{ prompt: "P1", output: "O1" }], "P2", uploads);
  const withImages = messages.filter((m) => Array.isArray(m.content));
  assert.equal(withImages.length, 1, "参考图应只挂在首条用户消息上");
});

// ── 图片任务的参考图与提示词 ────────────────────────────────────────────────

test("图片任务第二轮把上一轮产物作为参考图送回（否则等于从零重画）", () => {
  const uploads = [{ src: "data:image/jpeg;base64,SRC", name: "参考原图" }];
  const first = practicalImageRefs(uploads, null, 1);
  assert.equal(first.length, 1, "首轮只有学员素材");

  const second = practicalImageRefs(uploads, { imageUrl: "data:image/png;base64,PREV" }, 2);
  assert.equal(second.length, 2, "第二轮应带上上一轮产物");
  assert.equal(second[1].src, "data:image/png;base64,PREV");
  assert.match(second[1].name, /上一轮产物/);
});

test("离线占位图不作为下一轮底图（避免在假图上迭代）", () => {
  const refs = practicalImageRefs([], { imageUrl: "data:image/svg+xml,PLACEHOLDER", offline: true }, 2);
  assert.equal(refs.length, 0);
});

test("生图提示词声明参考图张数，并在迭代轮次说明是在改上一版", () => {
  const first = practicalImagePrompt(TASK, "扩成 16:9", ["参考原图"], 1);
  assert.match(first, /参考图：已附上 1 张/);
  assert.ok(!/第 \d+ 轮迭代/.test(first), "首轮不应出现迭代说明");

  const third = practicalImagePrompt(TASK, "颜色再暖一点", ["参考原图", "上一轮产物（第 2 轮）"], 3);
  assert.match(third, /参考图：已附上 2 张/);
  assert.match(third, /这是第 3 轮迭代/);
  assert.match(third, /保持未被要求改动的部分不变/);
});

test("没有参考图时不写参考图说明（也不写迭代说明）", () => {
  const text = practicalImagePrompt(TASK, "画一张海报", [], 1);
  assert.ok(!text.includes("参考图："));
  assert.match(text, /用户补充：画一张海报/);
});
