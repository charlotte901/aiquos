// 阶段 6 死链剔除：从 src/knowledge/knowledge-base.json 移除 rejected/dead.jsonl
// 里的条目（按 url / bvid 双键匹配），保持其余条目 id 稳定不动。
// 幂等：重复跑无副作用。剔除后需重建 rec-index（scripts/build-knowledge-index.mjs）。
//
// 用法：node work/kb/prune-dead.mjs
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const library = JSON.parse(readFileSync(join(repo, "src/knowledge/knowledge-base.json"), "utf8"));
const dead = readFileSync(join(repo, "work/kb/rejected/dead.jsonl"), "utf8")
  .split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
const deadUrls = new Set(dead.map((row) => row.url).filter(Boolean));
const deadBvids = new Set(dead.map((row) => row.bvid).filter(Boolean));

const kept = library.filter((entry) => {
  if (deadUrls.has(entry.url)) return false;
  const bvid = String(entry.url).match(/BV[0-9A-Za-z]+/)?.[0];
  return !(bvid && deadBvids.has(bvid));
});

const removed = library.length - kept.length;
if (removed > 0) {
  copyFileSync(join(repo, "src/knowledge/knowledge-base.json"), join(repo, "src/knowledge/knowledge-base.backup.json"));
  writeFileSync(join(repo, "src/knowledge/knowledge-base.json"), JSON.stringify(kept, null, 2));
}
console.log(`[prune] 剔除 ${removed} 条死链，全库剩 ${kept.length} 条（备份 knowledge-base.backup.json）`);
