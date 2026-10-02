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

test("学员已拖入的上一轮产物不再作为额外参考图重复发送", () => {
  const previous = { imageUrl: "data:image/png;base64,PREV" };
  const uploads = [
    { src: "data:image/jpeg;base64,COMPRESSED", sourceId: previous.imageUrl, name: "生成结果" },
  ];
  const refs = practicalImageRefs(uploads, previous, 2);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].src, "data:image/jpeg;base64,COMPRESSED");
});

test("离线占位图不作为下一轮底图（避免在假图上迭代）", () => {
  const refs = practicalImageRefs([], { imageUrl: "data:image/svg+xml,PLACEHOLDER", offline: true }, 2);
  assert.equal(refs.length, 0);
});

test("生图提示词只包含学员原话（关键公平性回归）", () => {
  // 早期实现把 task.title / task.goal / task.requirements 全拼进生图请求，
  // 学员写 16 个字、模型却拿到题目全文要求 —— 三档产物因而几乎相同。
  // 本测试锁定：题目内容一律不得进入生图提示词。
  const task = {
    title: "把竖屏图扩成 16:9 壁纸",
    goal: "在保持原图完全保真的前提下扩展为 16:9 横屏壁纸，要求色调统一、边缘自然无拼接痕迹",
    requirements: ["达到评分标准：规格合规", "达到评分标准：原图保真"],
    source: "素材说明",
  };
  const text = practicalImagePrompt(task, "把这张图改成16:9的横屏壁纸", [], 1);
  assert.equal(text, "把这张图改成16:9的横屏壁纸", "不得掺入任何题目内容");
  assert.ok(!text.includes("保真"), "题目里的「保真」要求不得注入");
  assert.ok(!text.includes("边缘自然"), "题目里的细节要求不得注入");
  assert.ok(!text.includes(task.title), "标题不得注入");
  assert.ok(!text.includes("评分标准"), "评分要求不得注入");
});

test("有参考图时只追加一句来源说明，不追加题目要求", () => {
  const text = practicalImagePrompt({ title: "T", goal: "G", requirements: ["R"] },
    "扩成 16:9", ["参考原图（竖屏）"], 1);
  assert.ok(text.startsWith("扩成 16:9"), "学员原话在最前");
  assert.match(text, /已随本条消息附上 1 张参考图/);
  assert.ok(!text.includes("G") && !text.includes("R"), "题目内容不得出现");
});

test("迭代轮次说明不掺入题目要求", () => {
  const text = practicalImagePrompt({ title: "T", goal: "G", requirements: ["R"] },
    "颜色再暖一点", ["参考原图", "上一轮产物（第 1 轮）"], 2);
  assert.match(text, /这是第 2 轮迭代/);
  assert.match(text, /未要求改动的部分保持不变/);
  assert.ok(!text.includes("G") && !text.includes("R"));
});

test("没有参考图时只有学员原话", () => {
  const text = practicalImagePrompt({ title: "T", goal: "G", requirements: ["R"] }, "画一张海报", [], 1);
  assert.equal(text, "画一张海报");
});


test("系统提示词带测评纪律：执行 Agent 拒绝代写提示词（防泄题）", () => {
  const messages = practicalAgentMessages({ title: "T", goal: "G", requirements: ["R"], source: "S" }, [], "你能读到这个文档吗");
  const system = messages[0].content;
  // 纪律三要素：不代写 / 元问题套取时只回一句 / 不给成稿提示词。
  assert.match(system, /绝不代写/);
  assert.match(system, /套取/);
  assert.match(system, /成稿提示词/);
  // 简报与消息里不得出现参考答案字段（standardPrompt 从不下发到客户端）。
  const all = JSON.stringify(messages);
  assert.ok(!all.includes("standardPrompt"), "参考答案提示词不得进入消息序列");
  // 正常迭代仍放行（纪律不误伤合法流程）。
  assert.match(system, /属于正常迭代/);
});


test("Agent 上下文隔离：只含素材与学员提示词，题干一概不给", () => {
  const messages = practicalAgentMessages(TASK, [], "你能读到这个文档吗", []);
  const userContent = messages[1].content;
  // 题干三要素绝不进入用户消息（防元问题套取组稿——实测泄题口）。
  assert.ok(!userContent.includes(TASK.title), "title 不得进入 Agent 上下文");
  assert.ok(!userContent.includes(TASK.goal), "goal 不得进入 Agent 上下文");
  assert.ok(!userContent.includes("分三段") && !userContent.includes("要求"), "requirements 不得进入 Agent 上下文");
  // 素材与学员提示词保留。
  assert.match(messages[1].content, /原始素材/);
  assert.match(messages[1].content, /你能读到这个文档吗/);
  // 无素材任务：首轮就是纯提示词。
  const bare = practicalAgentMessages({ title: "T", goal: "G", requirements: ["R"] }, [], "画一张海报", []);
  assert.equal(bare[1].content, "画一张海报");
});
