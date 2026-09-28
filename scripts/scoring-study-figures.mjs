/**
 * 打分实验图表（纯 SVG，无外部依赖）。
 * 产出：
 *   fig1_stability.svg  稳定性：30 个格子 × 3 次重复的得分波动
 *   fig2_discrimination.svg  区分度：每题低/中/高三档平均分
 *   fig3_halves.svg     分项：提示词分 vs 产物分 的区分度对比
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const STUDY = join(ROOT, "work", "scoring-study");
const FIGS = join(STUDY, "figures");
mkdirSync(FIGS, { recursive: true });

const summary = JSON.parse(readFileSync(join(STUDY, "results", "summary.json"), "utf8"));
const { stability, discrimination, halves } = summary;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "font-family='-apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Hiragino Sans GB\",sans-serif'";
const PALETTE = { low: "#dc2626", mid: "#d97706", high: "#16a34a", grid: "#e5e7eb", axis: "#9ca3af", text: "#374151" };

function frame(w, h, title, subtitle) {
  return {
    head: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <text x="28" y="34" ${FONT} font-size="19" font-weight="700" fill="#111827">${esc(title)}</text>
  <text x="28" y="58" ${FONT} font-size="13" fill="#6b7280">${esc(subtitle)}</text>`,
    tail: `</svg>`,
  };
}

// ── 图 1：稳定性（每题三档的 3 次重复散点）──
{
  const rows = stability.detail;
  const W = 1100, rowH = 26, top = 96, left = 150, right = 80;
  const H = top + rows.length * rowH + 60;
  const chartW = W - left - right;
  const x = (score) => left + (score / 20) * chartW;
  const f = frame(W, H, "图 1 · 稳定性：同一份答案重复 3 次打分的波动", "横轴 = 总分（满分 20）；同一行的 3 个点越集中越稳定；温度 0 + 关闭思考");

  const parts = [f.head];
  // 网格与刻度
  for (let s = 0; s <= 20; s += 5) {
    parts.push(`<line x1="${x(s)}" y1="${top - 12}" x2="${x(s)}" y2="${top + rows.length * rowH - 8}" stroke="${PALETTE.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${x(s)}" y="${top - 18}" ${FONT} font-size="11" fill="${PALETTE.axis}" text-anchor="middle">${s}</text>`);
  }
  rows.forEach((row, i) => {
    const y = top + i * rowH;
    const color = PALETTE[row.level];
    parts.push(`<text x="${left - 12}" y="${y + 4}" ${FONT} font-size="11.5" fill="${PALETTE.text}" text-anchor="end">${esc(row.taskId)} ${esc(row.slot)}</text>`);
    // 极差区间
    const lo = Math.min(...row.scores), hi = Math.max(...row.scores);
    if (hi > lo) {
      parts.push(`<rect x="${x(lo)}" y="${y - 7}" width="${x(hi) - x(lo)}" height="14" fill="${color}" opacity="0.16" rx="3"/>`);
    }
    // 三次得分点（同分错开显示）
    const seen = {};
    for (const s of row.scores) {
      const k = String(s);
      const jitter = (seen[k] = (seen[k] ?? -1) + 1);
      const cy = y + jitter * 3.6 - 3.6;
      parts.push(`<circle cx="${x(s)}" cy="${cy}" r="5.2" fill="${color}" opacity="0.9"/>`);
    }
    parts.push(`<text x="${x(hi) + 12}" y="${y + 4}" ${FONT} font-size="11" fill="${PALETTE.text}">极差 ${row.range}</text>`);
  });
  // 图例
  const lx = left, ly = top + rows.length * rowH + 22;
  [["low", "低档"], ["mid", "中档"], ["high", "高档"]].forEach(([k, label], i) => {
    parts.push(`<circle cx="${lx + i * 96}" cy="${ly}" r="5.2" fill="${PALETTE[k]}"/>`);
    parts.push(`<text x="${lx + i * 96 + 12}" y="${ly + 4}" ${FONT} font-size="12" fill="${PALETTE.text}">${label}</text>`);
  });
  parts.push(`<text x="${W - 28}" y="${H - 16}" ${FONT} font-size="12" fill="#6b7280" text-anchor="end">30 格中 ${stability.identicalCells} 格三次完全一致（${(stability.identicalRate * 100).toFixed(0)}%），平均标准差 ${stability.meanSD} 分</text>`);
  parts.push(f.tail);
  writeFileSync(join(FIGS, "fig1_stability.svg"), parts.join("\n"));
}

// ── 图 2：区分度（每题三档平均分 + 分差）──
{
  const rows = discrimination.detail;
  const W = 1100, rowH = 34, top = 100, left = 120, right = 220;
  const H = top + rows.length * rowH + 70;
  const chartW = W - left - right;
  const x = (score) => left + (score / 20) * chartW;
  const f = frame(W, H, "图 2 · 区分度：低 / 中 / 高 三档的平均分", "同一题的三档用同色系深浅连接；理想结果是三点依次向右（越右分越高）");

  const parts = [f.head];
  for (let s = 0; s <= 20; s += 5) {
    parts.push(`<line x1="${x(s)}" y1="${top - 12}" x2="${x(s)}" y2="${top + rows.length * rowH - 8}" stroke="${PALETTE.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${x(s)}" y="${top - 18}" ${FONT} font-size="11" fill="${PALETTE.axis}" text-anchor="middle">${s}</text>`);
  }
  rows.forEach((row, i) => {
    const y = top + i * rowH;
    const values = [row.low, row.mid, row.high];
    parts.push(`<text x="${left - 12}" y="${y + 4}" ${FONT} font-size="11.5" fill="${PALETTE.text}" text-anchor="end">${esc(row.taskId)}</text>`);
    parts.push(`<line x1="${x(values[0])}" y1="${y}" x2="${x(values[2])}" y2="${y}" stroke="#cbd5e1" stroke-width="2"/>`);
    const colors = [PALETTE.low, PALETTE.mid, PALETTE.high];
    values.forEach((v, k) => {
      parts.push(`<circle cx="${x(v)}" cy="${y}" r="6" fill="${colors[k]}"/>`);
      parts.push(`<text x="${x(v)}" y="${y - 11}" ${FONT} font-size="10.5" fill="${colors[k]}" text-anchor="middle">${v}</text>`);
    });
    parts.push(`<text x="${W - 28}" y="${y + 4}" ${FONT} font-size="11.5" fill="${PALETTE.text}" text-anchor="end">分差 ${row.spread}${row.monotonic ? "  ✓单调" : "  ✗"}</text>`);
  });
  parts.push(f.tail);
  writeFileSync(join(FIGS, "fig2_discrimination.svg"), parts.join("\n"));
}

// ── 图 3：分项对比（提示词 vs 产物）──
{
  const rows = halves;
  const W = 1100, groupH = 56, top = 104;
  const H = top + rows.length * groupH + 80;
  const left = 172, right = 90;
  const chartW = W - left - right;
  const barW = chartW / 10;          // 满分 10，每分一个单位
  const x = (v) => left + (v / 10) * chartW;
  const f = frame(W, H, "图 3 · 分项：提示词分与产物分的区分度（各 10 分）", "每组上排=提示词分，下排=产物分；产物分若三档贴在一起（尤其图片题），说明该半区无法区分水平");

  const parts = [f.head];
  for (let s = 0; s <= 10; s += 2) {
    parts.push(`<line x1="${x(s)}" y1="${top - 14}" x2="${x(s)}" y2="${top + rows.length * groupH - 14}" stroke="${PALETTE.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${x(s)}" y="${top - 20}" ${FONT} font-size="11" fill="${PALETTE.axis}" text-anchor="middle">${s}</text>`);
  }
  rows.forEach((row, i) => {
    const y = top + i * groupH;
    parts.push(`<text x="${left - 44}" y="${y + 16}" ${FONT} font-size="11.5" fill="${PALETTE.text}" text-anchor="end">${esc(row.taskId)}</text>`);
    const bands = [
      { key: "prompt", label: "提示词", y: y },
      { key: "product", label: "产物", y: y + 22 },
    ];
    for (const band of bands) {
      const vals = [row.low[band.key], row.mid[band.key], row.high[band.key]].map((v) => (v === null ? 0 : v));
      parts.push(`<text x="${left - 6}" y="${band.y + 13}" ${FONT} font-size="10.5" fill="#6b7280" text-anchor="end">${band.label}</text>`);
      const colors = [PALETTE.low, PALETTE.mid, PALETTE.high];
      vals.forEach((v, k) => {
        const segX = left + ((k * 10) / 3 / 10) * chartW * 0;   // 不堆叠，改用并列
      });
      // 三个小条并列显示该分项的三档
      const slotW = chartW / 3.4;
      vals.forEach((v, k) => {
        const segX = left + k * slotW;
        const w = (v / 10) * (slotW - 14);
        parts.push(`<rect x="${segX}" y="${band.y + 2}" width="${Math.max(2, w)}" height="14" rx="3" fill="${colors[k]}" opacity="0.85"/>`);
        parts.push(`<text x="${segX + w + 5}" y="${band.y + 13}" ${FONT} font-size="10" fill="${colors[k]}">${v}</text>`);
      });
    }
  });
  parts.push(f.tail);
  writeFileSync(join(FIGS, "fig3_halves.svg"), parts.join("\n"));
}

console.log("已生成：");
console.log("  work/scoring-study/figures/fig1_stability.svg");
console.log("  work/scoring-study/figures/fig2_discrimination.svg");
console.log("  work/scoring-study/figures/fig3_halves.svg");
