/** Shared state and small utilities for the Forum board.
 *
 * Everything stateful lives here so the board component stays presentational:
 * the wall renders what this hook hands it, and the detail and composer read the
 * same state — which is why a like or a comment survives the round trip.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TOPIC_POSTS } from "./forum-topics";
import { resolveMember } from "./community-members";

/** The board's default ground: the iconic AIQUOS brand pink, keeping it
 * completely consistent with the Home and Cases canvases.
 * A selected topic smoothly morphs into the topic's signature colour. */
export const FORUM_DEFAULT_FIELD = "#f568a3";

/** Relative luminance, used to decide whether type prints in white or in ink.
 * Two topics (`每周精选`, `校园故事`) carry an amber field with dark ink by
 * design, so a topic filter can hand the board a background white cannot sit
 * on. Exported because the header's nav labels need the same answer: they
 * scroll over this field, so they must flip with it. */
export function fieldInk(hex) {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!match) return "#ffffff";
  let value = match[1];
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const channel = (i) => {
    const v = parseInt(value.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.45 ? "#17150f" : "#ffffff";
}

/** Topics present in the posts, derived rather than listed a second time, so a
 * newly published custom tag becomes a filter immediately. */
export function collectTopics(posts) {
  const seen = new Map();
  for (const post of posts) {
    if (!seen.has(post.tag)) {
      seen.set(post.tag, { name: post.tag, color: post.color, ink: post.ink, accent: post.accent });
    }
  }
  return [...seen.values()];
}

/** A short English word for the field's display type. The board's own tags are
 * Chinese; the giant word is latin because it carries the composition, and a
 * eight-character Chinese phrase cannot be set at that scale without breaking
 * the line. Falls back to a topical word derived from the tag's own meaning. */
const TOPIC_WORDS = {
  "AI 生图": "VISUAL",
  "AI 视频": "CINEMA",
  "AI 代码": "ENGINE",
  "AI 办公": "OFFICE",
  测评研究: "RESEARCH",
  实战案例: "CASEWORK",
  作品分享: "SHOWCASE",
  学习笔记: "NOTES",
  前沿观察: "OUTLOOK",
  讨论场: "DISCUSSION",
  效率工具: "TOOLKIT",
  校园故事: "CAMPUS",
  每周精选: "SELECTS",
};

export function topicWord(topic) {
  if (!topic) return "COMMUNITY";
  return TOPIC_WORDS[topic] ?? topic.toUpperCase().slice(0, 10);
}

function createComment(content) {
  const now = new Date();
  return {
    id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    author: "你",
    createdAt: new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
    content,
  };
}

function createForumTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export { createComment, createForumTimestamp };

/** Is this post a member's? Posts are authored under nicknames; the member
 * filter may hand us a nickname, and older data could hold a real name. */
export function postBelongsTo(post, memberName) {
  if (!memberName) return true;
  if (post.author === memberName) return true;
  const member = resolveMember(memberName);
  return Boolean(member && (post.author === member.name || post.author === member.nickname));
}

/** Every piece of board state, in one place, so the three variants are three
 * renderings of the same board rather than three independent ones. */
export function useForumBoard() {
  const [posts, setPosts] = useState(TOPIC_POSTS);
  const [activity, setActivity] = useState(() =>
    Object.fromEntries(
      TOPIC_POSTS.map((post) => [post.id, { liked: false, comments: post.comments ?? [] }]),
    ),
  );
  const [activeTopic, setActiveTopic] = useState(null);
  const [activeMember, setActiveMember] = useState(null);
  const [sort, setSort] = useState("new");
  const [query, setQuery] = useState("");

  const topics = useMemo(() => collectTopics(posts), [posts]);

  const topicCounts = useMemo(() => {
    const counts = {};
    for (const post of posts) counts[post.tag] = (counts[post.tag] ?? 0) + 1;
    return counts;
  }, [posts]);

  const visiblePosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = posts.filter((post) => {
      if (activeTopic && post.tag !== activeTopic) return false;
      if (!postBelongsTo(post, activeMember)) return false;
      if (!needle) return true;
      return (
        post.title.toLowerCase().includes(needle) ||
        post.summary.toLowerCase().includes(needle) ||
        post.author.toLowerCase().includes(needle)
      );
    });
    if (sort === "hot") {
      return [...filtered].sort((a, b) => b.likes + b.views / 100 - (a.likes + a.views / 100));
    }
    return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [posts, activeTopic, activeMember, query, sort]);

  const fieldColor = useMemo(() => {
    if (activeTopic) {
      return topics.find((topic) => topic.name === activeTopic)?.color ?? FORUM_DEFAULT_FIELD;
    }
    return FORUM_DEFAULT_FIELD;
  }, [activeTopic, topics]);

  const toggleLike = useCallback((id) => {
    setActivity((current) => {
      const item = current[id] ?? { liked: false, comments: [] };
      return { ...current, [id]: { ...item, liked: !item.liked } };
    });
  }, []);

  const addComment = useCallback((id, content) => {
    setActivity((current) => {
      const item = current[id] ?? { liked: false, comments: [] };
      return { ...current, [id]: { ...item, comments: [...item.comments, createComment(content)] } };
    });
  }, []);

  const publishPost = useCallback((post) => {
    setPosts((current) => [post, ...current]);
    setActivity((current) => ({ ...current, [post.id]: { liked: false, comments: [] } }));
    // Show the writer their own post rather than leaving an earlier filter
    // hiding it.
    setActiveTopic(null);
    setActiveMember(null);
    setQuery("");
    setSort("new");
  }, []);

  const clearFilters = useCallback(() => {
    setActiveTopic(null);
    setActiveMember(null);
    setQuery("");
  }, []);

  const relatedTo = useCallback(
    (post) =>
      post
        ? posts
            .filter((item) => item.id !== post.id && item.tag === post.tag)
            .sort((a, b) => b.likes - a.likes)
            .slice(0, 5)
        : [],
    [posts],
  );

  const activityFor = useCallback(
    (post) => activity[post.id] ?? { liked: false, comments: post.comments ?? [] },
    [activity],
  );

  return {
    posts,
    topics,
    topicCounts,
    visiblePosts,
    activeTopic,
    setActiveTopic,
    activeMember,
    setActiveMember,
    sort,
    setSort,
    query,
    setQuery,
    fieldColor,
    toggleLike,
    addComment,
    publishPost,
    clearFilters,
    relatedTo,
    activityFor,
  };
}

/** Keep `data-field-ink` on `.app` in step with what the header is actually
 * sitting on.
 *
 * Two things decide it, and both are needed. The field's own lightness says
 * what colour would read on it; *whether the board's colour actually reaches
 * the header* says whether that matters. The header is chrome owned by App, so
 * the only channel to it is this attribute. */
export function useFieldInk(fieldColor, deps = []) {
  useEffect(() => {
    const app = document.querySelector(".app");
    const screen = document.querySelector(".home-tab-screen");
    if (!app || !screen) return;

    const field = screen.querySelector("[data-forum-field]");
    const nav = document.querySelector(".site-header nav");
    if (!field || !nav) return;

    let frame = 0;
    const sync = () => {
      frame = 0;
      const fieldBox = field.getBoundingClientRect();
      const navBox = nav.getBoundingClientRect();
      const overlaps = fieldBox.top <= navBox.bottom && fieldBox.bottom >= navBox.top;
      if (overlaps && fieldInk(fieldColor) === "#ffffff") app.dataset.fieldInk = "light";
      else delete app.dataset.fieldInk;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };

    sync();
    screen.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      screen.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      delete app.dataset.fieldInk;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldColor, ...deps]);
}

/** Reveal on entry, staggered by DOM order.
 *
 * An `animation`, never a `transition`: these elements also lift on hover, and a
 * transition on `transform` would stretch that lift to the reveal's duration.
 * The attribute is removed when the animation ends so the element returns to
 * its plain hover behaviour.
 *
 * Reduced motion clears the attribute outright — with no animation the pending
 * state would otherwise hold every item at `opacity: 0`. */
export function useReveal(deps = [], selector = "[data-reveal]") {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll(selector));
    if (!items.length) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      items.forEach((item) => item.removeAttribute("data-reveal"));
      return;
    }

    const settle = (item) => {
      item.setAttribute("data-reveal", "in");
      item.addEventListener("animationend", () => item.removeAttribute("data-reveal"), { once: true });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          settle(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );

    items.forEach((item) => observer.observe(item));

    // Failsafe, for the same reason the homepage's boot curtain has one: some
    // embedded webviews stop delivering frames while their pane is occluded, and
    // an IntersectionObserver is fed by frames — so in exactly those environments
    // the callback never arrives and the pieces sit at `opacity: 0` forever. The
    // observed path stays first (it is what gives the stagger as you scroll);
    // this only guarantees the content eventually appears.
    const failsafe = setTimeout(() => {
      items.forEach((item) => item.removeAttribute("data-reveal"));
      observer.disconnect();
    }, 2000);

    return () => {
      clearTimeout(failsafe);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
