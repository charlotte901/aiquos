/** 小Q's teacher knowledge: the parts that make it a mentor on the student's
 * AI learning path instead of a generic chatbot.
 *
 * Pure and node-testable:
 * - searchCases(query)      the real case library, scored by the student's words
 * - buildKnowledgeContext(query)  distils platform facts for THIS question —
 *   matched cases, the assessment ladder, forum channels — injected into the
 *   system prompt so answers cite real titles, numbers and next steps. */

import { TOPIC_POSTS } from "./forum-topics.js";
import { COMPREHENSIVE_LEVELS } from "./comprehensive-quiz.js";

/** One-line descriptor of the whole real catalogue (for the system prompt). */
export function caseCatalogLine() {
  return TOPIC_POSTS.map((post) => `${post.title}（${post.tag}）`).join("；");
}

const TAG_SYNONYMS = {
  "AI 生图": ["生图", "画", "绘", "图", "水墨", "插画"],
  "AI 视频": ["视频", "剪辑", "分镜", "影片", "动画"],
  "AI 代码": ["代码", "游戏", "编程", "canvas", "webgl", "交互"],
  "AI 办公": ["办公", "ppt", "排班", "表格", "文档", "信息图"],
};

/** Keywords from the case's own title/tag/model — matched against the student's
 * words (case-side vocabulary, so "黑猫" hits 「戴眼镜的黑猫」 via the word's
 * CJK bigrams). */
function keywordsOf(post) {
  const words = String(post.title || "")
    .split(/[·\s,,，、()（）]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2);
  const bigrams = [];
  for (const word of words) {
    for (let i = 0; i + 2 <= word.length; i += 1) bigrams.push(word.slice(i, i + 2));
  }
  return [
    ...new Set([
      ...words,
      ...bigrams,
      ...(TAG_SYNONYMS[post.tag] || []).map((w) => w.toLowerCase()),
      String(post.model || "").toLowerCase(),
    ]),
  ].filter(Boolean);
}

/** Top matches of a free-form question against the real case library. */
export function searchCases(query, limit = 3) {
  const q = String(query || "").toLowerCase();
  if (!q.trim()) return [];
  return TOPIC_POSTS.map((post) => {
    let score = 0;
    const head = post.title.split(" · ")[0].toLowerCase();
    if (q.includes(head) || head.includes(q.trim())) score += 4;
    for (const word of keywordsOf(post)) {
      if (q.includes(word)) score += word.length >= 2 ? 2 : 1;
    }
    if (q.includes(post.tag.toLowerCase())) score += 3;
    return { post, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.post.likes - a.post.likes)
    .slice(0, limit)
    .map((entry) => entry.post);
}

/** Everything the mentor should know for THIS question, distilled from real
 * platform data. Empty string when the question needs no injection. */
export function buildKnowledgeContext(query) {
  const q = String(query || "");
  const parts = [];

  const cases = searchCases(q, 3);
  if (cases.length) {
    parts.push(
      `【与提问相关的真实案例（来自案例库，讲解时引用其名称、数据与提示词写法）】\n${cases
        .map((post) => {
          const promptHead = post.prompt ? `｜提示词开头：${String(post.prompt).slice(0, 60)}…` : "";
          return `- 《${post.title}》（${post.tag}，模型 ${post.model || "未注明"}，❤${post.likes}，👁${post.views}）：${post.summary}${promptHead}`;
        })
        .join("\n")}`,
    );
  }

  if (/测评|闯关|考核|客观|对话题|实战|报告|评分|星级|从哪|入门|起点|路径|计划|学/.test(q)) {
    parts.push(
      `【综合测评的真实结构（给出学习路径建议时引用）】\n${COMPREHENSIVE_LEVELS.map(
        (level, index) => `${index + 1}. ${level.short}（${level.name}）——考察：${level.dims}`,
      ).join("\n")}\n完成全部关卡后生成「智核觉醒报告」。`,
    );
  }

  if (/论坛|社区|帖子|讨论/.test(q)) {
    const byTag = TOPIC_POSTS.reduce((acc, post) => {
      acc[post.tag] = (acc[post.tag] || 0) + 1;
      return acc;
    }, {});
    parts.push(
      `【论坛的真实频道】\n${Object.entries(byTag)
        .map(([tag, count]) => `${tag} ${count} 帖`)
        .join("、")}。案例帖都带完整提示词、模型参数与评论。`,
    );
  }

  return parts.join("\n\n");
}
