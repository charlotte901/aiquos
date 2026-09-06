import { useEffect, useRef } from "react";
import { LoudBurst } from "./case-effect";

export function CaseEffect() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new LoudBurst(canvas);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = !document.hidden;

    const sync = () => {
      if (!engine.ok || reduced) return;
      visible = !document.hidden;
      if (visible) engine.start();
      else engine.stop();
    };

    if (reduced) engine.renderStill();
    else sync();

    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);

    requestAnimationFrame(() => engine.resize());

    return () => {
      document.removeEventListener("visibilitychange", sync);
      observer.disconnect();
      engine.destroy();
    };
  }, []);

  return (
    <div
      className="case-effect"
      role="img"
      aria-label="AI use-case phrases type onto paper, burst into colorful strokes, and cycle"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
