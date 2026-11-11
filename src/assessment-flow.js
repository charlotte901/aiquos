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
