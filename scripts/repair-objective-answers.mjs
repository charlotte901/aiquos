/**
 * 修复 import-objective-bank.mjs 选项洗牌的答案重映射方向错误。
 *
 * 缺陷：shuffleOptions 用 [旧位置键 → 洗牌后落在该位置选项的原始键] 做答案重映射，
 * 而正确映射是 [旧键 → 该选项洗牌后的新位置键]。两者对 4 选项题约有 1/2 的概率
 * 重合，因此约一半的 4 选项题 answer 指向错误选项（判断题 2 选项恒重合，不受影响）。
 * 解析文本描述的是真实正确选项，与错位的 answer 形成内部矛盾（如 ai-obj-001/002/004/006）。
 *
 * 修复原理：洗牌由 record.number 定种、完全可复现，源 docx 缺失也可逆推——
 *   1. 用同一种子重放 mulberry32 + Fisher-Yates，得到置换 perm（perm[i] = 最终位置 i 上选项的原始键）；
 *   2. 缺陷映射为 "ABCD"[i] ↦ perm[i]，故真实原始正确键 K = "ABCD"[perm.indexOf(recorded)]；
 *   3. 该选项的最终键 = "ABCD"[perm.indexOf(K)]。
 * 脚本不改动 options/题干/解析，只重写 answer；人工精选题（origin: human）不经过洗牌，原样保留。
 *
 * 运行：node scripts/repair-objective-answers.mjs [--apply]
 *   默认 dry-run 只报告；--apply 写回两个题库文件。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const here = dirname(fileURLToPath(import.meta.url));

// 与 import-objective-bank.mjs 逐字一致的确定性 PRNG 与洗牌，保证置换可复现。
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shufflePermutation(seed, optionCount) {
  const rng = mulberry32(seed);
  const perm = Array.from({ length: optionCount }, (_, index) => "ABCD"[index]);
  for (let i = perm.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm; // perm[i] = 最终位置 i 上选项的原始键
}

function fixedAnswer(question) {
  const match = question.id.match(/(\d+)$/);
  if (!match) throw new Error(`题 ${question.id} 无法从 id 提取题号`);
  const seed = Number(match[1]) * 7919 + 13;
  const perm = shufflePermutation(seed, question.options.length);
  return question.answer.map((recorded) => {
    const originalKey = "ABCD"[perm.indexOf(recorded)];
    if (!originalKey) throw new Error(`题 ${question.id} 记录答案 ${recorded} 不在置换中`);
    const finalKey = "ABCD"[perm.indexOf(originalKey)];
    if (!finalKey) throw new Error(`题 ${question.id} 原始键 ${originalKey} 逆推失败`);
    return finalKey;
  });
}

const BANKS = [
  join(here, "../worker/objective-questions.json"),
  join(here, "../src/banks/comprehensive-880.json"),
];

const summary = { files: {}, spotChecks: {} };
const SPOT = { "ai-obj-001": "C", "ai-obj-002": "D", "ai-obj-004": "D", "ai-obj-006": "B" };

for (const path of BANKS) {
  const bank = JSON.parse(readFileSync(path, "utf8"));
  let changed = 0, byType = {};
  for (const question of bank.questions) {
    if (question.origin === "human") continue;
    const next = fixedAnswer(question);
    const same = next.length === question.answer.length && next.every((key, index) => key === question.answer[index]);
    if (!same) {
      changed += 1;
      byType[question.type] = (byType[question.type] ?? 0) + 1;
      if (SPOT[question.id]) summary.spotChecks[question.id] = { 修复前: question.answer, 修复后: next };
    }
    if (APPLY) question.answer = next;
  }
  const total = bank.questions.filter((question) => question.origin !== "human").length;
  summary.files[path.split("/").pop()] = { 修复题数: changed, 洗牌题总数: total, 按题型: byType };
  if (APPLY) writeFileSync(path, `${JSON.stringify(bank, null, 2)}\n`);
}

console.log(JSON.stringify(summary, null, 2));
if (APPLY) console.log("已写回。请运行题库校验与测试套件。");
else console.log("dry-run 未写盘。确认后加 --apply。");
