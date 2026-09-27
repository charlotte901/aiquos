import { useEffect } from "react";
import confetti from "canvas-confetti";

/**
 * 关卡完成时的庆祝彩带。
 *
 * 用 canvas-confetti（ISC 许可，4.2KB gzip，零依赖）而不是自己画——它的
 * 粒子物理、DPR 适配与降级处理都已打磨过，收益远大于依赖成本。
 *
 * 两个自制约束：
 *  1. 尊重 prefers-reduced-motion。库本身支持 disableForReducedMotion，但
 *     这里直接不触发更省事，也避免动画偏好用户看到画布一闪。
 *  2. 只在 .task-panel 内部播（用 create 绑定到面板内的画布），彩带不会
 *     飘到左侧的 TEST! 字标与右侧导师舞台上面去——那些区域不属于这一屏的
 *     叙事，装饰物盖过去会显得脏。
 */
export function useStageConfetti(active, accent = "#34c759") {
  useEffect(() => {
    if (!active) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    // 面板内建一个铺满的画布；pointer-events: none 让它不挡任何点击。
    const host = document.querySelector(".task-panel");
    if (!host) return undefined;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "3",
    });
    host.appendChild(canvas);

    const fire = confetti.create(canvas, { resize: true, useWorker: true });
    const palette = [accent, "#8be04e", "#ffd23f", "#4cc3ff", "#c98cff"];

    // 左右两侧各打一发，再补一发从上方落下的散花：三段比单次爆发更有
    // "刚才那件事值得庆祝"的层次。
    fire({ particleCount: 70, spread: 62, startVelocity: 46, origin: { x: 0.1, y: 0.75 }, angle: 58, colors: palette, ticks: 180, scalar: 0.95 });
    fire({ particleCount: 70, spread: 62, startVelocity: 46, origin: { x: 0.9, y: 0.75 }, angle: 122, colors: palette, ticks: 180, scalar: 0.95 });
    const bloom = window.setTimeout(() => {
      fire({ particleCount: 90, spread: 110, startVelocity: 34, origin: { x: 0.5, y: 0.18 }, gravity: 0.9, colors: palette, ticks: 220, scalar: 1.05 });
    }, 240);

    return () => {
      window.clearTimeout(bloom);
      fire.reset();
      canvas.remove();
    };
  }, [active, accent]);
}
