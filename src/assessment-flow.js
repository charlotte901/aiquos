export const ASSESSMENT_THEMES = {
  comprehensive: {
    title: "综合测评",
    color: "#247cf1",
    glow: "#4b9cff",
    deep: "#155cca",
    soft: "#e9f2ff",
    description: "把判断、对话与实操串成一次完整闯关。",
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
