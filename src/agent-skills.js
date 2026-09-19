import { TOPIC_POSTS } from "./forum-topics.js";

/** 小Q's skill system: the model decides, the page acts.
 *
 * DeepSeek replies may embed directives — `[[go:forum]]`,
 * `[[search-cases:黑猫]]`, `[[recommend-case:cat-glasses]]` — which the
 * client strips from the displayed text and executes. That keeps the proxy
 * untouched (plain chat messages only) while giving the model real hands:
 * navigation, library search, and case cards rendered inside the chat. */

export const GO_TARGETS = new Set(["home", "cases", "forum", "assessment"]);

const DIRECTIVE_RE = /\[\[\s*(go|search-cases|open-case|recommend-case)\s*:\s*([^\]\n]+?)\s*\]\]/g;
// A directive still streaming in: an unclosed `[[...` fragment at the tail.
const PARTIAL_RE = /\[\[[^\]]*$/;

/* ── Skill: navigation (runs locally, no model round-trip) ──────────────────
 * Fires only when an action verb AND a destination appear together, so a
 * knowledge question like "案例库有什么好玩的？" still reaches the model. */
const NAV_SKILLS = [
  { target: "home", verb: /(回去|回到|返回|送我回)/, place: /(首页|主页|家)/ },
  {
    target: "cases",
    verb: /(带我去|带我去看看|打开|前往|进入|跳转|去(看看|逛逛|逛一逛)?|逛逛|想看)/,
    place: /(案例库|案例墙|作品库|真实案例)/,
  },
  { target: "forum", verb: /(带我去|打开|前往|进入|跳转|去(看看|逛逛|逛一逛)?|逛逛|想逛)/, place: /(论坛|社区)/ },
  { target: "assessment", verb: /(开始|进入|前往|挑战|来一次|想做|想测|去)/, place: /(测评|闯关|考核|能力测试)/ },
];

export const NAV_TARGET_LABEL = {
  home: "首页",
  cases: "案例库",
  forum: "论坛",
  assessment: "AI 测评",
};

/** "带我去案例库" → { target: "cases" }; a pure knowledge question like
 * "案例库有什么好玩的？" → null (no action verb, falls through to the model). */
export function detectNavigation(text) {
  const t = String(text || "");
  for (const skill of NAV_SKILLS) {
    if (skill.verb.test(t) && skill.place.test(t)) return { target: skill.target };
  }
  return null;
}

/** Remove every directive (and any half-streamed one at the tail) from text
 * the user should read. */
export function stripDirectives(text) {
  return String(text ?? "")
    .replace(DIRECTIVE_RE, "")
    .replace(PARTIAL_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** All well-formed directives in a finished reply, in order. */
export function parseDirectives(text) {
  return [...String(text ?? "").matchAll(DIRECTIVE_RE)].map((match) => ({
    action: match[1],
    argument: match[2].trim(),
  }));
}

/** Keyword search over the case library: title, tag and summary, newest-style
 * scoring (title hit first). Returns up to three posts. */
export function searchCases(keyword) {
  const query = String(keyword ?? "").trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/).filter(Boolean);
  const scored = TOPIC_POSTS.map((post) => {
    const title = post.title.toLowerCase();
    const tag = (post.tag || "").toLowerCase();
    const summary = (post.summary || "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 4;
      if (tag.includes(term)) score += 2;
      if (summary.includes(term)) score += 1;
    }
    return { post, score };
  }).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((entry) => entry.post);
}

export function findCase(id) {
  return TOPIC_POSTS.find((post) => post.id === id) || null;
}

/** One-line descriptor injected into the system prompt so the model knows the
 * real catalogue without hallucinating ids. */
export function caseCatalogLine() {
  return TOPIC_POSTS.map((post) => `${post.id}（${post.tag}）：${post.title}`).join("；");
}

/** Execute parsed directives. `handlers`:
 *   go(view)                       view ∈ GO_TARGETS
 *   searchCases(query)             keyword for the library
 *   openCase(id, action)           action is "open-case" or "recommend-case"
 *                                  so the caller can choose jump-vs-card.
 * Unknown directives are ignored; navigation never throws. */
export function executeSkill(directive, handlers) {
  const { action, argument } = directive;
  try {
    if (action === "go" && GO_TARGETS.has(argument)) {
      handlers.go?.(argument);
      return true;
    }
    if (action === "search-cases" && argument) {
      handlers.searchCases?.(argument);
      return true;
    }
    if ((action === "recommend-case" || action === "open-case") && findCase(argument)) {
      handlers.openCase?.(argument, action);
      return true;
    }
  } catch {
    // A failing skill must never break the conversation render.
  }
  return false;
}
