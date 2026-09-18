import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { getCaseLayers } from "../src/case-buffer.js";
import {
  addJourneyKey,
  isDefaultJourney,
  JOURNEY_MIN,
  moveJourney,
  normalizeJourney,
  removeJourneyKey,
} from "../src/case-library.js";
import {
  CASES,
  CASE_INTERVAL,
  getCaseFaces,
  normalizeCaseIndex,
} from "../src/cases.js";

test("the four selected cases have real local entry points; pixel pirate is excluded", async () => {
  assert.equal(CASES.length, 4);
  assert.ok(!CASES.some((item) => item.id === "pirate-pixel"));
  assert.equal(new Set(CASES.map((item) => item.id)).size, CASES.length);
  for (const item of CASES)
    await access(
      new URL(`../public${item.src.split("?")[0]}`, import.meta.url),
    );
});
test("every screen visits every case exactly once per rotation", () => {
  for (const face of ["top", "left", "right"]) {
    const ids = CASES.map((_, index) => getCaseFaces(index)[face].id);
    assert.equal(new Set(ids).size, CASES.length);
  }
  for (let index = 0; index < CASES.length; index++) {
    assert.equal(
      new Set(Object.values(getCaseFaces(index)).map((item) => item.id)).size,
      3,
    );
  }
  assert.deepEqual(getCaseFaces(CASES.length), getCaseFaces(0));
  assert.equal(normalizeCaseIndex(-1), CASES.length - 1);
  assert.equal(CASE_INTERVAL, 15000);
});
test("requested marketing statistics are removed from page markup", async () => {
  const app = await readFile(
    new URL("../src/App.jsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    app,
    /50k\+|120\+|98%|10k\+|className="stats"|className="social-proof"/,
  );
});

test("case buffers keep the current frame while loading and never exceed two layers", () => {
  const [a,b,c,d] = CASES;
  assert.deepEqual(getCaseLayers(null,a,a,b),[a,b]);
  assert.deepEqual(getCaseLayers(null,a,c,b),[a,c]);
  assert.deepEqual(getCaseLayers(a,b,b,c),[a,b]);
  assert.deepEqual(getCaseLayers(a,b,d,c),[b,d]);
  assert.deepEqual(getCaseLayers(null,a,a,a),[a]);
});

test("initial boot waits for the visible trio before it mounts preload layers", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const screen = await readFile(new URL("../src/CaseScreen.jsx", import.meta.url), "utf8");
  assert.match(app, /const casesReady = bootedCases\.size === initialCaseIds\.current\.size/);
  assert.match(app, /\[casesReady, active, transitionBusy, playing, visible, modal, preset, choosePreset\]/);
  assert.match(app, /preloadCases=\{casesReady\}/);
  assert.match(app, /is-case-booting/);
  assert.match(screen, /preload \? nextConfig : null/);
  assert.match(screen, /onCaseReady\?\.\(id\)/);
  assert.match(app, /const handleCaseReady = useCallback/);
  assert.match(screen, /useLayoutEffect/);
  const runtime = await readFile(new URL("../public/cases/embed-runtime.js", import.meta.url), "utf8");
  assert.match(runtime, /aiquos:ready-ack/);
  assert.match(runtime, /setTimeout\(announceReady, 350\)/);
});

test("showcase video and Mario canvas use cover rather than letterboxing", async () => {
  const css = await readFile(new URL("../src/cases.css", import.meta.url), "utf8");
  const mario = await readFile(new URL("../public/cases/mario/css/style.css", import.meta.url), "utf8");
  assert.match(css, /\.case-layer > video[\s\S]*object-fit: cover/);
  assert.match(mario, /\.showcase #game[\s\S]*object-fit: cover/);
  assert.match(mario, /width: 100vw;[\s\S]*height: 100vh/);
});

test("the removed content editor has no remaining entry point", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app,/function Studio|setModal\("studio"\)|<Studio|上传自己的内容|屏幕快捷编辑/);
});

test("the archive route redraws alongside the page change and empties on command", async () => {
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  assert.match(archive, /className="case-poster-route-dash"/);
  // A page change empties the line at once — no retraction to watch. Both the
  // ref and the state are cleared, or the first settled frame paints the whole
  // previous line for one frame.
  assert.match(archive, /if \(moving\) \{\s*drawnRef\.current = 0;\s*setDrawn\(0\);/);
  // Neither branch is the redraw source any more: while a move is in flight the
  // pens are driven by the page change's own clock.
  assert.match(archive, /const draw = moving \? moveDraw : drawn/);
  assert.match(archive, /const moveDraw = moving\s*\?\s*Math\.pow\(Math\.min\(1, Math\.max\(0, move\)\), ROUTE_MOVE_CURVE\)/);
  // The move leaves the line at full strength, so a completed page change is
  // taken as a completed line instead of replaying the intro pass a second time.
  assert.match(archive, /const moveWasActiveRef = useRef\(false\)/);
  assert.match(archive, /if \(!moveWasActiveRef\.current\) return undefined;\s*moveWasActiveRef\.current = false;\s*drawnRef\.current = 1;\s*setDrawn\(1\);/);
  assert.match(archive, /if \(drawnRef\.current >= 1\) \{\s*setDrawn\(1\);\s*return undefined;/);
  // Both ends advance inward, and each dash fades up as it is drawn; the whole
  // line also ramps in, so the ends do not snap to full strength.
  assert.match(archive, /const edge = Math\.min\(index, count - 1 - index\)/);
  assert.match(archive, /const ramp = 0\.3 \+ 0\.7 \* Math\.min\(1, draw \* 1\.9\)/);
  assert.match(archive, /const opacity = ramp \* Math\.pow\(local, 1\.35\)/);
  assert.match(archive, /Math\.sin\(/);
  // The route keeps a clear margin from the centered card instead of clipping at
  // its edge: dashes that would land in the card's keep-out box are dropped.
  assert.match(archive, /const ROUTE_CARD_CLEARANCE = 0\.24/);
  assert.match(archive, /const ROUTE_CARD_CLEARANCE_MIN = 46/);
  assert.match(archive, /const ROUTE_CARD_CLEARANCE_MAX = 92/);
  assert.match(archive, /const keepOut = routeCardKeepOut\(card, clearance\)/);
  assert.match(archive, /if \(grazes\) continue;/);
  // Only the settled card is measured — a travelling stamp is scaled and offset,
  // so its box would drag the keep-out around mid-flight.
  assert.match(archive, /document\.querySelector\("\.case-poster-scene\.is-stable \.case-poster-feature"\)/);
  assert.match(archive, /buildRouteDashes\(rect\.width, rect\.height, nextCard\)/);
  assert.match(archive, /<PosterRoute[\s\S]*move=\{transition && !transition\.reduced \? transition\.time : null\}/);
  assert.match(archive, /const next = \{ from, to, direction, progress, time, spring, reduced, corners \}/);
  assert.match(css, /\.case-poster-route-dash[\s\S]*stroke-linecap: round/);
  // A travelling stamp is a disabled button; without this rule the global
  // `button:disabled` opacity flattens the fade and shows the route through it.
  assert.match(css, /\.case-poster-feature:disabled \{\s*opacity: var\(--stamp-opacity, 1\)/);
  assert.match(archive, /case-poster-route\$\{moving \? " is-moving" : ""\}/);
  // One shared route layer sits between the poster background and the stage,
  // so a moving scene can never drag the line off-screen with it.
  assert.match(archive, /<PosterRoute[\s\S]*<div className="case-poster-stage">/);
});

test("the archive exposes wheel-independent paging controls", async () => {
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  assert.match(archive, /case-poster-arrow is-left/);
  assert.match(archive, /case-poster-arrow is-right/);
  assert.match(archive, /onPointerDown=/);
  assert.match(archive, /event\.key === "PageDown"/);
  assert.match(archive, /SCROLL · SWIPE · DRAG/);
});

test("the case pool is the archive plus the live scenes, and the default journey is the six archive covers plus four live", async () => {
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  // No exports beyond the two components: non-component exports from a JSX
  // module invalidate React Fast Refresh.
  assert.match(archive, /^const CASE_POOL = \[/m);
  assert.match(archive, /\.\.\.CASE_PROJECTS\.map\(\(item, archiveIndex\) => \(\{/);
  assert.match(archive, /key: `archive:\$\{archiveIndex\}`/);
  assert.match(archive, /key: `live:\$\{item\.id\}`/);
  assert.match(archive, /cover: `\/assets\/case-covers\/\$\{item\.id\}\.webp`/);
  // A case keeps its own poster world, so editing the order never repaints the
  // cards the reader is already looking at.
  assert.match(archive, /entry\.world = POSTER_WORLDS\[poolIndex % POSTER_WORLDS\.length\]/);
  assert.match(archive, /^const DEFAULT_JOURNEY_KEYS = \[/m);
  assert.match(archive, /\.\.\.CASE_PROJECTS\.slice\(0, 6\)\.map\(\(_, index\) => `archive:\$\{index\}`\)/);
  assert.match(archive, /\.\.\.LIVE_CASES\.map\(\(item\) => `live:\$\{item\.id\}`\)/);
  assert.match(archive, /featuredProject\.type === "archive"/);
  assert.match(archive, /total=\{journeyCount\}/);
  assert.match(archive, /<CaseScreen config=\{project\} active preload=\{false\} \/>/);
  const stamp = archive.slice(
    archive.indexOf("function PosterStamp"),
    archive.indexOf("function JourneyEditor"),
  );
  assert.match(stamp, /<img[\s\S]*src=\{project\.cover\}/);
  assert.doesNotMatch(stamp, /CaseScreen|<iframe|<video/);
  assert.match(archive, /LIVE CASE/);
  assert.match(archive, /CASE LIBRARY/);
  // The pool row opens by `archiveIndex`, not the row's own position: the pool is
  // filtered by deletions and recolours, so a row index no longer maps to
  // `CASE_PROJECTS` and using it would open the wrong case.
  assert.match(archive, /changeOpenProject\(entry\.archiveIndex, false, "library"\)/);
  assert.match(archive, /detailOrigin === "library"/);
});

test("the case library can reorder, add to and remove from the journey", async () => {
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  assert.match(archive, /<JourneyEditor/);
  assert.match(archive, /onMove=\{reorderJourney\}/);
  assert.match(archive, /onAdd=\{addToJourney\}/);
  assert.match(archive, /onRemove=\{removeFromJourney\}/);
  assert.match(archive, /onReset=\{resetJourneyList\}/);
  assert.match(archive, /aria-label=\{`上移：\$\{entry\.title\}`\}/);
  assert.match(archive, /aria-label=\{`下移：\$\{entry\.title\}`\}/);
  assert.match(archive, /aria-label=\{`从旅程中移除：\$\{entry\.title\}`\}/);
  assert.match(archive, /onClick=\{\(\) => onAdd\(entry\.key\)\}/);
  assert.match(archive, /disabled=\{index === 0\}/);
  assert.match(archive, /disabled=\{index === lastIndex\}/);
  // The journey can never be emptied, and edits are kept in this browser.
  assert.match(archive, /disabled=\{journey\.length <= JOURNEY_MIN\}/);
  assert.match(archive, /readJourney\(CASE_POOL_KEYS, DEFAULT_JOURNEY_KEYS\)/);
  assert.match(archive, /writeJourney\(journeyKeys\)/);
  assert.match(archive, /isDefault=\{isDefaultJourney\(journeyKeys, DEFAULT_JOURNEY_KEYS\)\}/);
  // Shrinking the journey reels the reader back in and cancels a page change in
  // flight for the old list.
  assert.match(archive, /const next = Math\.min\(activeRef\.current, journeyCount - 1\)/);
  // Leaving the dialog always leaves edit mode behind.
  assert.match(archive, /const closeIndex = useCallback\(\(\) => \{\s*setEditing\(false\);\s*setIndexOpen\(false\);/);
  assert.match(css, /\.case-journey-row \{/);
  assert.match(css, /\.case-journey-pool-list \{/);
  assert.match(css, /\.app\[data-layout="compact"\] \.case-journey-controls/);
});

test("the previous and next peek stamps mirror each other in every rule", async () => {
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  // The two corner stamps are a point reflection about the poster centre, so
  // every rule that places one must place the other as its mirror: `bottom`
  // mirrors `top`, and the transform's translateX and rotate flip sign. A
  // missing pair is itself a failure — it means one corner was positioned and
  // the other was not re-positioned to match.
  const rules = (suffix) => {
    const out = [];
    const re = new RegExp(
      `\\.case-poster-peek\\.is-(previous|next)${suffix}\\s*\\{([^}]*)\\}`,
      "g",
    );
    let match;
    while ((match = re.exec(css))) out.push({ side: match[1], body: match[2] });
    return out;
  };
  const number = (body, re) => {
    const match = body.match(re);
    return match ? Number(match[1]) : null;
  };

  for (const suffix of ["", ":hover"]) {
    const label = suffix || "(base)";
    const all = rules(suffix);
    const previous = all.filter((r) => r.side === "previous");
    const next = all.filter((r) => r.side === "next");
    assert.equal(previous.length, next.length, `${label} rule counts must pair up`);
    assert.ok(previous.length > 0, `expected ${label} peek rules`);
    previous.forEach((p, i) => {
      const n = next[i];
      const pTop = number(p.body, /top:\s*(-?[\d.]+)%/);
      const nBottom = number(n.body, /bottom:\s*(-?[\d.]+)%/);
      if (pTop !== null || nBottom !== null) {
        assert.equal(pTop, nBottom, `${label} #${i}: bottom must mirror top`);
      }
      const pX = number(p.body, /translateX\((-?[\d.]+)%\)/);
      const nX = number(n.body, /translateX\((-?[\d.]+)%\)/);
      assert.ok(typeof pX === "number" && typeof nX === "number", `${label} #${i}: both need a translateX`);
      assert.equal(pX, -nX, `${label} #${i}: translateX must flip sign`);
      const pRot = number(p.body, /rotate\((-?[\d.]+)deg\)/);
      const nRot = number(n.body, /rotate\((-?[\d.]+)deg\)/);
      assert.ok(typeof pRot === "number" && typeof nRot === "number", `${label} #${i}: both need a rotate`);
      assert.equal(pRot, -nRot, `${label} #${i}: rotate must flip sign`);
    });
  }
});

test("the journey editor reorders, adds and removes without damaging the list", () => {
  const base = ["a", "b", "c"];
  assert.deepEqual(moveJourney(base, 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveJourney(base, 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveJourney(base, 1, 1), base);
  assert.deepEqual(moveJourney(base, 0, 99), ["b", "c", "a"]);
  assert.deepEqual(moveJourney(base, 9, 0), base);
  assert.deepEqual(base, ["a", "b", "c"]);
  assert.deepEqual(addJourneyKey(base, "d"), ["a", "b", "c", "d"]);
  assert.deepEqual(addJourneyKey(base, "a"), base);
  assert.deepEqual(removeJourneyKey(base, "b"), ["a", "c"]);
  assert.deepEqual(removeJourneyKey(["a"], "a"), ["a"]);
  assert.equal(JOURNEY_MIN, 1);
});

test("a stored journey is filtered against the pool and falls back when unusable", () => {
  const pool = ["a", "b", "c"];
  assert.deepEqual(normalizeJourney(["c", "a"], pool, ["a"]), ["c", "a"]);
  assert.deepEqual(normalizeJourney(["c", "gone", "c", 7], pool, ["b"]), ["c"]);
  assert.deepEqual(normalizeJourney([], pool, ["a", "b"]), ["a", "b"]);
  assert.deepEqual(normalizeJourney("nope", pool, ["a"]), ["a"]);
  assert.deepEqual(normalizeJourney(null, pool, ["a"]), ["a"]);
  assert.deepEqual(normalizeJourney(["gone"], pool, ["a"]), ["a"]);
  assert.ok(isDefaultJourney(["a", "b"], ["a", "b"]));
  assert.ok(!isDefaultJourney(["b", "a"], ["a", "b"]));
  assert.ok(!isDefaultJourney(["a"], ["a", "b"]));
});

test("the developer panel is a flat tool surface, not a second poster page", async () => {
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  // The later of the two `.case-devpanel` rules is the panel itself; an earlier
  // one only carries touch-action/user-select alongside `.is-index-open`.
  const panel = css.match(/\.case-devpanel \{[^}]*position: absolute[\s\S]*?\n\}/);
  assert.ok(panel, "the developer panel rule should exist");
  const block = panel[0];
  // Must cover the poster and sit above every piece of poster chrome.
  assert.match(block, /position: absolute/);
  assert.match(block, /inset: 0/);
  assert.match(block, /z-index: 40/);
  // A system stack and literal colours: the panel must not inherit the poster's
  // ink/background variables, or it would recolour itself with the case.
  assert.match(block, /ui-monospace/);
  assert.ok(
    !/var\(--poster-/.test(block),
    "the panel must not read the poster's colour variables",
  );
  // No entrance animation and no oversized display heading: those are what made
  // the previous surface read as product UI instead of devtools.
  assert.ok(!/animation:/.test(block), "the panel must not animate in");
  assert.ok(!/case-project-index/.test(css), "the old styled library surface must be gone");
});

test("deleting a case prunes it from the journey and can be undone", async () => {
  const src = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const fn = src.match(/function pruneJourneyToPool\([\s\S]*?\n\}/);
  assert.ok(fn, "pruneJourneyToPool should exist");
  // A removed case must not survive on the poster, and a journey can never keep
  // a duplicate after the pool shrinks under it.
  const prune = (journeyKeys, poolKeys) => {
    const allowed = new Set(poolKeys);
    const seen = new Set();
    const out = [];
    for (const key of journeyKeys) {
      if (!allowed.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  };
  assert.deepEqual(prune(["a", "b", "c"], ["a", "c"]), ["a", "c"]);
  assert.deepEqual(prune(["a", "b"], ["a", "b"]), ["a", "b"]);
  assert.deepEqual(prune(["a", "a", "b"], ["a", "b"]), ["a", "b"]);
  assert.deepEqual(prune(["gone", "a"], ["a"]), ["a"]);
  // The panel keeps a `restore` control so a deletion is reversible.
  assert.match(src, /const restorePool = useCallback/);
  assert.match(src, /setRemovedKeys\(\[\]\)/);
});

test("the poster journey caps at twenty and the panel enforces it", async () => {
  const { JOURNEY_MAX } = await import("../src/case-library.js");
  assert.equal(JOURNEY_MAX, 20);
  const src = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  // The cap is enforced on add, not merely displayed.
  assert.match(src, /current\.length >= JOURNEY_MAX \? current : addJourneyKey/);
  // And the add control is disabled once the journey is full.
  assert.match(src, /disabled=\{atCap\}/);
});

test("poster colours are validated before they reach the stylesheet", async () => {
  const { normalizeColor, normalizeColors } = await import("../src/case-library.js");
  assert.equal(normalizeColor("#AABBCC", "#000000"), "#aabbcc");
  assert.equal(normalizeColor("  #123456 ", "#000000"), "#123456");
  // Anything that is not a plain six-digit hex falls back rather than reaching
  // CSS, which is what keeps a hand-edited storage blob from breaking the poster.
  for (const bad of ["red", "#abc", "#12345", "rgb(1,2,3)", "", null, 42, {}]) {
    assert.equal(normalizeColor(bad, "#000000"), "#000000");
  }
  const defaults = { a: { background: "#111111", ink: "#eeeeee" } };
  assert.deepEqual(
    normalizeColors({ a: { background: "#222222", ink: "#dddddd" } }, ["a"], defaults),
    { a: { background: "#222222", ink: "#dddddd" } },
  );
  // Unknown keys are dropped and a bad channel falls back on its own.
  assert.deepEqual(
    normalizeColors({ b: { background: "#222222" }, a: { background: "nope" } }, ["a"], defaults),
    { a: { background: "#111111", ink: "#eeeeee" } },
  );
  assert.deepEqual(normalizeColors(null, ["a"], defaults), {});
});

test("scene children are individually keyed so a page change cannot recycle a slot", async () => {
  const src = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const part = (from, to) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to, a + 1);
    assert.ok(a > -1 && b > a, `expected ${from} before ${to}`);
    return src.slice(a, b);
  };
  const words = part("const renderWords =", "const renderStableScene =");
  const stable = part("const renderStableScene =", "const renderMovingScene =");
  const moving = part("const renderMovingScene =", "<section");
  const keysOf = (text) => [...text.matchAll(/key="([^"]+)"/g)].map((m) => m[1]);

  // The word block is the one child both scenes share, so it keeps a single key.
  assert.deepEqual(keysOf(words), ["words"]);
  assert.deepEqual([...keysOf(stable)].sort(), [
    "feature",
    "hero",
    "peek-next",
    "peek-previous",
  ]);
  assert.deepEqual(keysOf(moving), ["travelling-stamp"]);

  // The stage swaps a moving scene for the stable scene in the same position, and
  // React matches unkeyed children by index. Index 1 of a moving scene is the
  // travelling <button>; index 1 of the stable scene is the previous peek. Sharing a
  // key space would let the mid-flight transform ride across and make the top-left
  // stamp fly in from off-screen while the bottom-right one simply appears.
  const stableKeys = keysOf(stable);
  const movingKeys = keysOf(moving);
  assert.equal(
    stableKeys.filter((key) => movingKeys.includes(key)).length,
    0,
    "the moving and stable scenes must not share a key",
  );
});

test("a page change lands the departing stamp on the corner it is about to become", async () => {
  const src = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const slice = (from, to) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to, a + 1);
    assert.ok(a > -1 && b > a, `expected ${from} before ${to}`);
    return src.slice(a, b);
  };
  const helper = slice("function measureCornerPoses", "export function CaseArchive");
  const moving = slice("const renderMovingScene =", "<section");

  // The two ends of the flight are the corner peeks themselves: the case leaving
  // the centre reappears as one, and the case arriving was one a frame earlier.
  // So the endpoint has to be read off those boxes rather than guessed. A guessed
  // corner leaves the stamp short of it, the moving scene unmounts, and the
  // settled peek appears under it — which reads as the stamp finding the wrong
  // home and then shrinking and snapping into place.
  assert.match(helper, /\.case-poster-peek\.is-\$\{side\}/);
  assert.match(helper, /scale: peek\.offsetWidth \/ feature\.offsetWidth/);
  assert.match(helper, /rotation: \(Math\.atan2\(parts\[1\], parts\[0\]\) \* 180\) \/ Math\.PI/);
  assert.match(helper, /opacity: Number\.parseFloat\(style\.opacity\)/);

  // ...and the sweep consumes every part of that pose, with no endpoint left as a
  // hard-coded "close enough" travel distance, landing scale or landing opacity.
  assert.match(moving, /const pose = \(corners \? corners\[[^\]]+\] : null\)/);
  assert.match(moving, /const x = reduced \? 0 : pose\.x \* travel/);
  assert.match(moving, /const y = reduced \? 0 : pose\.y \* travel/);
  assert.match(moving, /1 \+ pop \* 0\.95 - \(1 - pose\.scale\) \* spring/);
  assert.match(moving, /pose\.scale \+ spring \* \(1 - pose\.scale\)/);
  assert.match(moving, /pose\.rotation \* travel/);
  assert.match(moving, /1 \+ \(pose\.opacity - 1\) \* progress/);
  assert.match(moving, /pose\.opacity \+ \(1 - pose\.opacity\) \* progress/);
  for (const stale of [
    "* 42 * travel",
    "* 35 * travel",
    "spring * 0.26",
    "0.72 + spring * 0.28",
    "0.62 + progress * 1.1",
    "1 - progress * 0.42",
  ]) {
    assert.ok(!moving.includes(stale), `the sweep still aims at a guessed endpoint: ${stale}`);
  }

  // The display words leave on the same sweep, and they sit at the centre of the
  // poster rather than at its edge — so clearing the viewport costs half the
  // poster plus the whole word, which is much further than a margin picked by
  // eye. A shortfall leaves a slice of display type on screen to blink out at
  // the cut. Both words are measured because they are different lengths.
  assert.match(helper, /offLeft: \(Math\.max\(\.\.\.boxes\.map\(\(box\) => box\.right - sceneBox\.left\)\) \/ width\) \* 100/);
  assert.match(helper, /offRight: \(Math\.max\(\.\.\.boxes\.map\(\(box\) => sceneBox\.right - box\.left\)\) \/ width\) \* 100/);
  assert.match(moving, /const clearance = corners\?\.word/);
  assert.match(moving, /const wordX = reduced \? 0 : \(outgoing \? -direction : direction\) \* clearance \* travel/);
  assert.ok(!moving.includes("* 62 * travel"), "the word flight is still aimed at a guessed clearance");

  // The body changes between the centre and the corner: full artwork over a
  // caption at the centre, artwork filling the frame and just the year at the
  // corner. A travelling stamp therefore carries both and cross-fades them by
  // the flight, or the frame lands perfectly and the picture inside it re-lays
  // itself out one frame later.
  assert.match(moving, /<PosterStamp project=\{journey\[wrapFeatured\(index\)\]\} morph=\{travel\} \/>/);
  assert.match(src, /function PosterStamp\(\{ project, compact = false, morph = null, transitionName \}\)/);
  assert.match(src, /const body = \(isCompact, opacity\) =>/);
  assert.match(src, /poster-stamp-content\$\{isCompact \? " is-compact" : ""\}/);
  assert.match(src, /\{body\(false, 1 - morph\)\}/);
  assert.match(src, /\{body\(true, morph\)\}/);
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  assert.match(css, /\.poster-stamp-content\.is-compact \{/);
  assert.match(css, /\.poster-stamp-content\.is-compact \.poster-stamp-year \{/);
  assert.ok(
    !/\.poster-stamp\.is-compact \./.test(css),
    "the compact body rules must hang off the content layer so both bodies can coexist",
  );

  // Measured once, when the page change starts — that is the only moment the
  // settled composition is still on screen to read. Mid-flight the corner boxes
  // are gone and the travelling stamp's own box would be measured instead.
  assert.match(src, /const corners = measureCornerPoses\(featureRef\.current\)/);
  assert.equal(
    src.match(/measureCornerPoses\(/g).length,
    2,
    "measureCornerPoses should be defined once and called once per page change",
  );
  assert.match(src, /const initial = \{ from, to, direction, progress: 0, time: 0, spring: 0, reduced, corners \}/);
  assert.match(src, /const next = \{ from, to, direction, progress, time, spring, reduced, corners \}/);
});

test("the compact credit bar sits above the interaction hint, not on top of it", async () => {
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  const bottom = (pattern) => {
    const m = css.match(pattern);
    assert.ok(m, `expected a rule matching ${pattern}`);
    return Number(m[1]);
  };
  // The hint keeps the poster's bottom edge; the credit is centred at 50% with an
  // 82vw width, so its left end lands inside the hint unless it is lifted.
  const hint = bottom(/\.app\[data-tab="cases"\] \.case-poster-mode \{\s*bottom:\s*([\d.]+)px/);
  const credit = bottom(
    /\.app\[data-layout="compact"\]\[data-tab="cases"\] \.case-poster-credit \{\s*bottom:\s*([\d.]+)px/,
  );
  // Both lines render at a 10px line box in compact, so the credit needs at least
  // that much clearance plus a visible gap.
  assert.ok(
    credit - hint >= 15,
    `compact credit bottom (${credit}) must clear the hint bottom (${hint}) by a line plus a gap`,
  );
});

test("the two carousel arrows share one inset formula in every layout", async () => {
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  const inset = (selector, prop) => {
    const m = css.match(new RegExp(`${selector} \\{\\s*${prop}:\\s*([^;]+);`));
    assert.ok(m, `expected "${selector} { ${prop}: ... }"`);
    return m[1].replace(/\s+/g, " ").trim();
  };
  // The pair is mirrored — same box, same circle, same label, only the outer edge
  // differs — so the outer-edge inset must match. The right arrow once read
  // clamp(54px, 7vw, 108px) against the left arrow's clamp(32px, 4.5vw, 70px), which
  // held it a consistent 2.5vw further out at every width.
  assert.equal(
    inset("\\.case-poster-arrow\\.is-left", "left"),
    inset("\\.case-poster-arrow\\.is-right", "right"),
    "the wide arrows must use the same inset",
  );
  assert.equal(
    inset('\\.app\\[data-layout="compact"\\] \\.case-poster-arrow\\.is-left', "left"),
    inset('\\.app\\[data-layout="compact"\\] \\.case-poster-arrow\\.is-right', "right"),
    "the compact arrows must use the same inset",
  );
});

test("every featured stamp cover is a local lightweight image", async () => {
  for (let index = 1; index <= 6; index++) {
    await access(new URL(`../public/assets/cases/${index}.webp`, import.meta.url));
  }
  for (const item of CASES) {
    await access(new URL(`../public/assets/case-covers/${item.id}.webp`, import.meta.url));
  }
});

test("the archive transition clamps early frames and always settles when rAF is throttled", async () => {
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  assert.match(archive, /Math\.min\(1, Math\.max\(0, \(now - startedAt\) \/ duration\)\)/);
  assert.match(archive, /window\.setTimeout\(finish, duration \+ 140\)/);
  assert.match(archive, /window\.clearTimeout\(animationFallback\.current\)/);
});
