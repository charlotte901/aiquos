// 文档与文章采集（阶段 5）：只收权威源。
//   docs：MS Learn 中文 catalog API（AI 相关模块）、维基百科中文 AI 相关分类
//         （过滤小作品）、模型厂商中文文档（人工清单，链接存活性交给 s4 体检）。
//   articles：掘金搜索 API（AI 主题词检索），LLM 粗筛在 s3 完成，终审抽检记录
//         落 work/kb/audit-sample.md（阶段 6）。
// 版权红线：只存元数据与链接；MS Learn/维基/厂商文档均为公开页。
//
// 用法：node work/kb/docs-crawl.mjs

import { execFileSync } from "node:child_process";
import { appendJsonl, readJsonl, today, sleep } from "./lib.mjs";

const outPath = new URL("./raw/docs-articles.jsonl", import.meta.url).pathname;
const seenUrls = new Set(readJsonl(outPath).map((row) => row.url));

function curlText(url, { timeout = 30 } = {}) {
  return execFileSync("curl", ["-sS", "--retry", "3", "--retry-delay", "2", "-m", String(timeout), "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const emit = (row) => {
  if (seenUrls.has(row.url)) return;
  seenUrls.add(row.url);
  appendJsonl(outPath, { ...row, batch: "docs-articles", collectedAt: today() });
};

const stats = { mslearn: 0, wiki: 0, vendor: 0, juejin: 0 };

// ---------- 1) MS Learn 中文（catalog API） ----------
{
  const payload = JSON.parse(curlText("https://learn.microsoft.com/api/catalog/?locale=zh-cn&type=modules"));
  const AI_WORDS = ["AI", "人工智能", "机器学习", "深度学习", "生成式", "提示工程", "提示词", "大语言模型", "Azure OpenAI", "Copilot", "认知服务", "自然语言", "计算机视觉", "知识挖掘", "负责任的 AI", "聊天机器人", "智能体"];
  const EXCLUDE = /(Power BI|Excel|Dynamics|Windows|Defender|Azure 基础知识|DevOps|SQL Server|数据工程师|解决方案)/;
  const picked = [];
  for (const mod of payload.modules ?? []) {
    const text = `${mod.title ?? ""} ${mod.summary ?? ""}`;
    if (!AI_WORDS.some((word) => text.includes(word))) continue;
    if (EXCLUDE.test(text)) continue;
    const url = (mod.url ?? "").replace(/\?WT\.mc_id=[^&]*$/, "");
    if (!/^https:\/\/learn\.microsoft\.com\/zh-cn\//.test(url)) continue;
    picked.push({
      kind: "web",
      origin: "docs",
      dimPriors: ["D1", "D3"],
      url,
      title: `${mod.title}（Microsoft Learn）`.slice(0, 200),
      author: "Microsoft Learn",
      platform: "learn.microsoft.com",
      durationMin: mod.duration_in_minutes ?? null,
      views: null,
      note: (mod.summary ?? "").slice(0, 200),
    });
  }
  for (const row of picked.slice(0, 280)) { emit(row); stats.mslearn++; }
}

// ---------- 2) 维基百科中文 AI 相关条目 ----------
{
  const CATS = ["机器学习", "深度学习", "自然语言处理", "生成式人工智能", "人工智能伦理", "人工神经网络", "大语言模型", "提示工程", "聊天机器人", "计算机视觉"];
  const titles = new Set();
  for (const cat of CATS) {
    try {
      const payload = JSON.parse(curlText(`https://zh.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(cat)}&cmlimit=500&cmnamespace=0&format=json`));
      for (const member of payload.query?.categorymembers ?? []) titles.add(member.title);
    } catch { /* 单分类失败不致命 */ }
    await sleep(800);
  }
  const EXCLUDE = /(列表|年$|^[0-9]|作品|角色|电影|电视剧|小说|游戏)/;
  const titleList = [...titles].filter((title) => !EXCLUDE.test(title)).slice(0, 400);
  // 批量取长度与 URL，过滤小作品（< 3000 字节）
  for (let offset = 0; offset < titleList.length; offset += 40) {
    const chunk = titleList.slice(offset, offset + 40);
    const query = chunk.map((title) => `titles=${encodeURIComponent(title)}`).join("&");
    let payload;
    try {
      payload = JSON.parse(curlText(`https://zh.wikipedia.org/w/api.php?action=query&prop=info&inprop=url&format=json&${query}`));
    } catch { continue; }
    for (const page of Object.values(payload.query?.pages ?? {})) {
      if (page.missing != null || (page.length ?? 0) < 3000) continue;
      if (!page.fullurl) continue;
      emit({
        kind: "web",
        origin: "docs",
        dimPriors: ["D1", "D6"],
        url: page.fullurl,
        title: `${page.title}（维基百科）`.slice(0, 200),
        author: "Wikipedia",
        platform: "zh.wikipedia.org",
        durationMin: null,
        views: null,
        note: `维基百科条目（分类：${CATS.find((c) => c === page.title) ?? "AI 相关"}，${page.length} 字节）`.slice(0, 200),
      });
      stats.wiki++;
    }
    await sleep(900);
  }
}

// ---------- 3) 模型厂商中文文档（人工清单） ----------
{
  const VENDOR_DOCS = [
    // DeepSeek API 中文文档（guides 与 faq）
    ...["introduction", "quick_start.prerequisite", "quick_start.openai_compatible", "reasoning_model", "function_calling", "context_caching", "json_mode", "prompt_engineering", "multi_round_conversation", "temperature", "top_p", "max_tokens", "best_practices", "news250129", "news250320"].map((path) => ({
      kind: "web", origin: "docs", dimPriors: ["D2", "D4"],
      url: `https://api-docs.deepseek.com/zh-cn/${path}`,
      title: `DeepSeek API 文档：${path.replace(/[._]/g, " ")}`.slice(0, 200),
      author: "DeepSeek", platform: "api-docs.deepseek.com", durationMin: null, views: null, note: "模型厂商官方中文 API 文档",
    })),
    // Moonshot Kimi 开放平台文档
    ...["guide/deepseek", "guide/8b-model", "guide/kimi-plus", "introduction", "quickstart/prerequisite", "user-case", "products/limit-rate", "api/pricing"].map((path) => ({
      kind: "web", origin: "docs", dimPriors: ["D2", "D3"],
      url: `https://platform.moonshot.cn/docs/${path}`,
      title: `Kimi 开放平台文档：${path.replace(/\//g, " ")}`.slice(0, 200),
      author: "Moonshot AI", platform: "platform.moonshot.cn", durationMin: null, views: null, note: "模型厂商官方中文文档",
    })),
    // 智谱开放平台（bigmodel）文档
    ...["dev/howuse/introduction", "dev/howuse/model", "dev/api/termsofuse", "dev/guide/agent/agent", "dev/guide/prompt/prompt-project"].map((path) => ({
      kind: "web", origin: "docs", dimPriors: ["D2", "D3"],
      url: `https://open.bigmodel.cn/dev/${path.replace(/^dev\//, "")}`,
      title: `智谱开放平台文档：${path.split("/").slice(2).join(" ")}`.slice(0, 200),
      author: "智谱 AI", platform: "open.bigmodel.cn", durationMin: null, views: null, note: "模型厂商官方中文文档",
    })),
  ];
  for (const row of VENDOR_DOCS) { emit(row); stats.vendor++; }
}

// ---------- 4) 掘金文章（搜索 API，LLM 粗筛在 s3） ----------
{
  const QUERIES = ["提示词", "prompt 工程", "ChatGPT 使用技巧", "大模型应用", "AI 工作流", "AI 办公效率", "LLM 微调", "AI 智能体", "Agent 开发", "AI 评估", "幻觉 修复", "RAG 实践", "AI 伦理 安全", "AI 编程助手", "文心一言 提示", "Claude 使用", "DeepSeek 使用"];
  for (const query of QUERIES) {
    const encoded = encodeURIComponent(query);
    for (const cursor of [0, 20, 40]) {
      let payload;
      try {
        payload = JSON.parse(curlText(`https://api.juejin.cn/search_api/v1/search?aid=2608&spider=0&query=${encoded}&id_type=0&cursor=${cursor}&limit=20`, { timeout: 20 }));
      } catch { break; }
      const items = payload.data ?? [];
      for (const item of items) {
        const info = item.result_model?.article_info ?? item.article_info;
        if (!info?.article_id) continue;
        const views = info.view_count ?? 0;
        const collects = info.collect_count ?? 0;
        // 粗门槛：互动极低的帖子不进候选（终选由 LLM 质量分把关）
        if (views < 500 && collects < 20) continue;
        emit({
          kind: "article",
          origin: "article",
          dimPriors: ["D2", "D3"],
          url: `https://juejin.cn/post/${info.article_id}`,
          title: String(info.title ?? "").replace(/<[^>]+>/g, "").slice(0, 200),
          author: info.author_name ?? "",
          platform: "juejin.cn",
          durationMin: null,
          views,
          note: String(info.brief_content ?? "").replace(/<[^>]+>/g, "").slice(0, 200),
        });
        stats.juejin++;
      }
      await sleep(1100);
    }
    await sleep(1100);
  }
}

console.log(`[docs] 采集完成：MS Learn ${stats.mslearn}、维基 ${stats.wiki}、厂商 ${stats.vendor}、掘金 ${stats.juejin}；docs-articles.jsonl 累计 ${seenUrls.size} 条`);
