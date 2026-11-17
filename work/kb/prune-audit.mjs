// 终审清理（2026-11-15）：按审计结论剔除两类条目，保持其余条目 id 稳定。
//   1) 同源转载重复：标题完全相同的 B站/掘金条目，同标题保留 quality 高、播放量高的一条；
//   2) 极低信号视频：播放量 < 100 且 quality < 5（无社会证明，且多为搬运号复刻）。
// 剔除记录写入 rejected/audit-pruned.jsonl（带原因），防止滚动管线 s5 重新入库；
// 备份落 work/kb/backup/（gitignore，不进 src/ 与打包）。幂等：重复跑无副作用。
//
// 用法：node work/kb/prune-audit.mjs [--dry]
import { readFileSync, writeFileSync, copyFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const dry = process.argv.includes("--dry");
const kbPath = join(repo, "src/knowledge/knowledge-base.json");
const library = JSON.parse(readFileSync(kbPath, "utf8"));

const LOW_VIEWS = 100;
const removed = new Map(); // id -> reason

const byTitle = new Map();
for (const e of library) {
  if (e.source !== "bilibili" && e.source !== "juejin.cn") continue;
  if (!byTitle.has(e.title)) byTitle.set(e.title, []);
  byTitle.get(e.title).push(e);
}
for (const group of byTitle.values()) {
  if (group.length < 2) continue;
  group.sort((a, b) => (b.quality - a.quality) || ((b.signals?.views ?? 0) - (a.signals?.views ?? 0)));
  for (const e of group.slice(1)) removed.set(e.id, `同标题重复（保留 ${group[0].id}）`);
}
for (const e of library) {
  if (e.type === "video" && (e.signals?.views ?? 0) < LOW_VIEWS && e.quality < 5 && !removed.has(e.id)) {
    removed.set(e.id, `极低信号：播放量 ${e.signals?.views ?? 0} < ${LOW_VIEWS} 且 quality<5`);
  }
}

const kept = library.filter((e) => !removed.has(e.id));
console.log(`[prune-audit] 剔除 ${removed.size} 条（重复 ${[...removed.values()].filter((r) => r.startsWith("同标题")).length}），剩 ${kept.length} 条`);
if (dry || removed.size === 0) process.exit(0);

mkdirSync(join(repo, "work/kb/backup"), { recursive: true });
copyFileSync(kbPath, join(repo, "work/kb/backup/knowledge-base.pre-audit.json"));
const log = library.filter((e) => removed.has(e.id))
  .map((e) => JSON.stringify({ id: e.id, url: e.url, title: e.title, reason: removed.get(e.id), prunedAt: "2026-11-15" }))
  .join("\n") + "\n";
appendFileSync(join(repo, "work/kb/rejected/audit-pruned.jsonl"), log);
writeFileSync(kbPath, JSON.stringify(kept, null, 2));
