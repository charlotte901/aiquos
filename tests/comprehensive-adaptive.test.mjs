import test from "node:test";
import assert from "node:assert/strict";
import questionBank from "../src/comprehensive-questions.json" with { type: "json" };
import {
  applyAdaptiveOutcome,
  clearExposureStore,
  createAdaptiveSession,
  estimateRunAbility,
  loadExposureStore,
  nextTargetDifficulty,
  saveExposureStore,
  selectAdaptiveQuestion,
  startAdaptiveStage,
} from "../src/comprehensive-adaptive.js";

const DIFFICULTIES = ["low", "medium", "high"];
const LEVELS = ["academy", "labyrinth", "workshop", "station", "court"];

test("the comprehensive bank has explicit balanced difficulty metadata", () => {
  assert.equal(questionBank.questions.length, 120);
  assert.equal(new Set(questionBank.questions.map((question) => question.id)).size, 120);

  for (const question of questionBank.questions) {
    assert.ok(DIFFICULTIES.includes(question.difficulty), `${question.id} has a valid difficulty`);
    assert.ok(["single", "judge", "multi"].includes(question.type), `${question.id} has a valid type`);
    assert.equal(question.dimKeys.length, 2, `${question.id} has two dimensions`);
    assert.ok(question.dimKeys.every((key) => /^D[1-6]$/.test(key)), `${question.id} has valid dimensions`);
  }

  for (const difficulty of DIFFICULTIES) {
    assert.equal(
      questionBank.questions.filter((question) => question.difficulty === difficulty).length,
      40,
    );
  }

  for (const levelId of LEVELS) {
    for (const difficulty of DIFFICULTIES) {
      assert.equal(
        questionBank.questions.filter(
          (question) => question.levelId === levelId && question.difficulty === difficulty,
        ).length,
        8,
      );
    }
  }
});

test("adaptive routing starts in the middle and applies bounded evidence", () => {
  const initial = createAdaptiveSession();
  assert.equal(initial.position, 1);
  assert.equal(applyAdaptiveOutcome(initial, "correct").position, 1.4);
  assert.equal(applyAdaptiveOutcome(initial, "partial").position, 1);
  assert.equal(applyAdaptiveOutcome(initial, "wrong").position, 0.6);

  let high = initial;
  let low = initial;
  for (let index = 0; index < 10; index += 1) {
    high = applyAdaptiveOutcome(high, "correct");
    low = applyAdaptiveOutcome(low, "wrong");
  }
  assert.equal(high.position, 2);
  assert.equal(low.position, 0);
});

test("a new stage partially regresses once toward medium", () => {
  const high = { ...createAdaptiveSession(), position: 2 };
  const stageOne = startAdaptiveStage(high, 1);
  const stageTwo = startAdaptiveStage(stageOne, 2);
  assert.equal(stageOne.position, 2);
  assert.equal(stageTwo.position, 1.65);
  assert.deepEqual(startAdaptiveStage(stageTwo, 2), stageTwo);
});

function candidate(id, difficulty, dimKeys, type = "single", levelId = "academy") {
  return { id, difficulty, dimKeys, type, levelId };
}

test("selection favors difficulty before under-covered dimensions and type variety", () => {
  const session = {
    ...createAdaptiveSession(),
    position: 1.8,
    dimensionCounts: { D1: 4, D2: 4, D3: 0, D4: 0, D5: 2, D6: 2 },
    lastType: "single",
  };
  const questions = [
    candidate("medium-gap", "medium", ["D3", "D4"], "judge"),
    candidate("high-covered", "high", ["D1", "D2"], "single"),
    candidate("high-gap", "high", ["D3", "D4"], "single"),
    candidate("high-gap-varied", "high", ["D3", "D4"], "judge"),
  ];

  const result = selectAdaptiveQuestion({ questions, levelId: "academy", session, rng: () => 0 });

  assert.equal(result.question.id, "high-gap-varied");
  assert.deepEqual(result.session.usedQuestionIds, ["high-gap-varied"]);
  assert.equal(result.session.dimensionCounts.D3, 1);
  assert.equal(result.session.dimensionCounts.D4, 1);
  assert.equal(result.session.typeCounts.judge, 1);
  assert.equal(result.session.lastType, "judge");
});

test("selection excludes used and foreign-level questions", () => {
  const session = { ...createAdaptiveSession(), usedQuestionIds: ["used"] };
  const questions = [
    candidate("used", "medium", ["D1", "D2"]),
    candidate("foreign", "medium", ["D1", "D2"], "single", "court"),
    candidate("fresh", "medium", ["D1", "D2"]),
  ];

  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session, rng: () => 0 }).question.id,
    "fresh",
  );
});

test("selection randomizes within the top three and returns null for an empty pool", () => {
  const questions = [1, 2, 3, 4].map((number) =>
    candidate(`q${number}`, "medium", ["D1", "D2"]),
  );

  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => 0.999 }).question.id,
    "q3",
  );

  const initial = createAdaptiveSession();
  const empty = selectAdaptiveQuestion({ questions: [], levelId: "academy", session: initial });
  assert.equal(empty.question, null);
  assert.equal(empty.session, initial);
});

test("selection clamps invalid random values to a valid shortlist index", () => {
  const questions = [1, 2, 3].map((number) =>
    candidate(`q${number}`, "medium", ["D1", "D2"]),
  );

  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => -2 }).question.id,
    "q1",
  );
  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => Number.NaN }).question.id,
    "q1",
  );
});

// 服务端出题是显式会话线程（worker/comprehensive-quiz.js 同款）；
// 原客户端控制器 createAdaptiveController 已随客户端选题一并退役，
// 这里的不变量（跨阶段路由延续、复位回 medium）由纯引擎承担。
function threadSelect(questions, session, levelId, stage, outcome = null, credit = null) {
  let next = startAdaptiveStage(session, stage);
  if (outcome && next.lastDifficulty) {
    next = {
      ...applyAdaptiveOutcome(next, outcome),
      evidence: [...next.evidence, { credit, difficulty: next.lastDifficulty, dimKeys: [...next.lastDimKeys] }],
    };
  } else if (outcome) {
    next = applyAdaptiveOutcome(next, outcome);
  }
  const picked = selectAdaptiveQuestion({ questions, levelId, session: next, rng: () => 0 });
  const question = picked.question;
  const updated = {
    ...picked.session,
    lastDifficulty: question?.difficulty ?? null,
    lastDimKeys: question ? [...question.dimKeys] : [],
  };
  return { question, session: updated };
}

test("session threading carries routing across stages and a fresh session starts at medium", () => {
  const questions = [
    candidate("academy-medium-1", "medium", ["D1", "D2"], "single", "academy"),
    candidate("academy-medium-2", "medium", ["D3", "D4"], "judge", "academy"),
    candidate("academy-high", "high", ["D5", "D6"], "multi", "academy"),
    candidate("labyrinth-medium", "medium", ["D1", "D3"], "single", "labyrinth"),
    candidate("labyrinth-high", "high", ["D2", "D4"], "judge", "labyrinth"),
  ];

  let step = threadSelect(questions, createAdaptiveSession(), "academy", 1);
  assert.equal(step.question.difficulty, "medium");
  step = threadSelect(questions, step.session, "academy", 1, "correct", 1);
  assert.equal(step.question.difficulty, "medium");
  step = threadSelect(questions, step.session, "academy", 1, "correct", 1);
  assert.equal(step.question.difficulty, "high");
  step = threadSelect(questions, step.session, "labyrinth", 2, "correct", 1);
  assert.equal(step.question.difficulty, "high");

  const fresh = threadSelect(questions, createAdaptiveSession(), "labyrinth", 2);
  assert.equal(fresh.question.difficulty, "medium");
});

test("v2 ability estimation reads credited evidence and stays null without it", () => {
  const session = createAdaptiveSession();
  assert.equal(estimateRunAbility(session), null);
  assert.equal(nextTargetDifficulty(session), 0);

  const strong = {
    ...session,
    evidence: [
      { credit: 1, difficulty: "medium", dimKeys: ["D1", "D2"] },
      { credit: 1, difficulty: "medium", dimKeys: ["D3", "D4"] },
    ],
  };
  assert.ok(estimateRunAbility(strong) > 0.5, "all-correct medium evidence pulls ability up");
  assert.ok(nextTargetDifficulty(strong) > 0.3);

  const weak = {
    ...session,
    evidence: [
      { credit: 0, difficulty: "low", dimKeys: ["D1", "D2"] },
      { credit: 0, difficulty: "low", dimKeys: ["D3", "D4"] },
    ],
  };
  assert.ok(estimateRunAbility(weak) < -0.5, "all-wrong low evidence pulls ability down");
  assert.ok(nextTargetDifficulty(weak) < -0.3);
});

test("credited evidence steers difficulty beyond the bare position walk", () => {
  // Partial-only outcomes leave the walk centred; heavy low credits aim low.
  const partials = {
    ...createAdaptiveSession(),
    evidence: Array.from({ length: 6 }, () => ({ credit: 0.15, difficulty: "medium", dimKeys: ["D1", "D2"] })),
    lastType: "single",
    typeStreak: 1,
  };
  assert.equal(partials.position, 1);
  assert.ok(nextTargetDifficulty(partials) < -0.5, "heavy low credit aims below medium");

  const questions = [
    candidate("low-q", "low", ["D1", "D2"]),
    candidate("medium-q", "medium", ["D1", "D2"]),
    candidate("high-q", "high", ["D1", "D2"]),
  ];
  const picked = selectAdaptiveQuestion({ questions, levelId: "academy", session: partials, rng: () => 0 });
  assert.equal(picked.question.difficulty, "low");
});

test("exposure counts demote over-served questions for fresh equals", () => {
  const session = createAdaptiveSession();
  const questions = [
    candidate("seen-5x", "medium", ["D1", "D2"]),
    candidate("fresh-q", "medium", ["D1", "D2"]),
  ];
  const exposure = { "seen-5x": 5 };
  const picked = selectAdaptiveQuestion({ questions, levelId: "academy", session, rng: () => 0, exposure });
  assert.equal(picked.question.id, "fresh-q");
  assert.equal(picked.exposure["fresh-q"], 1);
  assert.equal(picked.exposure["seen-5x"], 5);
});

test("no question type repeats three times in a credited full run", () => {
  const savedStorage = globalThis.localStorage;
  const backing = new Map();
  globalThis.localStorage = {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: (key) => backing.delete(key),
  };
  try {
    for (const start of [0.05, 0.45, 0.85]) {
      let rngValue = start;
      const rng = () => {
        rngValue = (rngValue * 9301 + 49297) % 233280;
        return rngValue / 233280;
      };
      clearExposureStore();
      let session = createAdaptiveSession();
      let exposure = loadExposureStore();
      let streak = { type: null, count: 0 };
      let lastDimCounts = null;
      for (let stage = 1; stage <= 5; stage += 1) {
        for (let index = 0; index < 5; index += 1) {
          const outcome = index % 2 === 0 ? "correct" : "wrong";
          const credit = index % 2 === 0 ? 1 : 0;
          let next = startAdaptiveStage(session, stage);
          if (session.lastDifficulty) {
            next = {
              ...applyAdaptiveOutcome(next, outcome),
              evidence: [...next.evidence, { credit, difficulty: session.lastDifficulty, dimKeys: [...session.lastDimKeys] }],
            };
          }
          const picked = selectAdaptiveQuestion({
            questions: questionBank.questions,
            levelId: LEVELS[stage - 1],
            session: next,
            rng,
            exposure,
          });
          const question = picked.question;
          assert.ok(question);
          session = {
            ...picked.session,
            lastDifficulty: question.difficulty,
            lastDimKeys: [...question.dimKeys],
          };
          exposure = picked.exposure;
          if (question.type === streak.type) {
            streak.count += 1;
            assert.ok(streak.count < 3, `three in a row of ${question.type}`);
          } else {
            streak = { type: question.type, count: 1 };
          }
        }
        lastDimCounts = session.dimensionCounts;
      }
      saveExposureStore(exposure);
      assert.equal(session.usedQuestionIds.length, 25);
      assert.equal(new Set(session.usedQuestionIds).size, 25);
      // Coverage stays balanced: no dimension starved to zero during the run.
      for (const [key, count] of Object.entries(lastDimCounts)) {
        assert.ok(count >= 2, `dimension ${key} covered (${count})`);
      }
    }
    // Exposure counters persisted across the last run (cleared per seed).
    const saved = JSON.parse(backing.get("aiquos.adaptive-exposure.v1"));
    assert.equal(Object.values(saved).reduce((total, value) => total + value, 0), 25);
  } finally {
    if (savedStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = savedStorage;
  }
});
