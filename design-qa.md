# AIQUOS visual verification

## Revision: the gallery wins — and a reveal that could silently never fire (2026-09-19)

The user picked 展藏 GALLERY from the three-way comparison, so the letters and journal boards, the bottom view switcher, and the per-view localStorage/URL persistence were removed; `forum-variant-gallery.jsx` became `forum-gallery.jsx`, `forum-variants.css` became `forum-board.css`, and `ForumBoard` renders the wall directly. The board defaults to the ink ground `#17150f` with the word GALLERY (moved from the per-view table into `useForumBoard`'s defaults); a selected topic still retints the field and swaps the word (verified: 测评研究 → `rgb(36,124,241)` + RESEARCH, 回归 through detail / related-rail / composer / favorites).

**The bug worth remembering from this pass: a reveal that could silently never fire.** After the cleanup the wall intermittently rendered as an empty dark field — all five pieces stuck at `data-reveal="pending"`, `opacity: 0`. Instrumentation (run counters on the effect, call counters on the observer callback) showed the effect ran and observed, but the IntersectionObserver callback was *never delivered* — while a manually created observer with identical options fired instantly. The difference was not code but frames: the in-app browser pane was occluded (the user was reading their own browser), and this project already documents that occluded embedded webviews stop delivering rendering frames — the exact failure the homepage's 8-second boot-curtain failsafe exists for. IntersectionObserver is fed by frames, so a reveal gated purely on IO has the same blind spot.

**Fix.** `useReveal` now carries a bounded failsafe in the same spirit: if the observer hasn't settled the items within 2 seconds, a timeout clears the attributes and disconnects. Verified under a deliberately hidden pane: pieces pending at 600 ms and 1600 ms, all settled by 2600 ms (the observed path still gives the stagger whenever frames flow). Reduced motion already cleared the attributes outright.

**Also cleaned in this pass:** the stale `.forum-variant-switch` and letters/journal compact rules, the unused `masthead` slot on `ForumField`, and the last `.forum-tab` token scope (now `.forum-board-root`). Compact 430 px: no horizontal overflow, all pieces settle, dark field renders with white type.

## Revision: the Forum board becomes a poster, in three cuts (2026-09-18, second pass)

**Decision after review: all three stay.** What was built as a three-way comparison became a product feature — the community board has three readings (letters / wall / journal), the switcher is a labelled 视图 control in the family's black-pill chrome, and the choice persists in `localStorage` (`aiquos.forum-view.v1`, best-effort so a private-mode browser just starts on the default). Persistence was verified across a reload (journal chosen → stored → reload → journal returns), and the letter view gained the one thing it lacked beside the other two: an entrance. The postcard now settles onto its angle through the same reveal system the wall and the lead use — the reveal ref moved from the index to the board root so the letter is observed too, with the reduced-motion path clearing the pending state.

The views are three readings of one board, so the regression that matters is that switching never changes content: filters, sort, search, likes and comments were exercised across all three switches, plus the dark-topic retint (讨论场 → `rgb(43,39,51)` field, white nav, contents cut to one entry). Compact at 430px: no overflow on any view and the switcher stays on screen.

The first pass fixed the *missing* pieces (a wordmark, a colour field, a motion language) but kept the *shape* of a web app: a titled hero, a filter bar of nine coloured chips, a member rail, and a nine-colour masonry wall, all above the fold at once. Set beside Home and Cases, which open on one solid colour, one giant word and one protagonist, it read as the one page in the product that was laid out rather than composed. The user's words for it were "很一般而且有点乱，没有艺术性".

The diagnosis that mattered was density, not detail: Home and Cases sit at roughly 1–3 on a visual-density scale (one focal object, enormous negative space, controls disguised as content), while the board sat at 8 (three toolbar rows, fifteen member chips, nine card colours competing in one viewport). Type, colour and spacing were all defensible on their own. What was wrong was how many things were asking for attention.

So the board was rebuilt around one sentence: **a solid field, one protagonist, and type doing the rest.** Three compositions were built to the same rule so the direction could be chosen by looking rather than by argument.

| variant | protagonist | the rest | why it holds together |
|---|---|---|---|
| 信箱 LETTERS | today's post as a tilted airmail postcard with an author stamp | numbered index rows with a rule that draws on hover | reuses the Cases poster's anatomy (display word above, object centred) |
| 展藏 GALLERY | the wall: uniform white mounts, slight angles, lead spanning two columns | paged five to a page, label under each frame | every frame equal, pictures contained — a curated wall, not a feed |
| 期刊 JOURNAL | one lead story at the fold | numbered contents column | masthead rule and folio above the word, as a front page orders it |

**Measured, not asserted.** Each variant was checked against the viewport it has to live in: the letter field is exactly `100dvh` (`fieldTop: 0`, `fieldBottom: 972` at a 972px viewport, postcard fully inside); the wall fits its screen after the lead's crop was widened to 16/6 and the word dropped to `--word-scale: 0.42` (`footBottom: 968`); the journal's fold shows its lead. Filtering was sampled at the DOM: selecting 测评研究 moves the field to `rgb(36,124,241)`, switches the display word to RESEARCH, sets the eyebrow and cuts the index to two rows.

**Four bugs this pass found and fixed, all of them real and all of them caught by driving the page rather than reading it.**

1. **The composer and the detail crashed with `useRef is not defined`.** Rewriting the module header for the new imports dropped `useRef` while `ForumPostGallery` still used it, and dropped `ForumCard` while the composer preview still rendered it. Both produced a blank pink screen with no visible error until the console was trapped. A component audit (JSX tags used vs imported) now reports clean across all forum modules.
2. **The gallery wall rendered as an empty field.** Pieces are painted at `opacity: 0` until the reveal observer sees them, and the observer's ref was on the wrong element — the wall had no ref at all. Same class of bug in the journal, where the observer covered the contents list but not the lead story.
3. **The postcard could not be clicked.** It carried a pointer-following tilt: at 776px wide, rotating toward the cursor moves the card away from it, so the pointer chases its own target and the element never settles. Playwright reported `not-stable` rather than a click failure, which is exactly what a person would feel as "the card slides away as I reach for it". The tilt was removed; the hover is now a straighten and a lift, which says "pick me up" without moving the target.
4. **A dark topic made the header labels invisible.** Carried over from the first pass but re-verified here: the field scrolls under the header, so the nav's ink is decided from the field's luminance *and* whether it actually overlaps the header band.

**Regression checks after the rebuild.** Variant switching preserves filters, sort, search, likes and comments (state lives in `useForumBoard`). Detail opens from the letter and from the wall, with its white panel, black rules, comments and related rail intact. Publishing a post works end to end and the new post becomes the featured letter with the right stamp and count. The favorites centre still reuses `ForumDetail` with `返回收藏` and no related rail (that host passes no `onOpenPost`). Compact at 430px: no horizontal overflow in any of the three variants, and the field clears the two-line compact header. `npx vite build` passes.

**Deliberate non-changes.** The detail page, the composer's brutalist form, the favorites/account wiring, `forum-topics.js` and `community-members.js` data, and the `art` cover set are untouched. `forum-effect.js` (the RealitySplit engine) is kept in the tree but is no longer mounted on this tab: a poster does not need an ambient animation competing with its protagonist, and the engine remains available if a later direction wants it back.


## Revision: the Forum tab rejoins the family (2026-09-18)

The Forum tab was the one page that did not look like it belonged to the product. Home, Cases, CHOOSE, TEST and CENTER all open on a big white wordmark over a brand-coloured field; Forum opened on a paper-white canvas with no title at all — a decision recorded as “Forum shows no kicker/title”. The boards, rules and panels below it were already family furniture, so the gap was three layers: the wordmark, the field colour, and a motion language.

**What was added.** A `FORUM!` wordmark in the same DM Sans 900 + bouncing-letters treatment the family uses (no bespoke artwork was supplied for this page, so it is built from type rather than a crop), on a hero whose ground is the brand pink `#f568a3` and which retints to the selected topic's own colour. Filtering by 测评研究 turns the stage blue, 每周精选 amber, and so on — verified by sampling the hero's computed background after each chip click (`rgb(36,124,241)` for 测评研究, `rgb(255,183,3)` for 每周精选).

**The field retint cost one method, not one animation.** The engine already cross-fades `prevPal.bg → pal.bg` over `FIELD_FADE` on every frame, so `setField(color)` reuses that path: it only swaps `bg`, leaving the letter cards and handles on their sampled CHOOSE/TEST/CENTER palette, and `applyField()` re-applies it inside `applyVariant` so a completed loop cannot wash the topic colour back to paper. Measured over a full cycle: the topic colour holds through the variant change instead of reverting after ~10s, which is what the first implementation did before `applyField` was wired in.

| what | how it was checked | result |
|---|---|---|
| topic filter | click 测评研究 | 15 cards → 3 |
| member filter | click 知遥测不准 | 15 cards → 1 |
| search | type 雷达图 | 15 cards → 1, exact title |
| sort | click 最热 | highest-liked post moves to first |
| field retint | sample hero background | tracks the topic colour, survives the loop |
| publish | fill form, submit | 15 → 16, new post first, counts update |
| detail | open a post | title/summary/body/3 comments, black rules intact |
| related rail | open a 测评研究 post | same-topic cards render, tap swaps the post in place |

**Three bugs this revision found and fixed.**

1. **The tokens were scoped to the wrong root.** `--forum-panel` was declared on `.forum-tab`, but the detail and the composer *replace* that element rather than nesting inside it. `var(--forum-panel)` therefore resolved to nothing on those screens and the panel painted transparent under inherited white text — a white-on-white detail page. The block now targets all three roots (`.forum-tab`, `.forum-detail-screen`, `.forum-compose-screen`). Verified by reading computed styles back: panel `rgb(255,253,251)`, heading `rgb(23,21,15)`.

2. **The full-bleed hero overflowed onto phones.** `--tab-screen-inset-x` is the amount the hero cancels to reach the edges, and the compact override changed the tab screen's horizontal padding to `25px` without changing the variable — so on a 430px screen the hero still bled by the wide `72px×ui-scale` inset and ran 47px off the left edge, clipping the wordmark's first letter. Measured before (`hero.left: -47`) and after (`hero.left: 0`, `scrollWidth === innerWidth`). The compact and cases overrides now set the variable alongside the padding.

3. **A dark topic made the nav vanish.** The hero scrolls up *under* the site header, so once `讨论场` (`#2b2733`) was selected the tab's default black nav labels sat on the dark field and became unreadable — caught on a scrolled screenshot, not in the un-scrolled pass. `fieldInk()` is now exported from `ForumEffect` and the board writes its verdict to `.app[data-field-ink]`, which the stylesheet uses to flip the nav labels, their underlines and the compact brand mark. Cleared on unmount so white labels cannot strand on another tab. Verified: dark topic → nav `rgb(255,255,255)`; amber topic keeps the tab's black.

**Also fixed while verifying:** the composer button sits at the same height as the site header, and the header bar spans `left: 54px → right: 41px` with only its two children interactive — its empty middle swallowed the click (`Timeout … covered by <header class="site-header">`). The bar is now `pointer-events: none` on the Forum tab with `auto` restored on the nav and account pill, so its layout is untouched while the page beneath receives clicks.

**Deliberate non-changes.** The card, detail and composer art (square cards, the coloured footer rule, `3px solid #000` separators, the `#fffdfb` panel, the composer's brutalist form) is unchanged — it was already the family language. `forum-effect.js`'s animation maths are untouched apart from the two new methods. `forum-topics.js` and `community-members.js` data were not edited: the geometric covers read the `art` field (`dots/grid/arcs/waves/rings`) that has been in the data since it was authored but was never drawn.

**Regression checks.** Cases poster still renders with no horizontal overflow (`insetX` unchanged at `calc(72px * 0.949)` on wide). Forum → Cases → Forum round trip keeps 15 cards and the hero. Favorites centre → forum detail still renders with `返回收藏` and does *not* show the related rail (that host passes no `onOpenPost`, and the rail is now conditional so it cannot render dead buttons).

## Revision: the departing stamp hands its box to the corner peek (2026-09-15)

Reported symptom, and it was **direction-dependent** — which is what made it worth measuring rather than re-reasoning: going **forward** a page, the **top-left** stamp is wrong; going **back** a page, the **bottom-right** one is. In both cases it sits at the wrong home for a moment and then shrinks and slides up-and-right (backwards) / left-and-down (forwards) into place.

Both directions were sampled frame by frame (every rAF, click and sample in one injection) and the defect is a single-frame discontinuity at the hand-off, not a timing wobble:

| | last frame of the sweep | first settled frame | jump |
|---|---|---|---|
| next page → top-left | `[-14, -10, 257, 313]` | `[-93, 48, 186, 228]` | 79px left, 58px down, **71px narrower** |
| prev page → bottom-right | `[1196, 620, 258, 313]` | `[1347, 625, 186, 228]` | **115px right**, 38px up, **72px narrower** |

The second row *is* the reported "shrinks, moves up, moves right" — to the pixel.

**Cause 1 — the landing pose was guessed.** The two corner peeks are the sweep's landing strip and launch pad: the case leaving the centre reappears as the peek on the side it flew out toward, and the case arriving was that peek one frame earlier. The exit direction in the code already matched the destination corner, but the endpoint was three hand-aimed constants — `42vw` / `35vh` / a landing scale of `0.74` — and the real corner sits at `50vw` / `33.3vh` (top-left), `50vw` / `30.8vh` (bottom-right) and a scale of `0.5478`. So the stamp reached the end of its flight a corner-width short, the moving scene unmounted, and the settled peek appeared under it.

**Cause 2 — the frame arrived but its contents did not.** The centre stamp wears the full body (artwork over a title/tags/year caption) and the corner peek wears the compact one (artwork filling the frame, only the year in the corner). Matching the outer box alone is not enough: the picture *inside* the frame re-lays itself out on the next frame, so the artwork changes size and the caption vanishes. The frame's outline matched; its interior was 100% different.

**Cause 3 — the display words never left the screen.** They are pushed `62vw`, but they sit at the *centre* of the poster, so clearing the edge costs half the poster plus the whole word (`≈78vw` here). The shortfall left the last letter — a `~70×85px` slab of pink display type — sitting at the frame's edge to blink out at the cut.

**Fix.** All three are now **measured off the settled composition** at the moment a page change starts (`measureCornerPoses`), and the whole sweep consumes the measurement:

- position, scale, tilt and landing opacity of each leg come from the corner box it is heading for;
- the travelling stamp carries **both bodies** and cross-fades them by the flight (`PosterStamp morph`), so the artwork and caption resolve continuously; the compact rules moved from `.poster-stamp.is-compact` onto `.poster-stamp-content.is-compact` so both bodies can coexist;
- the word clearance comes from the words' own boxes, both of them, since they are different lengths.

Measuring rather than restating matters because these rules carry layout overrides this file would otherwise have to duplicate: the corner's horizontal anchor is `translateX(-50%)` on wide layouts but `translateX(-76%)` in compact, which puts the compact corner centre at `-35.7px` instead of `0` — a hard-coded `-50vw` would have been 35px wrong there, and a hard-coded word clearance would have been 16vw short.

Verified after the fix, same sampler, both layouts, both directions:

| | wide 1440×900 | compact 390×844 |
|---|---|---|
| next page | dx **0**, dy **0**, dW **0** | dx 1.0, dy −0.5, dW 0 |
| prev page | dx **0**, dy **0**, dW **0** | dx 0.0, dy 0.5, dW 0 |

(the ±1px in compact is sub-pixel rounding on a 140px box)

And the hand-off measured as changed pixels between the frame before the cut and the settled frame, over the whole 1440×900 viewport:

| | whole frame | departing corner |
|---|---|---|
| original | 75,249px (5.81%) | 59,693px |
| + landing pose | 40,201px (3.10%) | 24,645px |
| + contents and words | **17,835px (1.38%)** | **2,279px** |

mirrored for a backwards page: 77,734 → 39,150 → **17,364px (1.34%)** overall, 62,294 → **1,923px** in the departing corner. What is left in that corner is a hairline of antialiasing along the stamp's edge.

Regression test added: `a page change lands the departing stamp on the corner it is about to become` in `tests/cases.test.mjs` — it pins the measured poses as the source of every endpoint, pins the word clearance as measured, pins that the moved stamp carries both bodies, forbids the seven guessed constants from coming back, and pins that the measurement happens once per page change (mid-flight the settled composition is gone, so re-measuring would read the travelling stamp's own box). **Teeth verified**: restoring `* 42 * travel` on the x offset fails it.

Evidence in the workspace outputs: `cases-poster-handoff-before-after.png` (corner crops of the frame before the cut and the settled frame, both directions, before and after, with the corner's true landing box drawn in red so the mismatch is checkable by eye) and `cases-poster-handoff-mask-topleft.png` / `-mask-bottomright.png` (the changed pixels painted red, at each stage of the fix). The settled column is byte-identical before and after, which is the sanity check that only the transition changed.

**Reduced motion unchanged**: sampled with `prefers-reduced-motion` forced on — both travelling stamps hold at `[554, 257, 331]` (no travel at all) for the full 180ms, then the composition settles at ~200ms.

**Still discontinuous, and not fixed — reported rather than claimed:** the *arriving-side* corner peek appears from nothing at the cut, and the *departing-side* one vanishes at the start. A page change only puts **two** stamps in flight (the old centre flying out, the new centre flying in), so the two corner slots that change identity still swap instantly. Measured as a constant ~13,700px at that corner in every stage of this fix — the numbers above show it unchanged, which is how it was identified as a separate thing rather than a leftover. Closing it means putting four stamps in flight, i.e. a real carousel, which is a different piece of work. It is far less visible than the reported defect: the corner stamps are half off-screen, at 0.92 opacity, and the background wipes across them at the same moment.

## Revision: cross-viewport overlapping-text audit (2026-09-15)

The compact credit collision was found by accident, so the same check was made systematic. Every short text run (line box ≤ 26px — display type layered over artwork is intentional here) in the topmost screen is measured with a **Range over its own text nodes** and compared pairwise, across nine viewports plus the case-library index and the journey editor.

Result: **0 collisions** everywhere.

| surface | viewports | runs | 3D-skipped | collisions |
|---|---|---|---|---|
| Cases poster | 1440×900 | 15 | 3 | 0 |
| Cases poster | 1280×800 | 15 | 3 | 0 |
| Cases poster | 1100×760 | 15 | 3 | 0 |
| Cases poster | 1024×700 | 15 | 3 | 0 |
| Cases poster | 900×600 | 15 | 3 | 0 |
| Cases poster | 834×1112 | 12 | 3 | 0 |
| Cases poster | 430×932 | 12 | 3 | 0 |
| Cases poster | 390×844 | 12 | 3 | 0 |
| Cases poster | 360×780 | 12 | 3 | 0 |
| case-library index | 1440×900 / 390×844 / 360×780 | 39 / 33 / 30 | 0 | 0 |
| journey editor | 1440×900 / 390×844 / 360×780 | 15 / 17 / 15 | 0 | 0 |

Three measurement traps had to be fixed before the result meant anything, and the first two produced false positives that would have been reported as defects:

1. **Element boxes instead of ink boxes.** A caption inside a full-width row has a border box that overlaps its neighbours while its glyphs do not — the first pass claimed two titles "overlapped by 250px" when their boxes are 460px apart. Fixed with `range.selectNodeContents(el)`.
2. **Walking the whole document.** A covered screen stays in the DOM with `visibility: visible`, so the poster's `INDEX 01` and `01 / 10` "collided" with the index panel painted over them. Fixed by scoping the walk to the topmost screen (`[role="dialog"]` → panel → tab container) and skipping `[inert]` subtrees.
3. **3D-projected runs.** For a `matrix3d` element the returned box is the axis-aligned box of the skewed quad, so two stacked lines on a sheared plane always "overlap" while reading fine. The home page's cube-face case labels hit this (the label sits in `.screen-plane.top` under `matrix3d`). Such runs are skipped **and counted**, so coverage stays honest rather than silently passing.

**Not covered, recorded as not covered rather than as a pass:** the four text runs inside the poster's main card (title / `Branding, Website` / `2025` / `OPEN CASE`) — the card carries a `matrix3d` tilt, so its boxes are not usable; the full-viewport screenshots show them clearly stacked with no overlap. The home page's cube-face labels are likewise unaudited.

**The audit was proven to have teeth** before the clean result was trusted: restoring `bottom: 7px` on the compact credit immediately produced

```
!! TEETH 390x844  root=home-tab-screen  runs=12  3d-skipped=3  collisions=1
   "SCROLL · SWIPE · DRAG" [case-poster-mode] [18, 825, 110, 10]
   "Aiquos Identity Refresh" [] [119, 827, 113, 10]   -> 9x8px
```

and restoring `26px` returned it to 0. The script is saved as a reusable tool at `~/.workbuddy/skills/agent-browser-animation-frames/scripts/audit_text_overlap.py`; the write-up is `text-overlap-audit.md` in the workspace outputs.

final result: passed

## Latest revision: the compact credit bar no longer prints over the interaction hint (2026-09-15)

Found while verifying the jump fix. At 390×844 the poster carries two lines on its bottom edge: the interaction hint `SCROLL · SWIPE · DRAG` and the credit bar `SPATIAL LEARNING TOOLKIT … 2025`. The hint is `.case-poster-mode { left: 18px; bottom: 9px }` (box x 18–128, y 825–835); the credit is centred at 50% with `width: 82vw` and `bottom: 7px`, so it starts at x=35 and runs to x=355 — straight through the hint. Measured overlap: 93px horizontally, 8px vertically, and the zoomed crop showed the `G` of `DRAG` printed on the `S` of `SPATIAL`. Not merely boxes touching: real overlapping ink.

Fix: one rule lifting the credit above the hint on the compact poster.

```css
.app[data-layout="compact"][data-tab="cases"] .case-poster-credit {
  bottom: 26px;
}
```

Result at 390×844: hint y 825–835 (unchanged, still on the bottom edge), credit y 808–818 — a 7px gap, both lines fully readable. Wide layout is untouched: at 1440×900 the hint is at x 46–183 and the credit at x 460–980, already separated horizontally (`overlapX: -277`), so they can share a baseline there.

Evidence: `cases-poster-credit-compact-fix.png` — the bottom 44px of 390×844, before and after.

Regression test added: `"the compact credit bar sits above the interaction hint, not on top of it"` reads both `bottom` values out of `responsive.css` and requires the compact credit to clear the hint by at least a 10px line box plus a gap. Confirmed to have teeth: setting it back to `7px` fails it. Cases suite 19/19, full suite 91/92, `npx vite build` compiles; the single failure is the pre-existing Sites packaging test, which needs the Codex-only `.openai/hosting.json`.

final result: passed

## Latest revision: the left peek stamp no longer flies in while the right one appears (2026-09-15)

Request: **"现在右侧的动画非常流畅但是左侧的这个动画就变得很跳跃"** — after the mirroring pass the two stamps were geometrically symmetric but no longer *temporally* symmetric: on a page change the bottom-right stamp simply appeared in place while the top-left one slid in from off-screen.

Sampled every animation frame from inside the page (`requestAnimationFrame`, sample and click issued in one shell call so CLI latency cannot split them), 1440×900, one page change on the right arrow. Each sample is the stamp's bounding box as `[left, top, width]`:

| ms after the swap | top-left stamp | bottom-right stamp |
|---|---|---|
| 0 | `[-675, -239, 141]` | `[1347, 625, 186]` |
| 84 | `[-403, -105, 162]` | `[1347, 625, 186]` |
| 167 | `[-179, 5, 180]` | `[1347, 625, 186]` |
| 300 | `[-93, 48, 186]` | `[1347, 625, 186]` |

The whole peek pair is unmounted for the ~850ms the transition is busy, and comes back together — but the top-left one came back at `x = -675` with the travelling stamp's mid-flight `--stamp-scale` (0.72) still on it, and its own `transition: transform 300ms` then walked it into place over 283ms. The bottom-right one was already correct in the very first frame. Both stamps also carried the wrong y (`-239` vs `48`).

**Cause — positional recycling of unkeyed children.** The stage swaps a moving scene for the stable scene in the same DOM position, so React matches the children *by index*. A moving scene's child list is `[words, travelling-stamp <button>]`; the stable scene's is `[words, previous-peek <button>, next-peek <button>, feature <button>]`. Index 1 of the moving scene — the travelling `<button class="case-poster-feature">` holding the in-flight transform — was recycled straight into the stable scene's **previous-peek `<button>`**. The next-peek and feature slots (indices 2 and 3) had no counterpart in a two-child moving scene, so they mounted fresh and looked right.

**Fix** — an explicit `key` on every child of both scenes: `words`, `peek-previous`, `peek-next`, `feature`, `hero`, `travelling-stamp`. Nothing else changed; no CSS, no timings. Re-sampling with the same probe, the pair now vanishes and reappears **already in place in the same frame**:

| ms | top-left stamp | bottom-right stamp |
|---|---|---|
| 367603 | `[-93, 47.6, 186.1]` | `[1347, 624.6, 186.1]` |

Only the normal panel fade-up remains, and the centre stamp's 1.15s travel is untouched.

The intro entrance was checked separately: on a cold load into Cases, `hero` and `intro` are 1 and all three of `prev`, `next`, `feature` fade 0 → 1 together with their geometry fixed, settling at the mirrored positions (`prev [-93, 48, 186]`, `next [1347, 625, 186]`, `feature [554, 257, 331]`). Console after a reload and two arrow presses: only Vite's connect lines and the React DevTools notice — no key warnings.

Evidence frames (transition duration temporarily stretched to 10s with an injected `transition-duration` rule so a CLI screenshot can land mid-flight; the comparison is like-for-like because both halves were captured the same way):

- `cases-poster-peek-jump-desktop.png` — four rows: top-left before, bottom-right before, top-left after, bottom-right after, at 2.0 / 6.0 / 7.5 / 9.0 / 10.5s and settled. Before, the top-left corner is still empty at 2.0s **and** 6.0s, then crawls in from the left edge; the bottom-right corner is already final at 2.0s. After, both corners are final at 2.0s and never move.
- `cases-poster-peek-jump-before.png` / `-after.png` — the 6.0s frame at full viewport, the clearest single-moment pair.

Regression test added: `"scene children are individually keyed so a page change cannot recycle a slot"` slices the two scene renderers out of `CaseArchive.jsx` and pins each key list, then asserts the moving and stable key spaces do not intersect. Confirmed to have teeth: stripping the six `key` attributes fails it with `Expected values to be strictly deep-equal` on the stable list. Cases suite 18/18, full suite 90/91, `npx vite build` compiles; the single failure is the pre-existing Sites packaging test, which needs the Codex-only `.openai/hosting.json`.

Re-checked across configurations with the same per-frame probe (first live frame = the frame the peek pair remounts):

| configuration | first live frame | already settled? | off-screen frames |
|---|---|---|---|
| 1440×900 wide, next arrow | 938ms | yes | 0 |
| 1440×900 wide, prev arrow | 944ms | yes | 0 |
| 390×844 compact, next arrow | 944ms | yes | 0 |
| 390×844 compact, prev arrow | 948ms | yes | 0 |
| 1440×900 wide, reduced motion | 206ms | yes | 0 |

The compact pair lands at `prev [-105, 159, 140]` / `next [355, 514, 140]` on a 390×844 viewport: 35px visible on each side (25% each) and an exact reflection about the scene centre (`prev.top + next.bottom = 159 + 654 = 813 = a + b`). Under reduced motion the pair is unmounted for ~190ms, matching the 180ms reduced duration, and remounts in place.

One environment note for future runs: the shared browser had a second tab steal focus mid-check (a different app at `127.0.0.1:5273`), which silently makes every reading come from the wrong page. Always confirm `location.href` before trusting a sample, and re-select the app tab with the stable id (`agent-browser tab t1`) rather than a positional index.

final result: passed

## Latest revision: the two corner peek stamps are now a true mirror (2026-09-15)

Request: **"目前的轮播效果不对称，也就是左上角和右下角的卡片不对称，我希望以左上角的这种效果为准"** — the top-left and bottom-right peek stamps read as different cards. The previous stamp is the reference and the next stamp is now its point reflection about the poster centre.

Three values were off, all in `.case-poster-peek.is-next`:

| property | before | after | mirror source |
|---|---|---|---|
| vertical anchor (wide) | `bottom: -4.5%` | `bottom: 5.5%` | `.is-previous { top: 5.5% }` |
| horizontal offset (wide) | `translateX(60%)` | `translateX(50%)` | `.is-previous { translateX(-50%) }` |
| vertical anchor (compact) | `bottom: 5%` | `bottom: 19%` | `.is-previous { top: 19% }` |
| hover pop-in | `translateX(54%)` | `translateX(44%)` | `.is-previous:hover { translateX(-44%) }` |

The tilt (`∓1.2deg`) and the compact `translateX(±76%)` were already mirrored and were left alone. Measured at 1440×900 before the change, `next` sat 18px further out and **42px past the bottom edge** (box y 715–942 on a 900px-tall poster) while `prev` sat 48px inside it — so one corner was cut off and the other was not.

Result — the reflection error is the sum of the two centres minus twice the scene centre, and it is 0 on both axes:

| viewport | layout | Δcentre x | Δcentre y | prev visible | next visible | next past bottom |
|---|---|---|---|---|---|---|
| 1280×800 | wide | 0 | 0 | 50% | 50% | 0 (42px clear) |
| 1440×900 | wide | 0 | 0 | 50% | 50% | 0 (48px clear) |
| 1024×700 | wide | 0 | 0 | 50% | 50% | 0 (37px clear) |
| 900×600 | wide | 0 | 0 | 50% | 50% | 0 (32px clear) |
| 1600×560 | wide | 0 | 0 | 50% | 50% | 0 (29px clear) |
| 1100×760 | wide | 0 | 0 | 50% | 50% | 0 (40px clear) |
| 390×844 | compact | 0 | 0 | 25% | 25% | 0 |

Before, `prev`/`next` showed 50% / 40% of their width at 1440; now both show exactly 50%, and the compact pair moved from cy ∓(−177, +296) to a symmetric ∓177.

There were 4 duplicate rule pairs for these two stamps (two wide, two compact) plus a hover pair inside `@media (hover: hover) and (pointer: fine)`; all were brought into agreement so a later cleanup cannot resurrect the asymmetry.

**Also fixed on request of the same rule — the wide-layout arrows.** The prev/next arrows were inset with two different formulas, `.is-left { left: clamp(32px, 4.5vw, 70px) }` against `.is-right { right: clamp(54px, 7vw, 108px) }`. That 2.5vw difference reproduces exactly at every width: the PREV box started 65 / 58 / 50 / 41px from the left edge and the NEXT box ended 101 / 90 / 77 / 63px from the right at 1440 / 1280 / 1100 / 900 — always 36 / 32 / 27 / 22px apart. Both boxes are 109px wide with identical internals (a 46px circle plus a 37px label), so only the outer edge differed, and the ink clusters (71–168 on the left, 1236–1333 on the right) were not mirror images. The right arrow now reads `right: clamp(32px, 4.5vw, 70px)`, taking the left arrow as the reference, the same way the corner stamps do. Verified 0 difference at 1280×800 (58/58), 1100×760 (50/50), 900×600 (41/41), 1600×560 (70/70) and 390×844 compact (22/22); at 1440×900 both circles now sit 71px from their edge. The bottom-right stamp is at y 625–850 while the arrows are centred at y 483, so the 36px shift cannot collide with it, and the dashed route reads no worse than it already did behind the left arrow. Evidence: `cases-poster-arrow-inset-fix.png`. Regression test `"the two carousel arrows share one inset formula in every layout"` compares the two declarations in both the wide and compact rules; confirmed to have teeth (restoring `clamp(54px, 7vw, 108px)` fails it).

Evidence frames: `cases-poster-peek-symmetry-desktop-before.png` / `-desktop-after.png` (1440×900) and `-compact-before.png` / `-compact-after.png` (390×844), each pair captured from the same page state with the old values re-injected so the comparison is like-for-like.

Suites: the 17 Cases tests pass, including a new test that reads every `.case-poster-peek.is-previous` / `.is-next` rule pair (base and hover) and asserts `bottom` equals the mirrored `top` and that `translateX` and `rotate` flip sign. Confirmed to have teeth: re-introducing `bottom: -4.5%` fails it with "(base) #2: bottom must mirror top". Full suite 89/90 and `npx vite build` compiles; the one failure is the pre-existing Sites packaging test, which needs the Codex-only `.openai/hosting.json`.

final result: passed

## Latest revision: the case-library header stops letting rows bleed through (2026-09-15)

Found while verifying the journey editor below: making the list long enough to scroll exposed two defects in the sticky `CASE LIBRARY` header.

- **A bare band above the plate.** The header is `position: sticky; top: 0`, but the dialog's own `padding-top` (34px wide / 26px compact) puts the sticky box below it, so scrolled rows kept painting into that band — a sliced row of control buttons sat above the wordmark. Fixed with `box-shadow: 0 -44px 0 0 #f6eee6`: a hard-edged fill that covers the band and moves nothing (layout-neutral, and identical to the dialog's own background, so it is invisible at rest).
- **The fade crossed the wordmark.** `background: linear-gradient(#f6eee6 78%, transparent)` made the plate's bottom 22% (~35px) transparent, which overlapped the 115px wordmark and let the list read through the letterforms. Replaced with a fixed `calc(100% - 16px)` band, so the soft edge stays below the type.

Measured ink (pixels differing from `#f6eee6` by more than 6) across x 40–1100, same viewport and scroll position (1440×900, `scrollTop` 400):

| band | before | after | what it is |
|---|---|---|---|
| 158–166 | 3983 | **3415** | 568px of row content removed from the type band |
| 166–174 | 3451 | 3451 | wordmark only, unchanged |
| 176–192 | 2524 | 2464 | the intended soft edge |

The wordmark's ink ends at y=174 (y=175 drops to 45px) and the header box ends at y=192, so the 16px tail is now the only place a row can appear — strictly below the letterforms. Per-row scans confirm the scrolled rows contribute exactly two full-width lines (y=434, y=498, 100px each) inside the panel and nothing else, so there is no stray bleed where the rows are empty.

Evidence frames: `cases-library-header-bleed-before.png` and `cases-library-header-bleed-after.png` (1440×900, identical scroll position).

Suites: the 16 Cases tests pass with a new assertion pinning `position: sticky`, `top: 0`, the `-44px` shadow and the `calc(100% - 16px)` band, and rejecting a percentage stop. Full suite 88/89 and `npx vite build` compiles; the one failure is the pre-existing Sites packaging test, which needs the Codex-only `.openai/hosting.json`.

final result: passed

## Latest revision: reorder, add and delete journey cases (2026-09-15)

Request: **"现在我希望我能够对这些案例进行排序增加删除"** — the Cases carousel had to become editable. Scoped by a clarifying question to the **featured journey (the 01/10 carousel)** rather than the 36-item library list, and adding draws from the **existing 40-case pool** rather than inventing anything.

Model: the pool is fixed and the journey is an ordered subset of it, so reordering can never repaint a cover that is already on screen.

- `src/case-library.js` (new) holds the whole model: `normalizeJourney` / `moveJourney` / `addJourneyKey` / `removeJourneyKey` / `isDefaultJourney`, plus `readJourney` / `writeJourney` for the `aiquos.case-journey.v1` key. Everything is pure except the two storage helpers, which swallow failures so private mode still works. The journey can never be emptied (`JOURNEY_MIN = 1`).
- `CASE_POOL` is the 40 archive covers plus the live scenes, each carrying a stable `key` (`archive:N` / `live:<id>`), its own `world` and its `cover`. `DEFAULT_JOURNEY_KEYS` is the previous featured list expressed as keys — the six archive covers plus the four live scenes.
- Every `POSTER_WORLDS[x % len]` lookup became `journey[wrapFeatured(x)].world`, so the poster follows the stored order instead of the pool's.
- `JourneyEditor` renders the ordered rows and the addable remainder; the dialog header gained `EDIT`/`DONE` (an `aria-pressed` toggle) beside `CLOSE`, and leaving the dialog always drops edit mode.
- Shrinking the journey reels the reader back in: `journeyCount` is in a dependency array that clamps the active index and cancels any page change in flight against the old list.

Behaviour verified in the browser at both 1440×900 and 390×844:

| step | result |
|---|---|
| open | 10 rows, 30 pool buttons, `RESET` disabled (already default) |
| move 01 down | order → Spatial Learning Toolkit, Aiquos Identity Refresh, Studio Workflow Assistant; storage → `["archive:1","archive:0","archive:2", …]` length 10; first ▲ disabled, last ▼ disabled, `RESET` enabled |
| remove 03 | 9 rows, pool 31, head `JOURNEY ORDER 09`, the removed title reappears in the pool |
| add it back | 10 rows, pool 30, appended last, storage length 10 |
| close | dialog gone, carousel reads `01/10` = Spatial Learning Toolkit with world `#557fa8` — the reorder reaches the poster |
| reload | the stored order survives |
| `RESET` | back to the default 10 starting at Aiquos Identity Refresh, `RESET` disabled again |

Compact (390×844): the dialog goes full-bleed 390×844; rows are 335×107 on a `26px 40px 1fr` grid with a 40×40 cover and the three controls dropped to their own row at 40×34 (finger-sized, and the title keeps the full width); the pool collapses to one column; document `scrollWidth` never exceeds the viewport.

Evidence frames: `cases-journey-editor-desktop.png` and `cases-journey-editor-desktop-pool.png` (1440×900, both showing the same reordered journey with `RESET` live), `cases-journey-editor-compact.png` and `cases-journey-editor-compact-pool.png` (390×844).

Suites: the 16 Cases tests pass, including a new source assertion for the editor wiring and two behavioural tests for `moveJourney` / `addJourneyKey` / `removeJourneyKey` / `normalizeJourney`. Console after a full walkthrough shows only the React DevTools info line. Full suite 88/89 and `npx vite build` compiles; the one failure is the pre-existing Sites packaging test, which needs the Codex-only `.openai/hosting.json`. Two assertions here were stale after `CASE_POOL` and `DEFAULT_JOURNEY_KEYS` were un-exported for Fast Refresh; they now match the plain `const` declarations.

final result: passed

## Latest revision: wider clearance around the centered card (2026-09-15)

Follow-up on the previous revision: the clearance should be **extended further**. The keep-out ratio went `0.14 → 0.24` of the card's short side and the clamps `30–56px → 46–92px`; nothing else changed.

Measured minimum gap between any visible dash and the card's box (previous value in brackets):

| viewport | card | visible dashes | min gap |
|---|---|---|---|
| 1280×800 | 294×363 | 58 (60) | **75px** (55) |
| 1440×900 | 331×409 | 61 | 80px (46) |
| 1024×700 | 236×291 | 44 (46) | 66px (40) |
| 900×600 | 228×281 | 38 | 58px (58) |
| 768×1024 | 290×358 | 38 (43) | 91px (50) |
| 1600×560 | 236×291 | 62 | 73px (46) |
| 390×760 | 199×246 | 28 (29) | 49px (45) |

The nominal margin is `card短边 × 0.24`; the achieved gap runs 10–30px larger because the dashes are discrete and the dash that would sit on the margin is dropped with the ones behind it. The tightest result is the narrow phone layout (49px), where the card already spans most of the width — proportionally still a clear berth on a 390px screen.

Visible dashes drop by only 1–5 at every size, so the line still reads as a full corner-to-corner route. The page-change replay is unchanged at 58 dashes: instant empty at 83ms, symmetric advance (`L=R` 2 → 5 → 8 → 11 → 15 → 19 → 23 → 28) while the covers swap, centre 0.43 → 0.98 → 1.00 as the move lands, holding at 1.00 with no second pass.

Evidence frames: `cases-route-card-clearance.png` (1280×800), `cases-route-card-clearance-compact.png` (390×760), against the original 0px case in `cases-route-before-touching-card.png`.

Suites: the 12 Cases tests pass (clearance assertions updated to `0.24` / `46` / `92`). Full suite 84/85 and `npx vite build` compiles. Unchanged pre-existing items: `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` need the Codex-only `.openai/hosting.json`.

final result: passed

## Latest revision: clearance between the route and the centered card (2026-09-15)

User feedback: the dashed line should **not hug the centered card**.

Measured before the change: the closest dash to the card sat **0px** from the card's box — a dash ended at (500, 324) against a card spanning x 493–787, y 228–591. Because the stamp is slightly rotated with scalloped edges, those dashes were not hidden behind the artwork; they poked out right at its edge, so the line read as glued to the card.

- `buildRouteDashes` now takes the card's box and **drops any dash whose sampled points fall inside it, expanded by a margin** of `14%` of the card's short side (clamped 30–56px). Nothing else about the geometry changes: same diagonal sine, same amplitude, same dash length.
- The card is measured from **`.case-poster-scene.is-stable .case-poster-feature` only**. The travelling stamps are scaled and offset, so measuring them mid-flight would drag the keep-out around; the box is cached in a ref and re-read when a move lands (`syncRoute()` is also called from the move's completion effect, which covers a resize that happened during a move).
- The build is keyed on the card box as well as the size, so a card that changes size (e.g. via a media query at the same viewport width) still rebuilds the route.

Measured after, minimum axis-aligned gap between any visible dash and the card's box:

| viewport | card | visible dashes | min gap |
|---|---|---|---|
| 1280×800 | 294×363 | 60 (was 79) | **55px** (was 0) |
| 1440×900 | 331×409 | 64 | 46px |
| 1024×700 | 236×291 | 46 | 40px |
| 900×600 | 228×281 | 38 | 58px |
| 768×1024 | 290×358 | 43 | 50px |
| 1600×560 | 236×291 | 64 | 46px |
| 390×760 | 199×246 | 29 (was 45) | 45px |

The keep-out is larger than the nominal margin because the dashes are discrete — the dash that would have sat at the margin is itself dropped, so the visible air is 40–58px at every size tested.

The replay of the page-change pass is unaffected by the smaller dash count: at 1280×800 the pens still advance symmetrically (`L=R` 2 → 5 → 8 → 11 → 15 → 19 → 23 → 28 → all) while the covers swap, and the centre reaches 0.32 → 0.85 → 1.00 as the move lands, holding at 1.00 with no second pass. The two pens now close at the card's edges, since the filtered array's middle is the gap itself.

Evidence frames: `cases-route-before-touching-card.png` (the 0px case) against `cases-route-card-clearance.png` (1280×800) and `cases-route-card-clearance-compact.png` (390×760). Superseded frames were removed from `outputs/`.

Suites: the 12 Cases tests pass with assertions added for the clearance constant, the keep-out build, the `if (grazes) continue;` drop and the stable-scene-only measurement. Full suite 84/85 and `npx vite build` compiles. Unchanged pre-existing items: `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` need the Codex-only `.openai/hosting.json`.

final result: passed

## Latest revision: the redraw runs WITH the page change (2026-09-15)

User feedback: the line currently **waits for the new case to take its place and only then draws**; the two should happen **synchronously**.

The cause was structural: `PosterRoute` gated the whole draw on `moving` (`draw = moving ? 0 : drawn`), so a page change could only ever *empty* the line, and the redraw was a separate pass that began 80ms after the 920ms move had already finished — roughly 1.5s from the click before the line was whole.

- **The page change's own clock now drives the pens.** The transition state carries a linear `time` (0 → 1) again and `PosterRoute` takes `move` instead of `progress`. `moveDraw = move^ROUTE_MOVE_CURVE` (exponent 1.5) turns that into the draw value, so the pens set off the instant the covers start swapping and close exactly as the new cover lands. Slightly front-loaded to pair with the cover's ease-out, but spread across the whole move so the two-sided drawing stays readable and the middle closes last.
- **Reduced motion keeps the line still.** `move` is only passed when `!transition.reduced`, so a reduced-motion page change never animates the route; the line simply stays complete.
- **Landing no longer replays the pass.** React batches the move's final `time: 1` frame together with `transition` clearing, so the settled value can never be read off the clock. A `moveWasActiveRef` records that a move was in flight, and the settled value is taken as complete (`drawn = 1`) once it ends; the intro effect's `drawnRef.current >= 1` guard then skips the intro pass. Verified: the line is whole at the moment of landing and stays whole (see the 933ms+ samples below).

Measured on 79 dashes at 1280×800 (dev server, agent-browser), all sampling while `.is-moving` was true:

| t after click | L | R | centre opacity |
|---|---|---|---|
| 0ms (before) | 79 | 79 | 1.00 |
| 72ms | 0 | 0 | 0 — instant empty, `is-moving` |
| 214ms | 5 | 5 | 0 |
| 502ms | 19 | 19 | 0 |
| 788ms | 38 | 38 | 0 |
| 861ms | 79 | 79 | 0.46 — frontiers meet |
| 933ms | 79 | 79 | 1.00 — move ends |
| 1005ms → 1648ms | 79 | 79 | 1.00 — no replay |

The whole pass now completes in ~900ms instead of ~1500ms, and every frame of it overlaps the cover swap. The intro pass on first arrival is unchanged (checked separately: 5 → 31 → 79, centre 0 → 0.62 → 1.00), and with `prefers-reduced-motion` the line stays at 79/79 with `is-moving` never true.

Evidence frames (dilated x16.7 so the 920ms move could be sampled; `performance.now`, `requestAnimationFrame` and `setTimeout` all scaled): `cases-route-sync-01-move-start.png` → `-02-move-early.png` → `-03-move-mid.png` → `-04-move-late.png` → `-05-move-closing.png` → `-06-settled.png`. `-04-move-late.png` is the clearest: the pink poster is still wiping out and the outgoing stamp still travelling, while both pens are already drawing inward with their translucent leading edges. Superseded frames from the previous revision were removed from `outputs/`.

Suites: the 12 Cases tests pass (assertions rewritten for the clock-driven draw: `const draw = moving ? moveDraw : drawn`, `move={transition && !transition.reduced ? transition.time : null}`, the `time` field on the transition, and the `moveWasActiveRef` hand-off). Full suite 84/85 and `npx vite build` compiles. Unchanged pre-existing items: `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` need the Codex-only `.openai/hosting.json`.

final result: passed

## Latest revision: instant vanish and two-sided inward redraw (2026-09-15)

User feedback: on a page change the line should **vanish instantly**, then **quickly redraw from both sides toward the middle**, and while it is being drawn its **opacity should be adjusted so it gradually becomes opaque**. This supersedes the retraction behaviour of the previous revision.

- **No more retraction.** `moving` (i.e. `transition !== null`) forces `draw = 0`, and the effect clears both the ref and the `drawn` state, so the line empties on the same frame the page change starts. Clearing the *state* as well as the ref removes a one-frame flicker in which the previous page's 69 fully-opaque dashes painted at landing.
- **One quick pass after the move.** The redraw is a single pass that starts 80ms after the 920ms scene transition ends: `ROUTE_REVEAL = 520`ms with ease `1 − (1−t)^2.2`.
- **Symmetric, two-sided.** `edge = Math.min(index, count − 1 − index)` measures distance from the *nearer* end, so the pens travel from both corners toward the middle instead of from the middle outward. `ROUTE_FEATHER` was raised 5 → 9 and the feather is added to the travel distance, so the last dashes still reach full length *and* full opacity exactly when the pass completes (previously the centre dashes capped near 0.11 opacity).
- **Opacity is adjusted while drawing.** `local` is how far past the dash the pen has travelled, in feather units; `length = local^0.72`, `opacity = ramp · local^1.35`, and `ramp = 0.3 + 0.7 · min(1, draw·1.9)` keeps the two freshly-drawn ends from snapping to full strength the instant the pens touch down.

Measured on 69 dashes at 1280×633 (dev server, agent-browser): full opacity at t=0 → **`visible 0`, `is-moving` at t=104ms** → the line stays empty for the whole 920ms move → `L=R=8` @1076ms (end opacity 0.52) → `L=R=19` @1148 → `L=R=29`, ends at 1.00 @1220 → the frontiers meet at the centre @1291 → the centre then ramps 0.04 → 0.49 → 0.96 → **1.00 between 1291 and 1507ms**. Compact 390×760 on 45 dashes behaves identically (`L=R=6 → 21 → 45`, centre reaching 1.00). Evidence frames: `cases-route-01-scene-mid-route-empty.png` (line gone during the wipe), `-02-redraw-early.png`, `-03-redraw-mid.png`, `-05-meeting.png`, settled `cases-route-two-sided-settled.png`, compact `cases-route-compact.png`.

Suites: the 12 Cases tests pass with assertions updated to the new semantics (the `moving` branch clears the ref *and* the state; the opacity now carries the global ramp). Full suite 84/85 and `npx vite build` compiles. Unchanged pre-existing items: `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` need the Codex-only `.openai/hosting.json`.

final result: passed

## Latest revision: route timing on the linear clock (2026-09-15)

User feedback: the diagonal line itself is right, but its appear/disappear timing is not — the disappearance reads as very fast. The measurement agreed: the retraction was driven by the eased `progress` curve (`1 - (1-t)³`), so `1 - progress·1.08` emptied the whole line by progress 0.926, i.e. **~534ms into a 920ms move**, and the reveal then started 140ms after landing and took only 720ms.

- The transition state now carries its own linear clock (`time`), and the route retracts on `1 - t^1.25 · 1.01`: a short hold, then an even pull-in that finishes exactly as the incoming stamp lands.
- The reveal starts 60ms after landing and runs 860ms, so retract and grow are near mirror durations (~920ms / ~800ms).
- Measured on 79 dashes: 75 → 69 → 61 → 53 → 43 → 33 → 23 → 13 → 3 → 1 over 100–1000ms, then 3 → 11 → 23 → 37 → 51 → 63 → 73 → 79 over 1100–1800ms.

**Related defect found while verifying.** The travelling stamps are disabled buttons, and the global `button:disabled { opacity: 0.55 }` out-specifies `.case-poster-feature { opacity: var(--stamp-opacity, 1) }`. Every in-flight stamp was therefore pinned at a flat 55%, which both suppressed the intended arrival/departure fade and let the shared route show through the stamp's face as if drawn on top. `.case-poster-feature:disabled` now honours `--stamp-opacity`, and the arriving stamp ramps 0.62 → 1 quickly so it is solid by the time it reaches the centre; the departing stamp fades 1 → 0.58 as designed.

Verification evidence: dev server `http://localhost:5174/#cases` in agent-browser at 1280×800 — sampled dash counts and computed stamp opacities through a full move, plus captured mid-transition frames showing the line retracting to the stamp's edges rather than crossing the artwork. All suites pass (12 cases tests, new assertions for the linear clock and the disabled-stamp opacity rule) and `vite build` compiles. Unchanged pre-existing items: the Codex-only `.openai/hosting.json` step in `scripts/prepare-sites-build.mjs` / `tests/sites-worker.test.mjs`.

final result: passed

## Latest revision: diagonal trigonometric route with center-out drawing (2026-09-15)

The yellow journey line was rebuilt as a real sine wave running along the screen diagonal — from the upper-left corner, behind the centered stamp, to the lower-right corner — mirroring the stamps' diagonal travel. User-reported defects this removes: the previous CSS `stroke-dasharray` line sat on a Bézier path stretched non-uniformly by `preserveAspectRatio="none"`, so dash lengths varied with the local slope, and its life cycle was a fade-out plus a hard mask cut that read as "disappears, then pops back complete".

- **Geometry.** `buildRouteDashes(width, height)` now generates the wave in real screen pixels (a `ResizeObserver` rebuilds it when the scene resizes), so every dash measures the same regardless of viewport aspect. Each dash is its own SVG path with `pathLength="1"`.
- **Appearance and disappearance are one function, reversed.** Each dash's visible length is `sin(clamp(draw·(center+1) − |i − center|, 0, 1)·π/2)` with a sine-eased driver: a settled scene grows the route OUT of the center (from beneath the stamp toward both corners); a moving scene pulls the same dashes back INTO the center. No fade, no mask cut, no pop-in.
- **One shared layer.** The route is no longer a child of the moving scenes. It renders once between the poster background and the stage, so the color wipe cannot cover it and the outgoing scene cannot drag it off-screen; z-order keeps it above both poster backgrounds and below the stamp, words, and peeks.

Verification evidence: `http://localhost:5174/#cases` exercised in agent-browser at 1280×800. Captured frames confirm the settled diagonal line passing behind the stamp, a mid-transition frame where only the center-most dashes remain as the line retracts under the incoming stamp, and a post-settle frame where the center is drawn while both corner ends are still growing outward. The 12-test Cases suite passes with assertions covering the shared-layer placement, the sine generator, and the center-out dash semantics; every other suite passes and `vite build` compiles. Still pre-existing and unrelated: `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` need the Codex-only `.openai/hosting.json`.

final result: passed

## Latest revision: reference-fidelity pass on the cases poster (2026-09-15)

A second look at the Monti Lessini reference (`work/reference-2026-09-15/`) produced four targeted upgrades to the `#cases` poster journey:

- **First-visit hero opening.** The reference video opens with the case artwork full-bleed before it shrinks into the centered stamp. `CaseArchive` now plays that sequence once per session (`caseIntroPlayed`): a `.case-poster-hero` overlay scales the active cover from full viewport to stamp size (scale 0.235 desktop / 0.52 compact, origin matched to the stamp center), crossfades into the real stamp at ~60–76%, while words, route, peeks, and chrome fade/slide in on staggered delays. Reduced-motion users skip the overlay entirely, and paging input is gated until the 1680ms intro finishes.
- **Display words restored to reference scale.** In the `data-tab="cases"` context the words now render at `clamp(84px, 12.4vw, 186px)` weight 900 (was 8.9vw/800), with the top word at `clamp(24px, 5dvh, 38px)` and the bottom word `clamp(22px, 4.2dvh, 42px)` from the edge — the reference's near-edge monumental rhythm without reintroducing the earlier header/credit collisions.
- **CASE LIBRARY becomes a postmark pill.** The centered library button now carries the poster background with an inset ring, so it stays legible where the enlarged top word passes beneath it — the same trick postal cancellations use on stamps.
- **Route dashes match the reference.** The journey line is now 5.5px with rounded caps and a 1.05/1.15 dash-gap rhythm (was 4px butt-capped 0.48/1.55), and the corner peeks show slightly more of the neighboring stamps (previous translateX -50%, next 60%).

Verification evidence: local dev server `http://localhost:5173/#cases` exercised in agent-browser at 1280×633 and 390×760. The intro plays fullscreen→stamp→settled; wheel paging moves 01→02 with the diagonal stamp journey, retracting route, and right-to-left color wipe intact; open/return preserves the carousel position; the compact layout keeps the monument words, stamp, and pill legible. The 12-test Cases suite passes (the route assertion now pins the intentional `stroke-linecap: round`), all other suites pass, and `vite build` compiles. Pre-existing, unrelated: `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` require the Codex-only `.openai/hosting.json`, which does not exist in this checkout.

final result: passed

## Latest revision: primary case preservation (2026-09-15)

The featured `#cases` journey again begins with its original six editorial projects — Aiquos Identity Refresh through Modular Sound Archive — and appends Wing It, 超级马里奥, 日式便利店, and 暴风雨海盗船 as positions 07–10. This keeps the prior work visible in the main interactive route while retaining the complete 36-item CASE LIBRARY. All ten stamps stay media-light: the original projects use their existing local artwork and the four real projects use source-derived WebP stills; only opening a real project creates its playable media. Original featured cards still open the established editorial detail and return to the same carousel position.

Verification evidence: a clean local preview opened at `01 / 10` with Aiquos Identity Refresh and `/assets/cases/1.webp`; its detail used the existing editorial view and returned correctly. Paging reached Wing It at `07 / 10` with its static `/assets/case-covers/wing-it.webp` stamp. The stable primary route reported zero poster videos, iframes, and nested case screens; opening Wing It created one detail video, and closing it removed that media while retaining `07 / 10`. The 12-test Cases suite, direct Vite production compilation, and `git diff --check` pass with no browser console errors.

final result: passed

## Latest revision: deferred case media with static postage covers (2026-09-15)

The featured postage interface no longer mounts live project media. Each of the four real homepage projects now has a source-derived 640×480 WebP cover under `public/assets/case-covers/`: a Wing It character frame, a playable Mario level frame, the rainy conbini front view, and the ship inside the storm scene. The complete project video/iframe is instantiated only after the centered stamp is opened and is disposed when the user returns.

Performance baseline before the change: the stable postage screen mounted three `CaseScreen` trees at once — two scene iframes, one video, and three media layers. Acceptance target after the change: zero `.case-poster iframe`, zero `.case-poster video`, and zero `.poster-stamp .case-screen` instances before opening a case; exactly one detail media surface after opening; all four still covers and the established zoom/route interaction remain visually intact.

Verification evidence: the local in-app browser rendered the Wing It and conbini cover states at the 640×480 inspection viewport while reporting `posterIframes: 0`, `posterVideos: 0`, and `posterScreens: 0`. Opening Wing It created exactly one detail video; opening the conbini created exactly one ready detail iframe. Returning from each detail removed all detail media and restored the same carousel position. The four local covers total approximately 112 KB, compared with the previously mounted video plus two running scene documents. A clean reload, paging, video open/back, and scene open/back run produced zero new console warnings or errors. The 12-test Cases suite, direct Vite production compilation, and `git diff --check` pass.

final result: passed

## Latest revision: real homepage cases inside the Cases journey (2026-09-15)

The featured `#cases` carousel now reads directly from the shared four-case manifest used by the homepage: Wing It, 超级马里奥, 日式便利店, and 暴风雨海盗船. The perforated stamp window renders each local video/scene live instead of showing an unrelated archive photograph, while the source-matched diagonal zoom, color wipe, and retracting dashed route remain intact. Opening a stamp now expands into the actual full-viewport case media and provides a clear return to the same featured position. The 36-item editorial collection remains available through CASE LIBRARY with its original library-return behavior.

Verification evidence: `http://127.0.0.1:4286/?build=bb5bf4a-live-cases#cases` was exercised in the in-app browser. The complete 01–04 sequence rendered live frames for Wing It, 超级马里奥, 日式便利店, and 暴风雨海盗船; the latter two WebGL scenes did not fall back to black. Wing It and 超级马里奥 were each opened full-screen and returned to the same featured position; Wing It retained its detail-only sound control. CASE LIBRARY exposed exactly 36 rows. A compact-layout regression that allowed the hidden design canvas to scroll and reveal a pink strip below non-pink posters was corrected with a cases-only clipped canvas. A clean reload/open/back/page run produced zero new console warnings or errors. The 11-test Cases suite, direct Vite production compilation, and `git diff --check` pass.

final result: passed

## Latest revision: scroll-driven cases archive (2026-09-15)

Source visual truth: the captured Xiaohongshu reference video at `https://xhslink.cn/o/53M3sViTXOx`, inspected as a 10.66-second sequence. Accepted local evidence is in `work/reference-2026-09-15/`: `hero-motion.jpg` documents the full-screen-to-stamp close motion, `list-motion.jpg` documents the diagonal carousel journey, and `frame-09-content.jpg` / `frame-10-content.jpg` are normalized motion/stable frames with the Safari chrome removed.

Implementation evidence: local route `http://127.0.0.1:4286/?build=bb5bf4a-cases#cases`, captured in Codex's in-app Browser. The browser screenshot API rendered the implementation inline in the same comparison inputs as `frame-09-content.jpg` and `frame-10-content.jpg`; that API does not expose a filesystem persistence path, so the evidence is identified as in-app Browser tab 3, stable and 330ms transition captures. The comparison viewport was 720 × 484 CSS px at devicePixelRatio 1. Source frames were cropped from 720 × 540 to 720 × 484 at density 1, so no resampling or density normalization was required.

**Comparison history**

- P2 resolved — the first implementation placed the title/card too low beneath the product header and clipped the lower display word. The cases-only header was reduced to the reference's restrained scale, the display/card geometry moved upward, and the lower word/credit line were separated. The post-fix 720 × 484 stable comparison preserves the source hierarchy: corner peeks, centered stamp, large top/bottom words, left route, and bottom microcopy.
- P2 resolved — the first motion pass used the overshoot value for travel, causing the outgoing stamp to leave too early and the incoming stamp to appear centered too soon. Travel now follows monotonic scroll progress, while scale alone keeps the elastic overshoot. Diagonal travel was recalibrated from 54vw/43vh to 42vw/35vh. The post-fix 330ms comparison shows the outgoing stamp enlarged at upper left, the incoming stamp arriving from lower right, and the background seam at roughly the same quarter-width position as the source.
- P2 resolved — the first route model treated the line as either fully present or fully absent. Frame 09/12/14 inspection shows a third state: while the current stamp grows toward the upper-left, the existing route retracts from its featured-card end into a short tail. The moving outgoing scene now owns that progressively shortened path; the incoming scene owns none, and the settled scene restores the complete path.
- P2 resolved — repeated keyboard events could queue several destinations while the 920ms scene was moving. Repeat keydown events are now ignored, while one intentional input received during movement is retained instead of being lost. A full reload plus one ArrowDown press finished at `02 / 36`, not a later case.
- P2 resolved — the route previously revealed a raster with a horizontal `clip-path`, then briefly used round dots that did not match the source. It is now a native SVG Bézier path with small yellow rectangular dashes. A path-following mask controls how much of the old route remains during movement, so there is no vertical crop edge or half-dash drawing head.
- P1 resolved — an embedded-browser rAF could deliver one timestamp slightly earlier than `performance.now()` and then throttle subsequent frames, leaving the page permanently in MOVING with negative progress. Progress is clamped to 0…1 and every transition has a duration-bound completion fallback; the final browser test moved 01→02 and returned from MOVING to the settled route.
- P2 resolved — the featured stamp could shrink to roughly 83px wide in the short embedded-browser viewport because its width was capped at `40dvh × 0.81`. The revised responsive constraint allows 64dvh in compact layouts and a 23vw desktop target while keeping the stamp inside the viewport. Final measured results were 248 × 307 at 1080 × 720 and 193 × 239 at 379 × 631.

**Required fidelity surfaces**

- Fonts and typography: the existing DM Sans family is retained; oversized uppercase words use the source's heavy, tightly tracked display rhythm. Small index/navigation/meta copy uses 9–11px uppercase optical weights. Long project names truncate inside the stamp and remain fully readable in the immersive detail.
- Spacing and layout rhythm: the stable composition matches the source's centered small stamp, cropped upper-left/lower-right neighbors, top/bottom word anchors, and sparse edge labels. The reference's diagonal scale path and right-to-left color reveal are preserved at desktop and compact sizes.
- Colors and visual tokens: six muted poster palettes retain the blue/pink/green/red family from the source. The color wipe is a real moving layer rather than a direct token swap.
- Image quality and asset fidelity: the perforated frame and grain are real local raster assets. The route is now a native SVG path because progressive curve tracing requires vector stroke semantics; project photographs remain local WebP files with cover crops.
- Copy and content: the reference-style journey is intentionally curated to six projects. The separate CASE LIBRARY retains all 36 real titles, tags, years, descriptions, and local images without diluting the primary sequence.

**Interaction and accessibility checks**

- Real wheel scrolling, explicit previous/next buttons, Arrow/Page/Space keys, touch swipe, mouse/pen drag, tappable corner stamps, the six-item featured sequence, shared-element open, close/back, and scroll-position restoration were exercised. The separate library exposed 36 rows; opening item 07 produced FIELD RESEARCH ATLAS, and 返回 restored the CASE LIBRARY rather than dropping the user at the featured carousel.
- The route is complete while settled, retracts continuously during MOVING, and returns complete for the next featured case. The wheel gesture latch prevents trackpad inertia from skipping multiple cases.
- Buttons have labels and focus states; Escape closes the index or detail. Hover lift/tilt is gated to fine pointers. Reduced-motion users receive a 180ms non-spatial crossfade for case changes, a 1ms shared transition, and a non-animated visible route.
- The final browser run added no console error. One earlier hot-module-reload frame logged the now-removed `ArrowRight` reference while JSX was mid-edit; subsequent full reloads and interaction runs completed without a new error.

**Residual P3 differences**

- The existing AIQUOS product navigation remains visible above the archive instead of reproducing the reference site's browser/header chrome. This is an intentional product-system adaptation.

Automated verification: 83 non-hosting tests, direct Vite production compilation, `git diff --check`, and the 11-test Cases suite pass. The suite includes regression checks for route retraction, wheel-independent paging, curated/library separation, library return origin, and rAF-throttle completion. The repository's pre-existing Sites packaging test is not part of this cases change and currently lacks `dist/server/index.js` because `.openai/hosting.json` is absent in this checkout.

final result: passed

## Previous revision: readable streamed conversation feedback (2026-09-04)

Source truth: the supplied post-reply conversation screenshot at `/var/folders/xd/w7bm0l8j6dlf_y7pgh5s1qsr0000gn/T/TemporaryItems/NSIRD_screencaptureui_k8ZFX0/截屏2026-09-04 01.57.44.png`. It establishes the violet category field, untouched white TEST!/guide art, large white conversation surface, dark high-contrast Chinese heading, conversational left/right rhythm, and a persistent lower composer after an AI reply arrives.

Implementation: the conversation route alone now uses the reference panel geometry at desktop (`min(84.4vw, 1120px)` × `min(72dvh, 632px)` with the same proportional top interval). The bundled Noto Sans SC face replaces the prior Latin-first treatment for Chinese UI copy. The title, messages and composer are larger and darker; the final streamed response receives a distinct, still restrained, pale-category feedback surface. The message list has a bounded scroll region, and a ref-driven update follows the newest streamed reply so it stays visible above the fixed composer instead of creating a broken blank/overflow state.

**Live interaction verification**

- A real DeepSeek reply was requested from `#assessment/conversation/level/2`. The final assistant bubble was tagged `is-feedback`, the completed composer changed to the next-level action, and the feedback bubble remained visible after automatic scroll (`scrollTop: 841`, `scrollHeight: 1186`, `clientHeight: 310` on the narrow in-app preview).
- The in-app browser produced no console warnings or errors during this reply-state check.
- The available in-app automation surface is a 304 × 625 narrow viewport and cannot be resized to the supplied 1327 × 877 desktop reference. Its captured responsive evidence is `design-qa-assets/conversation-feedback-mobile.png`; it verifies safe scrolling and no composer collision, but is not misrepresented as a desktop pixel comparison.
- `npm run test:sites` and `npm run build` both pass after the typography and streaming-layout change.

The project-level result remains blocked only by the previously documented external Ark image-endpoint DNS verification, not by this conversation UI revision.

## Latest revision: DeepSeek conversation and weekly-report Agent task (2026-09-04)

Source truth: the provided task screenshot at `/var/folders/xd/w7bm0l8j6dlf_y7pgh5s1qsr0000gn/T/TemporaryItems/NSIRD_screencaptureui_b0qauq/截屏2026-09-04 01.21.29.png` governs the first practical task's content: a prompt must retain the original spoken report, produce a 250–400-character formal weekly report in three named sections, retain key figures and not invent facts. The supplied orange practical task reference remains the visual-shell source: its pure orange field, TEST! title, five-node progress trail, guide overlap, one large white panel, two work areas and bottom composer.

Implementation evidence: browser capture `design-qa-assets/implementation-practical-agent.png` (1280 × 720, in-app browser CSS viewport 1280 × 720) shows the live completion state after an Agent result. The pre-existing orange visual reference is `design-qa-assets/reference-practical.png` (1672 × 941); both are 16:9 and compared after scale normalization in `design-qa-assets/deepseek-practical-compare.png`. Focused review used the live left task brief, output pane and bottom composer because those contain the new workbench affordances.

**Findings and corrections**

- P1 resolved: the prior generic checkbox list did not give a player enough task context. It is now a compact delivery-standard card with exact length, structure, factuality and data-retention constraints, plus an on-demand source-report view.
- P1 resolved: the previously empty Agent pane now presents its generating state, streamed output and a completion action without altering the orange reference shell or adding dashboard chrome.
- P2 resolved: the conversation screen sends real locally-entered content to the server-only DeepSeek proxy and streams the answer into the final chat bubble. Loading, error and next-level states remain visible and operable.
- P3 follow-up: final AI output length naturally varies with a player's prompt. The result pane scrolls instead of resizing the fixed reference panel.

**Required fidelity surfaces**

- Fonts and typography: TEST! remains the local source-derived artwork; added task labels use the existing DM Sans hierarchy, with a restrained 12–14px operational scale.
- Spacing and layout rhythm: the first practical task preserves the fixed wide panel, two-column interior and full-width lower composer from the orange reference. The detailed task material is contained in its original left-hand work area.
- Colors and visual tokens: orange page tokens, white panel, pale orange borders and white guide line art remain unchanged; generated output uses existing neutral copy colors for readability.
- Image quality and asset fidelity: no image assets were replaced or newly approximated. The retained white guide artwork remains clean over the panel.
- Copy and content: the original report and its non-invention/three-section constraints are passed as task context. Agent output is the actual model result, not a simulated placeholder.

**Interaction checks**

- Browser test: a conversation reply received a streamed DeepSeek response; the screen exposed the next-level action afterward.
- Browser test: the weekly-report Agent accepted a structured prompt, streamed a 373-character result and exposed the completion action afterward.
- Browser console: no warnings or errors after both live requests.

**Image-generation verification blocker**

- The image-enabled second practical level is wired to the supplied Ark/OpenAI-compatible endpoint and exact `doubao-seedream-5-0-pro-260628` request contract. It has a validated server proxy, URL result handling, loading/error state and image-result surface. The vendor credential remains server-only under `ARK_API_KEY`.
- Direct endpoint verification is blocked in this runtime: three attempts from the local server failed before a response, and a direct reachability check timed out during DNS resolution for `ark.cn-beijing.volces.com`. Text generation was separately verified end-to-end with the selected `deepseek-v4-flash-vision-exp` model.
- This is an external network/DNS blocker rather than a visible UI or request-shape mismatch. Before production handoff, run one image task from a host that can resolve the Ark endpoint and confirm a URL renders in the right-hand work area.

final result: blocked

## Latest revision: high-fidelity objective, conversation and practical task screens (2026-09-04)

Source truth: the three supplied 1672 × 941 references for objective green, conversation purple and practical orange. They establish the shared geometry: white TEST! art at the upper left, a five-node progress counter at the upper right, one large white rounded panel at approximately x=272, y=249, w=1117, h=632, and the two-character white guide artwork overlapping the panel's upper edge.

Implementation evidence: `design-qa-assets/implementation-objective.png`, `design-qa-assets/implementation-conversation.png` and `design-qa-assets/implementation-practical.png` at the available 1280 × 720 in-app browser viewport. References and implementations are normalized into paired columns in `design-qa-assets/compare.html`; `design-qa-assets/compare-final.png` is the final combined review capture. The two viewport sizes have the same 16:9 composition to within one pixel after normalization.

**Findings and corrections**

- P1/P2 resolved: the former generic content cards were rebuilt into the three reference-specific structures. Objective now has four full-width pale rows, selected-row outline and one circular action; conversation has the reference's left/right/left message rhythm and wide bottom composer; practical has the reference's two-column workspace and wide bottom composer.
- P2 resolved: the guide raster's bright green matte no longer leaks into green, violet or orange pages. The original local artwork is retained and chroma-keyed on a same-origin canvas, preserving its white strokes and transparent edge instead of approximating it with CSS or SVG.
- P2 resolved: category backgrounds now have distinct center glow and deeper perimeter tones matched to each reference, while the central panel scale, corner radius, title/progress placement and lower action positions follow the shared reference geometry.
- Remaining difference is P3 only: the references use abstract skeleton bars while the working prototype shows readable Chinese tasks and live controls. This is the intentional functional content layer; it does not change the reference's shell, density or interaction hierarchy.

**Interaction verification**

- Objective: choosing an answer sets the radio state and enables the circular submit control.
- Conversation: entering a local test response adds the user bubble; the same circular control advances only after sending.
- Practical: selecting a plan step or entering an instruction enables the Agent action.
- Reduced-motion support remains in place, and the mobile layout keeps the full content in document flow.

**Automated verification**

- Theme tests cover all five stages plus category glow/deep tokens.
- Component tests cover the real local guide asset, matte removal, chat rhythm and Agent work surface.
- Production build, complete Node test suite and Sites packaging test pass in the final tree.

final result: passed

## Latest revision: five-stage assessment map and task surfaces

Source visual truth: the user-selected task-screen mock at `/var/folders/xd/w7bm0l8j6dlf_y7pgh5s1qsr0000gn/T/codex-clipboard-ea2b09ba-0e25-4eaf-bcce-7a71a1f7f5a6.png` (1672 × 941). Its governing anatomy is the pure category-color field, local white TEST! artwork in the upper left, five-node progress trail in the upper right, a single white rounded work surface, and two small IP guides peeking over that surface.

Implementation evidence: local route `#assessment/conversation/level/3`; in-app browser capture `/private/tmp/aiquos-assessment-mobile-final.jpg` (312 × 610 CSS pixels at the current narrow browser surface). The reference and an earlier normalized implementation capture were placed in one comparison image at `/private/tmp/aiquos-assessment-comparison.png`. The in-app browser could not maintain a larger requested viewport and reset to the active narrow surface, so the responsive narrow rendering—not a false 1:1 desktop screenshot—is the final browser evidence.

**Findings**

- No actionable P0/P1/P2 issue remains in the implemented task shell at the available browser viewport. The responsive version preserves the fixed hierarchy: pure full-screen color, wordmark, five-node trail, one central panel and the two generated IP guides. It intentionally scrolls vertically on a narrow portrait browser so controls remain reachable.
- The selected artwork uses a different orange task/color example from the purple conversation route; this is intentional category theming. The same panel structure, scale relationship, white wordmark and small companion placement are retained.

**Required fidelity surfaces**

- Fonts and typography: TEST! remains the supplied source-derived canvas, not an approximate font. DM Sans is used for readable Chinese task copy, with the task title, response areas and primary action retaining a compact hierarchy.
- Spacing and layout: desktop rules use a 66.8vw central panel and separate header corners; narrow screens swap to one full-width panel with all task controls in document flow. A compact-height pass reduces options, padding and action height so a 16:9 desktop surface does not clip the primary control.
- Colors and tokens: blue, green, violet and orange are solid full-page category tokens; panel surfaces stay white, with only pale category tints inside interactive states. No dark canvas, sidebar or additional dashboard cards were introduced.
- Image quality and asset fidelity: `public/assets/assessment-guides-crop.png` is a generated original line-art guide pair with its chroma backdrop removed; it is a real local raster asset, not CSS/SVG art. The paired characters retain sharp white outlines at their intended small scale.
- Copy and content: all four modes have coherent Chinese prompts. Blue comprehensive assessment runs objective → conversation → Agent tasks across five levels, rather than reverting to a static three-icon summary.

**Interaction checks**

- The selection cards open their own map routes. A map level opens its corresponding task and returns to the map with the next level unlocked after completion.
- Browser check: a conversation reply was entered and sent; “确认下一关” became enabled; completing it returned to `#assessment/conversation` and unlocked level four.
- Browser check: selecting an objective answer enabled “提交答案”; entering an Agent instruction enabled “运行并继续”.
- Browser runtime logs stopped adding errors after the React key-prop warning was corrected.

**Implementation checklist**

- [x] Five-stage maps for all four assessment types
- [x] Working objective, conversation and practical interaction states
- [x] Blue comprehensive route mixes all three interaction modes
- [x] Original local IP artwork and reduced-motion-safe entrance motion
- [x] Production build and automated regression suite

final result: passed

## Latest revision: case startup, buffering, and full-bleed media

Scope: make the first homepage reveal wait for the three initially visible real cases; remove the pixel pirate from every carousel group; retain the prior frame while any replacement is still warming; and remove Wing It/Mario letterboxing inside the cube displays.

Implementation checks: the initial screen IDs are collected from the first three face configurations. The home canvas remains visually withheld until every one reports a decoded video frame or two rendered scene frames. Only then does the next group mount as a preload. The existing two-layer buffer continues to keep the shown layer above a pending layer until readiness, including a recoverable error state. Wing It now uses `object-fit: cover`; Mario's showcase canvas is a full-viewport cover surface. The manifest contains four cases only, without `pirate-pixel`.

Verification: production compilation passed. The complete automated suite passed (45 tests), including new checks for four-case rotation, boot-gated preload ordering, and the two full-bleed media rules. No browser visual run was requested for this performance-focused update; runtime frame timing and network throughput remain device-dependent and are not claimed as benchmarked.

## Latest revision: demo login form inside the front screen

Implementation checks: passed. This scoped form addition was checked through rendered markup, submission-unit tests, routing source checks and production compilation; no new browser visual QA was performed in this pass. Earlier screenshot comparisons below describe the preceding shell/rotation revisions, not a screenshot-verified form.

Scope: account and password inputs, show/hide password, and a login submit button in the pale-pink front display. The form mounts only when rotation has settled. Blank input is accepted, native validation is disabled, and submission clears the fields and enters the existing TEST! assessment screen. No request, credential read, credential storage, or authentication was added. Existing source materials, 900ms turn, preloaded cases and assessment artwork remain unchanged.

Layout: the form cancels the screen canvas's horizontal/vertical scale to preserve native 16px text and 44px inputs/button. The screen slot is 461.39 × 393.42 CSS px on desktop, 276.84 × 236.05 at 390 × 844, and 219.16 × 186.88 at 320 × 568. Container-size rules compact spacing and secondary copy; very short landscape slots scroll internally rather than hiding controls. Keyboard submission uses a native form; account/password have accessible labels and password visibility has a labeled toggle. Navigation focuses the assessment heading after submit, and the hidden cube stays flat/paused until returning home.

Checks: server-rendered form markup, empty submission, reset-before-navigation ordering, absence of credential reads/storage/network code, inverse scaling at five sizes, and connection to the existing assessment route. Existing tests retained. Final build and all 40 tests passed. The established local preview/hosting configuration is preserved; no publication or backend changes were requested or performed.

## Historical revision: fast cube-to-plane entry and preloaded cases

final result: passed

Latest scope supersedes the earlier direct login-to-assessment route: delete the content-editing Studio and its entry points; turn the existing cube into one front-facing surface before any future login UI. Do not add the form yet. User then requested faster/smoother motion, better corners, pale-pink faces with all case animation stopped at the start, and next-case preloading without black transitions.

Implementation: original shell photo is unprojected into three material maps and follows shared, calibrated yaw/pitch geometry. Start screen coordinates remain exactly the original reference. At completion only the right face has projected area and its inner screen is axis-aligned. Moving/centering share a 900ms cubic ease-out; inactive face content is hidden immediately and both visible media and staged media are paused. Source silhouette alpha removes background wedges; lower corner calibration excludes the photographed base fragment, and the final face has rounded clipping. No new login fields or authentication added; TEST! assessment page is retained separately.

Evidence: `../../work/cube-front-reloaded.png` documents the initial front-facing implementation; `../../work/cube-turn-fast-start.png` captures the latest normal-speed turn at progress 0.1052, with three pale-pink faces and no playing media. `../../work/cube-front-final.png` captures the refined material/blank-screen result; `../../work/cube-flat-phone.png` is the mobile check. Latest startup check read all six content layers playing=false, video paused=true, and all three screen backgrounds RGB(251,225,236). End check: progress=1, only right visible, route=login, busy=false. Return: progress=0, video resumes from its retained time, and three visible cases restore.

Corner/geometry verification: tests check all shared edges at 101 progress samples, source-coordinate equality, material-map round trips, final axis alignment and centered/in-bounds panel sizes. No opening between faces is introduced by their movement. Shading is still source-photo shading, not physically relit 3D; minor material lighting variation is a P3 limit, not a seam.

Case preloading: each face uses a two-layer buffer. Staged scenes render two real frames and then pause; staged video decodes and stays paused. On readiness the current frame crossfades with the prepared frame over 200ms, then the old layer is released. Unprepared manual jumps keep the current content until the requested frame exists. Readiness acknowledgements validate the sending iframe. Tests cover preload/current/crossfade/manual-jump layer selection and a two-layer cap. The original 15-second showcase cadence is unchanged.

Browser checks: all next-layer ready flags were true before switching; Wing It/Mario/conbini switched to Mario/conbini/pirate, then to conbini/pirate/pixel with zero visible loading overlays. Current video readyState=4 and playing; staged video readyState=4, paused at time 0. Root case-layer count stays at six. Studio markup/triggers are absent. Source case files remain unchanged outside the scoped embed bridge.

Visual comparison: source-based rest geometry and material continuity were reviewed with the supplied cube art and the existing home/turn captures. Intentional differences are removed editing triggers and pale-pink content during login rotation. The in-app browser's 1.9 capture scaling persisted intermittently; affected screenshots are detail evidence, not standalone pixel-identical/fullscreen claims. Actual DOM measurements at CSS 1536 × 1024 give cube transform identity and right-screen bounds matching the original reference. Source/header type and home layout were not redesigned. The earlier stable DPR-1 source comparisons remain applicable at rest.

Final build and all 36 tests passed. No browser console warnings/errors observed during the case/rotation verification. No remaining P0/P1/P2 issue found in this scoped pass. Full cross-browser/real-device frame-time benchmarking is not claimed. Preview remains local; no deployment.

Final combined comparison inputs: `../../work/cube-home-source-comparison.png` places original reference and final resting homepage side by side at the same 1536 × 1024 CSS layout, normalized to 808 × 539 image pixels to match the browser capture's 1.9 scaling. Shell position, screen corners and source lettering align; copy, cases, deleted statistics/editor stars intentionally differ. `../../work/cube-front-corner-comparison.png` compares the earlier front material against the refined pale-pink front at matching face size, confirming removal of the protruding base fragment and a continuous rounded edge. Both combined images were opened and inspected. Phone final DOM at 390 × 844: panel x=27,y=305.45,w=336,h=283.73, page dimensions exactly equal viewport, progress=1; no clipping or overflow. The final source archive includes these code changes, not browser debug flags in the preview URL.

## Historical revision: assessment screen, TEST! wordmark, card-aligned transition

final result: passed

Scope: add the user-requested second screen, replace its old heading with the latest supplied TEST! art, and refine the three-band transition so no horizontal seam crosses an assessment card. Existing homepage, real cases and independently editable displays remain intact.

Source truth: `public/assets/assessment-reference.png` (1672 × 941), `public/assets/test-wordmark-reference.png` (1862 × 845), and the explicit follow-up to keep the whole card row intact. Final desktop evidence: `../aiquos-assessment-preview.png`. Focused source/prototype comparisons inspected together: `../../work/assessment-type-comparison.png` and `../../work/test-wordmark-comparison.png`. TEST! retains the supplied letter contours, proportions and spacing; only the dark matte is removed. It is source artwork, not an installable font.

Required fidelity surfaces:
- Typography/assets: the four source illustrations and original Chinese/English labels remain unchanged. TEST! is a transparent, source-derived 822 × 244 canvas fitted proportionally into a 633.344 × 188 desktop slot. No approximate lettering or replacement illustrations.
- Spacing/layout: at 1672 × 941, card rectangles exactly match source coordinates: (81,343,363,420), (465,343,355,420), (841,343,357,420), (1220,343,363,420). Heading y=122 to 310; document equals viewport. Phone uses a two-column grid, as no phone reference was supplied.
- Colors/surfaces: source card lighting retained; near-black page, quiet return control, subtle hover/focus/selected states. Browser capture color conversion and simplified background grain remain minor P3 fidelity limitations.
- Content/behavior: login is a prototype navigation control, not authentication. All four cards support real single-selection state and accessible labels; questions and scoring remain out of scope.

Iterations and corrections:
1. Initial desktop card positioning was several pixels off. Restored exact source widths and gaps and shifted the grid to the source anchor. Original card typography preserved through source image crops.
2. Latest user feedback: equal-height transition thirds cut through the assessment cards (P2). Removed equal-third cuts. Both seams are now measured from the whitespace around the entire card group. At reference size they are y=326.5 and y=779.5, leaving the full y=343–763 card row in the middle band. Incoming and outgoing pages share these cuts; return uses the same assessment geometry before hiding it.
3. Phone verification at actual CSS viewport 390 × 844: TEST! rectangle x=46.80,y=106,w=296.40,h=87.98; cards span y=225.97–626.58 in two rows. Measured seams y=209.97 and 642.58 preserve both rows. Document dimensions 390 × 844, no overflow.

Transition verification: `../../work/assessment-card-aligned-return.png` and `../../work/assessment-card-aligned-phone-transition.png` capture real in-progress movement in development-only slow preview. DOM inspection confirmed six visual strips, identical incoming/outgoing clip boundaries, top/bottom traveling together and middle traveling oppositely. Desktop inspection at the later zoomed CSS viewport 880 × 495 found seams 171.842 and 410.263, surrounding card bounds 180.526–401.579. Phone inspection confirmed middle clip inset(209.971px 0px 201.422px). No card crosses either seam. Source canvas/video frames and explicitly returned WebGL snapshots are copied; animation does not create live duplicate game frames.

Capture limitation: the in-app browser changed to 1.9 device scale during this pass. Later captures include a scaled composition inside the output buffer; these are used only to inspect seam continuity, not as pixel-alignment/fullscreen evidence. The stable DPR-1 desktop capture and live DOM measurements above are the layout evidence. The focused TEST comparison shows no matte rectangle or distorted glyphs.

Checks: normal login and return, selected-card state, focus restoration, cleanup of transition overlays, pause of hidden homepage media, direct assessment entry, phone layout and reference layout. Reduced-motion skips movement. Resize finishes running strips; repeated navigation is locked. Production build and all 28 tests passed, including explicit desktop/phone seam safety cases. Final normal-speed browser check has no warnings/errors. Preview query and viewport override reset for handoff. No deployment performed.

No remaining actionable P0/P1/P2 findings for this scope. Extremely short windows may scroll; visible card content stays in the middle band and offscreen bands can collapse at viewport edges. Full cross-browser/assistive-technology and real-device GPU audits were not performed.

## Historical revision: AI capability positioning and quieter case labels

User scope: update left-side copy to describe an AI-usage ability testing website; retain the useful title/description on each screen but make it less visually intrusive. No assessment/scoring implementation was requested.

Source truth for this scoped pass: `../../work/copy-captions-before.png`, the existing prototype immediately before the edit, plus the user's requested changes. Implementation evidence: `../../work/copy-captions-desktop.png` (also copied to `../aiquos-preview-refined.png`). Both are 1536 × 1024 screenshot pixels at the same CSS viewport / DPR 1, first case selected and rotation paused. They were opened together for full-view comparison; live video/game frames naturally differ in time. Focused comparison: `../../work/copy-captions-detail.png`, aligned 610 × 165 crops stacked before / after, opened and inspected.

Required surfaces:
- Typography: new Chinese three-line hero retains the existing 42px/600 hierarchy, with adjusted line height and spacing; concise 17px supporting text. Phone headline 30px and supporting text 12px remain separated from the right controls.
- Layout: original wordmark, cube geometry, viewport anchoring, navigation and carousel unchanged. Labels are content-width (121–177px in the first case) instead of spanning 460–600px. Existing in-screen lower-left position retained.
- Colors: no status dot or border; backing opacity reduced from 85% to 30% with a localized blurred/dimmed backdrop and subtle text shadow. White titles remain identifiable without the full-width black stripe.
- Assets: original case video, game and 3D scenes untouched; no new artwork introduced, and a larger part of each case is visible.
- Copy: hero now says “AI 时代，你的实力到哪一步？” and describes real tasks, prompting and creating finished work. CTA “探索案例” starts the real case carousel; no false claim of a working test or score.

Responsive/interaction evidence: `../../work/copy-captions-phone.png`, 390 × 844. Document equals viewport; copy x=27.3 to 207.3, right-side stars x=323 to 365; copy/CTA bottom 753.7. No overlap or scroll. CTA tested: first case selected, rotation running, no editor dialog opened. Existing audio control retained with keyboard focus and hover feedback. Console check returned no errors/warnings. Production build and all 22 tests passed.

Findings: no actionable P0/P1/P2 issues from this comparison. No further visual iteration required. Historical body-font and simplified background-lighting P3s are unchanged. Real assessment flow/scoring remains outside this edit. Browser viewport override reset and running preview retained.

Latest copy/caption revision final result: passed

## Historical revision: real case carousel, statistics removed

Scope: remove the entire 50k+/120+/98% footer and 10k+ social-proof block; rotate the user's actual case projects across the cube. Preserve the previously verified viewport layout, source wordmark, product shell and independent content editor. This section supersedes the historical checks below wherever the intentional content changes differ.

Source visual truth: `public/assets/aiquos-reference.png` (1536 × 1024), plus the user's explicit deletions and real-case replacement instructions. Implementation: `http://127.0.0.1:4286/`. Final capture: `../aiquos-preview-cases.png`, 1536 × 1024 pixels / CSS viewport, DPR 1. Source and final screenshot were opened in the same comparison input. Screen content is intentionally different; shell and surrounding design were compared at identical coordinates, not judged as missing original widgets.

### Findings and iterations

1. `../../work/cases-desktop-a.png`: P1, Mario showcase controller referenced a nonexistent collision helper, preventing animation updates. Fixed to use the original game's `tileSolid` helper. Post-fix `cases-desktop-b.png` visibly shows Mario jumping, scrolling scenery and the timer advancing; final screenshot confirms later scenery. Console's retained errors end at 07:18:37 UTC before the correction/reload, with no subsequent errors observed through final verification.
2. Same initial capture: P2, the source-derived shadow patch included the old raster carousel dots, leaving ghost dots above the new controls. Trimmed the patch to end at the cube base. `cases-desktop-b.png` and final capture show only the new five-dot carousel.
3. Mobile controls require more space than the former four dots: reserved 88 px below the cube before placing the copy. `../../work/cases-phone.png` at 390 × 844 confirms carousel bottom 534.75, copy top 543.75, copy/CTA bottom 746.53. Document and viewport are both 390 × 844 with no overflow or overlap.

Final full-view comparison: source alongside `../aiquos-preview-cases.png`; focused side-by-side comparison: `../../work/cases-cube-comparison.png` (two aligned 650 × 600 crops, source left / implementation right). Screen borders, shell lighting and perspective remain aligned. No actionable P0/P1/P2 findings remain.

### Required fidelity surfaces

- Typography: original source-derived AIQUOS contours and locally bundled DM Sans preserved. Case labels use compact readable weights; the new carousel uses quieter typography below the cube.
- Spacing/layout: deleted components leave no blank cards. Cube, wordmark, copy and navigation retain their reference anchors. Carousel replaces the prior dots only. Phone and 1920 × 1080 desktop checked (`../../work/cases-wide.png`); both fill their viewports.
- Colors/tokens: existing pink/white/black palette and original shell accents retained. Dark overlays belong to the dynamic case displays only. Historical P3 simplified background lighting remains unchanged.
- Image/asset quality: actual 1080p Wing It finished clip, original Mario scripts, conbini v2 and two original pirate scene variants; no fake screenshots or substituted illustrations. Video preserves its full frame; top case canvas is 640 × 360 before projection. Scene iframe rendering uses its own aspect-aware camera.
- Copy/content: all four requested marketing numbers removed from the DOM. Five real cases named accurately. Conbini v1 is mentioned in the source collection notes but absent on disk; only existing v2 is included. Controls distinguish pausing the carousel from stopping the playing case animations.

### Verified interactions and checks

- Every one of five cases appears across the three screens; all groups use three distinct cases.
- Automatic rotation advances every 15 seconds and wraps through index 4 back to earlier indices; manually selecting a dot and using the next arrow both update the content. Pause retains the selected case for longer than one interval.
- Video readyState 4 / paused false; playback time advanced. Audio button changes muted false and back to true; final playback muted.
- `cases-pirates.png` confirms conbini plus both ordinary and pixelated pirate scenes render simultaneously. These are live WebGL scenes, not stills.
- Top screen independently replaced by focus clock via phone editor; side cases remained. Custom state persisted beyond one carousel interval and across resize to 1920 × 1080. Resume restores case playback.
- Reduced-motion preference disables automatic rotation initially. Hidden document or open modal suspends the rotation timer. Embedded scene rendering capped at 30 fps, 1× density; old frames unload on switch.
- Scene copies are sandboxed with only `allow-scripts`. Conbini is bundled to classic JavaScript so it runs without allowing same-origin access or network dependencies. Original source collection is untouched.
- Production build passed. All 22 tests passed: 3 case tests, 15 responsive/reference tests, 4 packaged-worker tests.
- Preview viewport override reset and normal automatic playback restored before handoff. No deployment performed.

Limits: this is an automatic showcase; game/scene iframe inputs are intentionally disabled inside the small projected screens. The existing editor can still load arbitrary media or live widgets. 15-second rotation previews a segment of the 114-second video; pause rotation to watch it continuously. No real-device GPU benchmark or full cross-browser audit was performed.

Latest cases revision final result: passed

## Historical revision: adaptive full-viewport layout

User feedback: the fixed-ratio page left unused margins and did not fill the browser. The previous fixed composition is no longer the responsive implementation.

Fixed: `.design-canvas` now matches viewport width and at least viewport height. Navigation, copy, footer and controls are anchored independently. The source wordmark and complete cube (including all three projected DOM screens) use separate uniform scales. The original narrow rounded page margins remain intentional; letterbox bands are removed. The edit is limited to layout, preserving existing artwork, colors, fonts, text and editor capabilities.

Source for this scoped comparison: `../aiquos-preview.png`, the prior 1536 × 1024 implementation. New reference-size screenshot: `../aiquos-preview-fullscreen.png`, 1536 × 1024 pixels at a 1536 × 1024 CSS viewport and DPR 1. Both were opened in the same comparison input. The wordmark and cube retain the exact reference coordinates (also asserted by an automated test); navigation and footer are now viewport-centered. All five fidelity surfaces reviewed: typography unchanged, layout intentionally responsive, color tokens unchanged, source image assets unchanged and unstretched, copy unchanged. No new P0/P1/P2 differences.

Additional browser evidence in `../../work/`:
- `fullscreen-before.png`: original page at the app's narrow viewport.
- `fullscreen-1440-initial.png`: 1440 × 900; canvas exactly fills viewport, pink frame x=11 through x=1429, y=8 through y=890.
- `fullscreen-phone.png`: 390 × 844; canvas and document height both 844; copy bottom 747.53, footer top 756. No overlap or scrolling at this size.
- `fullscreen-1920.png`: 1920 × 1080; document dimensions exactly match viewport, frame reaches both sides with 11px margins.
- `fullscreen-ultrawide.png`: ultrawide interaction state. DOM verified a 2560 × 1080 canvas and frame ending at x=2549; screenshot capture was width-limited, so use the complete wide-screen capture for full boundary comparison.
- `fullscreen-2048.png`: complete 2048 × 900 ultrawide capture; both outer edges, top CTA, screen shortcuts, arrow and footer are visible. Document/client width and stage width are 2048. This closes the width-limited screenshot gap above.

Iteration: initial compact-height calculation would crowd the footer at short heights. Reserved space for the copy and footer before sizing the cube. The browser 390 × 844 capture confirms separation; deterministic assertions cover 14 viewport sizes including short screens, tablets, laptops, desktop and ultrawide widths. Very short viewports intentionally scroll at a 760px compact / 680px landscape minimum height rather than shrinking text or hiding controls.

Regression checks: editor opened, top screen changed to the focus clock, timer started and remained running across a resize from 1920 to 2560 wide. Reset restores the original preset. Browser console has no unexpected warnings/errors. Production build succeeds; all 19 tests pass (15 layout/reference tests plus 4 packaged-worker tests).

New layout implementation: `src/layout.js` and `src/responsive.css`. Page-wide transform removed; responsive rules imported after appearance styles. The user's full-viewport preference is recorded in `AGENTS.md`.

Latest revision final result: passed

Source: public/assets/aiquos-reference.png, 1536 × 1024.
Initial implementation capture: ../../work/desktop-initial.png.
Browser screenshot: 1536 × 1024 output; browser density 1.9, logical viewport 808 × 539. Page scales proportionally to reference; recapture with exact logical viewport for final pass.

Initial findings:
- P2: pink matte around source typography is visible; replace matte with source-derived transparent lettering.
- P2: U/A letter edges were clipped by coarse asset boundary; retain exact source pixels.
- P2: star badge background is too cream; use a white translucent surface.
- P2: original screen remains visible near the top edge of custom top content; refine plane corners.
- P3: font metrics and footer icon shapes differ slightly from source.

Core behavior initial pass: four presets switch all faces successfully; each face is a separately projected DOM surface.

## Final comparison — 2026-09-03

Source visual truth: `/Users/lunaecho/Documents/Codex/2026-09-03/wo/outputs/aiquos/public/assets/aiquos-reference.png`.

Final implementation: `http://127.0.0.1:4286/`.

Final screenshot: `/Users/lunaecho/Documents/Codex/2026-09-03/wo/outputs/aiquos-preview.png`.

Viewport and normalization: 1536 × 1024 CSS px, devicePixelRatio 1, 1536 × 1024 screenshot pixels. Reference also 1536 × 1024. Canvas bounding rectangle explicitly checked as x=0, y=0, width=1536, height=1024. Original preset, no modal, no hovered screen.

Full-view evidence: reference and final implementation were opened together in the same comparison input. Composition, cube position, six letter contours, foreground hierarchy, copy and primary control placement align. No remaining P0/P1/P2 issues.

Focused evidence (source above implementation, aligned crops):
- `/Users/lunaecho/Documents/Codex/2026-09-03/wo/work/brand-comparison.png`
- `/Users/lunaecho/Documents/Codex/2026-09-03/wo/work/cube-comparison.png`
- Custom screens: `/Users/lunaecho/Documents/Codex/2026-09-03/wo/work/widgets-verified.png`
- Media replacement: `/Users/lunaecho/Documents/Codex/2026-09-03/wo/work/media-proof.png`
- Mobile cold-load viewport: `/Users/lunaecho/Documents/Codex/2026-09-03/wo/work/mobile-cold-visible.png`
- Mobile lower content: `/Users/lunaecho/Documents/Codex/2026-09-03/wo/work/mobile-bottom.png`
- Mobile editor: `/Users/lunaecho/Documents/Codex/2026-09-03/wo/work/mobile-editor.png`

## Comparison history and fixes

1. Initial `desktop-initial.png`: P2 matte seams around lettering, cropped A/U edges, cream badge fills and custom top screen bleed. Fixed by source-derived alpha unmixing, white translucent badges, revised screen corner coordinates, footer alignment and CTA spacing.
2. `desktop-second.png`: letter contours corrected; viewport density/resize transition was not yet stable. This image was excluded from the final fidelity verdict. Browser eventually settled to DPR 1 and exact reference CSS dimensions.
3. `desktop-verified.png` and focused comparisons: exact source letter/cube structure confirmed. Repeating background lighting was visible after source-tile reuse; removed low-frequency lighting from the tile, retaining only subtle source grain. Top-face bleed resolved in `widgets-verified.png`.
4. Mobile 390 px: page initially used the full inner width, including the browser scrollbar. Fixed by measuring document client width and observing viewport changes. Cold-load check confirmed client width 375, app width 375, projected canvas width 375, scroll width 375; all controls remain available. Final mobile screenshots are responsive adaptations because no mobile reference was supplied.
5. Final cold-load desktop `aiquos-preview.png`: no matte boundaries, no clipping, stable typography, default screens and complete layout. No further visual changes after this capture.

## Required fidelity surfaces

- **Fonts / typography:** supplied custom AIQUOS letterforms retained through pixel-derived alpha, including original arch and kerning. Actual body and control text use locally bundled DM Sans. P3: source font was not provided; subtle body glyph / weight differences remain. No claim of a full installable AIQUOS font.
- **Spacing / layout:** reference-sized canvas and measured positioning verified. Cube artwork and each independent screen share one coordinate system. Header, left copy, CTA, stars, dots and footer retain reference hierarchy. Mobile layout preserves content without horizontal clipping.
- **Colors / tokens:** source pink sampled around RGB 245,107,163. Cube's original three color families and shell lighting are retained. P3: background lighting/grain is simplified and browser screenshot color handling differs slightly from source.
- **Image quality:** real supplied artwork is reused, not replaced with generated approximations or hand-drawn stand-ins. The white brand is source-derived. Product artwork is cropped to the shell and original screens; surrounding page copy and controls are live HTML. Original raster resolution limits extreme enlargement. Custom screen geometry is functional interface projection, not a replacement illustration.
- **Copy / content:** original hero, navigation, CTAs and statistics retained. Editor copy clearly explains local-only uploads. About and Pricing disclose that this is a frontend demo, not a functioning paid AI service.
- **Icons:** Phosphor library provides real icon components. P3: footer group/cube/bolt glyphs are close but not pixel-identical to reference art.

## Verified interactions

- All four preset buttons and next arrow switch screen configurations.
- Each face opens the editor; three face selectors independently apply a widget.
- Local PNG file loaded on left screen (naturalWidth=1536, complete=true).
- Local MP4 loaded on right screen while left image and top original remain unchanged; readyState=4, paused=false, playback time advanced, videoWidth=500.
- Fixed cached-image loading-label race; media instances are keyed by type and source.
- Timer start changes to pause state; progress changes from 78 to 79 with keyboard input; sound starts and changes to pause state.
- Modal close, focus return, keyboard controls and mobile editor checked. Native dialog handles focus trapping and Escape.
- Reset returns all screens to original. Manual edits clear the preset-selected state.
- Object URLs are revoked when no longer used and on unmount.
- Three projection matrices map all twelve screen corners to their specified destination coordinates within 1e-8 px in a deterministic arithmetic check.
- Browser console: no unexpected warnings or errors observed.
- Production build successful; all four packaged-worker tests passed.

## Limits and follow-up polish

This is a fixed-view 2.5D implementation, not a rotatable 3D mesh. Arbitrary React components are supported by the component contract; no backend integration was requested. Uploads are session-local. Remote-media behavior and codecs depend on source servers and browser support; not every external format was tested. Full browser-matrix and assistive-technology audits were not performed.

Residual P3s: exact body font identification, pixel-identical small footer glyphs, and original low-frequency background illumination. These do not block the functioning recreation; avoid claiming mathematically pixel-identical output.

## Implementation checklist

- [x] Custom source-based brand first
- [x] Original product shell and three independently replaceable DOM screens
- [x] Images, videos and interactive components
- [x] Responsive layout, keyboard focus and reduced-motion support
- [x] Source / browser comparisons, focused brand and cube checks
- [x] Build, packaging tests and source documentation
