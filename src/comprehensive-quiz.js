import questionBank from "./comprehensive-questions.json";

export const COMPREHENSIVE_LEVELS = [
  {
    id: "academy",
    short: "智核学院",
    name: "启程·智核学院",
    guardian: "林教授",
    color: "#247cf1",
    dims: "AI基础认知 + 提示词工程 + AI工具使用 + AI伦理合规",
    opening: [
      { who: "xiao", text: "欢迎来到智核域！我是你的AI导师小源。从现在起，你将在5个区域接受考验。记住，这里的每一道题目都可能同时考察你多方面的AI能力，不要只从一个角度思考哦。" },
      { who: "guardian", text: "你好，欢迎来到智核学院！我是林教授。今天我要举办一场面向新生的AI科普讲座，但一个人实在忙不过来。你能帮我吗？正好，我准备了一些问题需要你来协助解答——放心，这些问题也能帮我了解你对AI的掌握程度。" },
      { who: "player", text: "没问题，我来帮忙！" },
      { who: "guardian", text: "太好了！那我们开始吧。讲座的内容涉及AI基本概念、提示词设计、AI工具使用和伦理规范——我会从这些方面各出一些问题，你来试试看。" },
    ],
    ending: [
      { who: "guardian", text: "谢谢你的帮助！今天这些问题，其实每一个都不只考察一个能力——从AI基础认知到提示词设计，从工具使用到结果评估，甚至涉及了AI伦理。讲座明天就能顺利举办了，多谢你！" },
      { who: "xiao", text: "做得不错！第一关完成。林教授给你评了[X]颗星。接下来，我们去信息迷城——那里有更刺激的挑战等着你！" },
    ],
  },
  {
    id: "labyrinth",
    short: "信息迷城",
    name: "迷雾·信息迷城",
    guardian: "苏记者",
    color: "#f37c31",
    dims: "AI结果评估 + AI伦理合规 + AI基础认知 + 提示词工程",
    opening: [
      { who: "xiao", text: "欢迎来到信息迷城！这座城市里每天都有海量信息产生，其中不少是AI生成的。问题是——有些是真的，有些是假的，你能分辨吗？" },
      { who: "guardian", text: "你是新来的试炼者？我正在调查一宗案件：有人用AI生成了一张“某地发生地震”的假新闻配图，在网上疯传，引起恐慌。我需要你的帮助来分析这个案件。" },
      { who: "player", text: "我准备好了。" },
      { who: "guardian", text: "好。我会从各个角度出题——有的问你怎么识别AI生成的图像，有的问你怎么负责任地处理信息，还有的要你设计提示词让AI帮我分析。" },
    ],
    ending: [
      { who: "guardian", text: "今天你帮了大忙。在AI时代，辨别信息真伪、负责任地传播内容，已经成为每个人必备的素养。这个案件的调查报告里会提到你的贡献。" },
      { who: "xiao", text: "第二关完成！苏记者给了你[X]颗星。你已经展现出不错的AI结果评估能力和伦理意识。下一站，我们去创客工坊！" },
    ],
  },
  {
    id: "workshop",
    short: "创客工坊",
    name: "锻造·创客工坊",
    guardian: "陈创客",
    color: "#9c45f2",
    dims: "AI工具使用 + 提示词工程 + AI结果评估 + AI伦理合规 + 人机协同",
    opening: [
      { who: "xiao", text: "欢迎来到创客工坊！这里不仅看你最终产出的结果，更看你使用AI的过程——你怎么写提示词、怎么迭代优化、怎么评估AI输出。" },
      { who: "guardian", text: "我开发了一款AI辅助创意写作工具，明天就要发布，但产品的宣传文案和配图还没准备好。你能用我工坊里的AI终端帮我完成吗？过程中我也会考考你对版权和伦理的了解。" },
      { who: "player", text: "让我试试。" },
      { who: "guardian", text: "完美！不是写完一版就结束了——你要评估AI的输出，然后调整提示词重新生成。这个过程才是我最看重的！" },
    ],
    ending: [
      { who: "guardian", text: "谢了兄弟！你在整个过程中表现出来的——会写提示词、会评估AI输出、知道不断迭代优化、还注意版权伦理——这些就是真正用好AI的关键。" },
      { who: "xiao", text: "第三关完成！陈创客给了你[X]颗星。这一关，你展示了真正的AI工具使用能力和人机协作素养。" },
    ],
  },
  {
    id: "station",
    short: "协同空间站",
    name: "危机·协同空间站",
    guardian: "周队长",
    color: "#1fc4c9",
    dims: "人机协同 + AI工具使用 + 提示词工程 + AI结果评估 + AI伦理合规",
    opening: [
      { who: "xiao", text: "注意！欢迎来到协同空间站。这里正在经历一场模拟紧急情况——空间站的AI系统检测到氧气循环系统出现异常。" },
      { who: "guardian", text: "试炼者，情况紧急。空间站的AI系统“星核”已经给出修复方案，但它是否安全还需要人来判断。这不是让你盲从AI的建议——而是让你在AI的分析基础上做出人的判断。" },
      { who: "player", text: "明白，开始行动。" },
      { who: "guardian", text: "好。我会从各个方面考察你——你该怎么看待AI的建议？你会怎么调整提示词来获取更好的方案？出发吧！" },
    ],
    ending: [
      { who: "guardian", text: "危机解除。你在压力下还能冷静地与AI协作，不盲信AI，知道如何调整提示词获取更好的方案。这种人机协作能力，才是AI时代真正需要的。" },
      { who: "xiao", text: "第四关完成！队长给了你[X]颗星。最后一关了——伦理殿堂在等着你！" },
    ],
  },
  {
    id: "court",
    short: "伦理殿堂",
    name: "审判·伦理殿堂",
    guardian: "方法官",
    color: "#f34b4b",
    dims: "AI伦理合规 + 人机协同 + AI结果评估 + AI基础认知",
    opening: [
      { who: "xiao", text: "欢迎来到最后一站——伦理殿堂。这里的每个案件都没有简单的标准答案。记住，伦理不是最后才考虑的事，而是从一开始就该融入AI使用的每个环节。" },
      { who: "guardian", text: "试炼者，欢迎来到AI伦理法庭。今天有三起AI相关案件需要你给出判断。这些案件涉及伦理困境，需要你综合运用前几关积累的能力来分析。" },
      { who: "player", text: "我准备好了。" },
      { who: "guardian", text: "好。我会依次向你呈现案件。别急着下结论——先把问题看清楚，再做判断。开始吧。" },
    ],
    ending: [
      { who: "guardian", text: "审案完成。你在判断中对学术严谨、AI偏见和隐私保护的关注，展现了AI时代公民应有的素养。公正的天平，永远倾向于有准备的人。" },
      { who: "xiao", text: "最后一关完成！方法官给了你[X]颗星。五关全部通关！恭喜你完成了智核域的全部考验。" },
    ],
  },
];

export const COMPREHENSIVE_QUESTION_COUNT = 5;
export const COMPREHENSIVE_QUESTIONS = questionBank.questions;

const REACTIONS = {
  "林教授": {
    correct: ["不错，看来你对这个知识点掌握得不错。", "很好！你的理解到位了。", "看来你已经准备好了。"],
    wrong: ["这个问题确实有难度，没关系，慢慢来。", "别灰心，这个概念我们一起来梳理一下。", "需要再修炼一下这个知识点。"],
  },
  "苏记者": {
    correct: ["犀利的眼光！你发现了关键。", "不错，你的判断力很强。", "就是这样！你的洞察力很棒。"],
    wrong: ["这个细节你漏掉了，下次注意。", "注意这个线索，别被表面现象迷惑了。", "这个地方确实容易迷惑人，别上当。"],
  },
  "陈创客": {
    correct: ["太棒了！你这个思路很到位。", "看来你是个懂行的人。", "完美！我喜欢你的思路。"],
    wrong: ["呀，这个方向似乎不太对，换个思路试试。", "没关系，多试几次就好了！", "这个地方坑不少人踩过，别紧张。"],
  },
  "周队长": {
    correct: ["干得漂亮！就是这个方向。", "很好，你的判断是正确的。", "果断！你展现了冷静的头脑。"],
    wrong: ["这个判断不够准确，需要更谨慎。", "在压力下出错很正常，看看哪里出了问题。", "记住，AI的建议需要人来验证。"],
  },
  "方法官": {
    correct: ["判断准确。你的伦理意识很强。", "你的见解很到位。", "公正的判断。"],
    wrong: ["这个判断需要更深入的思考，再想想。", "这个问题确实值得反复思量，再仔细想想。", "伦理问题往往没有简单答案，需要你多想想。"],
  },
};

export function getComprehensiveLevel(stage) {
  return COMPREHENSIVE_LEVELS[Math.max(0, Math.min(COMPREHENSIVE_LEVELS.length - 1, stage - 1))];
}

export function getReaction(level, isCorrect) {
  const pool = isCorrect ? REACTIONS[level.guardian].correct : REACTIONS[level.guardian].wrong;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function judgeComprehensiveAnswer(question, selectedKeys) {
  const expected = new Set(question.answer);
  const selected = new Set(selectedKeys);
  const correct = selected.size === expected.size && [...selected].every((key) => expected.has(key));
  const partialCorrect = !correct && question.answer.some((key) => selected.has(key));
  const answerText = question.answer
    .map((key) => {
      const option = question.options.find((item) => item.key === key);
      return `${key}.${option?.text ?? ""}`;
    })
    .join("; ");

  return { correct, partialCorrect, answerText };
}

export const COMPREHENSIVE_TYPE_LABELS = {
  single: "单选题",
  multi: "多选题",
  judge: "判断题",
};
