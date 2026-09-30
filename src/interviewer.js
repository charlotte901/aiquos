// 对话式测评的拟人化采访引擎（纯函数，无 React/无网络）。
//
// 拟人化手法借鉴本地 who-is-ai 项目对 83 个开源 Human-or-Not 项目的调研结论：
//  - 回复时间有快有慢（对数正态延迟，而非固定 sleep）
//  - 一次连发多段短消息，而不是一整块长文
//  - 打字过程可见（"正在输入…"与内容同步出现）
//  - 偶发打错字并自我更正（*更正：xxx）
//  - 有口癖、有情绪温度，追问像真人记者而不是表单
// 这里把它们收敛成"采访者人设 + 题梯 + 投递计划"三层，供 InterviewPhase 驱动。

import {
  CREDIT_SCALE,
  formatAnchors,
  heuristicSlotCredit,
  judgeDiscipline,
  rubricFor,
  SLOT_DIMENSIONS,
} from "./interview-scoring.js";

export const INTERVIEWER = {
  name: "苏芮",
  byline: "深度调查记者 · 苏记者",
  // 打字速度（字/秒）。普通人 3–6 字/秒，记者设为偏快。
  typingSpeed: 5.4,
  typingJitter: 0.22,
  // 思考停顿：被问到的第一反应前的沉默。为 5 分钟预算收紧上限。
  thinkMinMs: 500,
  thinkMaxMs: 1200,
  // 段间停顿范围（连发消息之间的呼吸）。
  gapMinMs: 300,
  gapMaxMs: 700,
  burstMax: 3,
  typoRate: 0.05,
  stickers: ["🤔", "👀", "✍️", "😅"],
  stickerRate: 0.08,
  tics: ["诶", "嗯……", "说真的", "我记一下——", "等等，这个细节好"],
};

// 采访题梯：先请学员讲一段真实的 AI 使用经历（经验锚定），
// 再围绕这段经历追问目标、约束、反馈，最后收敛成一条可复用提示词。
// 五个话题为 5 分钟预算校准（每轮约 60 秒）；核验话题的 D4/D1 证据
// 由客观 CAT 阶段覆盖，不在对话阶段重复采集。
// 与"先给任务"的旧版相比，开场由学员的真实经历驱动，而不是由测评方派题。
//
// 每槽绑定评分维度与档位锚点（见 src/interview-scoring.js 的 SLOT_RUBRICS：
// 0 / 0.2 / 0.45 / 0.65 / 0.8 / 0.92 / 1 七档，判分必须引用学员原话作为证据）。
// followUps 是得分不足时的追问话术（换角度再问，而不是重复原题）。
export const INTERVIEW_LADDER = [
  {
    id: "experience",
    dims: ["D1", "D5"],
    rubric: "能否讲出一段真实、具体、有结果的 AI 使用经历（做了什么、用什么、结果如何）",
    anchorPrompt: true,
    asks: [
      "先不聊假设，聊真的——你最近一次用 AI 做事是什么时候？做了什么？",
      "咱们从实际经历开始：你最近用 AI 做成过一件什么事？随便哪件都行。",
    ],
    followUps: [
      "这件事最后做成什么样了？跟我说说结果。",
      "那一次你从哪一步开始用 AI 的？就聊这一步。",
    ],
  },
  {
    id: "goal",
    dims: ["D2", "D5"],
    rubric: "能否把模糊意图变成具体、可执行的目标（有对象、有动作、有完成标准）",
    asks: [
      "接着刚才那件事说——你当时是怎么跟 AI 描述你要的结果的？",
      "如果重来一次，你会怎么跟它说你要的结果？把话原样说给我听。",
    ],
    followUps: [
      "做完之后，你怎么判断它算做好了？",
      "这个东西是做给谁用的？这一点会影响你怎么跟 AI 说吗？",
    ],
  },
  {
    id: "constraints",
    dims: ["D2", "D3"],
    rubric: "是否主动设定边界条件（篇幅/风格/格式/受众/边界之一以上）",
    asks: [
      "还是那件事——你有没有给它设过限制？比如长度、格式、给谁看。",
      "如果只能加一个限制条件，你会加哪一个？",
    ],
    followUps: [
      "有没有想过这个东西是给谁看的？场合不同，说法也不一样。",
      "那格式和长度呢？不限的话它容易给你一大篇套话。",
    ],
  },
  {
    id: "feedback",
    dims: ["D4", "D2"],
    rubric: "面对不理想输出，能否给出可操作的修正指令（指出保留什么、修改什么）",
    asks: [
      "AI 第一次给的东西，有不满意的时候吧？你当时怎么跟它说让它改的？",
      "假设它给你的结果太泛、全是套话——你的下一句话会怎么说？",
    ],
    followUps: [
      "「再改改」这种话它听不懂——你最先想改的是哪一处？",
      "能不能把你的反馈说成一条它一听就能执行的指令？",
    ],
  },
  {
    id: "consolidate",
    dims: ["D2", "D5"],
    rubric: "能否把讨论收敛成一条可直接复用的提示词（角色/任务/约束/输出格式四要素齐全）",
    asks: [
      "最后一步——把咱们刚才聊的那件事，写成一条能直接丢给 AI 用的提示词，发我看看。",
      "收个尾：把刚才说的目标、约束、改法合成一条完整提示词。",
    ],
    followUps: [
      "离「直接可用」还差一点——角色、任务、约束、格式四件套，先补哪一件进话里？",
      "再紧一点，删掉客套，只留它必须知道的。",
    ],
  },
];

// 打字错误映射：把常见字换成同音/形近的错字，用于"记者手快打错"的人设。
// 只注入、不更正——更正气泡（"打错了，是「xxx」"）是一条打断节奏的废消息。
const TYPO_MAP = {
  "的": "地",
  "在": "再",
  "说": "硕",
  "好": "号",
  "一": "以",
  "了": "勒",
};

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 归一到七档量表（CREDIT_SCALE）。任意数值四舍五入到最近档位，
 * 避免模型给出 0.63 这种无法审计的分数。
 */
export function snapToScale(value) {
  // NaN 防线：Math.abs(NaN-x) 恒为 NaN、比较恒 false，reduce 会静默落到
  // 最低档 0（而不是中性值）。非有限输入一律回退中间档 0.45。
  if (!Number.isFinite(value)) return 0.45;
  const nearest = CREDIT_SCALE.reduce(
    (best, credit) => (Math.abs(credit - value) < Math.abs(best - value) ? credit : best),
    CREDIT_SCALE[0],
  );
  return nearest;
}

/**
 * 清掉不该出现在聊天气泡里的符号。
 *
 * 记者的话有两个来源：本地话术与模型返回的 reply。模型偶尔会带出 markdown
 * 记号（`**加粗**`、`# 标题`、`- 列表`、行首 `*` 强调），这些字符进了气泡
 * 就是学员眼里的"莫名其妙的符号"。这里统一剥掉，只留自然语言。
 */
function stripChatMarkers(text) {
  return String(text ?? "")
    // 加粗/斜体/行内代码的成对记号：只留内容
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    // 行首的标题记号（# 标题）
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    // 行首的列表记号（- * • 及有序列表的 1. / 1、）
    .replace(/^[ \t]*(?:[-*•]|\d+[.、])[ \t]+/gm, "")
    // 剩下的孤立记号：# 可能出现在句子中间（"是这样：# 标题"），单独清；
    // 星号与反引号同理，它们在任何位置都不是中文句子的成分。
    .replace(/[#＊*`]/g, "")
    // 连续空行压成一个换行
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * 把一段完整回复拆成 1–3 段连发消息并排好投递时间表。
 * 按句号/问号/感叹号切分；每段打字时长 = 字数 ÷ 人设打字速度（带抖动）。
 * 小概率把某个字打成错字并保留（"打错了，是「xxx」"那种更正气泡是一条
 * 打断节奏的废消息，已于 2026-09 移除——错字本身就能带出真人手滑的感觉）。
 * 表情直接并进正文末尾：以前的独立 <em> 贴纸排在块级段落后面，永远
 * 会自己另起一行，学员看到的就是孤零零一行的 👀。
 */
export function planDelivery(text, rng = Math.random, persona = INTERVIEWER) {
  const sentences = stripChatMarkers(text)
    .split(/(?<=[。！？!?\n])/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length === 0) return { segments: [], totalMs: 0 };

  const groupCount = Math.min(persona.burstMax, Math.max(1, Math.ceil(sentences.length / 2)));
  const perGroup = Math.ceil(sentences.length / groupCount);
  const groups = [];
  for (let index = 0; index < sentences.length; index += perGroup) {
    groups.push(sentences.slice(index, index + perGroup).join(""));
  }

  const segments = groups.map((body, groupIndex) => {
    let delivered = body;
    if (rng() < persona.typoRate) {
      const chars = [...delivered];
      for (let i = 0; i < chars.length; i += 1) {
        const typo = TYPO_MAP[chars[i]];
        if (!typo) continue;
        chars[i] = typo;
        delivered = chars.join("");
        break;
      }
    }
    const sticker = rng() < persona.stickerRate ? pick(rng, persona.stickers) : null;
    const speed = persona.typingSpeed * (1 + (rng() * 2 - 1) * persona.typingJitter);
    return {
      text: sticker ? `${delivered} ${sticker}` : delivered,
      typingMs: Math.round(([...delivered].length / Math.max(0.5, speed)) * 1000),
      gapMs: groupIndex === groups.length - 1 ? 0
        : Math.round(persona.gapMinMs + rng() * (persona.gapMaxMs - persona.gapMinMs)),
    };
  });

  const thinkMs = Math.round(persona.thinkMinMs + rng() * (persona.thinkMaxMs - persona.thinkMinMs));
  const totalMs = thinkMs + segments.reduce((sum, seg) => sum + seg.typingMs + seg.gapMs, 0);
  return { segments, thinkMs, totalMs };
}

/**
 * 开场白：固定两条。
 *
 * 原先是三句，经分段投递后最少变成四条气泡；一旦再触发"打错字+更正"就是
 * 五条——学员要连点/连读五条才轮到第一道题。开场只承担「自我介绍 + 抛出
 * 第一个问题」两个任务，所以收敛成两条：一条说明来意，一条直接发问。
 */
export function interviewOpening(rng = Math.random) {
  return [
    `${pick(rng, INTERVIEWER.tics)}，占用你几分钟——我是苏芮，正在做一期「普通人和 AI 怎么打交道」的深度报道，别紧张，就是聊天。`,
    "最近你用 AI 做过什么？挑一件印象最深的，跟我说说就行。",
  ];
}

/** 收尾：把五轮讨论收束成一句报道式总结。 */
export function interviewClosing(exchangeCount, rng = Math.random) {
  const beats = exchangeCount >= 6 ? "好几段故事" : exchangeCount >= 3 ? "不少细节" : "你的习惯";
  return [
    `好，${exchangeCount} 轮聊下来，${beats}我都记下了。`,
    "你跟 AI 打交道的方式，我会如实写进稿子里——谢啦，回见！",
  ];
}

/**
 * 离线启发式评分（无 API 时的降级判定）：长度、具体性（数字/量词）、
 * 结构词（先/再/例如/格式/标准）三个信号加权。
 */
/**
 * 旧版全局启发式评分（保留导出以兼容既有测试）。
 * 新代码一律用 heuristicSlotCredit(slotId, answer)：按话题档位锚点判分。
 */
export function heuristicCredit(answer) {
  return heuristicSlotCredit("consolidate", answer);
}

/**
 * 聊天轨的提示词：只负责让苏记者「像人」，完全不承担打分。
 *
 * 拟人化手法参考公开角色对话实践的共识（人设结构化、情绪状态、
 * 反 AI 腔清单、few-shot 接话示例），而不依赖任何模型的专属参数：
 *  - 人设分四块写：背景与动机 / 说话习惯 / 绝不说的话 / 此刻状态；
 *  - 「绝不说的话」直接点名 AI 腔高频词（首先/总之/作为AI…），比
 *    正面要求「口语化」有效得多；
 *  - few-shot 给一组真实的接话示范，模型模仿示例比遵守规则更稳；
 *  - 输出是纯文本（不是 JSON）：聊天轨要快、要自然，评分的稳定性
 *    由低温度的打分轨单独保证。
 */
export function interviewChatMessages({ thread, slot, followUp, lastNote }) {
  // 连发模式下记者一轮就要发 2–3 条气泡，窗口太小会让模型忘了自己
  // 问过什么，出现"能跑起来了吗"隔两轮再问一遍的重复。
  const history = thread
    .filter((item) => !item.pending && item.content)
    .slice(-16)
    .map(({ role, content }) => ({ role: role === "user" ? "user" : "assistant", content }));
  const ask = followUp
    ? `学员刚回答了你的问题，但还可以更具体（你的观察：${lastNote || "有点笼统"}）。先接住他说的内容给一个具体的肯定，再顺着他的话换一个更好回答的角度帮他展开；不要否定他，不要重复问过的问题。`
    : `请说出你的第 ${slot.index + 1} 句采访话术：${
        slot.anchorPrompt
          ? "请学员讲一段他最近真实的 AI 使用经历。"
          : `这一问落在「${slot.intent ?? slot.rubric}」上，可参考问法（${slot.asks.join("／")}）。`
      }只问一件事，用你自己的话。`;
  return [
    {
      role: "system",
      content: [
        "【你是谁】苏芮，深度调查记者，跑科技口八年。现在在做一期「普通人和 AI 怎么打交道」的报道，采访一位学员。你不是客服，不是老师，是个真的对普通人的 AI 使用经历好奇的老记者。",
        "【说话习惯】短句，微信节奏，一次 1–3 段，每段不超过 60 字。口语词随便用：诶、嗯……、说真的、我记一下——、等等这个细节好。会打错字，不装完美。",
        "【绝不说的话】首先/其次/最后/总之/综上所述/作为AI/我是一个AI/很高兴为您/希望能够帮助您/以下是一些。不列条目，不打标题，不用书面腔，不一次问三个问题。",
        "【接话协议 · 每条回复的第一句】必须先接住学员上一条回答：引用他话里的具体词（他说「搭了个网站」，你就从「搭网站」接起），给一个明确的正面回应——承认难度、点出亮点、或表达好奇。然后才是你的下一问，一整条回复最多两个问号，且围绕同一个点。",
        "【示范】学员说「我用 AI 做了个参赛网站」——好的接话：「拿去比赛的站，这可不是随手玩玩的，挺厉害的 👀 你当时是把需求一次说完，还是边做边改的？」坏的接话：「哦？能详细说说你的使用场景、工具选择和最终成果吗？」（后者三个问题、没有接话、书面腔，禁止。）",
        "【学员答不上来时】他要是说记不清、不会、没有——大方放过，顺着自己的好奇心换个轻的问法，别追着要。",
        "【输出】只输出你作为苏芮说的话本身。不要 JSON，不要任何前缀、标注、括号旁白。表情偶尔用一个，放在句尾。",
      ].join("\n"),
    },
    ...history,
    {
      role: "user",
      content: `${ask}\n（这是导演指令，不要念出来。）`,
    },
  ];
}

/**
 * 打分轨的提示词：冷静的评分员，看到的是该话题的问答对与档位锚点，
 * 不看人设、不管聊天，只输出一个可审计的 JSON。
 *
 * 与聊天轨分开后，这里可以用低温度（调用方传 0.15）换来评分的
 * 可复现性——同一段回答两次评分不再抖动；模型的人设、口癖、创造性
 * 全部留在聊天轨，互不污染。
 */
export function interviewScoreMessages({ slot, questionAsked, userAnswer, priorAnswer = "" }) {
  const rubric = rubricFor(slot.id);
  const answerBlock = [
    priorAnswer ? `（追问前的第一次回答，供参考）${priorAnswer}` : "",
    `学员回答：${userAnswer}`,
  ].filter(Boolean).join("\n");
  return [
    {
      role: "system",
      content: [
        "你是测评系统的评分模块，不是聊天角色。依据档位锚点对学员在指定话题上的回答评分，输出一个 JSON。",
        `【话题】${slot.id}`,
        `【唯一评分考点】${rubric?.intent ?? slot.rubric}`,
        "【分档锚点 · 只能选其中一档】",
        formatAnchors(slot.id),
        judgeDiscipline(),
        "评分只依据学员的原话；他没有说到的要素不能脑补。宁可低档，不可虚构。",
        '输出格式：只输出一个 JSON 对象（不要 markdown 代码块）：{"score":0到1的小数,"evidence":"从学员原话摘录的证据片段","note":"一句话档位判定依据"}。',
      ].join("\n"),
    },
    {
      role: "user",
      content: [`记者的提问：${questionAsked}`, answerBlock].join("\n"),
    },
  ];
}

// 兼容导出：旧的合并式构造器（聊天+评分同一个提示词、同一次采样）。
// 新代码一律用 interviewChatMessages / interviewScoreMessages。
export function interviewMessages({ thread, slot, followUp, lastNote }) {
  const rubric = rubricFor(slot.id);
  const isAnchor = Boolean(slot.anchorPrompt);
  const ask = followUp
    ? `学员刚回答了你的问题但没答到位（评分备注：${lastNote || "不够具体"}）。请从另一个角度追问，语气自然，一到两句。`
    : isAnchor
      ? `请提出你的第 ${slot.index + 1} 个问题：请学员讲一段最近真实的 AI 使用经历。用你自己的话问，一到两句，别照抄提示。`
      : `请提出你的第 ${slot.index + 1} 个采访问题。要求：这一问必须落在本话题考点上（${rubric?.intent ?? slot.rubric}），可参考问法（${slot.asks.join("／")}），用你自己的话问，一到两句，别照抄。`;
  const history = thread
    .filter((item) => !item.pending && item.content)
    .slice(-16)
    .map(({ role, content }) => ({ role: role === "user" ? "user" : "assistant", content }));
  return [
    {
      role: "system",
      content: [
        `你是${INTERVIEWER.byline}，正在对一位学员做关于「如何与 AI 协作」的采访测评。`,
        `人设要点：口语化、爱追问细节、偶尔用「${INTERVIEWER.tics.slice(0, 3).join("」「")}」这类口头语；消息短促（每段不超过 60 字），一次说 1–3 段；绝不用书面腔、绝不列大纲。`,
        "输出的是聊天消息：不要用任何 markdown 记号（不要 ** 加粗、不要 # 标题、不要 - 或 * 开头的列表、不要 ` 反引号），就用普通中文句子。",
        "【接话协议 · 最高优先级】每条回复的第一句必须先接住学员上一条回答：引用他话里的具体词（他说「用 AI 搭了网站」，你就从「搭网站」接起），给他一个明确的正面回应——承认难度、点出亮点、或表达好奇。不许用「哦？」「那」这类干问句开头，不许对学员的回答不置可否就直接抛下一个问题。",
        "【一次只问一件事】一整条回复里最多一到两个问号，且必须围绕同一个点。不要把「做了什么+用了什么+结果如何」串成一句连问——学员一次只答得了一个问题，没答到的信息留给下一个话题。",
        "【不重复、不施压】发问前先看历史：同一个信息已经问过、或学员已经说过的，不要换个说法再问。学员答「记不清了」就大方换话题；学员答得简短（「有」「没有」）也当成有效回答，顺着它展开，不要连追两次。",
        isAnchor
          ? "开场策略：先请学员讲他自己最近真实的 AI 使用经历（做了什么、用什么工具、结果如何），后续所有追问都围绕这段经历展开，不要派发虚构任务。"
          : "追问策略：承接学员前面讲过的经历与工具，用「你刚才说的那件事」这类接续语，而不是另起一个假设场景。",
        `【本话题的唯一评分考点】${rubric?.intent ?? slot.rubric}`,
        "【分档锚点 · 只能选其中一档】",
        formatAnchors(slot.id),
        judgeDiscipline(),
        '输出格式：只输出一个 JSON 对象（不要 markdown 代码块）：{"reply":"你对学员说的话，可用\\n分段","score":0到1的小数,"evidence":"从学员原话摘录的证据片段","note":"一句话档位判定依据"}。',
        `reply 里可以有两三个自然段，每段像微信消息一样短；score 是学员上一个回答在该话题上的档位分（没有上一个回答时填 0.5，evidence 填空字符串）。`,
      ].join("\n"),
    },
    ...history,
    {
      role: "user",
      content: `${ask}\n（这是导演指令，不要念出来；你的输出仍然只是一个 JSON 对象）`,
    },
  ];
}

/** 解析模型返回的 JSON；失败返回 null 走离线话术。 */
export function parseInterviewerJson(raw) {
  const text = String(raw ?? "").trim().replace(/^```(?:json)?|```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    if (!reply) return null;
    const score = Number(parsed.score);
    return {
      reply,
      score: Number.isFinite(score) ? snapToScale(clamp(score, 0, 1)) : 0.5,
      evidence: typeof parsed.evidence === "string" ? parsed.evidence : "",
      note: typeof parsed.note === "string" ? parsed.note : "",
    };
  } catch {
    return null;
  }
}
