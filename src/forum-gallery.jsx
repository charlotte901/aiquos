import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  Eye,
  Heart,
  MagnifyingGlass,
  Plus,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { MemberAvatar } from "./forum-card";
import { ForumField, AuthorStamp, ForumEmpty } from "./forum-bits";

const PER_PAGE = 6;

/** A deterministic subtle tilt per post so it hangs organically on the salon wall. */
function hangAngle(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  const steps = [-2.4, -1.2, -0.6, 0.4, 1.2, 2.2];
  return steps[hash % steps.length];
}

/** One floating / hung case piece:
 * Museum mount with interactive 3D pointer-tracking perspective tilt,
 * authentic postal stamp, category badge, and hover action badge.
 */
function FloatingCasePiece({ post, activity, angle, onOpen, onToggleLike }) {
  const frameRef = useRef(null);
  const likes = post.likes + (activity?.liked ? 1 : 0);
  const liked = Boolean(activity?.liked);

  const tiltPiece = (event) => {
    const el = frameRef.current;
    const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!el || !finePointer || reduced || event.pointerType === "touch") return;
    const bounds = el.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    el.style.setProperty("--piece-tilt-x", `${(-y * 5.8).toFixed(2)}deg`);
    el.style.setProperty("--piece-tilt-y", `${(x * 5.8).toFixed(2)}deg`);
    el.style.setProperty("--piece-shift-x", `${(x * 6.5).toFixed(1)}px`);
    el.style.setProperty("--piece-shift-y", `${(y * 6.5 - 3).toFixed(1)}px`);
  };

  const resetPieceTilt = () => {
    const el = frameRef.current;
    if (!el) return;
    el.style.removeProperty("--piece-tilt-x");
    el.style.removeProperty("--piece-tilt-y");
    el.style.removeProperty("--piece-shift-x");
    el.style.removeProperty("--piece-shift-y");
  };

  return (
    <article
      className="forum-piece"
      data-reveal="pending"
      style={{ "--piece-angle": `${angle}deg`, "--card-color": post.color }}
    >
      <button
        ref={frameRef}
        type="button"
        className="forum-piece-frame"
        onClick={() => onOpen(post.id)}
        onPointerMove={tiltPiece}
        onPointerLeave={resetPieceTilt}
        onBlur={resetPieceTilt}
        aria-label={`展开案例：${post.title}`}
        title={post.summary}
      >
        <span className="forum-piece-mat" style={{ aspectRatio: post.imageRatio || "16 / 10" }}>
          {post.image ? (
            <img src={post.image} alt="" loading="lazy" decoding="async" />
          ) : (
            <div className="forum-piece-placeholder" style={{ background: post.color }}>
              <span>{post.tag}</span>
            </div>
          )}

          <span
            className="forum-piece-tag"
            style={{ "--tag-color": post.color, "--tag-ink": post.ink }}
          >
            {post.tag}
          </span>

          <span className="forum-piece-open" aria-hidden="true">
            <span>查看案例与提示词</span>
            <ArrowUpRight size={13} weight="bold" />
          </span>
        </span>

        <span className="forum-piece-stamp">
          <AuthorStamp post={post} size="sm" showDate={false} />
        </span>
      </button>

      <div className="forum-piece-label">
        <h3
          onClick={() => onOpen(post.id)}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(post.id);
            }
          }}
        >
          {post.title}
        </h3>
        <p className="forum-piece-caption-summary">{post.summary}</p>
        <footer className="forum-piece-meta">
          <span className="forum-piece-author">
            <MemberAvatar name={post.author} size={20} tooltip={false} />
            <strong>{post.author}</strong>
          </span>
          <span className="forum-piece-views" title={`浏览量 ${post.views.toLocaleString("zh-CN")}`}>
            <Eye size={13} />
            {post.views.toLocaleString("zh-CN")}
          </span>
          <button
            type="button"
            className={`forum-piece-like-btn${liked ? " is-liked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike?.(post.id);
            }}
            aria-label={liked ? "取消点赞" : "点赞"}
            aria-pressed={liked}
          >
            <Heart size={13} weight={liked ? "fill" : "regular"} />
            <span>{likes.toLocaleString("zh-CN")}</span>
          </button>
        </footer>
      </div>
    </article>
  );
}

/** The Floating Salon Gallery Board */
export function GalleryBoard({ board, onOpen, onCompose }) {
  const [page, setPage] = useState(0);
  const perPage = PER_PAGE;

  const pages = Math.max(1, Math.ceil(board.visiblePosts.length / perPage));
  const safePage = Math.min(page, pages - 1);
  const shownPosts = useMemo(
    () => board.visiblePosts.slice(safePage * perPage, safePage * perPage + perPage),
    [board.visiblePosts, safePage, perPage],
  );

  const goto = (next) => setPage(Math.max(0, Math.min(pages - 1, next)));

  // Keyboard navigation: ArrowLeft/Right to flip pages
  useEffect(() => {
    const handleKey = (e) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") goto(safePage - 1);
      if (e.key === "ArrowRight") goto(safePage + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [safePage, pages]);

  const subtitle = board.activeTopic
    ? `${board.activeTopic} · 共有 ${board.topicCounts[board.activeTopic] ?? 0} 个案例与实践复盘`
    : "点击任意悬浮案例，探索作品、核心提示词、模型参数与发布者复盘。";

  return (
    <div className="forum-gallery-board">
      <ForumField
        color={board.fieldColor}
        word={board.topicWord}
        eyebrow={board.activeTopic ? `TOPIC · ${board.activeTopic}` : "AIQUOS COMMUNITY"}
        badge={board.activeTopic ? "分类展区" : "案例研讨社区"}
        subtitle={subtitle}
        tall
      >
        {/* Floating side arrows for paging */}
        {pages > 1 && safePage > 0 && (
          <button
            type="button"
            className="forum-side-arrow is-left"
            onClick={() => goto(safePage - 1)}
            aria-label="上一页"
            title="上一页 (←)"
          >
            <CaretLeft size={22} weight="bold" />
          </button>
        )}
        {pages > 1 && safePage < pages - 1 && (
          <button
            type="button"
            className="forum-side-arrow is-right"
            onClick={() => goto(safePage + 1)}
            aria-label="下一页"
            title="下一页 (→)"
          >
            <CaretRight size={22} weight="bold" />
          </button>
        )}

        {/* ── Category Filter Bar & Toolbar ─────────────────────────────── */}
        <div className="gallery-toolbar-wrap">
          <div className="gallery-channels-bar" role="group" aria-label="案例分类">
            <button
              type="button"
              className={`gallery-channel-pill${board.activeTopic === null ? " is-active" : ""}`}
              onClick={() => {
                setPage(0);
                board.setActiveTopic(null);
              }}
            >
              <span>全部案例</span>
              <span className="pill-count">{board.posts.length}</span>
            </button>

            {board.topics.map((topic) => {
              const isSelected = board.activeTopic === topic.name;
              return (
                <button
                  key={topic.name}
                  type="button"
                  className={`gallery-channel-pill${isSelected ? " is-active" : ""}`}
                  style={{
                    "--channel-color": topic.color,
                    "--channel-ink": topic.ink,
                  }}
                  onClick={() => {
                    setPage(0);
                    board.setActiveTopic(isSelected ? null : topic.name);
                  }}
                >
                  <i className="pill-dot" style={{ background: topic.color }} aria-hidden="true" />
                  <span>{topic.name}</span>
                  <span className="pill-count">{board.topicCounts[topic.name] ?? 0}</span>
                </button>
              );
            })}
          </div>

          <div className="gallery-controls-bar">
            <div className="gallery-sorter">
              <button
                type="button"
                aria-pressed={board.sort === "new"}
                onClick={() => {
                  setPage(0);
                  board.setSort("new");
                }}
              >
                最新
              </button>
              <button
                type="button"
                aria-pressed={board.sort === "hot"}
                onClick={() => {
                  setPage(0);
                  board.setSort("hot");
                }}
              >
                最热
              </button>
            </div>

            <label className="gallery-search-box">
              <MagnifyingGlass size={14} />
              <input
                type="search"
                value={board.query}
                placeholder="搜索案例或提示词..."
                aria-label="搜索案例"
                onChange={(e) => {
                  setPage(0);
                  board.setQuery(e.target.value);
                }}
              />
              {board.query && (
                <button
                  type="button"
                  className="gallery-search-clear"
                  onClick={() => board.setQuery("")}
                  aria-label="清除搜索"
                >
                  <X size={12} weight="bold" />
                </button>
              )}
            </label>

            {onCompose && (
              <button
                type="button"
                className="gallery-compose-pill"
                onClick={onCompose}
                aria-label="发布我的案例"
              >
                <Plus size={16} weight="bold" />
                <span>发布案例</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Floating Salon Wall ────────────────────────────────────────── */}
        {shownPosts.length ? (
          <div className="forum-floating-wall" ref={board.revealRef}>
            {shownPosts.map((post) => (
              <FloatingCasePiece
                key={post.id}
                post={post}
                activity={board.activityFor(post)}
                angle={hangAngle(post.id)}
                onOpen={onOpen}
                onToggleLike={board.toggleLike}
              />
            ))}
          </div>
        ) : (
          <ForumEmpty onClear={board.clearFilters} member={board.activeMember} />
        )}

        {/* ── Floating Paging Bar ────────────────────────────────────────── */}
        {pages > 1 && (
          <nav className="forum-wall-pager" aria-label="翻页导航">
            <button
              type="button"
              className="forum-pager-arrow is-prev"
              onClick={() => goto(safePage - 1)}
              disabled={safePage === 0}
              aria-label="上一页"
            >
              <CaretLeft size={16} weight="bold" />
            </button>

            <div className="forum-pager-pills" role="tablist" aria-label="页码选择">
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === safePage}
                  className={`forum-pager-dot${i === safePage ? " is-active" : ""}`}
                  onClick={() => goto(i)}
                  aria-label={`第 ${i + 1} 页`}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="forum-pager-arrow is-next"
              onClick={() => goto(safePage + 1)}
              disabled={safePage >= pages - 1}
              aria-label="下一页"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </nav>
        )}
      </ForumField>
    </div>
  );
}
