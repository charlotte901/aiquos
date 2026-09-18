/** Geometric cover art for posts without a photograph.
 *
 * Every topic in `forum-topics.js` already carries an `art` name — `dots`,
 * `grid`, `arcs`, `waves`, `rings` — written when the data was authored but
 * never drawn, so an image-less post fell back to a bare colour block. These
 * patterns are generated rather than stored: they take the card's own palette
 * (colour, ink, accent) so a pattern always belongs to its topic, and they cost
 * one `<svg>` each instead of a network request.
 *
 * The drawing is deliberately simple and stays inside one viewBox so the SVG
 * scales to whatever aspect the post declares.
 */

const VIEW = 100;

function dots({ accent, ink }) {
  const cells = [];
  const step = 12.5;
  for (let y = step / 2; y < VIEW; y += step) {
    for (let x = step / 2; x < VIEW; x += step) {
      const cx = Math.round(x * 10) / 10;
      const cy = Math.round(y * 10) / 10;
      // Every third dot is oversized and drawn in the accent, which reads as a
      // hand-stamped pattern rather than graph paper.
      const big = (Math.round(x / step) + Math.round(y / step)) % 3 === 0;
      cells.push(
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={big ? 2.5 : 1.15}
          fill={big ? accent : ink}
          opacity={big ? 0.92 : 0.42}
        />,
      );
    }
  }
  return cells;
}

function grid({ accent, ink }) {
  const lines = [];
  const step = 14;
  for (let pos = step; pos < VIEW; pos += step) {
    const key = Math.round(pos * 10) / 10;
    lines.push(
      <line key={`v${key}`} x1={key} y1="0" x2={key} y2={VIEW} stroke={ink} strokeWidth="0.7" opacity="0.3" />,
      <line key={`h${key}`} x1="0" y1={key} x2={VIEW} y2={key} stroke={ink} strokeWidth="0.7" opacity="0.3" />,
    );
  }
  // One heavy accent cell, off-centre, so the grid has a focal point.
  lines.push(
    <rect key="cell" x="42" y="42" width="14" height="14" fill={accent} opacity="0.9" />,
  );
  return lines;
}

function arcs({ accent, ink }) {
  const rings = [];
  for (let i = 1; i <= 7; i++) {
    const r = i * 7;
    rings.push(
      <circle
        key={r}
        cx="26"
        cy="74"
        r={r}
        fill="none"
        stroke={i % 3 === 0 ? accent : ink}
        strokeWidth={i % 3 === 0 ? 1.8 : 0.8}
        opacity={i % 3 === 0 ? 0.9 : 0.34}
      />,
    );
  }
  return rings;
}

function waves({ accent, ink }) {
  const paths = [];
  for (let i = 0; i < 8; i++) {
    const y = 12 + i * 11;
    const amp = 5 + (i % 3) * 2.5;
    paths.push(
      <path
        key={i}
        d={`M -4 ${y} Q 21 ${y - amp} 50 ${y} T 104 ${y}`}
        fill="none"
        stroke={i % 2 === 0 ? ink : accent}
        strokeWidth={i % 4 === 0 ? 1.6 : 0.85}
        opacity={i % 2 === 0 ? 0.4 : 0.72}
      />,
    );
  }
  return paths;
}

function rings({ accent, ink }) {
  const items = [];
  const centres = [
    [30, 32, 15],
    [70, 30, 10],
    [34, 72, 11],
    [72, 70, 17],
  ];
  centres.forEach(([cx, cy, r], index) => {
    items.push(
      <circle key={`o${index}`} cx={cx} cy={cy} r={r} fill="none" stroke={ink} strokeWidth="0.9" opacity="0.34" />,
      <circle key={`i${index}`} cx={cx} cy={cy} r={r * 0.42} fill={accent} opacity="0.85" />,
    );
  });
  return items;
}

const PATTERNS = { dots, grid, arcs, waves, rings };

export function ForumArt({ art, color, ink, accent, ratio }) {
  const draw = PATTERNS[art] ?? PATTERNS.dots;

  return (
    <span
      className="forum-card-art"
      aria-hidden="true"
      style={ratio ? { "--art-ratio": ratio } : undefined}
    >
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="xMidYMid slice">
        <rect width={VIEW} height={VIEW} fill="transparent" />
        {draw({ color, ink, accent })}
      </svg>
    </span>
  );
}
