import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeBin, rmProfile } from "./lib/chrome.mjs";
const BASE = process.argv[2] || "http://127.0.0.1:5173";
const OUT = "work/virtual-classes";
const fixture = JSON.parse(readFileSync(new URL("../worker/initial-cohort.json", import.meta.url), "utf8"));
const teacherAccount = fixture.accounts.find((item) => item.role === "teacher");
const inventory = { teacherPassword: "Teacher2026Demo", studentPassword: "Student2026Demo",
  classes: fixture.data.classes.map((item) => ({ name: item.name, teacher: teacherAccount.account })),
  students: fixture.accounts.filter((item) => item.role === "student") };
async function login(account, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account, password }) });
  assert.equal(res.status, 200, `登录 ${account}`);
  return res.json();
}
async function get(path, session) {
  const res = await fetch(BASE + path, { headers: { authorization: `Bearer ${session.token}` } });
  assert.equal(res.status, 200, path); return res.json();
}
const sessions = [];
for (const item of inventory.classes) {
  const teacher = await login(item.teacher, inventory.teacherPassword);
  const data = await get("/api/data/teacher/overview", teacher);
  assert.equal(data.students.length, 80); assert.equal(data.runs.length, 320);
  assert.equal(data.students.filter((student) => student.className === item.name).length, 40);
  assert.equal(data.assignments.length, 2); assert.ok(data.assignments.every((assignment) => assignment.completedCount === 40));
  assert.equal(data.store.persistent, true);
  const classStats = data.classDetails.find((classroom) => classroom.name === item.name);
  let firstStudent;
  for (const account of inventory.students.filter((student) => student.className === item.name)) {
    const student = await login(account.account, inventory.studentPassword);
    firstStudent ||= student;
    const classroom = fixture.data.classes.find((item) => item.name === account.className);
    const lookup = await get(`/api/data/classes?code=${encodeURIComponent(classroom.code)}`, student);
    assert.equal(lookup.class.name, account.className);
    const me = await get("/api/data/me", student);
    assert.equal(me.runs.length, 4);
    assert.deepEqual(new Set(me.runs.map((run) => run.assessmentId)), new Set(["conversation", "objective", "practical", "comprehensive"]));
    assert.ok(me.runs.every((run) => run.simulated && run.dimensions.length === 6));
    assert.equal(me.classStats.studentCount, classStats.studentCount);
    assert.equal(me.classStats.classAverage, classStats.classAverage);
    assert.equal(me.classStats.teacherAccountId, teacher.profile.accountId);
    for (const run of me.runs) assert.deepEqual(run, data.runs.find((record) => record.id === run.id));
  }
  sessions.push({ item, teacher, student: firstStudent, stats: classStats });
  console.log(`${item.name}：40 名学生、160 条记录，师生端均分 ${classStats.classAverage} 完全一致`);
}

// 新建独立浏览器环境：不依赖原浏览器的任何账号/测评缓存。
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "aiquos-virtual-qa-"));
const child = spawn(chromeBin(), ["--headless=new", "--remote-debugging-port=9378", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
const keepAlive = setInterval(() => {}, 1000);
try {
  for (let i = 0; i < 80; i++) { await sleep(250); try { if ((await fetch("http://127.0.0.1:9378/json/version")).ok) break; } catch {} }
  const tab = await (await fetch("http://127.0.0.1:9378/json/new?about:blank", { method: "PUT" })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const waiting = new Map();
  socket.onmessage = (event) => { const message = JSON.parse(event.data); if (waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); } };
  const send = (method, params = {}) => new Promise((resolve) => { const next = ++id; waiting.set(next, resolve); socket.send(JSON.stringify({ id: next, method, params })); });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.result?.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails));
    return result.result?.result?.value;
  };
  const navigate = async (url) => { await send("Page.navigate", { url: BASE + url }); await sleep(2200); };
  const shot = async (name) => { const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, "base64")); };
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate("/admin.html");
  for (const [i, session] of sessions.entries()) {
    await evaluate(`localStorage.setItem('aiquos.admin-auth.v1', ${JSON.stringify(JSON.stringify(session.teacher))})`);
    await navigate("/admin.html");
    let text = await evaluate("document.body.innerText");
    assert.ok(text.includes(session.item.name));
    assert.ok(text.includes(String(session.stats.classAverage)));
    assert.ok(text.includes(sessions[1 - i].item.name));
    await shot(`teacher-${i + 1}`);
    await evaluate("[...document.querySelectorAll('button')].find((button) => button.innerText.includes('测评记录')).click()");
    await sleep(500); text = await evaluate("document.body.innerText");
    for (const label of ["综合测评", "实操测评", "对话式测评", "客观题测评"]) assert.ok(text.includes(label), label);
    await shot(`teacher-${i + 1}-records`);
    await evaluate(`localStorage.setItem('aiquos.auth.v1', ${JSON.stringify(JSON.stringify(session.student))})`);
    await navigate("/#center/organizations");
    text = await evaluate("document.body.innerText");
    assert.ok(text.includes(session.item.name)); assert.ok(text.includes("40 人"));
    assert.ok(text.includes(`${session.stats.classAverage} 分`));
    assert.ok(await evaluate("!!document.querySelector('.rank-chart')"));
    assert.ok(text.includes("我的平均分"));
    assert.ok(!text.includes("陈老师"));
    assert.ok(!text.includes("任课教师"));
    assert.ok(!text.includes("我的测评记录"));
    assert.ok(!await evaluate("!!document.querySelector('.class-server-runs')"));
    await shot(`student-${i + 1}`);
    await navigate("/#reports");
    const latestRun = (await get("/api/data/me", session.student)).runs[0];
    const reportText = await evaluate("document.querySelector('.ability-report')?.innerText || ''");
    assert.ok(reportText.includes('完成于'));
    const reportScore = await evaluate("document.querySelector('.ability-total strong')?.innerText");
    assert.equal(parseInt(reportScore), Math.round(latestRun.overallScore));
    assert.ok(reportText.includes('综合测评'));
    await navigate("/#center/records");
    let shownMonth = new Date().getFullYear() * 12 + new Date().getMonth();
    const showMonth = async (date) => {
      const wanted = date.getFullYear() * 12 + date.getMonth();
      while (shownMonth !== wanted) {
        const direction = wanted < shownMonth ? "上个月" : "下个月";
        await evaluate(`document.querySelector('[aria-label="${direction}"]').click()`);
        shownMonth += wanted < shownMonth ? -1 : 1;
        await sleep(100);
      }
    };
    await showMonth(new Date(latestRun.completedAt));
    assert.ok(await evaluate("!!document.querySelector('.has-record')"));
    const me = await get("/api/data/me", session.student);
    for (const run of me.runs) {
      const date = new Date(run.completedAt);
      await showMonth(date);
      await evaluate(`Array.from(document.querySelectorAll('.calendar-grid button')).find((button) => !button.disabled && button.querySelector('span')?.textContent === '${date.getDate()}').click()`);
      await sleep(100);
      const recordText = await evaluate("document.querySelector('.records-panel').innerText");
      assert.ok(!recordText.includes('模拟'));
      assert.ok(recordText.includes('已完成'));
      const label = { comprehensive: '综合测评', practical: '实操测评', objective: '客观题测评', conversation: '对话式测评' }[run.assessmentId];
      assert.ok(recordText.includes(label), label);
    }
    await shot(`student-${i + 1}-calendar`);
    console.log(`教师 ${i + 1} / 学生 ${i + 1} 实际页面验证通过`);
  }
} finally { clearInterval(keepAlive); socket?.close(); child.kill(); await sleep(800); rmProfile(profile); }
console.log("80 个学生登录、320 条模拟记录、两班数据归属与师生页面验证全部通过");
