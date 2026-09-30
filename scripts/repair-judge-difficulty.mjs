/**
 * 修复第十单元判断题难度整体错位一档（partIndex 差一错误）。
 *
 * 缺陷：import-objective-bank.mjs 的 partIndex() 用
 *   Object.keys(TAG_DIMENSIONS).filter(key => !key.includes("部分") && !key.includes("组"))
 * 收集第十单元的 5 个判断题标签，但第八单元的占位标签「第701-720题」
 * 同样不含"部分/组"也被收入，judgeTags 实为 6 项、indexOf 全体 +1。
 * UNIT_PART_DIFFICULTY["第十单元"] = [low, medium, high, low, medium] 被旋转一格：
 * 实际入库 {academy:medium, labyrinth:high, workshop:low, court:medium, station:medium}，
 * 声明应为 {academy:low, labyrinth:medium, workshop:high, court:low, station:medium}。
 * 80 题中 65 题难度标签错误（station 15 题因越界钳制碰巧正确）——最严重的是
 * workshop 的 15 道 high 被标成 low（1PL 的 b 参数反号，θ 估计与 CAT 选题失真）。
 *
 * 修复：两份题库中第十单元判断题（type=judge 且 id 在 ai-obj-801..880 段）按
 * levelId→声明难度回写；根因（partIndex 过滤）在导入脚本中另行修复。
 *
 * 运行：node scripts/repair-judge-difficulty.mjs [--apply]（默认 dry-run）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const here = dirname(fileURLToPath(import.meta.url));

/** UNIT_PART_DIFFICULTY["第十单元"] 按声明标签顺序（AI基础认知/提示词技巧与实践/AI工具功能与应用/伦理、隐私与安全/人机协作与决策）对应的关卡。 */
const LEVEL_DIFFICULTY = {
  academy: "low",
  labyrinth: "medium",
  workshop: "high",
  court: "low",
  station: "medium",
};

const BANKS = [
  join(here, "../worker/objective-questions.json"),
  join(here, "../src/banks/comprehensive-880.json"),
];

let changed = 0, total = 0;
for (const path of BANKS) {
  const bank = JSON.parse(readFileSync(path, "utf8"));
  for (const q of bank.questions) {
    if (q.type !== "judge" || q.origin === "human") continue;
    const correct = LEVEL_DIFFICULTY[q.levelId];
    if (!correct) { console.error(`${q.id}: judge 但关卡 ${q.levelId} 无声明难度，需人工确认`); process.exitCode = 1; continue; }
    total += 1;
    if (q.difficulty !== correct) {
      console.log(`${q.id} [${q.levelId}]: ${q.difficulty} → ${correct}`);
      if (APPLY) q.difficulty = correct;
      changed += 1;
    }
  }
  if (APPLY) writeFileSync(path, `${JSON.stringify(bank, null, 2)}\n`);
}

console.log(`\n判断题 ${total} 道，难度修正 ${changed} 道（station 段应恰好 0 道）`);
console.log(APPLY ? "已写回两库。" : "dry-run 未写盘。确认后加 --apply。");
