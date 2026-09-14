# Scoring model

## Version and dimensions

Scoring version is `1.0.0`. The ordered dimensions are `D1` AI基础认知, `D2` 提示词工程, `D3` AI工具使用, `D4` AI结果评估与优化, `D5` 人机协同解决问题, and `D6` AI伦理与合规. A response contributes independently to every unique `dimKeys` entry on its question.

## Question credit

For `single` and `judge` questions, the selected-key set must exactly equal the answer-key set to receive `credit = 1`; all other selections receive `0`.

For `multi` questions, let `E` be the answer-key set and `S` be the selected-key set:

```text
hitRate = |S ∩ E| / |E|
wrongSelectionRate = |S − E| / |S|, or 0 when S is empty
credit = clamp(hitRate - 0.6 × wrongSelectionRate, 0, 1)
```

An exact set match receives `1`. Selecting every option when at least one option is wrong receives `0`, preventing select-all guessing. Duplicate selected keys and duplicate dimension keys are normalized before scoring.

## Difficulty-adjusted dimension estimate

For each dimension, item difficulty anchors are exactly `low = -1`, `medium = 0`, and `high = +1`. With internal ability `θ`, difficulty `b`, and response credit `r`:

```text
p = sigmoid(θ - b)
sigmoid(x) = 1 / (1 + exp(-x))
```

The model uses the `N(0,1)` prior and maximizes this posterior objective:

```text
Σ [r × log(p) + (1 - r) × log(1 - p)] - θ² / 2
```

Equivalently, it solves the unique root:

```text
f(θ) = Σ [r - sigmoid(θ - b)] - θ = 0
```

Use fixed bisection over `[-8, 8]` for exactly 60 iterations. The reported dimension percentage is:

```text
dimensionScore = round(100 × sigmoid(θ))
```

No evidence for a dimension produces `null`; it must not be treated as zero. Estimation uses the complete evidence set and is order independent.

## Completion, overall score, and grade

`status` is `not_started` with no responses, `in_progress` until completion, and `completed` only when `answeredCount === totalQuestions` and every dimension has evidence. `overallScore` and `grade` are `null` while not completed.

On completion only:

```text
overallScore = round((D1 + D2 + D3 + D4 + D5 + D6) / 6)
```

The grade boundaries are S for 90–100, A for 80–89, B for 70–79, C for 60–69, and D for 0–59.
