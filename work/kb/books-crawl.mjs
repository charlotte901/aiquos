// 书籍章节编目（阶段 4）：只收「开源在线教材/权威指南」的章节级条目。
// 每个来源抓取目录页（静态站）或 GitHub raw 的 SUMMARY.md（docsify 站），
// 解析出章节链接，落 work/kb/raw/books.jsonl（kind:"book"，带 dimPriors）。
// 版权红线：只存元数据与链接（链接本身即开源页），不托管任何内容。
// 后续走与视频同一套管线：s3 标注（type=book_chapter）→ s4 网页体检 → s5 入库。
//
// 用法：node work/kb/books-crawl.mjs
// 断点续传：books.jsonl 按 url 去重追加，重跑只补新章节。

import { appendJsonl, readJsonl, today, sleep } from "./lib.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const outPath = new URL("./raw/books.jsonl", import.meta.url).pathname;
const seenUrls = new Set(readJsonl(outPath).map((row) => row.url));

async function fetchText(url, { timeout = 20_000 } = {}) {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// ---------- 提取器 ----------

// docsify 站：目录在仓库 SUMMARY.md；页面路由 = 站点根 + "/#" + md 路径（去 .md）
async function docsify(repo, site, branchCandidates = ["master", "main"]) {
  for (const branch of branchCandidates) {
    const raw = `https://raw.githubusercontent.com/${repo}/${branch}/SUMMARY.md`;
    try {
      const text = await fetchText(raw);
      if (!text || text.length < 50) continue;
      const chapters = [];
      const linkRe = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
      let match;
      while ((match = linkRe.exec(text)) !== null) {
        const title = match[1].replace(/<[^>]+>/g, "").trim();
        let path = match[2].replace(/^\.\//, "").replace(/\.md$/, "");
        if (/^https?:/.test(match[2])) continue; // 外链不收
        chapters.push({ title, url: `https://${site}/#/${path}` });
      }
      if (chapters.length) return chapters;
    } catch { /* 下一个分支 */ }
  }
  return [];
}

// 静态站：抓目录页，按 href 前缀提取站内章节链接
async function staticSite(tocUrl, hrefPrefix, base = "", titleClean = true) {
  const html = await fetchText(tocUrl);
  const chapters = [];
  const seen = new Set();
  const re = new RegExp(`href="(${hrefPrefix}[^"#]*)"[^>]*>([^<]{2,80})<`, "g");
  let match;
  while ((match = re.exec(html)) !== null) {
    let url = match[1];
    if (url.startsWith("/")) url = base + url;
    if (!url.startsWith("https://")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = match[2].trim();
    if (titleClean && title.length < 4) continue;
    chapters.push({ title, url });
  }
  return chapters;
}

// ---------- 来源清单（dimPriors 供 s3 标注约束枚举域，s3 仍可改判） ----------

const SOURCES = [
  {
    id: "d2l-zh", name: "《动手学深度学习》中文版", source: "zh.d2l.ai", platform: "在线开源教材",
    dimPriors: ["D1", "D4"], minDifficulty: "medium",
    fetch: () => staticSite("https://zh.d2l.ai/index.html", "chapter_", "https://zh.d2l.ai/"),
  },
  {
    id: "pumpkin-book", name: "《机器学习》（西瓜书）公式推导笔记", source: "Datawhale", platform: "开源笔记",
    dimPriors: ["D1", "D4"], minDifficulty: "high",
    fetch: () => docsify("datawhalechina/pumpkin-book", "datawhalechina.github.io/pumpkin-book"),
  },
  {
    id: "prompt-eng-dev", name: "Prompt Engineering for Developers（面向开发者的提示词工程）", source: "Datawhale", platform: "开源课程",
    dimPriors: ["D2", "D3"], minDifficulty: "medium",
    fetch: () => docsify("datawhalechina/prompt-engineering-for-developers", "datawhalechina.github.io/prompt-engineering-for-developers"),
  },
  {
    id: "llm-cookbook", name: "LLM Cookbook（提示词工程进阶）", source: "Datawhale", platform: "开源课程",
    dimPriors: ["D2", "D4"], minDifficulty: "medium",
    fetch: () => docsify("datawhalechina/llm-cookbook", "datawhalechina.github.io/llm-cookbook"),
  },
  {
    id: "hugging-multi-agent", name: "Hugging Multi-Agent（多智能体实战）", source: "Datawhale", platform: "开源课程",
    dimPriors: ["D5", "D3"], minDifficulty: "medium",
    fetch: () => docsify("datawhalechina/hugging-multi-agent", "datawhalechina.github.io/hugging-multi-agent"),
  },
  {
    id: "so-large-lm", name: "So Large LM（大语言模型）", source: "Datawhale", platform: "开源课程",
    dimPriors: ["D1", "D4"], minDifficulty: "high",
    fetch: () => docsify("datawhalechina/so-large-lm", "datawhalechina.github.io/so-large-lm"),
  },
  {
    id: "self-llm", name: "Self-LLM（开源大模型食用指南）", source: "Datawhale", platform: "开源指南",
    dimPriors: ["D3", "D4"], minDifficulty: "medium",
    fetch: () => docsify("datawhalechina/self-llm", "datawhalechina.github.io/self-llm"),
  },
  {
    id: "easy-rl", name: "Easy RL（强化学习教程）", source: "Datawhale", platform: "开源教程",
    dimPriors: ["D1", "D5"], minDifficulty: "high",
    fetch: () => docsify("datawhalechina/easy-rl", "datawhalechina.github.io/easy-rl"),
  },
  {
    id: "leedl-tutorial", name: "李宏毅《深度学习》教程", source: "Datawhale", platform: "开源教程",
    dimPriors: ["D1", "D4"], minDifficulty: "medium",
    fetch: () => docsify("datawhalechina/leedl-tutorial", "datawhalechina.github.io/leedl-tutorial"),
  },
  {
    id: "thorough-pytorch", name: "深入浅出 PyTorch", source: "Datawhale", platform: "开源教程",
    dimPriors: ["D3", "D4"], minDifficulty: "medium",
    fetch: () => docsify("datawhalechina/thorough-pytorch", "datawhalechina.github.io/thorough-pytorch"),
  },
  {
    id: "joyrl", name: "JoyRL（强化学习实战）", source: "Datawhale", platform: "开源教程",
    dimPriors: ["D1", "D5"], minDifficulty: "high",
    fetch: () => docsify("datawhalechina/joyrl", "datawhalechina.github.io/joyrl"),
  },
  {
    id: "promptingguide-zh", name: "Prompt Engineering Guide 中文版", source: "promptingguide.ai", platform: "开源指南",
    dimPriors: ["D2", "D4"], minDifficulty: "low",
    fetch: () => staticSite("https://www.promptingguide.ai/zh", "/zh/", "https://www.promptingguide.ai"),
  },
  {
    id: "learnprompting-zh", name: "Learn Prompting 中文版", source: "learnprompting.org", platform: "开源教程",
    dimPriors: ["D2", "D3"], minDifficulty: "low",
    fetch: () => staticSite("https://learnprompting.org/zh-Hans/docs/introduction", "/zh-Hans/docs/", "https://learnprompting.org"),
  },
];

const summary = [];
for (const book of SOURCES) {
  try {
    const chapters = await book.fetch();
    const fresh = [];
    for (const chapter of chapters) {
      if (seenUrls.has(chapter.url)) continue;
      seenUrls.add(chapter.url);
      fresh.push({
        kind: "book",
        bvid: null,
        url: chapter.url,
        title: `《${book.name}》${chapter.title}`.slice(0, 200),
        author: book.source,
        platform: book.platform,
        durationMin: null,
        views: null,
        pubdate: "",
        description: "",
        dimPriors: book.dimPriors,
        bookId: book.id,
        batch: "books",
        collectedAt: today(),
      });
    }
    if (fresh.length) appendJsonl(outPath, fresh);
    summary.push(`${book.id}: ${fresh.length} 新章节（抓到 ${chapters.length}）`);
  } catch (error) {
    summary.push(`${book.id}: 抓取失败 ${error.message}`);
  }
  await sleep(1200); // 对各站点礼貌限速
}

console.log("[books] 编目完成：");
for (const line of summary) console.log("  " + line);
console.log(`[books] books.jsonl 累计 ${[...readJsonl(outPath)].length} 条 → node work/kb/s3-annotate.mjs --batch books`);
