/**
 * 生成映射报告的审计脚本（阶段 1 交付物）。
 * 读 880 题 docx → 套用映射表 → 打印映射覆盖率与分布，
 * 并写出 work/bank-import/mapping-report.md 供人工审阅。
 *
 * 运行：node scripts/audit-bank-mapping.mjs <题库.docx>
 * 源 docx 不随仓库分发（它是外部交付物），因此路径由参数传入。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIMENSIONS,
  LEVELS,
  LEVEL_LABELS,
  TAG_DIMENSIONS,
  TAG_LEVEL,
  UNIT_LEVEL,
  UNIT_PART_DIFFICULTY,
  levelFor,
} from "./bank-mapping.mjs";
import { parseObjectiveBank, resolveAnswer, resolveType } from "./parse-objective-docx.mjs";

const DOCX = process.argv[2];
if (!DOCX) {
  console.error("用法：node scripts/audit-bank-mapping.mjs <AI客观题题库.docx>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "work", "bank-import");

const records = parseObjectiveBank(DOCX);
console.log(`parsed ${records.length} questions`);

// ── 覆盖检查 ──
const missingTag = records.filter((record) => !TAG_DIMENSIONS[record.tag]);
const missingUnit = records.filter((record) => !levelFor(record.unit, record.tag));
const missingAnswer = records.filter((record) => resolveAnswer(record).length === 0);
const missingStem = records.filter((record) => !record.stem);
const missingOptions = records.filter((record) => record.options.length < 2);

const uniqTags = [...new Set(records.map((record) => record.tag))];
const mappedTags = uniqTags.filter((tag) => TAG_DIMENSIONS[tag]);
const unmappedTags = uniqTags.filter((tag) => !TAG_DIMENSIONS[tag]);

console.log(`unique tags: ${uniqTags.length}, mapped: ${mappedTags.length}, unmapped: ${unmappedTags.length}`);
console.log(`questions missing tag mapping: ${missingTag.length}`);
console.log(`questions missing unit mapping: ${missingUnit.length}`);
console.log(`questions with empty answer: ${missingAnswer.length}`);
console.log(`questions with empty stem: ${missingStem.length}`);
console.log(`questions with <2 options: ${missingOptions.length}`);
if (unmappedTags.length) console.log("UNMAPPED TAGS:", unmappedTags);

// ── 难度分布（按单元×部分序号）──
function partIndex(unit, tag) {
  const match = tag.match(/第([一二三四五六七八九十]+)部分/);
  if (match) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
    return map[match[1]] ?? 1;
  }
  const group = tag.match(/^第(\d+)组/);
  if (group) return Number(group[1]);
  // 判断题专练的 5 个标签按出现顺序定档
  const judgeOrder = [
    "AI基础认知",
    "提示词技巧与实践",
    "AI工具功能与应用",
    "伦理、隐私与安全",
    "人机协作与决策",
  ];
  const index = judgeOrder.indexOf(tag);
  if (index >= 0) return index + 1;
  return 1;
}

function difficultyFor(record) {
  const ladder = UNIT_PART_DIFFICULTY[record.unit] ?? ["medium"];
  const index = Math.min(ladder.length - 1, Math.max(0, partIndex(record.unit, record.tag) - 1));
  return ladder[index];
}

const enriched = records.map((record) => ({
  ...record,
  dims: TAG_DIMENSIONS[record.tag] ?? null,
  levelId: levelFor(record.unit, record.tag),
  difficulty: difficultyFor(record),
  type: resolveType(record),
  answer: resolveAnswer(record),
}));

// ── 分布表 ──
function tally(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const byLevel = tally(enriched, (item) => item.levelId);
const byDifficulty = tally(enriched, (item) => item.difficulty);
const byType = tally(enriched, (item) => item.type);
const byLevelDifficulty = tally(enriched, (item) => `${item.levelId} / ${item.difficulty}`);

// 维度计数（每题 2 个维度键）
const dimCounts = new Map(DIMENSIONS.map((dimension) => [dimension.key, 0]));
for (const item of enriched) {
  if (!item.dims) continue;
  for (const key of item.dims) dimCounts.set(key, (dimCounts.get(key) ?? 0) + 1);
}

// 每关的六维覆盖（自适应要求每关都能凑齐六维证据）
const levelDimCounts = new Map();
for (const levelId of LEVELS) {
  levelDimCounts.set(levelId, new Map(DIMENSIONS.map((dimension) => [dimension.key, 0])));
}
for (const item of enriched) {
  if (!item.dims || !item.levelId) continue;
  const bucket = levelDimCounts.get(item.levelId);
  for (const key of item.dims) bucket.set(key, (bucket.get(key) ?? 0) + 1);
}

// ── 报告 ──
const lines = [];
lines.push("# 880 题客观题库 · 标签映射报告");
lines.push("");
lines.push("> 阶段 1 交付物，供审阅确认后再批量导入。");
lines.push("> 数据来源：`AI客观题题库（880题整合版）.docx`（880 题，720 单选 + 80 多选 + 80 判断）。");
lines.push("");
lines.push("## 一、解析与映射覆盖率");
lines.push("");
lines.push("| 检查项 | 结果 |");
lines.push("| :--- | :--- |");
lines.push(`| 解析题数 | ${records.length} |`);
lines.push(`| 唯一「考察方向」标签 | ${uniqTags.length} |`);
lines.push(`| 已映射标签 | ${mappedTags.length} |`);
lines.push(`| 未映射标签 | ${unmappedTags.length} |`);
lines.push(`| 缺失维度映射的题 | ${missingTag.length} |`);
lines.push(`| 缺失关卡映射的题 | ${missingUnit.length} |`);
lines.push(`| **答案为空的题** | **${missingAnswer.length}** |`);
lines.push(`| 题干为空的题 | ${missingStem.length} |`);
lines.push(`| 选项少于 2 个的题 | ${missingOptions.length} |`);
lines.push("");
lines.push("## 二、维度映射表（源标签 → D1–D6）");
lines.push("");
lines.push("每题恰好分配 2 个维度（自适应引擎与六维评分都要求 `dimKeys.length === 2`）。");
lines.push("");
lines.push("| 单元 | 源标签 | 主维度 | 副维度 | 题数 |");
lines.push("| :--- | :--- | :--- | :--- | :--- |");
const tagCounts = tally(records, (record) => `${record.unit}｜${record.tag}`);
const seenTags = new Set();
for (const record of records) {
  const key = `${record.unit}｜${record.tag}`;
  if (seenTags.has(key)) continue;
  seenTags.add(key);
  const dims = TAG_DIMENSIONS[record.tag];
  const main = dims ? DIMENSIONS.find((d) => d.key === dims[0]) : null;
  const sub = dims ? DIMENSIONS.find((d) => d.key === dims[1]) : null;
  lines.push(
    `| ${record.unit} | ${record.tag} | ${main ? `${main.key} ${main.name}` : "**未映射**"} | ${sub ? `${sub.key} ${sub.name}` : "—"} | ${tagCounts.get(key) ?? 0} |`,
  );
}
lines.push("");
lines.push("## 三、难度映射表（单元 × 部分序号）");
lines.push("");
lines.push("| 单元 | 各部分难度档（按部分序号） | 题数 |");
lines.push("| :--- | :--- | :--- |");
for (const [unit, ladder] of Object.entries(UNIT_PART_DIFFICULTY)) {
  const count = records.filter((record) => record.unit === unit).length;
  lines.push(`| ${unit} | ${ladder.join(" → ")} | ${count} |`);
}
lines.push("");
lines.push("## 四、关卡映射表");
lines.push("");
lines.push("### 4.1 单元 → 关卡（按主题归属）");
lines.push("");
lines.push("| 单元 | 关卡 id | 关卡名 | 题数 |");
lines.push("| :--- | :--- | :--- | :--- |");
for (const [unit, levelId] of Object.entries(UNIT_LEVEL)) {
  const count = records.filter((record) => record.unit === unit).length;
  lines.push(`| ${unit} | \`${levelId}\` | ${LEVEL_LABELS[levelId]} | ${count} |`);
}
lines.push("");
lines.push("### 4.2 题型专练单元的标签级关卡分配");
lines.push("");
lines.push("第九（多选）与第十（判断）单元按标签的维度归属打散到五关。");
lines.push("若整体塞进一个关卡，其余四关将一道多选/判断题都没有，自适应引擎的");
lines.push("「题型变化」权重与「三连同类」硬保护在那四关会彻底失效。");
lines.push("");
lines.push("| 单元 | 源标签 | 分配关卡 | 题数 |");
lines.push("| :--- | :--- | :--- | :--- |");
const tagLevelSeen = new Set();
for (const record of records) {
  if (!TAG_LEVEL[record.tag]) continue;
  if (tagLevelSeen.has(record.tag)) continue;
  tagLevelSeen.add(record.tag);
  const count = records.filter((item) => item.tag === record.tag).length;
  lines.push(
    `| ${record.unit} | ${record.tag} | \`${TAG_LEVEL[record.tag]}\` ${LEVEL_LABELS[TAG_LEVEL[record.tag]]} | ${count} |`,
  );
}
lines.push("");
lines.push("## 五、映射后的实际分布");
lines.push("");
lines.push("### 5.1 按关卡");
lines.push("");
lines.push("| 关卡 | 题数 |");
lines.push("| :--- | :--- |");
for (const levelId of LEVELS) lines.push(`| ${levelId} | ${byLevel.get(levelId) ?? 0} |`);
lines.push("");
lines.push("### 5.2 按难度");
lines.push("");
lines.push("| 难度 | 题数 |");
lines.push("| :--- | :--- |");
for (const difficulty of ["low", "medium", "high"]) {
  lines.push(`| ${difficulty} | ${byDifficulty.get(difficulty) ?? 0} |`);
}
lines.push("");
lines.push("### 5.3 按关卡 × 难度（自适应分层样本量）");
lines.push("");
lines.push("| 关卡 | low | medium | high | 合计 |");
lines.push("| :--- | :--- | :--- | :--- | :--- |");
for (const levelId of LEVELS) {
  const low = byLevelDifficulty.get(`${levelId} / low`) ?? 0;
  const medium = byLevelDifficulty.get(`${levelId} / medium`) ?? 0;
  const high = byLevelDifficulty.get(`${levelId} / high`) ?? 0;
  lines.push(`| ${levelId} | ${low} | ${medium} | ${high} | ${low + medium + high} |`);
}
lines.push("");
lines.push("### 5.4 按题型");
lines.push("");
lines.push("| 题型 | 题数 |");
lines.push("| :--- | :--- |");
for (const type of ["single", "multi", "judge"]) lines.push(`| ${type} | ${byType.get(type) ?? 0} |`);
lines.push("");
lines.push("### 5.5 六维分布（每题计 2 次，合计应为 1760）");
lines.push("");
lines.push("| 维度 | 计数 |");
lines.push("| :--- | :--- |");
let dimTotal = 0;
for (const dimension of DIMENSIONS) {
  const count = dimCounts.get(dimension.key) ?? 0;
  dimTotal += count;
  lines.push(`| ${dimension.key} ${dimension.name} | ${count} |`);
}
lines.push(`| **合计** | **${dimTotal}** |`);
lines.push("");
lines.push("### 5.6 每关六维覆盖（每关必须凑齐六维，否则该关无法产出完整六维证据）");
lines.push("");
lines.push("| 关卡 | D1 | D2 | D3 | D4 | D5 | D6 | 达标 |");
lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
for (const levelId of LEVELS) {
  const bucket = levelDimCounts.get(levelId);
  const cells = DIMENSIONS.map((dimension) => bucket.get(dimension.key) ?? 0);
  const ok = cells.every((count) => count >= 2);
  lines.push(`| ${levelId} | ${cells.join(" | ")} | ${ok ? "✓" : "✗"} |`);
}
lines.push("");
lines.push("### 5.7 每关题型覆盖（每关必须拿到多选与判断题，否则题型保护失效）");
lines.push("");
lines.push("| 关卡 | single | multi | judge | 达标 |");
lines.push("| :--- | :--- | :--- | :--- | :--- |");
for (const levelId of LEVELS) {
  const single = enriched.filter((item) => item.levelId === levelId && item.type === "single").length;
  const multi = enriched.filter((item) => item.levelId === levelId && item.type === "multi").length;
  const judge = enriched.filter((item) => item.levelId === levelId && item.type === "judge").length;
  const ok = single > 0 && multi > 0 && judge > 0;
  lines.push(`| ${levelId} | ${single} | ${multi} | ${judge} | ${ok ? "✓" : "✗"} |`);
}
lines.push("");
lines.push("## 六、需要修的数据问题");
lines.push("");
lines.push(`### 6.1 空答案题：${missingAnswer.length} 道`);
lines.push("");
if (missingAnswer.length) {
  lines.push("这些题在源文档里用的是「判断结果：正确/错误」而不是字母答案，上一版转换脚本丢了这个字段。本次导入会从 `判断结果` 还原。示例：");
  lines.push("");
  for (const record of missingAnswer.slice(0, 3)) {
    lines.push(`- 第 ${record.number} 题（${record.sourceType}，judgeRaw=${JSON.stringify(record.judgeRaw)}）：${record.stem.slice(0, 60)}…`);
  }
} else {
  lines.push("无。");
}
lines.push("");
lines.push("### 6.2 答案分布偏斜（导入时用选项重排修正）");
lines.push("");
const answerLetterCounts = tally(
  records.filter((record) => record.sourceType === "单选题"),
  (record) => record.answerRaw ?? "?",
);
lines.push("| 原答案字母 | 题数 | 占比 |");
lines.push("| :--- | :--- | :--- |");
const singleTotal = records.filter((record) => record.sourceType === "单选题").length;
for (const letter of ["A", "B", "C", "D"]) {
  const count = answerLetterCounts.get(letter) ?? 0;
  lines.push(`| ${letter} | ${count} | ${((count / singleTotal) * 100).toFixed(1)}% |`);
}
lines.push("");
lines.push("> 单选题正确答案高度集中在 B（88%），且 80 道多选全部包含 A 与 B。");
lines.push("> 导入时对每题做选项重排（保持「选项文本 ↔ 正误」绑定不变，只打乱字母位置），");
lines.push("> 并在测试中校验各字母分布均衡。");
lines.push("");

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "mapping-report.md"), lines.join("\n"), "utf8");
console.log(`\nreport written to work/bank-import/mapping-report.md`);
console.log(`levels: ${LEVELS.map((id) => `${id}=${byLevel.get(id) ?? 0}`).join(", ")}`);
console.log(`difficulty: ${["low", "medium", "high"].map((d) => `${d}=${byDifficulty.get(d) ?? 0}`).join(", ")}`);
console.log(`types: ${["single", "multi", "judge"].map((t) => `${t}=${byType.get(t) ?? 0}`).join(", ")}`);
