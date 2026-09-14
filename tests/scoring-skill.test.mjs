import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createResponseEvidence, scoreAssessment } from "../skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_ROOT = path.join(ROOT, "skills", "aiquos-six-dimension-scoring");
const CLI_PATH = path.join(SKILL_ROOT, "scripts", "score-responses.mjs");
const VALIDATOR_PATH = path.join(SKILL_ROOT, "scripts", "validate-question-bank.mjs");
const EXAMPLE_PATH = path.join(SKILL_ROOT, "examples", "objective-responses.json");
const BANK_PATH = path.join(ROOT, "src", "comprehensive-questions.json");
const REQUIRED_SKILL_FILES = [
  "skills/aiquos-six-dimension-scoring/SKILL.md",
  "skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs",
  "skills/aiquos-six-dimension-scoring/scripts/score-responses.mjs",
  "skills/aiquos-six-dimension-scoring/scripts/validate-question-bank.mjs",
  "skills/aiquos-six-dimension-scoring/references/scoring-model.md",
  "skills/aiquos-six-dimension-scoring/references/input-output-schema.md",
  "skills/aiquos-six-dimension-scoring/references/integration-guide.md",
  "skills/aiquos-six-dimension-scoring/examples/comprehensive-responses.json",
  "skills/aiquos-six-dimension-scoring/examples/objective-responses.json",
];

test("the scoring Skill CLI preserves the canonical core result", async () => {
  for (const file of REQUIRED_SKILL_FILES) await access(new URL(`../${file}`, import.meta.url));

  const skill = await readFile(new URL("../skills/aiquos-six-dimension-scoring/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /^---\nname: aiquos-six-dimension-scoring\n/m);

  const source = JSON.parse(await readFile(EXAMPLE_PATH, "utf8"));
  const result = spawnSync(process.execPath, [CLI_PATH, EXAMPLE_PATH], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const evidence = source.responses.map(({ question, selectedKeys, answeredAt }) =>
    createResponseEvidence(question, selectedKeys, answeredAt),
  );
  assert.deepEqual(output, { evidence, result: scoreAssessment(evidence, { totalQuestions: source.totalQuestions }) });
  assert.equal(output.result.scoringVersion, "1.0.0");
  assert.equal(output.result.totalQuestions, 25);
  assert.equal(output.result.status, "completed");

  const validation = spawnSync(process.execPath, [VALIDATOR_PATH, BANK_PATH], { encoding: "utf8" });
  assert.equal(validation.status, 0, validation.stderr);
  assert.deepEqual(JSON.parse(validation.stdout), { valid: true, questionCount: 120, scoringVersion: "1.0.0" });
});
