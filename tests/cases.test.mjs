import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { getCaseLayers } from "../src/case-buffer.js";
import {
  CASES,
  CASE_INTERVAL,
  getCaseFaces,
  normalizeCaseIndex,
} from "../src/cases.js";

test("the four selected cases have real local entry points; pixel pirate is excluded", async () => {
  assert.equal(CASES.length, 4);
  assert.ok(!CASES.some((item) => item.id === "pirate-pixel"));
  assert.equal(new Set(CASES.map((item) => item.id)).size, CASES.length);
  for (const item of CASES)
    await access(
      new URL(`../public${item.src.split("?")[0]}`, import.meta.url),
    );
});
test("every screen visits every case exactly once per rotation", () => {
  for (const face of ["top", "left", "right"]) {
    const ids = CASES.map((_, index) => getCaseFaces(index)[face].id);
    assert.equal(new Set(ids).size, CASES.length);
  }
  for (let index = 0; index < CASES.length; index++) {
    assert.equal(
      new Set(Object.values(getCaseFaces(index)).map((item) => item.id)).size,
      3,
    );
  }
  assert.deepEqual(getCaseFaces(CASES.length), getCaseFaces(0));
  assert.equal(normalizeCaseIndex(-1), CASES.length - 1);
  assert.equal(CASE_INTERVAL, 15000);
});
test("requested marketing statistics are removed from page markup", async () => {
  const app = await readFile(
    new URL("../src/App.jsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    app,
    /50k\+|120\+|98%|10k\+|className="stats"|className="social-proof"/,
  );
});

test("case buffers keep the current frame while loading and never exceed two layers", () => {
  const [a,b,c,d] = CASES;
  assert.deepEqual(getCaseLayers(null,a,a,b),[a,b]);
  assert.deepEqual(getCaseLayers(null,a,c,b),[a,c]);
  assert.deepEqual(getCaseLayers(a,b,b,c),[a,b]);
  assert.deepEqual(getCaseLayers(a,b,d,c),[b,d]);
  assert.deepEqual(getCaseLayers(null,a,a,a),[a]);
});

test("initial boot waits for the visible trio before it mounts preload layers", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const screen = await readFile(new URL("../src/CaseScreen.jsx", import.meta.url), "utf8");
  assert.match(app, /const casesReady = bootedCases\.size === initialCaseIds\.current\.size/);
  assert.match(app, /\[casesReady, active, transitionBusy, playing, visible, modal, preset, choosePreset\]/);
  assert.match(app, /preloadCases=\{casesReady\}/);
  assert.match(app, /is-case-booting/);
  assert.match(screen, /preload \? nextConfig : null/);
  assert.match(screen, /onCaseReady\?\.\(id\)/);
  assert.match(app, /const handleCaseReady = useCallback/);
  assert.match(screen, /useLayoutEffect/);
  const runtime = await readFile(new URL("../public/cases/embed-runtime.js", import.meta.url), "utf8");
  assert.match(runtime, /aiquos:ready-ack/);
  assert.match(runtime, /setTimeout\(announceReady, 350\)/);
});

test("showcase video and Mario canvas use cover rather than letterboxing", async () => {
  const css = await readFile(new URL("../src/cases.css", import.meta.url), "utf8");
  const mario = await readFile(new URL("../public/cases/mario/css/style.css", import.meta.url), "utf8");
  assert.match(css, /\.case-layer > video[\s\S]*object-fit: cover/);
  assert.match(mario, /\.showcase #game[\s\S]*object-fit: cover/);
  assert.match(mario, /width: 100vw;[\s\S]*height: 100vh/);
});

test("the removed content editor has no remaining entry point", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app,/function Studio|setModal\("studio"\)|<Studio|上传自己的内容|屏幕快捷编辑/);
});
