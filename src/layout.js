const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Optical correction: the hero wordmark reads a touch left of center next to
// the header logo, so nudge it right in design pixels (scaled with the art).
const BRAND_SHIFT_X = 48;

/** Layout the individual elements in the viewport, never scale the whole page.
 * Artwork uses uniform scales so the wordmark and screen homographies stay true.
 * Very short viewports scroll instead of hiding controls or shrinking all text.
 *
 * Every element here scales by the SAME factor — `min(width / 1536,
 * height / 1024)`, unclamped. That equality is the whole point: this factor used
 * to be clamped to 0.72..1.3 for the text and UI while the cube and wordmark
 * scaled by the same formula *unclamped*, so above ~2000px wide the artwork kept
 * growing and everything driven by `unit` stopped — the intro block moved 52
 * percentage points across the picture and the display type lost two thirds of
 * its relative width between 1280x720 and 3840x2160. With one shared factor the
 * parts cannot drift apart: at 16:9 every window renders the same composition.
 */
export function getViewportLayout(width, viewportHeight) {
  const compact =
    width < 700 || (width < 1000 && width / viewportHeight < 1.05);
  const height = Math.max(viewportHeight, compact ? 760 : 680);
  // One scale for the whole page. `clamp` is gone, not tightened: a floor or a
  // ceiling here is what let the text stop growing while the artwork continued.
  const scale = Math.min(width / 1536, height / 1024);
  const unit = compact ? 1 : scale;
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
  // 立方体底缘之下的底部元素块（轮播点 35px + 文案两行 ≈ 82px）整体有
  // 一个视口高度上限：Windows 任务栏约 48px，贴着立方体算出的 dots-top
  // 在矮窗口会把文案压进任务栏（用户实测被遮挡）。上限按「视口高 −
  // 任务栏余量 − 块高」收；不低于立方体底缘上方 24px，避免盖住机身。
  const dotsTopRaw = compact ? cubeBottom + 3 : cubeBottom + 2 * cubeScale;
  const dotsTop = Math.max(
    cubeBottom - 24,
    Math.min(dotsTopRaw, viewportHeight - 136),
  );
  const brandScale = compact
    ? Math.min((width - 32) / 1300, (height * 0.17) / 345)
    : Math.min(width / 1536, (height / 1024) * 1.05);
  const brandTop = compact ? 114 : (height * 100) / 1024;
  const introTop = compact
    ? Math.max(cubeBottom + 88, height * 0.535)
    : // Align the explore button's center with the carousel toggle's center:
      // the button sits 275.5 design px into the intro block (h2 3x42x1.15
      // + 18 gap + p 2x17x1.65 + 31 gap + 51/2 button half), the toggle's
      // center sits 17.5 design px below dots-top——上限生效时以收缩后的
      // dotsTop 为基准，按钮与轮播暂停键的对齐关系保持不变。
      dotsTop + (17.5 - 275.5) * unit;
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
      "--dots-top": `${dotsTop}px`,
      "--cube-center": `${cubeCenterX}px`,
      "--hint-top": `${cubeBottom + 28}px`,
      "--stats-width": compact ? `${width - 36}px` : `${842 * unit}px`,
      "--stats-height": compact ? "70px" : `${92 * unit}px`,
      "--edge": compact ? "7px" : "calc(11px * var(--ui-scale, 1))",
    },
  };
}
