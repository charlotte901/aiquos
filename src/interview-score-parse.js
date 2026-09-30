// 打分轨的响应解析器。
//
// 为什么需要独立解析器：项目的 parseInterviewerJson（src/interviewer.js）
// 是给**聊天轨**用的 —— 它要求返回对象含非空 reply 字段，否则判为失败。
// 而打分轨只返回 {score, evidence, note}，没有 reply。用错解析器会让每一次
// 打分都被判为 unparseable，recordCredit 永不触发，学员的对话分数静默消失。
//
// 与打分纪律一致：档位吸附到 CREDIT_SCALE（7 档非等距）。

import { CREDIT_SCALE } from "./interview-scoring.js";

/** 把任意数值吸附到最近的合法档位。 */
export function snapToScale(value) {
  // NaN 防线：Math.abs(NaN-x) 恒为 NaN、比较恒 false，reduce 会静默落到
  // 最低档 0（而不是中性值）。非有限输入一律回退中间档 0.45。
  if (!Number.isFinite(value)) return 0.45;
  return CREDIT_SCALE.reduce(
    (best, credit) => (Math.abs(credit - value) < Math.abs(best - value) ? credit : best),
    CREDIT_SCALE[0],
  );
}

/**
 * 从模型返回文本里抽出评分 JSON。
 *
 * 容错：允许 ```json 围栏、允许 JSON 前后有解释性文字
 * （模型偶尔会加"以下是我的判定："之类的前缀）。
 *
 * @returns {{score:number, rawScore:number, evidence:string, note:string}|null}
 *   无法解析时返回 null，调用方应保留启发式临时分。
 */
export function parseScoreJson(raw) {
  const text = String(raw ?? "").trim().replace(/^```(?:json)?|```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) return null;
    return {
      score: snapToScale(Math.max(0, Math.min(1, score))),
      rawScore: score,
      evidence: typeof parsed.evidence === "string" ? parsed.evidence : "",
      note: typeof parsed.note === "string" ? parsed.note : "",
    };
  } catch {
    return null;
  }
}
