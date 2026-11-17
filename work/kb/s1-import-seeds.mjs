// 管线第一层（原料导入）：把已验证的历史资产转成管线原生 raw 记录。
//   1. docs/AI学习视频资源清单-300条.csv（300 条已验证 B站视频，含维度先验）
//   2. src/report-learning-plan.js 的 LEARNING_RESOURCES（100 条，2026-10-03 做过失效体检）
// 产物：work/kb/raw/seeds-videos.jsonl、work/kb/raw/seeds-resources.jsonl
// 幂等：重跑覆盖写（非追加）。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { appendJsonl, writeJsonl, durationToMinutes, today } from "./lib.mjs";

const csvPath = fileURLToPath(new URL("../../docs/AI学习视频资源清单-300条.csv", import.meta.url));

// CSV 是带 BOM 的 quoted CSV，逐行手解析（字段不含转义引号，实测安全）。
function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) { out.push(current); current = ""; }
    else current += char;
  }
  out.push(current);
  return out.map((value) => value.trim());
}

const lines = readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "").split("\n").filter(Boolean);
const header = parseCsvLine(lines[0]);
const videos = lines.slice(1).map((line) => {
  const cells = parseCsvLine(line);
  const record = Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]));
  return {
    bvid: record["BV号"],
    title: record["标题"],
    author: record["UP主"],
    durationText: record["时长"],
    views: Number(record["播放量"]) || 0,
    pubdate: record["发布日期"],
    description: "",
    dim: record["维度"],
    dimName: record["维度名称"],
    keyword: "seed-csv",
    batch: "seeds",
    source: "bilibili",
    collectedAt: today(),
  };
}).filter((row) => row.bvid && row.bvid.startsWith("BV"));

writeJsonl(new URL("./raw/seeds-videos.jsonl", import.meta.url).pathname, videos);

// LEARNING_RESOURCES 从源码模块 import（单一真源，不复制粘贴）。
const { LEARNING_RESOURCES } = await import("../../src/report-learning-plan.js");
const resources = LEARNING_RESOURCES.map((row, index) => ({
  refId: `lr-${String(index + 1).padStart(3, "0")}`,
  title: row.title,
  platform: row.platform,
  typeLabel: row.type,
  stage: row.stage,
  dims: row.dims,
  note: row.note,
  url: row.url,
  batch: "seeds",
  collectedAt: today(),
}));

writeJsonl(new URL("./raw/seeds-resources.jsonl", import.meta.url).pathname, resources);

const durationStats = videos.map((v) => durationToMinutes(v.durationText)).filter((m) => m > 0);
console.log(`[s1] 视频种子 ${videos.length} 条（时长中位 ${durationStats.sort((a, b) => a - b)[Math.floor(durationStats.length / 2)]} 分钟）；资源种子 ${resources.length} 条`);
