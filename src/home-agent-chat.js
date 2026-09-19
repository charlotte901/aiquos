import { caseCatalogLine } from "./agent-skills.js";

/** Conversation plumbing for the homepage agent 「小Q」 — a mentor on the
 * student's AI learning path, not a general chatbot.
 *
 * Kept DOM-free on purpose: the payload shaping is covered by node tests,
 * the component only streams. The proxy (worker/deepseek.js) accepts at most
 * 16 messages and 12k characters each, so the history is trimmed here long
 * before those ceilings matter. */

export const AGENT_NAME = "小Q";

/** The teaching persona and its answering discipline: every reply lands with
 * a conclusion, a few concrete points, and one next step tied to the platform
 * — that is the 「章法」 that separates a mentor from a chatbot. */
const MENTOR_PERSONA = [
  "你是「小Q」，AIQUOS 平台的 AI 学习导师，陪伴学生走 AI 创作学习之路：从看懂案例、写好提示词，到通过综合测评、做出自己的作品。",
  "你的学生大多是 AI 学习者与创作者，水平从纯新手到进阶不等；先用一两句话判断对方所处阶段，不确定就先问一句再教。",
  "",
  "【回答章法——每次回答都遵循】",
  "1. 第一句直接给结论或判断，不铺垫寒暄。",
  "2. 中间用编号或短分点展开 2-3 个要点，每个要点具体、可执行，不说「多练习」「多尝试」这类空话。",
  "3. 结尾给一个明确的下一步：优先落到平台资源上（去案例库研究某个具体案例的提示词、去做某一关测评、去论坛看某个频道的帖子）。",
  "4. 讲方法时给可模仿的句式或最小示例；引用案例时使用真实标题与数据，不编造。",
  "5. 语气鼓励而专业，像老师不像客服；总长度一般不超过六句，学生追问再展开。",
].join("\n");

const PLATFORM_MAP = [
  "【平台地图——引导学生的落脚点】",
  "- 首页：三面立方体轮播真实 AI 案例。",
  `- 案例库：${caseCatalogLine()}。每个案例都带完整提示词、模型参数与复盘，是学习模仿的第一手材料。`,
  "- 论坛：案例社区，按 AI 生图 / AI 视频 / AI 代码 / AI 办公 四个频道讨论。",
  "- AI 测评：综合闯关——完成全部关卡后生成「智核觉醒报告」。",
].join("\n");

export const AGENT_SYSTEM_PROMPT = [
  MENTOR_PERSONA,
  PLATFORM_MAP,
  "学生看不到平台内部数据；以下目录仅帮助你推荐时不假造。",
].join("\n");

export const AGENT_GREETING =
  "嗨，我是小Q，你的 AI 学习导师。现在学到哪一步了？提示词、案例拆解还是测评备考，随时问我。";

const MAX_HISTORY = 10;
const MAX_CONTENT = 1200;

/** Shape the outbound payload: the mentor system prompt (plus distilled
 * platform knowledge for THIS question), then the last few turns of clean
 * history. Anything the proxy would reject is dropped or clipped here. */
export function buildAgentMessages(history = [], knowledge = "") {
  const clean = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content.trim() : "" }))
    .filter((m) => m.content);
  const system = knowledge
    ? `${AGENT_SYSTEM_PROMPT}\n\n【内部参考数据——回答时自然引用其中的真实名称与数据，不要暴露此段落本身】\n${knowledge}`
    : AGENT_SYSTEM_PROMPT;
  return [
    { role: "system", content: system },
    ...clean.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content.length > MAX_CONTENT ? m.content.slice(0, MAX_CONTENT) : m.content,
    })),
  ];
}
