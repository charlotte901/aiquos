/**
 * Measure element proportions in a real browser at several window sizes.
 *
 * Drives the Chrome already on this machine over the DevTools protocol, so it
 * needs no extra dependency: Node 22 ships a global `WebSocket` and `fetch`.
 * Its job is to answer one question with numbers rather than by eye — does a
 * given element hold the same share of the frame at every resolution?
 *
 *   node scripts/probe.mjs [url] [WxH ...]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_ARG = process.argv[2] || "http://localhost:5173/";
const SIZES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["1280x720", "1920x1080", "2560x1440", "3840x2160"];

// Selectors whose share of the frame we want. Deliberately a list of the things
// the eye reads as "the composition", not every node in the tree.
const TARGETS = [
  ".design-canvas",
  ".app",
  ".pink-frame",
  ".site-header",
  ".home-brand",
  ".brand-display",
  ".cube-position",
  ".home-hero-art",
  ".intro-copy",
  ".intro-copy h2",
  ".case-carousel",
  ".carousel-dots",
  ".case-poster-frame",
  ".case-poster-feature",
  ".case-poster-words",
  ".case-poster-words span:first-child",
  ".case-archive",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "aiquos-probe-"));
  const child = spawn(CHROME, [
    "--headless=new",
    "--remote-debugging-port=9222",
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
      const res = await fetch("http://127.0.0.1:9222/json/version");
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
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || "eval failed");
    }
    return result.result.value;
  }
}

async function connect() {
  const res = await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" });
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

const MEASURE = `(() => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const out = {};
  for (const selector of ${JSON.stringify(TARGETS)}) {
    const node = document.querySelector(selector);
    if (!node) continue;
    const r = node.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    out[selector] = {
      x: +(r.left / viewport.width * 100).toFixed(2),
      y: +(r.top / viewport.height * 100).toFixed(2),
      w: +(r.width / viewport.width * 100).toFixed(2),
      h: +(r.height / viewport.height * 100).toFixed(2),
      px: [Math.round(r.width), Math.round(r.height)],
    };
  }
  return { viewport, out };
})()`;

const only = process.env.PROBE_ONLY; // optional: a tab to click first

async function measureAt(session, size) {
  const [width, height] = size.split("x").map(Number);
  await session.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await session.send("Page.navigate", { url: URL_ARG });
  await sleep(3200); // boot curtain + cube scene compile
  if (only) {
    await session.evaluate(`(() => {
      const link = [...document.querySelectorAll('.site-header nav a')]
        .find((a) => a.textContent.trim().toLowerCase() === ${JSON.stringify(only)}.toLowerCase());
      if (link) link.click();
      return Boolean(link);
    })()`);
    await sleep(2600);
  }
  return session.evaluate(MEASURE);
}

const { child, profile } = await launch();
try {
  const { session, targetId } = await connect();
  const runs = [];
  for (const size of SIZES) {
    const result = await measureAt(session, size);
    runs.push([size, result]);
  }
  const selectors = new Set();
  for (const [, result] of runs) Object.keys(result.out).forEach((s) => selectors.add(s));

  const pad = (value, width) => String(value).padStart(width);
  console.log(`\nurl ${URL_ARG}${only ? `  (after clicking ${only})` : ""}`);
  for (const selector of selectors) {
    console.log(`\n${selector}`);
    console.log(`  ${"window".padEnd(12)}${pad("x%", 8)}${pad("y%", 8)}${pad("w%", 8)}${pad("h%", 8)}  px`);
    const shares = [];
    for (const [size, result] of runs) {
      const m = result.out[selector];
      if (!m) { console.log(`  ${size.padEnd(12)}  (absent)`); continue; }
      console.log(`  ${size.padEnd(12)}${pad(m.x, 8)}${pad(m.y, 8)}${pad(m.w, 8)}${pad(m.h, 8)}  ${m.px.join("×")}`);
      shares.push(m);
    }
    if (shares.length > 1) {
      const spread = (key) => {
        const values = shares.map((s) => s[key]);
        return +(Math.max(...values) - Math.min(...values)).toFixed(2);
      };
      const worst = Math.max(spread("x"), spread("y"), spread("w"), spread("h"));
      console.log(`  spread  max ${worst} percentage points ${worst <= 0.35 ? "(invariant)" : "(DRIFTS)"}`);
    }
  }
  await fetch(`http://127.0.0.1:9222/json/close/${targetId}`);
} finally {
  child.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
