import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CaretLeft, CaretRight, Eye, Heart } from "@phosphor-icons/react";
import { ForumField, ForumFilters, ForumEmpty, AuthorStamp } from "./forum-bits";
import { ForumCardMedia, MemberAvatar } from "./forum-card";

const PER_PAGE = 5;

/** A deterministic subtle tilt per post so it hangs organically on the salon wall. */
function hangAngle(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  const steps = [-2.2, -1.2, -0.6, 0, 0.6, 1.2, 2.0];
  return steps[hash % steps.length];
}

/** One hung piece: museum passe-partout mount with interactive 3D pointer-tracking
 * perspective tilt (inspired by CaseArchive's tiltFeature), postal cancellation seal,
 * hover capsule affordance, and elevated typographic caption. */
function WallPiece({ post, activity, angle, leader, onOpen, onToggleLike }) {
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
      className={`forum-piece${leader ? " is-leader" : ""}`}
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
        aria-label={`展开帖子：${post.title}`}
        title={post.summary}
      >
        <span className="forum-piece-mat">
          <ForumCardMedia
            image={post.image}
            art={post.art}
            color={post.color}
            ink={post.ink}
            accent={post.accent}
            ratio={post.imageRatio}
          />
          {leader && <span className="forum-piece-badge">精选置顶</span>}
          <span className="forum-piece-open" aria-hidden="true">
            <span>阅读讨论</span>
            <ArrowUpRight size={13} weight="bold" />
          </span>
        </span>

        <span className="forum-piece-stamp">
          <AuthorStamp post={post} size="sm" showDate={false} />
        </span>
      </button>

      <div className="forum-piece-label">
        <div className="forum-piece-tagline">
          <span
            className="forum-piece-tag"
            style={{ "--tag-color": post.color, "--tag-ink": post.ink }}
          >
            {post.tag}
          </span>
          {leader && <span className="forum-piece-lead-hint">LEAD STORY</span>}
        </div>
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

/** The community board — an authentic salon gallery wall with physical depth,
 * 3D cursor-tracking perspective tilt, film-grain texture, and responsive pagination. */
export function GalleryBoard({ board, onOpen }) {
  const [page, setPage] = useState(0);
  const perPage = PER_PAGE;

  const pages = Math.max(1, Math.ceil(board.visiblePosts.length / perPage));
  const safePage = Math.min(page, pages - 1);
  const shown = useMemo(
    () => board.visiblePosts.slice(safePage * perPage, safePage * perPage + perPage),
    [board.visiblePosts, safePage, perPage],
  );

  const goto = (next) => setPage(Math.max(0, Math.min(pages - 1, next)));

  // Keyboard navigation: ArrowLeft/Right to flip pages (matching Cases).
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
    ? `${board.activeTopic} · 共有 ${board.topicCounts[board.activeTopic] ?? 0} 篇实践复盘与交流讨论`
    : "用真实经验，沉淀 AI 实践认知。从提示词调优，到作品与经验复盘。";

  return (
    <div className="forum-gallery-board">
      <ForumField
        color={board.fieldColor}
        word={board.topicWord}
        eyebrow={board.activeTopic ? `TOPIC · ${board.activeTopic}` : "AIQUOS COMMUNITY"}
        badge={board.activeTopic ? "主题展区" : "智核社区"}
        subtitle={subtitle}
        tall
      >
        {/* Floating side arrows for effortless paging, echoing Cases' case-poster-arrow */}
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

        {shown.length ? (
          <div className="forum-wall" ref={board.revealRef}>
            {shown.map((post, index) => (
              <WallPiece
                key={post.id}
                post={post}
                activity={board.activityFor(post)}
                angle={hangAngle(post.id)}
                leader={index === 0}
                onOpen={onOpen}
                onToggleLike={board.toggleLike}
              />
            ))}
          </div>
        ) : (
          <ForumEmpty onClear={board.clearFilters} member={board.activeMember} />
        )}

        <div className="forum-wall-foot">
          <ForumFilters
            topics={board.topics}
            activeTopic={board.activeTopic}
            onTopic={(value) => {
              setPage(0);
              board.setActiveTopic(value);
            }}
            topicCounts={board.topicCounts}
            total={board.posts.length}
            sort={board.sort}
            onSort={(value) => {
              setPage(0);
              board.setSort(value);
            }}
            query={board.query}
            onQuery={(value) => {
              setPage(0);
              board.setQuery(value);
            }}
          />

          {pages > 1 && (
            <nav className="forum-wall-pager" aria-label="翻页">
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
        </div>
      </ForumField>
    </div>
  );
}
