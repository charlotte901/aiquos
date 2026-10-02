// 个性化学习方案下载器：根据觉醒报告的总分与六维分数生成 Word/PDF 文档。
// 资源库是本地静态数据，不依赖模型；分数只决定评价、建议与资源匹配顺序。

// Word 和 PDF 共用同一套版式口径，避免两个导出口径逐渐漂移。
export const LEARNING_PLAN_STYLE = Object.freeze({
  page: Object.freeze({
    width: 595.3,
    height: 841.9,
    marginTop: 52,
    marginRight: 64,
    marginBottom: 54,
    marginLeft: 64,
  }),
  colors: Object.freeze({
    brand: "#155CCA",
    heading: "#000000",
    ink: "#202533",
    muted: "#5B6B7E",
    card: "#F8FAFF",
    border: "#DCE7FA",
    footnote: "#7B869A",
  }),
  type: Object.freeze({
    brandSize: 9,
    brandLineHeight: 18,
    titleSize: 24,
    titleLineHeight: 48,
    metaSize: 9.5,
    metaLineHeight: 15,
    headingSize: 16,
    headingLineHeight: 22,
    bodySize: 12,
    bodyLineHeight: 19,
    cardTitleSize: 12.5,
    cardTitleLineHeight: 18,
    smallSize: 9.5,
    smallLineHeight: 14,
    footnoteSize: 8.5,
    footnoteLineHeight: 13,
  }),
  space: Object.freeze({
    contentWidth: 467.3,
    headerGap: 20,
    paragraphGap: 9,
    headingGap: 7,
    cardGap: 10,
    cardPadding: 11,
    lineGap: 5,
  }),
});

export const LEARNING_RESOURCES = [
  { title: "Elements of AI", platform: "University of Helsinki", type: "通识课程", stage: "D", dims: ["D1", "D6"], note: "用零代码方式理解 AI 的基本概念、能力边界与社会影响。", url: "https://course.elementsofai.com/" },
  { title: "AI For Everyone", platform: "Coursera", type: "通识课程", stage: "D", dims: ["D1", "D5", "D6"], note: "建立非技术视角的 AI 项目判断与协作语言。", url: "https://www.coursera.org/learn/ai-for-everyone" },
  { title: "Google AI Essentials", platform: "Google & Coursera", type: "实践课程", stage: "D", dims: ["D1", "D3"], note: "从日常任务开始练习提示词、生成结果复核与工具选择。", url: "https://www.coursera.org/learn/google-ai-essentials" },
  { title: "AI Foundations for Everyone", platform: "IBM", type: "入门课程", stage: "D", dims: ["D1", "D6"], note: "认识 AI 服务、模型类型与基础合规风险。", url: "https://www.coursera.org/learn/ai-foundations-for-everyone" },
  { title: "Get Started with AI", platform: "Microsoft Learn", type: "学习路径", stage: "D", dims: ["D1", "D3"], note: "按官方路径理解机器学习、生成式 AI 与常见应用。", url: "https://learn.microsoft.com/en-us/training/paths/get-started-with-artificial-intelligence/" },
  { title: "Introduction to Generative AI", platform: "Microsoft Learn", type: "学习路径", stage: "D", dims: ["D1", "D3"], note: "了解生成式模型如何工作，以及适合它们的任务类型。", url: "https://learn.microsoft.com/en-us/training/paths/introduction-generative-ai/" },
  { title: "Machine Learning Crash Course", platform: "Google Developers", type: "基础课程", stage: "D", dims: ["D1", "D4"], note: "掌握训练数据、预测、误差与模型评估的直观含义。", url: "https://developers.google.com/machine-learning/crash-course" },
  { title: "Generative AI Learning Path", platform: "Google Cloud Skills Boost", type: "学习路径", stage: "D", dims: ["D1", "D3"], note: "用分模块实验认识大模型、责任 AI 与应用场景。", url: "https://www.cloudskillsboost.google/paths/118" },
  { title: "Intro to Machine Learning", platform: "Kaggle Learn", type: "动手课程", stage: "D", dims: ["D1", "D4"], note: "通过短课与代码示例理解模型训练与验证。", url: "https://www.kaggle.com/learn/intro-to-machine-learning" },
  { title: "Intro to AI Ethics", platform: "Kaggle Learn", type: "案例课程", stage: "D", dims: ["D1", "D6"], note: "用真实数据集讨论偏见、隐私与模型后果。", url: "https://www.kaggle.com/learn/intro-to-ai-ethics" },
  { title: "Prompt Engineering", platform: "Kaggle Learn", type: "动手课程", stage: "D", dims: ["D2", "D3"], note: "练习把模糊需求改写成可验证的大模型指令。", url: "https://www.kaggle.com/learn/prompt-engineering" },
  { title: "Learn Prompting: Introduction", platform: "Learn Prompting", type: "教程", stage: "D", dims: ["D2", "D3"], note: "从最基础的四段式指令开始建立提示词习惯。", url: "https://learnprompting.org/docs/introduction" },
  { title: "Prompt Engineering Guide", platform: "DAIR.AI", type: "教程合集", stage: "D", dims: ["D2", "D4"], note: "查阅角色设定、示例、约束与迭代提示的方法。", url: "https://www.promptingguide.ai/" },
  { title: "Prompt Engineering Guide", platform: "OpenAI", type: "官方指南", stage: "D", dims: ["D2", "D3", "D4"], note: "学习官方推荐的指令结构、上下文与输出控制。", url: "https://platform.openai.com/docs/guides/prompt-engineering" },
  { title: "Prompt Engineering Overview", platform: "Anthropic Docs", type: "官方指南", stage: "D", dims: ["D2", "D4"], note: "对比不同提示策略，学会用边界条件检查模型输出。", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview" },
  { title: "Gemini Prompting Strategies", platform: "Google AI", type: "官方指南", stage: "D", dims: ["D2", "D3"], note: "练习多模态任务中的角色、格式与约束表达。", url: "https://ai.google.dev/gemini-api/docs/prompting-strategies" },
  { title: "Azure OpenAI Prompt Engineering", platform: "Microsoft Learn", type: "官方指南", stage: "D", dims: ["D2", "D4"], note: "理解企业场景中的指令设计与安全控制。", url: "https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/prompt-engineering" },
  { title: "Machine Learning with Python", platform: "freeCodeCamp", type: "认证课程", stage: "D", dims: ["D1", "D3"], note: "用项目练习把 AI 概念转成可运行的工作流。", url: "https://www.freecodecamp.org/learn/machine-learning-with-python/" },
  { title: "Data Analysis with Python", platform: "freeCodeCamp", type: "认证课程", stage: "D", dims: ["D3", "D4"], note: "练习数据清洗、图表解读与结论核查。", url: "https://www.freecodecamp.org/learn/data-analysis-with-python/" },
  { title: "Canva Design School", platform: "Canva", type: "工具教程", stage: "D", dims: ["D3", "D5"], note: "把 AI 辅助设计放进真实的表达与交付任务。", url: "https://www.canva.com/designschool/" },

  { title: "Generative AI for Everyone", platform: "DeepLearning.AI", type: "通识课程", stage: "C", dims: ["D1", "D2", "D5"], note: "理解生成式 AI 在工作流中的机会、限制与落地方式。", url: "https://www.deeplearning.ai/courses/generative-ai-for-everyone/" },
  { title: "Short Courses Library", platform: "DeepLearning.AI", type: "短课合集", stage: "C", dims: ["D2", "D3", "D5"], note: "选择提示、检索、Agent 等主题做短周期强化。", url: "https://www.deeplearning.ai/short-courses/" },
  { title: "Hugging Face Learn", platform: "Hugging Face", type: "课程入口", stage: "C", dims: ["D1", "D3", "D4"], note: "从模型、数据集到应用示例建立完整认知地图。", url: "https://huggingface.co/learn" },
  { title: "LLM Course", platform: "Hugging Face", type: "系统课程", stage: "C", dims: ["D1", "D3", "D4"], note: "理解大语言模型的输入、输出、微调与评估。", url: "https://huggingface.co/learn/llm-course/chapter1/1" },
  { title: "Diffusion Models Course", platform: "Hugging Face", type: "图像课程", stage: "C", dims: ["D3", "D4"], note: "学习图像生成的提示控制与质量判断。", url: "https://huggingface.co/learn/diffusion-course/unit0/1" },
  { title: "AI Agents Course", platform: "Hugging Face", type: "实践课程", stage: "C", dims: ["D3", "D5"], note: "把工具调用、任务拆解与验证组合成智能体流程。", url: "https://huggingface.co/learn/agents-course/unit0/introduction" },
  { title: "OpenAI Cookbook", platform: "OpenAI", type: "案例合集", stage: "C", dims: ["D2", "D3", "D4"], note: "用官方案例学习检索、函数调用与结果校验。", url: "https://cookbook.openai.com/" },
  { title: "Google AI Studio Docs", platform: "Google AI", type: "工具手册", stage: "C", dims: ["D2", "D3", "D4"], note: "练习多模态提示、系统指令与参数调节。", url: "https://ai.google.dev/" },
  { title: "Gemini API Documentation", platform: "Google AI", type: "工具手册", stage: "C", dims: ["D2", "D3", "D4"], note: "掌握文本、图像与结构化输出的调用方式。", url: "https://ai.google.dev/gemini-api/docs" },
  { title: "OpenAI API Documentation", platform: "OpenAI", type: "工具手册", stage: "C", dims: ["D2", "D3", "D4"], note: "学习模型选择、上下文管理与安全设置。", url: "https://platform.openai.com/docs" },
  { title: "Azure AI Foundry Documentation", platform: "Microsoft Learn", type: "工具手册", stage: "C", dims: ["D2", "D3", "D5"], note: "把模型、评估器与部署流程组织成企业工作流。", url: "https://learn.microsoft.com/en-us/azure/ai-foundry/" },
  { title: "AWS Machine Learning", platform: "AWS", type: "学习入口", stage: "C", dims: ["D3", "D4"], note: "了解云端模型训练、部署与治理的基础组件。", url: "https://aws.amazon.com/machine-learning/" },
  { title: "Generative AI Fundamentals", platform: "IBM", type: "基础课程", stage: "C", dims: ["D1", "D3", "D6"], note: "建立模型原理、应用设计与风险控制的三层视角。", url: "https://www.ibm.com/training/badge/generative-ai-fundamentals" },
  { title: "AI SkillsBuild", platform: "IBM SkillsBuild", type: "学习路径", stage: "C", dims: ["D1", "D5", "D6"], note: "用职业场景练习 AI 协作、决策与责任边界。", url: "https://skillsbuild.org/students/course-catalog/artificial-intelligence" },
  { title: "Career Essentials in Generative AI", platform: "Microsoft & LinkedIn", type: "职业课程", stage: "C", dims: ["D3", "D5"], note: "把生成式 AI 技能迁移到真实职业任务。", url: "https://www.linkedin.com/learning/paths/career-essentials-in-generative-ai-by-microsoft-and-linkedin" },
  { title: "Microsoft 365 Copilot Learning", platform: "Microsoft", type: "办公工具教程", stage: "C", dims: ["D3", "D5"], note: "练习文档、表格、会议与沟通中的 AI 协作。", url: "https://www.microsoft.com/en-us/microsoft-365/copilot/ai-learning" },
  { title: "Gemini for Google Workspace", platform: "Google Support", type: "办公工具教程", stage: "C", dims: ["D3", "D5"], note: "把 AI 提示嵌入邮件、文档与数据分析流程。", url: "https://support.google.com/a/users/answer/14287953" },
  { title: "Notion Academy", platform: "Notion", type: "工具教程", stage: "C", dims: ["D3", "D5"], note: "学习用结构化页面沉淀任务、资料与 AI 输出。", url: "https://www.notion.com/academy" },
  { title: "Zapier Learn", platform: "Zapier", type: "自动化教程", stage: "C", dims: ["D3", "D5"], note: "练习把重复流程转成可追踪的自动化步骤。", url: "https://zapier.com/learn" },
  { title: "ChatGPT Release Notes", platform: "OpenAI Help", type: "产品更新", stage: "C", dims: ["D3", "D4"], note: "跟踪工具能力变化，避免用过时假设评估输出。", url: "https://help.openai.com/en/articles/6825453-chatgpt-release-notes" },

  { title: "CS50 Artificial Intelligence with Python", platform: "Harvard", type: "系统课程", stage: "B", dims: ["D1", "D4", "D5"], note: "用搜索、学习与语言模型项目建立严谨问题意识。", url: "https://cs50.harvard.edu/ai/" },
  { title: "Artificial Intelligence", platform: "MIT OpenCourseWare", type: "大学课程", stage: "B", dims: ["D1", "D4"], note: "通过经典 AI 课题理解推理、搜索与知识表示。", url: "https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/" },
  { title: "CS229 Machine Learning", platform: "Stanford", type: "大学课程", stage: "B", dims: ["D1", "D4"], note: "补齐监督学习、优化与泛化能力的数学基础。", url: "https://cs229.stanford.edu/" },
  { title: "CS231N Deep Learning for Computer Vision", platform: "Stanford", type: "大学课程", stage: "B", dims: ["D1", "D4", "D5"], note: "理解视觉模型的训练逻辑、误差来源与应用边界。", url: "https://cs231n.stanford.edu/" },
  { title: "CS224N Natural Language Processing", platform: "Stanford", type: "大学课程", stage: "B", dims: ["D1", "D4", "D5"], note: "学习语言模型表示、评估与任务适配方法。", url: "https://web.stanford.edu/class/cs224n/" },
  { title: "Practical Deep Learning for Coders", platform: "fast.ai", type: "实战课程", stage: "B", dims: ["D3", "D4", "D5"], note: "先做出可用模型，再逐步理解内部机制与风险。", url: "https://course.fast.ai/" },
  { title: "Computer Vision Course", platform: "Hugging Face", type: "系统课程", stage: "B", dims: ["D3", "D4"], note: "练习图像分类、检测与生成结果的质量评估。", url: "https://huggingface.co/learn/computer-vision-course/unit0/welcome" },
  { title: "Audio Course", platform: "Hugging Face", type: "系统课程", stage: "B", dims: ["D3", "D4"], note: "认识语音与音频模型的输入限制和验证方法。", url: "https://huggingface.co/learn/audio-course/chapter0/introduction" },
  { title: "Deep Reinforcement Learning Course", platform: "Hugging Face", type: "系统课程", stage: "B", dims: ["D3", "D4", "D5"], note: "通过智能体实验理解目标、奖励与策略迭代。", url: "https://huggingface.co/learn/deep-rl-course/unit0/introduction" },
  { title: "Responsible AI Practices", platform: "Google AI", type: "官方指南", stage: "B", dims: ["D4", "D5", "D6"], note: "把公平、隐私、安全与解释性写进项目流程。", url: "https://ai.google/responsibilities/responsible-ai-practices/" },
  { title: "Responsible AI", platform: "Microsoft AI", type: "官方指南", stage: "B", dims: ["D4", "D6"], note: "学习公平性、可靠性、隐私安全与透明度的操作框架。", url: "https://www.microsoft.com/en-us/ai/responsible-ai" },
  { title: "Responsible AI", platform: "Google Cloud", type: "治理指南", stage: "B", dims: ["D4", "D5", "D6"], note: "了解企业部署中的人工审核与风险分级。", url: "https://cloud.google.com/responsible-ai" },
  { title: "AI Risk Management Framework", platform: "NIST", type: "治理框架", stage: "B", dims: ["D4", "D6"], note: "用可信 AI 的治理、映射、测量与管理流程评估风险。", url: "https://www.nist.gov/itl/ai-risk-management-framework" },
  { title: "Recommendation on the Ethics of AI", platform: "UNESCO", type: "伦理文本", stage: "B", dims: ["D1", "D6"], note: "从国际准则理解公平、透明与人类监督。", url: "https://www.unesco.org/en/artificial-intelligence/recommendation-ethics" },
  { title: "AI Policy Observatory", platform: "OECD", type: "政策数据库", stage: "B", dims: ["D1", "D6"], note: "比较不同国家和地区的 AI 治理与政策案例。", url: "https://oecd.ai/" },
  { title: "EU Artificial Intelligence Act", platform: "EU AI Act", type: "法规解读", stage: "B", dims: ["D1", "D6"], note: "理解风险分级、义务主体与合规检查点。", url: "https://artificialintelligenceact.eu/" },
  { title: "Partnership on AI", platform: "Partnership on AI", type: "案例与治理", stage: "B", dims: ["D5", "D6"], note: "研究多方协作下的社会影响与负责任实践。", url: "https://partnershiponai.org/" },
  { title: "Montreal AI Ethics Institute", platform: "MAIEI", type: "伦理研究", stage: "B", dims: ["D4", "D6"], note: "跟踪 AI 伦理议题、公众意见与实务分析。", url: "https://montrealethics.ai/" },
  { title: "AI Now Institute", platform: "AI Now", type: "社会研究", stage: "B", dims: ["D1", "D6"], note: "从权力、劳动与制度角度审视 AI 系统。", url: "https://ainowinstitute.org/" },
  { title: "Data & Society", platform: "Data & Society", type: "研究报告", stage: "B", dims: ["D4", "D6"], note: "用社会科学视角分析算法影响与治理挑战。", url: "https://datasociety.net/" },

  { title: "Stanford Institute for Human-Centered AI", platform: "Stanford HAI", type: "研究机构", stage: "A", dims: ["D1", "D5", "D6"], note: "阅读技术、政策与人文交叉的 AI 研究成果。", url: "https://hai.stanford.edu/" },
  { title: "MIT RAISE", platform: "MIT", type: "研究计划", stage: "A", dims: ["D1", "D5", "D6"], note: "了解 AI 与教育、社会责任结合的前沿项目。", url: "https://raise.mit.edu/" },
  { title: "Oxford Martin AI Programme", platform: "University of Oxford", type: "研究计划", stage: "A", dims: ["D1", "D4", "D6"], note: "研究 AI 对经济、治理与长期社会结构的影响。", url: "https://www.oxfordmartin.ox.ac.uk/artificial-intelligence" },
  { title: "AI Ethics & Governance", platform: "The Alan Turing Institute", type: "研究合集", stage: "A", dims: ["D4", "D6"], note: "学习数据伦理、公共部门 AI 与治理评估方法。", url: "https://www.turing.ac.uk/research/interests/ai-ethics" },
  { title: "Papers with Code", platform: "Papers with Code", type: "论文与代码", stage: "A", dims: ["D3", "D4", "D5"], note: "把研究进展与可复现代码、基准连接起来。", url: "https://paperswithcode.com/" },
  { title: "Computation and Language", platform: "arXiv", type: "论文更新", stage: "A", dims: ["D1", "D4"], note: "跟踪语言模型的新方法、评测与安全性研究。", url: "https://arxiv.org/list/cs.CL/recent" },
  { title: "Computer Vision and Pattern Recognition", platform: "arXiv", type: "论文更新", stage: "A", dims: ["D1", "D4"], note: "了解视觉生成、识别与多模态模型的发展。", url: "https://arxiv.org/list/cs.CV/recent" },
  { title: "Machine Learning", platform: "arXiv", type: "论文更新", stage: "A", dims: ["D1", "D4"], note: "阅读模型泛化、优化与可靠性的核心进展。", url: "https://arxiv.org/list/cs.LG/recent" },
  { title: "OpenAI News & Research", platform: "OpenAI", type: "研究动态", stage: "A", dims: ["D1", "D4", "D5"], note: "跟踪模型能力、安全研究与真实应用案例。", url: "https://openai.com/news/" },
  { title: "Google DeepMind Research", platform: "Google DeepMind", type: "研究动态", stage: "A", dims: ["D1", "D4", "D5"], note: "学习科学、推理与通用智能方向的前沿问题。", url: "https://deepmind.google/research/" },
  { title: "Google Research Blog", platform: "Google Research", type: "研究动态", stage: "A", dims: ["D1", "D4", "D5"], note: "了解机器学习、系统与社会技术研究的落地思考。", url: "https://research.google/blog/" },
  { title: "Meta AI Blog", platform: "Meta AI", type: "研究动态", stage: "A", dims: ["D1", "D4", "D5"], note: "阅读开放模型、多模态系统与基础研究案例。", url: "https://ai.meta.com/blog/" },
  { title: "Microsoft Research AI", platform: "Microsoft Research", type: "研究合集", stage: "A", dims: ["D1", "D4", "D5"], note: "学习模型、人机交互与负责任 AI 的系统研究。", url: "https://www.microsoft.com/en-us/research/research-area/artificial-intelligence/" },
  { title: "NVIDIA Research", platform: "NVIDIA", type: "研究合集", stage: "A", dims: ["D1", "D4", "D5"], note: "了解生成模型、图形学与高性能 AI 系统进展。", url: "https://www.nvidia.com/en-us/research/" },
  { title: "IBM Research AI", platform: "IBM Research", type: "研究合集", stage: "A", dims: ["D1", "D4", "D5"], note: "关注企业级 AI 的可靠性、治理与自动化研究。", url: "https://research.ibm.com/topics/artificial-intelligence" },
  { title: "Apple Machine Learning Research", platform: "Apple ML Research", type: "研究合集", stage: "A", dims: ["D1", "D4", "D5"], note: "研究隐私保护、端侧智能与多模态体验设计。", url: "https://machinelearning.apple.com/research" },
  { title: "Hugging Face Spaces", platform: "Hugging Face", type: "案例展廊", stage: "A", dims: ["D3", "D4", "D5"], note: "拆解社区应用的交互、提示与工程实现。", url: "https://huggingface.co/spaces" },
  { title: "Kaggle Models", platform: "Kaggle", type: "模型库", stage: "A", dims: ["D3", "D4", "D5"], note: "比较公开模型的输入、指标与实际表现。", url: "https://www.kaggle.com/models" },
  { title: "Kaggle Datasets", platform: "Kaggle", type: "数据资源", stage: "A", dims: ["D3", "D4", "D5"], note: "练习从数据质量、代表性与偏误评估结果。", url: "https://www.kaggle.com/datasets" },
  { title: "Kaggle Code", platform: "Kaggle", type: "案例代码", stage: "A", dims: ["D3", "D4", "D5"], note: "学习竞赛方案如何拆解问题并验证改进。", url: "https://www.kaggle.com/code" },

  { title: "Artificial Intelligence Coverage", platform: "MIT Technology Review", type: "深度报道", stage: "S", dims: ["D1", "D4", "D5"], note: "用技术与商业交叉视角判断 AI 趋势的真实成熟度。", url: "https://www.technologyreview.com/topic/artificial-intelligence/" },
  { title: "AI Coverage", platform: "Ars Technica", type: "科技报道", stage: "S", dims: ["D1", "D4"], note: "阅读技术细节更充分的模型与产品分析。", url: "https://arstechnica.com/ai/" },
  { title: "AI Coverage", platform: "The Verge", type: "科技报道", stage: "S", dims: ["D1", "D4"], note: "跟踪产品形态、用户体验与社会反应的变化。", url: "https://www.theverge.com/ai-artificial-intelligence" },
  { title: "AI Coverage", platform: "VentureBeat", type: "产业分析", stage: "S", dims: ["D1", "D4", "D5"], note: "研究企业落地、成本结构与模型能力差异。", url: "https://venturebeat.com/category/ai/" },
  { title: "NVIDIA Blog: AI & Deep Learning", platform: "NVIDIA", type: "产业博客", stage: "S", dims: ["D3", "D4", "D5"], note: "理解算力、系统架构与生成式应用的关系。", url: "https://blogs.nvidia.com/blog/category/deep-learning/" },
  { title: "Google Cloud AI Blog", platform: "Google Cloud", type: "产业博客", stage: "S", dims: ["D3", "D4", "D5"], note: "学习企业工作流、评估与部署的真实案例。", url: "https://cloud.google.com/blog/products/ai-machine-learning" },
  { title: "Azure AI Blog", platform: "Microsoft Azure", type: "产业博客", stage: "S", dims: ["D3", "D4", "D5"], note: "研究企业平台的模型治理与自动化实践。", url: "https://azure.microsoft.com/en-us/blog/topics/ai/" },
  { title: "Meta Engineering Blog: AI", platform: "Meta Engineering", type: "工程博客", stage: "S", dims: ["D3", "D4", "D5"], note: "了解大规模 AI 系统的工程取舍与基础设施。", url: "https://engineering.fb.com/category/ai/" },
  { title: "LangChain Documentation", platform: "LangChain", type: "进阶手册", stage: "S", dims: ["D2", "D3", "D4"], note: "构建检索增强、工具调用与可控输出流程。", url: "https://python.langchain.com/docs/introduction/" },
  { title: "Anthropic Documentation", platform: "Anthropic", type: "进阶手册", stage: "S", dims: ["D2", "D3", "D4"], note: "学习长上下文、安全设计与提示生命周期管理。", url: "https://docs.anthropic.com/" },
  { title: "PyTorch Tutorials", platform: "PyTorch", type: "进阶教程", stage: "S", dims: ["D3", "D4", "D5"], note: "用官方实验掌握模型构建、训练与性能评估。", url: "https://pytorch.org/tutorials/" },
  { title: "Microsoft AI Hub", platform: "Microsoft", type: "进阶入口", stage: "S", dims: ["D2", "D3", "D5"], note: "把模型、数据、代理与治理组织成解决方案。", url: "https://www.microsoft.com/en-us/ai" },
  { title: "NVIDIA Deep Learning Institute", platform: "NVIDIA", type: "进阶课程", stage: "S", dims: ["D3", "D5"], note: "通过专家实验掌握生成式 AI 与加速计算流程。", url: "https://www.nvidia.com/en-us/training/online/" },
  { title: "AWS Training: Artificial Intelligence", platform: "AWS", type: "进阶课程", stage: "S", dims: ["D3", "D5"], note: "学习云上 AI 架构、成本控制与运营治理。", url: "https://aws.amazon.com/training/learn-about/artificial-intelligence/" },
  { title: "Google Cloud Skills Boost", platform: "Google Cloud", type: "进阶实验", stage: "S", dims: ["D3", "D5"], note: "用实验卡片完成模型应用、数据与安全练习。", url: "https://www.cloudskillsboost.google/" },
  { title: "Machine Learning Specialization", platform: "DeepLearning.AI & Stanford Online", type: "专业课程", stage: "S", dims: ["D1", "D4", "D5"], note: "建立从模型假设到评估决策的完整方法体系。", url: "https://www.coursera.org/specializations/machine-learning-introduction" },
  { title: "AI Courses", platform: "edX", type: "课程合集", stage: "S", dims: ["D1", "D4", "D5"], note: "选择大学级 AI 专题补强理论、伦理或工程深度。", url: "https://www.edx.org/learn/artificial-intelligence" },
  { title: "Neural Networks Playlist", platform: "3Blue1Brown", type: "视频课程", stage: "S", dims: ["D1", "D4"], note: "用可视化理解神经网络、梯度与表示学习。", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi" },
  { title: "StatQuest with Josh Starmer", platform: "YouTube", type: "视频频道", stage: "S", dims: ["D1", "D4"], note: "用清晰图解补齐统计、机器学习与评估直觉。", url: "https://www.youtube.com/@statquest" },
  { title: "Two Minute Papers", platform: "YouTube", type: "视频频道", stage: "S", dims: ["D1", "D4", "D5"], note: "快速了解前沿研究亮点，再回到论文和代码深入验证。", url: "https://www.youtube.com/@TwoMinutePapers" },
];

const STAGE_META = {
  S: { label: "领先", action: "进入进阶专题、复杂项目复盘和跨工具工作流设计。" },
  A: { label: "优秀", action: "保持结构化练习，把已有能力迁移到更开放的真实任务。" },
  B: { label: "良好", action: "针对薄弱环节补齐流程、验收标准和结果复核习惯。" },
  C: { label: "合格", action: "先建立稳定的基础方法，再逐步提升任务复杂度。" },
  D: { label: "待提升", action: "从基础概念、最小任务和固定练习节奏开始重建信心。" },
};

const ADVICE_BY_DIMENSION = {
  D1: {
    S: "研究多模态、Agent 和模型能力边界，每周更新一份模型差异简报。",
    A: "巩固常见模型的适用边界，用对比表解释同类任务中的模型选择。",
    B: "整理模型特点、擅长任务、限制与失效场景，学完一类就复述一遍。",
    C: "从常用工具入手，弄清输入、输出、适合任务和明显限制。",
    D: "按概念、模型类型、能力边界和安全风险的顺序补基础。",
  },
  D2: {
    S: "沉淀可复用提示模板，建立约束条件、验收标准与示例库。",
    A: "练习严格管理角色、目标、格式、上下文与约束的一致性。",
    B: "用目标、背景、约束、示例和验收标准五段式改写提示词。",
    C: "从优秀提示开始模仿，先写清角色、目标和输出格式。",
    D: "练最小四段式：我是谁、我要什么、限制是什么、输出成什么格式。",
  },
  D3: {
    S: "设计检索、写作、数据分析与图像生成协同的跨工具工作流。",
    A: "熟练处理文件、长文档、表格、图片生成等复杂输入输出。",
    B: "围绕真实任务完整练习选工具、下指令、核对结果与二次优化。",
    C: "每周用一个工具完成一个固定任务，先建立稳定使用习惯。",
    D: "从会提问、会重试、会复制结果、会调整指令开始练基础操作。",
  },
  D4: {
    S: "建立量化核查清单，快速判断事实性、逻辑性、偏见和可用性。",
    A: "要求 AI 给出依据，并对关键结论主动交叉验证。",
    B: "每次都追问依据是什么、哪里可能错、如何核实。",
    C: "把第一轮结果中的问题写成新的改进指令，练习二次优化。",
    D: "建立重要结论必须有来源、不确定就人工查证的习惯。",
  },
  D5: {
    S: "把复杂项目拆成阶段计划、验收标准和人工判断点。",
    A: "明确人与 AI 的分工，让 AI 处理执行层，人负责关键决策。",
    B: "把大任务拆成三到五个可执行小任务，逐步交给 AI 完成。",
    C: "从中等复杂任务开始，先写清目标、步骤和期望结果。",
    D: "一次只给 AI 一个明确小任务，确认结果后再继续下一步。",
  },
  D6: {
    S: "制定项目或团队级 AI 使用规范，处理高风险与灰色场景。",
    A: "熟悉版权、隐私、偏见、脱敏和高风险决策复核。",
    B: "建立提交前检查：是否泄露隐私、是否侵权、是否有偏见。",
    C: "学习常见合规案例，练习识别不该输入 AI 的信息。",
    D: "守住三条底线：不输入敏感个人信息、不抄袭、不把结果当事实。",
  },
};

const DIMENSION_NAMES = {
  D1: "AI基础认知",
  D2: "提示词工程",
  D3: "AI工具使用",
  D4: "AI结果评估与优化",
  D5: "人机协同解决问题",
  D6: "AI伦理与合规",
};

const DETAILED_ADVICE_BY_DIMENSION = {
  D1: {
    S: {
      overview: "你已经能比较不同模型的能力边界，下一步要关注多模态、Agent 和模型更新的实际差异。",
      practice: "每周选一个真实任务，把同一需求交给两个模型完成，记录输入方式、输出质量、失败原因和适用场景。",
      checkpoint: "连续三周维护一份模型对比简报，能用三句话说清某个任务为什么选择某个模型。",
    },
    A: {
      overview: "你掌握了主流模型的基本适用范围，但对边界条件和复杂任务的选择依据还需要更稳定。",
      practice: "把文本、图像、数据分析类任务各选两个代表场景，分别测试不同模型，并整理成选择决策表。",
      checkpoint: "拿到新任务时，能先判断任务类型、上下文长度、输出格式和风险等级，再选择工具。",
    },
    B: {
      overview: "你了解常见 AI 工具，但模型特点、限制和失效场景还没有形成可复用的判断框架。",
      practice: "按“概念—模型类型—适合任务—限制—失效场景”整理学习笔记，每类工具用一个自己遇到过的例子验证。",
      checkpoint: "能用自己的语言解释五类常用任务分别适合什么模型，并指出至少两个不能依赖 AI 的场景。",
    },
    C: {
      overview: "你已经能使用工具完成任务，但还不容易说清模型的输入、输出和适用边界。",
      practice: "从最常用的三个工具开始，分别记录它们擅长什么、不擅长什么、哪些结果必须人工复核。",
      checkpoint: "两周内能为每个常用工具写出一段使用边界说明，并在下一次任务前主动检查是否匹配。",
    },
    D: {
      overview: "当前需要先补齐基础概念和安全使用意识，再进入复杂应用练习。",
      practice: "按顺序学习 AI 是什么、常见模型类型、输入输出方式、能力边界和安全风险，每学完一项用自己的话复述。",
      checkpoint: "能向别人解释一个 AI 任务从提问到复核结果的完整过程，并说出三类不应交给 AI 独立处理的事。",
    },
  },
  D2: {
    S: {
      overview: "你的提示词已经具备清晰结构，可以进一步沉淀成团队或个人可复用的模板体系。",
      practice: "把成功提示拆成角色、目标、背景、约束、示例、输出格式和验收标准，建立按任务分类的模板库。",
      checkpoint: "同类任务能直接调用模板微调，并在三次迭代内稳定达到预期输出。",
    },
    A: {
      overview: "你能写出有效指令，下一步要提高角色、上下文、格式和约束之间的一致性。",
      practice: "每次提交前检查六项：身份是否明确、目标是否可测量、背景是否充分、限制是否完整、示例是否贴切、验收标准是否可执行。",
      checkpoint: "连续五次复杂提示都能一次性说明全部关键约束，输出格式不需要多次返工。",
    },
    B: {
      overview: "你知道怎样提出要求，但指令中的目标、约束和验收标准还需要更完整。",
      practice: "用五段式重写提示：目标、背景、约束、示例、验收标准；写完后逐项检查有没有遗漏。",
      checkpoint: "一周内把三个旧提示改造成五段式，并记录每次修改后输出质量的变化。",
    },
    C: {
      overview: "你已经开始使用提示词，但结构化表达还不稳定，容易遗漏关键要求。",
      practice: "先模仿优秀提示，再套用“我是谁、我要什么、限制是什么、输出成什么格式”的基础结构。",
      checkpoint: "五个新提示都能写清目标和格式，输出后能指出至少一条下一步改进点。",
    },
    D: {
      overview: "当前重点是建立最小可用的提示结构，避免只写一个模糊问题。",
      practice: "每天练习一个最小四段式：我是谁、我要什么、限制是什么、输出成什么格式；完成后保留最好的一版。",
      checkpoint: "两周内形成十条结构化提示，其中至少三条能直接复用于学习或工作任务。",
    },
  },
  D3: {
    S: {
      overview: "你能熟练使用多种工具，现在适合设计跨检索、写作、数据、图像和自动化的一体化流程。",
      practice: "选一个真实项目，画出从资料输入、AI 处理、人工判断、结果输出到复盘的完整流程，并用自动化工具减少重复步骤。",
      checkpoint: "完成一个包含至少三个工具的协作流程，并保留流程图、输入样例和质量检查记录。",
    },
    A: {
      overview: "你能处理较复杂的输入输出，接下来要把常用能力组合成稳定工作流。",
      practice: "围绕文件分析、长文写作、表格整理、图片生成和结果复核，各设计一个可重复执行的任务模板。",
      checkpoint: "同类任务能在固定流程中完成，并清楚每一步由 AI 处理还是由人判断。",
    },
    B: {
      overview: "你能完成单点任务，但从选工具到核对结果的完整闭环还需要更多练习。",
      practice: "每周选一个真实任务，完整走“选工具—写指令—执行—核对—二次优化—复盘”六步。",
      checkpoint: "三周内完成三次完整闭环，并能说明每次最终结果比第一轮改进在哪里。",
    },
    C: {
      overview: "你具备基本操作能力，但工具选择和结果调整还不够熟练。",
      practice: "每周固定用一个工具完成一个小任务，重点练习提问、重试、复制结果、调整指令和保存有效版本。",
      checkpoint: "四周内至少完成四个小任务，每个任务都记录使用的输入方式和改进后的提示。",
    },
    D: {
      overview: "当前先建立基础操作节奏，不需要一开始挑战复杂工作流。",
      practice: "从会提问、会重试、会复制结果、会调整指令开始，每次只练一个工具和一个明确小任务。",
      checkpoint: "能独立完成一个简单任务：提出清晰要求、检查结果、修改一次指令并保存可用输出。",
    },
  },
  D4: {
    S: {
      overview: "你有较强的结果判断意识，可以建立更量化的质量核查和风险识别体系。",
      practice: "为事实性、逻辑性、完整性、偏见、版权和可用性设定评分标准，对重要输出进行抽样复核。",
      checkpoint: "形成一份可复用核查清单，能在十分钟内判断一个复杂输出是否达到交付标准。",
    },
    A: {
      overview: "你能识别常见问题，接下来要让关键结论始终经过来源核验和交叉验证。",
      practice: "要求 AI 列出依据和不确定点，再用独立来源检查关键事实，并记录哪些结论必须人工确认。",
      checkpoint: "重要结果交付前都有“依据、风险、复核方式”三项记录。",
    },
    B: {
      overview: "你能发现明显问题，但还需要养成主动追问依据和反例的习惯。",
      practice: "每次拿到结果先问三个问题：依据是什么？哪里可能错？如何核实？再把追问结果写进新的改进指令。",
      checkpoint: "十个 AI 输出中至少八个经过一次来源核查或反例检查，并留下复核结论。",
    },
    C: {
      overview: "你能接受第一轮结果，但二次优化和事实核对的练习还不够。",
      practice: "把第一轮输出中的问题整理成改进指令，例如补充来源、缩短篇幅、调整格式或增加风险说明。",
      checkpoint: "每个重要任务至少进行一轮优化，并能指出优化前后最关键的一处差别。",
    },
    D: {
      overview: "当前重点是建立“AI 结果不能直接当事实”的基本检查习惯。",
      practice: "重要结论必须有来源；找不到来源就标为待确认；涉及人数、金额、时间、法规和健康信息时必须人工查证。",
      checkpoint: "两周内所有重要输出都带有来源链接或“待人工确认”标记，不把未核对内容直接提交。",
    },
  },
  D5: {
    S: {
      overview: "你能把复杂任务交给 AI 协作，下一步要设计阶段计划、验收标准和人工判断点。",
      practice: "把项目拆成目标、阶段、输入、责任人、AI 任务、人工决策和完成标准，并定期复盘哪些环节需要调整。",
      checkpoint: "完成一个多阶段项目计划，其中每个 AI 环节都有明确验收条件和人工把关点。",
    },
    A: {
      overview: "你清楚人机分工，接下来要让复杂项目在多个阶段之间稳定衔接。",
      practice: "把项目拆成三到五个可执行小任务，为每个任务准备输入说明、期望输出、检查方法和下一阶段的衔接材料。",
      checkpoint: "项目每个阶段结束时都能产出可复用材料，不需要从头解释上下文。",
    },
    B: {
      overview: "你能使用 AI 解决较大任务，但拆解粒度和阶段验收还不够系统。",
      practice: "把大任务拆成三到五个小任务，先写清每步的输入、输出和完成标准，再逐步让 AI 完成。",
      checkpoint: "一个复杂任务能被拆成至少三个可检查的小任务，并按顺序完成和复核。",
    },
    C: {
      overview: "你能处理中等复杂任务，但需要更清楚地定义步骤和期望结果。",
      practice: "开始前先写三行计划：任务目标、执行步骤、期望结果；执行后再对照检查是否达成。",
      checkpoint: "连续三个任务都先有简短计划，并能在结束后判断是否满足最初目标。",
    },
    D: {
      overview: "当前先练习一次只完成一个明确的小任务，避免一次提出过多目标。",
      practice: "把需求写成一句话，确认结果后再继续下一步；如果结果不对，只修改与当前步骤相关的指令。",
      checkpoint: "能连续完成三个小任务，每一步都先确认结果再进入下一步。",
    },
  },
  D6: {
    S: {
      overview: "你已经有较强的合规意识，可以制定团队或项目级 AI 使用规范。",
      practice: "梳理敏感信息、版权素材、高风险决策、偏见审查、数据保留和人工复核流程，形成提交前检查表。",
      checkpoint: "输出一份适用于真实项目或团队的 AI 使用规范，并至少在一个任务中完整执行。",
    },
    A: {
      overview: "你了解常见合规风险，下一步要把隐私、版权、偏见和复核落实到每个交付环节。",
      practice: "所有对外材料提交前检查四项：是否含个人信息、素材是否可授权、是否存在偏见表达、高风险结论是否有人工确认。",
      checkpoint: "近两周的重要输出都有提交前合规检查记录。",
    },
    B: {
      overview: "你知道主要风险类型，但提交前检查还没有形成固定习惯。",
      practice: "建立三问检查：是否泄露隐私、是否侵权、是否有偏见；发现风险先脱敏、替换素材或补充说明。",
      checkpoint: "十个输出中至少九个经过提交前三问检查，并能说明修改内容。",
    },
    C: {
      overview: "你能识别明显不安全信息，但对常见合规案例和边界场景还需要学习。",
      practice: "学习隐私泄露、版权侵权、偏见表达三类案例，练习判断哪些内容不能输入 AI、哪些结果需要标注来源。",
      checkpoint: "能列出五类不应随意输入 AI 的信息，并在一次任务中完成脱敏和来源标注。",
    },
    D: {
      overview: "当前先守住基础底线，建立安全使用 AI 的第一层习惯。",
      practice: "不输入敏感个人信息，不直接抄袭他人作品，不把 AI 结论当成已核实事实；引用资料时保留来源。",
      checkpoint: "连续两周的重要输入输出都遵守三条底线，并对不确定内容标注待确认。",
    },
  },
};

function gradeOfScore(score) {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

function bandOfDimension(score) {
  return gradeOfScore(score);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeDimensionScore(dimension) {
  const value = Number(dimension?.score);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function orderedDimensions(dimensions) {
  return [...(dimensions ?? [])].sort((left, right) => safeDimensionScore(left) - safeDimensionScore(right));
}

export function buildEvaluationParagraph(model) {
  const score = Math.round(Number(model?.overallScore ?? 0));
  const grade = model?.grade ?? gradeOfScore(score);
  const stage = STAGE_META[grade] ?? STAGE_META.D;
  const ordered = orderedDimensions(model?.dimensions);
  const weakest = ordered[0];
  const strongest = ordered[ordered.length - 1];
  if (!weakest || !strongest) {
    return `本次测评总分 ${score} 分，对应 ${grade} 档（${stage.label}）。${stage.action}`;
  }
  return `本次测评总分 ${score} 分，对应 ${grade} 档（${stage.label}）。你在${strongest.name}上表现相对突出，得分 ${safeDimensionScore(strongest)} 分；${weakest.name}是当前最值得优先补强的方向，得分 ${safeDimensionScore(weakest)} 分。整体来看，${stage.action}`;
}

export function buildAdviceParagraph(model) {
  const score = Math.round(Number(model?.overallScore ?? 0));
  const grade = model?.grade ?? gradeOfScore(score);
  const ordered = orderedDimensions(model?.dimensions);
  const focus = ordered.slice(0, 3);
  const sentences = focus.map((dimension) => {
    const dimensionScore = safeDimensionScore(dimension);
    const band = bandOfDimension(dimensionScore);
    const advice = ADVICE_BY_DIMENSION[dimension.key]?.[band]
      ?? "继续围绕真实任务练习方法、结果检查与复盘。";
    return `${dimension.name}当前 ${dimensionScore} 分，${advice.replace(/[。；;]$/, "")}`;
  });
  const pace = grade === "S" || grade === "A"
    ? "建议以两周为一个复盘周期，把新方法放进真实项目验证。"
    : grade === "B"
      ? "建议用三周完成一轮小项目、复盘、再改进的闭环。"
      : "建议先用两周固定练习基础任务，完成后做一次简要复盘。";
  return `你的个性化重点是：${sentences.join("；")}。${pace}`;
}

export function buildAdvicePace(model) {
  const score = Math.round(Number(model?.overallScore ?? 0));
  const grade = model?.grade ?? gradeOfScore(score);
  return grade === "S" || grade === "A"
    ? "建议以两周为一个复盘周期，把新方法放进真实项目验证。"
    : grade === "B"
      ? "建议用三周完成一轮小项目、复盘、再改进的闭环。"
      : "建议先用两周固定练习基础任务，完成后做一次简要复盘。";
}

export function buildAdviceItems(model) {
  const ordered = orderedDimensions(model?.dimensions);
  if (!ordered.length) {
    const score = Math.round(Number(model?.overallScore ?? 0));
    const grade = model?.grade ?? gradeOfScore(score);
    return [{
      key: "overall",
      name: "综合能力",
      score,
      grade,
      gradeLabel: (STAGE_META[grade] ?? STAGE_META.D).label,
      overview: "当前缺少完整的六维明细，先从基础任务和固定复盘节奏开始。",
      practice: "每天完成一个带明确目标和验收标准的小任务，记录提示、结果、问题和下一版改进。",
      checkpoint: "两周后重新测评，确认每个维度都有可比较的成绩变化。",
    }];
  }
  return ordered.map((dimension) => {
    const score = safeDimensionScore(dimension);
    const grade = bandOfDimension(score);
    const detail = DETAILED_ADVICE_BY_DIMENSION[dimension.key]?.[grade]
      ?? {
        overview: "继续围绕真实任务练习方法、结果检查与复盘。",
        practice: "把任务拆成目标、执行、复核和改进四步，保留每一版的输入与输出。",
        checkpoint: "完成一轮复盘后，能用具体例子说明自己最明显的一处进步。",
      };
    return {
      key: dimension.key,
      name: dimension.name ?? DIMENSION_NAMES[dimension.key] ?? "能力维度",
      score,
      grade,
      gradeLabel: (STAGE_META[grade] ?? STAGE_META.D).label,
      ...detail,
    };
  });
}

export function selectLearningResources(model, count = 12) {
  const score = Math.round(Number(model?.overallScore ?? 0));
  const grade = model?.grade ?? gradeOfScore(score);
  const adjacency = {
    D: ["D", "C", "B"],
    C: ["C", "B", "D"],
    B: ["B", "A", "C"],
    A: ["A", "S", "B"],
    S: ["S", "A"],
  }[grade] ?? ["D", "C"];
  const ordered = orderedDimensions(model?.dimensions);
  const quotas = [3, 3, 3, 1, 1, 1];
  const picked = [];
  const usedTitles = new Set();

  ordered.forEach((dimension, dimensionIndex) => {
    const target = quotas[dimensionIndex] ?? 1;
    let localCount = 0;
    for (const stage of adjacency) {
      if (localCount >= target) break;
      const candidates = LEARNING_RESOURCES
        .map((resource, index) => ({ resource, index }))
        .filter((item) => item.resource.stage === stage && item.resource.dims.includes(dimension.key))
        .filter((item) => !usedTitles.has(item.resource.title));
      if (!candidates.length) continue;
      const start = (score * 7 + dimensionIndex * 13 + stage.charCodeAt(0)) % candidates.length;
      for (let step = 0; step < candidates.length && localCount < target; step += 1) {
        const candidate = candidates[(start + step) % candidates.length];
        picked.push({ ...candidate.resource, matchedDimension: dimension.key });
        usedTitles.add(candidate.resource.title);
        localCount += 1;
      }
    }
  });

  if (picked.length < count) {
    const start = score % LEARNING_RESOURCES.length;
    for (let step = 0; picked.length < count && step < LEARNING_RESOURCES.length; step += 1) {
      const candidate = LEARNING_RESOURCES[(start + step) % LEARNING_RESOURCES.length];
      if (!usedTitles.has(candidate.title)) {
        picked.push({ ...candidate, matchedDimension: "综合" });
        usedTitles.add(candidate.title);
      }
    }
  }
  return picked.slice(0, count);
}

export function buildLearningPlan(model) {
  const score = Math.round(Number(model?.overallScore ?? 0));
  const grade = model?.grade ?? gradeOfScore(score);
  return {
    score,
    grade,
    stage: STAGE_META[grade] ?? STAGE_META.D,
    evaluation: buildEvaluationParagraph(model),
    advice: buildAdviceParagraph(model),
    adviceItems: buildAdviceItems(model),
    advicePace: buildAdvicePace(model),
    resources: selectLearningResources(model),
  };
}

export function renderLearningPlanHtml(plan, model = {}) {
  const generatedAt = new Date();
  const generatedText = `${generatedAt.getFullYear()}年${generatedAt.getMonth() + 1}月${generatedAt.getDate()}日`;
  const s = LEARNING_PLAN_STYLE;
  const resources = plan.resources.map((resource, index) => `
        <p class="resource">
          <span class="resource-number">推荐 ${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHtml(resource.title)}</strong>
          <span class="resource-meta">${escapeHtml(resource.platform)} · ${escapeHtml(resource.type)} · 匹配 ${escapeHtml(resource.matchedDimension)} · ${escapeHtml(resource.stage)} 档</span>
          <span>${escapeHtml(resource.note)}</span>
          <a href="${escapeHtml(resource.url)}">${escapeHtml(resource.url)}</a>
        </p>`).join("");
  const adviceItems = plan.adviceItems.map((item) => `
          <div class="advice-card">
            <p class="advice-title"><strong>${escapeHtml(item.name)} · ${item.score} 分 · ${escapeHtml(item.gradeLabel)}</strong></p>
            <p class="advice-line"><b>当前水平：</b>${escapeHtml(item.overview)}</p>
            <p class="advice-line"><b>学习行动：</b>${escapeHtml(item.practice)}</p>
            <p class="advice-line"><b>完成标志：</b>${escapeHtml(item.checkpoint)}</p>
          </div>`).join("");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>AIQUOS 个性化学习方案</title>
        <style>
          @page WordSection1 {
            size: ${s.page.width}pt ${s.page.height}pt;
            margin: ${s.page.marginTop}pt ${s.page.marginRight}pt ${s.page.marginBottom}pt ${s.page.marginLeft}pt;
            mso-page-orientation: portrait;
            mso-header-margin: 35.4pt;
            mso-footer-margin: 35.4pt;
          }
          div.WordSection1 { page: WordSection1; width: ${s.space.contentWidth}pt; margin: 0 auto; }
          body { margin: 0; font-family: Arial, "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif; color: ${s.colors.ink}; font-size: ${s.type.bodySize}pt; line-height: ${(s.type.bodyLineHeight / s.type.bodySize).toFixed(3)}; }
          .doc-header { margin: 0 0 14pt; }
          .doc-brand { color: ${s.colors.muted}; font-size: ${s.type.brandSize}pt; font-weight: 700; margin: 0 0 ${s.space.headerGap}pt; }
          h1 { color: ${s.colors.heading}; font-size: ${s.type.titleSize}pt; line-height: ${(s.type.titleLineHeight / s.type.titleSize).toFixed(3)}; margin: 0 0 8pt; }
          h3 { color: ${s.colors.heading}; font-size: ${s.type.headingSize}pt; line-height: ${(s.type.headingLineHeight / s.type.headingSize).toFixed(3)}; margin: 18pt 0 ${s.space.headingGap}pt; }
          .doc-meta { color: ${s.colors.muted}; font-size: ${s.type.metaSize}pt; margin: 0; }
          .doc-divider { border: 0; border-top: .8pt solid ${s.colors.border}; margin: 14pt 0 16pt; }
          .section-copy { margin: 0 0 ${s.space.paragraphGap}pt; text-align: justify; }
          .advice-card { background: ${s.colors.card}; border: .8pt solid ${s.colors.border}; margin: 0 0 ${s.space.cardGap}pt; padding: ${s.space.cardPadding}pt 12pt; page-break-inside: avoid; }
          .advice-title { color: ${s.colors.heading}; font-size: ${s.type.cardTitleSize}pt; line-height: ${(s.type.cardTitleLineHeight / s.type.cardTitleSize).toFixed(3)}; margin: 0 0 ${s.space.lineGap}pt; }
          .advice-line { margin: 0 0 ${s.space.lineGap}pt; }
          .advice-line:last-child { margin-bottom: 0; }
          .advice-pace { background: ${s.colors.card}; border: .8pt solid ${s.colors.border}; margin: 0; padding: ${s.space.cardPadding}pt 12pt; }
          .resource { background: ${s.colors.card}; border: .8pt solid ${s.colors.border}; margin: 0 0 ${s.space.cardGap}pt; padding: ${s.space.cardPadding}pt 12pt; page-break-inside: avoid; }
          .resource-number { color: ${s.colors.brand}; display: block; font-size: ${s.type.brandSize}pt; font-weight: 700; margin: 0 0 3pt; }
          .resource strong { display: block; font-size: ${s.type.cardTitleSize}pt; line-height: ${(s.type.cardTitleLineHeight / s.type.cardTitleSize).toFixed(3)}; margin: 0 0 ${s.space.lineGap}pt; }
          .resource-meta { color: ${s.colors.muted}; display: block; font-size: ${s.type.smallSize}pt; line-height: ${(s.type.smallLineHeight / s.type.smallSize).toFixed(3)}; margin: 0 0 ${s.space.lineGap}pt; }
          .resource span { display: block; }
          a { color: ${s.colors.brand}; font-size: ${s.type.smallSize}pt; line-height: ${(s.type.smallLineHeight / s.type.smallSize).toFixed(3)}; overflow-wrap: anywhere; word-break: break-all; }
          .doc-footnote { border-top: .8pt solid ${s.colors.border}; color: ${s.colors.footnote}; font-size: ${s.type.footnoteSize}pt; line-height: ${(s.type.footnoteLineHeight / s.type.footnoteSize).toFixed(3)}; margin: 20pt 0 0; padding-top: 9pt; }
        </style>
      </head>
      <body>
        <div class="WordSection1">
          <div class="doc-header">
            <p class="doc-brand">AIQUOS · 智核域</p>
            <h1>个性化学习方案</h1>
            <p class="doc-meta">生成日期：${generatedText} · 综合得分 ${plan.score} 分 · 综合评级 ${plan.grade} 档（${escapeHtml(plan.stage.label)}）</p>
          </div>
          <hr class="doc-divider" />
          <h3>第一部分 · 分数评价</h3>
          <p class="section-copy">${escapeHtml(plan.evaluation)}</p>
          <h3>第二部分 · 个性化学习建议</h3>
          <p class="section-copy">以下按六个能力维度分别说明当前水平、学习行动和完成标志，薄弱维度排在前面。</p>${adviceItems}
          <p class="advice-pace"><b>练习节奏：</b>${escapeHtml(plan.advicePace)}</p>
          <h3>第三部分 · 个性化学习资源</h3>
          <p class="section-copy">以下 ${plan.resources.length} 条资源来自 100 条 AI 学习资源库，已按你的总分、薄弱维度和能力档位匹配。</p>${resources}
          <p class="doc-footnote">本文档由 AIQUOS 觉醒报告生成。资源链接可在浏览器中打开。</p>
        </div>
      </body>
    </html>`;
}

export function learningPlanFileName(plan) {
  return `AIQUOS-个性化学习方案-${plan.grade}档-${plan.score}分`;
}
