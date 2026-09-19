---
name: aiquos-assessment-steward
description: Maintain and extend the AIQUOS comprehensive assessment (题库、自适应出题、六维评分、觉醒报告、测评记录). Use whenever editing comprehensive-questions.json, comprehensive-adaptive.js, assessment-attempt.js, the AwakeningReport, ProfileDetail records, or anything that touches aiquos.comprehensive-* localStorage keys — and for any request mentioning 题库/自适应/评分/测评/觉醒报告/六维.
---

# AIQUOS assessment steward

You are changing a verified assessment pipeline. The non-negotiables first,
then the workflows.

## Invariants (breaking these is a regression, however good it looks)

1. **The scoring core is frozen.** `vendor/aiquos-six-dimension-scoring/` is
   the canonical engine (scoring version `1.0.0`) imported as pure ESM.
   Never edit it, never copy its formulas into app code; import
   `scoring-core.mjs` exports instead. The only legal change is upgrading the
   whole vendored folder to a newer official package version, with its own
   tests run green.
2. **A run is 25 questions**: 5 stages × 5, `totalQuestions = 25`. A result is
   `completed` only when answeredCount is exactly 25 AND all six dimensions
   (D1–D6) have evidence. Overall score and grade exist only when completed.
3. **Question bank changes require a version bump.** The bank records
   `objective-bank-v6-120` on every attempt and snapshot (see
   `QUESTION_BANK_VERSION` in `src/assessment-attempt.js`). Any edit to
   question text, answers, difficulty, or dimKeys must bump it (e.g. to
   `objective-bank-v7-<count>`); old drafts/history with a different version
   are ignored on read by design — that is the migration strategy.
4. **The vendored package's Attempt contract holds** (its
   `references/integration-guide.md`): evidence is re-created from the served
   question on every submission, scores always recompute from the complete
   answer set, completed attempts snapshot to immutable history exactly once,
   unfinished attempts stay resumable drafts.
5. **Preserve the product flow**: per-stage opening/ending dialogues, instant
   per-question feedback (correctness + answer + analysis + guardian
   reaction), the stage map, and the completion routing to `#reports`.
6. **Panels stay mounted while hidden.** `AwakeningReport` and
   `ProfileDetail` re-read history when they become `active`; do not move
   those reads back to mount-time initializers or fresh runs go stale again.

## Editing the question bank

1. Edit `src/comprehensive-questions.json`. Every question needs unique `id`,
   `type` in single/multi/judge, `difficulty` in low/medium/high, `options`
   with unique keys, non-empty `answer` ⊆ option keys, `dimKeys` ⊆ D1–D6,
   plus `q`, `analysis`, `dims`, `levelId` in the five level ids.
2. Keep the balance the tests pin: equal counts per difficulty, per level ×
   difficulty, every level covers all six dimensions (a 25-answer run must be
   able to complete — this is a hard `completed` requirement, not cosmetic).
3. Bump `QUESTION_BANK_VERSION` in `src/assessment-attempt.js`.
4. Validate and test:
   ```sh
   node vendor/aiquos-six-dimension-scoring/scripts/validate-question-bank.mjs src/comprehensive-questions.json
   node --test tests/comprehensive-adaptive.test.mjs tests/scoring-integration.test.mjs
   ```

## Adaptive routing (backend-authoritative)

Selection is served by `POST /api/comprehensive-question` (worker module
`worker/comprehensive-quiz.js`). The worker imports the PURE engine
(`src/comprehensive-adaptive.js`) and the bank (`src/comprehensive-questions.json`)
directly — one algorithm, one bank, shared with the test suite; never fork
either into a worker-local copy. The client threads an opaque server `session`
between requests (plus the answered question's outcome and the persisted
exposure counters) and persists it in the attempt draft's `routing` field so
reloads resume without re-serving used questions.

v2 behavior (unchanged, now executed server-side): with no credited evidence
selection is exactly the original ordering (difficulty distance →
under-covered dimensions → type change → order). Once credits flow, a
1-parameter logistic ability estimate blends with the position walk
(`nextTargetDifficulty`), dimension information weights favor the
least-measured dimensions, a hard guard prevents three same-type questions in
a row (falls back only if a level offers no alternative), and exposure
counters (`aiquos.adaptive-exposure.v1`) demote over-served questions across
runs. The hidden state still only chooses questions; it never renders a score.

## Admin console (`/admin.html`, `src/admin/`)

Bank edits are real and always publish: `PUT /api/admin/bank` validates with the
vendored validator and bumps the version (no no-bump save exists — do not add
one; the bump IS the version contract). Serving reads through
`worker/bank-store.js`; the vite middleware persists overrides to gitignored
`worker/bank-overrides.json`. The student app follows publishes via the
`bankVersion` in serving responses (cached at `aiquos.bank-version.v1`);
drafts validate against that cached version, history keeps old versions
visible. The roster merges a deterministic demo cohort with the machine's real
runs (`src/admin/cohort.js`) — replace that module's loaders with API calls
when a real backend lands.

## QA gates before calling an assessment change done

```sh
node --test tests/*.test.mjs vendor/aiquos-six-dimension-scoring/tests/*.test.mjs
npx vite build
curl -s -X POST http://127.0.0.1:4286/api/comprehensive-question \
  -H "content-type: application/json" -d '{"levelId":"academy","stage":1}'
```

Then one browser pass of the full flow (dev server on 127.0.0.1:4286):
#assessments → 综合测评 → all five stages → confirm auto-arrival at #reports
with real data (meta line starts 综合测评 · 完成于, not 本地演示数据), then
#center/records shows the run and its 觉醒报告 modal. Clear
`aiquos.comprehensive-attempt.v1` (draft) afterwards if you abandoned a run
mid-way. Screenshots for review go under `work/`.
