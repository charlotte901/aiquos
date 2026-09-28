/**
 * 打分实验分析：稳定性 + 区分度。
 *
 * 输入：work/scoring-study/results/raw-runs.json（scoring-study-run.mjs 产出）
 *      work/scoring-study/levels.json（盲法水平映射，只在统计阶段读取）
 * 输出：results/summary.json + 终端报告
 *
 * 两个问题：
 *   1. **稳定性**：同一份答案重复 3 次，得分是否一致（温度 0 的复现性）
 *   2. **区分度**：低/中/高三档是否被分到不同分数（评分器是否有效）
 *
 * 运行：node scripts/scoring-study-analyze.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const STUDY = join(ROOT, "work", "scoring-study");
const runs = JSON.parse(readFileSync(join(STUDY, "results", "raw-runs.json"), "utf8"));
const levels = JSON.parse(readFileSync(join(STUDY, "levels.json"), "utf8"));

const ORDER = ["low", "mid", "high"];
const LABEL = { low: "低", mid: "中", high: "高" };

// ── 按 (题, 档) 聚合 ──
const cells = new Map();     // "taskId|slot" -> [run, ...]
for (const run of runs) {
  const key = `${run.taskId}|${run.slot}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(run);
}

const taskIds = [...new Set(runs.map((r) => r.taskId))].sort();

// ── 1. 稳定性：同格多次得分的极差与标准差 ──
const stability = [];
for (const [key, list] of cells) {
  const [taskId, slot] = key.split("|");
  const scores = list.map((r) => Number(r.totalScore)).filter(Number.isFinite);
  if (scores.length < 2) continue;
  const min = Math.min(...scores), max = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  stability.push({
    taskId, slot, level: levels[taskId][slot], n: scores.length,
    scores, mean: +mean.toFixed(3), sd: +sd.toFixed(3), range: +(max - min).toFixed(2),
  });
}

const identical = stability.filter((s) => s.range === 0).length;
const meanSD = stability.reduce((a, s) => a + s.sd, 0) / stability.length;
const worstRange = Math.max(...stability.map((s) => s.range));

// ── 2. 区分度：每题三档的平均分是否单调递增 ──
const perTask = [];
for (const taskId of taskIds) {
  const byLevel = {};
  for (const level of ORDER) {
    const list = stability.filter((s) => s.taskId === taskId && s.level === level);
    byLevel[level] = list.length ? +(list.reduce((a, s) => a + s.mean, 0) / list.length).toFixed(2) : null;
  }
  const values = ORDER.map((l) => byLevel[l]);
  const monotonic = values.every((v, i) => i === 0 || v >= values[i - 1]);
  perTask.push({
    taskId, outputType: runs.find((r) => r.taskId === taskId)?.outputType,
    low: byLevel.low, mid: byLevel.mid, high: byLevel.high, monotonic,
    spread: +(byLevel.high - byLevel.low).toFixed(2),
  });
}
const monotonicCount = perTask.filter((t) => t.monotonic).length;
const meanSpread = +(perTask.reduce((a, t) => a + t.spread, 0) / perTask.length).toFixed(2);

// 相邻档是否可区分（严格大于）
const adjacent = { lowMid: 0, midHigh: 0 };
for (const t of perTask) {
  if (t.mid > t.low) adjacent.lowMid += 1;
  if (t.high > t.mid) adjacent.midHigh += 1;
}

// ── 3. 分项（提示词 / 产物）区分度：图片题的产物分是否饱和 ──
const byHalf = [];
for (const taskId of taskIds) {
  const rows = stability.filter((s) => s.taskId === taskId);
  const avg = (pick) => +(rows.reduce((a, s) => a + pick(s), 0) / rows.length).toFixed(2);
  const halfOf = (slot) => {
    const list = runs.filter((r) => r.taskId === taskId && r.slot === slot);
    const p = list.map((r) => r.promptScore).filter(Number.isFinite);
    const q = list.map((r) => r.productScore).filter(Number.isFinite);
    return {
      prompt: p.length ? +(p.reduce((a, b) => a + b, 0) / p.length).toFixed(2) : null,
      product: q.length ? +(q.reduce((a, b) => a + b, 0) / q.length).toFixed(2) : null,
    };
  };
  byHalf.push({
    taskId,
    outputType: runs.find((r) => r.taskId === taskId)?.outputType,
    low: halfOf("S1"), mid: halfOf("S2"), high: halfOf("S3"),
  });
}

const summary = {
  meta: {
    runs: runs.length,
    tasks: taskIds.length,
    repeats: Math.max(...[...cells.values()].map((l) => l.length)),
    judge: runs[0]?.judged,
    model: "deepseek-flash",
    temperature: 0,
    thinking: "disabled",
  },
  stability: {
    cells: stability.length,
    identicalCells: identical,
    identicalRate: +(identical / stability.length).toFixed(3),
    meanSD: +meanSD.toFixed(3),
    worstRange,
    detail: stability,
  },
  discrimination: {
    monotonicTasks: monotonicCount,
    totalTasks: perTask.length,
    monotonicRate: +(monotonicCount / perTask.length).toFixed(3),
    meanSpread,
    adjacent,
    detail: perTask,
  },
  halves: byHalf,
};

writeFileSync(join(STUDY, "results", "summary.json"), JSON.stringify(summary, null, 2));

// ── 终端报告 ──
console.log("═".repeat(74));
console.log("打分实验：稳定性与区分度");
console.log("═".repeat(74));
console.log(`样本：${taskIds.length} 题 × 3 档 × ${summary.meta.repeats} 次 = ${runs.length} 次打分`);
console.log(`评委：${summary.meta.judge} / ${summary.meta.model} / temperature=${summary.meta.temperature} / thinking=${summary.meta.thinking}`);

console.log(`\n【一、稳定性】同一份答案重复打分`);
console.log(`  完全一致的格子：${identical}/${stability.length}（${(summary.stability.identicalRate * 100).toFixed(1)}%）`);
console.log(`  平均标准差：${meanSD.toFixed(3)} 分（满分 20）`);
console.log(`  最大极差：${worstRange} 分`);
if (worstRange > 0) {
  console.log(`  有波动的格子：`);
  for (const s of stability.filter((s) => s.range > 0)) {
    console.log(`    ${s.taskId} ${s.slot}(${LABEL[s.level]})  ${s.scores.join(" / ")}  极差 ${s.range}`);
  }
}

console.log(`\n【二、区分度】低 → 中 → 高 是否单调递增`);
console.log(`  单调递增的题：${monotonicCount}/${perTask.length}`);
console.log(`  平均分差（高−低）：${meanSpread} 分（满分 20）`);
console.log(`  相邻档可区分：低<中 ${adjacent.lowMid}/${perTask.length}，中<高 ${adjacent.midHigh}/${perTask.length}`);
console.log(`\n  ${"题号".padEnd(10)}${"类型".padEnd(7)}${"低".padStart(7)}${"中".padStart(7)}${"高".padStart(7)}${"分差".padStart(8)}  单调`);
for (const t of perTask) {
  console.log(`  ${t.taskId.padEnd(10)}${(t.outputType === "image" ? "图片" : "文本").padEnd(7)}${String(t.low).padStart(7)}${String(t.mid).padStart(7)}${String(t.high).padStart(7)}${String(t.spread).padStart(8)}  ${t.monotonic ? "✓" : "✗"}`);
}

console.log(`\n【三、分项】提示词分 / 产物分（各 10 分）`);
console.log(`  ${"题号".padEnd(10)}${"类型".padEnd(7)}${"提示词 低/中/高".padEnd(26)}${"产物 低/中/高".padEnd(24)}`);
for (const h of byHalf) {
  const p = `${h.low.prompt}/${h.mid.prompt}/${h.high.prompt}`;
  const q = `${h.low.product}/${h.mid.product}/${h.high.product}`;
  console.log(`  ${h.taskId.padEnd(10)}${(h.outputType === "image" ? "图片" : "文本").padEnd(7)}${p.padEnd(26)}${q.padEnd(24)}`);
}

console.log(`\n明细 → work/scoring-study/results/summary.json`);
