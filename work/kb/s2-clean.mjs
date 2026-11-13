// 管线第二层（清洗）：raw → cleaned。去重（BV 号）、三层过滤（种子跳过①②层——
// 已人工精选过，仅保留时长门槛）、字段归一。产出 cleaned/<batch>.json + 淘汰统计。
//
// 用法：node work/kb/s2-clean.mjs --batch batch-001 [--sources bili-001,seeds]

import { readJsonIfExists, readJsonl, writeJson, durationToMinutes } from "./lib.mjs";
import { threeLayerFilter } from "./filters.mjs";
import { readdirSync } from "node:fs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const batch = argOf("batch", "batch-001");
let sources = String(argOf("sources", "")).split(",").filter(Boolean);
if (sources.length === 0) {
  sources = ["seeds", ...readdirSync(`${kbDir()}raw`).filter((name) => /^bili-.*\.jsonl$/.test(name)).map((name) => name.replace(/\.jsonl$/, ""))];
}
function kbDir() { return new URL(".", import.meta.url).pathname; }

const kb = kbDir();
const readRaw = (name) => readJsonl(`${kb}raw/${name}.jsonl`);

const biliBatches = sources.filter((name) => name.startsWith("bili-"));

const stats = { entered: 0, duplicate: 0, filtered: {} };
const cleanedVideos = [];
const seenBvid = new Map(); // bvid -> origin（先到先得，种子优先）

// 1) 种子视频（人工精选过：跳过相关性与形态层，仅时长门槛）
for (const row of readRaw("seeds-videos")) {
  if (seenBvid.has(row.bvid)) { stats.duplicate++; continue; }
  const durationMin = durationToMinutes(row.durationText);
  if (durationMin * 60 < 90) {
    stats.filtered["种子时长不足"] = (stats.filtered["种子时长不足"] ?? 0) + 1;
    continue;
  }
  seenBvid.set(row.bvid, "seed-csv");
  cleanedVideos.push({
    key: row.bvid,
    kind: "video",
    origin: "seed-csv",
    dimPrior: row.dim,
    bvid: row.bvid,
    title: row.title,
    author: row.author,
    durationMin,
    views: row.views,
    pubdate: row.pubdate,
    description: "",
  });
}

// 2) 新采批次（完整三层过滤）
for (const name of biliBatches) {
  for (const row of readRaw(name)) {
    stats.entered++;
    if (seenBvid.has(row.bvid)) { stats.duplicate++; continue; }
    const durationMin = durationToMinutes(row.durationText);
    const verdict = threeLayerFilter({ title: row.title, description: row.description, durationSec: durationMin * 60 });
    if (!verdict.pass) {
      const bucket = verdict.reason.split("：")[0];
      stats.filtered[bucket] = (stats.filtered[bucket] ?? 0) + 1;
      continue;
    }
    seenBvid.set(row.bvid, name);
    cleanedVideos.push({
      key: row.bvid,
      kind: "video",
      origin: name,
      dimPrior: row.dim,
      bvid: row.bvid,
      title: row.title,
      author: row.author,
      durationMin,
      views: row.views,
      pubdate: row.pubdate,
      description: row.description.slice(0, 300),
    });
  }
}

// 3) 网络资源种子（LEARNING_RESOURCES）
const cleanedWeb = readRaw("seeds-resources").map((row) => ({
  key: row.refId,
  kind: "web",
  origin: "seed-resources",
  dimPriors: row.dims,
  url: row.url,
  title: row.title,
  platform: row.platform,
  typeLabel: row.type,
  note: row.note,
}));

// 4) 书籍章节编目（books-crawl 产出；人工精选的开源教材，跳过三层过滤，
//    仅做 https 校验 + URL 去重）
const booksRaw = readdirSync(`${kb}raw`).includes("books.jsonl") ? readRaw("books") : [];
let bookCount = 0;
for (const row of booksRaw) {
  if (!/^https:\/\//.test(row.url)) { stats.filtered["书籍非 https"] = (stats.filtered["书籍非 https"] ?? 0) + 1; continue; }
  const key = `book:${row.url}`;
  if (seenBvid.has(key)) { stats.duplicate++; continue; }
  seenBvid.set(key, "books");
  cleanedWeb.push({
    key,
    kind: "book",
    origin: "book-catalog",
    dimPriors: row.dimPriors ?? ["D1"],
    minDifficulty: row.minDifficulty ?? null,
    url: row.url,
    title: row.title,
    platform: row.platform,
    bookId: row.bookId ?? "",
  });
  bookCount++;
}

const payload = { batch, videos: cleanedVideos, web: cleanedWeb };
writeJson(`${kb}cleaned/${batch}.json`, payload);

const byDim = {};
for (const video of cleanedVideos) byDim[video.dimPrior] = (byDim[video.dimPrior] ?? 0) + 1;
console.log(`[s2] cleaned: 视频 ${cleanedVideos.length}（种子 ${cleanedVideos.filter((v) => v.origin === "seed-csv").length} + 新采 ${cleanedVideos.length - cleanedVideos.filter((v) => v.origin === "seed-csv").length}），web ${cleanedWeb.length}（资源种子 ${cleanedWeb.length - bookCount} + 书籍章节 ${bookCount}）`);
console.log(`[s2] 维度分布: ${JSON.stringify(byDim)}`);
console.log(`[s2] 淘汰: 重复 ${stats.duplicate}，${JSON.stringify(stats.filtered)}`);
