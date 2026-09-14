import { readFile } from "node:fs/promises";
import { SCORING_VERSION, validateQuestion, validateQuestionBank } from "./scoring-core.mjs";

function requireOnePath(argumentsList) {
  if (argumentsList.length !== 1) throw new Error("usage: node validate-question-bank.mjs <question-bank.json>");
  return argumentsList[0];
}

function extractQuestions(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.questions)) return input.questions;
  throw new Error("input must be a question array or an object with a questions array");
}

function collectQuestionErrors(questions) {
  const ids = new Set();
  const errors = [];
  for (const [index, question] of questions.entries()) {
    const label = typeof question?.id === "string" && question.id ? question.id : `<index ${index}>`;
    try {
      validateQuestion(question);
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
    if (ids.has(question?.id)) errors.push(`${label}: duplicate question id`);
    ids.add(question?.id);
  }
  return errors;
}

async function main() {
  const inputPath = requireOnePath(process.argv.slice(2));
  const questions = extractQuestions(JSON.parse(await readFile(inputPath, "utf8")));
  const errors = collectQuestionErrors(questions);
  if (errors.length > 0) throw new Error(errors.join("; "));
  validateQuestionBank(questions);
  process.stdout.write(`${JSON.stringify({ valid: true, questionCount: questions.length, scoringVersion: SCORING_VERSION }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`validate-question-bank: ${error.message}\n`);
  process.exitCode = 1;
});
