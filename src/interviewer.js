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
// 0 / 0.25 / 0.5 / 0.75 / 1 五档，判分必须引用学员原话作为证据）。
// followUps 是得分不足时的追问话术（换角度再问，而不是重复原题）。
export const INTERVIEW_LADDER = [
  {
    id: "experience",
    dims: ["D1", "D5"],
    rubric: "能否讲出一段真实、具体、有结果的 AI 使用经历（做了什么、用什么、结果如何）",
    anchorPrompt: true,
    asks: [
      "先不聊假设，聊真的——你最近一次用 AI 做事是什么时候？做了什么？",
      "咱们从实际经历开始：你最近用 AI 做过什么事？随便哪件都行，越具体越好。",
    ],
    followUps: [
      "有点笼统了——具体是哪一件事？用的什么工具？最后拿到的东西长什么样？",
      "展开讲讲：那一次你从哪一步开始用 AI，它给了你什么，你又做了什么？",
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
      "有一点还没落地——这件事做完，你怎么判断它算做好了？补一个标准给我。",
      "再具体一点呢？比如对象是谁、要产出什么、长什么样？",
    ],
  },
  {
    id: "constraints",
    dims: ["D2", "D3"],
    rubric: "是否主动设定边界条件（篇幅/风格/格式/受众/边界之一以上）",
    asks: [
      "还是那件事——你有没有给它设过限制？比如长度、格式、给谁看。你会加哪几个？",
      "如果只能加两个限制条件，你加哪两个？为什么是这两个？",
    ],
    followUps: [
      "约束里还缺一块——给谁看的？什么场合用？这会改变输出的样子。",
      "格式和长度呢？不限定的话 AI 很容易给你一大篇套话。",
    ],
  },
  {
    id: "feedback",
    dims: ["D4", "D2"],
    rubric: "面对不理想输出，能否给出可操作的修正指令（指出保留什么、修改什么）",
    asks: [
      "AI 第一次给的东西肯定有不满意的地方吧？你当时怎么跟它说让它改的？",
      "假设它给你的结果太泛、全是套话——你的下一句话会怎么跟它说？",
    ],
    followUps: [
      "「再改改」这种话 AI 听不懂——哪句保留、哪句删掉、往哪个方向补？",
      "能不能把你的反馈说成一个可执行的修改指令？",
    ],
  },
  {
    id: "consolidate",
    dims: ["D2", "D5"],
    rubric: "能否把讨论收敛成一条可直接复用的提示词（角色/任务/约束/输出格式四要素齐全）",
    asks: [
      "最后一步——把咱们刚才聊的那件事，写成一条能直接丢给 AI 用的提示词，发我看看。",
      "收个尾：把刚才说的目标、约束、改法合成一条完整提示词，我要能直接复用的。",
    ],
    followUps: [
      "离「直接可用」还差一点——把角色、任务、约束、输出格式四件套补齐。",
      "再紧一点，删掉客套，只留 AI 需要知道的。",
    ],
  },
];

// 打字错误映射：把常见字换成同音/形近的错字，用于"记者手快打错再更正"的人设。
const TYPO_MAP = {
  "的": "地",
  "在": "再",
  "说": "硕",
  "好": "号",
  "一": "以",
  "了": "勒",
};

const isCjk = (char) => typeof char === "string" && /[\u4e00-\u9fff]/.test(char);

/**
 * 为错字选一个「读起来像真人更正」的引用窗口。
 *
 * 更正内容必须是完整的词，否则会生成 `*更正：好，` 这种既不成词又带标点的
 * 残片——学员看到的就是一行乱码。所以窗口只允许由汉字组成，且至少 2 个字：
 * 先取错字左右的连续汉字，不足时再顺延到邻近汉字，仍不足就放弃这次错字
 * （宁可不打错，也不给出读不通的更正）。
 */
function correctionWindow(chars, index) {
  let start = index;
  let end = index;
  while (start - 1 >= 0 && isCjk(chars[start - 1])) start -= 1;
  while (end + 1 < chars.length && isCjk(chars[end + 1])) end += 1;

  // 已经覆盖到 2 字以上：截一个以错字为中心的短词。
  if (end - start + 1 >= 2) {
    if (start === index && end > index) return { start, end: index + 1 };
    if (end === index && start < index) return { start: index - 1, end };
    return { start: Math.max(start, index - 1), end: Math.min(end, index + 1) };
  }

  // 单字词：向两侧找最近的汉字凑成双字。
  const left = start - 1 >= 0 && isCjk(chars[start - 1]);
  const right = end + 1 < chars.length && isCjk(chars[end + 1]);
  if (left) return { start: start - 1, end };
  if (right) return { start, end: end + 1 };
  return null;
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 归一到五档量表。档位内允许 0.1 粒度，但四舍五入到最近档位，
 * 避免模型给出 0.63 这种无法审计的分数。
 */
export function snapToScale(value) {
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
 * 按句号/问号/感叹号切分；每段打字时长 = 字数 ÷ 人设打字速度（带抖动）；
 * 小概率注入一个错字段，并在下一段用一句自然的更正修复。
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

  const segments = [];
  groups.forEach((body, groupIndex) => {
    let delivered = body;
    let correction = null;
    if (rng() < persona.typoRate) {
      const chars = [...body];
      for (let i = 0; i < chars.length; i += 1) {
        const typo = TYPO_MAP[chars[i]];
        if (!typo) continue;
        // 只改动真正的词：更正窗口必须由汉字组成（见 correctionWindow）。
        // 以前用固定 ±1 字符的窗口，遇到标点就产出 `*更正：好，` 这类残片。
        const window = correctionWindow(chars, i);
        if (window && rng() < 0.6) {
          correction = {
            right: chars.slice(window.start, window.end + 1).join(""),
            wrongText: chars
              .slice(window.start, window.end + 1)
              .map((char, offset) => (window.start + offset === i ? typo : char))
              .join(""),
          };
          chars[i] = typo;
          delivered = chars.join("");
          break;
        }
      }
    }
    const speed = persona.typingSpeed * (1 + (rng() * 2 - 1) * persona.typingJitter);
    segments.push({
      text: delivered,
      typingMs: Math.round(([...delivered].length / Math.max(0.5, speed)) * 1000),
      gapMs: groupIndex === groups.length - 1 ? 0
        : Math.round(persona.gapMinMs + rng() * (persona.gapMaxMs - persona.gapMinMs)),
      sticker: rng() < persona.stickerRate ? pick(rng, persona.stickers) : null,
    });
    if (correction) {
      segments.push({
        // 更正写成完整的中文句子，而不是 `*更正：xxx`：那个行首星号是从
        // 英文聊天习惯搬来的，在中文气泡里只是个没有含义的符号，学员看到
        // 会以为是乱码。这里直接用口语把更正说清楚。
        text: `打错了，是「${correction.right}」。`,
        typingMs: 700,
        gapMs: 500,
        sticker: null,
      });
    }
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
    "最近你用 AI 做过什么？挑一件具体的说说：当时在忙啥、用了哪个工具、最后弄出来的东西咋样。",
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

export function interviewMessages({ thread, slot, followUp, lastNote }) {
  const history = thread
    .filter((item) => !item.pending && item.content)
    .slice(-8)
    .map(({ role, content }) => ({ role: role === "user" ? "user" : "assistant", content }));
  const rubric = rubricFor(slot.id);
  const isAnchor = Boolean(slot.anchorPrompt);
  const ask = followUp
    ? `学员刚回答了你的问题但没答到位（评分备注：${lastNote || "不够具体"}）。请从另一个角度追问，语气自然，一到两句。`
    : isAnchor
      ? `请提出你的第 ${slot.index + 1} 个问题：请学员讲一段最近真实的 AI 使用经历。用你自己的话问，一到两句，别照抄提示。`
      : `请提出你的第 ${slot.index + 1} 个采访问题。要求：这一问必须落在本话题考点上（${rubric?.intent ?? slot.rubric}），可参考问法（${slot.asks.join("／")}），用你自己的话问，一到两句，别照抄。`;
  return [
    {
      role: "system",
      content: [
        `你是${INTERVIEWER.byline}，正在对一位学员做关于「如何与 AI 协作」的采访测评。`,
        `人设要点：口语化、爱追问细节、偶尔用「${INTERVIEWER.tics.slice(0, 3).join("」「")}」这类口头语；消息短促（每段不超过 60 字），一次说 1–3 段；绝不用书面腔、绝不列大纲。`,
        "输出的是聊天消息：不要用任何 markdown 记号（不要 ** 加粗、不要 # 标题、不要 - 或 * 开头的列表、不要 ` 反引号），就用普通中文句子。",
        isAnchor
          ? "开场策略：先请学员讲他自己最近真实的 AI 使用经历（做了什么、用什么工具、结果如何），后续所有追问都围绕这段经历展开，不要派发虚构任务。"
          : "追问策略：承接学员前面讲过的经历与工具，用「你刚才说的那件事」这类接续语，而不是另起一个假设场景。",
        `【本话题的唯一评分考点】${rubric?.intent ?? slot.rubric}`,
        "【分档锚点 · 只能选其中一档】",
        formatAnchors(slot.id),
        judgeDiscipline(),
        '输出格式：只输出一个 JSON 对象（不要 markdown 代码块）：{"reply":"你对学员说的话，可用\n分段","score":0到1的小数,"evidence":"从学员原话摘录的证据片段","note":"一句话档位判定依据"}。',
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
