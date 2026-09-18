import { useEffect, useRef, useState } from "react";
import { isCompactWindow } from "./stage";

/** The size the site lays itself out against: the window.
 *
 * The site is adaptive — it fills whatever viewport it is given, and every
 * element holds a fixed *share* of that viewport. Proportions are locked by
 * making every size derive from the same window-relative unit (see the `--vw` /
 * `--vh` variables in responsive.css) rather than from per-element px clamps,
 * which saturated at different window sizes and let the parts drift apart.
 *
 * One hook, one listener: the hubs used to keep five separate resize listeners
 * with the same shape. */
export function useStageSize() {
  const measure = () => ({
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
  });
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

/** An inert wrapper: the stage is the window itself, so this carries no box of
 * its own (`display: contents`) and cannot introduce a second coordinate space,
 * a containing block for `position: fixed`, or a clipping edge — any of which
 * would put the transition layers and the full-bleed views out of register. */
export function DesignStage({ children }) {
  return <div className="design-stage">{children}</div>;
}
