/**
 * 全量题库数据审计：结构合法性 + 统计分布 + 跨字段一致性。
 * 只读不写，输出问题清单。用法：node scripts/audit-bank-data.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DIM_KEYS = ["D1", "D2", "D3", "D4", "D5", "D6"];
const LEVELS = ["academy", "labyrinth", "workshop", "station", "court"];
const DIFFS = ["low", "medium", "high"];
const issues = [];
const note = (file, id, msg) => issues.push(`[${file}] ${id}: ${msg}`);

function tally(items, keyFn) {
  const m = new Map();
  for (const it of items) m.set(keyFn(it), (m.get(keyFn(it)) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort());
}

// ── 客观题库 ──────────────────────────────────────────────
for (const rel of ["../worker/objective-questions.json", "../src/banks/comprehensive-880.json", "../src/comprehensive-questions.json"]) {
  const file = rel.split("/").pop();
  const bank = JSON.parse(readFileSync(join(here, rel), "utf8"));
  const qs = bank.questions ?? bank;
  const dist = { answer: {}, type: {}, diff: {} };
  for (const q of qs) {
    const keys = (q.options ?? []).map((o) => o.key);
    if (new Set(keys).size !== keys.length) note(file, q.id, "选项键重复");
    if (q.answer.some((k) => !keys.includes(k))) note(file, q.id, `答案 ${q.answer} 不在选项 ${keys} 中`);
    if (!q.answer.length) note(file, q.id, "答案为空");
    if (q.type === "multi" && q.answer.length < 2) note(file, q.id, `多选答案仅 ${q.answer.length} 项`);
    if (q.type !== "multi" && q.answer.length !== 1) note(file, q.id, `非多选答案有 ${q.answer.length} 项`);
    if (q.dimKeys.some((d) => !DIM_KEYS.includes(d))) note(file, q.id, `dimKeys 非法: ${q.dimKeys}`);
    if (q.dims.length !== q.dimKeys.length) note(file, q.id, `dims(${q.dims.length}) 与 dimKeys(${q.dimKeys.length}) 长度不符`);
    if (!LEVELS.includes(q.levelId)) note(file, q.id, `levelId 非法: ${q.levelId}`);
    if (!DIFFS.includes(q.difficulty)) note(file, q.id, `difficulty 非法: ${q.difficulty}`);
    if (!q.analysis || !q.analysis.trim()) note(file, q.id, "解析为空");
    if (/\s/.test(q.id)) note(file, q.id, "id 含空白");
    for (const k of q.answer) dist.answer[k] = (dist.answer[k] ?? 0) + 1;
    dist.type[q.type] = (dist.type[q.type] ?? 0) + 1;
    dist.diff[q.difficulty] = (dist.diff[q.difficulty] ?? 0) + 1;
  }
  const ids = new Set(qs.map((q) => q.id));
  if (ids.size !== qs.length) {
    const seen = new Set();
    for (const q of qs) { if (seen.has(q.id)) note(file, q.id, "id 重复"); seen.add(q.id); }
  }
  console.log(`\n=== ${file} (${qs.length} 题) ===`);
  console.log("  答案分布:", JSON.stringify(dist.answer), "| 类型:", JSON.stringify(dist.type), "| 难度:", JSON.stringify(dist.diff));
  // 判断题答案应只有 A/B
  const judgeBad = qs.filter((q) => q.type === "judge" && q.answer.some((k) => !["A", "B"].includes(k)));
  if (judgeBad.length) note(file, `${judgeBad.length}题`, `判断题答案超出A/B: ${judgeBad.slice(0,3).map(q=>q.id+":"+q.answer).join(", ")}`);
  // 判断题应恰有2个选项
  const judgeOpts = qs.filter((q) => q.type === "judge" && (q.options ?? []).length !== 2);
  if (judgeOpts.length) note(file, `${judgeOpts.length}题`, `判断题选项数≠2: ${judgeOpts.slice(0,3).map(q=>q.id).join(", ")}`);
}

// ── 实操题库 ──────────────────────────────────────────────
for (const rel of ["../src/banks/practical-80.json", "../src/banks/practical-10.json"]) {
  const file = rel.split("/").pop();
  const bank = JSON.parse(readFileSync(join(here, rel), "utf8"));
  const tasks = bank.tasks ?? bank;
  for (const t of tasks) {
    if (t.dimKeys.some((d) => !DIM_KEYS.includes(d))) note(file, t.id, `dimKeys 非法: ${t.dimKeys}`);
    if (t.dims?.length !== t.dimKeys.length) note(file, t.id, "dims 与 dimKeys 长度不符");
    if (!DIFFS.includes(t.difficulty)) note(file, t.id, `difficulty 非法: ${t.difficulty}`);
    if (!LEVELS.includes(t.levelId)) note(file, t.levelId, `levelId 非法: ${t.levelId}`);
    for (const rk of ["rubricPrompt", "rubricProduct"]) {
      const rub = t[rk];
      if (!Array.isArray(rub)) { note(file, t.id, `${rk} 不是数组`); continue; }
      const names = rub.map((r) => r.dimension);
      if (new Set(names).size !== names.length) note(file, t.id, `${rk} 维度名重复: ${names}`);
      for (const r of rub) {
        if (!r.dimension?.trim()) note(file, t.id, `${rk} 存在空维度名`);
        for (const lv of ["excellent", "good", "pass"]) if (!r[lv]?.trim()) note(file, t.id, `${rk}.${r.dimension} 档位 ${lv} 描述为空`);
        if (!/^\d+(\.\d+)?分$/.test(r.points ?? "")) note(file, t.id, `${rk}.${r.dimension} points 非法: ${r.points}`);
      }
    }
    if (!t.standardPrompt?.trim()) note(file, t.id, "standardPrompt 为空");
    if (!t.standardProduct?.trim()) note(file, t.id, "standardProduct 为空");
    const reqRows = (t.requirements ?? []).filter((r) => r.includes("评分标准"));
    if (reqRows.length !== 2) note(file, t.id, `requirements 中评分标准行数=${reqRows.length}（应为2）`);
    if (!t.minutes || t.minutes <= 0) note(file, t.id, `minutes 非法: ${t.minutes}`);
    if (!t.outputType) note(file, t.id, "outputType 缺失");
  }
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) note(file, "-", "任务 id 重复");
  console.log(`\n=== ${file} (${tasks.length} 任务) ===`);
  console.log("  难度:", JSON.stringify(tally(tasks, (t) => t.difficulty)), "| 关卡:", JSON.stringify(tally(tasks, (t) => t.levelId)), "| 类别:", JSON.stringify(tally(tasks, (t) => t.category)));
}

// 两实操库 id 交集（lite 应为 full 子集，避免同 id 不同内容）
try {
  const full = JSON.parse(readFileSync(join(here, "../src/banks/practical-80.json"), "utf8")).tasks ?? [];
  const lite = JSON.parse(readFileSync(join(here, "../src/banks/practical-10.json"), "utf8")).tasks ?? [];
  const fullMap = new Map(full.map((t) => [t.id, t]));
  for (const t of lite) {
    const f = fullMap.get(t.id);
    if (!f) { note("cross", t.id, "lite 任务不在 full 库中"); continue; }
    for (const k of ["goal", "requirements", "rubricPrompt", "rubricProduct", "dimKeys", "standardPrompt", "standardProduct"]) {
      if (JSON.stringify(t[k]) !== JSON.stringify(f[k])) note("cross", t.id, `lite 与 full 的 ${k} 不一致`);
    }
  }
  console.log(`\n=== 交叉审计: lite(${lite.length}) vs full(${full.length}) ===`);
} catch (e) { console.log("交叉审计跳过:", e.message); }

console.log("\n════════ 审计结果 ════════");
if (!issues.length) console.log("未发现结构问题。");
else { console.log(`共 ${issues.length} 项:`); for (const s of issues) console.log(" -", s); }
