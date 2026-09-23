import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CAT_STOP,
  abilityStandardError,
  itemInformation,
  selectAdaptiveQuestion,
  shouldStopCat,
  uncoveredDimensionKeys,
} from "../src/comprehensive-adaptive.js";
import {
  appendExternalEvidence,
  createAttempt,
  finalizeAttempt,
  recordAnswer,
} from "../src/assessment-attempt.js";
import { heuristicCredit, parseInterviewerJson, planDelivery, snapToScale, INTERVIEW_LADDER } from "../src/interviewer.js";
import {
  ANTI_GAMING_RULES,
  CREDIT_BANDS,
  CREDIT_SCALE,
  SLOT_DIMENSIONS,
  SLOT_IDS,
  SLOT_RUBRICS,
  formatAnchors,
  heuristicSlotCredit,
  judgeDiscipline,
  rubricFor,
} from "../src/interview-scoring.js";

const BANK = [
  { id: "q1", type: "single", difficulty: "low", levelId: "academy", dimKeys: ["D1", "D2"], options: [{ key: "A", text: "a" }, { key: "B", text: "b" }], answer: ["A"] },
  { id: "q2", type: "single", difficulty: "medium", levelId: "academy", dimKeys: ["D3", "D4"], options: [{ key: "A", text: "a" }, { key: "B", text: "b" }], answer: ["B"] },
  { id: "q3", type: "multi", difficulty: "high", levelId: "labyrinth", dimKeys: ["D5", "D6"], options: [{ key: "A", text: "a" }, { key: "B", text: "b" }, { key: "C", text: "c" }], answer: ["A", "C"] },
  { id: "q4", type: "judge", difficulty: "medium", levelId: "labyrinth", dimKeys: ["D6", "D1"], options: [{ key: "A", text: "正确" }, { key: "B", text: "错误" }], answer: ["A"] },
];

const seedRng = (value) => () => value;

test("item information peaks at matching difficulty and is symmetric in theta minus b", () => {
  assert.ok(itemInformation(0, "medium") > itemInformation(0, "low"));
  assert.ok(itemInformation(0, "medium") > itemInformation(0, "high"));
  // 1PL information depends only on theta - b, so mirrored pairs agree.
  assert.ok(Math.abs(itemInformation(1, "low") - itemInformation(-1, "high")) < 1e-12);
  assert.ok(itemInformation(0, "medium") <= 0.25 + 1e-12);
});

test("standard error shrinks as evidence accumulates and is null without evidence", () => {
  assert.equal(abilityStandardError({ evidence: [] }), null);
  const one = abilityStandardError({ evidence: [{ credit: 1, difficulty: "medium" }] });
  const many = abilityStandardError({
    evidence: Array.from({ length: 12 }, () => ({ credit: 1, difficulty: "medium" })),
  });
  assert.ok(one > many);
});

test("the stopping rule honours clock, precision, cap, and coverage", () => {
  const budget = 300_000;
  // Coverage vetoes everything while the pool can still cover the gap.
  const veto = shouldStopCat({ answered: 10, elapsedMs: budget, budgetMs: budget, standardError: 0.2, uncoveredCount: 2 });
  assert.equal(veto.stop, false);
  // Min questions before any stop (except an uncoverable pool).
  assert.equal(shouldStopCat({ answered: 3, elapsedMs: budget, budgetMs: budget, standardError: null, uncoveredCount: 0 }).stop, false);
  // Time stops once the minimum is met.
  assert.deepEqual(shouldStopCat({ answered: 8, elapsedMs: budget, budgetMs: budget, standardError: null, uncoveredCount: 0 }), { stop: true, reason: "time" });
  // Precision stops only from the precision floor.
  assert.equal(shouldStopCat({ answered: 6, elapsedMs: 0, budgetMs: budget, standardError: 0.1, uncoveredCount: 0 }).stop, false);
  assert.deepEqual(shouldStopCat({ answered: 9, elapsedMs: 0, budgetMs: budget, standardError: 0.1, uncoveredCount: 0 }), { stop: true, reason: "precision" });
  // The hard cap always stops.
  assert.deepEqual(shouldStopCat({ answered: CAT_STOP.maxQuestions, elapsedMs: 0, budgetMs: budget, standardError: 1, uncoveredCount: 0 }), { stop: true, reason: "cap" });
});

test("coverage-critical selection only serves items touching uncovered dims", () => {
  const session = {
    position: 1,
    usedQuestionIds: ["q1", "q2"],
    dimensionCounts: { D1: 1, D2: 1, D3: 1, D4: 1, D5: 0, D6: 0 },
    typeCounts: { single: 2, judge: 0, multi: 0 },
    lastType: "single",
    activeStage: 1,
    evidence: [],
    typeStreak: 2,
  };
  const picked = selectAdaptiveQuestion({ questions: BANK, levelId: null, session, rng: seedRng(0), coverageCritical: true });
  assert.ok(["D5", "D6"].some((key) => picked.question.dimKeys.includes(key)));
  assert.ok(picked.question.dimKeys.some((key) => session.dimensionCounts[key] === 0));
});

test("whole-bank scope ignores levelId boundaries", () => {
  const session = {
    position: 1, usedQuestionIds: [], dimensionCounts: {}, typeCounts: {}, lastType: null,
    activeStage: null, evidence: [], typeStreak: 0,
  };
  const picked = selectAdaptiveQuestion({ questions: BANK, levelId: null, session, rng: seedRng(0) });
  assert.ok(BANK.some((question) => question.id === picked.question.id));
});

test("external evidence scores through the same posterior and finalises the budget", () => {
  const attempt = createAttempt({ totalQuestions: 40 });
  const withQuestion = recordAnswer(attempt, BANK[0], ["A"]);
  const withConversation = appendExternalEvidence(withQuestion.attempt, {
    id: "conv-goal",
    dimKeys: ["D2", "D5"],
    credit: 0.8,
    label: "对话式测评",
  });
  const withPractical = appendExternalEvidence(withConversation.attempt, {
    id: "prac-human-1",
    dimKeys: ["D3", "D4"],
    credit: 0.6,
  });
  assert.equal(withPractical.attempt.evidence.length, 3);
  assert.equal(withPractical.attempt.evidence[1].external, "对话式测评");
  // Re-judging replaces in place, never duplicates.
  const rejudged = appendExternalEvidence(withPractical.attempt, { id: "conv-goal", dimKeys: ["D2", "D5"], credit: 0.95 });
  assert.equal(rejudged.attempt.evidence.length, 3);
  assert.equal(rejudged.attempt.evidence.find((item) => item.questionId === "conv-goal").credit, 0.95);
  // Finalise pins the budget to what was actually collected.
  const finalized = finalizeAttempt(rejudged.attempt);
  assert.equal(finalized.attempt.totalQuestions, 3);
  assert.equal(finalized.result.status, "in_progress");
});

test("a finalized run completes when every dimension has evidence", () => {
  const attempt = createAttempt({ totalQuestions: 40 });
  let current = attempt;
  const questions = [
    { ...BANK[0], dimKeys: ["D1", "D2"], answer: ["A"] },
    { ...BANK[1], dimKeys: ["D3", "D4"], answer: ["B"] },
    { ...BANK[2], dimKeys: ["D5", "D6"], answer: ["A", "C"] },
  ];
  for (const question of questions) {
    current = recordAnswer(current, question, question.answer).attempt;
  }
  const finalized = finalizeAttempt(current);
  assert.equal(finalized.result.status, "completed");
  assert.equal(typeof finalized.result.overallScore, "number");
});

test("interview evidence survives the draft round-trip with its slot id and dimensions", () => {
  // Mirrors what InterviewPhase does: one external evidence entry per slot,
  // keyed conv-<slotId>, carrying that slot's two dimensions.
  const attempt = createAttempt({ totalQuestions: 40 });
  let current = attempt;
  const slots = [
    { id: "experience", dims: ["D1", "D5"], credit: 0.75 },
    { id: "goal", dims: ["D2", "D5"], credit: 1 },
  ];
  for (const slot of slots) {
    current = appendExternalEvidence(current, {
      id: `conv-${slot.id}`,
      dimKeys: slot.dims,
      credit: slot.credit,
      label: "对话式测评",
    }).attempt;
  }
  const restored = JSON.parse(JSON.stringify({ ...current, routing: null, phasesDone: ["conversation"] }));
  assert.deepEqual(restored.evidence.map((item) => item.questionId), ["conv-experience", "conv-goal"]);
  assert.deepEqual([...restored.evidence[0].dimKeys].sort(), ["D1", "D5"]);
  assert.equal(restored.evidence[0].external, "对话式测评");
  assert.deepEqual(restored.phasesDone, ["conversation"]);
});

test("uncoveredDimensionKeys lists exactly the unscored dimensions", () => {
  assert.deepEqual(uncoveredDimensionKeys({ dimensionCounts: { D1: 2 } }), ["D2", "D3", "D4", "D5", "D6"]);
});

// ── 拟人采访引擎 ──
test("planDelivery chunks replies with per-segment typing budgets", () => {
  const rng = () => 0.4;
  const plan = planDelivery("第一句话。第二句话啦！第三句？", rng);
  assert.ok(plan.segments.length >= 1 && plan.segments.length <= 4);
  assert.ok(plan.totalMs > 0);
  for (const segment of plan.segments) {
    assert.ok(segment.typingMs >= 300);
    assert.ok(segment.text.length > 0);
  }
});

test("the phase clock does not inherit a burnt-out baseline", async () => {
  // Regression: the clock's effect keyed only on `running`, so a phase that had
  // already run down to 00:00 left its baseline at 0 — the next running phase
  // started expired and the student could not answer. The baseline must be
  // re-read on every running transition and fall back to the full budget.
  const source = await readFile(new URL("../src/assessment-timing.js", import.meta.url), "utf8");
  assert.match(source, /baselineRef/, "clock must keep its baseline in a ref");
  assert.match(source, /remainingMs > 0 \? remainingMs : seconds \* 1000/);
  assert.match(source, /const signature = `\$\{seconds\}:\$\{running\}`/);
});

test("a typo correction always quotes a multi-character word, never a lone glyph", () => {
  // 更正内容必须够长才读得通；以前是 "*更正：一" 这种单字残片，既像乱码也
  // 没有信息。现在写成「打错了，是「xxx」。」，这里验证引号里的词至少两字。
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const calls = { n: 0 };
    const rng = () => {
      calls.n += 1;
      // First draw (typo gate) passes, second (which char) passes, rest random-ish.
      if (calls.n === 1) return 0.001;
      if (calls.n === 2) return 0.1;
      return (calls.n * 0.37) % 1;
    };
    const plan = planDelivery("我把三千字的纪要整理好了交给导师", rng);
    for (const segment of plan.segments) {
      const match = segment.text.match(/^打错了，是「(.+)」。$/);
      if (!match) continue;
      assert.ok([...match[1]].length >= 2, `correction too short: ${segment.text}`);
    }
  }
});

test("planDelivery occasionally injects a typo with a correction segment", () => {
  let calls = 0;
  const rng = () => { calls += 1; return calls === 1 ? 0.01 : 0.9; };
  const plan = planDelivery("我在说话的好", rng);
  const joined = plan.segments.map((segment) => segment.text).join("");
  assert.ok(joined.includes("打错了") || joined.includes("我在说话的好"));
});

test("no chat marker symbols survive into the delivered segments", () => {
  // 模型回复偶尔带 markdown 记号；这些字符进了气泡就是学员眼里的乱码。
  const dirty = "**重点** 是这样：# 标题\n- 第一条\n`代码`与 *星号*";
  const plan = planDelivery(dirty, () => 0.99);
  const joined = plan.segments.map((segment) => segment.text).join("");
  assert.ok(!joined.includes("*"), `asterisk leaked: ${joined}`);
  assert.ok(!joined.includes("#"), `hash leaked: ${joined}`);
  assert.ok(!joined.includes("`"), `backtick leaked: ${joined}`);
  assert.ok(joined.includes("重点"), "content must survive the cleanup");
});

test("the interview opening is exactly two lines", async () => {
  // 开场白只承担「说明来意 + 抛出第一个问题」；三条以上会让学员连读多条
  // 气泡才轮到作答。
  const { interviewOpening } = await import("../src/interviewer.js");
  assert.equal(interviewOpening(() => 0.5).length, 2);
});

test("heuristicCredit rewards specificity over brevity", () => {
  assert.equal(heuristicCredit(""), 0);
  const vague = heuristicCredit("随便弄一下");
  const specific = heuristicCredit("你是资深文案，请生成500字以内、包含标题与话题标签的小红书文案，面向大学生读者，输出格式为分点列表");
  assert.ok(specific > vague);
  assert.ok(specific <= 1);
});

// ── 严格打分规则（see .agents/skills/aiquos-interview-scoring） ──
test("the credit scale is exactly the five auditable bands", () => {
  assert.deepEqual(CREDIT_SCALE, [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(CREDIT_BANDS.map((band) => band.credit), CREDIT_SCALE);
  for (const band of CREDIT_BANDS) assert.ok(band.label.length > 0 && band.summary.length > 0);
});

test("every slot has anchors for every band and keeps its rubric in sync with the ladder", () => {
  assert.deepEqual(SLOT_IDS, ["experience", "goal", "constraints", "feedback", "consolidate"]);
  // The interviewer ladder and the scoring rubrics must describe the same slots.
  assert.deepEqual(INTERVIEW_LADDER.map((slot) => slot.id), SLOT_IDS);
  for (const slotId of SLOT_IDS) {
    const rubric = rubricFor(slotId);
    assert.ok(rubric, `missing rubric for ${slotId}`);
    for (const credit of CREDIT_SCALE) {
      assert.ok(rubric.bands[credit] && rubric.bands[credit].length > 8, `${slotId} band ${credit}`);
    }
    const anchors = formatAnchors(slotId);
    for (const credit of CREDIT_SCALE) assert.ok(anchors.includes(credit.toFixed(2)), `${slotId} anchors ${credit}`);
    assert.ok(Array.isArray(SLOT_DIMENSIONS[slotId]) && SLOT_DIMENSIONS[slotId].length === 2);
  }
});

test("the ladder binds each slot to the dimensions the rubrics score", () => {
  for (const slot of INTERVIEW_LADDER) {
    const expected = SLOT_DIMENSIONS[slot.id];
    assert.ok(expected, `no dimensions mapped for ${slot.id}`);
    assert.deepEqual([...slot.dims].sort(), [...expected].sort(), `${slot.id} dims drift`);
  }
});

test("judge discipline carries the evidence, conservatism and anti-gaming rules", () => {
  const discipline = judgeDiscipline();
  assert.match(discipline, /证据|evidence/);
  assert.match(discipline, /宁可低估|低档/);
  for (const rule of ANTI_GAMING_RULES) assert.ok(discipline.includes(rule), `missing rule: ${rule}`);
  // Numbering must stay sequential (a duplicate index means a rule was dropped visually).
  const numbers = [...discipline.matchAll(/^(\d+)\./gm)].map((match) => Number(match[1]));
  assert.deepEqual(numbers, numbers.map((_, index) => index + 1));
});

test("scores snap to the five-band scale", () => {
  // 0.63 sits nearer 0.75 than 0.5 — snapping rounds to the closer band.
  assert.equal(snapToScale(0.63), 0.75);
  assert.equal(snapToScale(0.6), 0.5);
  assert.equal(snapToScale(0.72), 0.75);
  assert.equal(snapToScale(0.9), 1);
  assert.equal(snapToScale(0.03), 0);
  assert.ok(CREDIT_SCALE.every((credit) => snapToScale(credit) === credit));
});

test("heuristic slot credit is conservative and slot-aware", () => {
  // Unrelated and empty answers score zero/low regardless of length.
  assert.equal(heuristicSlotCredit("experience", ""), 0);
  assert.ok(heuristicSlotCredit("goal", "随便帮我弄一下东西") <= 0.25);
  // A padded but empty answer must not outrank a tight, on-point one.
  const padded = heuristicSlotCredit("goal", "我需要你帮我做一件事情，这件事情很重要，我希望能做好，你懂我的意思吧，就是那种感觉，反正是很重要的事情就对了");
  const tight = heuristicSlotCredit("goal", "给新生写一页社团导览，面向大一新生，800字以内，分三部分小标题输出");
  assert.ok(tight > padded, `tight ${tight} should beat padded ${padded}`);
  // Consolidate needs the four elements, not just politeness.
  assert.ok(heuristicSlotCredit("consolidate", "麻烦你帮我写一下谢谢啦") <= 0.25);
  // Every slot returns a legal band.
  for (const slotId of SLOT_IDS) {
    for (const answer of ["", "不知道", "随便", "用AI写过论文，用DeepSeek，最后交上去了，但里面有几个数据是错的我自己改了"]) {
      assert.ok(CREDIT_SCALE.includes(heuristicSlotCredit(slotId, answer)), `${slotId} / ${answer}`);
    }
  }
});

test("the first slot is the experience anchor, not a task prompt", () => {
  const first = INTERVIEW_LADDER[0];
  assert.equal(first.id, "experience");
  assert.equal(first.anchorPrompt, true);
  assert.equal(INTERVIEW_LADDER.slice(1).some((slot) => slot.anchorPrompt), false);
  // Its asks must invite a real account of past use, not a hypothetical task.
  for (const ask of first.asks) assert.match(ask, /最近|实际|真的/);
});

test("parseInterviewerJson accepts messy wrapper text and rejects junk", () => {
  // Prose around the JSON object is tolerated (models add it sometimes).
  const messy = parseInterviewerJson('好的，如下：{"reply":"你好","score":0.7,"note":"不错"} 以上。');
  assert.equal(messy.reply, "你好");
  // 0.7 snaps onto the five-band scale (nearest band = 0.75).
  assert.equal(messy.score, 0.75);
  assert.equal(typeof messy.evidence, "string");
  assert.equal(parseInterviewerJson("```json\n{\"reply\":\"hi\",\"score\":0.5}\n```").reply, "hi");
  assert.equal(parseInterviewerJson("not json at all"), null);
  assert.equal(parseInterviewerJson('{"score":0.9}'), null);
});

test("the interview ladder binds every slot to two scoring dimensions", () => {
  for (const slot of INTERVIEW_LADDER) {
    assert.equal(slot.dims.length, 2);
    assert.ok(slot.asks.length >= 2);
    assert.ok(slot.followUps.length >= 2);
    assert.ok(slot.rubric.length > 10);
  }
});
