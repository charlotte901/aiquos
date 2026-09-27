import objectiveBank from "./objective-questions.json" with { type: "json" };
import { DEFAULT_EDITION, normalizeEdition } from "../src/bank-editions.js";

export const OBJECTIVE_QUESTIONS_PATH = "/api/objective-questions";

const QUESTION_COUNT = 5;

/**
 * 客观题池按版本切分。
 *
 * 全量版（A）用全部 1000 题（880 导入 + 120 精选）；精选版（B）只用那 120
 * 道人工精选题 —— 两套池子共享同一份文件，靠 origin 区分，不需要复制数据。
 */
function poolFor(edition) {
  const questions = objectiveBank.questions;
  return edition === "A" ? questions : questions.filter((question) => question.origin === "human");
}

function publicQuestion(question) {
  return {
    type: question.type,
    q: question.q,
    options: question.options,
    answer: question.answer,
    analysis: question.analysis,
    dims: question.dims,
  };
}

export function createObjectiveQuestions(levelId, origin = "all", rng = Math.random, editionInput) {
  const edition = normalizeEdition(editionInput ?? DEFAULT_EDITION);
  return poolFor(edition)
    .filter((question) => question.levelId === levelId && (origin === "all" || question.origin === origin))
    .map((question) => ({ question, order: rng() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, QUESTION_COUNT)
    .map((item) => publicQuestion(item.question));
}

export async function handleObjectiveQuestions(request) {
  const url = new URL(request.url);
  const levelId = url.searchParams.get("levelId") || "academy";
  const origin = url.searchParams.get("origin") || "all";
  const edition = normalizeEdition(url.searchParams.get("edition") ?? DEFAULT_EDITION);
  const questions = createObjectiveQuestions(levelId, origin, Math.random, edition);
  return new Response(JSON.stringify({ questions, edition }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
