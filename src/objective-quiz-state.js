import { calculateQuestionCredit } from "../skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

export const OBJECTIVE_QUESTIONS_PER_STAGE = 5;

export function mapObjectiveStageQuestions(questions, attempt, stage) {
  if (!Array.isArray(questions) || attempt?.assessmentType !== "objective") return [];
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const offset = (stage - 1) * OBJECTIVE_QUESTIONS_PER_STAGE;
  const stageIds = attempt.questionIds?.slice(offset, offset + OBJECTIVE_QUESTIONS_PER_STAGE) ?? [];
  if (stageIds.length !== OBJECTIVE_QUESTIONS_PER_STAGE) return [];
  const mapped = stageIds.map((id) => questionsById.get(id));
  return mapped.every(Boolean) ? mapped : [];
}

export function objectiveFeedback(question, selectedKeys) {
  const credit = calculateQuestionCredit(question, selectedKeys);
  return {
    credit,
    correct: credit === 1,
    partialCorrect: credit > 0 && credit < 1,
    answerText: question.answer
      .map((key) => {
        const option = question.options.find((item) => item.key === key);
        return `${key}.${option?.text ?? ""}`;
      })
      .join("; "),
  };
}

export function deriveObjectiveQuestionState(attempt, stage, stageQuestions, requestedIndex) {
  const matchesStage = attempt?.assessmentType === "objective" && attempt.currentStage === stage;
  const savedIndex = matchesStage
    && Number.isInteger(attempt.currentQuestionIndex)
    && attempt.currentQuestionIndex >= 0
    && attempt.currentQuestionIndex < OBJECTIVE_QUESTIONS_PER_STAGE
    ? attempt.currentQuestionIndex
    : 0;
  const questionIndex = Number.isInteger(requestedIndex) ? requestedIndex : savedIndex;
  const question = stageQuestions[questionIndex];
  const savedResponse = question
    ? attempt?.responses?.find((response) => response.questionId === question.id)
    : null;
  const usesCurrentLocation = matchesStage && questionIndex === savedIndex;
  const locationKeys = usesCurrentLocation && Array.isArray(attempt.location?.selectedKeys)
    ? attempt.location.selectedKeys
    : [];
  const selectedKeys = savedResponse
    ? [...savedResponse.selectedKeys]
    : [...locationKeys];
  const submitted = Boolean(savedResponse) || Boolean(usesCurrentLocation && attempt.location?.feedback);

  return {
    questionIndex,
    selectedKeys,
    feedback: submitted && question ? objectiveFeedback(question, selectedKeys) : null,
    submitted,
  };
}

export function advanceObjectiveQuestionState(attempt, stage, stageQuestions, currentState) {
  return deriveObjectiveQuestionState(
    attempt,
    stage,
    stageQuestions,
    currentState.questionIndex + 1,
  );
}
