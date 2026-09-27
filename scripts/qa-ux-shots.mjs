/**
 * 全场景截图脚本：逐个答题场景截图供人工检查。
 * 输出到 work/ux-shots/。
 *   node scripts/qa-ux-shots.mjs [base]
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://127.0.0.1:4287";
const OUT = "work/ux-shots";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "aiquos-ux-"));
const child = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9360", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  try { if ((await fetch("http://127.0.0.1:9360/json/version")).ok) break; } catch {}
}
const target = await (await fetch("http://127.0.0.1:9360/json/new?about:blank", { method: "PUT" })).json();
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

await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const shots = [];
async function shot(name) {
  const png = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(png.result.data, "base64"));
  const meta = await evaluate(`({
    stem: document.querySelector('.task-body h2')?.textContent?.slice(0, 40) || document.querySelector('.workbench-head h2')?.textContent?.slice(0, 40) || '',
    note: document.querySelector('.interview-who span:not(.interview-avatar)')?.textContent || document.querySelector('.quiz-brief')?.textContent?.slice(0, 40) || '',
  })`);
  shots.push(`${name}.png — ${meta.stem} ${meta.note}`.trim());
  console.log(`${name}.png`);
}
const go = async (hash, wait = 3500) => {
  await send("Page.navigate", { url: `${BASE}/${hash}` });
  await sleep(wait);
};
const skipStory = async () => {
  for (let i = 0; i < 8; i += 1) {
    const gone = await evaluate("!document.querySelector('.comprehensive-dialogue-screen')");
    if (gone) break;
    await evaluate("document.querySelector('.comprehensive-dialogue-screen')?.click()");
    await sleep(800);
  }
};
const waitInterviewer = async () => {
  for (let i = 0; i < 60; i += 1) {
    const ready = await evaluate("!!document.querySelector('.interview-composer input') && !document.querySelector('.interview-composer input').disabled");
    if (ready) break;
    await sleep(800);
  }
};
const answerInterview = async (text) => {
  await evaluate(`(() => {
    const input = document.querySelector('.interview-composer input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.interview-composer button')?.click()");
  for (let i = 0; i < 40; i += 1) {
    const idle = await evaluate("!document.querySelector('.chat-bubble.is-judging') && !document.querySelector('.chat-bubble.is-typing')");
    const en = await evaluate("document.querySelector('.interview-composer input')?.disabled === false");
    if (idle && en) break;
    await sleep(800);
  }
};

// ── 1. 对话式测评：完整一轮 + 小结 ──
await go("#assessment/conversation/level/1", 9000);
await waitInterviewer();
await shot("01-interview-start");
await answerInterview("上周用 DeepSeek 把两小时的访谈录音整理成三千字纪要，它自动分段，我改了听错的人名和数据，最后交给导师了。");
await shot("02-interview-answered");
const answers = [
  "我跟它说按发言人和议题分两级小标题，每人600字内，保留全部数据引用，末尾附待确认清单。",
  "我加了字数限制和正式语气两条约束，因为组会汇报最看重长度和信息密度。",
  "我会说：开头那段保留，第二段太泛，补三个具体案例，每条控制在两句话以内。",
  "你是学术助理：把录音整理为纪要，两级小标题、每人600字内、保留数据引用，输出结构化文档。",
];
for (const text of answers) {
  const en = await evaluate("!!document.querySelector('.interview-composer input') && !document.querySelector('.interview-composer input').disabled");
  if (!en) break;
  await answerInterview(text);
  if (await evaluate("!!document.querySelector('.interview-summary')")) break;
}
await sleep(1500);
await shot("03-interview-summary");

// ── 2. 客观题：单选答错 / 多选 / 小结 ──
await go("#assessment/objective/level/1", 5000);
await evaluate("document.querySelectorAll('.answer-options button')[3]?.click()");
await sleep(1500);
await shot("04-objective-wrong");
// 逐题直到出现多选
let multiShot = false;
for (let round = 0; round < 10; round += 1) {
  const isMulti = await evaluate("!!document.querySelector('.answer-options[role=group]')");
  if (isMulti && !multiShot) {
    await evaluate("document.querySelectorAll('.answer-options button')[0]?.click()");
    await sleep(400);
    await evaluate("document.querySelectorAll('.answer-options button')[2]?.click()");
    await sleep(600);
    await shot("05-objective-multi");
    multiShot = true;
    await evaluate("document.querySelector('.comprehensive-actions .task-action')?.click()");
    await sleep(1200);
    await shot("06-objective-multi-feedback");
    break;
  }
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))");
  await sleep(700);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
  await sleep(1600);
}
// 答到小结
for (let round = 0; round < 20; round += 1) {
  if (await evaluate("!!document.querySelector('.cat-summary')")) break;
  const isMulti = await evaluate("!!document.querySelector('.answer-options[role=group]')");
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))");
  await sleep(500);
  if (isMulti) {
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
    await sleep(800);
  }
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
  await sleep(1500);
}
await sleep(1500);
await shot("07-objective-summary");

// ── 3. 实操：文本任务空态 / 生成后 ──
await go("?task=human-8#assessment/practical/level/1", 4000);
await sleep(1500);
await shot("08-workbench-text-empty");
await evaluate(`(() => {
  const ta = document.querySelector('.wb-composer textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, '你是资深 Python 工程师。请把下面这份遗留代码重构为简短、易读、带异常处理、效率更高的版本，保持函数签名与合法输入结果不变，并给出重构前后对比与基准自测结果表格。');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await evaluate("document.querySelector('.agent-send')?.click()");
for (let i = 0; i < 40; i += 1) {
  if (await evaluate("!!document.querySelector('.wb-complete-row') || !!document.querySelector('.agent-error')")) break;
  await sleep(2500);
}
await sleep(1200);
await shot("09-workbench-text-generated");
// 提示词记录
await evaluate("[...document.querySelectorAll('.wb-canvas-tabs button')][1]?.click()");
await sleep(800);
await shot("10-workbench-history");

// ── 4. 实操：图片任务（含参考图） ──
await go("?task=human-10#assessment/practical/level/1", 4000);
await sleep(2000);
await shot("11-workbench-image-task");

// ── 5. 实操：带参考图的外扩任务 ──
await go("?task=human-13#assessment/practical/level/1", 4000);
await sleep(2000);
await shot("12-workbench-outpaint");

// ── 6. 素材展开态 ──
await evaluate("document.querySelector('.source-toggle')?.click()");
await sleep(900);
await shot("13-workbench-material-open");

socket.close();
child.kill();
await sleep(600);
console.log("\n=== 已采集 ===\n" + shots.join("\n"));
