import { caseCatalogLine } from "./agent-skills.js";

/** Conversation plumbing for the home-page floating agent 「小Q」.
 *
 * Kept DOM-free on purpose: the payload shaping is covered by node tests,
 * the component only streams. The proxy (worker/deepseek.js) accepts at most
 * 16 messages and 12k characters each, so the history is trimmed here long
 * before those ceilings matter. */

export const AGENT_NAME = "小Q";

const SKILL_MANUAL = [
  "你除了聊天还拥有技能。需要行动时，把指令写在回复文本中（系统会执行它并从展示文本里移除，用户看不到指令本身）：",
  "- [[go:home]] / [[go:cases]] / [[go:forum]] / [[go:assessment]]：带用户跳转到首页 / 案例库 / 论坛 / 开始 AI 测评。",
  "- [[search-cases:关键词]]：帮用户在案例库里按关键词筛选并跳转过去。",
  "- [[recommend-case:案例id]]：把某个具体案例作为卡片推荐给用户（点击可直达）。",
  "- [[open-case:案例id]]：直接为用户打开某个案例详情。",
  "指令使用规则：每条指令单独占一行；一条回复最多两条指令；用户明确想行动时才用，闲聊不要加指令；推荐案例前先确认案例id真实存在于下方目录。",
].join("\n");

export const AGENT_SYSTEM_PROMPT = [
  "你是 AIQUOS 平台的悬浮智能体「小Q」，居住在首页左下角。",
  "AIQUOS 是一个 AI 能力测评与创作学习平台：首页轮播真实 AI 案例，案例库收录作品与提示词，论坛是案例社区，测评包含综合闯关（客观题、对话题、实战题）。",
  "用简体中文轻松友好地回答；默认保持简短（一般不超过三句话），除非用户要求展开。",
  "不要编造平台不存在的功能；不知道就坦诚说明并给出建议。",
  SKILL_MANUAL,
  `案例目录（id（标签）：标题）——${caseCatalogLine()}。`,
].join("\n");

export const AGENT_GREETING =
  "嗨！我是小Q，AIQUOS 的悬浮智能体。想找案例灵感、了解测评玩法，还是随便聊聊 AI？";

const MAX_HISTORY = 8;
const MAX_CONTENT = 1200;

/** Shape the outbound payload: system prompt first (with the user's current
 * location so the model knows whether "go to cases" makes sense), then the
 * last few turns of clean chat history. Anything the proxy would reject
 * (empty content, foreign roles, oversized strings) is dropped or clipped
 * here instead. */
export function buildAgentMessages(history = [], context = {}) {
  const clean = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content.trim() : "" }))
    .filter((m) => m.content);
  const where = context.currentView
    ? ` 用户当前位于「${context.currentView}」。`
    : "";
  return [
    { role: "system", content: AGENT_SYSTEM_PROMPT + where },
    ...clean.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content.length > MAX_CONTENT ? m.content.slice(0, MAX_CONTENT) : m.content,
    })),
  ];
}
