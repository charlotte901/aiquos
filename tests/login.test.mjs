import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { transform } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "@phosphor-icons/react";
import { getLoginScreenSize } from "../src/cube-geometry.js";

const source = await readFile(new URL("../src/LoginForm.jsx", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "jsx", jsx: "automatic", format: "cjs" });
const compiled = { exports: {} };
// Compile the local JSX module using the project's existing React instance.
const require = createRequire(import.meta.url);
new Function("require", "module", "exports", code)(
  (name) => name === "@phosphor-icons/react" ? icons : require(name), compiled, compiled.exports,
);
const { LoginForm, submitDemoLogin } = compiled.exports;

test("form contains labeled account/password controls and a working submit affordance", () => {
  const html = renderToStaticMarkup(createElement(LoginForm, { onLogin() {} }));
  assert.match(html, /欢迎回来/);
  assert.match(html, /aria-label="账号"/);
  assert.match(html, /type="password"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /aria-label="显示密码"/);
  assert.match(html, /novalidate=""/i);
  assert.doesNotMatch(html, /required|pattern=|type="email"|name="(?:password|username)"/);
});

test("demo submission accepts empty input, clears it and navigates without reading credentials", () => {
  const actions = [];
  const form = { reset: () => actions.push("reset"), get elements() { throw new Error("must not read credentials"); } };
  submitDemoLogin({ preventDefault: () => actions.push("prevent"), currentTarget: form }, () => actions.push("navigate"));
  assert.deepEqual(actions, ["prevent", "reset", "navigate"]);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|FormData|XMLHttpRequest/);
});

test("login canvas inverse scaling retains native control dimensions at all sizes", () => {
  for (const [width,height] of [[320,568],[390,844],[768,1024],[1536,1024],[844,390]]) {
    const size = getLoginScreenSize(width,height);
    assert.ok(size.width > 190 && size.height > 150);
    assert.ok(size.width < width);
    assert.ok(Math.abs((500 / size.width) * (size.width / 500) - 1) < 1e-10);
    assert.ok(Math.abs((520 / size.height) * (size.height / 520) - 1) < 1e-10);
  }
});

test("AI测评 always opens login and submission opens the choose step", async () => {
  const experience = await readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8");
  assert.match(experience, /onAssessment=\{\(\) => go\("login"\)\}/);
  assert.match(experience, /onLogin=\{\(\) => \{\s*go\("choose"\);\s*\}\}/);
  assert.match(experience, /onTest=\{\(\) => go\("assessments"\)\}/);
  assert.doesNotMatch(experience, /hasLoginSession|startLoginSession|auth-session|expiresAt|sessionStorage/);
});
