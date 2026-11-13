// 管线第五层（入库）：verified → src/knowledge/knowledge-base.json。
// 三道门（schema.admitKnowledgeEntry）：schema 合法 + quality≥4 + 已过失效体检
// （verifiedAt 存在）+ 视频播放量门槛（--min-video-views，新采批次用，种子默认 0）。
// 幂等：按 url 去重，重跑只补新条目；淘汰条目进 rejected/admit-no.jsonl 带原因。
//
// 用法：node work/kb/s5-ingest.mjs --batch batch-001 [--min-video-views 1000]

import {
  admitKnowledgeEntry, BAND_OF_DIFFICULTY, findDuplicates, checkDimensionQuotas,
} from "../../src/knowledge/schema.js";
import { readJson, readJsonIfExists, appendJsonl, writeJson, today } from "./lib.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const batch = argOf("batch", "batch-001");
const minVideoViews = Number(argOf("min-video-views", "0"));

const kb = new URL(".", import.meta.url).pathname;
const repo = new URL("../../src/knowledge/", import.meta.url).pathname;
const libPath = `${repo}knowledge-base.json`;
const verified = readJson(`${kb}verified/${batch}.json`);
const library = readJsonIfExists(libPath) ?? [];
const existingUrls = new Set(library.map((entry) => entry.url));

let nextId = library.reduce((max, entry) => Math.max(max, Number(entry.id.slice(3))), 0);
const admitStats = { entered: 0, duplicate: 0, rejected: {} };
const rejectPath = `${kb}rejected/admit-no.jsonl`;
const rejects = [];

const toEntry = (row) => ({
  // id 用占位符过门检，通过后回填连续编号（被淘汰条目不占号）
  id: "kb-000000",
  title: String(row.title).trim().slice(0, 200),
  url: row.url,
  source: row.kind === "video" ? "bilibili" : row.kind === "book" ? String(row.author || row.platform || "web") : String(row.platform ?? "web"),
  type: row.type ?? (row.kind === "video" ? "video" : "doc"),
  dims: row.dims,
  subtopic: row.subtopic,
  difficulty: row.difficulty,
  band: BAND_OF_DIFFICULTY[row.difficulty],
  summary: row.summary,
  why: row.why,
  quality: Number(row.quality),
  signals: {
    ...(row.views != null ? { views: Number(row.views) } : {}),
    ...(row.durationMin ? { durationMin: row.durationMin } : {}),
    ...(row.pubdate ? { date: row.pubdate } : {}),
    verifiedAt: row.verifiedAt ?? today(),
  },
});

for (const row of [...(verified.videos ?? []), ...(verified.webs ?? [])]) {
  if (existingUrls.has(row.url)) { admitStats.duplicate++; continue; }
  const entry = toEntry(row);
  const verdict = admitKnowledgeEntry(entry, { minQuality: 4, minViews: row.kind === "video" ? minVideoViews : 0 });
  if (!verdict.ok) {
    const reason = verdict.reasons[0];
    admitStats.rejected[reason] = (admitStats.rejected[reason] ?? 0) + 1;
    rejects.push({ key: row.key ?? entry.id, url: entry.url, title: entry.title, reasons: verdict.reasons, batch, rejectedAt: today() });
    continue;
  }
  entry.id = `kb-${String(++nextId).padStart(6, "0")}`;
  library.push(entry);
  existingUrls.add(entry.url);
  admitStats.entered++;
}

// 全库守卫：id/url 唯一（findDuplicates 只报告，重复说明上游 bug，直接抛错拦截）
const duplicates = findDuplicates(library);
if (duplicates.duplicateIds.length || duplicates.duplicateUrls.length) {
  throw new Error(`全库出现重复：ids=${duplicates.duplicateIds.slice(0, 3)} urls=${duplicates.duplicateUrls.slice(0, 3)}`);
}

writeJson(libPath, library);
if (rejects.length) appendJsonl(rejectPath, rejects);

const dimCount = {};
for (const entry of library) for (const dim of entry.dims) dimCount[dim] = (dimCount[dim] ?? 0) + 1;
const quota = checkDimensionQuotas(library);
console.log(`[s5] 批次 ${batch}：入库 ${admitStats.entered}，url 重复跳过 ${admitStats.duplicate}，淘汰 ${rejects.length}`);
console.log(`[s5] 淘汰原因：${JSON.stringify(admitStats.rejected)}`);
console.log(`[s5] 全库 ${library.length} 条（ids 编号至 kb-${String(nextId).padStart(6, "0")}）`);
console.log(`[s5] 全库六维分布：${JSON.stringify(dimCount)}`);
console.log(`[s5] 六维配额（终检 ≥600/维）：${quota.ok ? "已达标" : `未达标 ${quota.missing.join(",")}（阶段 3-5 扩量后复核）`}`);
