/** The window-relative units the whole stylesheet is written against.
 *
 * The site is adaptive: it fills the viewport, and every element holds a fixed
 * *share* of it. These variables are that share, made explicit — `--vw` is 1% of
 * the viewport width and so on — so a rule can say "this stamp is a 22nd of the
 * picture" and mean it at every window size.
 *
 * They exist so that a size can be expressed as a share *and* stay a single
 * number in one place. The failure they replace: sizes taken from the window
 * with px clamps on both ends. The clamps saturated at different window sizes,
 * so the parts drifted apart relative to one another — measured across
 * 1280x720 -> 3840x2160, the intro block's own scale stopped at 1.3 while the
 * cube kept growing to 2.11, which moved that block 52 percentage points across
 * the picture and shrank the display type from 27% of the width to 14%. */

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

/** Wide vs the compact phone layout. Kept in one place because two callers need
 * the same answer: the layout modules (to pick which composition to compute)
 * and the stylesheet (via `data-layout`). */
export function isCompactWindow(width, height) {
  return width < 700 || (width < 1000 && width / height < 1.05);
}

/** The size a caller should lay out against: the window. */
export function getStageSize(root = globalThis.document) {
  const stage = root?.querySelector?.(".design-stage");
  if (stage && stage.clientWidth > 0 && stage.clientHeight > 0) {
    return [stage.clientWidth, stage.clientHeight];
  }
  return [globalThis.innerWidth || DESIGN_WIDTH, globalThis.innerHeight || DESIGN_HEIGHT];
}

/** Screen pixels -> composition pixels. Inside the stage the two are the same
 * (the stage is not scaled), so this is the identity today; it exists so the
 * measurement helpers keep working unchanged if a scale is ever reintroduced. */
export function getFrameScaleFromDom(root = globalThis.document) {
  return 1;
}
