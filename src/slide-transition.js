/** Home and the case library are the only two views that share one panel node
 * (see PANEL in SiteExperience), so they are the only pair the strip and card
 * machinery cannot cover: it works by freezing two separately screenshot-able
 * panels and cutting between them, and here there is only one panel.
 *
 * They do not need it. Both pages are already laid out in the same tree — the
 * homepage's `.home-stage` and the case library's `.home-tab-screen` are
 * siblings inside `.design-canvas` — so instead of two snapshots moving, the
 * two live layers move: the homepage's elements travel out through the left
 * edge while the case page arrives from the right, on the same beat.
 *
 * The paper does not move. The first archive world now borrows the homepage's
 * ground verbatim (`HOME_GROUND` in CaseArchive), so the pink behind both is
 * one continuous surface; sliding it would be sliding a colour that never
 * changes. Only the ink travels, which is also why no seam shows where the two
 * layers meet — they are two sets of marks on one sheet.
 */

// Extension-ful on purpose: `cube3d.js` -> `cube-geometry.js` sets the precedent
// for modules that a test imports, and Node's ESM resolver needs it (this file is
// covered by tests/slide-transition.test.mjs).
import { STRIP_EASING } from "./split-transition.js";
import { getStageSize } from "./stage.js";

export const SLIDE_DURATION = 760;

/** Strong at both ends, like the strip pull: the sheet is pushed, it does not
 * drift. The very same curve as `animateStrips`, taken from it rather than
 * copied, so every horizontal move on the site stays one gesture. */
export const SLIDE_EASING = STRIP_EASING;

const HOME_LAYER = ".home-stage";
const CASES_LAYER = ".home-tab-screen";

/** The two layers of one push, in travel order. A forward move sends home off
 * to the left and brings cases in from the right; the reverse plays the same
 * strip backwards, so both directions stay one continuous motion. */
function layers(forward) {
  return {
    leaving: document.querySelector(forward ? HOME_LAYER : CASES_LAYER),
    arriving: forward ? CASES_LAYER : HOME_LAYER,
  };
}

/** Push the two pages past each other.
 *
 * Two callbacks, because the two directions commit the view at different times.
 *
 * A forward move has to change the tab *before* the arriving page can be
 * animated: the archive does not exist until then. So `enter` runs mid-push and
 * performs the view change.
 *
 * A reverse move must *not*. Every one of the archive's own rules — its poster
 * type, its stamps, its grid, forty of them — is scoped to `[data-tab="cases"]`.
 * Flipping the tab to `home` on the first frame therefore re-styles the very
 * page that is still on screen: the sheet slides out with its own text at the
 * wrong size. The departing page has to keep the attribute that describes it, so
 * for a reverse move the tab stays put until the travel is over and `commit`
 * performs the view change instead, still inside `data-pushing` so the chrome
 * does not flash between the two.
 *
 * `enter` must commit synchronously: the arriving layer's animation has to be
 * set up in the same task as the departing one, or the first painted frame shows
 * the new page already in place.
 */
export async function pushPages({ forward, enter, commit }) {
  // The travelling layers are inside the stage, so the distance a page moves to
  // clear the frame is the frame's width — not the window's, which is wider and
  // would leave the page still partly on screen at the end of the push.
  const width = getStageSize()[0];
  const options = {
    duration: SLIDE_DURATION,
    easing: SLIDE_EASING,
    fill: "both",
  };
  // Everything travels left on the way in and right on the way back.
  const travel = forward ? -width : width;

  const { leaving, arriving: arrivingSelector } = layers(forward);
  // The incoming tab hides the homepage's elements as soon as `data-tab`
  // flips; the push needs them visible because they are the half still leaving.
  // The layout read that follows commits the header's transition before the tab
  // changes, so the chrome eases into the new tab's scale instead of snapping —
  // a transition declared in the same calculation as the value change it is
  // meant to soften is not guaranteed to run from the old value.
  //
  // The direction is part of the value so the stylesheet can tell the two
  // pushes apart: on the way home the chrome has to leave the library's
  // restrained scale behind (see the `:not([data-pushing="back"])` guards in
  // responsive.css), which it cannot do while `data-tab` still reads `cases`.
  const shell = document.querySelector(".app");
  shell?.setAttribute("data-pushing", forward ? "forward" : "back");
  void shell?.offsetHeight;
  // A push that was interrupted leaves its fill behind; the layer is reused
  // between visits, so clear it before measuring the next one.
  leaving?.getAnimations().forEach((animation) => animation.cancel());

  const leavingFx = leaving?.animate(
    [{ transform: "translateX(0px)" }, { transform: `translateX(${travel}px)` }],
    options,
  );

  enter?.();

  const arriving = document.querySelector(arrivingSelector);
  arriving?.getAnimations().forEach((animation) => animation.cancel());
  const arrivingFx = arriving?.animate(
    [{ transform: `translateX(${-travel}px)` }, { transform: "translateX(0px)" }],
    options,
  );

  const running = [leavingFx, arrivingFx].filter(Boolean);
  for (const node of [leaving, arriving]) {
    if (node) node.style.willChange = "transform";
  }
  if (import.meta.env?.DEV) window.__aiquosPush = { leaving: leavingFx, arriving: arrivingFx };

  window.addEventListener("resize", finish, { once: true });
  try {
    await Promise.all(running.map((animation) => animation.finished.catch(() => {})));
  } finally {
    window.removeEventListener("resize", finish);
    // While `data-pushing` is still armed, so a reverse move's tab flip lands
    // before the attribute does and the chrome never shows a frame of the
    // library scale it has already travelled away from.
    commit?.();
    shell?.removeAttribute("data-pushing");
    for (const node of [leaving, arriving]) {
      if (node) node.style.willChange = "";
    }
    // Both layers end where they belong once the transforms are released: the
    // arriving one unwinds to its resting place, and the departing one is
    // `inert` and already covered by the page that replaced it.
    running.forEach((animation) => animation.cancel());
    if (import.meta.env?.DEV) delete window.__aiquosPush;
  }

  function finish() {
    running.forEach((animation) => animation.finish());
  }
}
