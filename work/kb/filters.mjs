// 三层质量过滤词表（按 AGENTS.md 2026-10-03 记录的规律重建）：
//   ① 相关性——标题+简介必须命中 AI 主题词，且排除 40+ 无关领域词（排除词优先）；
//   ② 内容形态——排除短剧/漫剧/一口气看完/破解/薅羊毛等娱乐与非教学形态；
//   ③ 时长 ≥90 秒（梗视频播放量再高也不是学习资源）。

export const RELEVANCE_WORDS = [
  "AI", "Ai", "ai", "人工智能", "大模型", "LLM", "GPT", "ChatGPT", "chatgpt", "DeepSeek", "deepseek",
  "文心", "一言", "通义", "千问", "豆包", "Kimi", "kimi", "智谱", "GLM", "gemini", "Gemini", "Claude",
  "claude", "grok", "Grok", "sora", "Sora", "即梦", "可灵", "midjourney", "Midjourney", "stable diffusion",
  "Stable Diffusion", "SD绘画", "prompt", "Prompt", "提示词", "智能体", "Agent", "agent", "AIGC", "aigc",
  "生成式", "AIG", "机器学习", "深度学习", "神经网络", "自然语言处理", "NLP", "计算机视觉", "RAG",
  "知识库问答", "AGI", "数字人", "AI绘画", "AI绘画", "AI画", "AI视频", "AI写作", "AI编程", "AI办公",
  "AI工具", "AI教程", "AI应用", "自动化", "cursor", "Cursor", "copilot", "Copilot", "openai", "OpenAI",
  "huggingface", "transformer", "Transformer", "diffusion", "微调", "量化模型", "本地部署", "ai",
];

// 无关领域排除词（命中即淘汰，优先于相关性词）。注意不要误伤 AI+X 组合：
// "excel"+"AI" 的相关性判定靠 ①层的相关词命中，本层只排「无 AI 语境的纯领域词」。
export const EXCLUDE_DOMAIN_WORDS = [
  "考研", "高考", "专升本", "四六级", "雅思", "托福", "考公", "公务员", "教资", "教招",
  "王者荣耀", "原神", "我的世界", "minectaft", "minecraft", "MC教程", "和平精英", "蛋仔",
  "我的世界教育", "switch", "Switch", "PS5", "游戏攻略", "通关", "速通",
  "MATLAB", "matlab", "电工", "电赛", "数电", "模电", "单片机", "stm32", "STM32", "arduino",
  "会计", "初级会计", "CPA", "证券从业", "基金从业",
  "吉他", "钢琴", "尤克里里", "健身", "减肥操", "瑜伽", "做菜", "烘焙", "化妆", "穿搭",
  "装修", "木工", "钓鱼", "养鱼", "养猫", "训犬", "种植", "多肉",
  "java", "Java", "JAVA", "python基础", "前端开发", "html", "css", "js入门", "vue", "react入门",
  "ps教程", "pr教程", "ae教程", "cad", "CAD", "solidworks", "proe", "ug编程",
  "期货", "股票", "缠论", "麻将", "斗地主", "剧本杀", "狼人杀",
];

// 内容形态排除词：娱乐/非教学/灰产形态。
export const EXCLUDE_FORM_WORDS = [
  "短剧", "漫剧", "微短剧", "一口气看完", "完整版电影", "电影解说", "解说电影", "混剪",
  "验证码", "破解版", "破解软件", "白嫖", "薅羊毛", "刷单", "返利", "抽奖", "福利",
  "鬼畜", "整活", "爆肝", "沉浸式", "vlog", "Vlog", "VLOG", "直播回放", "切片", "高光集锦",
  "恋爱", "言情", "爽文", "小说推文", "推文小说", "广告植入", "恰饭", "带货", "拼团",
];

export const MIN_DURATION_SEC = 90;

const stripTags = (text) => String(text ?? "").replace(/<[^>]+>/g, "");

/**
 * 三层过滤：返回 { pass, reason }。输入为搜索结果原始字段。
 */
export function threeLayerFilter({ title, description, durationSec }) {
  const haystack = `${stripTags(title)} ${stripTags(description)}`;

  const domainHit = EXCLUDE_DOMAIN_WORDS.find((word) => haystack.includes(word));
  if (domainHit) return { pass: false, reason: `无关领域：${domainHit}` };

  const formHit = EXCLUDE_FORM_WORDS.find((word) => haystack.includes(word));
  if (formHit) return { pass: false, reason: `形态排除：${formHit}` };

  const relevant = RELEVANCE_WORDS.some((word) => haystack.includes(word));
  if (!relevant) return { pass: false, reason: "未命中 AI 相关词" };

  const seconds = Number(durationSec);
  if (!Number.isFinite(seconds) || seconds < MIN_DURATION_SEC) {
    return { pass: false, reason: `时长不足（${seconds}s < ${MIN_DURATION_SEC}s）` };
  }

  return { pass: true, reason: "" };
}
