// 阶段 6 人工抽检辅助：从入库知识库分层抽样 10%（按 type 分层，层内按维度均匀），
// 生成 work/kb/audit-sample.md 抽检清单（含核验要点与勾选栏）。
// 抽样是确定性的（按 id 排序后等距取样），重跑结果一致。
//
// 用法：node work/kb/audit-sample.mjs [--rate 0.1]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const rate = Number(args.includes("--rate") ? args[args.indexOf("--rate") + 1] : 0.1);
const repo = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const library = JSON.parse(readFileSync(join(repo, "src/knowledge/knowledge-base.json"), "utf8"));

const BY_TYPE = ["video", "book_chapter", "doc", "article"];
const groups = Object.fromEntries(BY_TYPE.map((type) => [type, []]));
for (const entry of library) (groups[entry.type] ??= []).push(entry);

const pick = (list, n) => {
  const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
  if (n >= sorted.length) return sorted;
  const step = sorted.length / n;
  return Array.from({ length: n }, (_, i) => sorted[Math.floor(i * step)]);
};

const lines = [
  "# 知识库人工抽检记录",
  "",
  `- 抽检时间：${new Date().toISOString().slice(0, 10)}`,
  `- 全库：${library.length} 条；抽检比例：${(rate * 100).toFixed(0)}%（按类型分层、层内按维度均匀）`,
  "",
  "核验口径（逐条勾选）：",
  "1. 链接可访问且内容与标题相符；",
  "2. dims/subtopic 与内容主旨一致；",
  "3. difficulty 分档合理（low 零基础 / medium 需基础概念 / high 专业深水区）；",
  "4. summary 与 why 准确、无编造；",
  "5. 视频时长/播放量与 signals 相符（抽样开 B 站页面对照）。",
  "",
];

let totalPicked = 0;
for (const type of BY_TYPE) {
  const group = groups[type] ?? [];
  if (!group.length) { lines.push(`## ${type}（0 条，跳过）`, ""); continue; }
  const n = Math.max(1, Math.round(group.length * rate));
  const sample = pick(group, n);
  totalPicked += sample.length;
  lines.push(`## ${type}（全库 ${group.length} 条 → 抽 ${sample.length} 条）`, "");
  lines.push("| id | 标题 | dims | 子主题 | 难度 | 链接 | 通过? | 备注 |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const entry of sample) {
    const title = entry.title.replace(/\|/g, "\\|");
    const url = entry.url.replace(/\|/g, "%7C");
    lines.push(`| ${entry.id} | ${title.slice(0, 46)} | ${entry.dims.join("/")} | ${entry.subtopic} | ${entry.difficulty} | ${url} | ☐ | |`);
  }
  lines.push("");
}

lines.push(`抽检合计：${totalPicked} 条。结论（合格率、发现的问题与处理）：`, "");
lines.push("（待人工填写）");

const outPath = join(repo, "work/kb/audit-sample.md");
writeFileSync(outPath, lines.join("\n"));
console.log(`[audit] 抽检清单 ${totalPicked} 条（全库 ${library.length}）→ ${outPath}`);
