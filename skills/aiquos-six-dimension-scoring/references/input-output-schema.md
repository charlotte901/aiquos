# Input and output schema

## Question-bank input

The bank validator accepts either an array of question records or an object with a `questions` array. Every question requires:

```json
{
  "id": "unique-string",
  "type": "single",
  "difficulty": "low",
  "options": [{ "key": "A", "text": "Option text" }],
  "answer": ["A"],
  "dimKeys": ["D1", "D3"]
}
```

`type` is `single`, `multi`, or `judge`; `difficulty` is `low`, `medium`, or `high`; and every answer key must occur exactly once in `options`. A bank must have unique question IDs and each `dimKeys` value must be one of `D1` through `D6`.

Run:

```text
node scripts/validate-question-bank.mjs question-bank.json
```

Valid output is:

```json
{ "valid": true, "questionCount": 120, "scoringVersion": "1.0.0" }
```

## Response-file input

`score-responses.mjs` accepts one UTF-8 JSON object:

```json
{
  "totalQuestions": 25,
  "responses": [
    {
      "question": { "id": "q001", "type": "single", "difficulty": "low", "options": [{ "key": "A" }], "answer": ["A"], "dimKeys": ["D1"] },
      "selectedKeys": ["A"],
      "answeredAt": "2026-09-14T00:00:00.000Z"
    }
  ]
}
```

`totalQuestions` is a non-negative integer. Each response retains the full validated question record, selected option keys, and an optional answer timestamp. Question IDs must be unique within a scored response set.

Run:

```text
node scripts/score-responses.mjs responses.json
```

## CLI output

The scoring CLI writes formatted JSON with normalized evidence and the canonical result:

```json
{
  "evidence": [
    {
      "questionId": "q001",
      "type": "single",
      "difficulty": "low",
      "dimKeys": ["D1"],
      "selectedKeys": ["A"],
      "credit": 1,
      "answeredAt": "2026-09-14T00:00:00.000Z"
    }
  ],
  "result": {
    "scoringVersion": "1.0.0",
    "status": "in_progress",
    "answeredCount": 1,
    "totalQuestions": 25,
    "dimensions": [
      { "key": "D1", "name": "AI基础认知", "short": "认知", "score": 56, "evidenceCount": 1 },
      { "key": "D2", "name": "提示词工程", "short": "提示", "score": null, "evidenceCount": 0 },
      { "key": "D3", "name": "AI工具使用", "short": "工具", "score": 56, "evidenceCount": 1 },
      { "key": "D4", "name": "AI结果评估与优化", "short": "评估", "score": null, "evidenceCount": 0 },
      { "key": "D5", "name": "人机协同解决问题", "short": "协同", "score": null, "evidenceCount": 0 },
      { "key": "D6", "name": "AI伦理与合规", "short": "伦理", "score": null, "evidenceCount": 0 }
    ],
    "overallScore": null,
    "grade": null
  }
}
```

The actual `dimensions` value is always an ordered six-item array. Each item is `{ key, name, short, score, evidenceCount }`; `score` is an integer or `null` when no relevant answer exists.
