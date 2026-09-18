import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ForumArt } from "./forum-art";
import { memberColor, memberInk, resolveMember } from "./community-members";

/** Avatar = the nickname's first character on that member's own colour.
 * Shared by the wall, the detail header and the comment list. */
export function MemberAvatar({ name, size = 34, className = "", tooltip = true }) {
  const member = resolveMember(name);
  const display = member ? member.nickname : name;

  return (
    <span
      className={`member-avatar${className ? ` ${className}` : ""}`}
      style={{
        width: size,
        height: size,
        background: memberColor(name),
        color: memberInk(name),
        fontSize: Math.max(11, Math.round(size * 0.42)),
      }}
      title={tooltip && member ? `${display} · ${member.role}` : undefined}
      aria-hidden="true"
    >
      {display.slice(0, 1)}
    </span>
  );
}

/** A post's cover: its photograph when it has one, otherwise the topic's
 * geometric pattern. A broken image falls back to the pattern too, rather than
 * collapsing the card. */
export function ForumCardMedia({ image, art, color, ink, accent, ratio }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [image]);

  if (!image || broken) {
    return <ForumArt art={art} color={color} ink={ink} accent={accent} ratio={ratio} />;
  }

  return (
    <span className="forum-card-media" aria-hidden="true">
      <img
        src={image}
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        onError={() => setBroken(true)}
      />
    </span>
  );
}

/** The title, with its underline revealed per rendered line on hover.
 *
 * The lines are measured from the DOM rather than guessed: `Range` returns one
 * client rect per visual line, so a title that wraps to three lines gets three
 * bars in exactly the right places at any width or font size. */
export function ForumTitle({ text }) {
  const titleRef = useRef(null);
  const textRef = useRef(null);
  const [lines, setLines] = useState([]);

  const measure = useCallback(() => {
    const text = textRef.current;
    const title = titleRef.current;
    if (!text || !title) return;

    const range = document.createRange();
    range.selectNodeContents(text);
    const boxes = Array.from(range.getClientRects()).filter((box) => box.width > 0);
    const titleBox = title.getBoundingClientRect();

    setLines(
      boxes.map((box, index) => ({
        id: `${index}-${Math.round(box.width)}`,
        top: box.bottom - titleBox.top - 1.5,
        left: box.left - titleBox.left,
        width: box.width,
        delay: index * 80,
      })),
    );
  }, [text]);

  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    let timer;
    const delayedMeasure = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 120);
    };

    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", delayedMeasure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", delayedMeasure);
    };
  }, [measure]);

  return (
    <h3 className="forum-card-title" ref={titleRef}>
      <span ref={textRef}>{text}</span>
      <span className="forum-title-lines" aria-hidden="true">
        {lines.map((line) => (
          <i
            key={line.id}
            style={{
              top: `${line.top}px`,
              left: `${line.left}px`,
              width: `${line.width}px`,
              transitionDelay: `${line.delay}ms`,
            }}
          />
        ))}
      </span>
    </h3>
  );
}

/** One wall card. `enter` drives the staggered settle; `onOpen` is omitted in
 * the composer's preview, where the card is inert. */
export function ForumCard({
  post,
  activity,
  onOpen,
  enter,
  className = "",
  interactive = true,
}) {
  const comments = activity?.comments?.length ?? post.comments?.length ?? 0;
  const likes = post.likes + (activity?.liked ? 1 : 0);

  const activate = () => onOpen?.(post.id);

  return (
    <article
      className={`forum-card${className ? ` ${className}` : ""}`}
      style={{
        "--card-color": post.color,
        "--card-ink": post.ink,
        "--card-line": post.line,
        "--card-accent": post.accent,
      }}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `展开帖子：${post.title}` : undefined}
      data-enter={enter}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activate();
              }
            }
          : undefined
      }
    >
      <ForumCardMedia
        image={post.image}
        art={post.art}
        color={post.color}
        ink={post.ink}
        accent={post.accent}
        ratio={post.imageRatio}
      />
      <div className="forum-card-body">
        <span className="forum-tag">{post.tag}</span>
        <ForumTitle text={post.title} />
        <p className="forum-card-summary">{post.summary}</p>
      </div>
      <footer className="forum-card-meta">
        <span className="forum-card-author">
          <MemberAvatar name={post.author} size={28} />
          <strong>{post.author}</strong>
        </span>
        <time>{post.createdAt}</time>
        <span>
          浏览量
          <b>{post.views.toLocaleString("zh-CN")}</b>
        </span>
        <span>
          评论量
          <b>{comments.toLocaleString("zh-CN")}</b>
        </span>
        <span>
          点赞量
          <b>{likes.toLocaleString("zh-CN")}</b>
        </span>
      </footer>
    </article>
  );
}
