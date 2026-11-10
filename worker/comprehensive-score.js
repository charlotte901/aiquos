// 服务端权威计分：综合测评完成时，最终分数在服务端收口。
//
// 为什么必须收口：出题与路由早已是服务端权威（/api/comprehensive-question
// 按题号反查难度与维度），但最终分数一直按 vendor 集成指南在浏览器里算——
// 同一份引擎要在两个运行时各跑一遍，报告再上报回服务端存储。现在完成时
// 客户端把 attempt（证据 + 对话记录）POST 过来，服务端：
//   1. 客观题证据按 questionId 反查题库**重推导** credit
//      （calculateQuestionCredit(q, selectedKeys)），客户端给的 credit 一律
//      不信任——证据的难度/维度同样以题库为准；
//   2. 外部证据（对话 conv-* / 实操 prac-*，credit 来自服务端 LLM 评审）
//      只做钳制与白名单过滤；
//   3. interview 记录只收有限数值；
//   4. 用 vendor 核心 + 三通道融合算出 result 与 composite 返回。
// 客户端拿服务端结果生成快照（scoredBy: "server"）；离线/失败时回退本地
// 计算（scoredBy: "local"），离线测评能力不受影响。
import { calculateQuestionCredit, scoreAssessment } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { buildComposite } from "../src/comprehensive-weighting.js";
import { getBankState } from "./bank-store.js";
import { DEFAULT_EDITION, normalizeEdition } from "../src/bank-editions.js";
import { json, readJson } from "./http.js";

export const COMPREHENSIVE_SCORE_PATH = "/api/comprehensive-score";

const DIFFICULTIES = new Set(["low", "medium", "high"]);
const DIMENSION_KEY = /^D[1-6]$/;
const EXTERNAL_ID = /^(conv|prac)-/;
const MAX_EVIDENCE = 100;

/**
 * 重建证据列表（纯函数，测试直测）。
 *
 * 客观题证据：questionId 必须在题库里；credit/难度/维度全部以题库与
 * selectedKeys 重推导，客户端数值仅作参考、不作输入。selectedKeys 非法
 * （非数组/未知键）的条目整条丢弃——validateSelectedKeys 会抛错。
 * 外部证据：id 必须是 conv- 或 prac- 前缀且 credit 有限；difficulty/dimKeys
 * 过白名单（对话/实操证据的维度来自评审输出，服务端无从反查）。
 */
export function rebuildEvidence(items, bankById) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const evidence = [];
  for (const item of items.slice(0, MAX_EVIDENCE)) {
    if (!item || typeof item !== "object" || typeof item.questionId !== "string") continue;
    if (seen.has(item.questionId)) continue; // scoreAssessment 对重复 id 抛错
    const question = bankById.get(item.questionId);
    if (question) {
      const selectedKeys = Array.isArray(item.selectedKeys)
        ? item.selectedKeys.filter((key) => typeof key === "string").slice(0, 8)
        : null;
      if (!selectedKeys) continue;
      try {
        evidence.push({
          questionId: question.id,
          type: question.type,
          difficulty: question.difficulty,
          dimKeys: [...question.dimKeys],
          selectedKeys,
          credit: calculateQuestionCredit(question, selectedKeys),
          answeredAt: typeof item.answeredAt === "string" ? item.answeredAt.slice(0, 40) : new Date().toISOString(),
        });
        seen.add(question.id);
      } catch {
        // selectedKeys 含未知选项键：证据无效，丢弃。
      }
      continue;
    }
    if (EXTERNAL_ID.test(item.questionId) && Number.isFinite(Number(item.credit))) {
      const dimKeys = Array.isArray(item.dimKeys)
        ? [...new Set(item.dimKeys.filter((key) => DIMENSION_KEY.test(key)))]
        : [];
      if (dimKeys.length === 0) continue;
      evidence.push({
        questionId: item.questionId,
        type: "single",
        difficulty: DIFFICULTIES.has(item.difficulty) ? item.difficulty : "medium",
        dimKeys,
        selectedKeys: [],
        credit: Math.max(0, Math.min(1, Number(item.credit))),
        answeredAt: typeof item.answeredAt === "string" ? item.answeredAt.slice(0, 40) : new Date().toISOString(),
        ...(typeof item.external === "string" && item.external ? { external: item.external.slice(0, 60) } : {}),
      });
      seen.add(item.questionId);
    }
  }
  return evidence;
}

/** interview 记录净化：只收有限数值与布尔，其余丢弃（对齐 comprehensive-weighting 的容错）。 */
export function normalizeInterview(raw) {
  if (!raw || typeof raw !== "object") return null;
  const dimensions = Array.isArray(raw.dimensions)
    ? raw.dimensions
      .filter((item) => item && typeof item.key === "string" && DIMENSION_KEY.test(item.key)
        && item.score !== null && item.score !== undefined && Number.isFinite(Number(item.score)))
      .map((item) => ({ key: item.key, score: Math.round(Math.max(0, Math.min(100, Number(item.score)))) }))
    : [];
  const asInt = (value, fallback) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(999, Math.floor(Number(value)))) : fallback);
  return {
    dimensions,
    overallScore: Number.isFinite(Number(raw.overallScore)) ? Math.round(Number(raw.overallScore)) : null,
    grade: typeof raw.grade === "string" && raw.grade.length <= 2 ? raw.grade : null,
    completed: raw.completed === true,
    answeredSlots: asInt(raw.answeredSlots, 0),
    totalSlots: asInt(raw.totalSlots, 5),
  };
}

/**
 * 计分（纯函数）：重建证据 → vendor 核心 → 三通道融合。
 * 与客户端 finalizeAttempt+snapshotAttempt 同口径：
 * totalQuestions = max(1, evidence.length)（时间制测评按实际证据数收口）。
 */
export function scoreComprehensiveAttempt(payload, bankById) {
  const evidence = rebuildEvidence(payload?.attempt?.evidence, bankById);
  const interview = normalizeInterview(payload?.attempt?.interview);
  const totalQuestions = Math.max(1, evidence.length);
  const attempt = {
    assessmentId: typeof payload?.attempt?.assessmentId === "string" ? payload.attempt.assessmentId.slice(0, 40) : "comprehensive",
    startedAt: typeof payload?.attempt?.startedAt === "string" ? payload.attempt.startedAt.slice(0, 40) : null,
    totalQuestions,
    evidence,
    ...(interview ? { interview } : {}),
  };
  const result = scoreAssessment(evidence, { totalQuestions });
  const composite = buildComposite(attempt);
  return { attempt, result, composite };
}

export async function handleComprehensiveScore(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object" || !payload.attempt) {
    return json({ error: "缺少 attempt" }, 400);
  }
  const edition = normalizeEdition(payload.edition ?? DEFAULT_EDITION);
  const state = getBankState(edition);
  const { attempt, result, composite } = scoreComprehensiveAttempt(payload, new Map(state.questions.map((q) => [q.id, q])));
  return json({
    attempt: { evidence: attempt.evidence, interview: attempt.interview ?? null, totalQuestions: attempt.totalQuestions },
    result,
    composite,
    bankVersion: state.bankVersion,
    edition,
    scoredAt: new Date().toISOString(),
    scoredBy: "server",
  });
}
