#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");

/**
 * 打包后的目录形状必须**原样保留**源码的层级：
 *
 *   worker/*.js   彼此用 `./name.js` 引用，并用 `../src/...` 引用题池与引擎
 *   src/**        综合题库与自适应引擎
 *   vendor/**     评分核心
 *
 * 也就是说三者必须在打包结果里仍是兄弟关系（server/worker、server/src、
 * server/vendor）。早先把 worker 文件平铺到 server/ 根目录，`../src/...`
 * 就会解析到 server 之外（实测 import 直接失败）——目录形状在这里是接口的
 * 一部分，不能为了"扁平"而改动。
 */
const modules = [
  "worker/index.js",
  "worker/deepseek.js",
  "worker/objective-quiz.js",
  "worker/objective-questions.json",
  "worker/practical-tasks.js",
  "worker/practical-score.js",
  "worker/comprehensive-quiz.js",
  "worker/bank-store.js",
  "worker/admin.js",
  "src/bank-editions.js",
  "src/comprehensive-adaptive.js",
  "src/comprehensive-questions.json",
  "src/banks/comprehensive-880.json",
  "src/banks/practical-80.json",
  "src/banks/practical-10.json",
  "src/practical-scoring.js",
  "vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs",
];

const hosting = path.join(root, ".openai", "hosting.json");

for (const file of [
  index,
  hosting,
  ...modules.map((entry) => path.join(root, entry)),
]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

const serverDir = path.join(dist, "server");
mkdirSync(serverDir, { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });

for (const relative of modules) {
  const target = path.join(serverDir, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(root, relative), target);
}
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

console.log(
  `Prepared Sites build: dist/server/worker/index.js (+${modules.length} modules) and dist/.openai/hosting.json`,
);
