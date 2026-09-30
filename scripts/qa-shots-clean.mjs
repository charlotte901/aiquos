/** 补齐剩余场景截图：单通道入口页、实操图片任务生成、觉醒报告 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeBin } from "./lib/chrome.mjs";
const CHROME = chromeBin();
const BASE = process.argv[2] || "http://127.0.0.1:4287";
const OUT = "work/ux-shots";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "aiquos-cc-"));
const child = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9361", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 60; i += 1) { await sleep(250); try { if ((await fetch("http://127.0.0.1:9361/json/version")).ok) break; } catch {} }
const target = await (await fetch("http://127.0.0.1:9361/json/new?about:blank", { method: "PUT" })).json();
const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let id = 0; const pending = new Map();
socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const cid = ++id; pending.set(cid, r); socket.send(JSON.stringify({ id: cid, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
async function shot(name) {
  const png = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(png.result.data, "base64"));
  console.log(name + ".png");
}
const go = async (url, wait = 4000) => { await send("Page.navigate", { url: `${BASE}/${url}` }); await sleep(wait); };

// 图片任务：生成一张（ARK 未配置 → 离线演示图）
await go("?task=human-13#assessment/practical/level/1", 4500);
await evaluate(`(() => {
  const ta = document.querySelector('.wb-composer textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, '保持原图完全保真，将竖屏照片外扩为16:9横屏壁纸：两侧延伸出与原图一致的暖色砖墙与窗台，光影与颗粒感统一，边缘自然无拼接，输出16:9、2048px。');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await evaluate("document.querySelector('.agent-send')?.click()");
for (let i = 0; i < 30; i += 1) { if (await evaluate("!!document.querySelector('.wb-complete-row') || !!document.querySelector('.wb-image')")) break; await sleep(2000); }
await sleep(1500);
await shot("14-workbench-image-generated");

// 报告页（注入一个完成快照）
await go("", 2500);
await evaluate(`(() => {
  const evidence = [
    ["c1", ["D1","D2"], 1, "low"], ["c2", ["D2","D3"], 0.75, "medium"], ["c3", ["D3","D4"], 0.75, "medium"],
    ["c4", ["D4","D5"], 0.5, "high"], ["c5", ["D5","D6"], 1, "medium"], ["c6", ["D6","D1"], 0.75, "low"],
    ["c7", ["D1","D4"], 1, "high"], ["c8", ["D2","D5"], 0.75, "medium"],
    ["conv-experience", ["D1","D5"], 0.75, "medium"], ["conv-goal", ["D2","D5"], 1, "medium"],
    ["conv-constraints", ["D2","D3"], 0.75, "medium"], ["conv-feedback", ["D4","D2"], 0.75, "medium"],
    ["conv-consolidate", ["D2","D5"], 1, "medium"], ["prac-human-11", ["D3","D4"], 0.75, "medium"],
  ].map(([questionId, dimKeys, credit, difficulty]) => ({ questionId, type: "single", difficulty, dimKeys, selectedKeys: [], credit, answeredAt: new Date().toISOString() }));
  const dims = [
    { key: "D1", name: "AI基础认知", short: "认知", score: 88, evidenceCount: 4 },
    { key: "D2", name: "提示词工程", short: "提示", score: 92, evidenceCount: 6 },
    { key: "D3", name: "AI工具使用", short: "工具", score: 79, evidenceCount: 3 },
    { key: "D4", name: "AI结果评估与优化", short: "评估", score: 83, evidenceCount: 4 },
    { key: "D5", name: "人机协同解决问题", short: "协同", score: 86, evidenceCount: 4 },
    { key: "D6", name: "AI伦理与合规", short: "伦理", score: 81, evidenceCount: 2 },
  ];
  const snapshot = { assessmentId: "comprehensive", startedAt: new Date(Date.now() - 20 * 60000).toISOString(), completedAt: new Date().toISOString(), totalQuestions: evidence.length, questionIds: evidence.map((e) => e.questionId), evidence, result: { scoringVersion: "1.0.0", status: "completed", answeredCount: evidence.length, totalQuestions: evidence.length, dimensions: dims, overallScore: 85, grade: "A" }, scoringVersion: "1.0.0", questionBankVersion: "objective-bank-v6-120" };
  localStorage.setItem("aiquos.comprehensive-history.v1", JSON.stringify([snapshot]));
})()`);
await go("#reports", 4000);
// 点开全部小源台词以显示报告内容
for (let i = 0; i < 4; i += 1) { await evaluate("document.querySelector('.comprehensive-dialogue-screen, .report-dialogue, [class*=dialogue]')?.click()"); await sleep(600); }
await sleep(1500);
await shot("15-awakening-report");
socket.close(); child.kill();
console.log("done");
