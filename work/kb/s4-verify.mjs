// 管线第四层（失效体检）：tagged(relevant) → verified。
//   视频：B站 view API（code!==0 即失效；顺带回填权威标题/播放量/时长/发布日期）；
//   网页：目标 404/410 且同域根路径 200 才判死链；网络错误/403/429 反爬按
//         AGENTS.md 口径不判失效（域名整体不可达 ≠ 链接失效），标记 unverified 域名。
// 断点续传：verified/<batch>.json 之外维护 verified/checkpoint-videos.jsonl。
//
// 用法：node work/kb/s4-verify.mjs --batch batch-001 [--limit 100]

import { readJson, readJsonIfExists, readJsonl, appendJsonl, writeJson, writeJsonl, mapLimit, biliView, today } from "./lib.mjs";
import { readFileSync } from "node:fs";

// checkpoint 兼容读取：历史上 writeJson（pretty 数组）与 readJsonl（逐行）格式
// 不一致导致续跑崩溃。新版统一 JSONL；旧数组文件一次性迁移。
function readCheckpoint(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    // 旧格式：pretty JSON 数组（可能尾部截断）——截到最后一个完整对象
    let data = trimmed;
    try {
      return JSON.parse(data);
    } catch {
      const lastBrace = data.lastIndexOf("}");
      data = `${data.slice(0, lastBrace + 1)}]`;
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    }
  }
  return readJsonl(path);
}

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const batch = argOf("batch", "batch-001");
const limit = Number(argOf("limit", "0"));
const webConcurrency = 8;

const kb = new URL(".", import.meta.url).pathname;
const tagged = readJsonl(`${kb}tagged/annotations.jsonl`).filter((row) => row.relevant !== false);
const checkpointPath = `${kb}verified/checkpoint-videos.jsonl`;
const deadPath = `${kb}rejected/dead.jsonl`;
const checkedBvids = new Set(readCheckpoint(checkpointPath).map((row) => row.bvid));
const knownDead = new Set(readJsonl(deadPath).map((row) => row.key));

const videos = tagged.filter((row) => row.kind === "video" && !checkedBvids.has(row.bvid) && !knownDead.has(row.key));
// 网页体检断点：滚动管线会反复进入 s4，已检过的网页按 url 跳过
const webCheckpointPath = `${kb}verified/checkpoint-webs.jsonl`;
const checkedWebUrls = new Set(readJsonl(webCheckpointPath).map((row) => row.url));
const webs = tagged.filter((row) => row.kind !== "video" && !knownDead.has(row.key) && !checkedWebUrls.has(row.url));
const videoSlice = limit > 0 ? videos.slice(0, limit) : videos;

console.log(`[s4] 待体检：视频 ${videoSlice.length}（view API ~0.95s/条 → 约 ${Math.ceil((videoSlice.length * 0.95) / 60)} 分钟），网页 ${webs.length}`);

// ---- 视频串行（view 限速），可被 limit 截断 ----
const videoVerified = readCheckpoint(checkpointPath); // 已有 checkpoint 直接复用（兼容旧数组格式）
const newDead = [];
let videoIndex = 0;
for (const row of videoSlice) {
  videoIndex++;
  let view = null;
  try {
    view = await biliView(row.bvid);
  } catch (error) {
    // 网络层失败 ≠ 视频失效；重试一次后放弃本条（下轮再查）
    try {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      view = await biliView(row.bvid);
    } catch {
      console.log(`[s4] ${videoIndex}/${videoSlice.length} ${row.bvid} 查询失败（网络），跳过留待下轮`);
      continue;
    }
  }
  if (!view.ok) {
    newDead.push({ key: row.key, bvid: row.bvid, title: row.title, reason: `view code ${view.code}`, checkedAt: today() });
    if (videoIndex % 20 === 0) console.log(`[s4] ${videoIndex}/${videoSlice.length} ${row.bvid} 失效（code ${view.code}）`);
    continue;
  }
  videoVerified.push({
    ...row,
    title: view.title || row.title,
    author: view.author || row.author,
    durationMin: view.durationSec ? Math.round(view.durationSec / 60) : row.durationMin,
    views: view.views ?? row.views,
    pubdate: view.pubdate || row.pubdate,
    verifiedAt: today(),
  });
  if (videoIndex % 100 === 0) console.log(`[s4] 视频 ${videoIndex}/${videoSlice.length}（累计有效 ${videoVerified.length}）`);
}
writeJsonl(checkpointPath, videoVerified);
if (newDead.length) appendJsonl(deadPath, newDead);

// ---- 网页并发体检 ----
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
async function checkUrl(url) {
  const probe = async (target) => {
    try {
      const response = await fetch(target, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
      return { status: response.status };
    } catch (error) {
      return { error: String(error?.cause?.code ?? error?.message ?? error).slice(0, 80) };
    }
  };
  const result = await probe(url);
  if (result.status && result.status >= 200 && result.status < 400) return { alive: true };
  if (result.status === 404 || result.status === 410) {
    // 同域根路径 200 才算真失效（域名整体不可达 → inconclusive）
    const root = new URL(url);
    const home = await probe(`${root.origin}/`);
    if (home.status && home.status >= 200 && home.status < 400) return { alive: false, reason: `目标 ${result.status} 而域名根 ${home.status}` };
    return { alive: true, unverifiedDomain: true, reason: `目标 ${result.status}，域名根也异常（${home.status ?? home.error}），按不可达处理` };
  }
  if (result.error) return { alive: true, unverifiedDomain: true, reason: `网络不可达：${result.error}` };
  return { alive: true, unverifiedDomain: true, reason: `状态 ${result.status}（反爬/限流，不判失效）` };
}

const deadWeb = [];
const webVerified = [];
const webResults = await mapLimit(webs, webConcurrency, async (row) => {
  const verdict = await checkUrl(row.url);
  if (!verdict.alive) {
    deadWeb.push({ key: row.key, url: row.url, title: row.title, reason: verdict.reason, checkedAt: today() });
    return;
  }
  webVerified.push({ ...row, unverifiedDomain: verdict.unverifiedDomain ?? false, verifyNote: verdict.reason ?? "", verifiedAt: today() });
});
if (deadWeb.length) appendJsonl(deadPath, deadWeb);
if (webVerified.length) appendJsonl(webCheckpointPath, webVerified.map(({ unverifiedDomain, verifyNote, ...rest }) => rest));

// ---- 汇总产出 ----
const verifiedVideos = videoVerified;
const payload = {
  batch,
  generatedAt: new Date().toISOString(),
  videos: verifiedVideos,
  webs: webVerified,
  deadThisRun: { videos: newDead.length, webs: deadWeb.length },
};
writeJson(`${kb}verified/${batch}.json`, payload);
console.log(`[s4] 体检完成：视频有效 ${verifiedVideos.length} / 本轮失效 ${newDead.length}；网页有效 ${webVerified.length}（其中域名不可达 ${webVerified.filter((row) => row.unverifiedDomain).length}）/ 死链 ${deadWeb.length}`);
console.log(`[s4] 产出 ${kb}verified/${batch}.json → 下一步 node work/kb/s5-ingest.mjs --batch ${batch}`);
