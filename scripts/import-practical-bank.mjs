/**
 * 实操题库导入：两份 docx → src/banks/practical-80.json + practical-10.json。
 *
 * 运行：node scripts/import-practical-bank.mjs <80题库.docx> <10题精选.docx>
 *
 * 源文档是「单一任务清单」，而产品需要按 5 个关卡（academy…court）分发，
 * 所以这里补两件事：
 *   1. 关卡归属：按类别与难度阶梯分配到五关，保证每关三档难度与三类任务
 *      都有样本（自适应/抽题才拿得到合适的题）。
 *   2. 六维键：任务的「考察维度」是中文名，映射到 D1–D6，供综合测评的
 *      外部证据进入同一后验。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePracticalBank, extractFields, resolveOutputType } from "./parse-practical-docx.mjs";

const [docx80, docx10] = process.argv.slice(2);
if (!docx80 || !docx10) {
  console.error("用法：node scripts/import-practical-bank.mjs <80题库.docx> <10题精选.docx>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "src", "banks");

const LEVELS = ["academy", "labyrinth", "workshop", "station", "court"];

/** 「考察维度」中文名 → 六维键。源文档用词与评分核心的对应关系。 */
const DIM_KEY = {
  AI基础认知: "D1",
  提示词工程: "D2",
  AI工具使用: "D3",
  AI结果评估: "D4",
  结果评估: "D4",
  人机协同: "D5",
  人机协同解决问题: "D5",
  伦理合规: "D6",
  伦理与合规: "D6",
};

function dimKeysFor(dims) {
  const keys = [...new Set(dims.map((name) => DIM_KEY[name]).filter(Boolean))];
  // 评分核心要求每题都有维度证据；源文档偶尔只标一个，这里补一个最贴近的
  // 邻接维度（提示词工程是所有实操任务的共同底座）。
  if (keys.length === 0) return ["D2", "D5"];
  if (keys.length === 1) return [...new Set([keys[0], "D2"])];
  return keys.slice(0, 2);
}

/**
 * 关卡分配：类别决定基准，难度在基准上推进，但**必须覆盖全部五关**。
 *
 * 早期版本用 `base + step - 1` 直接算下标，结果全部落在前三关（court
 * 空、station 只剩 1 题）——第五关的实操环节会无题可出。这里改为按
 * 「类别分组内的排名」分配：先把任务按类别+难度排序，再用组内序号在
 * 五关间均匀铺开，保证每关都有三档难度与三类任务。
 */
const CATEGORY_ORDER = ["代码类", "文本类", "图片类"];
const DIFFICULTY_ORDER = { low: 0, medium: 1, high: 2 };

function assignLevels(tasks) {
  // 按类别分组，每组内按难度排序后均匀铺到五关。
  const buckets = new Map(CATEGORY_ORDER.map((name) => [name, []]));
  for (const task of tasks) {
    const bucket = buckets.get(task.category) ?? buckets.get("文本类");
    bucket.push(task);
  }

  for (const [, bucket] of buckets) {
    bucket.sort((left, right) =>
      (DIFFICULTY_ORDER[left.difficulty] ?? 1) - (DIFFICULTY_ORDER[right.difficulty] ?? 1));
    bucket.forEach((task, index) => {
      task.levelId = LEVELS[index % LEVELS.length];
    });
  }
}

/** 任务标题：源文档没有标题字段，取场景首句（截断到合理长度）。 */
function titleFor(fields, number) {
  const first = (fields.scene || fields.product || "").split(/[。\n]/)[0].trim();
  if (!first) return `实操任务 ${number}`;
  return first.length > 42 ? `${first.slice(0, 42)}…` : first;
}

/**
 * 交付要求。
 *
 * 源文档里只有部分任务带【实操任务】标签；代码类多数没有，要求隐含在
 * 「场景 + 待修正代码」中。学员看不到要求就不知道该做什么，所以缺标签时
 * 从**评分标准二的维度名**推导：那些维度就是验收点，本身就是可执行的要求。
 * 补出来的条目前加「达到评分标准：」以示区分，不与原文要求混淆。
 */
function requirementsFor(fields, rubricProduct) {
  if (fields.instructions.length) return fields.instructions;
  const dims = (rubricProduct ?? []).map((row) => row.dimension).filter(Boolean);
  if (!dims.length) return [];
  return dims.map((dimension) => `达到评分标准：${dimension}`);
}

/**
 * 任务参考图绑定。
 *
 * 键是**源文档题号**。用题号而不是关键词匹配：扩图题与海报题的题干里都有
 * "16:9"，按关键词匹配会把海报误判成扩图（实测确实发生了）。题号是文档里
 * 唯一稳定的锚点。
 *
 * role 决定前端展示位置与说明：
 *   reference  做题输入（原图 / 风格参考图）
 *   secondary  第二张输入（待处理的新照片）
 *   product    参考答案（供评分对照，不作为输入）
 */
const IMAGE_BINDINGS = {
  // 第 1 题：秋季运动会国潮海报 —— 只有成品参考
  1: [
    { role: "product", src: "/tasks/poster-example.png", label: "海报范例" },
  ],
  // 第 4 题：竖屏原图扩为 16:9 壁纸 —— 需要原图作为输入
  4: [
    { role: "reference", src: "/tasks/outpaint-source.jpg", label: "参考原图（竖屏）" },
    { role: "product", src: "/tasks/outpaint-result.jpg", label: "扩图结果范例" },
  ],
  // 第 8 题：摄影原图转水墨插画 —— 风格图 + 待处理照片
  8: [
    { role: "reference", src: "/tasks/ink-style-reference.jpg", label: "参考风格图" },
    { role: "secondary", src: "/tasks/ink-new-photo.jpg", label: "待处理的新照片" },
    { role: "product", src: "/tasks/ink-example.jpg", label: "风格迁移结果范例" },
  ],
};

function convert(task, origin, index) {
  const fields = extractFields(task.paragraphs);
  const outputType = resolveOutputType(task.category, fields.product);
  const record = {
    id: `${origin}-${String(index + 1).padStart(3, "0")}`,
    sourceNumber: task.number,
    levelId: null, // 由 assignLevels 统一分配
    origin,
    difficulty: task.difficulty,
    category: task.category,
    title: titleFor(fields, task.number),
    goal: fields.scene || fields.material || "",
    requirements: requirementsFor(fields, task.rubricProduct),
    material: fields.material || "",
    standardPrompt: fields.prompt || "",
    standardProduct: fields.product || "",
    rubricPrompt: task.rubricPrompt ?? [],
    rubricProduct: task.rubricProduct ?? [],
    dimKeys: dimKeysFor(task.dims),
    dims: task.dims,
    minutes: task.minutes,
    outputType,
  };
  const assets = IMAGE_BINDINGS[task.number];
  if (assets) record.assets = assets;
  return record;
}

function buildBank(records, origin) {
  const tasks = records.map((task, index) => convert(task, origin, index));
  assignLevels(tasks);
  // 关卡均衡检查：任何一关都不该空，否则该关的实操环节无题可出。
  const byLevel = LEVELS.map((levelId) => [levelId, tasks.filter((t) => t.levelId === levelId).length]);
  const empty = byLevel.filter(([, count]) => count === 0).map(([levelId]) => levelId);
  const missingPrompt = tasks.filter((t) => !t.standardPrompt).length;
  const missingProduct = tasks.filter((t) => !t.standardProduct).length;
  return { tasks, byLevel, empty, missingPrompt, missingProduct };
}

const bank80 = buildBank(parsePracticalBank(docx80), "full");
const bank10 = buildBank(parsePracticalBank(docx10), "lite");

for (const [label, bank] of [["80题", bank80], ["10题精选", bank10]]) {
  console.log(`=== ${label} ===`);
  console.log(`  任务数: ${bank.tasks.length}`);
  console.log(`  关卡分布: ${bank.byLevel.map(([id, n]) => `${id}=${n}`).join(" ")}`);
  console.log(`  空关卡: ${bank.empty.length ? bank.empty.join(",") : "无 ✓"}`);
  console.log(`  缺标准提示词: ${bank.missingPrompt} | 缺标准产物: ${bank.missingProduct}`);
  console.log(`  难度: ${JSON.stringify(bank.tasks.reduce((a, t) => { a[t.difficulty] = (a[t.difficulty] || 0) + 1; return a; }, {}))}`);
  console.log(`  类别: ${JSON.stringify(bank.tasks.reduce((a, t) => { a[t.category] = (a[t.category] || 0) + 1; return a; }, {}))}`);
  console.log(`  输出类型: ${JSON.stringify(bank.tasks.reduce((a, t) => { a[t.outputType] = (a[t.outputType] || 0) + 1; return a; }, {}))}`);
  console.log("");
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "practical-80.json"), JSON.stringify({ tasks: bank80.tasks }, null, 1), "utf8");
writeFileSync(join(OUT_DIR, "practical-10.json"), JSON.stringify({ tasks: bank10.tasks }, null, 1), "utf8");
console.log("已写出 src/banks/practical-80.json 与 src/banks/practical-10.json");
