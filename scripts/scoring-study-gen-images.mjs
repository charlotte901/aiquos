/**
 * 为 3 道图片题 × 3 个水平档生成产物图（共 9 张）。
 *
 * ⚠ **会产生费用**：9 次生图调用。用 DRY_RUN=1 先看将发送的请求。
 *
 * 为什么图片产物必须真实生成：本实验要测"评分器能否区分已知质量差异"。
 * 文本题的产品可以手写（质量可控），但图片没法手写——只能按各档的提示词
 * 真实生成：低档提示词生成出的图自然更差（可能尺寸不符、丢失原图特征），
 * 高档提示词生成的图更符合要求。这样"产物质量差异"才是真实的。
 *
 * 走项目自己的链路：本地代理 /api/ark/images → vLLM 代理 gpt-image-2。
 * 参考图按题库 assets 传入（与学员作答时一致）。
 *
 * 运行：DRY_RUN=1 node scripts/scoring-study-gen-images.mjs
 *       node scripts/scoring-study-gen-images.mjs        # 真实生成（收费）
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const OUT = join(ROOT, "work", "scoring-study", "images");
const ANSWERS = join(ROOT, "work", "scoring-study", "answers");
const DRY_RUN = process.env.DRY_RUN === "1";
const BASE = process.env.BASE || "http://127.0.0.1:4286";
mkdirSync(OUT, { recursive: true });

const bank = JSON.parse(readFileSync(join(ROOT, "src", "banks", "practical-10.json"), "utf8"));
const taskById = new Map(bank.tasks.map((t) => [t.id, t]));
const IMAGE_TASKS = ["lite-001", "lite-004", "lite-008"];

/** 与前端 inputAssets() 一致：product 是答案范例，绝不作为输入。 */
const inputAssets = (task) => (Array.isArray(task.assets) ? task.assets : []).filter((a) => a?.src && a.role !== "product");
const assetLabel = (asset) => asset?.label || asset?.note || "任务素材图";

const dataUri = (relPath) => {
  const abs = join(ROOT, "public", relPath.replace(/^\//, ""));
  const buf = readFileSync(abs);
  const ext = basename(abs).split(".").pop().toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
};

/** 与前端 practicalImagePrompt 同构（首轮、无迭代说明）。 */
const imagePrompt = (task, prompt, refNames) => {
  const refs = refNames.length
    ? `\n参考图：已附上 ${refNames.length} 张（${refNames.join("、")}）。请以这些图作为输入素材，按上面的任务要求处理，而不是重新画一张无关的图。`
    : "";
  return [
    task.title,
    task.goal,
    `任务要求：${(task.requirements ?? []).join("；")}`,
    `活动素材：${task.source}${refs}`,
    `用户补充：${prompt}`,
  ].join("\n");
};

/** 题面写明的比例 → 尺寸（与前端 taskImageSize 一致的规则）。 */
const taskImageSize = (task) => {
  const blob = [task.title, task.goal, ...(task.requirements ?? [])].filter(Boolean).join("\n");
  const text = String(blob).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[：]/g, ":");
  if (text.includes("16:9")) return "1536x864";
  if (text.includes("9:16")) return "864x1536";
  return undefined;
};

const results = [];
for (const taskId of IMAGE_TASKS) {
  const task = taskById.get(taskId);
  const refs = inputAssets(task).map((a) => ({ name: assetLabel(a), src: dataUri(a.src) }));
  for (const slot of ["S1", "S2", "S3"]) {
    const promptFile = join(ANSWERS, `${taskId}.prompt.${slot}.txt`);
    if (!existsSync(promptFile)) { console.log(`✗ 缺少 ${taskId} ${slot} 的提示词`); continue; }
    const studentPrompt = readFileSync(promptFile, "utf8").trim();
    const body = { prompt: imagePrompt(task, studentPrompt, refs.map((r) => r.name)) };
    if (refs.length) body.image = refs.map((r) => r.src);
    const size = taskImageSize(task);
    if (size) body.size = size;

    console.log(`\n── ${taskId} ${slot} · 参考图 ${refs.length} 张 · size=${size || "(默认)"}`);
    if (DRY_RUN) {
      console.log(`   [dry-run] 请求体 ${(JSON.stringify(body).length / 1024).toFixed(0)}KB；提示词前 70 字：${studentPrompt.slice(0, 70).replace(/\n/g, " ")}`);
      results.push({ taskId, slot, dry: true });
      continue;
    }

    const started = Date.now();
    let payload;
    try {
      const res = await fetch(`${BASE}/api/ark/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      });
      payload = await res.json();
      if (!res.ok || !payload.image) {
        console.log(`   ✗ HTTP ${res.status}: ${String(payload.error).slice(0, 160)}`);
        results.push({ taskId, slot, ok: false, error: String(payload.error).slice(0, 160) });
        continue;
      }
    } catch (err) {
      console.log(`   ✗ ${err.name}: ${err.message}`);
      results.push({ taskId, slot, ok: false, error: `${err.name}: ${err.message}` });
      continue;
    }

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(payload.image);
    const bytes = Buffer.from(match[2], "base64");
    const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
    const file = join(OUT, `${taskId}.${slot}.png`);
    writeFileSync(file, bytes);
    console.log(`   ✓ ${(bytes.length / 1024).toFixed(0)}KB  ${w}×${h}  比例 ${(w / h).toFixed(3)}  ${seconds}s  → ${basename(file)}`);
    results.push({ taskId, slot, ok: true, w, h, ratio: +(w / h).toFixed(3), bytes: bytes.length, seconds: +seconds, file: basename(file) });
  }
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(results, null, 2));
console.log("\n══ 汇总 ══");
for (const r of results) {
  console.log(r.dry
    ? `  · ${r.taskId} ${r.slot} [dry-run]`
    : r.ok ? `  ✓ ${r.taskId} ${r.slot}  ${r.w}×${r.h} (${r.ratio})  ${r.seconds}s`
           : `  ✗ ${r.taskId} ${r.slot}  ${r.error}`);
}
const okCount = results.filter((r) => r.ok).length;
if (!DRY_RUN) console.log(`\n成功 ${okCount}/${results.length}；产物目录 ${OUT.replace(ROOT + "/", "")}`);
