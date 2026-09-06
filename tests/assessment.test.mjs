import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import {
  ASSESSMENTS,
  ASSESSMENT_ART,
  getAssessmentLayout,
} from "../src/assessment-layout.js";
import {
  STRIP_DIRECTIONS,
  TRANSITION_DURATION,
  getCardStripBounds,
} from "../src/split-transition.js";

test("four original assessment cards have source-bounded crops and configured copy", async () => {
  assert.deepEqual(
    ASSESSMENTS.map((card) => card.title),
    ["综合测评", "客观题测评", "对话式测评", "实操任务测评"],
  );
  for (const {
    crop: [x, y, width, height],
  } of ASSESSMENTS) {
    assert.ok(x >= 0 && y >= 0 && x + width <= 1672 && y + height <= 941);
    assert.equal(height, 420);
  }
  await access(new URL(`../public${ASSESSMENT_ART}`, import.meta.url));
});
test("assessment scales uniformly and uses two-column mode on phones", () => {
  assert.equal(getAssessmentLayout(1672, 941).unit, 1);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 900],
    [1920, 1080],
    [2560, 1080],
  ]) {
    const layout = getAssessmentLayout(width, height);
    assert.ok(layout.unit > 0 && layout.unit <= width / 1672);
    assert.equal(layout.compact, width < 760);
  }
});
test("three horizontal strips alternate direction, outer bands travel together", () => {
  assert.deepEqual(STRIP_DIRECTIONS, [-1, 1, -1]);
  assert.equal(TRANSITION_DURATION, 1080);
});

test("the user-supplied TEST wordmark is bundled as a local source asset", async () => {
  await access(new URL("../public/assets/test-wordmark-reference.png", import.meta.url));
});

test("desktop cuts land in whitespace, keeping the full card row in one band", () => {
  const cards = Array.from({ length: 4 }, () => ({ top: 343, bottom: 763 }));
  const bands = getCardStripBounds(941, cards, 310);
  assert.deepEqual(bands, [0, 326.5, 779.5, 941]);
  for (const card of cards) {
    assert.ok(bands[1] < card.top && bands[2] > card.bottom);
  }
});

test("phone cuts preserve both card rows and clamp only at viewport edges", () => {
  const cards = [
    { top: 226, bottom: 419 },
    { top: 226, bottom: 419 },
    { top: 435, bottom: 628 },
    { top: 435, bottom: 628 },
  ];
  assert.deepEqual(getCardStripBounds(844, cards, 194), [0, 210, 644, 844]);
  assert.deepEqual(getCardStripBounds(568, cards, 194), [0, 210, 568, 568]);
  assert.deepEqual(getCardStripBounds(844, [], 0), [0, 0, 844, 844]);
});
