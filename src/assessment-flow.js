export const ASSESSMENT_THEMES = {
  comprehensive: {
    title: "综合测评",
    color: "#247cf1",
    glow: "#4b9cff",
    deep: "#155cca",
    soft: "#e9f2ff",
    description: "对话、客观、实操三关连闯，约 20 分钟完成一次完整测评。",
    stages: ["objective", "conversation", "practical", "objective", "conversation"],
  },
  objective: {
    title: "客观题测评",
    color: "#00a96d",
    glow: "#08bd7b",
    deep: "#008e5d",
    soft: "#e8f8ef",
    description: "用选择题检验你对 AI 的判断力。",
    stages: ["objective", "objective", "objective", "objective", "objective"],
  },
  conversation: {
    title: "对话式测评",
    color: "#7438e5",
    glow: "#8a4ff0",
    deep: "#5622c5",
    soft: "#f0eaff",
    description: "在真实沟通里，让 AI 理解你的意图。",
    stages: ["conversation", "conversation", "conversation", "conversation", "conversation"],
  },
  practical: {
    title: "实操任务测评",
    color: "#fb5727",
    glow: "#ff7437",
    deep: "#e7461b",
    soft: "#fff0e9",
    description: "像使用 Agent 一样拆解并完成任务。",
    stages: ["practical", "practical", "practical", "practical", "practical"],
  },
};

export const STAGE_LABELS = ["识别", "判断", "表达", "协作", "完成"];

export const QUESTIONS = [
  {
    prompt: "为了让 AI 生成更贴近需求的结果，第一步最重要的是？",
    options: ["先写出清晰的目标与限制", "只输入一个关键词", "等待 AI 猜测", "直接复制别人的答案"],
  },
  {
    prompt: "哪一种反馈能帮助 AI 更快修正结果？",
    options: ["指出需要保留和调整的部分", "说“再来一次”", "不给任何上下文", "一直更换问题"],
  },
  {
    prompt: "面对 AI 输出，哪种做法更可靠？",
    options: ["核对关键事实与来源", "默认它永远正确", "不看内容直接转发", "只看第一句话"],
  },
  {
    prompt: "当任务较复杂时，好的提示方式是？",
    options: ["分步骤说明成果标准", "一次塞入所有想法", "只说“帮我做”", "不给格式要求"],
  },
  {
    prompt: "完成 AI 协作任务前，最该检查的是？",
    options: ["结果是否满足原始目标", "页面颜色是否好看", "按钮有没有动画", "是否使用了最多工具"],
  },
];

export const CONVERSATIONS = [
  "请把“帮助新同学了解社团”活动，变成一句可执行的目标。",
  "现在补充两个限制条件，让这个任务更容易落地。",
  "如果 AI 的第一版结果太泛，你会怎样给出具体反馈？",
  "请用一句话说明你会如何验证 AI 提供的信息。",
  "最后，把你的提示词整理成一个可以直接使用的版本。",
];

export const PRACTICALS = [
  "为一场校园 AI 分享会拟定一份 30 分钟流程。",
  "为活动写一份可供 AI 执行的海报文案任务。",
  "把零散的访谈要点整理为行动清单。",
  "为同学设计一个可复用的学习计划提示词。",
  "产出一份带验收标准的 AI 协作任务说明。",
];

export const PRACTICAL_TASKS = [
  {
    title: "把口语化汇报改写为正式周报",
    goal: "为部门总监准备一份正式、客观、书面的周报材料。",
    requirements: ["250–400 字", "分为三段：本周工作完成情况、风险与问题、下周工作计划", "关键数据准确保留", "不得添加原文没有的信息"],
    source: "哎那个……大家好啊，我说一下我们组这周的情况哈。就是……那个用户增长这块儿吧，嗯怎么说呢，反正做的还行吧，好像拉新了大概1200多个人？不对不对，是1287个好像，反正比上周多了一大截。然后就是那个bug嘛，哦对了上周遗留的那个支付超时的bug，我们熬夜搞了两个晚上，终于啊终于，修好了，不过中间还出了点小插曲，嗯……就是修到一半差点把另一个功能搞崩了，还好小李反应快，及时回滚了。然后下周呢，我们打算搞一搞那个什么商品推荐的那个A/B测试，应该是下周三左右上线吧，到时候还得麻烦大家多配合配合。我就说这么多吧，谢谢大家啊辛苦了。",
  },
  {
    title: "生成校园 AI 分享会主视觉",
    goal: "将活动需求转成一张可用于海报的高质量主视觉。",
    requirements: ["明确主体、场景与情绪", "描述配色、光线和画幅", "确保画面服务活动主题"],
    source: "活动主题：让更多同学理解并开始使用 AI；氛围：好奇、有行动感、面向未来；用途：校园分享会海报主视觉。",
    outputType: "image",
  },
  ...PRACTICALS.slice(1).map((title) => ({
    title,
    goal: "把零散信息整理成可直接执行的工作成果。",
    requirements: ["明确输出目标", "保留输入中的关键事实", "不补充未经提供的信息"],
    source: "请根据任务要求，整理输入素材并输出一份可直接使用的结果。",
  })),
];

export function getStageMode(assessmentId, stage) {
  return ASSESSMENT_THEMES[assessmentId]?.stages[stage - 1] ?? "objective";
}

// ── 时间制综合测评的三个阶段剧情 ──────────────────────────────────────────
// 阶段顺序按产品定义：对话式 → 客观题 → 实操，各约 5 分钟。
export const PHASE_STORIES = {
  labyrinth: {
    opening: [
      { who: "xiao", text: "这一站我们先进信息迷城——等着你的不是选择题，而是一场真刀真枪的采访。" },
      { who: "guardian", text: "你好，我是苏芮，深度调查记者。我正在做一期「普通人和 AI 怎么打交道」的报道，需要一位受访者。听说你就是合适的样本？" },
      { who: "player", text: "可以，聊聊吧。" },
      { who: "guardian", text: "太好了。我的问题不多，但会追细节——这是职业病，别介意。准备好咱们就开始。" },
    ],
    ending: [
      { who: "guardian", text: "采访结束！你跟 AI 沟通的方式，我都记在本子上了，稿子里会如实呈现。" },
      { who: "xiao", text: "对话关完成！接下来回智核学院——林教授的客观测验改成计时制了，答到能力被测准为止。" },
    ],
  },
  academy: {
    opening: [
      { who: "xiao", text: "回到智核学院。这一关按时间算：5 分钟内，题目难度会跟着你的表现实时调整。" },
      { who: "guardian", text: "同学你好，我是林教授。这次的测验不数题数、看时间——系统会根据你每一题的表现，把下一道题调到刚好匹配你水平的位置。" },
      { who: "player", text: "明白了，开始吧。" },
      { who: "guardian", text: "记住：答错不扣时间，放轻松。当你的能力曲线被测准的时候，测验会提前结束。" },
    ],
    ending: [
      { who: "guardian", text: "时间到。你的能力曲线我已经画出来了——每道题的难度选择都有依据，不是我拍脑袋定的。" },
      { who: "xiao", text: "客观关完成！最后一站创客工坊——把前两关学到的东西，真正用出来。" },
    ],
  },
  workshop: {
    opening: [
      { who: "xiao", text: "欢迎来到创客工坊！这一关不聊天也不选择题——你要亲手指挥 Agent 干一次活。" },
      { who: "guardian", text: "兄弟，我工坊里的 AI 终端借你用 5 分钟。任务就在台面上，提示词你来写，不满意就改了再生成——但时间有限。" },
      { who: "player", text: "好，我试试。" },
      { who: "guardian", text: "记住我说的：会写提示词只是及格，会评估输出、会迭代优化才是真本事。" },
    ],
    ending: [
      { who: "guardian", text: "时间到！让我看看……嗯，这个迭代过程我全程在旁边看着呢。会写、会跑、会改——这就是我要找的人。" },
      { who: "xiao", text: "实操关完成！三个阶段全部通关！" },
      { who: "guardian", text: "试炼者请留步——我是方法官。终审宣读：你在对话中表达意图，在客观测验中展现判断，在实操中驾驭 Agent。智核域认可你的 AI 使用能力。" },
      { who: "xiao", text: "觉醒报告已经生成，去看看你的六维画像吧！" },
    ],
  },
};

export const PHASE_MODE_NAMES = {
  conversation: "对话面询",
  objective: "客观闯关",
  practical: "Agent 实操",
};

export function getAssessmentRoute() {
  const match = location.hash.match(/^#assessment\/(comprehensive|objective|conversation|practical)(?:\/(level)\/(\d))?$/);
  if (!match) return null;
  const [, id, levelMarker, rawStage] = match;
  const stage = Math.max(1, Math.min(5, Number(rawStage || 1)));
  return {
    id,
    mode: levelMarker === "level" ? "task" : "map",
    stage,
  };
}

export function assessmentHash(id, stage = null) {
  return stage ? `#assessment/${id}/level/${stage}` : `#assessment/${id}`;
}
