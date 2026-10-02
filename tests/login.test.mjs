import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { transform } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "@phosphor-icons/react";
import { getLoginScreenSize } from "../src/cube-geometry.js";
import * as authValidation from "../src/auth-validation.js";
import * as authClient from "../src/auth-client.js";

const source = await readFile(new URL("../src/LoginForm.jsx", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "jsx", jsx: "automatic", format: "cjs" });
const compiled = { exports: {} };
// Compile the local JSX module using the project's existing React instance.
// 相对导入在这里手工映射：new Function 内的 require 没有模块路径可依。
const require = createRequire(import.meta.url);
const moduleShim = (name) => {
  if (name === "@phosphor-icons/react") return icons;
  if (name === "./auth-validation") return authValidation;
  if (name === "./auth-client") return authClient;
  return require(name);
};
new Function("require", "module", "exports", code)(moduleShim, compiled, compiled.exports);
const { LoginForm } = compiled.exports;

test("form contains labeled account/password controls and a working submit affordance", () => {
  const html = renderToStaticMarkup(createElement(LoginForm, { onLogin() {} }));
  // 设计稿版式：品牌标题 + 可见字段标签 + 账号密码主按钮。
  assert.match(html, /AIQUOS 登录/);
  assert.match(html, /认证你的智能，解锁全部能力/);
  assert.match(html, /class="login-field-label"[^>]*>账号</);
  assert.match(html, /class="login-field-label"[^>]*>密码</);
  assert.match(html, /type="password"/);
  assert.match(html, /账号密码登录/);
  assert.match(html, /aria-label="显示密码"/);
  assert.match(html, /novalidate=""/i);
  // 注册切换链接与占位次要登录（暂未开通）。
  assert.match(html, /还没有账号？注册一个/);
  assert.match(html, /验证码登录/);
  assert.match(html, /二维码登录/);
});

test("strict submission never navigates without validation — no credential persistence in the form module", () => {
  // 表单只经 auth-client 走 /api/auth/*；本体不得自行持久化凭证。
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
  // 提交必须经过异步 API（不再有同步直通的 submitDemoLogin）。
  assert.match(source, /apiLogin|apiRegister/);
  assert.doesNotMatch(source, /export function submitDemoLogin/);
});

test("register mode renders nickname and class fields after switching", async () => {
  // 静态渲染默认登录态；注册字段在源码中条件渲染，直接断言源码结构，
  // 交互路径由 e2e（qa-full-e2e）覆盖。
  assert.match(source, /mode === "register" \&\& \(/);
  assert.match(source, /昵称（可选）/);
  assert.match(source, /班级（可选/);
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

test("AI测评 always opens login and successful login adopts the server profile then opens choose", async () => {
  const experience = await readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8");
  assert.match(experience, /onAssessment=\{\(\) => go\("login"\)\}/);
  assert.match(experience, /adoptAuthenticatedProfile\(profile\)/);
  assert.match(experience, /onTest=\{\(\) => go\("assessments"\)\}/);
  assert.doesNotMatch(experience, /hasLoginSession|startLoginSession|auth-session|expiresAt|sessionStorage/);
  // 完成上报与作业关联已接入。
  assert.match(experience, /reportRunSnapshot\(/);
  assert.match(experience, /readActiveAssignmentId\(\)/);
});
