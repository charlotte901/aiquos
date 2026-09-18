# Integration guide

## Browser integration

Import the pure core directly from `scripts/scoring-core.mjs`:

```js
import { createResponseEvidence, scoreAssessment } from "./scripts/scoring-core.mjs";

const evidence = createResponseEvidence(question, selectedKeys, answeredAt);
const result = scoreAssessment(allEvidence, { totalQuestions: 25 });
```

Validate the bank once before a session starts. On every answer submission, create evidence from the actual question and recompute from the complete answer collection. Do not persist a running `θ` value or implement a second scoring formula in UI code.

## Attempt lifecycle

An Attempt should retain its assessment type, start and completion times, total question count, ordered question IDs, normalized evidence, latest `scoreAssessment` result, and these immutable version fields:

```js
{
  scoringVersion: "1.0.0",
  questionBankVersion: "objective-bank-v6-120"
}
```

`scoringVersion` identifies the scoring model used for the result. `questionBankVersion` identifies the question, answer, difficulty, and dimension metadata used to create the evidence. A submitted first answer can become the current report immediately. While the result is `in_progress`, show dimension scores that have evidence and no overall score or letter grade.

When the response count exactly reaches `totalQuestions` and all six dimensions have evidence, the result becomes `completed`. Store the completed result, evidence, `scoringVersion`, and `questionBankVersion` as an immutable history snapshot; do not revise an earlier completed history item by later recomputation or by combining it with another assessment.

Any change to question text or records, answer keys, difficulty, or dimension tags requires an explicit `questionBankVersion` bump. Never infer a bank version from runtime content. Retain the recorded versions with historical evidence so the snapshot remains attributable to the model and bank that produced it.

Keep unfinished Attempts separately as resumable drafts. A draft is not history. A completed Attempt can be added to history exactly once, while the latest report may point to either a live Attempt or a completed snapshot.

## Node and batch integration

For saved JSON inputs, validate the bank first, then run `score-responses.mjs`. The CLI returns normalized evidence as well as the result, so downstream systems can persist the evidence needed to reproduce the score. Invalid input is reported to standard error and returns exit code `1`; do not parse partial standard output after a failure.
