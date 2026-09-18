import { MemberAvatar } from "./forum-card";
import { fieldInk } from "./forum-board";

/** The board's ground: one solid colour, edge to edge, with the topic's display
 * word set across it.
 *
 * It carries `data-forum-field` so the shell can tell when the field has
 * scrolled under the header and flip the nav's ink. */
export function ForumField({
  color,
  word,
  eyebrow,
  children,
  className = "",
  tall = false,
}) {
  const ink = fieldInk(color);
  const light = ink === "#ffffff";

  return (
    <section
      className={`forum-field${tall ? " is-tall" : ""}${className ? ` ${className}` : ""}`}
      data-forum-field
      data-ink={light ? "light" : "dark"}
      style={{ "--field-color": color, "--field-ink": ink }}
    >
      {eyebrow && <p className="forum-field-eyebrow">{eyebrow}</p>}
      {word && <SplitWord text={word} />}
      {children}
    </section>
  );
}

/** Display type whose letters arrive one after another.
 *
 * The word is the composition, so it is set as individual spans rather than a
 * single text node: that is what lets each letter carry its own entry delay —
 * the same "bouncing letters" move the family wordmarks use, built from type
 * because no artwork exists for these words.
 *
 * It also publishes its own letter count as `--letters`. The stylesheet sizes the
 * type from that, which is what lets a ten-letter topic word and a seven-letter
 * one both span the picture instead of one of them floating small in the middle:
 * a single clamp cannot fit two different words to one width. */
export function SplitWord({ text, className = "" }) {
  return (
    <span
      className={`forum-word${className ? ` ${className}` : ""}`}
      role="text"
      aria-label={text}
      style={{ "--letters": Math.max(1, text.length) }}
    >
      {text.split("").map((letter, index) => (
        <span key={`${letter}-${index}`} aria-hidden="true" style={{ "--i": index }}>
          {letter}
        </span>
      ))}
    </span>
  );
}

/** The stamp: a small cancelled postage mark carrying the author's face, the
 * date and a ring of dots. It is the board's way of attributing a post without
 * a metadata bar, and the one place a topic's colour is allowed to appear. */
export function AuthorStamp({ post, size = "md", showDate = true }) {
  return (
    <span
      className={`forum-stamp is-${size}`}
      style={{ "--stamp-color": post.color, "--stamp-ink": post.ink }}
      title={`${post.author} · ${post.createdAt}`}
    >
      <span className="forum-stamp-ring" aria-hidden="true" />
      <MemberAvatar name={post.author} size={size === "lg" ? 40 : 26} />
      {showDate && <span className="forum-stamp-date">{post.createdAt.slice(0, 10)}</span>}
    </span>
  );
}

/** Nothing matched. Composed rather than left blank, with the one action that
 * resolves it. */
export function ForumEmpty({ onClear, member }) {
  return (
    <div className="forum-empty-state">
      <p className="forum-empty-word">NO LETTERS</p>
      <p className="forum-empty-note">
        {member ? `没有找到 ${member} 在这个条件下的帖子。` : "没有符合当前条件的帖子。"}
      </p>
      <button type="button" onClick={onClear}>清除筛选</button>
    </div>
  );
}

/** Filters, reduced to one line at the foot of the field.
 *
 * Every variant renders this in its own place, because the filters belong to
 * the composition rather than floating above it: on the postcard board they are
 * the caption line, on the gallery wall the label rail, in the journal the
 * masthead. Kept as one component so all three stay identical in behaviour. */
export function ForumFilters({
  topics,
  activeTopic,
  onTopic,
  topicCounts,
  total,
  sort,
  onSort,
  query,
  onQuery,
  compactQuery = false,
}) {
  return (
    <div className="forum-filters" role="group" aria-label="筛选与排序">
      <div className="forum-filters-topics">
        <button
          type="button"
          className="forum-pill"
          aria-pressed={activeTopic === null}
          style={{ "--pill-color": "var(--field-ink)", "--pill-ink": "var(--field-color)" }}
          onClick={() => onTopic(null)}
        >
          全部<span className="forum-pill-count">{total}</span>
        </button>
        {topics.map((topic) => (
          <button
            key={topic.name}
            type="button"
            className="forum-pill"
            aria-pressed={activeTopic === topic.name}
            style={{ "--pill-color": topic.color, "--pill-ink": topic.ink }}
            onClick={() => onTopic(activeTopic === topic.name ? null : topic.name)}
          >
            {topic.name}
            <span className="forum-pill-count">{topicCounts[topic.name] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="forum-filters-side">
        <div className="forum-sorter" role="group" aria-label="排序方式">
          <button type="button" aria-pressed={sort === "new"} onClick={() => onSort("new")}>最新</button>
          <button type="button" aria-pressed={sort === "hot"} onClick={() => onSort("hot")}>最热</button>
        </div>
        <label className={`forum-query${compactQuery ? " is-compact" : ""}`}>
          <span className="forum-query-label">搜索</span>
          <input
            type="search"
            value={query}
            placeholder="标题、梗概或作者"
            aria-label="搜索帖子"
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
