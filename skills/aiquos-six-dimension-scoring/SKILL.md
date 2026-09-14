---
name: aiquos-six-dimension-scoring
description: Score a six-dimension AI assessment from validated question records and submitted answers, in browser code or JSON files.
---

# AIQUOS six-dimension scoring

Use this Skill when an assessment needs deterministic, difficulty-adjusted scores for the six defined dimensions. The canonical implementation is `scripts/scoring-core.mjs`; do not copy its formulas into an application.

## Workflow

1. Validate the question bank before scoring it with `node scripts/validate-question-bank.mjs <question-bank.json>`.
2. In browser code, import the pure ESM exports from `scripts/scoring-core.mjs`. It has no Node or filesystem dependency.
3. For a JSON response file, run `node scripts/score-responses.mjs <responses.json>`. The CLI normalizes each submitted answer into response evidence and prints the evidence and score result.
4. Before changing difficulty anchors, the `N(0,1)` prior, multiple-choice partial credit, or the percentage mapping, read [references/scoring-model.md](references/scoring-model.md).
5. Before connecting a new assessment, read [references/input-output-schema.md](references/input-output-schema.md).
6. For live Attempt results, completion, and immutable history behavior, read [references/integration-guide.md](references/integration-guide.md).

## Stable contract

This package implements scoring version `1.0.0` for `D1` through `D6`. A result is `completed` only when the response count exactly equals `totalQuestions` and every one of the six dimensions has evidence. In-progress results expose only live dimension estimates; they do not have an overall score or grade.

Keep question records and selected keys available while responses are normalized. The score result is deterministic from that evidence, independent of response order.
