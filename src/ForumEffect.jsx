import { useEffect, useRef } from "react";
import { RealitySplit } from "./forum-effect.js";

/** Relative luminance, used to decide whether the wordmark prints in white or
 * in ink. Two topics in the board (`每周精选`, `校园故事`) carry an amber field
 * with dark ink by design, so a topic filter can hand the hero a background the
 * white wordmark cannot sit on.
 *
 * Exported because the header's nav labels need the same answer: they scroll up
 * over this field, so they must flip with it rather than staying the tab's
 * default black. */
export function fieldInk(hex) {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!match) return "#ffffff";
  let value = match[1];
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const channel = (i) => {
    const v = parseInt(value.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.45 ? "#17150f" : "#ffffff";
}

/** The Forum hero: the wordmark, the letter-card animation, and the tagline on
 * one stage.
 *
 * `fieldColor` is the current topic's colour. The engine cross-fades its own
 * background between palettes, so handing the topic down retints the stage with
 * the board's own wipe instead of a second animation layered on top. The same
 * colour also goes on the element, so the ground is already correct on the frame
 * before the canvas paints — otherwise every topic click flashed the paper
 * background first. */
export function ForumEffect({ fieldColor }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new RealitySplit(canvas);
    engineRef.current = engine;
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
      engineRef.current = null;
    };
  }, []);

  // Retint separately from setup: changing the topic must not tear down and
  // rebuild the canvas, which would restart the animation from frame zero on
  // every filter click.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.ok) return;
    engine.setField(fieldColor);
    // A stopped engine has no frame loop to fade through, so repaint the still.
    if (!engine.running) engine.renderStill();
  }, [fieldColor]);

  const ink = fieldInk(fieldColor);

  return (
    <section
      className="forum-hero"
      style={{ background: fieldColor, "--forum-hero-ink": ink }}
      data-ink={ink === "#ffffff" ? "light" : "dark"}
    >
      <canvas ref={canvasRef} />
      <h1 className="forum-wordmark">
        {"FORUM!".split("").map((letter, index) => (
          <span key={`${letter}-${index}`} style={{ animationDelay: `${index * 55}ms` }}>
            {letter}
          </span>
        ))}
      </h1>
      <p className="forum-hero-tagline">真实的讨论，比分数更快让你看清自己的 AI 实力。</p>
    </section>
  );
}
