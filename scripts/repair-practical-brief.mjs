/**
 * 修复实操题库两处导入缺陷：
 *
 * 1. requirements 泄漏标准答案：full-006/015/024 三题的交付要求里混入了
 *    参考答案的完整代码与「简要解释」（docx 解析时要求段未在代码块边界
 *    截止）。requirements 会原样下发给学生（standardPrompt/standardProduct
 *    才是服务端保密的），等于在题面上泄题。修复：保留代码块起始行
 *    （""" 或 ```）之前的全部真实要求，剥掉其后的泄漏内容。
 * 2. minutes 为空串：80 题主文档的「建议用时」元数据行未被解析出（10 题
 *    精选文档正常）。该字段当前无消费方（惰性元数据），按精选库的既有
 *    口径回填：low=5、medium=8、high=12 分钟。
 *
 * 运行：node scripts/repair-practical-brief.mjs [--apply]（默认 dry-run）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const here = dirname(fileURLToPath(import.meta.url));
const PATH = join(here, "../src/banks/practical-80.json");

const MINUTES_BY_DIFFICULTY = { low: 5, medium: 8, high: 12 };
/** 代码块起始行：出现即认为后续均为泄漏的标准答案内容。 */
const CODE_START = /^(\"\"\"|```)/;

const bank = JSON.parse(readFileSync(PATH, "utf8"));
let reqFixed = 0, minFixed = 0;

for (const task of bank.tasks) {
  const cut = task.requirements.findIndex((row) => CODE_START.test(row.trim()));
  if (cut > 0) {
    const kept = task.requirements.slice(0, cut);
    const dropped = task.requirements.length - cut;
    console.log(`${task.id}: requirements ${task.requirements.length} 行 → ${kept.length} 行（剥离泄漏 ${dropped} 行，自 "${task.requirements[cut].trim().slice(0, 12)}" 起）`);
    if (APPLY) task.requirements = kept;
    reqFixed += 1;
  } else if (cut === 0) {
    console.error(`${task.id}: 首行即代码块，要求段缺失——需人工介入，跳过`);
    process.exitCode = 1;
  }
  if (!(task.minutes > 0)) {
    const fill = MINUTES_BY_DIFFICULTY[task.difficulty];
    if (!fill) { console.error(`${task.id}: 难度 ${task.difficulty} 无对应用时`); process.exitCode = 1; continue; }
    if (APPLY) task.minutes = fill;
    minFixed += 1;
  }
}

console.log(`\nrequirements 修复 ${reqFixed} 题，minutes 回填 ${minFixed} 题`);
if (APPLY) writeFileSync(PATH, `${JSON.stringify(bank, null, 2)}\n`);
console.log(APPLY ? "已写回。" : "dry-run 未写盘。确认后加 --apply。");
