// 维基百科中文 AI 条目补采（docs-crawl 的 wiki 段实测只活 6 条：40 标题/批的
// GET 查询串超长被截断）。改 15 标题/批 + 长度阈值 2000 字节 + 分批错误上报。
// 断点：docs-articles.jsonl 按 url 去重，可重复跑。
import { execFileSync } from "node:child_process";
import { appendJsonl, readJsonl, today, sleep } from "./lib.mjs";

const outPath = new URL("./raw/docs-articles.jsonl", import.meta.url).pathname;
const seenUrls = new Set(readJsonl(outPath).map((row) => row.url));

function curlText(url, { timeout = 25 } = {}) {
  return execFileSync("curl", ["-sS", "--retry", "3", "--retry-delay", "2", "-m", String(timeout), "-A", "Mozilla/5.0", url], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

const CATS = ["机器学习", "深度学习", "自然语言处理", "生成式人工智能", "人工智能伦理", "人工神经网络", "大语言模型", "提示工程", "聊天机器人", "计算机视觉", "人工智能", "算法"];
const EXCLUDE = /(列表|年$|^[0-9]|作品|角色|电影|电视剧|小说|游戏|纪念日| disorder)/;
const titles = new Set();
for (const cat of CATS) {
  try {
    const payload = JSON.parse(curlText(`https://zh.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(cat)}&cmlimit=500&cmnamespace=0&format=json`));
    for (const member of payload.query?.categorymembers ?? []) titles.add(member.title);
  } catch (error) { console.log(`[wiki] 分类 ${cat} 失败: ${String(error.message).slice(0, 60)}`); }
  await sleep(700);
}
const filtered = [...titles].filter((t) => !EXCLUDE.test(t));
console.log(`[wiki] 候选标题 ${filtered.length}（去重后）`);

let added = 0, stubs = 0, errors = 0;
for (let offset = 0; offset < filtered.length; offset += 15) {
  const chunk = filtered.slice(offset, offset + 15);
  const query = chunk.map((t) => `titles=${encodeURIComponent(t)}`).join("&");
  let payload;
  try {
    payload = JSON.parse(curlText(`https://zh.wikipedia.org/w/api.php?action=query&prop=info&inprop=url&format=json&${query}`));
  } catch (error) { errors++; continue; }
  for (const page of Object.values(payload.query?.pages ?? {})) {
    if (page.missing != null) continue;
    if ((page.length ?? 0) < 2000) { stubs++; continue; }
    if (!page.fullurl || seenUrls.has(page.fullurl)) continue;
    seenUrls.add(page.fullurl);
    appendJsonl(outPath, {
      kind: "web", origin: "docs", dimPriors: ["D1", "D6"],
      url: page.fullurl,
      title: `${page.title}（维基百科）`.slice(0, 200),
      author: "Wikipedia", platform: "zh.wikipedia.org",
      durationMin: null, views: null,
      note: `维基百科条目，${page.length} 字节`,
      batch: "docs-articles", collectedAt: today(),
    });
    added++;
  }
  await sleep(800);
}
console.log(`[wiki] 新增 ${added}，小作品跳过 ${stubs}，批次错误 ${errors}；累计 ${seenUrls.size} 条`);
