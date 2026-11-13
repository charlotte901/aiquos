// AI 知识库的分类骨架与 schema 校验（纯函数、零依赖，可回归测试）。
//
// 知识库是觉醒报告「个性化学习建议」的数据底座：推荐引擎在构建期把
// 5000 条学习对象按（维度 × 档位）预计算成查询槽位（scripts/build-knowledge-index.mjs），
// 运行时 report-recommendations.js 只查表——LLM 只参与离线标注，绝不进入
// 报告渲染路径（本仓库「算分不用模型」纪律在推荐层同样成立）。
//
// 分类轴必须与测评对齐：
//   六维 D1–D6 与 vendor 评分核心同名同键；
//   难度 low/medium/high ↔ DIFFICULTY_ANCHORS −1/0/+1；
//   测评档位 focus/developing/strong ↔ 推荐难度 low/medium/high（成对出现）。
//
// 150 子主题（六维 × 各 25）从题库考察方向与既有资源库扩展而来，
// 同时充当三件事：①采集搜索词表（keywords）；②LLM 标注的枚举域；
// ③推荐打散的分组键（同子主题 ≤2 条）。

import { DIMENSIONS, DIFFICULTY_ANCHORS } from "../../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

export { DIMENSIONS };

export const KNOWLEDGE_TYPES = Object.freeze(["video", "book_chapter", "doc", "article", "exercise"]);
export const DIFFICULTIES = Object.freeze(Object.keys(DIFFICULTY_ANCHORS)); // low | medium | high
export const BANDS = Object.freeze(["focus", "developing", "strong"]);

/** 档位 ↔ 推荐难度 的成对映射（focus 学员配 low 难度资源）。 */
export const BAND_OF_DIFFICULTY = Object.freeze({ low: "focus", medium: "developing", high: "strong" });
export const DIFFICULTY_OF_BAND = Object.freeze({ focus: "low", developing: "medium", strong: "high" });

/** 入库质量门槛（三道门之二）。 */
export const MIN_QUALITY = 4;

const sub = (dim, id, label, keywords) => ({ dim, id, label, keywords: Object.freeze(keywords) });

/** 150 子主题词表。id 全局唯一，kebab-case；keywords 为中文采集搜索词。 */
export const SUBTOPICS = Object.freeze([
  // ---- D1 AI基础认知（25）----
  sub("D1", "ai-basic-concepts", "AI 基本概念", ["人工智能入门", "AI 是什么", "AI 基础概念"]),
  sub("D1", "llm-principles", "大语言模型原理", ["大语言模型", "LLM 原理", "大模型工作机制"]),
  sub("D1", "token-prediction", "概率与 Token 预测", ["Token 预测", "语言模型概率", "next token"]),
  sub("D1", "generative-ai-overview", "生成式 AI 总览", ["生成式 AI", "AIGC 入门", "生成式人工智能"]),
  sub("D1", "model-capability-boundary", "模型能力边界", ["AI 能力边界", "大模型局限性", "AI 不擅长什么"]),
  sub("D1", "training-data-basics", "训练数据与知识来源", ["训练数据", "模型知识截止", "语料"]),
  sub("D1", "hallucination-basics", "幻觉现象认知", ["AI 幻觉", "大模型胡编", "幻觉原因"]),
  sub("D1", "model-landscape", "主流模型版图", ["大模型对比", "主流大模型", "模型盘点"]),
  sub("D1", "open-closed-models", "开源与闭源模型", ["开源大模型", "闭源模型", "开源 AI"]),
  sub("D1", "local-models", "本地部署模型", ["本地大模型", "离线部署", "Ollama"]),
  sub("D1", "multimodal-overview", "多模态模型", ["多模态大模型", "图文模型", "多模态 AI"]),
  sub("D1", "agent-overview", "Agent 智能体概念", ["AI Agent", "智能体", "AI 智能体入门"]),
  sub("D1", "rag-overview", "检索增强生成概念", ["RAG", "检索增强", "知识库问答"]),
  sub("D1", "fine-tuning-vs-prompting", "微调与提示的关系", ["微调", "fine-tune", "模型训练方式"]),
  sub("D1", "embedding-overview", "向量与语义表示", ["向量", "embedding", "语义向量"]),
  sub("D1", "diffusion-overview", "扩散模型原理", ["扩散模型", "stable diffusion 原理", "文生图原理"]),
  sub("D1", "context-window", "上下文窗口", ["上下文长度", "context window", "长文本"]),
  sub("D1", "model-selection-basics", "模型选型入门", ["模型选择", "怎么选大模型", "模型用途"]),
  sub("D1", "ai-development-history", "AI 发展史", ["人工智能历史", "AI 发展史", "深度学习历史"]),
  sub("D1", "agi-frontier", "AGI 与前沿争论", ["AGI", "通用人工智能", "超级智能"]),
  sub("D1", "emerging-model-trends", "新模型与新趋势", ["新模型发布", "大模型进展", "AI 趋势"]),
  sub("D1", "speech-models", "语音模型", ["语音识别", "TTS", "语音大模型"]),
  sub("D1", "vision-models", "视觉模型", ["图像识别", "视觉 AI", "图像理解"]),
  sub("D1", "small-edge-models", "小模型与端侧模型", ["小模型", "端侧 AI", "轻量模型"]),
  sub("D1", "ai-math-basics", "AI 背后的数学直觉", ["机器学习数学", "神经网络原理", "深度学习入门"]),

  // ---- D2 提示词工程（25）----
  sub("D2", "structured-prompt", "结构化提示四段式", ["提示词结构", "结构化提示词", "提示词模板"]),
  sub("D2", "role-prompting", "角色设定", ["角色提示词", "AI 角色", "role prompting"]),
  sub("D2", "few-shot", "少样本示例", ["few-shot", "示例提示", "少样本提示"]),
  sub("D2", "chain-of-thought", "思维链", ["思维链", "chain of thought", "CoT 提示"]),
  sub("D2", "prompt-iteration", "提示词迭代", ["提示词优化", "提示词迭代", "改提示词"]),
  sub("D2", "output-format-control", "输出格式控制", ["输出格式", "格式要求", "结构化输出"]),
  sub("D2", "constraint-writing", "约束条件书写", ["约束条件", "限制条件", "提示词约束"]),
  sub("D2", "acceptance-criteria", "验收标准表达", ["验收标准", "任务要求", "提示词验收"]),
  sub("D2", "prompt-templates", "提示词模板库", ["提示词模板", "prompt 模板", "提示词合集"]),
  sub("D2", "negative-prompt", "负向提示词", ["负向提示词", "negative prompt", "排除词"]),
  sub("D2", "image-prompt-craft", "图像提示词", ["绘画提示词", "AI 绘画描述", "生图提示词"]),
  sub("D2", "prompt-reuse", "提示词复用与沉淀", ["提示词复用", "提示词管理", "常用提示词"]),
  sub("D2", "task-decomposition-prompts", "任务拆解提示", ["任务拆解", "分步提示", "复杂任务提示"]),
  sub("D2", "meta-prompting", "元提示（让 AI 改提示）", ["元提示", "让 AI 写提示词", "prompt 优化器"]),
  sub("D2", "system-prompt-design", "系统提示词", ["system prompt", "系统提示词", "人设设定"]),
  sub("D2", "context-provision", "背景信息供给", ["背景信息", "上下文提供", "给 AI 背景"]),
  sub("D2", "long-context-prompting", "长文本提示", ["长文提示词", "长文本处理", "文档提示"]),
  sub("D2", "tone-style-control", "语气与风格控制", ["语气控制", "文风要求", "写作风格提示"]),
  sub("D2", "multilingual-prompting", "多语言提示", ["中英提示词", "翻译提示", "多语言"]),
  sub("D2", "prompt-testing", "提示词测试", ["提示词测试", "提示词评估", "A/B 提示"]),
  sub("D2", "prompt-versioning", "提示词版本管理", ["提示词版本", "提示词工程化", "提示词管理工具"]),
  sub("D2", "common-prompt-mistakes", "常见提示词误区", ["提示词误区", "提示词错误", "无效提示"]),
  sub("D2", "prompt-patterns", "提示模式总览", ["提示模式", "prompt patterns", "提示技巧合集"]),
  sub("D2", "reasoning-prompts", "推理类提示", ["推理提示", "逻辑推理", "分析提示词"]),
  sub("D2", "creative-prompting", "创意生成提示", ["创意提示词", "AI 写作提示", "头脑风暴提示"]),

  // ---- D3 AI工具使用（25）----
  sub("D3", "chat-assistants", "对话助手使用", ["AI 对话", "ChatGPT 使用", "AI 助手"]),
  sub("D3", "deep-research-tools", "深度研究工具", ["deep research", "深度研究", "AI 调研"]),
  sub("D3", "web-search-modes", "联网检索模式", ["AI 联网", "联网搜索", "AI 搜索"]),
  sub("D3", "file-analysis-tools", "文件与文档分析", ["文档分析", "PDF 解读", "文件上传 AI"]),
  sub("D3", "data-analysis-tools", "数据分析工具", ["AI 数据分析", "excel AI", "表格分析"]),
  sub("D3", "image-generation-tools", "图像生成工具", ["AI 绘画", "文生图", "AI 画图"]),
  sub("D3", "image-editing-tools", "图像编辑工具", ["AI 修图", "图像编辑", "AI P 图"]),
  sub("D3", "video-generation-tools", "视频生成工具", ["AI 视频", "文生视频", "AI 剪辑"]),
  sub("D3", "audio-tools", "音频工具", ["AI 音乐", "AI 配音", "语音生成"]),
  sub("D3", "presentation-tools", "演示文稿工具", ["AI PPT", "PPT 生成", "演示文稿 AI"]),
  sub("D3", "document-writing-tools", "文档写作工具", ["AI 写作", "AI 文档", "AI 排版"]),
  sub("D3", "coding-assistants", "编程助手", ["AI 编程", "代码助手", "AI 写代码"]),
  sub("D3", "office-copilots", "办公 Copilot", ["copilot", "office AI", "办公助手"]),
  sub("D3", "note-knowledge-tools", "笔记与知识管理", ["AI 笔记", "笔记软件 AI", "知识管理"]),
  sub("D3", "translation-tools", "翻译工具", ["AI 翻译", "机器翻译", "同声传译 AI"]),
  sub("D3", "meeting-tools", "会议工具", ["会议纪要 AI", "AI 转写", "会议助手"]),
  sub("D3", "agent-tools", "智能体平台", ["智能体平台", "AI agent 工具", "bot 搭建"]),
  sub("D3", "browser-automation", "浏览器自动化", ["浏览器自动化", "browser use", "网页操作 AI"]),
  sub("D3", "workflow-automation", "工作流编排", ["工作流自动化", "n8n", "自动化流程"]),
  sub("D3", "rag-tooling", "知识库搭建工具", ["知识库搭建", "RAG 工具", "私有知识库"]),
  sub("D3", "chatbot-building", "机器人搭建", ["AI 客服", "机器人搭建", "chatbot"]),
  sub("D3", "api-basics", "API 调用基础", ["API 调用", "大模型 API", "接口使用"]),
  sub("D3", "tool-selection", "工具选择决策", ["AI 工具选择", "工具对比", "怎么选工具"]),
  sub("D3", "tool-landscape", "工具版图盘点", ["AI 工具盘点", "AI 工具大全", "神器合集"]),
  sub("D3", "productivity-integration", "效率工具组合", ["效率工具", "AI 提效", "工作流工具"]),

  // ---- D4 AI结果评估与优化（25）----
  sub("D4", "fact-checking", "事实核查", ["事实核查", "fact check", "查证"]),
  sub("D4", "source-verification", "来源验证", ["来源验证", "信源核查", "引用来源"]),
  sub("D4", "hallucination-detection", "幻觉识别", ["识别幻觉", "AI 一本正经胡说", "幻觉检测"]),
  sub("D4", "citation-checking", "引用与出处核对", ["引用核对", "参考文献核查", "出处检查"]),
  sub("D4", "output-critique", "输出批判性审读", ["批判性思维 AI", "审视 AI 输出", "质疑 AI"]),
  sub("D4", "rubric-design", "核查清单设计", ["核查清单", "检查清单", "评估标准"]),
  sub("D4", "iterative-refinement", "迭代优化产出", ["迭代优化", "多轮优化", "AI 修改"]),
  sub("D4", "feedback-loops", "反馈循环", ["反馈循环", "反馈机制", "复盘 AI"]),
  sub("D4", "self-critique", "让 AI 自检", ["AI 自检", "自我批评", "让 AI 检查"]),
  sub("D4", "cross-validation", "交叉验证", ["交叉验证", "多模型对比验证", "互相校验"]),
  sub("D4", "bias-in-outputs", "输出偏见识别", ["输出偏见", "AI 歧视", "偏见识别"]),
  sub("D4", "quality-metrics", "质量度量", ["质量评估", "评估指标", "输出质量"]),
  sub("D4", "benchmark-basics", "基准测试认知", ["benchmark", "模型评测", "榜单"]),
  sub("D4", "numeric-verification", "数值与计算核对", ["数值核对", "AI 计算 错误", "数据核对"]),
  sub("D4", "code-output-review", "代码结果审查", ["代码审查", "AI 代码验证", "代码检查"]),
  sub("D4", "data-verification", "数据结论核验", ["数据核验", "统计核查", "结论验证"]),
  sub("D4", "visual-output-review", "图像视频产物审读", ["AI 图 修改", "生图检查", "画面问题"]),
  sub("D4", "text-consistency", "文本一致性与逻辑", ["逻辑一致性", "前后矛盾", "文本逻辑"]),
  sub("D4", "completeness-check", "完整性与遗漏检查", ["完整性检查", "遗漏检查", "覆盖度"]),
  sub("D4", "risk-assessment-output", "风险评估意识", ["风险评估", "AI 风险", "决策风险"]),
  sub("D4", "optimization-strategies", "优化策略总览", ["优化策略", "改进方法", "调优"]),
  sub("D4", "error-taxonomy", "错误类型归类", ["错误类型", "错误分析", "失败模式"]),
  sub("D4", "ai-evaluating-ai", "用 AI 评估 AI", ["AI 评估 AI", "模型评模型", "AI 评审"]),
  sub("D4", "regression-testing-prompts", "提示回归测试", ["回归测试", "提示词回归", "效果稳定性"]),
  sub("D4", "human-review-workflow", "人工复核流程", ["人工复核", "human in the loop 审核", "终审流程"]),

  // ---- D5 人机协同解决问题（25）----
  sub("D5", "task-decomposition-method", "任务拆解方法", ["任务拆解方法", "拆解问题", "分步解决"]),
  sub("D5", "role-division", "人机分工", ["人机分工", "AI 分工", "哪些交给 AI"]),
  sub("D5", "workflow-design", "工作流设计", ["工作流设计", "流程设计", "协作流程"]),
  sub("D5", "human-in-loop", "关键节点人工判断", ["人工判断", "关键节点", "人机协同把关"]),
  sub("D5", "brainstorming-with-ai", "AI 头脑风暴", ["头脑风暴 AI", "创意发散", "AI 灵感"]),
  sub("D5", "ai-in-writing", "AI 辅助写作", ["AI 写作", "写作辅助", "AI 文案"]),
  sub("D5", "ai-in-research", "AI 辅助调研", ["AI 调研", "文献调研", "资料搜集 AI"]),
  sub("D5", "ai-in-planning", "AI 辅助规划", ["AI 规划", "计划制定", "AI 项目计划"]),
  sub("D5", "ai-in-decision", "AI 辅助决策", ["AI 决策", "决策支持", "数据驱动决策"]),
  sub("D5", "ai-in-learning", "AI 辅助学习", ["AI 学习", "用 AI 学习", "AI 自学"]),
  sub("D5", "ai-in-programming-workflow", "AI 编程实战协作", ["AI 编程实战", "结对编程 AI", "开发协作"]),
  sub("D5", "ai-in-office-work", "办公场景协同", ["办公 AI", "职场 AI", "效率办公"]),
  sub("D5", "ai-in-marketing", "营销内容协同", ["AI 营销", "内容营销 AI", "AI 运营"]),
  sub("D5", "ai-in-education-work", "教学场景协同", ["AI 教学", "教师 AI", "备课 AI"]),
  sub("D5", "ai-in-legal-work", "法务场景协同", ["法律 AI", "AI 合同", "法务大模型"]),
  sub("D5", "ai-in-finance-work", "财务场景协同", ["财务 AI", "AI 报表", "会计 AI"]),
  sub("D5", "ai-in-design-work", "设计场景协同", ["设计 AI", "AI 设计", "设计协作"]),
  sub("D5", "knowledge-management-ai", "知识管理与沉淀", ["知识沉淀", "经验显性化", "方法论"]),
  sub("D5", "team-ai-collaboration", "团队协作 AI", ["团队 AI", "协作工具", "AI 团队工作"]),
  sub("D5", "multi-agent-collaboration", "多智能体协作", ["多智能体", "multi-agent", "AI 协作"]),
  sub("D5", "context-handover", "上下文交接", ["上下文交接", "会话管理", "任务交接"]),
  sub("D5", "personal-assistant-setup", "个人助理搭建", ["个人助理", "AI 秘书", "私人助理"]),
  sub("D5", "automation-vs-judgment", "自动化与判断边界", ["自动化边界", "何时人工", "自动化判断"]),
  sub("D5", "failure-recovery", "失败恢复与兜底", ["失败恢复", "兜底方案", "降级策略"]),
  sub("D5", "scaling-productivity", "个人生产力放大", ["生产力放大", "一人公司 AI", "效率翻倍"]),

  // ---- D6 AI伦理与合规（25）----
  sub("D6", "privacy-basics", "隐私保护基础", ["隐私保护", "个人信息", "数据隐私"]),
  sub("D6", "data-desensitization", "数据脱敏实践", ["数据脱敏", "脱敏处理", "匿名化"]),
  sub("D6", "copyright-basics", "版权基础", ["版权", "著作权", "知识产权"]),
  sub("D6", "ai-content-copyright", "AI 生成内容版权", ["AI 版权", "AI 生成内容 著作权", "AIGC 版权"]),
  sub("D6", "ip-infringement-cases", "侵权案例与判例", ["AI 侵权", "判例", "侵权纠纷"]),
  sub("D6", "bias-fairness", "偏见与公平", ["算法偏见", "AI 公平", "歧视"]),
  sub("D6", "transparency-explainability", "透明与可解释", ["可解释性", "黑箱", "算法透明"]),
  sub("D6", "accountability", "责任归属", ["责任归属", "AI 事故责任", "问责"]),
  sub("D6", "deepfake-risks", "深度伪造风险", ["deepfake", "深度伪造", "AI 换脸 风险"]),
  sub("D6", "misinformation", "虚假信息治理", ["虚假信息", "谣言 治理", "AI 造假"]),
  sub("D6", "academic-integrity", "学术诚信", ["学术诚信", "AI 论文", "学术不端"]),
  sub("D6", "education-ethics", "教育场景伦理", ["AI 教育 伦理", "学生 使用 AI", "教育公平"]),
  sub("D6", "workplace-ethics", "职场使用伦理", ["职场 AI 伦理", "公司 AI 政策", "雇佣 AI"]),
  sub("D6", "security-risks", "安全风险", ["AI 安全", "安全风险", "攻击"]),
  sub("D6", "prompt-injection-risks", "提示注入风险", ["提示注入", "prompt injection", "注入攻击"]),
  sub("D6", "data-security-compliance", "数据安全合规", ["数据安全法", "数据合规", "跨境数据"]),
  sub("D6", "compliance-frameworks", "合规框架", ["合规框架", "AI 治理", "合规体系"]),
  sub("D6", "eu-ai-act", "欧盟 AI 法案", ["欧盟 AI 法案", "AI act", "欧盟监管"]),
  sub("D6", "china-ai-regulations", "国内 AI 监管", ["生成式人工智能管理", "AI 监管 中国", "备案"]),
  sub("D6", "industry-standards", "行业标准与认证", ["行业标准", "AI 认证", "ISO AI"]),
  sub("D6", "responsible-ai", "负责任 AI 原则", ["负责任 AI", "responsible AI", "科技向善"]),
  sub("D6", "ai-safety-basics", "AI 安全基础", ["AI safety", "对齐", "AI 风险"]),
  sub("D6", "human-oversight", "人类监督义务", ["人类监督", "人工监管", "final say"]),
  sub("D6", "ethical-decision-frameworks", "伦理决策框架", ["伦理决策", "道德框架", "伦理困境"]),
  sub("D6", "ai-social-impact", "AI 社会影响", ["AI 社会影响", "就业 冲击", "数字鸿沟"]),
]);

export const SUBTOPIC_IDS = Object.freeze(SUBTOPICS.map((topic) => topic.id));
const SUBTOPIC_BY_ID = new Map(SUBTOPICS.map((topic) => [topic.id, topic]));
const DIMENSION_KEYS = new Set(DIMENSIONS.map((dimension) => dimension.key));

/** 按维度取子主题（采集按维度分组扫描时使用）。 */
export function subtopicsOf(dim) {
  return SUBTOPICS.filter((topic) => topic.dim === dim);
}

export function subtopicById(id) {
  return SUBTOPIC_BY_ID.get(id) ?? null;
}

/** URL 必须指向具体页面而非裸域名（沿用 LEARNING_RESOURCES 的护栏口径）。
 * 例：https://a.com/ 不合格；https://a.com/learn 合格；带 ?q= 或 #anchor 也算具体页。 */
export function isSpecificPageUrl(url) {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.pathname !== "/" ) return true;
  return parsed.search.length > 0 || parsed.hash.length > 0;
}

const isNonEmptyString = (value, max = 200) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

/**
 * 校验一条知识库条目。返回 { ok, errors }（不抛异常，便于批量报告）。
 */
export function validateKnowledgeEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== "object") return { ok: false, errors: ["条目必须是对象"] };

  if (!/^kb-\d{6}$/.test(String(entry.id))) errors.push("id 必须形如 kb-000001");
  if (!isNonEmptyString(entry.title, 200)) errors.push("title 必须是 1–200 字符");
  if (!isSpecificPageUrl(entry.url)) errors.push("url 必须是 https 且指向具体页面（非裸域名）");
  if (!isNonEmptyString(entry.source, 80)) errors.push("source 不能为空");

  if (!KNOWLEDGE_TYPES.includes(entry.type)) errors.push(`type 必须是 ${KNOWLEDGE_TYPES.join("|")} 之一`);

  if (!Array.isArray(entry.dims) || entry.dims.length < 1 || entry.dims.length > 2
    || entry.dims.some((key) => !DIMENSION_KEYS.has(key))
    || new Set(entry.dims).size !== entry.dims.length) {
    errors.push("dims 必须是 D1–D6 中 1–2 个不重复键");
  }

  const topic = SUBTOPIC_BY_ID.get(entry.subtopic);
  if (!topic) errors.push("subtopic 不在 150 子主题词表内");
  else if (Array.isArray(entry.dims) && !entry.dims.includes(topic.dim)) {
    errors.push(`subtopic ${topic.id} 属于 ${topic.dim}，必须包含在 dims 中`);
  }

  if (!DIFFICULTIES.includes(entry.difficulty)) errors.push(`difficulty 必须是 ${DIFFICULTIES.join("|")} 之一`);
  if (!BANDS.includes(entry.band)) errors.push(`band 必须是 ${BANDS.join("|")} 之一`);
  if (BANDS.includes(entry.band) && DIFFICULTY_OF_BAND[entry.band] !== entry.difficulty) {
    errors.push(`band 与 difficulty 必须成对（${entry.band} 对应 ${DIFFICULTY_OF_BAND[entry.band]}）`);
  }

  if (!isNonEmptyString(entry.summary, 120)) errors.push("summary 必须是 1–120 字符");
  if (!isNonEmptyString(entry.why, 120)) errors.push("why 必须是 1–120 字符");

  if (typeof entry.quality !== "number" || !Number.isFinite(entry.quality)
    || entry.quality < 1 || entry.quality > 5) {
    errors.push("quality 必须是 1–5 的数值");
  }

  const signals = entry.signals ?? {};
  if (!signals || typeof signals !== "object" || Array.isArray(signals)) errors.push("signals 必须是对象");
  else {
    if (!ISO_DATE.test(String(signals.verifiedAt ?? ""))) errors.push("signals.verifiedAt 必须是 YYYY-MM-DD 日期");
    if (signals.views != null && (!Number.isFinite(Number(signals.views)) || Number(signals.views) < 0)) errors.push("signals.views 必须是非负数值");
    if (signals.durationMin != null && (!Number.isFinite(Number(signals.durationMin)) || Number(signals.durationMin) <= 0)) errors.push("signals.durationMin 必须是正数值");
    if (signals.date != null && !/^\d{4}(-\d{2}-\d{2})?$/.test(String(signals.date))) errors.push("signals.date 必须是 YYYY 或 YYYY-MM-DD");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 三道门（入库判定，全部满足才入库）：
 *   门一 schema 合法；门二 LLM 质量分 ≥ MIN_QUALITY；门三 已通过失效体检
 *   （verifiedAt 存在）且视频类满足播放量门槛。返回 { ok, reasons }。
 */
export function admitKnowledgeEntry(entry, { minQuality = MIN_QUALITY, minViews = 0 } = {}) {
  const reasons = [];
  const validation = validateKnowledgeEntry(entry);
  if (!validation.ok) reasons.push(...validation.errors.map((error) => `schema: ${error}`));
  if (Number.isFinite(Number(entry?.quality)) && entry.quality < minQuality) reasons.push(`quality ${entry.quality} < ${minQuality}`);
  if (entry?.type === "video" && Number.isFinite(Number(entry?.signals?.views)) && entry.signals.views < minViews) {
    reasons.push(`views ${entry.signals.views} < ${minViews}`);
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * 整库配额检查：六维覆盖不得偏科。返回 { ok, perDim, missing }。
 * library 未达标规模时（total < floors 成立所需的最低量）直接判定不适用方为 ok=false。
 */
export function checkDimensionQuotas(entries, { perDimMin = 600 } = {}) {
  const perDim = Object.fromEntries([...DIMENSION_KEYS].map((key) => [key, 0]));
  for (const entry of entries) {
    for (const key of entry?.dims ?? []) if (key in perDim) perDim[key] += 1;
  }
  const missing = Object.entries(perDim).filter(([, count]) => count < perDimMin).map(([key]) => key);
  return { ok: missing.length === 0, perDim, missing };
}

/** 整库唯一性检查：id 与 url 都不得重复（同 url 不同 id 视为重复条目）。 */
export function findDuplicates(entries) {
  const seenId = new Map();
  const seenUrl = new Map();
  const duplicateIds = [];
  const duplicateUrls = [];
  for (const entry of entries) {
    if (seenId.has(entry.id)) duplicateIds.push(entry.id);
    seenId.set(entry.id, true);
    if (seenUrl.has(entry.url)) duplicateUrls.push(entry.url);
    seenUrl.set(entry.url, true);
  }
  return { duplicateIds: [...new Set(duplicateIds)], duplicateUrls: [...new Set(duplicateUrls)] };
}
