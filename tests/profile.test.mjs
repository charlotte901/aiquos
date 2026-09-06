import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
