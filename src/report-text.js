// 报告文案的 LLM 生成规则集。
//
// 分工（2026-10-03 用户要求）：「基于我们接入的模型让他来写这个报告的文字部分，
// 你只需要去写一套规则」——即这里的 prompt 与格式约束由本模块定义，具体措辞
// 交给 DeepSeek 生成。不用 LLM 时（离线、无 key、超时）降级到本文件的确定性
// 模板，保证报告永远能出、且内容仍然真实（全部由实测分数推导）。
//
// 规则的三条硬约束（写进 prompt，也在解析层强制）：
//   1. 只能使用给出的分数与事实，不得编造未提供的测评细节；
//   2. 三段结构固定（评价 / 建议 / 资源导语），每段有明确字数上限；
//   3. 输出为纯 JSON，便于机器解析；任何解析失败一律回退模板。
import { buildAdviceItems, buildAdvicePace, buildEvaluationParagraph } from "./report-learning-plan.js";

// 每段的字数上限：报告要压在两页内，文案必须短。
export const REPORT_TEXT_LIMITS = Object.freeze({
  evaluation: 220,     // 第一段：学员评价
  advice: 320,         // 第二段：学习建议导语
  resources: 160,      // 第三段：资源推荐导语
});

const SYSTEM_PROMPT = `你是 AIQUOS 测评报告的文字撰写者。你要根据给定的测评数据，写一份正式、克制、可执行的中文报告文字。

写作规则（必须全部遵守）：
1. 只能使用给定数据里出现的事实（分数、档位、维度名、通道分、资源标题）。禁止编造任何未给出的测评细节、经历、案例或数字。
2. 语气像一位严谨的测评分析师：陈述事实、给出判断、提出行动，不用营销腔、不用感叹号、不恭维学员。
3. 三段各有上限字数，必须写满但不超：
   - evaluation（学员能力评价）：不超过 ${REPORT_TEXT_LIMITS.evaluation} 字。说清总分档位、相对强项与最需补强的方向、六维的分档结构。
   - advice（学习建议导语）：不超过 ${REPORT_TEXT_LIMITS.advice} 字。说明建议的排序逻辑，并点出最该先动手的两三个方向。
   - resources（资源推荐导语）：不超过 ${REPORT_TEXT_LIMITS.resources} 字。说明资源如何与薄弱维度匹配、建议的使用顺序。
4. 输出必须是单个 JSON 对象，不要 markdown 代码围栏、不要多余说明：
{"evaluation":"...","advice":"...","resources":"..."}
5. 每个字段都必须是非空字符串。若某项数据缺失（例如没有三通道分数），就绕开它，不要提及"数据缺失"。`;

/** 组装交给模型的用户消息：只放真实数据，禁止夹带评价性引导。 */
export function reportPromptPayload(model, plan) {
  const dimensions = (model?.dimensions ?? []).map((dimension) => ({
    name: dimension.name,
    score: Number.isFinite(Number(dimension.score)) ? Math.round(Number(dimension.score)) : null,
  }));
  return {
    overallScore: Number.isFinite(Number(model?.overallScore)) ? Math.round(Number(model.overallScore)) : null,
    grade: model?.grade ?? null,
    gradeLabel: plan?.stage?.label ?? null,
    dimensions,
    channelOveralls: model?.channelOveralls
      ? {
        客观题: Math.round(model.channelOveralls.objective ?? 0),
        对话采访: Math.round(model.channelOveralls.interview ?? 0),
        实操工作台: Math.round(model.channelOveralls.practical ?? 0),
      }
      : null,
    adviceOrder: (plan?.adviceItems ?? []).map((item) => ({ name: item.name, score: item.score, band: item.gradeLabel })),
    resourceTitles: (plan?.resources ?? []).map((resource) => resource.title),
  };
}

export function reportChatMessages(model, plan) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `以下是本次测评的真实数据，请据此写三段报告文字：\n${JSON.stringify(reportPromptPayload(model, plan), null, 2)}`,
    },
  ];
}

/**
 * 解析模型返回：容忍代码围栏、前后废话、字段缺失。
 * 任一段为空或超限过多时按缺失处理（交给模板补齐），不整段丢弃。
 */
export function parseReportText(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const stripped = raw.replace(/```(?:json)?/giu, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
  const pick = (key, limit) => {
    const value = parsed?.[key];
    if (typeof value !== "string") return null;
    const text = value.replace(/\s+/gu, " ").trim();
    if (!text) return null;
    // 超限 1.5 倍以上说明模型没守规则，判为不可用；轻微超出直接截断。
    if (text.length > limit * 1.5) return null;
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
  };
  const result = {
    evaluation: pick("evaluation", REPORT_TEXT_LIMITS.evaluation),
    advice: pick("advice", REPORT_TEXT_LIMITS.advice),
    resources: pick("resources", REPORT_TEXT_LIMITS.resources),
  };
  return Object.values(result).some(Boolean) ? result : null;
}

/**
 * 确定性模板（降级路径，同时作为模型缺项时的补齐）。
 *
 * 全部由真实分数推导，不引入任何外部事实——与 LLM 路径同一条底线：
 * 报告里出现的每个判断都能在数据里找到依据。
 */
export function reportTemplateText(model, plan) {
  const ordered = (plan?.adviceItems ?? []).slice().sort((left, right) => left.score - right.score);
  const weakest = ordered[0];
  const strongest = ordered[ordered.length - 1];
  const evaluation = buildEvaluationParagraph(model);

  const advice = weakest
    ? `建议按「薄弱优先」的顺序推进：先处理 ${ordered.slice(0, 3).map((item) => item.name).join("、")}${ordered.length > 3 ? " 等维度" : ""}。`
      + `其中 ${weakest.name}（${weakest.score} 分）离稳固水平差距最大，建议本轮优先安排；`
      + `${strongest ? `${strongest.name}（${strongest.score} 分）已是相对优势，保持现有练习节奏即可。` : ""}`
      + `${buildAdvicePace(model)}`
    : "六个维度尚未形成完整画像，建议先完成一次完整的综合测评，再按薄弱维度制定练习计划。";

  const resources = plan?.resources?.length
    ? `以下 ${plan.resources.length} 条资源来自 AI 学习资源库，按你的总分、薄弱维度与能力档位匹配，并按「先补最弱」的顺序排列；`
      + `建议从第 1 条开始，完成一条再做下一条，每完成一轮回到本报告对照分数变化。`
    : "当前暂无匹配的学习资源，可稍后重新生成报告。";

  return { evaluation, advice, resources };
}

/**
 * 取得报告文字：优先让模型写，失败则用模板。
 *
 * @param {object} model 报告数据模型
 * @param {object} plan  buildLearningPlan 的输出
 * @param {function} chat 调用模型的函数：({ messages }) => Promise<string>
 *   由调用方注入（浏览器端是 streamDeepSeek / chatOnce，测试里是桩函数）。
 * @returns {Promise<{ text: object, source: "model" | "template" }>}
 */
export async function generateReportText(model, plan, chat) {
  const fallback = reportTemplateText(model, plan);
  if (typeof chat !== "function") return { text: fallback, source: "template" };
  try {
    const raw = await chat({ messages: reportChatMessages(model, plan) });
    const parsed = parseReportText(raw);
    if (!parsed) return { text: fallback, source: "template" };
    // 逐段回退：模型只写了部分段落时，缺失的用模板补，不整份丢弃。
    return {
      text: {
        evaluation: parsed.evaluation ?? fallback.evaluation,
        advice: parsed.advice ?? fallback.advice,
        resources: parsed.resources ?? fallback.resources,
      },
      source: "model",
    };
  } catch {
    return { text: fallback, source: "template" };
  }
}

/**
 * 校验一段报告文字是否「只用了给定数据」。
 *
 * 用于在测试与 QA 中拦截模型编造：抽取文中所有数字，逐个核对是否出现在
 * 允许的数值集合里。允许的集合来自真实数据（分数、档位阈值、条目数等）。
 */
export function findUnfoundedNumbers(text, model, plan) {
  const allowed = new Set();
  const add = (value) => {
    const number = Number(value);
    if (Number.isFinite(number)) allowed.add(String(Math.round(number)));
  };
  add(model?.overallScore);
  add(plan?.score);
  for (const dimension of model?.dimensions ?? []) {
    add(dimension.score);
    add(Number(dimension.score) + 0.5);            // 允许四舍五入到整数
    allowed.add(String(Math.round(100 - Number(dimension.score) || 0)));
  }
  for (const value of Object.values(model?.channelOveralls ?? {})) add(value);
  add((plan?.resources ?? []).length);
  add((plan?.adviceItems ?? []).length);
  add(6);      // 维度总数
  add(100);    // 满分
  for (const threshold of [60, 70, 80, 90]) allowed.add(String(threshold));

  const found = String(text ?? "").match(/\d+(?:\.\d+)?/gu) ?? [];
  return found.filter((token) => {
    const normalized = token.includes(".") ? String(Math.round(Number(token))) : token;
    return !allowed.has(normalized) && !allowed.has(token);
  });
}
