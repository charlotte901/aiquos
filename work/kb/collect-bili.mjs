// B站视频采集（阶段 1/3 共用）：按子主题词表搜索，断点续传，严格限速。
//
// 用法：
//   node work/kb/collect-bili.mjs --batch bili-001 [--dims D1,D2,D6] \
//     [--topics-per-dim 12] [--topic-offset 0] [--pages 2] [--keywords-per-topic 2]
//
// 行为：
//   - 从 SUBTOPICS 按维度取子主题（offset 起取 N 个），每个子主题取前 K 个搜索词；
//   - 每个搜索词翻 pages 页（search API 9s 限速，空响应自动退避重试）；
//   - 原始结果（含未过滤的）全部落 raw/<batch>.jsonl（追加），raw/<batch>-done.json 记录
//     已完成的 keyword|page，重跑自动跳过；raw/<batch>-state.json 记录批次参数。

import { SUBTOPICS } from "../../src/knowledge/schema.js";
import { biliSearch, appendJsonl, readJsonIfExists, writeJson, readJsonl, today } from "./lib.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const batch = argOf("batch", "bili-001");
const dims = String(argOf("dims", "D1,D2,D3,D4,D5,D6")).split(",");
const topicsPerDim = Number(argOf("topics-per-dim", 12));
const topicOffset = Number(argOf("topic-offset", 0));
const pages = Number(argOf("pages", 2));
const keywordsPerTopic = Number(argOf("keywords-per-topic", 2));

const dataPath = new URL(`./raw/${batch}.jsonl`, import.meta.url).pathname;
const donePath = new URL(`./raw/${batch}-done.json`, import.meta.url).pathname;
const statePath = new URL(`./raw/${batch}-state.json`, import.meta.url).pathname;

const done = readJsonIfExists(donePath, []); // string[] of "keyword|page"
const doneSet = new Set(done);
const seenBvid = new Set(readJsonl(dataPath).map((row) => row.bvid));

const plan = [];
for (const dim of dims) {
  const topics = SUBTOPICS.filter((topic) => topic.dim === dim)
    .slice(topicOffset, topicOffset + topicsPerDim);
  for (const topic of topics) {
    const keywords = topic.keywords.slice(0, keywordsPerTopic);
    for (const keyword of keywords) {
      for (let page = 1; page <= pages; page++) plan.push({ dim, topic: topic.id, keyword, page });
    }
  }
}

const total = plan.length;
const remaining = plan.filter((item) => !doneSet.has(`${item.keyword}|${item.page}`));
console.log(`[collect] batch=${batch} 计划 ${total} 次搜索，已完成 ${total - remaining.length}，待跑 ${remaining.length}`);
console.log(`[collect] 限速 ${9}s/次 → 预计 ${Math.ceil((remaining.length * 9.5) / 60)} 分钟`);

let collected = 0;
let searchIndex = 0;
for (const item of remaining) {
  searchIndex++;
  const prefix = `[collect ${searchIndex}/${remaining.length}]`;
  let results = [];
  let failed = false;
  try {
    results = await biliSearch(item.keyword, item.page);
  } catch (error) {
    // 失败不标 done：断点续传重跑时会再次尝试（HTTP 412 反爬通常几分钟内解除）
    failed = true;
    console.log(`${prefix} 搜索失败（keyword=${item.keyword} page=${item.page}）：${error.message}，留待续跑重试`);
  }

  if (failed) continue;

  const fresh = [];
  for (const row of results ?? []) {
    if (!row?.bvid || seenBvid.has(row.bvid)) continue;
    seenBvid.add(row.bvid);
    fresh.push({
      bvid: row.bvid,
      title: String(row.title ?? "").replace(/<[^>]+>/g, ""),
      author: row.author ?? "",
      durationText: row.duration ?? "",
      views: row.play ?? 0,
      pubdate: row.pubdate ? new Date(row.pubdate * 1000).toISOString().slice(0, 10) : "",
      description: String(row.description ?? "").replace(/<[^>]+>/g, ""),
      dim: item.dim,
      keyword: item.keyword,
      batch,
      collectedAt: today(),
    });
  }
  if (fresh.length) appendJsonl(dataPath, fresh);
  collected += fresh.length;
  done.push(`${item.keyword}|${item.page}`);
  writeJson(donePath, done);
  console.log(`${prefix} ${item.keyword} p${item.page} → ${results?.length ?? 0} 结果 / 新增 ${fresh.length}（累计去重 ${seenBvid.size}）`);
}

writeJson(statePath, { batch, dims, topicsPerDim, topicOffset, pages, keywordsPerTopic, updatedAt: new Date().toISOString() });
console.log(`[collect] 完成：本批 raw 累计 ${seenBvid.size} 条唯一视频（本次新增 ${collected}）。下一步：node work/kb/s2-clean.mjs --batch ${batch}`);
