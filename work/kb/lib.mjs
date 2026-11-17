// 知识库管线共享库：环境、原子写、B站限速客户端、DeepSeek 批量标注、并发控制。
// 仅离线管线使用；产品运行时（src/）绝不 import 本文件。

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export const ROOT = new URL("../..", import.meta.url).pathname; // 仓库根
export const KB = new URL(".", import.meta.url).pathname; // work/kb/

/** .env.local 的 DEEPSEEK_API_KEY（绝不写入任何提交）。 */
export function deepseekKey() {
  const text = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  const match = text.match(/^DEEPSEEK_API_KEY=(.*)$/m);
  if (!match) throw new Error(".env.local 缺 DEEPSEEK_API_KEY");
  return match[1].trim();
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readJsonIfExists(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return readJson(path);
}

export function writeJsonl(path, items) {
  mkdirSync(dirname(path), { recursive: true });
  const chunk = (Array.isArray(items) ? items : [items]).map((item) => JSON.stringify(item)).join("\n") + "\n";
  writeFileSync(path, chunk);
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

export function appendJsonl(path, items) {
  mkdirSync(dirname(path), { recursive: true });
  const chunk = (Array.isArray(items) ? items : [items]).map((item) => JSON.stringify(item)).join("\n") + "\n";
  writeFileSync(path, chunk, { flag: "a" });
}

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

// ---------- 并发控制 ----------

/** 有上限的并发 map（保持结果顺序；fn 抛错记为 null 不中断批次）。 */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { ok: true, value: await fn(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error: String(error?.message ?? error) };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- B站客户端（严格按 AGENTS.md 实测限速规律） ----------
// search 8–12 秒/次，快于此节奏返回 {"code":undefined} 空响应；
// view 宽松（900ms 间隔实测 936/936 成功）。
// 教训（2026-11-12 实测重踩）：请求头必须带真实 Chrome UA + referer 且
// **不要携带伪造 cookie**（buvid3=xxx 这种假值直接 412 风控页）。

const BILI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const BILI_HEADERS = { "user-agent": BILI_UA, referer: "https://www.bilibili.com/", accept: "application/json" };

export const SEARCH_INTERVAL_MS = 9_000; // search 限速间隔
export const VIEW_INTERVAL_MS = 950; // view 限速间隔

let lastSearchAt = 0;
let lastViewAt = 0;

async function biliGet(url, { timeoutMs = 15_000 } = {}) {
  const response = await fetch(url, { headers: BILI_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (response.status !== 200) throw new Error(`bili HTTP ${response.status}`);
  return response.json();
}

/** 搜索一页视频。空响应（code undefined）按限速规律退避重试。 */
export async function biliSearch(keyword, page = 1, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, lastSearchAt + SEARCH_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastSearchAt = Date.now();
    try {
      const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=${page}`;
      const payload = await biliGet(url);
      if (payload?.code === 0) return payload.data?.result ?? [];
      if (payload && payload.code !== undefined) throw new Error(`bili search code ${payload.code}`);
      // code undefined：限速空响应，退避
    } catch (error) {
      if (attempt >= retries) throw error;
    }
    if (attempt >= retries) return [];
    await sleep(10_000 * (attempt + 1));
  }
}

/** 查询单个视频（bvid）。code!==0 视为失效。 */
export async function biliView(bvid) {
  const wait = Math.max(0, lastViewAt + VIEW_INTERVAL_MS - Date.now());
  if (wait > 0) await sleep(wait);
  lastViewAt = Date.now();
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  const payload = await biliGet(url);
  if (payload?.code !== 0) return { ok: false, code: payload?.code ?? "undefined" };
  const data = payload.data;
  return {
    ok: true,
    title: data.title,
    author: data.owner?.name,
    durationSec: data.duration,
    views: data.stat?.view,
    pubdate: new Date(data.pubdate * 1000).toISOString().slice(0, 10),
    bvid: data.bvid,
  };
}

// ---------- 批量标注 LLM 调用 ----------

/** 标注通道选择：.env.local 配了 LLM_API_KEY 就用它（GLM 等 OpenAI 兼容端点），
 * 否则回退 DeepSeek。LLM_MODEL 默认 glm-4.6-flash（智谱免费档）。 */
function annotationChannel() {
  const env = readEnvLocal();
  if (env.LLM_API_KEY) {
    return {
      key: env.LLM_API_KEY,
      url: env.LLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      model: env.LLM_MODEL ?? "glm-4.6-flash",
      label: "llm",
    };
  }
  return { key: deepseekKey(), url: "https://api.deepseek.com/chat/completions", model: "deepseek-flash", label: "deepseek" };
}

function readEnvLocal() {
  const env = {};
  try {
    for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
      const index = line.indexOf("=");
      if (index > 0) env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  } catch { /* 无 .env.local 时全部缺省 */ }
  return env;
}

/** 非流式 temperature=0 单次调用，返回文本。 */
export async function chatOnce(messages, { timeoutMs = 90_000, maxRetries = 3 } = {}) {
  const channel = annotationChannel();
  if (!channel.key) throw new Error("没有可用的标注通道：.env.local 缺 LLM_API_KEY 且缺 DEEPSEEK_API_KEY");
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(channel.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${channel.key}` },
        body: JSON.stringify({ model: channel.model, messages, temperature: 0, stream: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`${channel.label} HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content) throw new Error(`${channel.label} 空回复`);
      return content;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) await sleep(1_500 * (attempt + 1));
    }
  }
  throw lastError;
}

/** 容忍代码围栏与前后废话的 JSON 解析（与 src/report-text.js 同口径）。 */
export function parseLooseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("回复中没有 JSON 对象");
  return JSON.parse(raw.slice(start, end + 1));
}

// ---------- 通用 ----------

/** B站时长文本 → 分钟数。格式实测为「分:秒」（分钟可达三位数，如 132:59=2h12m59s），
 * 偶见「时:分:秒」。非法返回 0。 */
export function durationToMinutes(text) {
  const raw = String(text ?? "").trim();
  let match = raw.match(/^(\d+):(\d{2})$/); // 分:秒
  if (match) return Math.round(Number(match[1]) + Number(match[2]) / 60);
  match = raw.match(/^(\d+):(\d{2}):(\d{2})$/); // 时:分:秒
  if (match) return Math.round(Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 60);
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : 0;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
