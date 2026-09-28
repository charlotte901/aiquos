/**
 * 真实调用生图接口，落盘保存产物。
 *
 * ⚠ **会产生费用**：每道题 1 次生成调用。先用 DRY_RUN=1 确认将要发送的请求。
 *
 * 走项目自己的本地代理 /api/ark/images（即线上同一条链路），
 * 提示词按 src/AssessmentFlow.jsx 的 imagePrompt() 拼装，参考图按上传素材传入。
 * 产物存到 work/gen-results/（已被 .gitignore 覆盖，不会提交）。
 *
 * 运行：DRY_RUN=1 node scripts/gen-real-samples.mjs   # 只打印请求，不调用、不收费
 *       node scripts/gen-real-samples.mjs             # 真实生成（收费）
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.env.DRY_RUN === "1";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const OUT = join(ROOT, "work", "gen-results");
const BASE = process.env.BASE || "http://127.0.0.1:4286";
mkdirSync(OUT, { recursive: true });

const bank = JSON.parse(readFileSync(join(ROOT, "src", "banks", "practical-10.json"), "utf8"));
const taskById = new Map(bank.tasks.map((t) => [t.id, t]));

/** 与前端 inputAssets() 一致：product 是答案范例，绝不作为输入。 */
const inputAssets = (task) =>
  (Array.isArray(task.assets) ? task.assets : []).filter((a) => a?.src && a.role !== "product");

/** 与前端 toUploadItem 的命名一致。 */
const assetLabel = (asset) =>
  asset?.label || asset?.note ||
  ({ reference: "参考图", source: "待处理原图", secondary: "补充素材" }[asset?.role] ?? "任务素材图");

const dataUri = (relPath) => {
  const abs = join(ROOT, "public", relPath.replace(/^\//, ""));
  const buf = readFileSync(abs);
  const ext = basename(abs).split(".").pop().toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
};

/** 复刻 src/AssessmentFlow.jsx 的 imagePrompt：带参考图时明确要求"以这些图作为输入素材"。 */
const imagePrompt = (task, uploads, studentPrompt) => {
  const refs = uploads.length
    ? `\n参考图：已附上 ${uploads.length} 张（${uploads.map((u) => u.name).join("、")}）。请以这些图作为输入素材，按上面的任务要求处理，而不是重新画一张无关的图。`
    : "";
  return [
    task.title,
    task.goal,
    `任务要求：${task.requirements.join("；")}`,
    `活动素材：${task.source}${refs}`,
    `用户补充：${studentPrompt}`,
  ].join("\n");
};

// 三个图片任务 + 一位学员会写的提示词
const CASES = [
  {
    id: "lite-001",
    student: "生成横版 16:9 运动会宣传海报，新中式国潮插画风格，主色红金白，画面含奔跑的运动员、飘扬红旗、祥云纹样，并直接排入主题文字「跃动青春 · 强国有我」。",
  },
  {
    id: "lite-004",
    student: "把这张竖屏原图扩展为 16:9 横屏壁纸，原图部分完全保真，新扩展区域与原图色调统一、边缘自然无拼接痕迹。",
  },
  {
    id: "lite-008",
    student: "先分析参考风格图的画风特征，再把待处理的新照片转成同样的水墨扁平插画，保留原图构图主心骨，米色留白处居中排入两行英文标题。",
  },
];

const results = [];
for (const item of CASES) {
  const task = taskById.get(item.id);
  if (!task) { console.log(`${item.id}: 题库里找不到，跳过`); continue; }
  const uploads = inputAssets(task).map((a) => ({ name: assetLabel(a), src: dataUri(a.src) }));
  const prompt = imagePrompt(task, uploads, item.student);
  const body = { prompt };
  if (uploads.length) body.image = uploads.map((u) => u.src);

  console.log(`\n── ${item.id} · ${task.title.slice(0, 34)}`);
  console.log(`   参考图 ${uploads.length} 张${uploads.length ? "（" + uploads.map((u) => u.name).join("、") + "）" : ""}`);
  console.log(`   请求体 ${(JSON.stringify(body).length / 1024).toFixed(0)} KB`);

  const started = Date.now();
  if (DRY_RUN) {
    console.log(`   [dry-run] prompt 前 160 字：${prompt.slice(0, 160).replace(/\n/g, " / ")}`);
    console.log(`   [dry-run] image 字段：${uploads.length ? uploads.map((u) => u.src.slice(0, 32) + "…").join(", ") : "（无）"}`);
    results.push({ id: item.id, ok: "dry", refs: uploads.length, requestKB: +(JSON.stringify(body).length / 1024).toFixed(0) });
    continue;
  }
  let payload;
  try {
    const res = await fetch(`${BASE}/api/ark/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    });
    payload = await res.json();
    if (!res.ok || !payload.image) {
      console.log(`   ✗ 失败 HTTP ${res.status}: ${payload.error || JSON.stringify(payload).slice(0, 200)}`);
      results.push({ id: item.id, ok: false, error: payload.error || `HTTP ${res.status}`, seconds: (Date.now() - started) / 1000 });
      continue;
    }
  } catch (err) {
    console.log(`   ✗ 请求异常: ${err.name}: ${err.message}`);
    results.push({ id: item.id, ok: false, error: `${err.name}: ${err.message}`, seconds: (Date.now() - started) / 1000 });
    continue;
  }

  const seconds = (Date.now() - started) / 1000;
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(payload.image);
  if (!m) {
    console.log(`   ✗ 返回不是 data URI：${payload.image.slice(0, 80)}`);
    results.push({ id: item.id, ok: false, error: "非 data URI", seconds });
    continue;
  }
  const [, mime, b64] = m;
  const bytes = Buffer.from(b64, "base64");
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const file = join(OUT, `${item.id}-${uploads.length}ref.${ext}`);
  writeFileSync(file, bytes);
  // 记录 PNG 实际像素尺寸
  let dims = "";
  if (ext === "png" && bytes.length > 24) {
    const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
    dims = `${w}×${h}`;
  }
  console.log(`   ✓ ${(bytes.length / 1024).toFixed(0)} KB  ${dims}  ${seconds.toFixed(1)}s  → ${file.replace(ROOT + "/", "")}`);
  results.push({ id: item.id, ok: true, refs: uploads.length, file: file.replace(ROOT + "/", ""), bytes: bytes.length, dims, seconds });
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(results, null, 2));
console.log("\n══ 汇总 ══");
for (const r of results) {
  if (r.ok === "dry") console.log(`  · ${r.id}  [dry-run] 参考图 ${r.refs} 张，请求体 ${r.requestKB} KB（未调用接口）`);
  else if (r.ok) console.log(`  ✓ ${r.id}  参考图 ${r.refs} 张  ${r.dims}  ${(r.bytes / 1024).toFixed(0)}KB  ${r.seconds.toFixed(1)}s  ${r.file}`);
  else console.log(`  ✗ ${r.id}  ${r.error}`);
}
console.log(`产物目录：${OUT}`);
