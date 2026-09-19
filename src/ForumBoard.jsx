import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ForumCard, ForumCardMedia, MemberAvatar } from "./forum-card";
import { resolveMember } from "./community-members";
import { favoriteFromForum, toggleFavorite, useFavoriteSaved } from "./favorites-store";
import { useAccount } from "./account-store";
import {
  useForumBoard,
  useFieldInk,
  useReveal,
  topicWord,
  createComment,
  createForumTimestamp,
  readFileAsDataUrl,
} from "./forum-board";
import { GalleryBoard } from "./forum-gallery";

const FORUM_TAG_COLORS = {
  学习笔记: { color: "#f568a3", ink: "#ffffff", accent: "#ffd7ec" },
  实战案例: { color: "#247cf1", ink: "#ffffff", accent: "#c8e0ff" },
  作品分享: { color: "#00a96d", ink: "#ffffff", accent: "#bdf2d8" },
  讨论场: { color: "#7438e5", ink: "#ffffff", accent: "#e0ccff" },
  每周精选: { color: "#ffb703", ink: "#17150f", accent: "#fff0c2" },
};

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
  const tags = useMemo(
    () => [...Object.entries(FORUM_TAG_COLORS).map(([name, value]) => ({ name, ...value })), ...customTags],
    [customTags],
  );
  const tag = tags[Math.min(tagIndex, tags.length - 1)];
  const previewIndex = Math.min(activeImage, Math.max(0, images.length - 1));
  const canPublish = [title, summary, content].every((value) => value.trim());

  // The left pane shows the actual card the reader is about to publish, so it
  // fills in as they type instead of being a frame that only means something
  // once a picture is chosen.
  const previewPost = useMemo(
    () => ({
      id: "compose-preview",
      tag: tag.name,
      title: title.trim() || "标题会出现在这里",
      summary: summary.trim() || "梗概会出现在这里，用来告诉读者这篇值不值得点开。",
      author,
      createdAt,
      views: 0,
      likes: 0,
      color: tag.color,
      ink: tag.ink,
      line: tag.line ?? tag.ink,
      accent: tag.accent,
      art: "dots",
      imageRatio: "4 / 3",
    }),
    [tag, title, summary, author, createdAt],
  );

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
      art: "dots",
      imageRatio: "4 / 3",
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
            <span className="forum-compose-media-empty">
              <span className="forum-compose-card-preview">
                <ForumCard post={previewPost} interactive={false} className="is-preview" />
              </span>
            </span>
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

  if (!images.length) {
    // No photograph — show the topic's pattern rather than an empty frame, so a
    // text-only post still opens with its own cover.
    return (
      <figure className="forum-post-media is-art" aria-label="这篇帖子没有图片">
        <ForumCardMedia
          art={post.art}
          color={post.color}
          ink={post.ink}
          accent={post.accent}
          ratio="1 / 1"
        />
      </figure>
    );
  }

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
  onOpenPost,
  related = [],
  returnLabel = "返回论坛",
}) {
  const bodyRef = useRef(null);
  const comments = activity.comments;
  const saved = useFavoriteSaved(post.id);
  const member = resolveMember(post.author);

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
    <article
      className="forum-detail-screen is-immersive"
      aria-labelledby="forum-detail-title"
      style={{
        "--detail-art": post.image ? `url("${post.image}")` : undefined,
        "--detail-ground": post.color ?? "#171512",
      }}
    >
      <div className="forum-detail-blur" aria-hidden="true" />
      <div className="forum-detail-veil" aria-hidden="true" />

      <button className="forum-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        {returnLabel}
      </button>

      <ForumPostGallery post={post} />

      <section className="forum-post-panel" aria-label="帖子内容">
        <header className="forum-post-head">
          <nav className="forum-detail-breadcrumb" aria-label="讨论路径">
            <button type="button" onClick={onBack}>智核社区</button>
            <span aria-hidden="true">/</span>
            <span className="breadcrumb-tag">{post.tag}</span>
            <span aria-hidden="true">/</span>
            <span className="breadcrumb-current">讨论详情</span>
          </nav>

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

          <div className="forum-detail-author-card">
            <MemberAvatar name={post.author} size={42} />
            <div className="forum-detail-author-body">
              <div className="author-name-row">
                <strong>{post.author}</strong>
                {member?.role && <span className="author-role-tag">{member.role}</span>}
              </div>
              <div className="author-meta-row">
                <time>{post.createdAt}</time>
                <i aria-hidden="true">•</i>
                <span>{post.views.toLocaleString("zh-CN")} 次阅读</span>
                <i aria-hidden="true">•</i>
                <span>{comments.length} 条讨论</span>
              </div>
            </div>
          </div>

          <div className="forum-detail-summary-quote">
            <p>{post.summary}</p>
          </div>
        </header>

        <div className="forum-post-body" ref={bodyRef}>
          {post.content.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          <div className="forum-post-comments">
            <div className="forum-comments-title">
              <strong>讨论与见解</strong>
              <span>{comments.length.toLocaleString("zh-CN")} 条回复</span>
            </div>
            {comments.length === 0 ? (
              <p className="forum-comments-empty">还没有评论，写下你的第一个实战见解。</p>
            ) : (
              <ul>
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <div className="forum-comment-head">
                      <MemberAvatar name={comment.author} size={28} />
                      <strong>{comment.author}</strong>
                      <time>{comment.createdAt}</time>
                    </div>
                    <p>{comment.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {onOpenPost && (
            <section className="forum-related" aria-label="相关讨论">
              <div className="forum-related-title">
                <strong>同话题推荐</strong>
                <span>{post.tag}</span>
              </div>
              {related.length ? (
                <div className="forum-related-rail">
                  {related.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="forum-related-card"
                      style={{ "--related-color": item.color, "--related-ink": item.ink }}
                      onClick={() => onOpenPost(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <small>
                        {item.author} · {item.likes.toLocaleString("zh-CN")} 赞
                      </small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="forum-related-empty">这个话题下暂时只有这一篇，去看看其他讨论。</p>
              )}
            </section>
          )}
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

/** The Forum tab.
 *
 * This is the orchestrator only: it owns which surface is on screen (board,
 * detail, composer) and hands the board's state to the wall. The state itself
 * lives in `useForumBoard`, so a filter, a like or a comment survives going into
 * a post and coming back. */
export function ForumBoard({ onDetailChange }) {
  const board = useForumBoard();
  const [isComposing, setIsComposing] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const activePost = board.posts.find((post) => post.id === activeId);

  const revealRef = useReveal([
    board.visiblePosts.length,
    board.activeTopic,
    board.activeMember,
    board.sort,
    board.query,
  ]);

  // The field's ink has to reach the shell so the header's own labels can flip
  // when the dark wall (or a topic's colour) scrolls under them.
  useFieldInk(board.fieldColor);

  const field = useMemo(
    () => ({
      ...board,
      revealRef,
      topicWord: topicWord(board.activeTopic),
    }),
    [board, revealRef],
  );

  useEffect(() => {
    onDetailChange?.(Boolean(activePost) || isComposing);
  }, [activePost, isComposing, onDetailChange]);

  if (isComposing) {
    return (
      <ForumComposer
        onBack={() => setIsComposing(false)}
        onPublish={(post) => {
          board.publishPost(post);
          setIsComposing(false);
        }}
      />
    );
  }

  if (activePost) {
    return (
      <ForumDetail
        key={activePost.id}
        post={activePost}
        activity={board.activityFor(activePost)}
        related={board.relatedTo(activePost)}
        onBack={() => setActiveId(null)}
        onOpenPost={setActiveId}
        onToggleLike={board.toggleLike}
        onAddComment={board.addComment}
      />
    );
  }

  return (
    <div className="forum-board-root" style={{ "--forum-board-field": board.fieldColor }}>
      <button className="forum-compose-button" type="button" onClick={() => setIsComposing(true)} aria-label="发布新讨论">
        <Plus size={16} weight="bold" />
        <span>发布讨论</span>
      </button>

      <GalleryBoard
        board={field}
        onOpen={setActiveId}
        onCompose={() => setIsComposing(true)}
      />
    </div>
  );
}
