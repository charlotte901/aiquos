import { readFile } from "node:fs/promises";
import { createResponseEvidence, scoreAssessment } from "./scoring-core.mjs";

function requireOnePath(argumentsList) {
  if (argumentsList.length !== 1) throw new Error("usage: node score-responses.mjs <responses.json>");
  return argumentsList[0];
}

function normalizeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("input must be an object with totalQuestions and responses");
  }
  if (!Array.isArray(input.responses)) throw new Error("responses must be an array");
  return input;
}

async function main() {
  const inputPath = requireOnePath(process.argv.slice(2));
  const input = normalizeInput(JSON.parse(await readFile(inputPath, "utf8")));
  const evidence = input.responses.map((response, index) => {
    if (!response || typeof response !== "object") throw new Error(`response ${index + 1} must be an object`);
    return createResponseEvidence(response.question, response.selectedKeys, response.answeredAt);
  });
  const result = scoreAssessment(evidence, { totalQuestions: input.totalQuestions });
  process.stdout.write(`${JSON.stringify({ evidence, result }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`score-responses: ${error.message}\n`);
  process.exitCode = 1;
});
