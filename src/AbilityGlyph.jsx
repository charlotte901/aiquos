import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GLYPH_WORDS, glyphScore, glyphPriorities, glyphCoverage, glyphCellOrder } from "./ability-glyph";

const glyphCache = new Map();
const SIZE = 4.5, STEP = 5.5, GROUPS = 18;
function sampleGlyph(word) {
  if (glyphCache.has(word)) return glyphCache.get(word);
  const canvas = document.createElement("canvas");
  canvas.width = 280; canvas.height = 148;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "white";
  ctx.font = '700 128px "Noto Sans SC", sans-serif';
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(word, 140, 122);
  const image = ctx.getImageData(0, 0, 280, 148).data;
  const cells = [];
  for (let y = 3; y < 143; y += STEP) for (let x = 3; x < 275; x += STEP) {
    const px = Math.round(x + SIZE / 2), py = Math.round(y + SIZE / 2);
    if (image[(py * 280 + px) * 4 + 3] > 100) cells.push({ x, y, rank: glyphCellOrder(Math.round(x), Math.round(y)) });
  }
  cells.sort((a,b) => a.rank - b.rank);
  glyphCache.set(word, cells);
  return cells;
}
const cellPath = ({ x, y }, width = SIZE) => `M${x.toFixed(2)},${y.toFixed(2)}h${width.toFixed(3)}v${SIZE}h${(-width).toFixed(3)}Z`;
const edgePath = ({ x, y }, width = SIZE) => `M${x.toFixed(2)},${(y + SIZE).toFixed(2)}v-${SIZE}h${width.toFixed(3)}`;

function GlyphDrawing({ word, score, ready, amber, index }) {
  const id = useId().replace(/:/g, "");
  const light = useRef(null);
  const paths = useMemo(() => {
    if (!ready) return null;
    const cells = sampleGlyph(word);
    if (!cells?.length) return null;
    const { full, partial } = glyphCoverage(cells.length, score);
    const cohorts = Array.from({ length: GROUPS }, () => ({ faces: [], edges: [] }));
    const addCell = (cell, width = SIZE) => {
      const group = Math.min(GROUPS - 1, Math.floor(cell.x / 280 * GROUPS));
      cohorts[group].faces.push(cellPath(cell, width));
      cohorts[group].edges.push(edgePath(cell, width));
    };
    cells.slice(0, full).forEach(cell => addCell(cell));
    if (partial > 0) addCell(cells[full], SIZE * partial);
    return {
      cohorts: cohorts.map(group => ({ faces: group.faces.join(""), edges: group.edges.join("") })),
      empty: cells.slice(full).map(cell => cellPath(cell)).join(""),
      full: cohorts.map(group => group.faces.join("")).join(""), count: cells.length,
    };
  }, [word, score, ready]);
  const moveLight = event => {
    if (event.pointerType === "touch" || !light.current) return;
    const svg = event.currentTarget, matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    light.current.setAttribute("cx", local.x.toFixed(1));
    light.current.setAttribute("cy", local.y.toFixed(1));
  };
  return <svg viewBox="0 0 280 148" className="glyph-drawing" aria-hidden="true" data-units={paths?.count ?? 0} onPointerMove={moveLight}>
    <defs>
      <linearGradient id={`${id}-ink`} x1="0" y1="0" x2=".5" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor={amber ? "#dcad59" : "#81b65b"} /><stop offset=".3" stopColor={amber ? "#bb8732" : "#4c903d"} /><stop offset=".72" stopColor={amber ? "#9c6a26" : "#296936"} /><stop offset="1" stopColor={amber ? "#865b23" : "#1c4c2c"} />
      </linearGradient>
      <radialGradient id={`${id}-light`} ref={light} cx="140" cy="60" r="85" gradientUnits="userSpaceOnUse"><stop stopColor="#fffde2" stopOpacity=".85" /><stop offset=".5" stopColor="#fffde2" stopOpacity=".24" /><stop offset="1" stopColor="#fffde2" stopOpacity="0" /></radialGradient>
      <clipPath id={`${id}-solid`}><path d={paths?.full ?? ""} /></clipPath>
    </defs>
    {!paths ? <text x="140" y="122" textAnchor="middle" className="glyph-fallback">{word}</text> : <>
      <path d={paths.empty} className="glyph-vacancies" />
      {paths.cohorts.map((group, band) => <g key={band} className="glyph-fragment" style={{ "--from-x": `${(band - 8.5) * 1.6}px`, "--from-y": `${16 + (band % 3) * 9}px`, "--from-angle": `${(band % 2 ? 1 : -1) * 4}deg`, "--fragment-delay": `${index * 70 + band * 27}ms` }}>
        <path d={group.faces} transform="translate(.65 1.65)" fill={amber ? "#614218" : "#153f26"} opacity=".8" />
        <path d={group.faces} fill={`url(#${id}-ink)`} />
        <path d={group.edges} className="glyph-bevel" />
      </g>)}
      <g clipPath={`url(#${id}-solid)`}>
        <rect className="glyph-light" width="280" height="148" fill={`url(#${id}-light)`} />
        <path className="glyph-shimmer" d="M-90 -15H-64L-10 165H-36Z" style={{ "--shine-delay": `${1200 + index * 70}ms` }} />
      </g>
    </>}
  </svg>;
}

export function AbilityGlyph({ dimensions, isDemo }) {
  const host = useRef(null);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [previewKey, setPreviewKey] = useState(null);
  const priorities = glyphPriorities(dimensions);
  const priorityKeys = new Set(priorities.map(d => d.key));
  const scoreKey = dimensions.map(d => `${d.key}:${d.score}`).join("|");
  const lowest = priorities[0];
  const activeKey = previewKey ?? selectedKey ?? lowest?.key ?? dimensions[0]?.key;
  const selected = dimensions.find(d => d.key === activeKey);
  const priorityLabel = lowest?.score >= 90 ? "继续精进" : "优先提升";

  useEffect(() => {
    let disposed = false;
    Promise.all([document.fonts.load('700 128px "Noto Sans SC"', "认知提示工具评估协同伦理"), document.fonts.ready]).then(() => {
      if (!disposed) setReady(true);
    }).catch(() => { if (!disposed) setReady(true); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!window.IntersectionObserver) { setEntered(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => setEntered(entry.isIntersecting), { threshold: .08 });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setSelectedKey(null); setPreviewKey(null); }, [scoreKey]);

  const summary = priorities.length
    ? `${priorityLabel}：${priorities.map(d => GLYPH_WORDS[d.key] ?? d.short ?? d.name).join("、")}`
    : dimensions.some(d => glyphScore(d.score) === null) ? "部分维度暂无得分"
    : dimensions.every(d => glyphScore(d.score) === 100) ? "六维满分，继续挑战更高难度。"
    : "六维均衡，选择一个真实任务继续练习。";

  return <figure ref={host} className={`ability-glyph ${ready && entered ? "glyph-entered" : ""}`} aria-label={`六维能力字像${isDemo ? "，演示数据" : ""}`}>
    <div className="glyph-overview">
      <div className="glyph-reading"><span className="glyph-reading-label">成长方向</span><strong>{summary}</strong></div>
      <div className="glyph-legend" aria-label="实心表示已有积累，空心表示距满分的空间"><span><i />已有积累</span><span><i />成长空间</span></div>
    </div>
    <div className="glyph-grid" onPointerLeave={() => setPreviewKey(null)}>
      {dimensions.map((dimension, index) => {
        const score = glyphScore(dimension.score), amber = priorityKeys.has(dimension.key);
        return <button key={dimension.key} type="button" className={`glyph-tile${amber ? " is-priority" : ""}${activeKey === dimension.key ? " is-active" : ""}${selectedKey === dimension.key ? " is-selected" : ""}`} aria-pressed={selectedKey === dimension.key} aria-label={`${dimension.name}，${score ?? "暂无"}分${amber ? `，${priorityLabel}` : ""}，查看提升建议`} onPointerEnter={event => { if (event.pointerType !== "touch") setPreviewKey(dimension.key); }} onFocus={() => setPreviewKey(dimension.key)} onBlur={() => setPreviewKey(null)} onClick={() => setSelectedKey(current => current === dimension.key ? null : dimension.key)}>
          <div className="glyph-tile-head"><span>{dimension.name}</span><strong>{score ?? "—"}<small>/100</small></strong></div>
          <div className="glyph-stage"><GlyphDrawing word={GLYPH_WORDS[dimension.key] ?? dimension.short ?? "能力"} score={score} ready={ready} amber={amber} index={index} /></div>
          <div className="glyph-tile-foot"><span>{amber ? <><i />{priorityLabel}</> : score === null ? "暂无得分" : score === 100 ? "已达满分" : score >= 80 ? "当前优势" : "继续积累"}</span><span>{score === null ? "完成测评后生成" : `距满分 ${Math.round((100 - score) * 10) / 10} 分`}</span></div>
        </button>;
      })}
    </div>
    <figcaption className={`glyph-caption${selected && priorityKeys.has(selected.key) ? " is-priority" : ""}`} aria-live="polite">
      <div><span>{selected && priorityKeys.has(selected.key) ? "建议先练" : "练习方向"}</span><strong>{selected?.name ?? "六维能力"}</strong></div>
      <p>{selected && glyphScore(selected.score) !== null ? selected.advice || "选择一个与这一维相关的真实任务，完成后核对结果。" : "完成测评后，这里会生成与你的分数对应的提升建议。"}</p>
    </figcaption>
  </figure>;
}
