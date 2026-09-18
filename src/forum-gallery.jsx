import { useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { ForumField, ForumFilters, ForumEmpty, AuthorStamp } from "./forum-bits";
import { ForumCardMedia } from "./forum-card";

const PER_PAGE = 5;

/** A deterministic tilt per post, so a piece hangs at the same angle every time
 * the reader returns to it. A hash rather than a random number: re-randomising
 * on each render would make the wall twitch as filters change. */
function hangAngle(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  const steps = [-2.4, -1.5, -0.8, 0, 0.6, 1.4, 2.2];
  return steps[hash % steps.length];
}

/** One hung piece: a white mount with the work inside and a label beneath.
 *
 * The mount is what makes it art rather than a card — a passe-partout around the
 * image, with the caption outside the frame on the field itself, the way a
 * gallery label sits on the wall and not on the canvas. */
function WallPiece({ post, activity, angle, leader, onOpen }) {
  const likes = post.likes + (activity?.liked ? 1 : 0);

  return (
    <article
      className={`forum-piece${leader ? " is-leader" : ""}`}
      data-reveal="pending"
      style={{ "--piece-angle": `${angle}deg`, "--card-color": post.color }}
    >
      <button
        type="button"
        className="forum-piece-frame"
        onClick={() => onOpen(post.id)}
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
        </span>
      </button>

      <div className="forum-piece-label">
        <span className="forum-piece-no" aria-hidden="true" />
        <h3>{post.title}</h3>
        <p>
          <span>{post.tag}</span>
          <span>{post.author}</span>
          <span>{likes.toLocaleString("zh-CN")} 赞</span>
        </p>
      </div>

      <span className="forum-piece-stamp">
        <AuthorStamp post={post} size="sm" showDate={false} />
      </span>
    </article>
  );
}

/** The community board — a wall.
 *
 * The content is hung rather than listed: pieces at slight angles over a dark
 * field, the newest of them given the lead, and paging instead of an endless
 * scroll. Hovering any piece pulls the others back a little (see the
 * stylesheet), which is the one motion this composition needs — it says "the
 * wall recedes when you look at one thing", which is how a room behaves.
 *
 * White frames on a dark ground is the whole idea. The dark field is also why
 * the display word and the header's labels flip to white here by default. */
export function GalleryBoard({ board, onOpen }) {
  const [page, setPage] = useState(0);
  const perPage = PER_PAGE;

  const pages = Math.max(1, Math.ceil(board.visiblePosts.length / perPage));
  const safePage = Math.min(page, pages - 1);
  const shown = useMemo(
    () => board.visiblePosts.slice(safePage * perPage, safePage * perPage + perPage),
    [board.visiblePosts, safePage, perPage],
  );

  // A filter change can leave the reader on a page that no longer exists.
  const goto = (next) => setPage(Math.max(0, Math.min(pages - 1, next)));

  return (
    <div className="forum-gallery-board">
      <ForumField
        color={board.fieldColor}
        word={board.topicWord}
        eyebrow={board.activeTopic ?? "展藏"}
        tall
      >
        {shown.length ? (
          // The reveal observer is attached here: the pieces are painted at
          // `opacity: 0` until it observes them, so a wall without the ref would
          // render as a blank field.
          <div className="forum-wall" ref={board.revealRef}>
            {shown.map((post, index) => (
              <WallPiece
                key={post.id}
                post={post}
                activity={board.activityFor(post)}
                angle={hangAngle(post.id)}
                leader={index === 0}
                onOpen={onOpen}
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
        </div>
      </ForumField>

      {pages > 1 && (
        <nav className="forum-wall-pager" aria-label="翻页">
          <button
            type="button"
            className="forum-pager-arrow"
            onClick={() => goto(safePage - 1)}
            disabled={safePage === 0}
            aria-label="上一页"
          >
            <CaretLeft weight="bold" />
          </button>
          <p className="forum-pager-count">
            <span>{String(safePage + 1).padStart(2, "0")}</span>
            <i aria-hidden="true">/</i>
            {String(pages).padStart(2, "0")}
          </p>
          <button
            type="button"
            className="forum-pager-arrow"
            onClick={() => goto(safePage + 1)}
            disabled={safePage >= pages - 1}
            aria-label="下一页"
          >
            <CaretRight weight="bold" />
          </button>
        </nav>
      )}
    </div>
  );
}
