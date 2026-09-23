/**
 * 最终端到端验收：三阶段全流程（含简报态、键盘作答、评分、报告）。
 *   node scripts/qa-full-e2e.mjs [base]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://127.0.0.1:4287";
mkdirSync("work/e2e", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "aiquos-e2e-"));
const child = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9370", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  try { if ((await fetch("http://127.0.0.1:9370/json/version")).ok) break; } catch {}
}
const target = await (await fetch("http://127.0.0.1:9370/json/new?about:blank", { method: "PUT" })).json();
const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let id = 0; const pending = new Map();
socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const cid = ++id; pending.set(cid, r); socket.send(JSON.stringify({ id: cid, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
async function shot(n) { const p = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`work/e2e/${n}.png`, Buffer.from(p.result.data, "base64")); }
const go = async (u, w = 4000) => { await send("Page.navigate", { url: `${BASE}/${u}` }); await sleep(w); };

const problems = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) problems.push(label + (detail ? ": " + detail : ""));
};
const skipStory = async () => {
  for (let i = 0; i < 8; i += 1) {
    if (await evaluate("!document.querySelector('.comprehensive-dialogue-screen')")) break;
    await evaluate("document.querySelector('.comprehensive-dialogue-screen')?.click()");
    await sleep(800);
  }
};
const waitInterview = async () => {
  for (let i = 0; i < 60; i += 1) {
    if (await evaluate("!!document.querySelector('.interview-composer input') && !document.querySelector('.interview-composer input').disabled")) return true;
    await sleep(800);
  }
  return false;
};
const answerInterview = async (text) => {
  await evaluate(`(() => {
    const i = document.querySelector('.interview-composer input');
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.interview-composer button')?.click()");
  for (let i = 0; i < 45; i += 1) {
    const busy = await evaluate("!!document.querySelector('.chat-bubble.is-judging') || !!document.querySelector('.chat-bubble.is-typing')");
    const en = await evaluate("document.querySelector('.interview-composer input')?.disabled === false");
    if (!busy && en) return;
    await sleep(800);
  }
};

// ═══ 阶段 1：对话式测评 ═══
console.log("\n=== 阶段 1 · 对话式测评 ===");
await go("#assessment/conversation/level/1", 7000);
check("采访输入框就绪", await waitInterview());
await shot("01-interview");

const answers = [
  "上周用DeepSeek把导师两小时访谈录音整理成三千字纪要，它自动分段，我改了听错的人名和数据后交给导师。",
  "我要求它按发言人和议题分两级小标题，每人不超过600字，保留全部数据引用，末尾附待确认清单。",
  "我加了字数限制和正式语气两条约束，因为组会汇报最看重长度和信息密度。",
  "我会说：开头那段保留，第二段太泛，补三个具体案例，每条控制在两句话以内。",
  "你是学术助理：把录音整理为纪要，两级小标题、每人600字内、保留数据引用，输出结构化文档。",
];
for (const a of answers) {
  if (!await evaluate("!!document.querySelector('.interview-composer input') && !document.querySelector('.interview-composer input').disabled")) break;
  await answerInterview(a);
  if (await evaluate("!!document.querySelector('.interview-summary')")) break;
}
check("采访自然收尾", await evaluate("!!document.querySelector('.interview-summary')"));
const credits = await evaluate("[...document.querySelectorAll('.interview-credits span')].map((s) => s.textContent.trim()).join(' | ')");
check("五个话题都有档位分", (credits.match(/可操作|具体|专业|提及/g) || []).length >= 4, credits.slice(0, 80));
await shot("02-interview-summary");

// ═══ 阶段 2：客观题（键盘作答）═══
console.log("\n=== 阶段 2 · 客观题 CAT（键盘）===");
await go("#assessment/objective/level/1", 4000);
check("题目已加载", await evaluate("!!document.querySelector('.answer-options')"));
// 键盘 2 → Enter 循环
for (let round = 0; round < 20; round += 1) {
  if (await evaluate("!!document.querySelector('.cat-summary')")) break;
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))");
  await sleep(500);
  const isMulti = await evaluate("!!document.querySelector('.answer-options[role=group]')");
  if (isMulti) {
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
    await sleep(700);
  }
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
  await sleep(1300);
}
check("键盘可完成并触发小结", await evaluate("!!document.querySelector('.cat-summary')"));
const summary = await evaluate("document.querySelector('.cat-summary')?.innerText?.replace(/\\n+/g, ' | ') || ''");
check("小结含统计信息", /正确率|答对/.test(summary), summary.slice(0, 70));
await shot("03-cat-summary");

// ═══ 阶段 3：实操（简报 → 作答 → 生成 → 完成）═══
console.log("\n=== 阶段 3 · 实操工作台 ===");
await go("?task=human-1#assessment/practical/level/1", 3500);
check("先到简报态", await evaluate(`document.querySelector('.task-body')?.dataset.phase === 'brief'`));
check("简报有开始按钮", await evaluate("!!document.querySelector('.wb-brief-start')"));
await shot("04-brief");
const t1 = await evaluate("document.querySelector('.phase-timer')?.textContent || ''");
await sleep(3000);
const t2 = await evaluate("document.querySelector('.phase-timer')?.textContent || ''");
check("简报态计时在走", t1 !== t2, `${t1} → ${t2}`);
await evaluate("document.querySelector('.wb-brief-start')?.click()");
await sleep(1500);
check("确认后进入作答", await evaluate(`document.querySelector('.task-body')?.dataset.phase === 'work' && !!document.querySelector('.wb-composer textarea')`));
await shot("05-workbench");

await evaluate(`(() => {
  const ta = document.querySelector('.wb-composer textarea');
  const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  s.call(ta, '你是小红书种草博主。为马卡龙色保温杯写300字文案：含标题、正文、话题标签，面向大学生，语气活泼，输出后自检格式。');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await evaluate("document.querySelector('.agent-send')?.click()");
let generated = false;
for (let i = 0; i < 80; i += 1) {
  const done = await evaluate("!!document.querySelector('.wb-complete-row') || !!document.querySelector('.agent-error')");
  if (done) { generated = await evaluate("!!document.querySelector('.wb-complete-row')"); break; }
  await sleep(1500);
}
check("Agent 生成完成", generated);
check("输出非空", (await evaluate("document.querySelector('.wb-output')?.innerText?.length || 0")) > 50);
await shot("06-generated");
const finishClicked = await evaluate("(() => { const b = document.querySelector('.wb-complete-row .task-action'); if (!b || b.disabled) return 'unavailable'; b.click(); return 'clicked'; })()");
check("完成按钮可点击", finishClicked === 'clicked', finishClicked);
// 导师评审要调用一次模型，实测约 8–12 秒；这里轮询而不是固定等待。
let finalHash = "#assessment/practical/level/1";
for (let i = 0; i < 30; i += 1) {
  finalHash = await evaluate("location.hash");
  if (finalHash !== "#assessment/practical/level/1") break;
  await sleep(1500);
}
check("完成后离开任务页", finalHash !== "#assessment/practical/level/1", finalHash);

// ═══ 报告 ═══
console.log("\n=== 觉醒报告 ===");
await go("#reports", 4000);
check("报告页无报错", !await evaluate("!!document.querySelector('.panel-error')"));
await shot("07-report");

console.log(`\n${problems.length === 0 ? "全部通过 ✓" : `发现 ${problems.length} 个问题：\n  - ` + problems.join("\n  - ")}`);
socket.close(); child.kill();
