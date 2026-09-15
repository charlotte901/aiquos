import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  ChatCircleDots,
  Eye,
  Heart,
  PaperPlaneRight,
  Plus,
  X,
} from "@phosphor-icons/react";
import { ForumEffect } from "./ForumEffect";
import { favoriteFromForum, toggleFavorite, useFavoriteSaved } from "./favorites-store";
import { useAccount } from "./account-store";
import { resolveMember, memberColor, memberInk } from "./community-members";
import { TOPIC_POSTS } from "./forum-topics";

const FORUM_TAGS = [
  { name: "学习笔记", color: "#f568a3", ink: "#ffffff", accent: "#ffd7ec" },
  { name: "实战案例", color: "#247cf1", ink: "#ffffff", accent: "#c8e0ff" },
  { name: "作品分享", color: "#00a96d", ink: "#ffffff", accent: "#bdf2d8" },
  { name: "讨论场", color: "#7438e5", ink: "#ffffff", accent: "#e0ccff" },
  { name: "每周精选", color: "#ffb703", ink: "#17150f", accent: "#fff0c2" },
];

/** 最新话题在前：15 个成员账号（昵称发布）的 AI 测评专题。 */
const POSTS = TOPIC_POSTS;

function MemberAvatar({ name, size = 34, className = "", tooltip = true }) {
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

/** 图片加载失败时收起图位；用状态而非直接改 DOM，重渲染即自动重试。 */
function ForumCardMedia({ image }) {
  const [broken, setBroken] = useState(false);

  if (broken) return null;

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

function ForumTitle({ text }) {
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ForumComposer({ onBack, onPublish }) {
  const [tagIndex, setTagIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [customTags, setCustomTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [images, setImages] = useState([]);
  const [activeImage, setActiveImage] = useState(0);
  const [createdAt] = useState(createForumTimestamp);
  const { nickname } = useAccount();
  const author = nickname.trim() || "智核学员";
  const tags = useMemo(() => [...FORUM_TAGS, ...customTags], [customTags]);
  const tag = tags[Math.min(tagIndex, tags.length - 1)];
  const previewIndex = Math.min(activeImage, Math.max(0, images.length - 1));
  const canPublish = [title, summary, content].every((value) => value.trim());

  const selectImages = async (event) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;

    try {
      const selectedImages = await Promise.all(files.map(readFileAsDataUrl));
      const nextImages = [...images, ...selectedImages];
      setImages(nextImages);
      setActiveImage(Math.max(0, nextImages.length - 1));
    } finally {
      event.target.value = "";
    }
  };

  const removeActiveImage = () => {
    setImages((current) => current.filter((_, index) => index !== previewIndex));
    setActiveImage(0);
  };

  const addTag = () => {
    const name = newTag.trim();
    if (!name) return;

    const existingIndex = tags.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existingIndex >= 0) {
      setTagIndex(existingIndex);
      setNewTag("");
      return;
    }

    setCustomTags((current) => [...current, {
      name,
      color: "#17150f",
      ink: "#ffffff",
      accent: "#e8e2e4",
    }]);
    setTagIndex(tags.length);
    setNewTag("");
  };

  const publish = (event) => {
    event.preventDefault();
    if (!canPublish) return;

    onPublish({
      id: `forum-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tag: tag.name,
      title: title.trim(),
      summary: summary.trim(),
      author,
      createdAt,
      views: 1,
      likes: 0,
      comments: [],
      image: images[0],
      images: images.length ? images : undefined,
      color: tag.color,
      ink: tag.ink,
      line: tag.line ?? tag.ink,
      accent: tag.accent,
      content: content.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean),
    });
  };

  return (
    <article className="forum-compose-screen" aria-labelledby="forum-compose-title">
      <button className="forum-back" type="button" onClick={onBack}>
        <X size={18} />
        返回论坛
      </button>

      <section className="forum-compose-preview" aria-label="帖子预览">
        <div className="forum-compose-stage">
          {images.length ? (
            <span className="forum-compose-media">
              {images.map((image, index) => (
                <img
                  key={`${image}-${index}`}
                  className={`forum-compose-preview-image${index === previewIndex ? " is-active" : ""}`}
                  src={image}
                  alt={index === previewIndex ? "帖子图片预览" : ""}
                  draggable="false"
                />
              ))}

              <button
                type="button"
                className="forum-compose-remove"
                aria-label={`移除第 ${previewIndex + 1} 张图片`}
                onClick={removeActiveImage}
              >
                <X weight="bold" />
              </button>

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    className="forum-gallery-nav is-prev"
                    aria-label="上一张图片"
                    onClick={() => setActiveImage((current) => (current - 1 + images.length) % images.length)}
                  >
                    <CaretLeft weight="bold" />
                  </button>
                  <button
                    type="button"
                    className="forum-gallery-nav is-next"
                    aria-label="下一张图片"
                    onClick={() => setActiveImage((current) => (current + 1) % images.length)}
                  >
                    <CaretRight weight="bold" />
                  </button>
                </>
              )}

              <div className="forum-gallery-dots">
                {images.map((image, index) => (
                  <button
                    key={`${image}-dot-${index}`}
                    type="button"
                    className={index === previewIndex ? "is-active" : ""}
                    aria-label={`预览第 ${index + 1} 张图片`}
                    aria-current={index === previewIndex}
                    onClick={() => setActiveImage(index)}
                  />
                ))}
              </div>
            </span>
          ) : (
            <span className="forum-compose-media-empty" aria-hidden="true" />
          )}
        </div>

        <label className="forum-compose-file">
          <input type="file" accept="image/*" multiple onChange={selectImages} />
          选择图片
        </label>
      </section>

      <section className="forum-compose-panel">
        <header>
          <p>NEW POST</p>
          <h1 id="forum-compose-title">发布帖子</h1>
        </header>

        <form className="forum-compose-form" onSubmit={publish}>
          <div className="forum-compose-field">
            <label>主题</label>
            <div className="forum-compose-tags" role="group" aria-label="选择主题">
              {tags.map((item, index) => (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={index === tagIndex}
                  onClick={() => setTagIndex(index)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="forum-compose-field">
            <label htmlFor="forum-compose-new-tag">新增主题</label>
            <div className="forum-compose-add-tag">
              <input
                id="forum-compose-new-tag"
                value={newTag}
                maxLength={16}
                placeholder="输入主题名称"
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
              />
              <button type="button" onClick={addTag} disabled={!newTag.trim()}>
                <Plus size={16} weight="bold" />
                添加
              </button>
            </div>
          </div>

          <div className="forum-compose-field">
            <label htmlFor="forum-compose-title-input">标题</label>
            <input id="forum-compose-title-input" value={title} maxLength={48} placeholder="写下这次分享的核心" onChange={(event) => setTitle(event.target.value)} />
          </div>

          <div className="forum-compose-field">
            <label htmlFor="forum-compose-summary">梗概</label>
            <input id="forum-compose-summary" value={summary} maxLength={90} placeholder="放在卡片上的简短介绍" onChange={(event) => setSummary(event.target.value)} />
          </div>

          <div className="forum-compose-field">
            <label htmlFor="forum-compose-content">正文</label>
            <textarea id="forum-compose-content" value={content} placeholder="每空一行会成为一个正文段落" onChange={(event) => setContent(event.target.value)} />
          </div>

          <button className="forum-publish-button" type="submit" disabled={!canPublish}>
            发布到论坛
          </button>
        </form>
      </section>
    </article>
  );
}

function ForumActionBar({ post, activity, onToggleLike, onAddComment }) {
  const [draft, setDraft] = useState("");
  const liked = activity.liked;
  const comments = activity.comments;
  const likeCount = post.likes + (liked ? 1 : 0);

  const submitComment = (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    onAddComment(post.id, content);
    setDraft("");
  };

  return (
    <div className="forum-post-actions">
      <form className="forum-comment-composer" onSubmit={submitComment}>
        <input
          type="text"
          value={draft}
          maxLength={200}
          placeholder="说点什么..."
          aria-label={`评论：${post.title}`}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>
          <PaperPlaneRight size={17} />
          发布
        </button>
      </form>

      <footer className="forum-post-footer">
        <div className="forum-post-author">
          <MemberAvatar name={post.author} size={38} className="forum-post-avatar" />
          <div>
            <strong>{post.author}</strong>
            <time>{post.createdAt}</time>
          </div>
        </div>
        <div className="forum-post-stats">
          <span aria-label={`浏览量 ${post.views.toLocaleString("zh-CN")}`}>
            <Eye size={17} />
            {post.views.toLocaleString("zh-CN")}
          </span>
          <button
            type="button"
            className={`forum-like-button${liked ? " is-liked" : ""}`}
            aria-pressed={liked}
            aria-label={liked ? "取消点赞" : "点赞"}
            onClick={() => onToggleLike(post.id)}
          >
            <Heart size={17} weight={liked ? "fill" : "regular"} />
            {likeCount.toLocaleString("zh-CN")}
          </button>
          <span aria-label={`评论量 ${comments.length.toLocaleString("zh-CN")}`}>
            <ChatCircleDots size={17} />
            {comments.length.toLocaleString("zh-CN")}
          </span>
        </div>
      </footer>
  </div>
  );
}

function ForumPostGallery({ post }) {
  const images = post.images?.length ? post.images : [post.image].filter(Boolean);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    setActiveImage(0);
  }, [post.id]);

  if (!images.length) return <figure className="forum-post-media is-empty" aria-label="这篇帖子没有图片" />;

  return (
    <figure className="forum-post-media">
      {images.map((image, index) => (
        <img
          key={`${post.id}-${image}-${index}`}
          className={`forum-gallery-image${index === activeImage ? " is-active" : ""}`}
          src={image}
          alt={index === activeImage ? post.title : ""}
          draggable="false"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ))}

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="forum-gallery-nav is-prev"
            aria-label="上一张图片"
            onClick={() => setActiveImage((current) => (current - 1 + images.length) % images.length)}
          >
            <CaretLeft weight="bold" />
          </button>
          <button
            type="button"
            className="forum-gallery-nav is-next"
            aria-label="下一张图片"
            onClick={() => setActiveImage((current) => (current + 1) % images.length)}
          >
            <CaretRight weight="bold" />
          </button>
        </>
      )}

      <div className="forum-gallery-dots" aria-label="图片页码">
        {images.map((image, index) => (
          <button
            key={`${post.id}-${image}-dot-${index}`}
            type="button"
            className={index === activeImage ? "is-active" : ""}
            aria-label={`第 ${index + 1} 张图片`}
            aria-current={index === activeImage}
            disabled={images.length < 2}
            onClick={() => setActiveImage(index)}
          />
        ))}
      </div>
    </figure>
  );
}

export function ForumDetail({
  post,
  activity,
  onBack,
  onToggleLike,
  onAddComment,
  returnLabel = "返回论坛",
}) {
  const bodyRef = useRef(null);
  const comments = activity.comments;
  const saved = useFavoriteSaved(post.id);

  useEffect(() => {
    document
      .querySelector('.app[data-tab="forum"] .home-tab-screen')
      ?.scrollTo({ top: 0, behavior: "instant" });
  }, [post.id]);

  const handleCommentAdded = () => {
    requestAnimationFrame(() => {
      const body = bodyRef.current;
      body?.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
    });
  };

  return (
    <article className="forum-detail-screen" aria-labelledby="forum-detail-title">
      <button className="forum-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        {returnLabel}
      </button>

      <ForumPostGallery post={post} />

      <section className="forum-post-panel" aria-label="帖子内容">
        <header className="forum-post-head">
          <div className="forum-post-toolbar">
            <span className="forum-post-tag" style={{ background: post.color, color: post.ink }}>
              {post.tag}
            </span>
            <button
              type="button"
              className={`favorite-button${saved ? " is-saved" : ""}`}
              aria-pressed={saved}
              onClick={() => toggleFavorite(favoriteFromForum(post, comments))}
            >
              <BookmarkSimple size={16} weight={saved ? "fill" : "regular"} />
              {saved ? "已收藏" : "收藏"}
            </button>
          </div>
          <h1 id="forum-detail-title">{post.title}</h1>
          <p>{post.summary}</p>
        </header>

        <div className="forum-post-body" ref={bodyRef}>
          {post.content.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          <div className="forum-post-comments">
            <div className="forum-comments-title">
              <strong>评论</strong>
              <span>{comments.length.toLocaleString("zh-CN")}</span>
            </div>
            {comments.length === 0 ? (
              <p className="forum-comments-empty">还没有评论，来发第一条。</p>
            ) : (
              <ul>
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <div className="forum-comment-head">
                      <MemberAvatar name={comment.author} size={26} />
                      <strong>{comment.author}</strong>
                      <time>{comment.createdAt}</time>
                    </div>
                    <p>{comment.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ForumActionBar
          post={post}
          activity={activity}
          onToggleLike={onToggleLike}
          onAddComment={(id, content) => {
            onAddComment(id, content);
            handleCommentAdded();
          }}
        />
      </section>
    </article>
  );
}

export function ForumBoard({ onDetailChange }) {
  const [posts, setPosts] = useState(POSTS);
  const [isComposing, setIsComposing] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [activity, setActivity] = useState(() =>
    Object.fromEntries(
      POSTS.map((post) => [post.id, { liked: false, comments: post.comments ?? [] }]),
    ),
  );
  const activePost = posts.find((post) => post.id === activeId);

  const toggleLike = useCallback((id) => {
    setActivity((current) => {
      const item = current[id] ?? { liked: false, comments: [] };
      return { ...current, [id]: { ...item, liked: !item.liked } };
    });
  }, []);

  const addComment = useCallback((id, content) => {
    setActivity((current) => {
      const item = current[id] ?? { liked: false, comments: [] };
      return {
        ...current,
        [id]: { ...item, comments: [...item.comments, createComment(content)] },
      };
    });
  }, []);

  const publishPost = useCallback((post) => {
    setPosts((current) => [post, ...current]);
    setActivity((current) => ({ ...current, [post.id]: { liked: false, comments: [] } }));
    setIsComposing(false);
  }, []);

  useEffect(() => {
    onDetailChange?.(Boolean(activePost) || isComposing);
  }, [activePost, isComposing, onDetailChange]);

  if (isComposing) {
    return <ForumComposer onBack={() => setIsComposing(false)} onPublish={publishPost} />;
  }

  if (activePost) {
    const activeActivity = activity[activePost.id] ?? { liked: false, comments: [] };

    return (
      <ForumDetail
        key={activePost.id}
        post={activePost}
        activity={activeActivity}
        onBack={() => setActiveId(null)}
        onToggleLike={toggleLike}
        onAddComment={addComment}
      />
    );
  }

  return (
    <>
      <ForumEffect />
      <button className="forum-compose-button" type="button" onClick={() => setIsComposing(true)}>
        <Plus size={18} weight="bold" />
        发布
      </button>
      <section className="forum-board" aria-label="社区帖子">
        <div className="forum-masonry">
          {posts.map((post) => {
            const postActivity = activity[post.id] ?? { liked: false, comments: post.comments ?? [] };

            return (
              <article
                key={post.id}
                className="forum-card"
                style={{
                  "--card-color": post.color,
                  "--card-ink": post.ink,
                  "--card-line": post.line,
                  "--card-accent": post.accent,
                }}
                tabIndex={0}
                role="button"
                aria-label={`展开帖子：${post.title}`}
                onClick={() => setActiveId(post.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveId(post.id);
                  }
                }}
              >
                {post.image && <ForumCardMedia image={post.image} />}
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
                    <b>{postActivity.comments.length.toLocaleString("zh-CN")}</b>
                  </span>
                  <span>
                    点赞量
                    <b>{(post.likes + (postActivity.liked ? 1 : 0)).toLocaleString("zh-CN")}</b>
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
