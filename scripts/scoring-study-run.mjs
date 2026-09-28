/**
 * 10 道实操题的打分实验（浏览器驱动，走真实页面链路）。
 *
 * 设计
 * ────
 * 变量：题（10）× 水平（3）× 重复（3）= 90 次打分。
 * 固定：模型 deepseek-flash、temperature=0、thinking disabled
 *       （与线上打分轨完全一致，见 worker/practical-score.js）。
 *
 * 为什么用浏览器而不是直接打 HTTP：用户要求"通过浏览器操作去实现"，
 * 且页面才是学员真实路径——它能同时暴露"接口返回正常但界面渲染不出"这类问题。
 * 实现方式是在页面内 fetch /api/practical-score（同源，走 vite 中间件到
 * worker），参数与 src/AssessmentFlow.jsx 的 requestPracticalScore 一致。
 *
 * 盲法：请求体里只出现 S1/S2/S3 文件名与内容，绝不含水平标签；
 * levels.json 只在最后统计时才读取。
 *
 * 运行：node scripts/scoring-study-run.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const STUDY = join(ROOT, "work", "scoring-study");
const ANSWERS = join(STUDY, "answers");
const IMAGES = join(STUDY, "images");
const OUT = join(STUDY, "results");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE || "http://127.0.0.1:4286";
const REPEATS = Number(process.env.REPEATS || 3);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;   // 只跑指定题（冒烟用）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bank = JSON.parse(readFileSync(join(ROOT, "src", "banks", "practical-10.json"), "utf8"));
const tasks = bank.tasks.filter((t) => !ONLY || ONLY.includes(t.id));
const imageTaskIds = new Set(bank.tasks.filter((t) => t.outputType === "image").map((t) => t.id));

const readAnswer = (taskId, kind, slot) => {
  const file = join(ANSWERS, `${taskId}.${kind}.${slot}.txt`);
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "";
};

/** 产物图转 data URI（走与前端一致的形式）。 */
const imageDataUri = (taskId, slot) => {
  const file = join(IMAGES, `${taskId}.${slot}.png`);
  if (!existsSync(file)) return "";
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
};

// ── 启动浏览器 ──
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "aiq-score-"));
const port = 9300 + Math.floor(Math.random() * 200);
const child = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 100; i += 1) {
  await sleep(250);
  try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {}
}
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const c = ++msgId; pending.set(c, r); ws.send(JSON.stringify({ id: c, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
// 打开真实页面（同源，后续 fetch 会经 vite 中间件到 worker）
await send("Page.navigate", { url: `${BASE}/?task=${tasks[0].id}#assessment/practical/level/1` });
await sleep(3000);
const boot = await evaluate(`location.origin`);
if (!boot) { console.error("页面未加载，确认 dev server 在 4286 上运行"); process.exit(1); }
console.log(`浏览器就绪（origin=${boot}）；题目 ${tasks.length} 道 × 3 档 × ${REPEATS} 次 = ${tasks.length * 3 * REPEATS} 次打分`);

/** 在页面内调用真实评分接口（与 requestPracticalScore 同参）。 */
async function scoreOnce(task, slot, repeat) {
  const prompt = readAnswer(task.id, "prompt", slot);
  const isImage = imageTaskIds.has(task.id);
  const product = isImage ? "" : readAnswer(task.id, "product", slot);
  const productImage = isImage ? imageDataUri(task.id, slot) : "";
  const body = {
    taskId: task.id,
    edition: "B",
    prompt,
    prompts: [prompt],
    product,
    isImage,
    iterations: 1,
    ...(productImage ? { productImage } : {}),
  };
  const expr = `(async () => {
    const started = Date.now();
    try {
      const res = await fetch("/api/practical-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: ${JSON.stringify(JSON.stringify(body))},
      });
      const text = await res.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch {}
      return JSON.stringify({ status: res.status, ms: Date.now() - started, payload, raw: payload ? null : text.slice(0, 300) });
    } catch (error) {
      return JSON.stringify({ status: 0, ms: Date.now() - started, error: String(error) });
    }
  })()`;
  const raw = await evaluate(expr);
  return raw ? JSON.parse(raw) : { status: 0, error: "no-response" };
}

// 断点续跑：启动时读入已有结果，按 (题, 档, 重复序号) 去重。
// 否则"只补跑某几题"会把其余题目的结果整体覆盖掉（本实验踩过两次）。
const RUNS_FILE = join(OUT, "raw-runs.json");
const rows = [];
const seen = new Set();
if (existsSync(RUNS_FILE)) {
  try {
    for (const r of JSON.parse(readFileSync(RUNS_FILE, "utf8"))) {
      if (r && !r.error) {                       // 只保留成功记录，失败的重跑
        rows.push(r);
        seen.add(`${r.taskId}|${r.slot}|${r.repeat}`);
      }
    }
    console.log(`已载入 ${rows.length} 条历史成功记录（断点续跑）`);
  } catch { /* 文件损坏则从零开始 */ }
}
let index = 0;
for (const task of tasks) {
  for (const slot of ["S1", "S2", "S3"]) {
    for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
      index += 1;
      if (seen.has(`${task.id}|${slot}|${repeat}`)) {
        continue;                                 // 已有成功记录，跳过
      }
      const result = await scoreOnce(task, slot, repeat);
      const payload = result.payload;
      const row = {
        taskId: task.id,
        outputType: task.outputType,
        slot, repeat,
        status: result.status,
        ms: result.ms,
        judged: payload?.judged ?? null,
        totalScore: payload?.totalScore ?? null,
        maxScore: payload?.maxScore ?? null,
        credit: payload?.credit ?? null,
        // worker 返回的是 { prompt: { rows: [{dimension, level, awarded, comment}], awarded, max }, product: {...} }
        promptRows: (payload?.prompt?.rows ?? []).map((r) => ({ d: r.dimension, level: r.level, awarded: r.awarded })),
        productRows: (payload?.product?.rows ?? []).map((r) => ({ d: r.dimension, level: r.level, awarded: r.awarded })),
        promptScore: payload?.prompt?.awarded ?? null,
        productScore: payload?.product?.awarded ?? null,
        error: result.error ?? payload?.error ?? null,
      };
      rows.push(row);
      if (!row.error) seen.add(`${row.taskId}|${row.slot}|${row.repeat}`);
      const tail = row.error ? `ERR ${String(row.error).slice(0, 60)}` : `${row.totalScore}/${row.maxScore} (${row.judged})`;
      console.log(`[${String(index).padStart(3)}/${tasks.length * 3 * REPEATS}] ${task.id} ${slot} #${repeat} → ${tail}  ${row.ms}ms`);
      writeFileSync(RUNS_FILE, JSON.stringify(rows, null, 2));
      await sleep(150);
    }
  }
}

console.log(`\n完成 ${rows.length} 次打分，原始数据 → work/scoring-study/results/raw-runs.json`);
ws.close(); child.kill();
