/**
 * 实操任务逐题截图验证（QA 专用）。
 *
 * 对题库里的每一道实操任务，以 ?task=<id>#assessment/practical/level/1
 * 直达工作台页面，跳过开场剧情后整页截图。输出目录：work/task-shots/。
 *
 *   node scripts/qa-practical-shots.mjs [base]     # base 默认 http://127.0.0.1:4287
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://127.0.0.1:4287";
const OUT = "work/task-shots";
const SIZE = { width: 1600, height: 1000 };

const bank = JSON.parse(await readFile(new URL("../worker/practical-tasks.json", import.meta.url), "utf8"));
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(join(tmpdir(), "aiquos-qa-"));
const child = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=9334",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "about:blank",
], { stdio: "ignore" });

for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  try {
    const res = await fetch("http://127.0.0.1:9334/json/version");
    if (res.ok) break;
  } catch {}
}

const ws = await (await fetch("http://127.0.0.1:9334/json/new?about:blank", { method: "PUT" })).json();

// Minimal CDP client over the global WebSocket (Node ≥ 22 ships it).
const socket = new globalThis.WebSocket(ws.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

let commandId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return result.result?.result?.value;
}

await send("Emulation.setDeviceMetricsOverride", {
  width: SIZE.width,
  height: SIZE.height,
  deviceScaleFactor: 1,
  mobile: false,
});

async function capture(taskId) {
  const url = `${BASE}/?task=${taskId}#assessment/practical/level/1`;
  await send("Page.navigate", { url });
  await sleep(2600);
  // Skip the standalone loading + settle, then screenshot.
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const bytes = Buffer.from(shot.result.data, "base64");
  const file = join(OUT, `${taskId}.png`);
  await writeFile(file, bytes);
  const title = await evaluate("document.querySelector('.workbench-head h2')?.textContent || 'NO-TASK'");
  const brief = await evaluate("document.querySelector('.wb-requirements li')?.textContent || 'NO-REQ'");
  const meta = await evaluate("document.querySelector('.workbench-meta')?.textContent || ''");
  console.log(`${taskId} · ${String(title).slice(0, 40)} · ${meta.trim().slice(0, 60)} → ${file}`);
}

for (const task of bank.tasks) {
  await capture(task.id);
}

socket.close();
child.kill();
await sleep(800);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds files; the temp dir is OS-cleaned */ }
console.log(`DONE ${bank.tasks.length} shots in ${OUT}`);
