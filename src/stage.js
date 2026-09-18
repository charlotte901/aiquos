/** The stage: one fixed 16:9 composition, uniformly scaled to the window.
 *
 * Every part of the interface is positioned inside this single fixed frame, so
 * each element's share of the picture is set once, at design size, and holds
 * exactly at every window size. Before this, each part was sized from the live
 * window with its own px clamp on both ends — the clamps saturated at different
 * widths, so the composition came apart as the monitor grew. Measured at the
 * reference ratios, the intro block's own scale stopped at 1.3 while the cube
 * kept growing to 2.11, and the headline lost two thirds of its relative width
 * between 1280x720 and 3840x2160.
 *
 * 1920x1080 is both the design size and a 16:9 frame, which matters twice over:
 * every existing pixel constant keeps its calibrated meaning (the reference art,
 * the cube's projected corners, the archive crops), and the frame the app is
 * composed against is the aspect the user asked it to adapt to. A window that is
 * not 16:9 is letterboxed — the composition is never stretched, and it never
 * tracks the window's aspect instead of its own.
 *
 * Compact keeps the fluid layout it already had: a wide composition scaled to a
 * phone's width would be unreadable, and those rules are a deliberate set of
 * alternatives rather than a smaller version of these. The stage still exists
 * there, but it is the window.
 */

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;
export const DESIGN_SIZE = [DESIGN_WIDTH, DESIGN_HEIGHT];
/** 16 : 9, as a single number: the frame's own aspect, used to decide whether a
 * window is letterboxed at the sides or at the top and bottom. */
export const DESIGN_ASPECT = DESIGN_WIDTH / DESIGN_HEIGHT;

/** The one scale every part of the composition shares.
 *
 * `min` rather than separate axes: a non-16:9 window gains margin on the
 * generous axis instead of stretching the art. */
export function getFrameScale(width, height) {
  return Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
}

/** Is this window laid out as the phone/tablet alternative?
 *
 * The predicate the app already used, kept in one place now that two callers
 * need the same answer: this file (to decide whether the stage is the design
 * frame or the window) and layout.js (to decide which composition to compute). */
export function isCompactWindow(width, height) {
  return width < 700 || (width < 1000 && width / height < 1.05);
}

/** Layout variables for the stage element itself.
 *
 * `--frame-scale` only ever affects the stage's own transform, so nothing
 * inside has to know the window's size — that is the point of the frame. */
export function getStageLayout(width, height) {
  const compact = isCompactWindow(width, height);
  return {
    compact,
    scale: compact ? 1 : getFrameScale(width, height),
    width: compact ? width : DESIGN_WIDTH,
    height: compact ? height : DESIGN_HEIGHT,
  };
}

/** The stage's own layout box, in design pixels.
 *
 * Transitions freeze live panels and need a width to give the frozen copy; that
 * number is the frame inside the stage, never `innerWidth` — the stage is
 * transformed, so screen pixels are the frame multiplied by the scale. Falls
 * back to the design size so the helpers keep working before the stage mounts
 * (and in tests, which have no DOM). */
export function getStageSize(root = globalThis.document) {
  const stage = root?.querySelector?.(".design-stage");
  if (stage && stage.clientWidth > 0 && stage.clientHeight > 0) {
    return [stage.clientWidth, stage.clientHeight];
  }
  return DESIGN_SIZE;
}

/** Convert a measured screen-pixel box into the stage's coordinate space.
 *
 * `getBoundingClientRect` reports screen pixels, which inside the scaled stage
 * are design pixels times the frame scale. Any measurement that is compared
 * against a design-pixel constant, or written back into a design-pixel
 * transform, has to be divided through by this first. */
export function getFrameScaleFromDom(root = globalThis.document) {
  const stage = root?.querySelector?.(".design-stage");
  if (!stage) return 1;
  const box = stage.getBoundingClientRect();
  return box.width > 0 ? box.width / (stage.clientWidth || DESIGN_WIDTH) : 1;
}
