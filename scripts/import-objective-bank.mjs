/**
 * 880 题客观题库的修复导入：docx → 六维/难度/关卡映射 → 选项洗牌 → worker 题库。
 *
 * 修复三个数据缺陷（对照 work/bank-import/mapping-report.md）：
 *  1. 旧转换把「考察方向」标签当成了题干（880 题 q 字段只有标签，题干丢失）；
 *  2. 880 题缺 dimKeys 与 difficulty，判断题的「判断结果」通道被丢掉（80 题无答案）；
 *  3. 答案键严重偏斜（约 88% 是 B）——这里用按题号定种的洗牌重排选项，
 *     同步重写答案键，保证 A/B/C/D 分布均衡且结果可复现。
 *
 * 运行：node scripts/import-objective-bank.mjs <题库.docx>
 * 源 docx 不随仓库分发（它是外部交付物），因此路径由参数传入。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIMENSIONS,
  TAG_DIMENSIONS,
  UNIT_PART_DIFFICULTY,
  levelFor,
} from "./bank-mapping.mjs";
import { parseObjectiveBank, resolveAnswer, resolveType } from "./parse-objective-docx.mjs";
import { validateQuestionBank } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const DOCX = process.argv[2];
if (!DOCX) {
  console.error("用法：node scripts/import-objective-bank.mjs <AI客观题题库.docx>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const BANK_PATH = join(here, "../worker/objective-questions.json");

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function partIndex(unit, tag) {
  const part = tag.match(/第([一二三四五六七八九十]+)部分/);
  if (part) return CN_NUM[part[1]] ?? 1;
  const group = tag.match(/^第(\d+)组/);
  if (group) return Number(group[1]);
  // 第十单元判断题专练：5 个标签按声明顺序定档。过滤必须排除
  // 「第701-720题」这类占位串（不含"部分/组"，曾把 judgeTags 撑成 6 项
  // 导致 indexOf 整体 +1、80 道判断题难度旋转一档——2026-09-30 审计修复）。
  const judgeTags = Object.keys(TAG_DIMENSIONS).filter(
    (key) => !key.includes("部分") && !key.includes("组") && !/^第\d+-\d+题$/.test(key) && unit === "第十单元",
  );
  if (judgeTags.length !== 5) throw new Error(`第十单元判断题标签应为 5 个，实际 ${judgeTags.length}: ${judgeTags}`);
  return Math.max(1, judgeTags.indexOf(tag) + 1);
}

function difficultyFor(record) {
  const ladder = UNIT_PART_DIFFICULTY[record.unit] ?? ["medium"];
  return ladder[Math.min(ladder.length - 1, Math.max(0, partIndex(record.unit, record.tag) - 1))];
}

// 确定性 PRNG（mulberry32）：同一题号永远得到同一洗牌，导入可复现。
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleOptions(question, seed) {
  const rng = mulberry32(seed);
  const options = [...question.options];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  // 旧键 → 该选项洗牌后的新位置键。注意不能映射到「洗牌后落在旧位置上的选项」的原始键——
  // 那是反方向，约 1/2 的题答案会指错（历史缺陷，已由 repair-objective-answers.mjs 修复存量题库）。
  const answer = question.answer.map((key) => "ABCD"[options.findIndex((option) => option.key === key)]);
  return { options: options.map((option, index) => ({ key: "ABCD"[index], text: option.text })), answer };
}

const records = parseObjectiveBank(DOCX);
if (records.length !== 880) throw new Error(`预期解析 880 题，实际 ${records.length} 题`);

const nameOf = (key) => DIMENSIONS.find((item) => item.key === key).name;
const repaired = records.map((record, index) => {
  const dimKeys = TAG_DIMENSIONS[record.tag];
  if (!dimKeys) throw new Error(`题 ${record.id} 标签未映射：${record.tag}`);
  const levelId = levelFor(record.unit, record.tag);
  if (!levelId) throw new Error(`题 ${record.id} 关卡未映射：${record.unit}`);
  const answer = resolveAnswer(record);
  if (answer.length === 0) throw new Error(`题 ${record.id} 答案为空`);
  const base = {
    id: `ai-${record.id}`,
    difficulty: difficultyFor(record),
    levelId,
    type: resolveType(record),
    q: record.stem,
    options: record.options.map((option) => ({ key: option.key, text: option.text })),
    answer,
    analysis: record.analysis,
    dims: dimKeys.map(nameOf),
    dimKeys,
    origin: "ai",
  };
  const shuffled = shuffleOptions(base, record.number * 7919 + 13);
  return { ...base, ...shuffled };
});

// 现有 120 道人工精选题（origin: human）已经是好数据，原样保留。
const existing = JSON.parse(readFileSync(BANK_PATH, "utf8"));
const human = existing.questions.filter((question) => question.origin === "human");
if (human.length !== 120) throw new Error(`预期保留 120 道精选题，实际 ${human.length} 道`);

const questions = [...human, ...repaired];
validateQuestionBank(questions);

function tally(items, keyFn) {
  const counts = new Map();
  for (const item of items) counts.set(keyFn(item), (counts.get(keyFn(item)) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort());
}

const skew = tally(repaired.flatMap((q) => q.answer.map((key) => ({ key }))), (item) => item.key);
const byDifficulty = tally(repaired, (item) => item.difficulty);
const byLevel = tally(repaired, (item) => item.levelId);
writeFileSync(BANK_PATH, `${JSON.stringify({ questions }, null, 2)}\n`);

// 全量版的综合题池：同样的 880 题，去掉 origin（综合测评不区分来源），
// 供 bank-store 在 A 版下作为综合测评的题池。B 版继续用
// src/comprehensive-questions.json 里的 120 道人工精选题。
const comprehensive880 = repaired.map(({ origin, ...rest }) => rest);
validateQuestionBank(comprehensive880);
const FULL_PATH = join(here, "..", "src", "banks", "comprehensive-880.json");
writeFileSync(FULL_PATH, `${JSON.stringify({ questions: comprehensive880 }, null, 2)}\n`);
console.log(`已写出全量版综合题池：src/banks/comprehensive-880.json（${comprehensive880.length} 题）`);

console.log(`导入完成：${human.length} 精选 + ${repaired.length} 修复 = ${questions.length} 题`);
console.log("修复题答案分布（应近似均衡）:", skew);
console.log("修复题难度分布:", byDifficulty);
console.log("修复题关卡分布:", byLevel);
