import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { MemberAvatar } from "./forum-card";
import { fieldInk } from "./forum-board";

/** The board's ground: one solid colour with film-grain texture, edge to edge,
 * carrying the topic's display word and hero typography.
 *
 * It carries `data-forum-field` so the shell can tell when the field has
 * scrolled under the header and flip the nav's ink. */
export function ForumField({
  color,
  word,
  eyebrow,
  subtitle,
  badge = "智核社区",
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
      <header className="forum-field-hero">
        <div className="forum-field-kicker">
          <span className="forum-kicker-dot" aria-hidden="true" />
          <span className="forum-field-eyebrow">{eyebrow ?? "AIQUOS COMMUNITY"}</span>
          <span className="forum-kicker-badge">{badge}</span>
        </div>
        {subtitle && <p className="forum-field-subtitle">{subtitle}</p>}
      </header>
      {word && <SplitWord text={word} />}
      {children}
    </section>
  );
}

/** Display type whose letters arrive with subtle rhythmic delay.
 *
 * The word is the composition, so it is set as individual spans: that is what
 * lets each letter carry its own entry delay and published `--letters` width. */
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

/** The postal stamp: a cancelled postage mark carrying the author's avatar,
 * date and concentric postal rings, echoing the Case archive's stamp motif. */
export function AuthorStamp({ post, size = "md", showDate = true }) {
  return (
    <span
      className={`forum-stamp is-${size}`}
      style={{ "--stamp-color": post.color, "--stamp-ink": post.ink }}
      title={`${post.author} · ${post.createdAt}`}
    >
      <span className="forum-stamp-ring" aria-hidden="true" />
      <span className="forum-stamp-wave" aria-hidden="true" />
      <MemberAvatar name={post.author} size={size === "lg" ? 38 : 24} />
      {showDate && <span className="forum-stamp-date">{post.createdAt.slice(0, 10)}</span>}
    </span>
  );
}

/** Composed empty state when filters find no results. */
export function ForumEmpty({ onClear, member }) {
  return (
    <div className="forum-empty-state">
      <p className="forum-empty-word">NO POSTS</p>
      <p className="forum-empty-note">
        {member ? `没有找到 ${member} 在这个条件下的帖子。` : "没有符合当前条件的讨论帖。"}
      </p>
      <button type="button" onClick={onClear}>清除全部筛选</button>
    </div>
  );
}

/** Filters: topic pills, sorter, and pill search box. */
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
          <span className="forum-pill-label">全部</span>
          <span className="forum-pill-count">{total}</span>
        </button>
        {topics.map((topic) => {
          const isSelected = activeTopic === topic.name;
          return (
            <button
              key={topic.name}
              type="button"
              className="forum-pill"
              aria-pressed={isSelected}
              style={{
                "--pill-color": topic.color,
                "--pill-ink": topic.ink,
                "--topic-accent": topic.accent ?? topic.color,
              }}
              onClick={() => onTopic(isSelected ? null : topic.name)}
            >
              <i className="forum-pill-dot" style={{ background: topic.color }} aria-hidden="true" />
              <span className="forum-pill-label">{topic.name}</span>
              <span className="forum-pill-count">{topicCounts[topic.name] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="forum-filters-side">
        <div className="forum-sorter" role="group" aria-label="排序方式">
          <button type="button" aria-pressed={sort === "new"} onClick={() => onSort("new")}>最新</button>
          <button type="button" aria-pressed={sort === "hot"} onClick={() => onSort("hot")}>最热</button>
        </div>
        <label className={`forum-query${compactQuery ? " is-compact" : ""}`}>
          <MagnifyingGlass size={14} className="forum-query-icon" />
          <input
            type="search"
            value={query}
            placeholder="搜索标题、作者或梗概..."
            aria-label="搜索帖子"
            onChange={(event) => onQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="forum-query-clear"
              aria-label="清除搜索"
              onClick={() => onQuery("")}
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </label>
      </div>
    </div>
  );
}
