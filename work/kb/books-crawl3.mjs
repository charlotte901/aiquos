// 书籍章节编目 v3（补爬）：v2 中 7 个仓库空手——要么 md 不在 docs/（目录结构不同），
// 要么撞上 GitHub API 匿名限额（60/小时）。本版自动探测内容目录（docs/notes/根）
// 并只处理缺口的仓库。GitHub API 重置后再跑。
import { execFileSync } from "node:child_process";
import { appendJsonl, readJsonl, today, sleep } from "./lib.mjs";

const outPath = new URL("./raw/books.jsonl", import.meta.url).pathname;
const seenUrls = new Set(readJsonl(outPath).map((row) => row.url));

function curlText(url, { timeout = 25 } = {}) {
  return execFileSync("curl", ["-sS", "--retry", "3", "--retry-delay", "3", "-m", String(timeout), "-A", "Mozilla/5.0", url], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function curlStatus(url) {
  try {
    return Number(execFileSync("curl", ["-sS", "--retry", "2", "-m", "15", "-A", "Mozilla/5.0", "-o", "/dev/null", "-w", "%{http_code}", url], { encoding: "utf8" }).trim());
  } catch { return 0; }
}

const REPOS = [
  { repo: "datawhalechina/prompt-engineering-for-developers", site: "datawhalechina.github.io/prompt-engineering-for-developers", name: "Prompt Engineering for Developers", platform: "开源课程", dimPriors: ["D2", "D3"], minDifficulty: "medium" },
  { repo: "datawhalechina/self-llm", site: "datawhalechina.github.io/self-llm", name: "Self-LLM 开源大模型食用指南", platform: "开源指南", dimPriors: ["D3", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/thorough-pytorch", site: "datawhalechina.github.io/thorough-pytorch", name: "深入浅出 PyTorch", platform: "开源教程", dimPriors: ["D3", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/leedl-tutorial", site: "datawhalechina.github.io/leedl-tutorial", name: "李宏毅深度学习教程", platform: "开源教程", dimPriors: ["D1", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/fun-rec", site: "datawhalechina.github.io/fun-rec", name: "FunRec 推荐系统", platform: "开源课程", dimPriors: ["D4", "D5"], minDifficulty: "high" },
  { repo: "datawhalechina/dive-into-cv-python", site: "datawhalechina.github.io/dive-into-cv-python", name: "动手学 CV", platform: "开源教程", dimPriors: ["D3", "D4"], minDifficulty: "medium" },
  { repo: "datawhalechina/handy-multi-agents", site: "datawhalechina.github.io/handy-multi-agents", name: "智能体应用开发实战", platform: "开源课程", dimPriors: ["D5", "D3"], minDifficulty: "medium" },
  { repo: "microsoft/AI-System", site: "microsoft.github.io/AI-System", name: "AI System 人工智能系统", platform: "开源课程", source: "Microsoft", dimPriors: ["D4", "D3"], minDifficulty: "high" },
];

const excludeRe = /(README|SUMMARY|_sidebar|_coverpage|_navbar|LICENSE|CONTRIBUTING|CODE_OF|assets[\/]|img[\/]|images[\/]|media[\/]|\.png|\.jpg|\.gif|\.pdf$|appendix[\/])/i;
let totalNew = 0;
for (const spec of REPOS) {
  let tree = null;
  let branch = "main";
  for (const candidate of ["main", "master"]) {
    try {
      const payload = JSON.parse(curlText(`https://api.github.com/repos/${spec.repo}/git/trees/${candidate}?recursive=1`));
      if (payload.tree) { tree = payload.tree; branch = candidate; break; }
    } catch { /* 下一个分支 */ }
  }
  if (!tree) { console.log(`[books3] ${spec.repo}: tree API 失败`); continue; }
  const mds = tree.filter((node) => String(node.path ?? "").endsWith(".md") && !excludeRe.test(node.path));
  // 自动探测内容根：选 md 数最多的前缀目录（docs/notes/根）
  const roots = ["", "docs", "notes"];
  let bestRoot = "", bestList = [];
  for (const root of roots) {
    const list = root ? mds.filter((node) => node.path.startsWith(`${root}/`)) : mds;
    if (list.length > bestList.length) { bestRoot = root; bestList = list; }
  }
  const deployed = curlStatus(`https://${spec.site}/index.html`) === 200;
  let fresh = 0;
  for (const node of bestList) {
    const path = node.path;
    const rel = bestRoot ? path.slice(bestRoot.length + 1) : path;
    const url = deployed ? `https://${spec.site}/#/${rel.replace(/\.md$/, "")}` : `https://github.com/${spec.repo}/blob/${branch}/${path}`;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const fileName = rel.replace(/\.md$/, "").split("/").pop();
    const chapterTitle = fileName && fileName !== "index" ? fileName : (rel.split("/").slice(-2)[0] ?? rel);
    appendJsonl(outPath, {
      kind: "book", bvid: null, url,
      title: `《${spec.name}》${chapterTitle}`.slice(0, 200),
      author: spec.source ?? "Datawhale", platform: spec.platform,
      durationMin: null, views: null, pubdate: "", description: "",
      dimPriors: spec.dimPriors, minDifficulty: spec.minDifficulty,
      bookId: spec.repo.split("/")[1], batch: "books", collectedAt: today(),
    });
    fresh++;
  }
  totalNew += fresh;
  console.log(`[books3] ${spec.repo}: ${fresh} 新增（md ${mds.length}，root=${bestRoot || "repo 根"}，deployed=${deployed}）`);
  await sleep(1500);
}
console.log(`[books3] 完成：新增 ${totalNew}，books.jsonl 累计 ${seenUrls.size} 条`);
