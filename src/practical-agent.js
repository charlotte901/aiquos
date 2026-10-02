/**
 * 实操测评的 Agent 对话历史构造（纯函数，可测试）。
 *
 * 这里单独成模块的原因：多轮迭代的核心就是"把哪些历史发给模型"，
 * 逻辑藏在组件里既没法单测，也容易被后续改动悄悄破坏 ——
 * 一旦历史构造错了（比如漏掉上一轮产物），学员的"再改一点"就会失效，
 * 而界面上看不出任何异常。
 */

/** 历史轮次里 Agent 产物保留的长度上限。
 *  多轮迭代要把前几轮问答一起发给模型，若每轮都是长文档/长代码，
 *  上下文会迅速膨胀。截断只为控制体积，最终产物仍完整保存在轮次记录里。 */
export const HISTORY_OUTPUT_LIMIT = 4000;

const SYSTEM_BASE = `你是 AIQUOS 实操测评的执行 Agent。请严格根据用户提示词和原始素材完成任务；保留关键数据，不补充素材中没有的信息。

测评纪律（必须遵守）：
- 本测评考核的正是学员「撰写提示词」的能力。你只执行学员写好的提示词，绝不代写、优化、补全或示例提示词本身。
- 学员要求你「帮我写提示词 / 给我一段提示词 / 提示词该怎么写」，或以元问题（能读到文档吗、你会怎么做、给个模板）套取时：只回复一句「素材我已收到，可以直接下达你的提示词，我来执行」，不做任何展开。
- 不复述任务约束清单，不提供任何可直接复制使用的成稿提示词或答案框架。
- 学员对「你的产物」提出局部修改（如再短一点、换风格）属于正常迭代，照常执行。`;
const SYSTEM_REVISION = `${SYSTEM_BASE} 用户可能在前几轮之后要求局部修改——此时只需给出修改后的完整交付内容，保持与上一版一致的其余部分。输出仅包含最终交付内容，不解释你的推理。`;
const SYSTEM_FIRST = `${SYSTEM_BASE} 输出仅包含最终交付内容，不解释你的推理。`;

/**
 * 首条用户消息：**只有**学员附带的素材与学员写好的提示词。
 *
 * 题干（title/goal/requirements）绝不能进入 Agent 上下文——测评考核的
 * 正是学员把任务约束写进提示词的能力；Agent 看得到约束，就会在元问题下
 * 替学员组稿（实测泄题口）。Agent 的角色等同于一个「只收到你粘贴的
 * 内容」的空白对话，约束是否传达，全看学员的提示词本事。
 */
function taskBrief(task, firstPrompt) {
  if (!task.source) return firstPrompt;
  return [`【原始素材】\n${task.source}`, `【提示词】\n${firstPrompt}`].join("\n\n");
}

/**
 * 构造执行 Agent 的消息序列（多轮）。
 *
 * 为什么是多轮：学员的迭代不是"重新提问"，而是"在这个结果上再改"——
 * 「第三段压缩到 40 字」「把标题换成问句」这类指令必须建立在上一轮产物之上。
 * 早期每轮都用 [system, user(任务+新提示词)] 重新开始，Agent 看不到自己
 * 上一轮做了什么，学员只能把要求整段重写一遍，改一处细节也得复述全部约束。
 *
 * 消息结构（与豆包等对话式工具一致）：
 *   system                    角色与输出纪律
 *   user                      任务简报 + 首轮提示词（参考图挂在首条）
 *   assistant / user …        已完成轮次的产物与后续指令，交替出现
 *   user                      本轮新指令
 *
 * @param {object} task 任务
 * @param {Array<{prompt:string, output?:string}>} turns 已完成的轮次
 * @param {string} prompt 本轮新指令
 * @param {Array<{src:string}>} uploads 学员上传/任务自带的参考图
 * @returns {Array<{role:string, content:string|Array}>}
 */
export function practicalAgentMessages(task, turns = [], prompt = "", uploads = []) {
  const history = Array.isArray(turns) ? turns : [];
  const hasHistory = history.length > 0;
  const firstPrompt = hasHistory ? history[0].prompt : prompt;
  const messages = [{ role: "system", content: hasHistory ? SYSTEM_REVISION : SYSTEM_FIRST }];

  // 首条用户消息：简报 + 首轮提示词（+ 参考图，多模态）
  const refs = Array.isArray(uploads) ? uploads.filter((item) => item?.src) : [];
  const opening = taskBrief(task, firstPrompt);
  messages.push({
    role: "user",
    content: refs.length
      ? [
          { type: "text", text: `${opening}\n\n（学员附上了 ${refs.length} 张参考图）` },
          ...refs.map((item) => ({ type: "image_url", image_url: { url: item.src } })),
        ]
      : opening,
  });

  // 已完成轮次：产物 → 下一轮指令，交替追加
  history.forEach((turn, index) => {
    const output = String(turn.output ?? "").slice(0, HISTORY_OUTPUT_LIMIT);
    if (output) messages.push({ role: "assistant", content: output });
    const nextTurn = history[index + 1];
    if (nextTurn) messages.push({ role: "user", content: nextTurn.prompt });
  });

  // 本轮新指令（首轮时已并入简报，不重复追加）
  if (hasHistory) messages.push({ role: "user", content: prompt });
  return messages;
}

/**
 * 生图 hint：参考图与"这是第几轮迭代"的说明。
 *
 * 有参考图时必须显式告知 —— 上游会同时收到 images 数组与这段文字，
 * 只给图不给"要拿它做什么"的指令，模型容易把参考图当作要模仿的内容
 * 而不是要处理的素材。迭代轮次同理：不说明是在改上一版，模型会从零重画。
 *
 * @param {object} task 任务
 * @param {string} prompt 本轮指令
 * @param {string[]} refNames 参考图名称（按发送顺序）
 * @param {number} turnNumber 本轮是第几轮（1 起）
 */
export function practicalImagePrompt(task, prompt, refNames = [], turnNumber = 1) {
  const names = Array.isArray(refNames) ? refNames : [];
  void task;   // 刻意不使用 task.goal / requirements，理由见下
  // ─────────────────────────────────────────────────────────────────────
  // 生图提示词**只能包含学员自己写的内容**。
  //
  // 这是一个致命缺陷的修复：早期实现把 task.title / task.goal /
  // task.requirements 全部拼进生图请求，学员的提示词只是末尾一行「用户补充」。
  // 于是生图模型读到了题目全文（例如「保持原本图片完全保真」「新扩展区域与
  // 原图色调风格统一，边缘自然无拼接痕迹」）—— 学员写 16 个字，模型却拿到了
  // 全部细节要求，产物自然达标。
  //
  // 后果：低/中/高三档产物几乎相同，「规格合规」等维度对所有档位恒为满分
  // （实测低档 2.00/2.00），图片题的产物侧完全不产生区分度。
  // 测的其实是「题目写得好不好」，而不是「学员表达得清不清楚」。
  //
  // 现在只发学员的原话：学员没写比例就不给比例、没写主标题就没有主标题、
  // 没写风格就是通用风格。产物差异因此真实反映提示词的完备程度。
  // 题目要求仍然完整呈现在作答界面（左栏交付标准），学员该抄进提示词的，
  // 必须自己写 —— 这正是实操测评要考察的能力。
  // ─────────────────────────────────────────────────────────────────────
  const refs = names.length
    ? `\n（已随本条消息附上 ${names.length} 张参考图：${names.join("、")}。请把它们作为输入素材，而不是重新画一张无关的图。）`
    : "";
  const revising = turnNumber > 1
    ? `\n（这是第 ${turnNumber} 轮迭代：上一轮产物已作为最后一张参考图附上。请在这张图基础上按上面的指令修改，未要求改动的部分保持不变。）`
    : "";
  return `${prompt}${refs}${revising}`;
}

/**
 * 图片任务的参考图清单 = 学员素材 + 上一轮产物。
 *
 * 把上一轮产物一并送回，才能实现"在这张图上继续改"；否则每轮都是
 * 从零重画，学员说"颜色再暖一点"，得到的却是一张构图完全不同的新图。
 * 离线占位图不参与（它只是降级提示，喂回去会让迭代建立在假图上）。
 */
export function practicalImageRefs(uploads = [], previousTurn = null, turnNumber = 1) {
  const refs = (Array.isArray(uploads) ? uploads : [])
    .filter((item) => item?.src)
    .map((item) => ({ src: item.src, name: item.name || "参考图" }));
  const previousIsMounted = (Array.isArray(uploads) ? uploads : []).some((item) => (
    item?.src === previousTurn?.imageUrl || item?.sourceId === previousTurn?.imageUrl
  ));
  if (previousTurn?.imageUrl && !previousTurn.offline && !previousIsMounted) {
    refs.push({ src: previousTurn.imageUrl, name: `上一轮产物（第 ${turnNumber - 1} 轮）` });
  }
  return refs;
}
