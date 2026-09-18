import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { transform } from "esbuild";
import * as reportModel from "../src/report-model.js";
import {
  getProfileDetailId,
  PROFILE_CARDS,
  PROFILE_ART,
  PROFILE_WORDMARK,
  getProfileLayout,
} from "../src/profile-layout.js";

test("five personal-center cards keep source-bounded crops and unchanged copy", async () => {
  assert.deepEqual(
    PROFILE_CARDS.map((card) => card.title),
    ["我的组织", "我的作品", "测评记录", "我的收藏", "账号设置"],
  );
  assert.deepEqual(
    PROFILE_CARDS.map((card) => card.id),
    ["organizations", "works", "records", "favorites", "settings"],
  );
  for (const {
    crop: [x, y, width, height],
  } of PROFILE_CARDS) {
    assert.ok(x >= 0 && y >= 0 && x + width <= 1672 && y + height <= 941);
    assert.equal(height, 438);
    assert.equal(y, 350);
  }
  const [wx, wy, ww, wh] = PROFILE_WORDMARK;
  assert.ok(wx >= 0 && wy >= 0 && wx + ww <= 1672 && wy + wh <= 941);
  await access(new URL(`../public${PROFILE_ART}`, import.meta.url));
});

test("profile shares the TEST design system and two-columns on phones", () => {
  const full = getProfileLayout(1672, 941).variables["--profile-unit"];
  assert.ok(Math.abs(full - 0.88) < 1e-10); // five-across relief factor
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 900],
    [1920, 1080],
  ]) {
    const layout = getProfileLayout(width, height);
    assert.ok(layout.variables["--profile-unit"] > 0);
    assert.ok(layout.variables["--profile-unit"] <= (width / 1672) * 0.88 + 1e-10);
    assert.equal(layout.compact, width < 760);
  }
});

test("the choose screen routes the personal-center card into the profile view", async () => {
  const [choose, experience, hub] = await Promise.all([
    readFile(new URL("../src/ChooseHub.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ProfileHub.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(choose, /onProfile\?\.?\(\)/);
  assert.match(experience, /onProfile=\{\(\) => go\("profile"\)\}/);
  assert.match(experience, /location\.hash === "#profile"/);
  assert.match(hub, /profile-wordmark/);
  assert.match(hub, /返回选择/);
});

test("profile aligns to the TEST rhythm: lettering 188@122, uniform cards 420@343", async () => {
  const css = await readFile(new URL("../src/profile.css", import.meta.url), "utf8");
  assert.match(css, /padding-top: calc\(122px \* var\(--profile-unit\)\)/);
  assert.match(css, /height: calc\(188px \* var\(--profile-unit\)\)/);
  assert.match(css, /margin-top: calc\(33px \* var\(--profile-unit\)\)/);
  assert.match(css, /height: calc\(420px \* var\(--profile-unit\)\)/);
  assert.match(css, /border-radius: calc\(22px \* var\(--profile-unit\)\)/);
  assert.match(css, /width: calc\(1502px \* var\(--profile-unit\)\)/);
  assert.match(css, /repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /aspect-ratio: 813 \/ 174/);
});

test("flight and strip transitions recognize the profile surfaces", async () => {
  const [cards, strips] = await Promise.all([
    readFile(new URL("../src/card-transition.js", import.meta.url), "utf8"),
    readFile(new URL("../src/split-transition.js", import.meta.url), "utf8"),
  ]);
  assert.match(cards, /choose-card, \.assessment-card, \.profile-card/);
  assert.match(cards, /choose-wordmark, \.assessment-wordmark, \.profile-wordmark/);
  assert.match(strips, /assessment-card, \.choose-card, \.profile-card/);
  assert.match(strips, /assessment-wordmark, \.choose-wordmark, \.profile-wordmark/);
});

test("profile detail navigation keeps the selected card id in step", async () => {
  assert.equal(getProfileDetailId("#center/works"), "works");
  assert.equal(getProfileDetailId("#center/settings"), "settings");
  assert.equal(getProfileDetailId("#profile"), null);
  assert.match(
    await readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8"),
    /setProfileDetailRoute\(nextProfileDetail\)/,
  );
});

const profileResponses = () => Array.from(
  { length: 25 },
  (_, index) => ({ questionId: `profile-question-${index + 1}` }),
);
const PROFILE_HISTORY = [
  {
    id: "profile-comprehensive", assessmentType: "comprehensive", status: "completed",
    startedAt: "2026-09-14T08:00:00.000Z", completedAt: "2026-09-14T10:03:00.000Z",
    answeredCount: 25, totalQuestions: 25,
    responses: profileResponses(),
    result: {
      dimensions: [72, 68, 75, 70, 66, 74].map((score, index) => ({ key: `D${index + 1}`, score, evidenceCount: 6 })),
      overallScore: 83, grade: "A",
    },
  },
  {
    id: "profile-objective", assessmentType: "objective", status: "completed",
    startedAt: "2026-08-20T08:00:00.000Z", completedAt: "2026-08-20T09:12:00.000Z",
    answeredCount: 25, totalQuestions: 25,
    responses: profileResponses(),
    result: {
      dimensions: [62, 64, 67, 69, 71, 73].map((score, index) => ({ key: `D${index + 1}`, score, evidenceCount: 5 })),
      overallScore: 68, grade: "C",
    },
  },
];

async function compileProfileDetail() {
  const profileSource = await readFile(new URL("../src/ProfileDetail.jsx", import.meta.url), "utf8");
  const transformed = await transform(profileSource, { loader: "jsx", jsx: "automatic", format: "cjs" });
  const compiled = { exports: {} };
  const require = createRequire(import.meta.url);
  const components = new Set(["./AccountSettings", "./CaseArchive", "./ForumBoard", "./AwakeningReport"]);
  new Function("require", "module", "exports", transformed.code)(
    (name) => {
      if (components.has(name)) return new Proxy({}, { get: () => () => null });
      if (name === "@phosphor-icons/react") return new Proxy({}, { get: () => () => null });
      if (name === "./report-model.js") return reportModel;
      if (name === "./account-store") return { useAccount: () => ({ accountId: null }) };
      if (name === "./profile-layout") return { PROFILE_DETAILS: {} };
      if (name === "./layout") return { getViewportLayout: () => ({ compact: false, unit: 1 }) };
      if (name === "./favorites-store") return { removeFavorite() {}, useFavorites: () => [] };
      return require(name);
    },
    compiled,
    compiled.exports,
  );
  return compiled.exports;
}

test("profile record mapping uses real completed dates, types, scores and report snapshots", async () => {
  const { buildProfileAssessmentRecords } = await compileProfileDetail();
  assert.equal(typeof buildProfileAssessmentRecords, "function");
  const records = buildProfileAssessmentRecords([
    ...PROFILE_HISTORY,
    { ...PROFILE_HISTORY[0], id: "draft", status: "in_progress", completedAt: null },
    { id: "broken", status: "completed", completedAt: null },
  ]);
  assert.deepEqual(Object.keys(records), ["2026-09-14", "2026-08-20"]);
  assert.equal(records["2026-09-14"][0].type, "综合测评");
  assert.equal(records["2026-09-14"][0].score, "83%");
  assert.equal(records["2026-08-20"][0].type, "客观题测评");
  assert.equal(records["2026-08-20"][0].report, PROFILE_HISTORY[1]);
});

test("profile keeps the future comprehensive demonstration schedule without restoring the fixed completed 92-point record", async () => {
  const { buildDemonstrationRecords } = await compileProfileDetail();
  assert.equal(typeof buildDemonstrationRecords, "function");
  const records = buildDemonstrationRecords(new Date(2026, 8, 6));
  const futureComprehensive = records["2026-09-19"].find((record) => record.title === "综合测评");
  assert.deepEqual(
    futureComprehensive,
    { type: "综合测评", title: "综合测评", score: "待完成", time: "08:30 · 34 分钟", status: "已安排" },
  );
  assert.equal(records["2026-09-06"].some((record) => record.title === "综合测评" && record.score === "92 分"), false);
});

test("profile receives persisted assessment history and opens the selected real snapshot", async () => {
  const [experience, profile] = await Promise.all([
    readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ProfileDetail.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(experience, /assessmentHistory=\{assessmentState\.history\}/);
  assert.match(profile, /export function ProfileDetail\(\{ id, assessmentHistory = \[\], onBack, onHome, busy \}\)/);
  assert.match(profile, /setSelectedReport\(record\.report\)/);
  assert.match(profile, /AwakeningReportModal[\s\S]*?report=\{selectedReport\}/);
});

test("real profile assessment types are visually distinct and their report controls stay keyboard-visible", async () => {
  const css = await readFile(new URL("../src/profile-records.css", import.meta.url), "utf8");
  assert.match(css, /\.records-panel li\[data-type="comprehensive"\][\s\S]*?#247cf1/i);
  assert.match(css, /\.records-panel li\[data-type="objective"\][\s\S]*?#18a66a/i);
  assert.match(css, /\.record-report-button:focus-visible\s*\{[\s\S]*?outline:/);
});
