/**
 * 严格登录 + 师生数据互通 + 人物布局 的端到端截图验收。
 *   node scripts/qa-auth-data-shots.mjs [base]
 *
 * 前置：dev server 运行中，且 worker/auth-accounts.json 里已有演示师生账号
 * （teacher1@aiquos.local / teach1234；13800000002 / stud1234，班级
 * 「AI 应用 1 班」，已有一条 asg 作业与一次完成记录）。没有时脚本会提示。
 *
 * 产出：work/auth-data-qa/ 下的桌面+移动截图，以及控制台断言结果。
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeBin } from "./lib/chrome.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:4287";
const OUT = "work/auth-data-qa";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "aiquos-authqa-"));
const child = spawn(chromeBin(), [
  "--headless=new", "--remote-debugging-port=9371", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  try { if ((await fetch("http://127.0.0.1:9371/json/version")).ok) break; } catch {}
}
const target = await (await fetch("http://127.0.0.1:9371/json/new?about:blank", { method: "PUT" })).json();
const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let id = 0; const pending = new Map();
socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const cid = ++id; pending.set(cid, r); socket.send(JSON.stringify({ id: cid, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const setViewport = async (width, height) =>
  send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 841 });
async function shot(n) { const p = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${n}.png`, Buffer.from(p.result.data, "base64")); }
const go = async (u, w = 4000) => { await send("Page.navigate", { url: `${BASE}/${u}` }); await sleep(w); };

const problems = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) problems.push(label + (detail ? ": " + detail : ""));
};

const setInput = (selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);

await setViewport(1440, 900);

// 造一份「待完成」作业（教师账号直接走 API）：种子数据里的作业已完成，
// 学生端需要一份带「开始作答」按钮的待办才能验证启动链路。
{
  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: "teacher1@aiquos.local", password: "teach1234" }),
  });
  if (loginResponse.ok) {
    const { token } = await loginResponse.json();
    const existing = await (await fetch(`${BASE}/api/data/assignments`, {
      headers: { authorization: `Bearer ${token}` },
    })).json();
    const mine = existing.assignments?.find?.((item) => item.title.includes("随堂小测"));
    if (!mine) {
      await fetch(`${BASE}/api/data/assignments`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: "随堂小测 · 提示词基础",
          note: "十分钟内完成，考查提示词的基本结构。",
          edition: "B",
          scope: { all: true },
        }),
      });
    }
  }
}

// ═══ 1. 学生端 · 严格登录 ═══
console.log("\n=== 登录严格校验 ===");
await go("#login", 3500);
await evaluate("localStorage.clear()");
await go("#login", 3500);
await evaluate("document.querySelector('form.login-form button[type=submit]')?.click()");
await sleep(700);
check("空表单被拦截并提示", await evaluate("document.querySelectorAll('.login-field.is-invalid').length === 2"));
await shot("01-login-empty-errors");

await setInput('.login-form input[aria-label="账号"]', "1380000000X");
await setInput("#login-password", "123");
await evaluate("document.querySelector('form.login-form button[type=submit]')?.click()");
await sleep(700);
check("非法账号/弱密码分别报错", await evaluate("document.querySelectorAll('.login-field.is-invalid').length === 2")
  && /手机号/.test(await evaluate("document.querySelector('.login-field-error')?.textContent || ''")));
await shot("02-login-format-errors");

await setInput('.login-form input[aria-label="账号"]', "13800000002");
await setInput("#login-password", "stud1234");
await evaluate("document.querySelector('form.login-form button[type=submit]')?.click()");
for (let i = 0; i < 15; i += 1) {
  await sleep(600);
  if (await evaluate("location.hash === '#choose'")) break;
}
check("正确账号登录进入 CHOOSE", await evaluate("location.hash === '#choose'"));
check("会话已建立（aiquos.auth.v1）", await evaluate("!!localStorage.getItem('aiquos.auth.v1')"));
await shot("03-choose");

// ═══ 2. 学生端 · 教师推送 ═══
console.log("\n=== 教师推送（组卷作业）===");
await go("#assessments", 3500);
check("推送看板渲染", await evaluate("!!document.querySelector('.assessment-assignments')"));
check("作业卡片可见", await evaluate("[...document.querySelectorAll('.assignment-card-main strong')].some((el) => el.textContent.includes('综合能力测评'))"));
await shot("04-testhub-assignments");
const started = await evaluate("(() => { const b = document.querySelector('.assignment-start'); if (!b) return 'missing'; b.click(); return 'clicked'; })()");
check("开始作答可点击", started === "clicked", started);
await sleep(3200);
check("进入综合测评地图", await evaluate("!!document.querySelector('.map-flow, .map-stage' ) || location.hash.includes('assessment/comprehensive')"));
await shot("05-assignment-started-map");

// ═══ 3. 人物布局（四通道 + 移动）═══
console.log("\n=== 人物布局（120% · 居中）===");
const measureCharacter = async () => evaluate(`(() => {
  const video = document.querySelector('.task-character-video');
  const stage = document.querySelector('.task-character-stage');
  const panel = document.querySelector('.task-panel');
  if (!video || !stage || !video.videoWidth) return { error: 'not-ready' };
  const vb = video.getBoundingClientRect();
  const sb = stage.getBoundingClientRect();
  const pb = panel.getBoundingClientRect();
  const fit = Math.min(vb.width / video.videoWidth, vb.height / video.videoHeight);
  const contentW = video.videoWidth * fit;
  const contentH = video.videoHeight * fit;
  const transform = new DOMMatrix(getComputedStyle(video).transform);
  const cx = vb.left + vb.width / 2, cy = vb.top + vb.height / 2;
  const mapPoint = (x, y) => ({ x: transform.a * (x - cx) + cx, y: transform.d * (y - cy) + cy });
  const contentLeft = vb.left + (vb.width - contentW) / 2;
  const contentTop = vb.top + (vb.height - contentH) / 2;
  return {
    videoElement: { w: Math.round(vb.width), h: Math.round(vb.height) },
    stage: { left: Math.round(sb.left), right: Math.round(sb.right), top: Math.round(sb.top), bottom: Math.round(sb.bottom) },
    zoneCenter: Math.round((pb.right + innerWidth) / 2),
    videoCenter: Math.round(mapPoint(vb.left + vb.width / 2, 0).x),
    horizontalCenter: Math.abs((sb.left + sb.right) / 2 - (pb.right + innerWidth) / 2) <= 6,
    overlapPanel: vb.left < pb.right,
    transformScale: transform.a,
  };
})()`);
for (const channel of ["objective", "conversation", "practical", "comprehensive"]) {
  await go(`#assessment/${channel}/level/1`, 3800);
  await evaluate(`(() => { for (let i = 0; i < 8; i++) document.querySelector('.comprehensive-dialogue-screen')?.click(); })()`);
  await sleep(600);
  const m = await measureCharacter();
  check(`${channel} 人物在非白色区域居中`, m.horizontalCenter === true, JSON.stringify(m).slice(0, 120));
  check(`${channel} 人物不压白色卡片`, m.overlapPanel === false);
  await shot(`06-character-${channel}`);
}
await setViewport(390, 844);
for (const channel of ["objective", "comprehensive"]) {
  await go(`#assessment/${channel}/level/1`, 3800);
  await evaluate(`(() => { for (let i = 0; i < 8; i++) document.querySelector('.comprehensive-dialogue-screen')?.click(); })()`);
  await sleep(600);
  const stageH = await evaluate("Math.round(document.querySelector('.task-character-stage')?.getBoundingClientRect().height || 0)");
  check(`移动端 ${channel} 舞台高度 336（120%）`, stageH === 336, String(stageH));
  await shot(`07-character-mobile-${channel}`);
}
await setViewport(1440, 900);

// ═══ 4. 学生端 · 真实班级数据 ═══
console.log("\n=== 班级数据（我的组织）===");
await go("#center/organizations", 3800);
check("服务端班级卡渲染", await evaluate("!!document.querySelector('.class-server-note')"));
check("班级排名可见", await evaluate("/第 \\d+ 名/.test(document.querySelector('.class-info-grid')?.innerText || '')"));
await shot("08-organizations-server-class");

// ═══ 5. 教师端 ═══
console.log("\n=== 教师端（管理控制台）===");
await go("admin.html#login", 2500);
await evaluate("localStorage.removeItem('aiquos.admin-auth.v1')");
await go("admin.html", 3200);
check("教师网关渲染（无演示口令）", await evaluate("!!document.querySelector('.gate-tabs') && !/admin/.test(document.querySelector('.gate-card p')?.textContent || '')"));
await shot("09-admin-gate");
await setInput(".gate-card input[type=text]", "teacher1@aiquos.local");
await setInput(".gate-card input[type=password]", "teach1234");
await evaluate("document.querySelector('.gate-card button[type=submit]')?.click()");
for (let i = 0; i < 15; i += 1) {
  await sleep(700);
  if (await evaluate("!!document.querySelector('.admin-shell')")) break;
}
check("教师登录进入控制台", await evaluate("!!document.querySelector('.admin-shell')"));
check("数据源为服务端实时", await evaluate("!!document.querySelector('.admin-data-chip.is-live')"));
await shot("10-admin-overview");

// 学生试图登录教师端应被拒（用一个学生账号）
await evaluate("[...document.querySelectorAll('.admin-side nav button')].find((b) => b.textContent.includes('学员管理'))?.click()");
await sleep(900);
check("学员管理显示真实学员", await evaluate("[...document.querySelectorAll('.admin-table tbody td')].some((td) => td.textContent.includes('小林'))"));
await shot("11-admin-students");

await evaluate("[...document.querySelectorAll('.admin-side nav button')].find((b) => b.textContent.includes('组卷中心'))?.click()");
await sleep(1000);
check("组卷中心渲染", await evaluate("!!document.querySelector('.assignment-compose')"));
check("已下发作业显示完成度", await evaluate("/\\d+\\/\\d+ 完成/.test(document.querySelector('.assignment-admin-list')?.innerText || '')"));
await shot("12-admin-assignments");
await evaluate("[...document.querySelectorAll('.assignment-admin-head')][0]?.click()");
await sleep(900);
check("作业明细表可展开", await evaluate("!!document.querySelector('.assignment-admin-body table')"));
await shot("13-admin-assignment-detail");

await evaluate("[...document.querySelectorAll('.admin-side nav button')].find((b) => b.textContent.includes('测评记录'))?.click()");
await sleep(900);
check("测评记录含服务端来源", await evaluate("[...document.querySelectorAll('.src-tag')].some((t) => t.textContent.includes('服务端'))"));
await shot("14-admin-records");

// 学生账号进教师端被拒
await evaluate("document.querySelector('.admin-side-foot button')?.click()");
await sleep(900);
await setInput(".gate-card input[type=text]", "13800000002");
await setInput(".gate-card input[type=password]", "stud1234");
await evaluate("document.querySelector('.gate-card button[type=submit]')?.click()");
await sleep(1800);
check("学生账号被教师端拒绝", await evaluate("!!document.querySelector('.gate-error') && !document.querySelector('.admin-shell')"));
await shot("15-admin-student-rejected");

console.log(`\n${problems.length === 0 ? "全部通过 ✓" : `发现 ${problems.length} 个问题：\n  - ` + problems.join("\n  - ")}`);
try { socket.close(); } catch {}
child.kill();
