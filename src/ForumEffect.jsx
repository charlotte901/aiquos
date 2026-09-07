import { useEffect, useRef } from "react";
import { RealitySplit } from "./forum-effect.js";

export function ForumEffect() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new RealitySplit(canvas);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = !document.hidden;
    let observer;

    const sync = () => {
      if (!engine.ok || reduced) return;
      if (visible) engine.start();
      else engine.stop();
    };

    if (reduced) engine.renderStill();
    else sync();

    observer = new ResizeObserver(() => engine.resize());
    observer.observe(canvas);

    const onVisibility = () => {
      visible = !document.hidden;
      sync();
    };

    document.addEventListener("visibilitychange", onVisibility);
    requestAnimationFrame(() => engine.resize());

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      engine.destroy();
    };
  }, []);

  return (
    <div className="forum-effect" role="img" aria-label="Forum words split apart and reassemble">
      <canvas ref={canvasRef} />
    </div>
  );
}
