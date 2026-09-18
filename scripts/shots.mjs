/**
 * Capture full-page screenshots at several window sizes, for before/after proof.
 *
 * Same Chrome-over-DevTools-protocol trick as probe.mjs (no extra dependency).
 * Writes PNGs into the directory given as AQ_SHOTS_DIR (default work/shots).
 *
 *   AQ_SHOTS_DIR=work/baseline node scripts/shots.mjs http://localhost:5173/ 1920x1080 1280x720
 *   AQ_TABS=home,cases,forum node scripts/shots.mjs ...
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_ARG = process.argv[2] || "http://localhost:5173/";
const SIZES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["1920x1080"];
const OUT = process.env.AQ_SHOTS_DIR || "work/shots";
const TABS = (process.env.AQ_TABS || "home").split(",").filter(Boolean);
const SETTLE = Number(process.env.AQ_SETTLE || 4200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "aiquos-shots-"));
  const child = spawn(CHROME, [
    "--headless=new",
    "--remote-debugging-port=9333",
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
      const res = await fetch("http://127.0.0.1:9333/json/version");
      if (res.ok) return { child, profile };
    } catch {}
  }
  throw new Error("Chrome did not open its debugging port");
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      const slot = this.pending.get(msg.id);
      if (!slot) return;
      this.pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(JSON.stringify(msg.error)));
      else slot.resolve(msg.result);
    });
  }
  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || "eval failed");
    }
    return result.result.value;
  }
}

async function connect() {
  const res = await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const session = new Session(ws);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  return { session, targetId: target.id };
}

const goTo = (tab) => `(() => {
  const hash = ${JSON.stringify({ home: "#home", cases: "#cases", forum: "#forum" })}[${JSON.stringify(tab)}];
  location.hash = hash;
  const link = [...document.querySelectorAll('.site-header nav a')]
    .find((a) => a.getAttribute('href') === hash);
  if (link) link.click();
  return location.hash;
})()`;

const { child, profile } = await launch();
mkdirSync(OUT, { recursive: true });
try {
  const { session, targetId } = await connect();
  for (const size of SIZES) {
    const [width, height] = size.split("x").map(Number);
    await session.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: false,
    });
    for (const tab of TABS) {
      await session.send("Page.navigate", { url: URL_ARG });
      await sleep(SETTLE);
      if (tab !== "home") {
        await session.evaluate(goTo(tab));
        await sleep(SETTLE);
      }
      const shot = await session.send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: false,
      });
      const file = join(OUT, `${size}-${tab}.png`);
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log(`wrote ${file}`);
    }
  }
  await fetch(`http://127.0.0.1:9333/json/close/${targetId}`);
} finally {
  child.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
