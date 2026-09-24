/**
 * 实操任务逐题 DOM 审计（QA）：
 *   - 参考图 <img> 是否真实加载（naturalWidth > 0）
 *   - 交付标准是否全部渲染
 *   - 标题/计时牌/画布选项卡/输入框是否在
 *   - 素材展开是否真的显示内容
 *   node scripts/qa-practical-audit.mjs [base]
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://127.0.0.1:4287";

const bank = JSON.parse(await readFile(new URL("../src/banks/practical-80.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "aiquos-audit-"));
const child = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9345", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  try { if ((await fetch("http://127.0.0.1:9345/json/version")).ok) break; } catch {}
}
const target = await (await fetch("http://127.0.0.1:9345/json/new?about:blank", { method: "PUT" })).json();
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

let failures = 0;
for (const task of bank.tasks) {
  await send("Page.navigate", { url: `${BASE}/?task=${task.id}#assessment/practical/level/1` });
  await sleep(2400);
  const audit = await evaluate(`(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    const title = q('.workbench-head h2')?.textContent?.trim() || '';
    const reqCount = qa('.wb-requirements li').length;
    const timer = q('.phase-timer')?.textContent || '';
    const imgs = qa('.wb-reference-item img').map((img) => ({ loaded: img.complete && img.naturalWidth > 0, w: img.naturalWidth, visibleHeight: img.getBoundingClientRect().height }));
    const tabs = qa('.wb-canvas-tabs button').length;
    const composer = !!q('.wb-composer textarea');
    const toggle = q('.source-toggle')?.textContent || '';
    // Expand material and check it actually renders content
    q('.source-toggle')?.click();
    const materialLen = q('.wb-material')?.innerText?.length ?? 0;
    const codeBlocks = qa('.wb-material .md-code').length;
    const reqHidden = qa('.wb-requirements li').filter((li) => li.getBoundingClientRect().height === 0).length;
    return JSON.stringify({ title: title.slice(0, 30), reqCount, timer: timer.slice(0, 14), imgs, tabs, composer, toggle, materialLen, codeBlocks, reqHidden });
  })()`);
  const info = JSON.parse(audit || "{}");
  const expectedImages = Array.isArray(task.assets) ? task.assets.length : 0;
  const problems = [];
  if (!info.title) problems.push("无标题");
  if (info.reqCount !== task.requirements.length) problems.push(`交付标准 ${info.reqCount}/${task.requirements.length}`);
  if (info.reqHidden > 0) problems.push(`${info.reqHidden} 条标准不可见`);
  if (!info.timer.includes("剩余")) problems.push("无计时牌");
  if (info.tabs !== 2) problems.push(`画布选项卡 ${info.tabs}/2`);
  if (!info.composer) problems.push("无输入框");
  if (info.imgs.length !== expectedImages) problems.push(`参考图 ${info.imgs.length}/${expectedImages}`);
  if (info.imgs.some((img) => !img.loaded)) problems.push("参考图未加载");
  if (info.imgs.some((img) => img.visibleHeight < 40)) problems.push("参考图高度塌陷");
  if (info.materialLen < (task.material || "").length * 0.5) problems.push(`素材渲染不全 ${info.materialLen}/${(task.material || "").length}`);
  if ((task.material || "").includes("```") && info.codeBlocks === 0) problems.push("代码块未渲染");
  const status = problems.length ? "FAIL" : "PASS";
  if (problems.length) failures += 1;
  console.log(`${status} ${task.id} · ${info.title} · 图${info.imgs.length}/${expectedImages} · 标准${info.reqCount} · 素材${info.materialLen}字${info.codeBlocks ? ` 代码块x${info.codeBlocks}` : ""}${problems.length ? " · " + problems.join("；") : ""}`);
}
socket.close();
child.kill();
await sleep(500);
console.log(failures === 0 ? `ALL ${bank.tasks.length} PASS` : `${failures} FAILURES`);
