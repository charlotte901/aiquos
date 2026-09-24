/**
 * 从 10 题精选 docx 中提取任务参考图，并按角色绑定到任务记录。
 *
 * 运行：node scripts/extract-task-images.mjs <10题精选.docx>
 *
 * 图片角色由它在文档中的上下文决定，而不是文件名：
 *   「参考原图：」「参考图片：」「新照片：」之后的图是**做题必需输入**；
 *   「【标准产物】」之后的图是**参考答案**（供评分对照，不是输入）。
 *
 * 命名按角色而非序号，任务记录里存 src，前端按 role 决定展示位置与说明。
 * 提取后可重复运行（同名文件覆盖），所以改题不会留下孤儿图片。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [docxPath] = process.argv.slice(2);
if (!docxPath) {
  console.error("用法：node scripts/extract-task-images.mjs <10题精选.docx>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "public", "tasks");
const TMP_DIR = join(here, "..", "work", "task-images-tmp");

/**
 * 角色 → 输出文件名。
 *
 * 命名按「任务场景 + 图片角色」，而不是沿用 docx 里的 image1/image2 序号：
 * 序号会随文档重排而失效，角色名则与前端展示位置一一对应。
 *
 * 注意第 1 题（图片扩图）的产物与第 1 题的参考图是两张不同的图，不能撞名：
 *   outpaint-source     竖屏原图（做题输入）
 *   outpaint-result     扩图后的结果（参考答案）
 *   poster-example      同题的海报参考（另一张产物）
 */
const ROLES = {
  "第1题": {
    // 第 1 题在源文档里带两张产物图：一张扩图结果、一张海报参考。
    product: ["outpaint-result", "poster-example"],
    reference: ["outpaint-source"],
  },
  "第6题": {
    reference: ["ink-style-reference"],
    secondary: ["ink-new-photo"],
    product: ["ink-example"],
  },
};

/** rId → media 文件名（读 document.xml.rels）。 */
function readRelMap() {
  const rels = execFileSync("unzip", ["-p", docxPath, "word/_rels/document.xml.rels"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });
  const map = new Map();
  for (const match of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
    if (match[2].includes("media")) map.set(match[1], match[2]);
  }
  return map;
}

/**
 * 按文档顺序扫描「题号 / 标签 / 图片」，得出每张图的角色。
 * 返回 [{ task, role, media }]。
 */
function planImages() {
  const xml = execFileSync("unzip", ["-p", docxPath, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
  });

  const events = [];
  const re = /第\s*(\d+)\s*题|【([^】]+)】|(参考原图|参考图片|新照片)[：:]|r:embed="(rId\d+)"/g;
  let match;
  while ((match = re.exec(xml))) {
    if (match[1]) events.push({ kind: "task", value: `第${match[1]}题` });
    else if (match[2]) events.push({ kind: "label", value: match[2] });
    else if (match[3]) events.push({ kind: "ref", value: match[3] });
    else if (match[4]) events.push({ kind: "img", value: match[4] });
  }

  const plan = [];
  let task = null;
  let marker = null;
  // 同一题内同角色的多张图按出现顺序编号。
  const roleCount = new Map();

  for (const event of events) {
    if (event.kind === "task") {
      task = event.value;
      marker = null;
      continue;
    }
    if (event.kind === "label") {
      marker = /^(标准产物|标准提示词)$/.test(event.value) ? "product" : event.value;
      continue;
    }
    if (event.kind === "ref") {
      marker = "reference";
      // 「新照片」是第二张输入图，与「参考图片」区分开。
      if (event.value === "新照片") marker = "secondary";
      continue;
    }
    if (event.kind === "img" && task && marker) {
      const key = `${task}:${marker}`;
      const index = (roleCount.get(key) ?? 0) + 1;
      roleCount.set(key, index);
      plan.push({ task, role: marker, media: event.value, index });
    }
  }
  return plan;
}

const relMap = readRelMap();
// planImages 记录的是 rId，这里换成 media 文件名（docx 内部用关系 ID 引用图片）。
const plan = planImages().map((item) => ({ ...item, media: relMap.get(item.media) ?? item.media }));

// 解压到临时目录（docx 是 zip，media 是普通条目）。
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(TMP_DIR, { recursive: true });
execFileSync("unzip", ["-o", "-q", docxPath, "word/media/*", "-d", TMP_DIR], { stdio: "pipe" });

mkdirSync(OUT_DIR, { recursive: true });

const written = [];
const unknown = [];
// 清空目标目录再写：同一张图在源文档里可能是 image1.jpeg，旧版本已提取为
// .jpg —— 直接叠加会留下两份扩展名不同的同名图，前端引用哪份不确定。
const stale = new Set();
for (const item of plan) {
  const spec = ROLES[item.task];
  const list = spec?.[item.role];
  if (!Array.isArray(list) || !list.length) {
    unknown.push(item);
    continue;
  }
  // 同角色的多张图按出现顺序命名（第 N 张 → 列表第 N 个）。
  const stem = list[Math.min(item.index - 1, list.length - 1)] ?? list[0];
  const source = join(TMP_DIR, "word", item.media);
  if (!existsSync(source)) {
    unknown.push(item);
    continue;
  }
  const ext = item.media.split(".").pop() === "jpeg" ? "jpg" : item.media.split(".").pop();
  const target = join(OUT_DIR, `${stem}.${ext}`);
  copyFileSync(source, target);
  stale.add(`${stem}.${ext}`);
  written.push({ task: item.task, role: item.role, file: `tasks/${stem}.${ext}` });
}

// 删掉不在本轮产出里、且看起来是旧命名的图片（保留不属于本脚本的素材）。
for (const name of readdirSync(OUT_DIR)) {
  if (stale.has(name)) continue;
  if (/^(outpaint|ink|poster)-.*\.(jpe?g|png)$/i.test(name)) {
    rmSync(join(OUT_DIR, name), { force: true });
  }
}

rmSync(TMP_DIR, { recursive: true, force: true });

console.log(`提取图片 ${written.length} 张 → public/tasks/`);
for (const item of written) console.log(`  ${item.task}  ${item.role.padEnd(10)} ${item.file}`);
if (unknown.length) {
  console.log(`\n未绑定角色的图片 ${unknown.length} 张（源文档缺少可识别的上下文标签）：`);
  for (const item of unknown) console.log(`  ${item.task} ${item.role} ${item.media}`);
}

// 供导入脚本使用的「任务 → 资源」映射，写成 JSON 便于两边对齐。
writeFileSync(
  join(here, "..", "work", "task-images.json"),
  JSON.stringify(written, null, 2),
  "utf8",
);
