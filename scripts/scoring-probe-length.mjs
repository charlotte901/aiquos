/**
 * 长度混淆的定向探测（补充实验）。
 *
 * 起因：主实验里"提示词得分 vs 提示词长度"相关系数 +0.805，而三档设计里
 * 高档恰好也更长 —— 这就有个说不清的地方：评委到底在识别"质量"，
 * 还是只在奖励"写得长"？主实验无法回答，因为质量与长度是共变的。
 *
 * 本探测刻意把两个变量拆开：
 *   P-long-bad   569 字：很长，但全是空话（"要专业""要好一点"），无可判定约束
 *   P-short-good 425 字：较短，但给出全部硬约束（字数区间/三段/禁用词/数据清单）
 *   P-tiny-good  381 字：更短，硬约束一个不少
 *
 * 预期（若评委真的识别质量）：long-bad < short-good ≈ tiny-good
 * 若长度是主因：long-bad 反而更高或相当 → 说明打分被长度主导，需修规则。
 *
 * 只发 3 次打分，走同一真实链路（浏览器 → /api/practical-score）。
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromeBin } from "./lib/chrome.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const STUDY = join(ROOT, "work", "scoring-study");
const PROBE = join(STUDY, "probe");
mkdirSync(PROBE, { recursive: true });

const BASE = process.env.BASE || "http://127.0.0.1:4286";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 三档最优产物（S3）作为统一产物，隔离"产物"变量，只看提示词侧
const product = readFileSync(join(STUDY, "answers", "lite-003.product.S3.txt"), "utf8").trim();
const CASES = ["P-long-bad", "P-short-good", "P-tiny-good"];
const REPEATS = Number(process.env.REPEATS || 3);

const CHROME = chromeBin();
const profile = mkdtempSync(join(tmpdir(), "aiq-probe-"));
const port = 9600 + Math.floor(Math.random() * 200);
const child = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank",
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
await send("Page.navigate", { url: `${BASE}/?task=lite-003#assessment/practical/level/1` });
await sleep(3000);

const rows = [];
for (const name of CASES) {
  const text = readFileSync(join(PROBE, `${name}.txt`), "utf8").trim();
  for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
    const body = {
      taskId: "lite-003", edition: "B",
      prompt: text, prompts: [text], product,
      isImage: false, iterations: 1,
    };
    const raw = await evaluate(`(async () => {
      const res = await fetch("/api/practical-score", { method: "POST",
        headers: { "content-type": "application/json" }, body: ${JSON.stringify(JSON.stringify(body))} });
      const t = await res.text();
      let p = null; try { p = JSON.parse(t); } catch {}
      return JSON.stringify({ status: res.status, payload: p });
    })()`);
    const parsed = JSON.parse(raw);
    const p = parsed.payload;
    const promptRows = (p?.prompt?.rows ?? []).map((r) => `${r.dimension}=${r.level}`);
    rows.push({
      name, chars: text.length, repeat,
      status: parsed.status, judged: p?.judged,
      promptScore: p?.prompt?.awarded ?? null,
      productScore: p?.product?.awarded ?? null,
      totalScore: p?.totalScore ?? null,
      levels: promptRows,
    });
    const last = rows[rows.length - 1];
    console.log(`${name.padEnd(13)} ${String(text.length).padStart(4)}字 #${repeat} → 提示词 ${last.promptScore}/10  总分 ${last.totalScore}/20`);
    await sleep(150);
  }
}

// 汇总
console.log("\n══ 汇总（每题 3 次均值）══");
const byName = {};
for (const r of rows) {
  byName[r.name] ??= { chars: r.chars, prompt: [], total: [] };
  if (r.promptScore !== null) byName[r.name].prompt.push(r.promptScore);
  if (r.totalScore !== null) byName[r.name].total.push(r.totalScore);
}
const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
for (const [name, v] of Object.entries(byName)) {
  console.log(`  ${name.padEnd(13)} ${String(v.chars).padStart(4)}字  提示词均分 ${avg(v.prompt)}/10  总分均分 ${avg(v.total)}/20`);
}
writeFileSync(join(PROBE, "probe-results.json"), JSON.stringify({ rows, summary: byName }, null, 2));
console.log(`\n明细 → work/scoring-study/probe/probe-results.json`);
ws.close(); child.kill();
