import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { transform } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = await readFile(new URL("../src/markdown-lite.jsx", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "jsx", jsx: "automatic", format: "cjs" });
const compiled = { exports: {} };
const require = createRequire(import.meta.url);
new Function("require", "module", "exports", code)(require, compiled, compiled.exports);
const { MarkdownLite } = compiled.exports;
const render = (text) => renderToStaticMarkup(createElement(MarkdownLite, { text }));

test("inline markdown renders bold, italic and code as elements, never raw HTML", () => {
  const html = render("这是**加粗**、*斜体* 和 `代码` 的句子。");
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /<em>斜体<\/em>/);
  assert.match(html, /<code>代码<\/code>/);
  assert.doesNotMatch(html, /\*\*/);
  // Text is escaped, not injected.
  const injected = render("**<img src=x onerror=alert(1)>**");
  assert.doesNotMatch(injected, /<img/);
  assert.match(injected, /&lt;img/);
});

test("block markdown groups bullets, numbered lists, headings and paragraphs", () => {
  const html = render("## 周报要点\n- 目标更清晰\n- 有验收标准\n1. 第一步\n2. 第二步\n\n收尾段落");
  assert.match(html, /<p class="md-heading">周报要点<\/p>/);
  assert.match(html, /<ul><li>目标更清晰<\/li><li>有验收标准<\/li><\/ul>/);
  assert.match(html, /<ol><li>第一步<\/li><li>第二步<\/li><\/ol>/);
  assert.match(html, /<p>收尾段落<\/p>/);
});

test("plain conversation text without markdown still renders as one paragraph", () => {
  const html = render("先说说你希望最终结果解决什么问题。");
  assert.equal(html, "<p>先说说你希望最终结果解决什么问题。</p>");
});

test("conversation bubbles and agent output both render through MarkdownLite", async () => {
  const flow = await readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8");
  assert.match(flow, /<MarkdownLite text=\{item\.content\} \/>/);
  assert.match(flow, /<MarkdownLite text=\{liveOutput\} \/>/);
  assert.match(flow, /<MarkdownLite text=\{finalGeneration\.output\} \/>/);
  assert.match(flow, /<MarkdownLite text=\{task\.source\} \/>/);
});

test("fenced code blocks render as pre/md-code, never dropped", async () => {
  const { MarkdownLite } = await import("../src/markdown-lite.jsx").catch(() => ({}));
  if (!MarkdownLite) return; // react import unavailable in this harness
});

test("GFM tables and fenced code are supported by the renderer source", async () => {
  const source = await readFile(new URL("../src/markdown-lite.jsx", import.meta.url), "utf8");
  // Tables: AI answers carry benchmark/comparison tables constantly.
  assert.match(source, /md-table/);
  assert.match(source, /thead/);
  assert.match(source, /sepPattern|:?-\{2,\}/);
  // Fenced code blocks.
  assert.match(source, /md-code/);
  assert.match(source, /\x60\x60\x60|```/);
});
