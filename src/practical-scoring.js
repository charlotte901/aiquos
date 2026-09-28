// 实操任务评分核心（纯函数，worker 与测试共用，不依赖 DOM/React）。
//
// 题库设计（src/banks/practical-*.json）：每道实操题带两套评分标准——
//   · rubricPrompt  评分标准一「提示词评分」：5 个维度 × 2 分 = 10 分
//   · rubricProduct 评分标准二「最终产物评分」：5 个维度 × 2 分 = 10 分
// 每个维度都有三档文字描述（excellent / good / pass）。
//
// 打分链路分两段，职责刻意分开：
//   1. **判档**——LLM 评委（或离线规则）只决定每个维度落在哪一档，
//      并给一句评语；判档是主观判断，交给模型/规则。
//   2. **算分**——档位 → 分数由 LEVEL_CREDIT 确定性换算，同样的档位
//      永远得到同样的分数，可复现、可回归测试。LLM 永远不直接产出分数，
//      避免温度/措辞带来的分数漂移。

/** 档位 → 该维度满分的折算系数。优秀=满分、良好=3/4、待改进=1/4；
 *  全良好 7.5/10、全待改进 2.5/10，中间留出足够区分度。 */
export const LEVEL_CREDIT = { excellent: 1, good: 0.75, pass: 0.25 };

export const LEVEL_LABELS = { excellent: "优秀", good: "良好", pass: "待改进" };

/** 判档结果的展示顺序（评分报告按此排列）。 */
export const LEVEL_ORDER = ["excellent", "good", "pass"];

/** 档位别名归一：LLM 输出与中文档位名都收。未知返回 null，由调用方兜底。 */
export function normalizeLevel(input) {
  const key = String(input ?? "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEVEL_CREDIT, key)) return key;
  if (["优", "优秀", "完全达到", "fully"].includes(key)) return "excellent";
  if (["良", "良好", "基本达到", "部分达到", "partial"].includes(key)) return "good";
  if (["及格", "合格", "差", "弱", "待改进", "未达到", "fail"].includes(key)) return "pass";
  return null;
}

/** 「2分」→ 2。解析失败回退 2（题库实测全部为 2 分）。 */
export function parseRubricPoints(points) {
  const value = Number(String(points ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : 2;
}

/** 分值落在 0.5 的整数倍上，报告里不出现 1.4375 这类数字。 */
function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 按判档结果给一套 rubric 计分。
 *
 * @param {Array} rubric 题库里的 rubricPrompt / rubricProduct
 * @param {Object} judged 形如 { "角色设定": { level, comment }, … }；
 *   未知维度被忽略，缺失维度按 pass 计（拿不到证据不奖励）。
 * @returns {{rows: Array, awarded: number, max: number}}
 */
export function scoreRubric(rubric, judged = {}) {
  const rows = (rubric ?? []).map((row) => {
    const max = parseRubricPoints(row.points);
    const entry = judged?.[row.dimension];
    const level = normalizeLevel(entry?.level) ?? "pass";
    return {
      dimension: row.dimension,
      max,
      awarded: roundHalf(max * LEVEL_CREDIT[level]),
      level,
      levelLabel: LEVEL_LABELS[level],
      comment: typeof entry?.comment === "string" ? entry.comment.slice(0, 140) : "",
    };
  });
  return {
    rows,
    awarded: round2(rows.reduce((sum, row) => sum + row.awarded, 0)),
    max: round2(rows.reduce((sum, row) => sum + row.max, 0)),
  };
}

/**
 * 两套 rubric 合成整题得分。
 *
 * @returns {{prompt, product, totalScore, maxScore, credit}}
 *   credit = totalScore / maxScore（0–1），作为六维证据的档位分。
 */
export function combinePracticalScore(promptPart, productPart) {
  const totalScore = round2((promptPart?.awarded ?? 0) + (productPart?.awarded ?? 0));
  const maxScore = round2((promptPart?.max ?? 0) + (productPart?.max ?? 0));
  return {
    prompt: promptPart,
    product: productPart,
    totalScore,
    maxScore,
    credit: maxScore > 0 ? round2(Math.max(0, Math.min(1, totalScore / maxScore))) : 0,
  };
}

/** 需求列表里以「评分标准」开头的行是评分构成的元信息，不是交付要求。 */
export function deliveryRequirements(task) {
  return (task?.requirements ?? []).filter((item) => !/^评分标准/.test(String(item)));
}

/** 评分构成元信息（如「评分标准一：提示词评分（10分）」），简报里单列展示。 */
export function scoringSchemeRows(task) {
  return (task?.requirements ?? []).filter((item) => /^评分标准/.test(String(item)));
}

/** 归一化比例写法：全角数字/冒号 → 半角，× → x。 */
function normalizeRatioText(input) {
  // 两个易错点：
  //   1. 必须先把全角数字转半角再处理冒号 —— 顺序反了相邻全角数字会连成一串；
  //   2. 转换要用 String.fromCharCode（得到字符），不是 String()（会把码位
  //      当数字转成十进制文本，０ → "48" 而不是 "0"）。
  return String(input ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ":")
    .replace(/[×✕✖]/g, "x");
}

const RATIO_TO_SIZE = [
  [["16:9", "16：9"], "1536x864"],
  [["9:16"], "864x1536"],
  [["3:2"], "1536x1024"],
  [["2:3"], "1024x1536"],
];

/** 从任意文本里提取学员要求的画面比例 → 生图尺寸；没写返回 undefined。 */
export function ratioToSize(input) {
  const text = normalizeRatioText(input);
  for (const [keys, size] of RATIO_TO_SIZE) {
    if (keys.some((k) => text.includes(k))) return size;
  }
  return undefined;
}

/**
 * 输出尺寸由**学员的提示词**决定，而不是由题面代办。
 *
 * 为什么必须这样：早期实现从题面读「16:9」并自动指定尺寸，于是哪怕学员
 * 一个字的比例要求都没写，「规格合规」这一维度也自动满足 —— 该维度对所有
 * 水平档恒为满分，白送 2 分且不产生任何区分度（实测低/中/高三档都是 2.00）。
 * 改为按学员提示词决定后：写明比例才得到对应尺寸，没写就输出默认方形，
 * 「规格合规」才真实反映学员是否把要求表达清楚。
 *
 * @param {string} prompt 学员的提示词（可含历次迭代，取最后一次即可）
 * @param {object} [task] 任务（仅在学员未提比例时用于回退判断，通常不参与）
 * @returns {string|undefined} 白名单内的尺寸串；undefined 表示用服务端默认
 */
export function taskImageSize(prompt, task) {
  void task;
  return ratioToSize(prompt);
}

// ── LLM 评委 ────────────────────────────────────────────────────────────────

function rubricText(rubric) {
  return (rubric ?? [])
    .map((row, index) => `${index + 1}. ${row.dimension}（${row.points}）\n   优秀：${row.excellent}\n   良好：${row.good}\n   待改进：${row.pass}`)
    .join("\n");
}

/**
 * 评委提示词。参考答案（standardPrompt / standardProduct）只在服务端拼进
 * 上下文供对照，永远不下发到浏览器。
 *
 * 图片任务的关键点：判官必须**看到生成的图**。
 * 产物维度里有「原图保真」「边缘自然」这类只能看图才能判断的要求；
 * 早期实现只把提示词发给判官、并附一句"请依据提示词的画面要素判档"，
 * 等于让评委闭着眼睛给"像素有没有变形、拼接处有没有伪影"打分 ——
 * 5 个产物维度全部落空。现在把产物图作为 image_url 一并送入（多模态）。
 *
 * @param {object} task 任务
 * @param {object} payload 学员作答
 * @param {string} payload.productImage 图片任务的产物 data URI（可选）
 */
export function practicalJudgeMessages(task, { prompts = [], finalPrompt = "", product = "", isImage = false, iterations = 1, productImage = "", referenceImages = [] }) {
  const promptHistory = (prompts.length ? prompts : [finalPrompt])
    .map((prompt, index) => `第 ${index + 1} 次：${prompt}`)
    .join("\n\n");
  const hasImage = typeof productImage === "string" && productImage.startsWith("data:image/");
  // 参考图（题目自带的输入素材）：判「原图保真」「色彩融合」「构图保留」这类维度
  // 必须同时看到原图与产物，否则评委只能凭空猜测原图长什么样。
  const refs = (Array.isArray(referenceImages) ? referenceImages : [])
    .filter((src) => typeof src === "string" && src.startsWith("data:image/"))
    .slice(0, 3);
  const hasRefs = refs.length > 0;
  const productText = isImage
    ? (hasImage
        ? (hasRefs
            ? `（本任务为图片生成。消息中附有 ${refs.length + 1} 张图片：前 ${refs.length} 张是任务给定的参考原图，最后 1 张是学员的最终产物。`
              + "判「原图保真/构图保留」类维度时，请逐项比对产物与原图（主体位置、朝向、大结构、色调是否一致、有无被重绘或替换）；"
              + "判「边缘自然/色彩融合」时观察衔接处有无接缝与伪影。）"
            : "（本任务为图片生成，产物图已附上，但未收到参考原图；判「原图保真」类维度时请依据产物自身是否协调一致来判档，并在评语中说明未见到原图。）")
        : "（本任务为图片生成，但未收到产物图；请仅依据提示词覆盖到的画面要素判档，并在评语中说明未见到图。）")
    : String(product ?? "").slice(0, 4000);

  const userContent = [
    `任务：${task.title}`,
    `目标：${task.goal}`,
    `交付要求：\n${deliveryRequirements(task).map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    `原始素材：\n${String(task.material ?? task.source ?? "").slice(0, 2000)}`,
    "",
    `【评分标准一 · 提示词评分】\n${rubricText(task.rubricPrompt)}`,
    `【参考提示词（仅供对照）】\n${String(task.standardPrompt ?? "").slice(0, 1800)}`,
    "",
    `【评分标准二 · 最终产物评分】\n${rubricText(task.rubricProduct)}`,
    `【参考产物（仅供对照）】\n${String(task.standardProduct ?? "").slice(0, 2200)}`,
    "",
    `【学员的提示词记录（共 ${iterations} 次迭代，最后一条为最终版）】\n${promptHistory || "（无）"}`,
    `【最终产物】\n${productText}`,
  ].join("\n");

  return [
    {
      role: "system",
      content: [
        "你是 AIQUOS 实操任务的评委，按题目的评分标准逐维度判档。",
        "",
        "判档纪律（直接影响测评公平性，必须遵守）：",
        "1. **用三档描述做锚点比对，不要凭整体印象给分。** 对每个维度，先读该维度的「优秀/良好/待改进」描述，再把学员表现与三段描述逐一比对，选最贴合的那一档。",
        "2. **三档都要敢于使用。** 明显缺项就是待改进，完整达成就是优秀；不要因为「看起来还挺努力」而普遍给良好。若某维度学员完全没做（例如提示词里根本没提该要求），必须判待改进。",
        "3. **只看证据，不猜动机。** 判据必须能在学员的提示词或产物里找到。产物缺失、答非所问、或与题目要求无关时，判待改进。",
        "4. **维度之间独立判档。** 不要因为某一维很强就把其余维度一起抬高；也不要用同一个理由给多个维度判同一档。",
        "5. **评语要具体**，指出学员做到了什么或缺了什么（如「未给出字数区间」「保留了1287人这一关键数据」），不要写「基本符合要求」这类空话。",
        "6. **涉及「保真/保留」的维度必须与参考原图逐项比对。** 若附有参考原图，不得仅凭产物本身好看就判优秀；必须核对原图的主体、位置、朝向、结构是否被保留。原图被重绘、主体被替换或构图被改动，一律不得判优秀。",
        "",
        '只输出一个 JSON 对象（不要 markdown 代码块），格式：{"prompt":[{"dimension":"维度名","level":"excellent|good|pass","comment":"不超过40字的评语"}],"product":[…]}。',
        "level 只能取 excellent（达到优秀描述）、good（达到良好描述）、pass（仅达到待改进描述）。dimension 必须与评分标准里的维度名完全一致，顺序一致，一套不漏。",
      ].join("\n"),
    },
    {
      role: "user",
      // 多模态：文字 → 参考图（按顺序标注）→ 产物图。
      // 顺序必须固定且与文案说明一致，否则评委分不清哪张是原图、哪张是产物。
      content: (hasImage || hasRefs)
        ? [
            { type: "text", text: userContent },
            ...refs.map((url, index) => ({
              type: "text",
              text: `【参考原图 ${index + 1}】`,
            })),
            ...refs.flatMap((url) => [{ type: "image_url", image_url: { url } }]),
            ...(hasImage
              ? [{ type: "text", text: "【学员的最终产物】" },
                 { type: "image_url", image_url: { url: productImage } }]
              : []),
          ]
        : userContent,
    },
  ];
}

/** 解析评委输出；结构不对返回 null，调用方走离线规则。 */
export function parsePracticalJudgeJson(raw) {
  const text = String(raw ?? "").trim().replace(/^```(?:json)?|```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const collect = (list) => {
    if (!Array.isArray(list)) return null;
    const judged = {};
    for (const item of list) {
      if (!item || typeof item.dimension !== "string") continue;
      judged[item.dimension] = { level: item.level, comment: item.comment };
    }
    return Object.keys(judged).length ? judged : null;
  };
  const prompt = collect(parsed.prompt);
  const product = collect(parsed.product);
  return prompt || product ? { prompt: prompt ?? {}, product: product ?? {} } : null;
}

/** 判档结果 → 完整得分（worker 直接返回给前端渲染）。 */
export function scorePracticalResult(task, judged, judgeLabel) {
  return {
    judged: judgeLabel,
    taskId: task.id,
    ...combinePracticalScore(
      scoreRubric(task.rubricPrompt, judged?.prompt ?? {}),
      scoreRubric(task.rubricProduct, judged?.product ?? {}),
    ),
  };
}

// ── 离线规则判档（无 DeepSeek Key / 上游失败时的兜底） ───────────────────────
//
// 规则不追求准确，追求**有界、确定、可解释**：按维度给档并标注
// judged: "heuristic"，界面明示「离线规则评审」，不冒充 AI 评分。

const PROMPT_MARKERS = [
  /你是|担任|作为一个|角色[是设]|扮演/,
  /目标|任务|需要你|请你|帮我|请完成/,
  /格式|输出|列表|表格|分点|分条|json|markdown|结构/i,
  /字数|不少于|以内|不超过|至少|风格|语气|口吻|受众/,
  /素材|原文|以下|附上|如下|背景|代码/,
  /要求|注意|必须|不要|避免|确保/,
];

function tokenize(text) {
  return String(text ?? "").split(/[，。：:、；;,\s（）()·/]+/).filter((token) => token.length >= 2);
}

/** 提示词质量 0–1：长度（说清楚需要篇幅）+ 要素覆盖（角色/目标/格式/约束/素材/纪律）。 */
function promptQuality(prompt) {
  const text = String(prompt ?? "");
  if (!text.trim()) return 0;
  const markerHits = PROMPT_MARKERS.filter((pattern) => pattern.test(text)).length;
  const lengthScore = Math.min(1, [...text].length / 130);
  return Math.min(1, 0.55 * lengthScore + 0.45 * (markerHits / PROMPT_MARKERS.length));
}

/** 产物质量 0–1：交付要求关键词覆盖率 + 产出篇幅充足度。 */
function productQuality(output, requirements) {
  const text = String(output ?? "");
  if (!text.trim()) return 0;
  const hits = requirements.filter((requirement) => {
    const tokens = tokenize(requirement).filter((token) => token.length >= 2);
    return tokens.some((token) => text.includes(token));
  }).length;
  const coverage = requirements.length ? hits / requirements.length : 0.5;
  const lengthScore = Math.min(1, [...text].length / 240);
  return Math.min(1, 0.7 * coverage + 0.3 * lengthScore);
}

/** 维度描述与产物的字面重叠：给同一次评分内部的维度之间制造差异。 */
function rowOverlap(text, row) {
  const tokens = [...new Set(tokenize(`${row.excellent}${row.good}`))];
  if (!tokens.length || !String(text ?? "").trim()) return 0;
  return tokens.filter((token) => String(text).includes(token)).length / tokens.length;
}

function levelFromQuality(quality) {
  return quality >= 0.72 ? "excellent" : quality >= 0.42 ? "good" : "pass";
}

/**
 * 离线规则评分：产出与 scorePracticalResult 相同的结构，前端无差别渲染。
 * 图片任务看不到产物内容，产物侧以最终提示词的画面具体度估算。
 */
export function heuristicPracticalScore(task, { prompts = [], finalPrompt = "", product = "", isImage = false, iterations = 1 } = {}) {
  const effectivePrompts = prompts.length ? prompts : finalPrompt ? [finalPrompt] : [];
  const bestPrompt = effectivePrompts.reduce((best, current) => (
    [...current].length > [...best].length ? current : best
  ), "");
  const requirements = deliveryRequirements(task);
  const pq = promptQuality(bestPrompt);
  const rq = isImage ? pq : productQuality(product, requirements);

  const judgedPrompt = {};
  for (const row of task.rubricPrompt ?? []) {
    const quality = Math.min(1, pq + 0.25 * rowOverlap(bestPrompt, row));
    judgedPrompt[row.dimension] = {
      level: levelFromQuality(quality),
      comment: "离线规则：按提示词的要素覆盖与具体程度估算。",
    };
  }
  const judgedProduct = {};
  for (const row of task.rubricProduct ?? []) {
    const quality = isImage
      ? Math.min(1, rq + 0.2 * rowOverlap(bestPrompt, row))
      : Math.min(1, rq + 0.25 * rowOverlap(product, row));
    judgedProduct[row.dimension] = {
      level: levelFromQuality(quality),
      comment: isImage ? "离线规则：图片产物按提示词画面要素估算。" : "离线规则：按交付要求的关键词覆盖估算。",
    };
  }
  // 迭代次数不折入档位：评分完全由 rubric 驱动，「会优化提示词」的价值
  // 体现在最终提示词与产物的质量里，不单独加分。
  return scorePracticalResult(task, { prompt: judgedPrompt, product: judgedProduct }, "heuristic");
}
