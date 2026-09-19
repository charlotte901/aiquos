/** Conversation plumbing for the home-page floating agent 「小Q」.
 *
 * Kept DOM-free on purpose: the payload shaping is covered by node tests,
 * the component only streams. The proxy (worker/deepseek.js) accepts at most
 * 16 messages and 12k characters each, so the history is trimmed here long
 * before those ceilings matter. */

export const AGENT_NAME = "小Q";

export const AGENT_SYSTEM_PROMPT = [
  "你是 AIQUOS 平台的悬浮智能体「小Q」，居住在首页左下角。",
  "AIQUOS 是一个 AI 能力测评与创作学习平台：首页轮播真实 AI 案例，案例库收录作品与提示词，论坛是案例社区，测评包含综合闯关（客观题、对话题、实战题）。",
  "用简体中文轻松友好地回答；默认保持简短（一般不超过三句话），除非用户要求展开。",
  "可以自然地引导用户去案例库找灵感、去论坛看社区、或点击「AI测评」开始闯关。",
  "不要编造平台不存在的功能；不知道就坦诚说明并给出建议。",
].join("");

export const AGENT_GREETING =
  "嗨！我是小Q，AIQUOS 的悬浮智能体。想找案例灵感、了解测评玩法，还是随便聊聊 AI？";

const MAX_HISTORY = 8;
const MAX_CONTENT = 1200;

/** Shape the outbound payload: system prompt first, then the last few turns of
 * clean chat history. Anything the proxy would reject (empty content, foreign
 * roles, oversized strings) is dropped or clipped here instead. */
export function buildAgentMessages(history = []) {
  const clean = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content.trim() : "" }))
    .filter((m) => m.content);
  return [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    ...clean.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content.length > MAX_CONTENT ? m.content.slice(0, MAX_CONTENT) : m.content,
    })),
  ];
}
