/** 信息密度与字号审计：列出每个测评页面里偏小的文字与过长的可见内容。 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeBin } from "./lib/chrome.mjs";
const CHROME = chromeBin();
const BASE = process.argv[2] || "http://127.0.0.1:4287";
const profile = mkdtempSync(join(tmpdir(), "aiquos-audit-"));
const child = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9362", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i += 1) { await sleep(250); try { if ((await fetch("http://127.0.0.1:9362/json/version")).ok) break; } catch {} }
const target = await (await fetch("http://127.0.0.1:9362/json/new?about:blank", { method: "PUT" })).json();
const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let id = 0; const pending = new Map();
socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const cid = ++id; pending.set(cid, r); socket.send(JSON.stringify({ id: cid, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const AUDIT = `(() => {
  const out = [];
  const skip = new Set(['HTML','HEAD','SCRIPT','STYLE','svg','path','circle','ellipse','rect']);
  for (const el of document.querySelectorAll('.assessment-flow *')) {
    if (skip.has(el.tagName)) continue;
    // 直接文本节点才算条目
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own.length < 2) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (size >= 16) continue;
    out.push({ sel: el.className.toString().slice(0, 46), size: Math.round(size * 10) / 10, text: own.slice(0, 44), w: Math.round(r.width), lines: Math.round(r.height / (size * 1.4)) });
  }
  // 去重：同一选择器只保留一个样本
  const seen = new Set();
  return out.filter((x) => { const k = x.sel + x.size; if (seen.has(k)) return false; seen.add(k); return true; });
})()`;

const screens = [
  ["对话式测评进行中", "#assessment/conversation/level/1", 9000],
  ["客观题进行中", "#assessment/objective/level/1", 5000],
  ["实操工作台（图片）", "?task=human-10#assessment/practical/level/1", 5000],
  ["实操工作台（文本）", "?task=human-8#assessment/practical/level/1", 5000],
];

for (const [label, hash, wait] of screens) {
  await send("Page.navigate", { url: `${BASE}/${hash}` });
  await sleep(wait);
  const small = await evaluate(AUDIT);
  console.log(`\n### ${label} — 小于 16px 的文字（${small.length} 处）`);
  for (const item of small) console.log(`  ${item.size}px  ${item.sel.padEnd(46)} “${item.text}”`);
}
socket.close(); child.kill();
