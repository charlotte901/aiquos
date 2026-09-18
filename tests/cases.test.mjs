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

test("the selected cases have real local entry points; pixel pirate is excluded", async () => {
  // The count is not asserted: this is a list of content, and pinning its size
  // made the test fail whenever a case was added or removed even though every
  // entry it listed was still valid. What matters is that ids are unique and
  // each one points at a file that actually exists.
  assert.ok(CASES.length > 0, "there should be at least one case");
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
  // The wave is rebuilt on the svg's own layout box, not on its screen rect: the
  // viewBox is a design-pixel space while `getBoundingClientRect` reports screen
  // pixels, so on any window that is not the design size the route would be drawn
  // at `1 / frame-scale` of its true size and the dashes would leave the curve
  // they were measured from.
  assert.match(archive, /buildRouteDashes\(width, height, nextCard\)/);
  assert.match(archive, /const width = node\.clientWidth/);
  assert.match(archive, /const scale = rect\.width > 0 \? rect\.width \/ width : 1/);
  assert.ok(
    !archive.includes("buildRouteDashes(rect.width, rect.height, nextCard)"),
    "the route must not be built from screen-pixel rects inside the scaled stage",
  );
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

test("the case pool is the archive plus the live scenes, and the default journey fills the cap", async () => {
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  // No exports beyond the two components: non-component exports from a JSX
  // module invalidate React Fast Refresh.
  assert.match(archive, /^const CASE_POOL = \[/m);
  assert.match(archive, /\.\.\.CASE_PROJECTS\.map\(\(item, archiveIndex\) => \(\{/);
  assert.match(archive, /key: `archive:\$\{archiveIndex\}`/);
  assert.match(archive, /key: `live:\$\{item\.id\}`/);
  assert.match(archive, /cover: `\/assets\/case-covers\/\$\{item\.id\}\.webp`/);
  // A case keeps its own poster world, so editing the order never repaints the
  // cards the reader is already looking at. Resolution runs own world -> keyed
  // world -> positional fallback, and the positional step is last on purpose: a
  // case that names its colours must win even if another case once occupied its
  // slot.
  assert.match(archive, /const own = entry\.world \? WORLD_BY_TOP\[entry\.world\.top\] \?\? entry\.world : null/);
  assert.match(archive, /entry\.world = named \?\? POSTER_WORLDS\[poolIndex % POSTER_WORLDS\.length\]/);
  // No positional world map may come back: it silently repaints whichever case
  // lands in an index after a reorder.
  assert.match(archive, /const ARCHIVE_WORLD_KEYS = \{\}/);
  assert.match(archive, /^const DEFAULT_JOURNEY_KEYS = \[/m);
  assert.match(archive, /const LIVE_JOURNEY_KEYS = LIVE_CASES\.map\(\(item\) => `live:\$\{item\.id\}`\)/);
  assert.match(archive, /featuredProject\.type === "archive"/);
  assert.match(archive, /total=\{journeyCount\}/);
  assert.match(archive, /<CaseScreen config=\{project\} active preload=\{false\} \/>/);

  // The default journey must fill the cap rather than hard-coding a count. A
  // literal six here is exactly what drifted out of step when the cap became
  // twenty, so the size is asserted through JOURNEY_MAX instead.
  const { JOURNEY_MAX } = await import("../src/case-library.js");
  assert.match(archive, /\.slice\(0, JOURNEY_MAX\)/);
  assert.match(
    archive,
    /JOURNEY_MAX - LIVE_CASES\.length - 1/,
    "the archive share must be derived from the cap",
  );
  // The newest cover has its own slot: appended cases are never reached by a
  // front-fill slice, which is why the freshly added case was invisible.
  assert.match(archive, /const NEWEST_ARCHIVE_KEY = `archive:\$\{CASE_PROJECTS\.length - 1\}`/);
  assert.ok(JOURNEY_MAX === 20, "the poster should open with twenty cases");

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

test("the default journey weaves the archive covers through the live scenes", async () => {
  // The covers and the scenes must be woven together. Grouping them —
  // `[...archive, ...live]`, which is what this was — put every illustration
  // ahead of every real project, so paging the poster showed seven drawings in a
  // row before a single scene came up and the wheel read as two collections.
  //
  // Strict alternation is not the goal and is not always possible: with seven
  // covers against ten scenes, taking turns still ends with three scenes in a
  // row. What is asserted is the property the weave actually guarantees — the
  // shorter list's items are spread as evenly as whole slots allow, so no run of
  // one kind is longer than the longer list's natural spacing.
  const { JOURNEY_MAX } = await import("../src/case-library.js");
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const liveIds = CASES.map((item) => item.id);
  const coverCount = (archive.match(/const CASE_PROJECTS = \[[\s\S]*?\n\];/)[0]
    .match(/\n    title: "/g) ?? []).length;

  assert.match(archive, /const ARCHIVE_JOURNEY_KEYS = \[/);
  assert.match(archive, /const LIVE_JOURNEY_KEYS = LIVE_CASES\.map\(\(item\) => `live:\$\{item\.id\}`\)/);
  assert.match(archive, /function weave\(shorter, longer\)/);
  assert.match(archive, /weave\(ARCHIVE_JOURNEY_KEYS, LIVE_JOURNEY_KEYS\)/);
  assert.match(archive, /weave\(LIVE_JOURNEY_KEYS, ARCHIVE_JOURNEY_KEYS\)/);
  assert.ok(
    !/function interleave\(/.test(archive),
    "plain alternation cannot spread 7 covers through 10 scenes — it ends 3 in a row",
  );

  // Rebuild both sides the way the module does, then weave them the same way.
  const archiveKeys = [...new Set([
    ...Array.from(
      { length: Math.min(coverCount, Math.max(0, JOURNEY_MAX - liveIds.length - 1)) },
      (_, i) => `archive:${i}`,
    ),
    `archive:${coverCount - 1}`,
  ])];
  const liveKeys = liveIds.map((id) => `live:${id}`);
  const weave = (shorter, longer) => {
    const total = shorter.length + longer.length;
    const slots = new Set(
      shorter.map((_, i) => Math.min(total - 1, Math.round((i * total) / shorter.length))),
    );
    const out = [];
    let a = 0;
    let b = 0;
    for (let i = 0; i < total; i += 1) {
      out.push(slots.has(i) && a < shorter.length ? shorter[a++] : longer[b++]);
    }
    return out;
  };
  const journey = [...new Set(
    archiveKeys.length <= liveKeys.length
      ? weave(archiveKeys, liveKeys)
      : weave(liveKeys, archiveKeys),
  )].slice(0, JOURNEY_MAX);

  const kinds = journey.map((key) => (key.startsWith("archive:") ? "A" : "L"));
  assert.ok(kinds.includes("A") && kinds.includes("L"), "both sources must appear");
  // No kind may run longer than the spacing the longer list forces. With an
  // even spread the worst case is ceil(longer / shorter) rounded up — for 7
  // through 10 that is 2, and the old grouped form scored 7.
  const longestRun = Math.max(
    ...kinds.join("").match(/(.)\1*/g).map((run) => run.length),
  );
  const allowed = Math.ceil(Math.max(archiveKeys.length, liveKeys.length)
    / Math.min(archiveKeys.length, liveKeys.length)) + 1;
  assert.ok(
    longestRun <= allowed,
    `a kind repeats ${longestRun} times in a row (limit ${allowed}): ${kinds.join("")}`,
  );
  assert.equal(kinds[0], "A", "the poster still opens on the archive cover carrying HOME_GROUND");
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
  // The cap travels with the read, so a saved journey that predates newly added
  // cases can adopt them without growing past what the editor allows.
  assert.match(archive, /readJourney\(CASE_POOL_KEYS, DEFAULT_JOURNEY_KEYS, JOURNEY_MAX\)/);
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
      // The horizontal bleed. The wide path states it as one shared amount
      // (`--peek-bleed-x`, declared once on the base peek rule) so both corners
      // are retuned together: `previous` cancels it, `next` adds it, and that
      // sign flip is the mirror. The compact path pins its own literals, so a
      // plain `translateX(N%)` pair is accepted there as long as it flips sign.
      const pShared = /translateX\(calc\(-1 \* var\(--peek-bleed-x\)/.test(p.body);
      const nShared = /translateX\(calc\(var\(--peek-bleed-x\)|translateX\(var\(--peek-bleed-x\)\)/.test(n.body);
      if (pShared || nShared) {
        assert.ok(pShared, `${label} #${i}: previous must cancel --peek-bleed-x`);
        assert.ok(nShared, `${label} #${i}: next must add --peek-bleed-x`);
      } else {
        const pX = number(p.body, /translateX\((-?[\d.]+)%\)/);
        const nX = number(n.body, /translateX\((-?[\d.]+)%\)/);
        assert.ok(
          typeof pX === "number" && typeof nX === "number",
          `${label} #${i}: both corners need a horizontal offset`,
        );
        assert.equal(pX, -nX, `${label} #${i}: translateX must flip sign`);
      }
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
  // Invalid entries are dropped, and the saved order is kept. The default's `b`
  // is adopted on the end, because the saved list predates it — see the test
  // below for why that matters.
  assert.deepEqual(normalizeJourney(["c", "gone", "c", 7], pool, ["b"]), ["c", "b"]);
  assert.deepEqual(normalizeJourney([], pool, ["a", "b"]), ["a", "b"]);
  assert.deepEqual(normalizeJourney("nope", pool, ["a"]), ["a"]);
  assert.deepEqual(normalizeJourney(null, pool, ["a"]), ["a"]);
  assert.deepEqual(normalizeJourney(["gone"], pool, ["a"]), ["a"]);
  assert.ok(isDefaultJourney(["a", "b"], ["a", "b"]));
  assert.ok(!isDefaultJourney(["b", "a"], ["a", "b"]));
  assert.ok(!isDefaultJourney(["a"], ["a", "b"]));
});

test("a case added after the journey was saved still reaches the poster", () => {
  // The regression this covers: a reader who had visited before held a saved
  // journey in localStorage. Any saved list with at least JOURNEY_MIN entries won
  // outright, so a case added to the pool afterwards was never shown on the
  // poster — it was in the library and on the wheel, but not where the reader
  // lands. Treating the saved list as an order preference rather than a fixed
  // membership is what fixes it.
  const pool = ["archive:0", "archive:1", "live:old", "live:new"];
  const saved = ["archive:0", "archive:1", "live:old"];
  const fallback = ["archive:0", "archive:1", "live:old", "live:new"];

  const result = normalizeJourney(saved, pool, fallback);
  assert.ok(result.includes("live:new"), "the new case must be reachable");
  // The saved order still leads, so a deliberate reorder is not undone.
  assert.deepEqual(result.slice(0, saved.length), saved, "saved order is kept at the front");

  // It must not grow past the cap the editor enforces.
  const many = Array.from({ length: 30 }, (_, i) => `k${i}`);
  const capped = normalizeJourney([], many, many, 20);
  assert.equal(capped.length, 20, "the adopted list respects the cap");

  // A case the reader deleted is filtered out of the pool upstream, so it can
  // never be reintroduced by the adoption step.
  const pruned = normalizeJourney(["archive:0"], ["archive:0"], fallback);
  assert.deepEqual(pruned, ["archive:0"], "a deleted case stays deleted");
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

test("the opened case sits on a blurred copy of its own artwork, never a crop", async () => {
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  const rule = (sel) => {
    const m = css.match(new RegExp(`${sel.replace(/[.*+?^$()|[\]\\]/g, "\\$&")} \\{[\\s\\S]*?\\n\\}`));
    assert.ok(m, `${sel} should exist`);
    return m[0];
  };

  // The backdrop is the same file, blurred, and tinted with the case's own
  // ground: the detail view must not invent a colour the piece never had.
  const blur = rule(".case-detail.is-immersive .case-detail-blur");
  assert.match(blur, /background-image: var\(--detail-art\)/);
  assert.match(blur, /filter: blur\(/);
  // Oversized so the blur's soft edge cannot expose a bare rim at the borders.
  assert.match(blur, /inset: calc\(-1 \*/);
  assert.match(blur, /pointer-events: none/);

  // The veil darkens but must not tint: tinting with the poster's decorative
  // `--detail-ground` turned a coral poster muddy lavender under the site pink.
  const veil = rule(".case-detail.is-immersive .case-detail-veil");
  assert.match(veil, /radial-gradient/);
  assert.ok(
    !/var\(--detail-ground/.test(veil),
    "the veil must darken, not tint with the site palette",
  );

  // The artwork itself is shown whole. `cover` was what cropped it before.
  const img = rule(".case-detail.is-immersive .case-detail-figure img");
  assert.match(img, /object-fit: contain/);
  assert.ok(!/object-fit: cover/.test(img), "the artwork must not be cropped");
  assert.match(img, /max-height: 100%/);
  assert.ok(!/filter:/.test(img), "the artwork itself must stay unblurred");

  // A blurred backdrop over a real image is exactly the case where a text scrim
  // is no longer needed, so the old double-gradient overlay must be gone.
  assert.match(css, /\.case-detail\.is-immersive \.case-detail-figure::after \{\s*content: none;/);

  const jsx = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  // Both custom properties are fed from the case itself, and the decorative
  // layers are hidden from assistive tech.
  assert.match(jsx, /"--detail-art": `url\("\$\{artwork\}"\)`/);
  assert.match(jsx, /"--detail-ground": project\.world\?\.background/);
  assert.match(jsx, /className="case-detail-blur" aria-hidden="true"/);
  assert.match(jsx, /className="case-detail-veil" aria-hidden="true"/);
});

test("the last ice ships as a case with its own poster and copy", async () => {
  const src = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  assert.match(src, /title: "The Last Ice"/);
  assert.match(src, /tags: "AI 生成海报 · 视觉定稿"/);
  // The artwork is the one the case declares, not the one its position would
  // imply. Deriving it from the case count was correct only while the case was
  // appended last with no `image` of its own; the moment the archive was
  // reordered or the case named its artwork, this checked an unrelated file.
  const block = src.match(/const CASE_PROJECTS = \[[\s\S]*?\n\];/)[0];
  const entry = block.slice(block.indexOf('title: "The Last Ice"'));
  const declared = entry.match(/\n    image: (\d+),/);
  assert.ok(declared, "The Last Ice must declare its artwork");
  const bytes = await readFile(
    new URL(`../public/assets/cases/${declared[1]}.webp`, import.meta.url),
  );
  assert.ok(bytes.length > 1000, "the case artwork should be a real image");
  // WebP magic: RIFF....WEBP.
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
});

test("an opened case is centred, with the copy split either side of it", async () => {
  const css = await readFile(new URL("../src/responsive.css", import.meta.url), "utf8");
  const body = css.match(/\.case-detail\.is-immersive \.case-detail-body \{[\s\S]*?\n\}/)[0];

  // The artwork has to land in the middle: the stamp the reader clicks is
  // centred on the poster, so anything else makes the transition jump sideways.
  const cols = body.match(/grid-template-columns:\s*([^;]+);/)[1];
  // Split on `minmax(...)` groups rather than whitespace: each track contains a
  // space of its own ("minmax(0, 1.3fr)"), so a naive split tears them in half.
  const parts = cols.match(/minmax\([^)]*\)/g) ?? [];
  assert.equal(parts.length, 3, `expected three columns, got: ${cols}`);
  // The two sides must be equal, or the middle column is only between them
  // rather than genuinely centred.
  assert.equal(parts[2], parts[0], "the two side columns must match so the piece is centred");
  const width = (track) => Number(track.match(/([\d.]+)fr/)[1]);
  assert.ok(
    width(parts[1]) > width(parts[0]),
    `the artwork column must be the widest so the piece stays large: ${cols}`,
  );

  const jsx = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  // The metadata lives in its own left column and is immersive-only, so the
  // plain detail layout keeps its single stacked panel.
  assert.match(jsx, /className="case-detail-aside is-meta"/);
  assert.match(jsx, /case-detail-aside is-meta[\s\S]{0,400}?case-detail-index/);
  assert.match(jsx, /\{immersive && \(\s*<div className="case-detail-aside is-meta">/);

  // The description is split across the two side columns, and the split must be
  // lossless: it is the same copy divided, not a summary plus a body.
  const split = jsx.match(/function splitDescription\(text\) \{[\s\S]*?\n\}/);
  assert.ok(split, "splitDescription should exist");
  const splitDescription = (text) => {
    const value = typeof text === "string" ? text.trim() : "";
    const m = value.match(/^([\s\S]*?[。！？])\s*([\s\S]*)$/);
    if (!m || !m[2].trim()) return { lead: "", body: value };
    return { lead: m[1], body: m[2].trim() };
  };
  const full = "第一句说明。第二句补充细节。";
  const { lead, body: rest } = splitDescription(full);
  assert.equal(lead, "第一句说明。");
  assert.equal(rest, "第二句补充细节。");
  assert.equal(lead + rest, full, "lead + body must reproduce the original exactly");
  // A description with no sentence break must not lose its text to the lead.
  assert.deepEqual(splitDescription("没有句号的短句"), { lead: "", body: "没有句号的短句" });
  assert.deepEqual(splitDescription(""), { lead: "", body: "" });

  // Every shipped description really does split, so no case silently puts its
  // whole text on one side.
  const block = jsx.match(/const CASE_PROJECTS = \[[\s\S]*?\n\];/)[0];
  const descriptions = [...block.matchAll(/description:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => JSON.parse(`"${m[1]}"`));
  for (const [i, text] of descriptions.entries()) {
    const parts = splitDescription(text);
    assert.ok(parts.lead, `case ${i + 1} has no standfirst to show on the left`);
    assert.equal(parts.lead + parts.body, text, `case ${i + 1} loses copy in the split`);
  }
});

test("every case has Chinese copy that is actually distinct", async () => {
  const src = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const block = src.match(/const CASE_PROJECTS = \[[\s\S]*?\n\];/)[0];
  const descriptions = [...block.matchAll(/description:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => JSON.parse(`"${m[1]}"`));

  // Count the entries rather than pinning a literal total: the pool is content,
  // and a hard-coded number is what made this test fail when cases were removed
  // even though every remaining case was still correct.
  const caseCount = [...block.matchAll(/title: "/g)].length;
  assert.equal(descriptions.length, caseCount, "every case needs a description");
  assert.ok(caseCount > 0, "the pool should not be empty");
  for (const [i, text] of descriptions.entries()) {
    assert.ok(text.length >= 40, `case ${i + 1} has stub copy: ${text}`);
    assert.match(text, /[\u4e00-\u9fa5]/, `case ${i + 1} is not in Chinese: ${text}`);
  }
  // Duplicated blurbs would mean a copy/paste slip while rewriting them.
  assert.equal(
    new Set(descriptions).size,
    descriptions.length,
    "every case needs its own copy, not a repeated one",
  );
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
  // poster rather than at its edge — so clearing the frame costs half the poster
  // plus the whole word, which is much further than a margin picked by eye. A
  // shortfall leaves a slice of display type on screen to blink out at the cut.
  // Both words are measured because they are different lengths.
  assert.match(helper, /offLeft: \(Math\.max\(\.\.\.boxes\.map\(\(box\) => box\.right - sceneBox\.left\)\) \/ scale\)/);
  assert.match(helper, /offRight: \(Math\.max\(\.\.\.boxes\.map\(\(box\) => sceneBox\.right - box\.left\)\) \/ scale\)/);
  assert.match(moving, /const clearance = corners\?\.word/);
  assert.match(moving, /const wordX = reduced \? 0 : \(outgoing \? -direction : direction\) \* clearance \* travel/);
  assert.ok(!moving.includes("* 62 * travel"), "the word flight is still aimed at a guessed clearance");

  // Measured rects are screen pixels, and both the poses and the transforms that
  // consume them live in the scaled design stage — so the measurement has to be
  // converted to design pixels first. Skipping that division is not a subtle
  // error: at 1280x720 the departing stamp finished its flight a third of the
  // way short of the corner, and the settled peek then appeared beyond it.
  assert.match(helper, /const scale = getFrameScaleFromDom\(\) \|\| 1/);
  assert.match(helper, /x: \(box\.left \+ box\.width \/ 2 - originX\) \/ scale/);
  assert.match(helper, /y: \(box\.top \+ box\.height \/ 2 - originY\) \/ scale/);
  assert.ok(
    !helper.includes("/ width) * 100"),
    "the corner poses must be design pixels, not percentages of the window",
  );

  // ...and the sweep hands those design-pixel offsets to the stylesheet as `px`.
  // Writing them back as `vw` would reintroduce the window as a unit inside a
  // composition deliberately no longer measured against it — the same class of
  // bug the design stage exists to remove.
  assert.match(moving, /"--stamp-x": `\$\{x\}px`/);
  assert.match(moving, /"--stamp-y": `\$\{y\}px`/);
  assert.match(moving, /"--word-x": `\$\{wordX\}px`/);
  assert.ok(
    !/"--stamp-x": `\$\{x\}vw`/.test(moving),
    "corner offsets must not be written back in viewport units",
  );

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
  // Read from each case's own declared `image`, not from its position. Deriving
  // the file from the loop index assumed the archive was a contiguous run of
  // 1..N in list order; the moment entries were reordered or held their `image`
  // out of sequence, this checked files no case points at and missed the ones
  // that are. `image` is the contract the runtime uses too (see `projectImage`).
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const block = archive.match(/const CASE_PROJECTS = \[[\s\S]*?\n\];/)[0];
  const numbers = [...block.matchAll(/\n    image: (\d+),/g)].map(([, n]) => Number(n));
  assert.ok(numbers.length > 0, "the archive should not be empty");
  assert.equal(
    numbers.length,
    (block.match(/\n    title: "/g) ?? []).length,
    "every archive case must declare the artwork it is",
  );
  assert.equal(
    new Set(numbers).size,
    numbers.length,
    "two cases must not share one artwork file",
  );
  for (const number of numbers) {
    await access(new URL(`../public/assets/cases/${number}.webp`, import.meta.url));
  }
  for (const item of CASES) {
    await access(new URL(`../public/assets/case-covers/${item.id}.webp`, import.meta.url));
  }
});

test("a bundled scene carries its assets inline instead of fetching them", async () => {
  // Showcase scenes run inside `<iframe sandbox="allow-scripts">`, which gives
  // them an opaque origin. In that origin every network request fails — even a
  // same-origin fetch of a sibling file — so a scene that loads an external model
  // or texture can never start, and shows its loading state forever.
  //
  // The bundled `scene.js` is therefore the contract: if a scene needs an asset,
  // the bytes have to be inside the bundle. This checks that the penguin scene,
  // which is built from a .glb, has its model inlined rather than referenced.
  const scene = await readFile(
    new URL("../public/cases/penguin/scene.js", import.meta.url),
    "utf8",
  );
  assert.match(scene, /data:application\/octet-stream;base64,/, "the model must be inlined");
  // A leftover URL reference would mean the scene still tries to fetch it.
  assert.doesNotMatch(
    scene,
    /["'`](?:\.\/)?model\.glb["'`]/,
    "the bundle must not reference model.glb by URL",
  );

  // The build has to know how to inline it, or the next rebuild silently
  // regresses to a fetching bundle.
  const build = await readFile(new URL("../scripts/build-cases.mjs", import.meta.url), "utf8");
  assert.match(build, /loader:\s*\{\s*"\.glb":\s*"dataurl"\s*\}/);
});

test("the archive transition clamps early frames and always settles when rAF is throttled", async () => {
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  assert.match(archive, /Math\.min\(1, Math\.max\(0, \(now - startedAt\) \/ duration\)\)/);
  assert.match(archive, /window\.setTimeout\(finish, duration \+ 140\)/);
  assert.match(archive, /window\.clearTimeout\(animationFallback\.current\)/);
});

test("every live case has its own detail copy and artwork", async () => {
  // Two silent failures this covers, both of which shipped once already.
  //
  // 1. `LIVE_CASE_DETAILS` is spread by id (`...LIVE_CASE_DETAILS[item.id]`).
  //    A missing key spreads `undefined` without throwing, so the case appears
  //    everywhere except with a title, tags or description — a blank detail view
  //    that looks like a layout bug rather than a missing entry.
  // 2. The detail artwork used to be addressed positionally, which for a live
  //    case resolved to an unrelated archive poster and then blurred that poster
  //    behind the piece. It has to come from the case's own cover.
  const src = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const block = src.match(/const LIVE_CASE_DETAILS = \{[\s\S]*?\n\};/)[0];

  for (const item of CASES) {
    // Keys appear bare or quoted depending on the id, so accept either form.
    const entry =
      block.match(new RegExp(`\\n  ${item.id}: \\{[\\s\\S]*?\\n  \\},`)) ??
      block.match(new RegExp(`\\n  "${item.id}": \\{[\\s\\S]*?\\n  \\},`));
    assert.ok(entry, `${item.id} is missing from LIVE_CASE_DETAILS`);

    // Every field the detail view renders has to be present and non-empty.
    for (const field of ["title", "tags", "year", "description"]) {
      const value = entry[0].match(new RegExp(`\\b${field}:\\s*("[^"]*"|\\d+)`));
      assert.ok(value, `${item.id}.${field} is missing`);
      assert.ok(
        value[1] !== '""',
        `${item.id}.${field} must not be empty`,
      );
    }

    // A single-sentence description leaves the immersive split with an empty
    // left column, which is the imbalance the standfirst exists to prevent.
    const description = entry[0].match(/description:\s*\n?\s*"([^"]*)"/)[1];
    assert.ok(
      /[。！？]/.test(description.replace(/^[^。！？]*[。！？]/, "")),
      `${item.id} needs a second sentence to fill the standfirst`,
    );

    // And the cover it will be shown and blurred from must exist.
    await access(new URL(`../public/assets/case-covers/${item.id}.webp`, import.meta.url));
  }

  // The artwork must resolve from the case, not from its position in the pool.
  assert.match(src, /const artwork = project\.cover \?\? projectImage\(index \+ 1\);/);
  // ...and `projectImage` takes the case's own 1-based image NUMBER. It used to
  // take a 0-based index and add one inside, so a caller that already held the
  // number silently got the next file — the AI-image cases each wore their
  // neighbour's artwork. The +1 now lives at the one positional call site.
  assert.match(
    src,
    /const projectImage = \(imageNumber\) => `\/assets\/cases\/\$\{imageNumber\}\.webp`/,
  );
  assert.match(src, /cover: projectImage\(item\.image\)/);
  assert.ok(
    !/projectImage\(item\.image \+ 1\)/.test(src),
    "a case's `image` is already the file number",
  );
  // Every named file must exist, and every archive case must name one.
  const numbers = [...src.matchAll(/\n    image: (\d+),/g)].map(([, n]) => n);
  for (const number of numbers) {
    await access(new URL(`../public/assets/cases/${number}.webp`, import.meta.url));
  }
  const archiveBlock = src.match(/const CASE_PROJECTS = \[[\s\S]*?\n\];/)[0];
  assert.equal(
    numbers.length,
    (archiveBlock.match(/\n    title:/g) ?? []).length,
    "every archive case must name the artwork it actually is",
  );
});

test("every case kind has a renderer, and a still is never loaded as a scene", async () => {
  // `kind` used to be a binary: "video" rendered a <video>, and everything else
  // was handed to a sandboxed iframe that appends `&preload=1` and waits for an
  // `aiquos:ready` message. A still satisfies neither contract — it is not a film
  // and it has no scene to hand a visibility message to — so adding one without a
  // matching branch would load the image URL as a document and show the loading
  // state forever.
  const screen = await readFile(new URL("../src/CaseScreen.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/cases.css", import.meta.url), "utf8");

  const kinds = new Set(CASES.map((item) => item.kind));
  assert.ok(kinds.has("still"), "the moon-route case should exercise the still kind");

  // `scene` is the fallback branch rather than a named test, so only the kinds
  // that need their own branch are required to name themselves.
  for (const kind of kinds) {
    if (kind === "scene") continue;
    assert.match(
      screen,
      new RegExp(`config\\.kind === "${kind}"`),
      `CaseScreen has no branch for kind="${kind}"`,
    );
  }
  // Anything not named falls through to the iframe, which is the scene contract.
  assert.match(screen, /config\.kind === "still" \? \([\s\S]*?\) : \(\s*<iframe/);

  // The still branch has to be an <img>: only an image fires `load`, which is the
  // signal this branch uses to mark the case ready.
  assert.match(screen, /config\.kind === "still" \? \([\s\S]*?<img[\s\S]*?onLoad=\{markReady\}/);
  assert.match(css, /\.case-layer > \.case-still \{[\s\S]*?object-fit: cover/);

  // The repaint nudge is for live scenes only; it would spin for nothing on a
  // film and on a still, neither of which has a frame to re-assert.
  assert.match(screen, /if \(!visible \|\| config\.kind !== "scene"\) return;/);

  // A still has no interaction, so it must not advertise one.
  const archive = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  assert.match(archive, /project\.kind === "still"[\s\S]*?AI 生成 · 整版呈现/);

  // And its asset has to exist at the path the manifest points at.
  for (const item of CASES.filter((entry) => entry.kind === "still")) {
    await access(new URL(`../public${item.src}`, import.meta.url));
  }
});

test("case copy states the AI capability, not just the medium", async () => {
  // These cases exist to answer one question for a visitor about to take the
  // assessment: what can AI actually make right now? Copy that only names the
  // medium ("实时 3D", "像素游戏") describes a file format and answers nothing.
  //
  // This is not a style preference to be re-litigated per case — it is the reason
  // the section is on the page — so it is enforced here.
  const src = await readFile(new URL("../src/CaseArchive.jsx", import.meta.url), "utf8");
  const block = src.match(/const LIVE_CASE_DETAILS = \{[\s\S]*?\n\};/)[0];

  for (const item of CASES) {
    const entry =
      block.match(new RegExp(`\\n  ${item.id}: \\{[\\s\\S]*?\\n  \\},`)) ??
      block.match(new RegExp(`\\n  "${item.id}": \\{[\\s\\S]*?\\n  \\},`));
    assert.ok(entry, `${item.id} is missing from LIVE_CASE_DETAILS`);

    // The opening sentence becomes the standfirst, so it has to carry the claim.
    const description = entry[0].match(/description:\s*\n?\s*"([^"]*)"/)[1];
    const standfirst = description.match(/^([\s\S]*?[。！？])/)[1];
    assert.match(
      standfirst,
      /AI|模型|一句话|生成/,
      `${item.id}'s standfirst must name what the AI did: "${standfirst}"`,
    );

    // And the short line shown under the piece on every screen must too.
    const item_ = CASES.find((entry) => entry.id === item.id);
    assert.match(
      item_.detail,
      /AI|一句话/,
      `${item.id}'s tagline must name the capability: "${item_.detail}"`,
    );
  }

  // The archive entries share the same wheel, so they carry the same obligation.
  // They are concept pieces, so they state the AI role rather than claiming the
  // whole artefact was generated.
  const archive = src.match(/const CASE_PROJECTS = \[[\s\S]*?\n\];/)[0];
  const archiveDescriptions = [...archive.matchAll(/description:\s*\n?\s*"([^"]*)"/g)];
  assert.ok(archiveDescriptions.length > 0, "the archive should not be empty");
  for (const [, text] of archiveDescriptions) {
    const standfirst = text.match(/^([\s\S]*?[。！？])/)[1];
    assert.match(
      standfirst,
      /AI/,
      `every archive standfirst must name the AI role: "${standfirst}"`,
    );
  }
});
