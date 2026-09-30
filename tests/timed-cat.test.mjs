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
import { heuristicCredit, parseInterviewerJson, planDelivery, snapToScale, INTERVIEW_LADDER, interviewChatMessages, interviewScoreMessages } from "../src/interviewer.js";
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

test("a typo never spawns a separate correction bubble", () => {
  // 更正气泡（"打错了，是「xxx」。"）是一条打断节奏的废消息：错字保留
  // 在原句里（真人手滑感），但绝不再多发一条消息去承认它。
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const plan = planDelivery("我把三千字的纪要整理好了交给导师，效果号极了", Math.random);
    for (const segment of plan.segments) {
      assert.ok(!segment.text.includes("打错了"), `correction leaked: ${segment.text}`);
      assert.ok(!segment.text.includes("更正"), `correction leaked: ${segment.text}`);
    }
  }
});

test("planDelivery keeps the typo inline without announcing it", () => {
  let calls = 0;
  const rng = () => { calls += 1; return calls === 1 ? 0.01 : 0.9; };
  const plan = planDelivery("我在说话的好", rng);
  const joined = plan.segments.map((segment) => segment.text).join("");
  assert.ok(!joined.includes("打错了"), `correction bubble leaked: ${joined}`);
  assert.ok(joined.includes("我再说话的好"), `typo not applied: ${joined}`);
});

test("the sticker rides at the end of the message text, never on its own line", () => {
  // 表情以前是独立的 <em> 贴纸，排在块级段落后永远另起一行；现在直接
  // 并进该段正文末尾，跟着文字一起换行。
  let calls = 0;
  const rng = () => { calls += 1; return calls === 1 ? 0.9 : 0.01; };
  const plan = planDelivery("用的是哪个 AI，还是几个凑着用?", rng);
  const last = plan.segments[plan.segments.length - 1].text;
  assert.ok(/[\u{1F300}-\u{1FAFF}]/u.test(last), `sticker missing: ${last}`);
  assert.ok(!/\n\s*[\u{1F300}-\u{1FAFF}]/u.test(last), `sticker on its own line: ${last}`);
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

// ── 双轨引擎：聊天轨只管像人，打分轨只管稳定 ──
test("chat track carries the persona protocol and no grading anchors", () => {
  const slot = { ...INTERVIEW_LADDER[0], index: 0 };
  const messages = interviewChatMessages({
    thread: [{ role: "user", content: "我用AI做了个网站" }],
    slot,
    followUp: false,
  });
  const system = messages[0].content;
  // 接话协议 / 反AI腔清单 / few-shot 示范是拟人化的三根支柱。
  assert.match(system, /接话协议/);
  assert.match(system, /绝不说的话/);
  assert.match(system, /示范/);
  assert.match(system, /只问一件事|最多两个问号/);
  // 聊天轨不承载评分：锚点、判定纪律、JSON 格式要求都不该出现。
  assert.ok(!system.includes("分档锚点"), "chat track leaked grading anchors");
  assert.ok(!system.includes("判定纪律"), "chat track leaked judge discipline");
  assert.ok(!system.includes('"score"'), "chat track must not request a score");
  // 历史窗口按条数放行（16 条），最后一条用户消息必须在场。
  assert.equal(messages[messages.length - 2].role, "user");
});

test("grading track is a cold grader: anchors in, persona out", () => {
  const slot = INTERVIEW_LADDER[1];
  const messages = interviewScoreMessages({
    slot,
    questionAsked: "你当时是怎么跟 AI 描述你要的结果的？",
    userAnswer: "我就说帮我做个网站",
    priorAnswer: "做了个网站",
  });
  const system = messages[0].content;
  assert.match(system, /分档锚点/);
  assert.match(system, /判定纪律/);
  assert.match(system, /"score"/);
  // 评分员不演戏：人设与接话规则一律不得混入。
  assert.ok(!system.includes("接话协议"), "persona protocol leaked into grading");
  assert.ok(!system.includes("绝不说的话"), "persona rules leaked into grading");
  // 学员的问答对（含追问前的第一次回答）要原样进入评分上下文。
  const userTurn = messages[messages.length - 1].content;
  assert.match(userTurn, /帮我做个网站/);
  assert.match(userTurn, /追问前的第一次回答/);
});

test("heuristicCredit rewards specificity over brevity", () => {
  assert.equal(heuristicCredit(""), 0);
  const vague = heuristicCredit("随便弄一下");
  const specific = heuristicCredit("你是资深文案，请生成500字以内、包含标题与话题标签的小红书文案，面向大学生读者，输出格式为分点列表");
  assert.ok(specific > vague);
  assert.ok(specific <= 1);
});

// ── 严格打分规则（see .agents/skills/aiquos-interview-scoring） ──
test("the credit scale is exactly the seven auditable bands", () => {
  // 7 档非等距：低区紧凑、高区展开，让中/高水平有档位承载
  assert.deepEqual(CREDIT_SCALE, [0, 0.2, 0.45, 0.65, 0.8, 0.92, 1]);
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

test("scores snap to the seven-band scale", () => {
  // 吸附到最近档位（量表非等距，所以要按实际距离判断）。
  assert.equal(snapToScale(0.63), 0.65);   // 距 0.65 更近
  assert.equal(snapToScale(0.6), 0.65);    // 距 0.65(0.05) < 距 0.45(0.15)
  assert.equal(snapToScale(0.3), 0.2);     // 距 0.2(0.1) < 距 0.45(0.15)
  assert.equal(snapToScale(0.9), 0.92);
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
  // 0.7 snaps onto the seven-band scale (nearest band = 0.65).
  assert.equal(messy.score, 0.65);
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

test("judge discipline quotes the seven-band scale and never the obsolete five-band one", () => {
  // 2026-09-30 审计：纪律条款曾仍写死 0/0.25/0.5/0.75/1 与 0.1 粒度，
  // 与同一提示词里的七档锚点自相矛盾——LLM 按 0.75 给分被 snapToScale
  // 静默改档到 0.8（跨两个校准锚）。纪律与 CREDIT_SCALE 必须同源。
  const text = judgeDiscipline();
  assert.ok(text.includes(CREDIT_SCALE.map(String).join(" / ")), "discipline must quote the exact seven-band sequence");
  for (const stale of ["0.25", "0.75", "0.1 粒度"]) assert.ok(!text.includes(stale), `stale five-band token: ${stale}`);
});
