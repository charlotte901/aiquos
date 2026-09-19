import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPREHENSIVE_QUESTION_PATH,
  applyOutcomeToSession,
  debugSnapshot,
  handleComprehensiveQuestion,
  selectComprehensive,
} from "../worker/comprehensive-quiz.js";
import bank from "../src/comprehensive-questions.json" with { type: "json" };
import {
  createAdaptiveSession,
  selectAdaptiveQuestion,
} from "../src/comprehensive-adaptive.js";

const LEVEL_IDS = [...new Set(bank.questions.map((question) => question.levelId))];
const TOTAL = LEVEL_IDS.length * 5;

const post = (payload) => handleComprehensiveQuestion(
  new Request(`https://example.com${COMPREHENSIVE_QUESTION_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }),
);

const seededRng = (start) => {
  let value = start;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
};

test("the endpoint validates its contract", async () => {
  // Method guard.
  const wrongMethod = await handleComprehensiveQuestion(
    new Request(`https://example.com${COMPREHENSIVE_QUESTION_PATH}`, { method: "GET" }),
  );
  assert.equal(wrongMethod.status, 405);

  // Broken JSON and unknown levels are rejected, not crashed on.
  const badJson = await handleComprehensiveQuestion(
    new Request(`https://example.com${COMPREHENSIVE_QUESTION_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    }),
  );
  assert.equal(badJson.status, 400);
  const badLevel = await post({ levelId: "nope" });
  assert.equal(badLevel.status, 400);

  // A first request needs no session and serves the requested level intact.
  const first = await post({ levelId: "academy", stage: 1 });
  assert.equal(first.status, 200);
  const data = await first.json();
  assert.equal(data.question.levelId, "academy");
  // The served record carries everything the client needs for evidence and
  // feedback: id, difficulty, dimKeys, type, answer, analysis.
  for (const field of ["id", "type", "difficulty", "options", "answer", "analysis", "dims", "dimKeys"]) {
    assert.ok(data.question[field] !== undefined, `question.${field} present`);
  }
  assert.equal(data.session.activeStage, 1);
  assert.ok(data.exposure[data.question.id] === 1);
});

test("garbage sessions degrade to a fresh run instead of throwing", async () => {
  const response = await post({ levelId: "academy", stage: 2, session: "junk", exposure: 7 });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.session.usedQuestionIds.length, 1);
});

test("worker selection is the same engine the client module defines", () => {
  // Parity guard: with identical inputs (session, exposure, rng) the worker's
  // selection must equal the pure src engine's, so "backend adaptive" and the
  // pinned algorithm can never drift.
  const rngA = seededRng(0.2);
  const rngB = seededRng(0.2);
  const session = {
    ...createAdaptiveSession(),
    position: 1.6,
    evidence: [{ credit: 1, difficulty: "medium", dimKeys: ["D1", "D2"] }],
  };
  const exposure = { q001: 3 };
  const fromWorker = selectComprehensive({ levelId: "academy", stage: 1, session, exposure, rng: rngA });
  const fromEngine = selectAdaptiveQuestion({
    questions: bank.questions,
    levelId: "academy",
    session: { ...createAdaptiveSession(), activeStage: 1, position: 1.6, evidence: session.evidence },
    rng: rngB,
    exposure,
  });
  assert.equal(fromWorker.question.id, fromEngine.question.id);
  assert.equal(fromWorker.session.typeStreak, fromEngine.session.typeStreak);
});

test("outcomes move the routing session server-side", () => {
  const session = createAdaptiveSession();
  const question = bank.questions.find((item) => item.id === "q001");
  const afterCorrect = applyOutcomeToSession(session, { outcome: "correct", credit: 1, questionId: "q001" });
  assert.equal(afterCorrect.position, 1.4);
  assert.equal(afterCorrect.evidence.length, 1);
  // Difficulty/dimKeys come from the bank, never from the wire payload.
  assert.equal(afterCorrect.evidence[0].difficulty, question.difficulty);
  assert.deepEqual(afterCorrect.evidence[0].dimKeys, question.dimKeys);
  // Unknown question ids apply the walk but add no evidence.
  const ghost = applyOutcomeToSession(session, { outcome: "wrong", credit: 0, questionId: "q999" });
  assert.equal(ghost.position, 0.6);
  assert.equal(ghost.evidence.length, 0);
  assert.ok(debugSnapshot(afterCorrect).target > 0);
});

test("a full run served entirely by the endpoint completes and stays varied", async () => {
  for (const seed of [0.11, 0.47, 0.83]) {
    const rng = seededRng(seed);
    let session = null;
    let exposure = {};
    const served = [];
    let streak = { type: null, count: 0 };
    for (let stage = 1; stage <= LEVEL_IDS.length; stage += 1) {
      for (let index = 0; index < 5; index += 1) {
        const outcome = index % 2 === 0
          ? { outcome: "correct", credit: 1 }
          : { outcome: "wrong", credit: 0 };
        const response = await post({
          levelId: LEVEL_IDS[stage - 1],
          stage,
          ...(session ? { session } : {}),
          exposure,
          outcome: served.length ? { ...outcome, questionId: served[served.length - 1].id } : undefined,
        });
        assert.equal(response.status, 200, `seed ${seed} stage ${stage} #${index + 1}`);
        const data = await response.json();
        assert.equal(data.question.levelId, LEVEL_IDS[stage - 1]);
        served.push(data.question);
        session = data.session;
        exposure = data.exposure;
        if (data.question.type === streak.type) {
          streak.count += 1;
          assert.ok(streak.count < 3, `three in a row of ${data.question.type}`);
        } else {
          streak = { type: data.question.type, count: 1 };
        }
      }
    }
    assert.equal(served.length, TOTAL);
    assert.equal(new Set(served.map((question) => question.id)).size, TOTAL);
    // The routing session the server maintained covers all six dimensions.
    for (const [, count] of Object.entries(session.dimensionCounts)) {
      assert.ok(count >= 2, `dimension covered (${count})`);
    }
    assert.equal(session.evidence.length, TOTAL - 1); // last outcome rides with a never-made next request
  }
});

test("the endpoint never re-serves a used question within a run", async () => {
  let session = null;
  const seen = [];
  for (let index = 0; index < 24; index += 1) {
    const stage = Math.floor(index / 5) + 1;
    const response = await post({
      levelId: LEVEL_IDS[stage - 1],
      stage,
      ...(session ? { session } : {}),
      outcome: seen.length ? { outcome: "correct", credit: 1, questionId: seen[seen.length - 1] } : undefined,
    });
    const data = await response.json();
    assert.ok(!seen.includes(data.question.id), `question ${data.question.id} re-served`);
    seen.push(data.question.id);
    session = data.session;
  }
});
