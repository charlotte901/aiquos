import objectiveBank from "./objective-questions.json" with { type: "json" };

export const OBJECTIVE_QUESTIONS_PATH = "/api/objective-questions";

const QUESTION_COUNT = 5;

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

export function createObjectiveQuestions(levelId, origin = "all", rng = Math.random) {
  return objectiveBank.questions
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
  const questions = createObjectiveQuestions(levelId, origin);
  return new Response(JSON.stringify({ questions }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
