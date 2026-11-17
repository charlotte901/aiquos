// 书籍章节编目 v2（阶段 4）：实测网络后弃用 node fetch 直连 GitHub（不稳定），
// 改为 curl 兜底 + GitHub API 文件树枚举章节，构造 docsify 站点路由或 blob 链接。
// 版权红线：只存元数据与链接，不托管内容。
//
// 用法：node work/kb/books-crawl2.mjs   （books.jsonl 按 url 去重追加，可重复跑）

import { execFileSync } from "node:child_process";
import { appendJsonl, readJsonl, today, sleep } from "./lib.mjs";

const outPath = new URL("./raw/books.jsonl", import.meta.url).pathname;
const seenUrls = new Set(readJsonl(outPath).map((row) => row.url));

function curlText(url, { timeout = 25 } = {}) {
  return execFileSync("curl", ["-sS", "--retry", "3", "--retry-delay", "2", "-m", String(timeout), "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function curlStatus(url) {
  try {
    const code = execFileSync("curl", ["-sS", "--retry", "2", "-m", "15", "-A", "Mozilla/5.0", "-o", "/dev/null", "-w", "%{http_code}", url], { encoding: "utf8" }).trim();
    return Number(code);
  } catch { return 0; }
}

// ---------- 提取器 ----------

// GitHub API 文件树 → 章节清单。site 未部署时回退 blob 链接。
function ghTree(repo, { site, branch, dir = "docs", dimPriors, name, platform, source = "Datawhale", minDifficulty = "medium", excludes = [] }) {
  let tree = null;
  let usedBranch = branch;
  for (const candidate of branch ? [branch] : ["main", "master"]) {
    try {
      const payload = JSON.parse(curlText(`https://api.github.com/repos/${repo}/git/trees/${candidate}?recursive=1`));
      if (payload.tree) { tree = payload.tree; usedBranch = candidate; break; }
    } catch { /* 下一个分支 */ }
  }
  if (!tree) return { chapters: [], note: "tree API 失败" };

  const deployed = site ? curlStatus(`https://${site}/index.html`) === 200 : false;
  const excludeRe = /(README|SUMMARY|_sidebar|_coverpage|_navbar|LICENSE|CONTRIBUTING|CODE_OF|package\.json|assets\/|\/img\/|\/images\/|\/media\/|\.png|\.jpg|\.pdf$)/i;
  const customRe = excludes.length ? new RegExp(excludes.join("|"), "i") : null;
  const chapters = [];
  for (const node of tree) {
    const path = String(node.path ?? "");
    if (!path.endsWith(".md") || excludeRe.test(path)) continue;
    if (dir && !path.startsWith(`${dir}/`)) continue;
    if (customRe && customRe.test(path)) continue;
    const rel = path.slice(dir ? dir.length + 1 : 0).replace(/\.md$/, "");
    const url = deployed
      ? `https://${site}/#/${rel}`
      : `https://github.com/${repo}/blob/${usedBranch}/${path}`;
    const fileName = rel.split("/").pop().replace(/^index$/, "").trim();
    const chapterTitle = fileName || path.split("/").slice(-2)[0] || rel;
    chapters.push({
      title: `《${name}》${chapterTitle}`.slice(0, 200),
      url,
      dimPriors,
      minDifficulty,
      platform,
      source,
      bookId: repo.split("/")[1],
    });
  }
  return { chapters, note: `branch=${usedBranch} deployed=${deployed}` };
}

// 静态站目录页解析（d2l：锚点内允许嵌套标签）
function d2lToc() {
  const html = curlText("https://zh.d2l.ai/index.html");
  const chapters = [];
  const seen = new Set();
  const re = /<a[^>]*href="(chapter_[^"#]+)"[^>]*>(.{0,160}?)<\/a>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const url = `https://zh.d2l.ai/${match[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    if (title.length < 2) continue;
    chapters.push({ title: `《动手学深度学习》${title}`.slice(0, 200), url, dimPriors: ["D1", "D4"], minDifficulty: "medium", platform: "在线开源教材", source: "zh.d2l.ai", bookId: "d2l-zh" });
  }
  return chapters;
}

// ---------- 来源清单 ----------

const REPOS = [
  { repo: "datawhalechina/hugging-multi-agent", site: "datawhalechina.github.io/hugging-multi-agent", name: "Hugging Multi-Agent 多智能体实战", platform: "开源课程", dimPriors: ["D5", "D3"], minDifficulty: "medium" },
  { repo: "datawhalechina/thorough-pytorch", site: "datawhalechina.github.io/thorough-pytorch", name: "深入浅出 PyTorch", platform: "开源教程", dimPriors: ["D3", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/llm-cookbook", site: "datawhalechina.github.io/llm-cookbook", name: "LLM Cookbook 提示词进阶", platform: "开源课程", dimPriors: ["D2", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/so-large-lm", site: "datawhalechina.github.io/so-large-lm", name: "So Large LM 大语言模型", platform: "开源课程", dimPriors: ["D1", "D4"], minDifficulty: "high" },
  { repo: "datawhalechina/easy-rl", site: "datawhalechina.github.io/easy-rl", name: "Easy RL 强化学习教程", platform: "开源教程", dimPriors: ["D1", "D5"], minDifficulty: "high" },
  { repo: "datawhalechina/leedl-tutorial", site: "datawhalechina.github.io/leedl-tutorial", name: "李宏毅深度学习教程", platform: "开源教程", dimPriors: ["D1", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/joyrl", site: "datawhalechina.github.io/joyrl", name: "JoyRL 强化学习实战", platform: "开源教程", dimPriors: ["D1", "D5"], minDifficulty: "high" },
  { repo: "datawhalechina/pumpkin-book", site: "datawhalechina.github.io/pumpkin-book", name: "西瓜书公式推导笔记", platform: "开源笔记", dimPriors: ["D1", "D4"], minDifficulty: "high" },
  { repo: "datawhalechina/prompt-engineering-for-developers", site: "datawhalechina.github.io/prompt-engineering-for-developers", name: "Prompt Engineering for Developers", platform: "开源课程", dimPriors: ["D2", "D3"], minDifficulty: "medium" },
  { repo: "datawhalechina/self-llm", site: "datawhalechina.github.io/self-llm", name: "Self-LLM 开源大模型食用指南", platform: "开源指南", dimPriors: ["D3", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/llm-universe", site: "datawhalechina.github.io/llm-universe", name: "动手学大模型", platform: "开源课程", dimPriors: ["D2", "D3"], minDifficulty: "medium" },
  { repo: "datawhalechina/fun-rec", site: "datawhalechina.github.io/fun-rec", name: "FunRec 推荐系统", platform: "开源课程", dimPriors: ["D4", "D5"], minDifficulty: "high" },
  { repo: "datawhalechina/dive-into-cv-python", site: "datawhalechina.github.io/dive-into-cv-python", name: "动手学 CV", platform: "开源教程", dimPriors: ["D3", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/handy-multi-agents", site: "datawhalechina.github.io/handy-multi-agents", name: "智能体应用开发实战", platform: "开源课程", dimPriors: ["D5", "D3"], minDifficulty: "medium" },
  { repo: "microsoft/AI-System", site: "microsoft.github.io/AI-System", name: "AI System 人工智能系统", platform: "开源课程", source: "Microsoft", dimPriors: ["D4", "D3"], minDifficulty: "high" },
];

const summary = [];
const addAll = (book, chapters, note) => {
  let fresh = 0;
  for (const chapter of chapters) {
    if (seenUrls.has(chapter.url)) continue;
    seenUrls.add(chapter.url);
    appendJsonl(outPath, [{
      kind: "book", bvid: null, url: chapter.url, title: chapter.title,
      author: chapter.source, platform: chapter.platform, durationMin: null, views: null,
      pubdate: "", description: "", dimPriors: chapter.dimPriors,
      minDifficulty: chapter.minDifficulty, bookId: chapter.bookId,
      batch: "books", collectedAt: today(),
    }]);
    fresh++;
  }
  summary.push(`${book.bookId ?? book.repo}: ${fresh} 新增（${chapters.length} 章节，${note}）`);
};

// 静态站（d2l）
try { addAll({ bookId: "d2l-zh" }, d2lToc(), "静态目录"); } catch (error) { summary.push(`d2l-zh: 失败 ${error.message}`); }
await sleep(1500);

// GitHub 仓库树
for (const spec of REPOS) {
  try {
    const { chapters, note } = ghTree(spec.repo, {
      site: spec.site, dir: "docs", dimPriors: spec.dimPriors, name: spec.name,
      platform: spec.platform, source: spec.source ?? "Datawhale", minDifficulty: spec.minDifficulty,
    });
    addAll({ bookId: spec.repo.split("/")[1] }, chapters, note);
  } catch (error) {
    summary.push(`${spec.repo}: 失败 ${error.message}`);
  }
  await sleep(1200);
}

console.log("[books2] 编目完成：");
for (const line of summary) console.log("  " + line);
const total = readJsonl(outPath).length;
console.log(`[books2] books.jsonl 累计 ${total} 条`);
