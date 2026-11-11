// 测试专用的客观题版本切分校验器。
//
// 历史背景：这里原有一个 /api/objective-questions 端点与一份
// worker/objective-questions.json（1000 题 = 880 导入 + 120 精选的并集，
// 只比两个综合题库多一个 origin 字段）。2026-11 题库归一后该文件退役：
// 两个综合题库（src/comprehensive-questions.json 精选、
// src/banks/comprehensive-880.json 全量）是唯一事实来源，origin 由
// 「来自哪个题库」隐式表达。这个校验器随之从 worker 迁到测试助手。
import liteBank from "../../src/comprehensive-questions.json" with { type: "json" };
import fullBank from "../../src/banks/comprehensive-880.json" with { type: "json" };

const QUESTION_COUNT = 5;

/** 精选题（原 origin:"human"）与导入题（原 origin:"ai"）。 */
export const HUMAN_POOL = liteBank.questions;
export const AI_POOL = fullBank.questions;

/**
 * 客观题池按版本切分：全量版（A）= 导入 880 + 精选 120；
 * 精选版（B）= 只有人工精选的 120 题。
 */
export function createObjectiveQuestions(levelId, origin = "all", rng = Math.random, editionInput) {
  const edition = editionInput === "A" ? "A" : "B";
  const pool = edition === "A"
    ? [...HUMAN_POOL, ...AI_POOL]
    : HUMAN_POOL;
  return pool
    .filter((question) => question.levelId === levelId
      && (origin === "all"
        || (origin === "human" ? HUMAN_POOL.includes(question) : AI_POOL.includes(question))))
    .map((question) => ({ question, order: rng() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, QUESTION_COUNT)
    .map((item) => ({
      type: item.question.type,
      q: item.question.q,
      options: item.question.options,
      answer: item.question.answer,
      analysis: item.question.analysis,
      dims: item.question.dims,
    }));
}
