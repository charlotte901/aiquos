/**
 * 知识库推荐索引构建（构建期预计算，运行时零开销）。
 * 读 src/knowledge/knowledge-base.json，按「维度 × 难度档 × 处方变体」生成槽位表
 * src/knowledge/rec-index.json：
 *   - 18 个档位槽（D1-D6 × low/medium/high，band 与 difficulty 成对）；
 *   - 每槽 5 个变体：balanced（无落差默认）+ 4 种通道落差处方
 *     （concept=概念补课 / express=经验显性化 / practice=任务演练 / systematic=系统补基础），
 *     变体只影响类型偏好权重，候选集相同；
 *   - 每槽按「类型匹配 + quality + 热度」排序取 top 槽容量（默认 8）；
 *   - entries 只存被引用条目的精简版，控制体积（全库 5000 条时 ~250KB）。
 * 运行：node scripts/build-knowledge-index.mjs [--slot-size 8]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIFFICULTY_OF_BAND, validateKnowledgeEntry } from "../src/knowledge/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const args = new Map(process.argv.slice(2).filter((_, i) => i % 2 === 0).map((arg, i, all) => [arg.replace(/^--/, ""), all[i + 1]]));
const slotSize = Number(args.get("slot-size") ?? 8);

// 处方变体 → 类型偏好（顺序即权重）。与 report-recommendations 的 GAP_PATTERNS 对齐：
// talk-strong(对话≫客观=概念补课) → concept；do-strong(客观≫对话=经验显性化) → express；
// knowledge-gap(客观≫实操=任务演练) → practice；skill-gap(实操≫客观=系统补基础) → systematic。
const VARIANTS = {
  balanced: ["video", "doc", "article", "book_chapter", "exercise"],
  concept: ["doc", "article", "video", "book_chapter", "exercise"],
  express: ["article", "video", "doc", "book_chapter", "exercise"],
  practice: ["video", "exercise", "doc", "article", "book_chapter"],
  systematic: ["book_chapter", "doc", "video", "article", "exercise"],
};

const DIMS = ["D1", "D2", "D3", "D4", "D5", "D6"];
const DIFFS = ["low", "medium", "high"];

const library = JSON.parse(readFileSync(join(repo, "src/knowledge/knowledge-base.json"), "utf8"));
const invalid = library.filter((entry) => !validateKnowledgeEntry(entry).ok);
if (invalid.length) {
  console.error(`[kb-index] 知识库有 ${invalid.length} 条非法条目（如 ${invalid[0].id}: ${validateKnowledgeEntry(invalid[0]).errors[0]}），先修复再构建`);
  process.exit(1);
}

const scoreOf = (entry, typeOrder) =>
  (typeOrder.indexOf(entry.type) === -1 ? typeOrder.length : typeOrder.indexOf(entry.type)) * 10
  + entry.quality * 2
  + Math.log10((entry.signals?.views ?? 0) + 1) * 0.5;

const slots = {};
const usedIds = new Set();
const coverage = {};
for (const dim of DIMS) {
  coverage[dim] = {};
  for (const diff of DIFFS) {
    const pool = library.filter((entry) => entry.dims.includes(dim) && entry.difficulty === diff);
    coverage[dim][diff] = pool.length;
    for (const [variant, typeOrder] of Object.entries(VARIANTS)) {
      const ranked = [...pool]
        .sort((a, b) => scoreOf(b, typeOrder) - scoreOf(a, typeOrder) || a.id.localeCompare(b.id))
        .slice(0, slotSize);
      slots[`${dim}:${diff}:${variant}`] = ranked.map((entry) => entry.id);
      for (const entry of ranked) usedIds.add(entry.id);
    }
  }
}

const entries = {};
for (const entry of library) {
  if (!usedIds.has(entry.id)) continue;
  entries[entry.id] = {
    id: entry.id,
    title: entry.title,
    url: entry.url,
    source: entry.source,
    type: entry.type,
    dims: entry.dims,
    subtopic: entry.subtopic,
    summary: entry.summary,
    why: entry.why,
    quality: entry.quality,
    ...(entry.signals?.durationMin ? { durationMin: entry.signals.durationMin } : {}),
    ...(entry.signals?.views != null ? { views: entry.signals.views } : {}),
  };
}

const output = {
  builtAt: new Date().toISOString(),
  librarySize: library.length,
  slotSize,
  variants: Object.keys(VARIANTS),
  slots,
  entries,
};
writeFileSync(join(repo, "src/knowledge/rec-index.json"), JSON.stringify(output));

const emptySlots = Object.entries(slots).filter(([, ids]) => ids.length === 0).map(([key]) => key);
console.log(`[kb-index] 全库 ${library.length} 条 → 槽位 ${Object.keys(slots).length} 个（每槽容量 ${slotSize}），引用条目 ${usedIds.size} 条，体积 ${(JSON.stringify(output).length / 1024).toFixed(0)}KB`);
console.log(`[kb-index] 档位覆盖（维×难度 候选数）：${DIMS.map((dim) => `${dim}=${DIFFS.map((diff) => `${diff}:${coverage[dim][diff]}`).join("/")}`).join(" ")}`);
if (emptySlots.length) console.log(`[kb-index] ⚠️ ${emptySlots.length} 个空槽（数据不足，运行时回退硬编码资源池）：${emptySlots.slice(0, 12).join(", ")}${emptySlots.length > 12 ? "…" : ""}`);
else console.log("[kb-index] 全部槽位有货");
