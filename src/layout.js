const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Optical correction: the hero wordmark reads a touch left of center next to
// the header logo, so nudge it right in design pixels (scaled with the art).
const BRAND_SHIFT_X = 48;

/** Layout the individual elements in the viewport, never scale the whole page.
 * Artwork uses uniform scales so the wordmark and screen homographies stay true.
 * Very short viewports scroll instead of hiding controls or shrinking all text.
 */
export function getViewportLayout(width, viewportHeight) {
  const compact =
    width < 700 || (width < 1000 && width / viewportHeight < 1.05);
  const height = Math.max(viewportHeight, compact ? 760 : 680);
  const unit = compact
    ? 1
    : clamp(Math.min(width / 1536, height / 1024), 0.72, 1.3);
  const cubeTop = compact
    ? clamp(height * 0.17, 130, 180)
    : (height * 282) / 1024;
  const cubeScale = compact
    ? Math.min(
        (width - 54) / 640,
        (height * 0.37) / 595,
        (height - 388 - cubeTop) / 595,
      )
    : Math.min(width / 1536, height / 1024);
  const cubeCenterX = compact ? width / 2 : (width * 813) / 1536;
  const cubeX = cubeCenterX - 813 * cubeScale;
  const cubeY = cubeTop - 282 * cubeScale;
  const cubeBottom = cubeY + 877 * cubeScale;
  const brandScale = compact
    ? Math.min((width - 32) / 1300, (height * 0.17) / 345)
    : Math.min(width / 1536, (height / 1024) * 1.05);
  const brandTop = compact ? 114 : (height * 100) / 1024;
  const introTop = compact
    ? Math.max(cubeBottom + 88, height * 0.535)
    : // Align the explore button's center with the carousel toggle's center:
      // the button sits 275.5 design px into the intro block (h2 3x42x1.15
      // + 18 gap + p 2x17x1.65 + 31 gap + 51/2 button half), the toggle's
      // center sits 17.5 design px below dots-top (cubeBottom + 2*cubeScale).
      cubeBottom + 2 * cubeScale + (17.5 - 275.5) * unit;
  const introLeft = compact
    ? clamp(width * 0.07, 22, 48)
    : Math.max(36, (width * 72) / 1536);
  const introRight = compact
    ? clamp(width * 0.07, 22, 48)
    : Math.max(36, (width * 72) / 1536);
  return {
    compact,
    width,
    height,
    unit,
    cubeScale,
    cubeX,
    cubeY,
    cubeBottom,
    brandScale,
    brandX: (width - 1536 * brandScale) / 2 + BRAND_SHIFT_X * brandScale,
    brandY: brandTop - 100 * brandScale,
    introTop,
    introLeft,
    introRight,
    variables: {
      "--page-height": `${height}px`,
      "--ui-scale": unit,
      "--cube-scale": cubeScale,
      "--cube-x": `${cubeX}px`,
      "--cube-y": `${cubeY}px`,
      "--brand-scale": brandScale,
      "--brand-x": `${(width - 1536 * brandScale) / 2}px`,
      "--brand-y": `${brandTop - 100 * brandScale}px`,
      "--intro-top": `${introTop}px`,
      "--intro-left": `${introLeft}px`,
      "--intro-right": `${introRight}px`,
      "--dots-left": `${cubeCenterX - (compact ? 41 : 75 * cubeScale)}px`,
      "--dots-top": `${cubeBottom + (compact ? 3 : 2 * cubeScale)}px`,
      "--cube-center": `${cubeCenterX}px`,
      "--hint-top": `${cubeBottom + 28}px`,
      "--stats-width": compact ? `${width - 36}px` : `${842 * unit}px`,
      "--stats-height": compact ? "70px" : `${92 * unit}px`,
      "--edge": compact ? "7px" : "11px",
    },
  };
}
