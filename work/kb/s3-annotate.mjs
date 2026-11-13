// 管线第三层（LLM 标注）：cleaned → tagged。
// DeepSeek（deepseek-flash，temperature 0）为每条候选打：相关性与学习价值分、
// 维度（1-2）、子主题（限维度先验对应的 25 词表枚举域）、难度档、summary、why。
// 断点续传：tagged/annotations.jsonl 按 key 追加，重跑只补缺。
// 失败条目：一轮「带校验错误反馈」的修复重试，仍失败进 rejected/annotate-failures.jsonl。
//
// 用法：node work/kb/s3-annotate.mjs --batch batch-001 [--limit 100] [--concurrency 12]

import { SUBTOPICS, subtopicsOf, subtopicById, DIFFICULTIES } from "../../src/knowledge/schema.js";
import { readJson, readJsonIfExists, readJsonl, appendJsonl, writeJson, mapLimit, chatOnce, parseLooseJson, today } from "./lib.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const batch = argOf("batch", "batch-001");
const limit = Number(argOf("limit", "0"));
const concurrency = Number(argOf("concurrency", "12"));

const kb = new URL(".", import.meta.url).pathname;
const cleaned = readJson(`${kb}cleaned/${batch}.json`);
const tagPath = `${kb}tagged/annotations.jsonl`;
const failPath = `${kb}rejected/annotate-failures.jsonl`;

const already = new Map(readJsonl(tagPath).map((row) => [row.key, row]));
const candidates = [...cleaned.videos, ...cleaned.web]
  .filter((row) => !already.has(row.key));
const slice = limit > 0 ? candidates.slice(0, limit) : candidates;
console.log(`[s3] cleaned 共 ${cleaned.videos.length + cleaned.web.length} 条，已标注 ${already.size}，本次待标 ${slice.length}（并发 ${concurrency}）`);

const DIM_NAMES = { D1: "AI基础认知", D2: "提示词工程", D3: "AI工具使用", D4: "AI结果评估与优化", D5: "人机协同解决问题", D6: "AI伦理与合规" };

const SYSTEM = `你是 AI 学习资源库的元数据标注员。输入是一条中文学习资源候选，输出严格 JSON（不要任何多余文字）：
{"relevant": true/false, "quality": 1-5 的数, "difficulty": "low"|"medium"|"high", "dims": ["Dx"...1-2个], "subtopic": "从给定枚举中选一个", "summary": "≤60字的内容概述", "why": "≤60字：对该维度薄弱的学习者的价值"}

评分口径：
- relevant：是否为「教人理解或使用 AI」的学习资源（教学/讲解/指南/课程）。纯新闻八卦、娱乐、卖课广告、纯产品发布宣发 → false。
- quality（讲解质量分）：5=体系完整讲解清晰；4=单点扎实可信；3=信息稀薄或浅尝辄止；2=标题党/干货极少；1=无学习价值。广告软文与「关注公众号看全文」类 ≤2。
- difficulty：low=零基础可看；medium=需要基本概念；high=专业深水区。
- dims：1-2 个维度键，主维度必须是给定的 dimPrior（除非明显错配）；次维度仅在内容确有覆盖时才加。
- subtopic：只能从给定枚举域选，必须属于 dims 中的主维度。
- summary/why：中文，具体、可追溯（基于标题/简介事实），不夸大。`;

function buildPrompt(row) {
  const priorDim = row.kind === "video" ? row.dimPrior : row.dimPriors?.[0];
  const enumDomain = subtopicsOf(priorDim).map((topic) => `${topic.id}=${topic.label}`).join("、");
  if (row.kind === "video") {
    return `资源：B站视频
标题：${row.title}
UP主：${row.author}
时长：${row.durationMin} 分钟；播放量：${row.views}；发布：${row.pubdate}
简介：${row.description || "（无）"}
dimPrior（主维度先验）：${priorDim} ${DIM_NAMES[priorDim]}
subtopic 枚举域（只可从中选一个）：${enumDomain}
可附加的第二维度候选：${Object.entries(DIM_NAMES).map(([key, name]) => `${key}=${name}`).join("、")}`;
  }
  return `资源：网络学习页面
标题：${row.title}
平台：${row.platform}（${row.typeLabel}）
说明：${row.note}
dimPrior（主维度先验）：${row.dimPriors?.join("、") ?? ""}
subtopic 枚举域（只可从中选一个）：${enumDomain}
可附加的第二维度候选：${Object.entries(DIM_NAMES).map(([key, name]) => `${key}=${name}`).join("、")}`;
}

function checkTag(row, tag) {
  const problems = [];
  const priorDim = row.kind === "video" ? row.dimPrior : row.dimPriors?.[0];
  if (typeof tag.relevant !== "boolean") problems.push("relevant 必须是布尔");
  if (!Number.isFinite(Number(tag.quality)) || tag.quality < 1 || tag.quality > 5) problems.push("quality 必须 1-5");
  if (!DIFFICULTIES.includes(tag.difficulty)) problems.push(`difficulty 必须是 ${DIFFICULTIES.join("/")}`);
  if (!Array.isArray(tag.dims) || tag.dims.length < 1 || tag.dims.length > 2 || tag.dims.some((key) => !DIM_NAMES[key])) problems.push("dims 必须 1-2 个合法维度键");
  const topic = subtopicsOf(priorDim).find((candidate) => candidate.id === tag.subtopic);
  if (!topic) problems.push(`subtopic 必须从 ${priorDim} 枚举域中选`);
  else if (Array.isArray(tag.dims) && !tag.dims.includes(topic.dim)) problems.push("subtopic 的维度必须在 dims 内");
  if (!tag.summary || String(tag.summary).length < 8) problems.push("summary 太短");
  if (!tag.why || String(tag.why).length < 8) problems.push("why 太短");
  return problems;
}

const failures = [];
let done = 0;
const results = await mapLimit(slice, concurrency, async (row) => {
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: buildPrompt(row) },
  ];
  let tag = null;
  let problems = [];
  // 最多两轮：初标 + 一轮带错误反馈的修复
  for (let round = 0; round < 2; round++) {
    const text = await chatOnce(messages, { maxRetries: 3 });
    try {
      tag = parseLooseJson(text);
    } catch (error) {
      problems = [`JSON 解析失败：${error.message}`];
      messages.push({ role: "assistant", content: text.slice(0, 500) });
      messages.push({ role: "user", content: `你的输出有误：${problems.join("；")}。请重新只输出符合 schema 的 JSON。` });
      continue;
    }
    problems = checkTag(row, tag);
    if (problems.length === 0) break;
    // 边缘案例自动修正：LLM 判的主维与先验维不一致，但 subtopic 本身合法——
    // 信任 subtopic 的维度归属（它是更具体的信号），dims 改为 [topic.dim, 原dims[0]]
    // 去重。实测此修正可救回 ~3% 的系统性失败（temperature 0 下重试也不改口）。
    if (Array.isArray(tag?.dims) && typeof tag?.subtopic === "string" && tag.dims.length >= 1
        && tag.dims.every((key) => DIM_NAMES[key])
        && problems.every((p) => p === "subtopic 的维度必须在 dims 内" || p.startsWith("subtopic 必须从"))) {
      const topic = subtopicById(tag.subtopic);
      if (topic) {
        tag.dims = [topic.dim, ...tag.dims.filter((key) => key !== topic.dim)].slice(0, 2);
        problems = checkTag(row, tag);
      }
    }
    if (problems.length === 0) break;
    messages.push({ role: "assistant", content: JSON.stringify(tag).slice(0, 500) });
    messages.push({ role: "user", content: `标注有误：${problems.join("；")}。请修正后重新只输出 JSON。` });
  }

  done++;
  if (done % 50 === 0) console.log(`[s3] ${done}/${slice.length} 完成`);

  if (problems.length > 0 || !tag) {
    failures.push({ key: row.key, title: row.title, problems, taggedAt: today() });
    return { key: row.key, ok: false };
  }
  const record = {
    key: row.key,
    kind: row.kind,
    origin: row.origin,
    dimPrior: row.kind === "video" ? row.dimPrior : row.dimPriors?.[0],
    bvid: row.bvid ?? null,
    url: row.url ?? (row.bvid ? `https://www.bilibili.com/video/${row.bvid}` : null),
    title: row.title,
    author: row.author ?? row.platform ?? "",
    type: row.kind === "video" ? "video" : "doc",
    platform: row.platform ?? "bilibili",
    durationMin: row.durationMin ?? null,
    views: row.views ?? null,
    pubdate: row.pubdate ?? null,
    ...tag,
    taggedAt: today(),
  };
  return { key: row.key, ok: true, record };
});

const fresh = results.filter((item) => item?.ok && item.value?.record).map((item) => item.value.record);
appendJsonl(tagPath, fresh);
appendJsonl(failPath, failures);

const relevant = fresh.filter((row) => row.relevant);
const dimCount = {};
for (const row of relevant) dimCount[row.dims[0]] = (dimCount[row.dims[0]] ?? 0) + 1;
console.log(`[s3] 本轮标注 ${fresh.length} 条（relevant ${relevant.length} / irrelevant ${fresh.length - relevant.length}），失败 ${failures.length}`);
console.log(`[s3] 主维度分布：${JSON.stringify(dimCount)}`);
if (failures.length) console.log(`[s3] 失败样例：${JSON.stringify(failures.slice(0, 3).map((f) => ({ key: f.key, problems: f.problems })))}`);
console.log(`[s3] 累计已标注 ${already.size + fresh.length} 条 → ${tagPath}`);
