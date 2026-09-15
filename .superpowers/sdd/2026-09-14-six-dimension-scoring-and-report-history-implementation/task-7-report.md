# Task 7 Report — Orchestrate Starts, Resume, Live Saves, Completion, and Restart

## Status

Complete. Task 7 now initializes durable scored-assessment state once, restores compatible comprehensive and objective sessions exactly, blocks incompatible drafts until an explicit confirmed restart, saves selection/progress/answers with the required separation, finalizes only the fifth stage after all 25 responses, and leaves conversation/practical progression on the existing non-scored path.

Base/HEAD received: `e74a510` (`fix: restore answered objective stage questions`).

## Inherited-state assessment

The task was resumed from an interrupted implementation rather than restarted. The inherited working tree contained:

- modified `src/assessment-attempt.js`;
- untracked `src/assessment-orchestration.js`;
- modified `tests/assessment-attempt.test.mjs`;
- modified `tests/assessment-flow.test.mjs`;
- no Task 7 report;
- no Task 7 changes yet in `SiteExperience`, `AssessmentFlow`, or `AssessmentHub`.

The inherited work was preserved and inspected before editing. It already provided:

- deep freezing for completed history carried through draft writes, completion, restart, and load;
- a pure orchestration layer around the public Attempt, storage, adaptive-controller, paper, question-bank, and quiz-state APIs;
- deterministic objective-paper restoration from saved seed plus exact question-ID verification;
- comprehensive-controller restoration from the saved adaptive snapshot plus exact used-question-ID verification;
- compatibility blocks which retain stale drafts unchanged;
- selected-comprehensive-question persistence before answering;
- canonical answer sequencing, duplicate-answer suppression, stage completion, and restart/history behavior;
- reducer/orchestration tests for these behaviors.

I did not discard or revert any inherited scoped work. I corrected and completed it through the existing TDD boundary.

## RED / GREEN record

### Inherited RED

Command:

```powershell
node --test tests/assessment-attempt.test.mjs tests/assessment-flow.test.mjs
```

Observed result before production UI wiring:

```text
tests 39
pass 38
fail 1
duration_ms 199.6568
```

The sole failure was:

```text
SiteExperience keeps unscored conversation and practical progress and wires durable callbacks
```

It failed because `SiteExperience` still owned only an ephemeral progress object and reset the old comprehensive controller. No durable scored callbacks, bank/attempt props, or storage-warning state were wired yet. This was the expected feature-missing RED, not a syntax or fixture error.

### Extended RED: answer callback and restart confirmation contract

Before changing production components, the component contract was extended to require:

- comprehensive answer feedback in the answer callback;
- answer/progress callbacks and the current Attempt in `SiteExperience`;
- the real shared `QUESTION_BANK` prop for objective tasks;
- an explicit restart control and confirmation UI;
- an incompatibility reason and confirmed restart action.

The focused run failed on the still-unwired `SiteExperience` contract and the missing restart UI. After implementing those surfaces, the focused result was:

```text
tests 40
pass 40
fail 0
duration_ms 337.2781
```

### Extended RED: stale URL resume

Command:

```powershell
node --test tests/assessment-flow.test.mjs --test-name-pattern "scored drafts can restart"
```

Observed RED:

```text
tests 17
pass 16
fail 1
duration_ms 213.2044
```

The restart test failed because the shared `BlockedDraftPanel` and initial-route compatibility guard did not yet exist. This caught the case where a stale saved assessment URL could otherwise mount the incompatible task without first returning through the assessment card.

After extracting `BlockedDraftPanel`, initializing the block from the restored route/session, checking browser navigation, and gating the flow render, the same test file was GREEN:

```text
tests 17
pass 17
fail 0
duration_ms 224.0565
```

### Extended RED: completed draft route

Command:

```powershell
node --test tests/assessment-flow.test.mjs
```

Observed RED:

```text
tests 17
pass 16
fail 1
duration_ms 207.0739
```

The new completion-route assertion failed because stage five still returned to a map whose scored draft had just been cleared. The correction sends a completed scored assessment to the assessment chooser and prevents a scored stage from opening when no live draft exists.

The same command then passed:

```text
tests 17
pass 17
fail 0
duration_ms 211.478
```

## Implementation

### State ownership and persistence

`SiteExperience` now:

- calls `loadScoredAssessments(localStorage)` through a lazy React state initializer so persisted state is loaded once for the component instance;
- owns `assessmentState` and `storageWarning` in React state;
- keeps a synchronized state ref for event callbacks and always publishes the next in-memory state before storage I/O;
- owns restored/current comprehensive-controller and objective-paper sessions in a ref;
- leaves the old `progress` state exclusively for `conversation` and `practical`;
- renders any storage recovery/save warning without discarding the in-memory transition.

### Start and exact resume

For `comprehensive` and `objective`, `startAssessment(type)` now delegates to the orchestration layer.

- A compatible draft is resumed without replacing its Attempt.
- Comprehensive resumes from its saved adaptive snapshot only when the snapshot is valid and its used-question order exactly matches the Attempt question order.
- Objective regenerates from its saved seed and resumes only when all regenerated IDs exactly match the stored paper IDs.
- A completed assessment has no draft, so its next card start creates a fresh Attempt/controller or paper while retaining completed history.
- Leaving a scored assessment no longer resets the controller.

### Compatibility block and restart confirmation

Incompatible drafts remain in assessment state and storage. They are never silently replaced.

- Clicking a card for an incompatible draft displays its compatibility reason and a confirmation panel instead of entering the assessment.
- A stale direct assessment URL is checked at construction and browser navigation; the incompatible task is not mounted.
- Compatible comprehensive/objective maps show `重新开始本次测评` only while a resumable draft exists.
- The first click opens an in-app panel naming the assessment and warning that unfinished answers will be removed.
- Cancel performs no state/storage mutation.
- Only the panel's explicit `确认重新开始` action invokes `restartAssessment(type)`.
- Confirmed restart clears only the requested draft, preserves history and the other assessment type, creates the requested fresh controller/paper, and persists the combined replacement once.

### Comprehensive selection and answer sequencing

Question selection now performs this sequence synchronously before returning the question to the component:

1. select through the owned adaptive controller;
2. append the selected canonical question ID to the Attempt;
3. snapshot the adaptive controller;
4. put the updated draft into assessment state;
5. publish state and save it.

The comprehensive answer path performs:

1. canonical answer judgment independent of the component-provided `adaptiveOutcome`;
2. adaptive controller `record`;
3. adaptive snapshot;
4. exactly one `recordAttemptResponse` call using the canonical bank question;
5. canonical feedback/location update;
6. `putDraft` and one `saveAssessmentState` call from `SiteExperience`.

If answer validation or response recording throws after the controller snapshot, the controller is restored to the pre-answer snapshot. A repeated answer returns the identical state before adaptive mutation and is not saved again.

`ComprehensiveTask` now includes its resulting feedback/reaction in `onComprehensiveAnswer`. When that callback exists, it does not emit the answer again through the progress callback. The legacy `onRecordComprehensiveOutcome` plus progress branch remains only as the mutually exclusive compatibility fallback.

### Non-answer progress

Independent story-line movement, option selection, question-index movement, and stage movement use `updateAttemptLocation` through `updateScoredProgress`. These updates do not create response evidence. No-op progress payloads return the identical state and therefore do not trigger a storage write in `SiteExperience`.

Objective receives the live Attempt and canonical shared question bank. Its fixed paper order continues to come only from the Attempt; it does not regenerate inside the task component.

### Completion and latest-report ownership

- Stages one through four require all five stage questions, move the cursor to the next stage, clear transient feedback, persist, and return to the map.
- Stage five passes through `finalizeDraft`, which independently requires exactly 25 responses and complete six-dimension evidence.
- Finalization stores a deeply frozen immutable history snapshot, clears only the matching draft, and points `latestReportRef` to that history ID.
- The completed flow returns to the assessment chooser, avoiding a task route backed by a cleared draft.
- A new draft does not claim latest-report ownership until its zero-to-one response transition.
- Later answers in an older in-progress draft cannot steal latest-report ownership.
- Restart preserves completed comprehensive/objective history.

## Files changed

- `src/assessment-attempt.js`
  - deep-freezes immutable completed history across draft writes, finalization, restart, and loaded state.
- `src/assessment-orchestration.js`
  - new small pure orchestration layer for load/restore/start/select/answer/progress/stage completion and persistence publication.
- `src/SiteExperience.jsx`
  - owns durable scored state, warnings, controllers/papers, start/resume/restart/answer/progress/completion callbacks, compatibility gates, and real task props.
- `src/AssessmentFlow.jsx`
  - adds compatible-draft restart confirmation and makes comprehensive answer feedback part of the single answer callback path.
- `src/AssessmentHub.jsx`
  - adds the reusable incompatible-draft confirmation panel.
- `src/assessment-flow.css`
  - styles the resumable-draft restart control and confirmation panel.
- `src/assessment.css`
  - styles incompatible-draft and storage-warning surfaces.
- `tests/assessment-attempt.test.mjs`
  - adds public-helper fixtures and history/latest/restart/deep-freeze coverage.
- `tests/assessment-flow.test.mjs`
  - adds orchestration behavior, one-write answer sequencing, compatibility, exact resume, persistence failure, completion, restart, and component-wiring coverage.
- `.superpowers/sdd/2026-09-14-six-dimension-scoring-and-report-history-implementation/task-7-report.md`
  - this report.

No report/history layout was implemented. Task 8 remains responsible for presenting resolved reports and history.

## Final verification

### Focused Task 7 and dependency suite

Command:

```powershell
node --test tests/assessment-attempt.test.mjs tests/assessment-flow.test.mjs tests/comprehensive-adaptive.test.mjs tests/objective-paper.test.mjs
```

Exact summary:

```text
tests 56
suites 0
pass 56
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 350.0613
```

### Full regression suite

Command:

```powershell
node --test
```

Exact summary:

```text
tests 129
suites 0
pass 129
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 6006.5512
```

### Production build

Command:

```powershell
npm exec -- vite build
```

Exact relevant output:

```text
vite v6.4.2 building for production...
✓ 4632 modules transformed.
✓ built in 9.74s
```

The build exited 0. Vite emitted its existing advisory that some generated chunks exceed 500 kB; there were no compile, import, or output errors.

### Diff hygiene

Command:

```powershell
git diff --check
```

Result: exit code 0 with no whitespace errors. Git printed only LF-to-CRLF conversion notices for edited tracked files on this Windows checkout.

## Self-review

- Confirmed the implementation uses the public scoring, Attempt, storage, objective-paper, question-bank, adaptive-controller, and component interfaces; scoring or paper-generation logic was not duplicated in `SiteExperience`.
- Confirmed load is in a lazy initializer, storage recovery warnings are retained in React state, and every persistence path publishes in-memory state before attempting the storage write.
- Confirmed both saved drafts are checked, objective resume compares every regenerated ID, and comprehensive resume compares the complete controller used-ID order.
- Confirmed stale drafts are retained and neither card start nor direct URL navigation can replace or mount them without explicit confirmation.
- Confirmed there is no controller reset on ordinary start/resume, task-to-map navigation, or leaving the map.
- Confirmed comprehensive selection stores the canonical selected question and controller snapshot before returning the question to the UI.
- Confirmed comprehensive answer routing derives the adaptive outcome independently, records once, snapshots once, records response evidence once, updates canonical feedback/location, and performs one Site-level save.
- Confirmed duplicate submissions return before controller mutation and do not save.
- Confirmed objective answer and progress callbacks use the same parent state/persistence path and the objective task receives `QUESTION_BANK` plus the live Attempt.
- Confirmed story/selection progress has no response-evidence side effect.
- Confirmed only stage five can finalize and `finalizeDraft` still enforces 25 responses with evidence for all six dimensions.
- Confirmed conversation and practical progression remains in the pre-existing in-memory `progress` object and their task components were otherwise unchanged.
- Confirmed restart is reachable only from explicit confirm buttons, is scoped by assessment type, preserves history/other draft state, and starts a fresh controller or paper.
- Confirmed latest-report ownership changes only on a draft's zero-to-one transition or completion.
- Confirmed no Task 8 report/history presentation work and no unrelated feature changes were introduced.

## Concerns / handoff notes

- Vite continues to report the pre-existing generated-chunk-size advisory for chunks above 500 kB. It does not fail the build and is unrelated to Task 7.
- The project does not currently include a mounted React/browser interaction harness. Durable lifecycle behavior is exercised through real pure orchestration and public domain APIs, while component wiring/confirmation markup is covered by the repository's existing source-contract test style. A later browser QA pass can additionally exercise refresh during selection/feedback and keyboard focus inside the confirmation dialogs.
- The completed assessment intentionally returns to the assessment chooser because Task 8 has not yet wired the report/history destination. The immutable completed record and `latestReportRef` are ready for that task.
