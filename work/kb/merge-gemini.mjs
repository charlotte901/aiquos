// Gemini 工作流标注的合并与校验门（与 s3 checkTag 同一套规则）：
// 读 tagged/gemini-out/slice-*.jsonl（+ gemini-out-fixed/ 修复轮，按 key 优先），
// 与 tagged/pending/slice-*.json 的元数据拼装成 s3 同形记录，校验 + 自动修正后
// 追加进 tagged/annotations.jsonl（annotator 字段标记 gemini-3.8-flash-high 溯源）。
// 失败项写 tagged/gemini-failures.jsonl 供修复轮；--drop-failures 把二轮仍失败的
// 直接淘汰进 rejected/（同 s3 两轮协议）。退出码：0=无失败，1=有失败。
//
// 用法：node work/kb/merge-gemini.mjs [--drop-failures]

import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { subtopicsOf, subtopicById, DIFFICULTIES } from "../../src/knowledge/schema.js";

const kb = new URL(".", import.meta.url).pathname;
const annPath = `${kb}tagged/annotations.jsonl`;
const failPath = `${kb}tagged/gemini-failures.jsonl`;
const drop = process.argv.includes("--drop-failures");

const DIM_NAMES = { D1: 1, D2: 1, D3: 1, D4: 1, D5: 1, D6: 1 };
const existingKeys = new Set(
  readFileSync(annPath, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l).key; } catch { return null; } })
    .filter(Boolean),
);

const byKey = new Map(); // key -> { item, ann, slice, source }
const slices = readdirSync(`${kb}tagged/pending`).filter((f) => /^slice-\d+\.json$/.test(f));
for (const file of slices) {
  const sliceId = file.replace(/^slice-|\.json$/g, "");
  const items = JSON.parse(readFileSync(`${kb}tagged/pending/${file}`, "utf8"));
  for (const item of items) byKey.set(item.key, { item, slice: sliceId, ann: null, source: null });
}
// 标注输出：fixed 目录优先
for (const dir of ["gemini-out", "gemini-out-fixed"]) {
  const dirPath = `${kb}tagged/${dir}`;
  if (!existsSync(dirPath)) continue;
  for (const file of readdirSync(dirPath).filter((f) => /^slice-\d+\.jsonl$/.test(f))) {
    for (const line of readFileSync(`${dirPath}/${file}`, "utf8").split("\n").filter((l) => l.trim())) {
      let ann;
      try { ann = JSON.parse(line); } catch { continue; }
      const entry = byKey.get(ann.key);
      if (!entry) continue;
      entry.ann = ann;
      entry.source = dir;
    }
  }
}

const problemsOf = (item, ann) => {
  const problems = [];
  if (typeof ann.relevant !== "boolean") problems.push("relevant 必须是布尔");
  if (!Number.isFinite(Number(ann.quality)) || ann.quality < 1 || ann.quality > 5) problems.push("quality 必须 1-5");
  if (!DIFFICULTIES.includes(ann.difficulty)) problems.push(`difficulty 必须是 ${DIFFICULTIES.join("/")}`);
  if (!Array.isArray(ann.dims) || ann.dims.length < 1 || ann.dims.length > 2 || ann.dims.some((key) => !DIM_NAMES[key])) problems.push("dims 必须 1-2 个合法维度键");
  const topic = subtopicsOf(item.dimPrior).find((t) => t.id === ann.subtopic);
  if (!topic) problems.push(`subtopic 必须从 ${item.dimPrior} 枚举域中选`);
  else if (Array.isArray(ann.dims) && !ann.dims.includes(topic.dim)) problems.push("subtopic 的维度必须在 dims 内");
  if (!ann.summary || String(ann.summary).length < 8) problems.push("summary 太短");
  if (!ann.why || String(ann.why).length < 8) problems.push("why 太短");
  return { problems, topic };
};

// 书籍难度下限（同 s3）
const RANK = { low: 0, medium: 1, high: 2 };

const merged = [];
const failures = [];
for (const [key, entry] of byKey) {
  const { item, ann, slice, source } = entry;
  if (existingKeys.has(key)) continue; // 幂等：已标注过
  if (!ann) { failures.push({ key, slice, problems: ["无输出"], title: item.title }); continue; }
  let { problems, topic } = problemsOf(item, ann);
  // 自动修正（同 s3）：subtopic 合法但与 dims 脱节 → 信任 subtopic 的维度归属
  if (problems.every((p) => p === "subtopic 的维度必须在 dims 内" || p.startsWith("subtopic 必须从")) && topic) {
    ann.dims = [topic.dim, ...(Array.isArray(ann.dims) ? ann.dims.filter((k) => k !== topic.dim) : [])].slice(0, 2);
    problems = problemsOf(item, ann).problems;
    topic = subtopicById(ann.subtopic);
  }
  if (problems.length === 0 && item.kind === "book" && item.minDifficulty && RANK[ann.difficulty] < RANK[item.minDifficulty]) {
    ann.difficulty = item.minDifficulty;
  }
  if (problems.length > 0) { failures.push({ key, slice, problems, title: item.title, ann }); continue; }
  // 视频 url/bvid：cleaned 层视频条目没有 url 字段，从 key（即 BV 号）构造
  const bvid = item.kind === "video" ? (key.match(/^BV[0-9A-Za-z]+/) ? key : (String(item.url).match(/BV[0-9A-Za-z]+/)?.[0] ?? null)) : null;
  const url = item.url ?? (bvid ? `https://www.bilibili.com/video/${bvid}` : null);
  if (!url) { failures.push({ key, slice, problems: ["无法构造 url"], title: item.title }); continue; }
  merged.push({
    key, kind: item.kind, origin: `gemini-${slice}`, dimPrior: item.kind === "video" ? item.dimPrior : item.dimPrior,
    bvid, url, title: item.title, author: item.author ?? item.platform ?? "",
    type: item.kind === "video" ? "video" : item.kind === "book" ? "book_chapter" : item.kind === "article" ? "article" : "doc",
    platform: item.platform ?? "bilibili", durationMin: item.durationMin ?? null, views: item.views ?? null,
    pubdate: item.pubdate || null,
    relevant: ann.relevant, quality: Number(ann.quality), difficulty: ann.difficulty,
    dims: ann.dims, subtopic: ann.subtopic, summary: String(ann.summary).slice(0, 120), why: String(ann.why).slice(0, 120),
    taggedAt: new Date().toISOString().slice(0, 10), annotator: "gemini-3.8-flash-high",
  });
}

if (merged.length) appendFileSync(annPath, merged.map((r) => JSON.stringify(r)).join("\n") + "\n");

const failSlices = [...new Set(failures.map((f) => f.slice))];
if (drop && failures.length) {
  appendFileSync(`${kb}rejected/gemini-drop.jsonl`, failures.map((f) => JSON.stringify({ ...f, droppedAt: new Date().toISOString().slice(0, 10) })).join("\n") + "\n");
  writeFileSync(failPath, "");
} else {
  writeFileSync(failPath, JSON.stringify(failures, null, 1));
}

console.log(`MERGE_RESULT ${JSON.stringify({ merged: merged.length, failed: failures.length, failSlices, pendingTotal: byKey.size })}`);
process.exit(failures.length === 0 || drop ? 0 : 1);
