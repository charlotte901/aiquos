/**
 * One-shot migration: viewport units -> frame-relative custom properties.
 *
 * The app is moving onto a fixed 16:9 design frame. Inside that frame a `vw` is
 * no longer 1% of the window, it is 1% of the frame, so every viewport-unit
 * length has to name the frame variable instead. The variables are defined to
 * mean exactly the old thing in compact mode (`--vw: 1vw`), so the phone layout
 * is unchanged rather than merely similar.
 *
 * Emitting `calc(N * var(--x))` unconditionally keeps this safe inside nested
 * calc()/min()/clamp(), which a bare `N * var(--x)` would not be.
 *
 * Each reference carries a real-viewport fallback (`var(--vw, 1vw)`). The frame
 * variables are defined on `.design-stage` only, and custom properties inherit
 * downwards — so the fallback is what a rule outside the stage sees. That covers
 * the transition overlays, the dialogs, and `body` without any of them having to
 * know the frame exists, and it makes a missed call site behave as it does today
 * instead of resolving to an invalid length.
 *
 * Run: node scripts/migrate-viewport-units.mjs <file...>
 */
import { readFileSync, writeFileSync } from "node:fs";

const UNIT_VAR = {
  vw: "--vw",
  vh: "--vh",
  dvh: "--dvh",
  vmin: "--vmin",
  vmax: "--vmax",
};

// Longest first so `dvh` is not eaten by the `vh` rule.
const PATTERN = /(?<![\w.-])(\d*\.?\d+)(dvh|vw|vh|vmin|vmax)(?![\w-])/g;

/** Strip block comments so prose like "26.5vw of the frame" is never rewritten. */
function maskComments(text) {
  const masked = text.split("");
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (let k = i; k < stop; k += 1) masked[k] = " ";
      i = stop - 1;
    }
  }
  return masked.join("");
}

for (const file of process.argv.slice(2)) {
  const source = readFileSync(file, "utf8");
  const masked = maskComments(source);
  let out = "";
  let cursor = 0;
  let count = 0;
  for (const match of masked.matchAll(PATTERN)) {
    const [text, number, unit] = match;
    out += source.slice(cursor, match.index);
    out += `calc(${number} * var(${UNIT_VAR[unit]}, 1${unit}))`;
    cursor = match.index + text.length;
    count += 1;
  }
  out += source.slice(cursor);
  writeFileSync(file, out);
  console.log(`${file}: ${count} replaced`);
}
