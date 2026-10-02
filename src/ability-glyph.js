export const GLYPH_WORDS = { D1: "认知", D2: "提示", D3: "工具", D4: "评估", D5: "协同", D6: "伦理" };
export function glyphScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
}
export function glyphPriorities(dimensions) {
  const known = dimensions.map(d => ({ ...d, score: glyphScore(d.score) })).filter(d => d.score !== null).sort((a,b) => a.score - b.score);
  if (known.length < 2 || known[0].score === known.at(-1).score) return [];
  const cutoff = known[1].score;
  // Include ties without arbitrarily singling out one equal-scoring dimension.
  return known.filter(d => d.score <= cutoff && d.score < known.at(-1).score);
}
// Every occupied glyph cell is one equal unit. A partially filled last unit
// preserves the exact percentage instead of rounding it to a whole cell.
export function glyphCoverage(unitCount, value) {
  const score = glyphScore(value);
  const count = score === null ? 0 : unitCount * score / 100;
  return { full: Math.floor(count), partial: count - Math.floor(count) };
}
export function glyphCellOrder(x, y) {
  let n = Math.imul(x + 19, 374761393) ^ Math.imul(y + 37, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
