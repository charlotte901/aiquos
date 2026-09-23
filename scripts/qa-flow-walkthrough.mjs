/**
 * 综合测评三阶段流程走查（QA）：地图 → 对话采访 → 客观 CAT → 实操工作台。
 *
 *   node scripts/qa-flow-walkthrough.mjs [base]   # 默认 http://127.0.0.1:4287
 * 输出每步 DOM 摘要与 work/flow-shots/ 截图；对话阶段真实调用一次 LLM。
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://127.0.0.1:4287";
const OUT = "work/flow-shots";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "aiquos-flow-"));
const child = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9342", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  try { if ((await fetch("http://127.0.0.1:9342/json/version")).ok) break; } catch {}
}
const target = await (await fetch("http://127.0.0.1:9342/json/new?about:blank", { method: "PUT" })).json();
const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let id = 0; const pending = new Map();
socket.onmessage = (event) => {
  const m = JSON.parse(event.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const cid = ++id; pending.set(cid, resolve);
  socket.send(JSON.stringify({ id: cid, method, params }));
});
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

async function shot(name) {
  const png = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(join(OUT, `${name}.png`), Buffer.from(png.result.data, "base64"));
}

async function go(url) {
  await send("Page.navigate", { url });
  await sleep(2800);
}

const click = (selector) => evaluate(`document.querySelector('${selector}')?.click() || 'MISSING:${selector}'`);
const text = async (selector, n = 160) => String(await evaluate(`document.querySelector('${selector}')?.innerText || '(none)'`)).replace(/\n+/g, " | ").slice(0, n);

console.log("── A. 综合测评地图（3 阶段）──");
await go(`${BASE}/#assessment/comprehensive`);
console.log("节点:", await text(".map-path"));
await shot("map-comprehensive");

console.log("── B. 对话阶段：剧情 → 采访 ──");
await go(`${BASE}/#assessment/comprehensive/level/1`);
for (let i = 0; i < 6; i += 1) {
  const done = await evaluate(`!!document.querySelector('.interview-head')`);
  if (done) break;
  await click(".comprehensive-dialogue-screen");
  await sleep(900);
}
await sleep(6000); // 开场白 + 第一问（含 LLM 或离线回退）
console.log("采访者:", await text(".interview-who strong"));
console.log("进度:", await text(".interview-who span:not(.interview-avatar)"));
console.log("消息数:", await evaluate("document.querySelectorAll('.interview-thread .chat-bubble').length"));
console.log("计时:", await text(".phase-timer"));
await shot("phase1-interview");

console.log("── B2. 发送一条回答 ──");
await evaluate(`(() => {
  const input = document.querySelector('.interview-composer input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '我想让AI帮新同学用一页导览了解社团：包含社团简介、3个招牌活动、加入方式，语气轻松，500字以内。');
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await click(".interview-composer button");
await sleep(9000); // 判分 + 采访者逐字回复
console.log("消息数:", await evaluate("document.querySelectorAll('.interview-thread .chat-bubble').length"));
console.log("最新气泡:", await evaluate(`[...document.querySelectorAll('.interview-thread .chat-bubble p')].slice(-1).map(p => p.textContent.slice(0, 100)).join('')`));
await shot("phase1-replied");

console.log("── C. 客观阶段：CAT 出题 → 作答 ──");
await go(`${BASE}/#assessment/comprehensive/level/2`);
for (let i = 0; i < 6; i += 1) {
  const done = await evaluate(`!!document.querySelector('.answer-options')`);
  if (done) break;
  await click(".comprehensive-dialogue-screen");
  await sleep(900);
}
await sleep(1800);
console.log("题干:", await text("h2", 80));
console.log("简报:", await text(".quiz-brief"));
console.log("选项数:", await evaluate("document.querySelectorAll('.comprehensive-option').length"));
await click(".comprehensive-option");
await sleep(1200);
console.log("反馈:", await text(".quiz-feedback strong"));
await shot("phase2-cat");
await click(".comprehensive-actions .task-action");
await sleep(2500);
console.log("下一题:", await text("h2", 80));

console.log("── D. 实操阶段 ──");
await go(`${BASE}/#assessment/comprehensive/level/3`);
for (let i = 0; i < 6; i += 1) {
  const done = await evaluate(`!!document.querySelector('.workbench-head')`);
  if (done) break;
  await click(".comprehensive-dialogue-screen");
  await sleep(900);
}
await sleep(1200);
console.log("任务:", await text(".workbench-head h2"));
console.log("计时:", await text(".phase-timer"));
await shot("phase3-workbench");

console.log("── E. 单独对话通道（无剧情直达） ──");
await go(`${BASE}/#assessment/conversation/level/1`);
await sleep(7000);
console.log("采访者:", await text(".interview-who strong"));
console.log("消息数:", await evaluate("document.querySelectorAll('.interview-thread .chat-bubble').length"));
await shot("standalone-conversation");

console.log("── F. 单独客观通道 ──");
await go(`${BASE}/#assessment/objective/level/1`);
await sleep(2500);
console.log("题干:", await text("h2", 80));
console.log("题干前缀正常(非'考察方向'):", await evaluate(`!document.querySelector('h2')?.innerText.startsWith('考察方向')`));
await shot("standalone-objective");

socket.close();
child.kill();
await sleep(600);
console.log("WALKTHROUGH DONE");
