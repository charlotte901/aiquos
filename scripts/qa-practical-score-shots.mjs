/**
 * 实操评分链路截图（QA 专用）。
 *
 * 走完整学员路径：简报 → 作答（真实 DeepSeek 生成）→ 交卷评分（LLM 评委
 * 逐维判档）→ 评分报告。输出目录：work/practical-score-shots/。
 *
 *   node scripts/qa-practical-score-shots.mjs [base]   # 默认 http://127.0.0.1:4288
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeBin } from "./lib/chrome.mjs";

const CHROME = chromeBin();
const BASE = process.argv[2] || "http://127.0.0.1:4288";
const OUT = "work/practical-score-shots";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "aiquos-ps-"));
const child = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9361", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  try { if ((await fetch("http://127.0.0.1:9361/json/version")).ok) break; } catch {}
}
const target = await (await fetch("http://127.0.0.1:9361/json/new?about:blank", { method: "PUT" })).json();
const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let id = 0; const pending = new Map();
socket.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const cid = ++id; pending.set(cid, resolve);
  socket.send(JSON.stringify({ id: cid, method, params }));
});
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

async function shot(name) {
  const png = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(png.result.data, "base64"));
  console.log(`${name}.png`);
}

const waitFor = async (expression, { timeout = 90_000, tick = 700, label = "" } = {}) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(tick);
  }
  console.error(`TIMEOUT waiting for ${label || expression}`);
  return false;
};

const setSize = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });

const PROMPT = "你是资深行政助理。请把原始素材里这段口语化的工作汇报整理成书面周报：按「本周完成 / 数据要点 / 风险与下周计划」三个小节组织，保留全部数字与事实，每条不超过两句话，语气正式客观，末尾附一段不超过 60 字的摘要。";

async function runFlow({ size, prefix }) {
  await setSize(size[0], size[1]);
  // 同 hash 重复导航不会重挂载 React：先跳空白页打断当前会话。
  await send("Page.navigate", { url: "about:blank" });
  await sleep(400);
  await send("Page.navigate", { url: `${BASE}/?task=lite-003&r=${Date.now()}#assessment/practical/level/1` });
  await waitFor("!!document.querySelector('.wb-brief-screen')", { label: "brief screen", timeout: 30_000 });
  await sleep(600);
  await shot(`${prefix}-brief`);

  await evaluate("document.querySelector('.wb-brief-start')?.click()");
  await waitFor("!!document.querySelector('.workbench-grid')", { label: "workbench" });
  await sleep(400);
  await shot(`${prefix}-work-empty`);

  await evaluate(`(() => {
    const input = document.querySelector('.wb-composer textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(PROMPT)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.wb-composer .agent-send')?.click()");
  await waitFor("!!document.querySelector('.wb-output') && !document.querySelector('.reply-spinner')", { label: "agent output" });
  await sleep(800);
  await shot(`${prefix}-work-generated`);

  await evaluate("document.querySelector('.wb-complete-row .task-action')?.click()");
  await waitFor("!!document.querySelector('.wb-score-screen')", { label: "score report" });
  await sleep(500);
  await shot(`${prefix}-score`);
}

try {
  await runFlow({ size: [1440, 900], prefix: "01-desktop" });
  await runFlow({ size: [414, 896], prefix: "02-mobile" });
} finally {
  const summary = await evaluate("document.querySelector('.wb-score-total')?.textContent || ''");
  console.log("score seen:", summary);
  socket.close();
  child.kill("SIGTERM");
}
