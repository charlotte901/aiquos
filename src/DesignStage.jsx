import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getFrameScale,
  isCompactWindow,
} from "./stage";

/** Size the app lays itself out against.
 *
 * In wide mode that is the design frame and never the window: the composition
 * is identical at every window size, so a resize must not change a single
 * layout number — only the stage's scale, which is written straight to the DOM
 * by `DesignStage` and never re-renders React. Compact keeps the window, because
 * a phone gets its own set of rules and not a scaled-down wide composition.
 *
 * A `ResizeObserver` on `body` rides alongside the resize listener because a
 * scrollbar can appear or vanish without a window resize, which the compact
 * layout cares about; the frame size ignores both. */
export function useStageSize() {
  const measure = () => (isCompactWindow(window.innerWidth, window.innerHeight)
    ? { width: document.documentElement.clientWidth, height: window.innerHeight }
    : { width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const update = () => {
      const next = measure();
      setSize((previous) =>
        previous.width === next.width && previous.height === next.height
          ? previous
          : next,
      );
    };
    update();
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return size;
}

/** The 16:9 stage: one fixed composition, uniformly scaled to the window.
 *
 * Everything the site renders lives inside this box, so a length written here
 * is a share of the composition rather than a share of whatever monitor it
 * happens to be on. That is the whole mechanism — a `px` inside the frame is
 * proportional by construction, and there is no third factor left for a part to
 * drift by (see stage.js for what the old per-part clamps did instead).
 *
 * Scale is applied here and nowhere else. A `scale()` on a subtree multiplies
 * every fixed length inside it exactly once, so the frame's own coordinate
 * space — which the poster's flight, the route's dashes and the transition
 * strips all measure in — stays in design pixels. */
export function DesignStage({ children }) {
  const ref = useRef(null);
  const [compact, setCompact] = useState(() => isCompactWindow(window.innerWidth, window.innerHeight));

  useLayoutEffect(() => {
    const apply = () => {
      const node = ref.current;
      if (!node) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const next = isCompactWindow(width, height);
      setCompact((previous) => (previous === next ? previous : next));
      // Written to the node rather than held in state: the composition does not
      // change with the window in wide mode, so a resize should cost one style
      // write and no render.
      node.style.setProperty(
        "--frame-scale",
        next ? "1" : String(getFrameScale(width, height)),
      );
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  return (
    <div
      className="design-stage-host"
      data-compact={compact ? "true" : "false"}
    >
      <div
        className="design-stage"
        ref={ref}
        data-compact={compact ? "true" : "false"}
      >
        {children}
      </div>
    </div>
  );
}
