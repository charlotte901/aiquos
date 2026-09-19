import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  Eye,
  Flame,
  Heart,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  TrendUp,
  User,
  Users,
  X,
} from "@phosphor-icons/react";
import { MemberAvatar } from "./forum-card";
import { MEMBERS, resolveMember } from "./community-members";
import { favoriteFromForum, toggleFavorite, useFavoriteSaved } from "./favorites-store";

const PER_PAGE = 5;

const HOT_TOPICS = [
  { tag: "测评研究", title: "AI 能力分级测评体系设计与落地", views: "3,627 浏览", query: "分级" },
  { tag: "实战案例", title: "30 道提示词工程情景陷阱题", views: "2,871 浏览", query: "陷阱" },
  { tag: "作品分享", title: "五维雷达图动态展开与弱项微震提醒", views: "2,418 浏览", query: "雷达图" },
  { tag: "学习笔记", title: "从 0 到 1 组织一场 200 人 AI 测评周", views: "1,988 浏览", query: "测评周" },
  { tag: "前沿观察", title: "测评指标从准确率升级为可修正性", views: "1,842 浏览", query: "可修正性" },
];

/** Individual Discussion Thread Card in the feed */
function ThreadCard({ post, activity, onOpen, onToggleLike, onSelectTag, onSelectMember }) {
  const comments = activity?.comments?.length ?? post.comments?.length ?? 0;
  const likes = post.likes + (activity?.liked ? 1 : 0);
  const liked = Boolean(activity?.liked);
  const saved = useFavoriteSaved(post.id);
  const member = resolveMember(post.author);

  return (
    <article className="forum-thread-card" tabIndex={0} aria-labelledby={`thread-title-${post.id}`}>
      {/* Thread Card Header */}
      <header className="thread-header">
        <div className="thread-author-wrap">
          <button
            type="button"
            className="thread-author-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSelectMember?.(post.author);
            }}
            title={`查看 ${post.author} 的全部讨论`}
          >
            <MemberAvatar name={post.author} size={36} />
            <div className="thread-author-meta">
              <span className="thread-author-name">{post.author}</span>
              {member?.role && <span className="thread-author-role">{member.role}</span>}
            </div>
          </button>
        </div>

        <div className="thread-header-right">
          <time className="thread-time" dateTime={post.createdAt}>{post.createdAt}</time>
          <button
            type="button"
            className="thread-tag-badge"
            style={{ "--badge-color": post.color, "--badge-ink": post.ink }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectTag?.(post.tag);
            }}
            title={`筛选分类：${post.tag}`}
          >
            {post.tag}
          </button>
        </div>
      </header>

      {/* Thread Card Body */}
      <div className="thread-main">
        <div className="thread-text">
          <h2
            id={`thread-title-${post.id}`}
            className="thread-title"
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
          </h2>
          <p className="thread-summary" onClick={() => onOpen(post.id)}>
            {post.summary}
          </p>
        </div>

        {post.image && (
          <div className="thread-thumbnail" onClick={() => onOpen(post.id)} aria-hidden="true">
            <img src={post.image} alt="" loading="lazy" decoding="async" />
          </div>
        )}
      </div>

      {/* Thread Card Footer Interaction Bar */}
      <footer className="thread-actions">
        <div className="thread-action-group">
          <button
            type="button"
            className={`thread-btn thread-like-btn${liked ? " is-liked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike?.(post.id);
            }}
            aria-label={liked ? "取消赞" : "赞同"}
            aria-pressed={liked}
          >
            <Heart size={16} weight={liked ? "fill" : "regular"} />
            <span>{likes.toLocaleString("zh-CN")}</span>
          </button>

          <button
            type="button"
            className="thread-btn thread-comment-btn"
            onClick={() => onOpen(post.id)}
            aria-label={`查看评论 (${comments})`}
          >
            <ChatCircleDots size={16} />
            <span>{comments.toLocaleString("zh-CN")}</span>
          </button>

          <span className="thread-stat-views" title={`浏览量 ${post.views.toLocaleString("zh-CN")}`}>
            <Eye size={16} />
            <span>{post.views.toLocaleString("zh-CN")}</span>
          </span>
        </div>

        <div className="thread-action-right">
          <button
            type="button"
            className={`thread-bookmark-btn${saved ? " is-saved" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(favoriteFromForum(post, activity?.comments ?? []));
            }}
            aria-label={saved ? "已收藏" : "收藏"}
            title={saved ? "已收藏至个人中心" : "收藏帖子"}
          >
            <BookmarkSimple size={16} weight={saved ? "fill" : "regular"} />
            <span>{saved ? "已收藏" : "收藏"}</span>
          </button>

          <button
            type="button"
            className="thread-open-btn"
            onClick={() => onOpen(post.id)}
            aria-label={`展开阅读：${post.title}`}
          >
            <span>阅读讨论</span>
            <ArrowUpRight size={14} weight="bold" />
          </button>
        </div>
      </footer>
    </article>
  );
}

/** Main Community Forum Board: Hero banner, channel tabs, two-column layout */
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

  // Top 5 contributors from members list
  const topContributors = useMemo(() => {
    return [...MEMBERS].sort((a, b) => b.likes - a.likes).slice(0, 5);
  }, []);

  const totalInteractions = useMemo(() => {
    return board.posts.reduce((acc, p) => acc + p.views + p.likes, 0);
  }, [board.posts]);

  return (
    <div className="forum-community-board" data-forum-field>
      {/* ── 1. Forum Hero Header ────────────────────────────────────────── */}
      <header className="community-hero">
        <div className="community-hero-content">
          <div className="community-hero-badge">
            <span className="hero-badge-dot" aria-hidden="true" />
            <span className="hero-badge-title">AIQUOS 智核社区</span>
            <span className="hero-badge-tag">AI 能力与实践讨论场</span>
          </div>

          <h1 className="community-hero-heading">
            真实任务研讨 · 实践经验沉淀
          </h1>

          <p className="community-hero-subtitle">
            连接 12 位实战导师与在册学员。从精准提问、情境陷阱，到把想法做成作品的实践复盘。
          </p>

          <div className="community-stats-bar" role="group" aria-label="社区数据统计">
            <div className="stat-pill">
              <Sparkle size={14} weight="fill" />
              <span><b>{board.posts.length}</b> 篇深度复盘</span>
            </div>
            <div className="stat-pill">
              <Users size={14} weight="fill" />
              <span><b>{MEMBERS.length}</b> 位实战导师</span>
            </div>
            <div className="stat-pill">
              <Flame size={14} weight="fill" />
              <span><b>{(totalInteractions / 1000).toFixed(1)}k+</b> 次互动交流</span>
            </div>
          </div>
        </div>

        {onCompose && (
          <div className="community-hero-action">
            <button
              type="button"
              className="hero-compose-pill"
              onClick={onCompose}
              aria-label="发起新讨论"
            >
              <Plus size={18} weight="bold" />
              <span>发起新讨论</span>
            </button>
          </div>
        )}
      </header>

      {/* ── 2. Channel Category Navigation Tabs ─────────────────────────── */}
      <nav className="community-channels-nav" aria-label="主题分类">
        <button
          type="button"
          className={`channel-pill${board.activeTopic === null ? " is-active" : ""}`}
          onClick={() => {
            setPage(0);
            board.setActiveTopic(null);
          }}
        >
          <span className="channel-pill-name">全部讨论</span>
          <span className="channel-pill-count">{board.posts.length}</span>
        </button>

        {board.topics.map((topic) => {
          const isSelected = board.activeTopic === topic.name;
          return (
            <button
              key={topic.name}
              type="button"
              className={`channel-pill${isSelected ? " is-active" : ""}`}
              style={{
                "--channel-color": topic.color,
                "--channel-ink": topic.ink,
              }}
              onClick={() => {
                setPage(0);
                board.setActiveTopic(isSelected ? null : topic.name);
              }}
            >
              <i className="channel-pill-dot" style={{ background: topic.color }} aria-hidden="true" />
              <span className="channel-pill-name">{topic.name}</span>
              <span className="channel-pill-count">{board.topicCounts[topic.name] ?? 0}</span>
            </button>
          );
        })}
      </nav>

      {/* ── 3. Main Two-Column Community Layout ─────────────────────────── */}
      <div className="community-grid">
        {/* ── Left Column: Discussion Thread Stream ─────────────────────── */}
        <main className="community-feed-column">
          {/* Feed Toolbar: Sorter tabs + Search input */}
          <div className="feed-toolbar" role="toolbar" aria-label="信息流排序与检索">
            <div className="feed-sorters">
              <button
                type="button"
                className={`feed-sort-tab${board.sort === "new" ? " is-active" : ""}`}
                onClick={() => {
                  setPage(0);
                  board.setSort("new");
                }}
              >
                最新发布
              </button>
              <button
                type="button"
                className={`feed-sort-tab${board.sort === "hot" ? " is-active" : ""}`}
                onClick={() => {
                  setPage(0);
                  board.setSort("hot");
                }}
              >
                最热讨论
              </button>
            </div>

            <div className="feed-search-wrap">
              <label className="feed-search-input">
                <MagnifyingGlass size={15} />
                <input
                  type="search"
                  value={board.query}
                  placeholder="搜索标题、内容、作者..."
                  aria-label="搜索帖子"
                  onChange={(e) => {
                    setPage(0);
                    board.setQuery(e.target.value);
                  }}
                />
                {board.query && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => board.setQuery("")}
                    aria-label="清除搜索"
                  >
                    <X size={12} weight="bold" />
                  </button>
                )}
              </label>
            </div>
          </div>

          {/* Active Filter Notice */}
          {(board.activeMember || board.activeTopic || board.query) && (
            <div className="feed-filter-bar">
              <span className="filter-hint">当前筛选：</span>
              {board.activeTopic && (
                <span className="filter-chip">
                  话题：{board.activeTopic}
                  <button type="button" onClick={() => board.setActiveTopic(null)} aria-label="清除话题筛选">
                    <X size={12} />
                  </button>
                </span>
              )}
              {board.activeMember && (
                <span className="filter-chip">
                  作者：{board.activeMember}
                  <button type="button" onClick={() => board.setActiveMember(null)} aria-label="清除作者筛选">
                    <X size={12} />
                  </button>
                </span>
              )}
              {board.query && (
                <span className="filter-chip">
                  关键词：{board.query}
                  <button type="button" onClick={() => board.setQuery("")} aria-label="清除关键词筛选">
                    <X size={12} />
                  </button>
                </span>
              )}
              <button
                type="button"
                className="filter-clear-all"
                onClick={() => board.clearFilters()}
              >
                清除全部
              </button>
            </div>
          )}

          {/* Thread List */}
          {shownPosts.length > 0 ? (
            <div className="thread-stream">
              {shownPosts.map((post) => (
                <ThreadCard
                  key={post.id}
                  post={post}
                  activity={board.activityFor(post)}
                  onOpen={onOpen}
                  onToggleLike={board.toggleLike}
                  onSelectTag={(tag) => {
                    setPage(0);
                    board.setActiveTopic(tag);
                  }}
                  onSelectMember={(author) => {
                    setPage(0);
                    board.setActiveMember(author);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="community-empty">
              <Sparkle size={36} weight="duotone" />
              <h3>未找到相关讨论帖</h3>
              <p>尝试调整搜索词或选择其他话题分类。</p>
              <button
                type="button"
                className="empty-reset-btn"
                onClick={() => board.clearFilters()}
              >
                查看全部讨论
              </button>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <nav className="community-pagination" aria-label="分页导航">
              <button
                type="button"
                className="page-btn page-nav-btn"
                disabled={safePage === 0}
                onClick={() => goto(safePage - 1)}
                aria-label="上一页"
              >
                <CaretLeft size={16} weight="bold" />
                <span>上一页</span>
              </button>

              <div className="page-numbers">
                {Array.from({ length: pages }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`page-btn page-num-btn${i === safePage ? " is-active" : ""}`}
                    onClick={() => goto(i)}
                    aria-label={`第 ${i + 1} 页`}
                    aria-current={i === safePage ? "page" : undefined}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="page-btn page-nav-btn"
                disabled={safePage >= pages - 1}
                onClick={() => goto(safePage + 1)}
                aria-label="下一页"
              >
                <span>下一页</span>
                <CaretRight size={16} weight="bold" />
              </button>
            </nav>
          )}
        </main>

        {/* ── Right Column: Community Sidebar Widgets ───────────────────── */}
        <aside className="community-sidebar-column" aria-label="社区边栏推荐">
          {/* Widget 1: Community Guide */}
          <section className="sidebar-card sidebar-guide-card">
            <div className="sidebar-card-head">
              <Sparkle size={18} weight="fill" className="guide-icon" />
              <h3>社区交流准则</h3>
            </div>
            <p className="sidebar-guide-copy">
              智核社区专注于 AI 测评复盘、提示词陷阱研究与真实业务流落地。坚持实事求是，鼓励提供真实数据与对比样例。
            </p>
            <div className="sidebar-guide-tags">
              <span>#真实工作流#</span>
              <span>#可复现经验#</span>
              <span>#拒绝对错二极管#</span>
            </div>
          </section>

          {/* Widget 2: Trending Topics */}
          <section className="sidebar-card sidebar-trending-card">
            <div className="sidebar-card-head">
              <Flame size={18} weight="fill" className="flame-icon" />
              <h3>热门讨论榜</h3>
            </div>
            <ul className="trending-list">
              {HOT_TOPICS.map((item, index) => (
                <li key={item.title}>
                  <button
                    type="button"
                    className="trending-item-btn"
                    onClick={() => {
                      setPage(0);
                      board.setQuery(item.query);
                    }}
                    title={`搜索：${item.title}`}
                  >
                    <span className={`trending-rank rank-${index + 1}`}>
                      0{index + 1}
                    </span>
                    <div className="trending-info">
                      <span className="trending-title">{item.title}</span>
                      <span className="trending-views">{item.views}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Widget 3: Top Contributors / Mentors */}
          <section className="sidebar-card sidebar-contributors-card">
            <div className="sidebar-card-head">
              <Users size={18} weight="fill" className="users-icon" />
              <h3>活跃导师与贡献榜</h3>
            </div>
            <ul className="contributors-list">
              {topContributors.map((user) => (
                <li key={user.name}>
                  <button
                    type="button"
                    className="contributor-item-btn"
                    onClick={() => {
                      setPage(0);
                      board.setActiveMember(user.nickname);
                    }}
                    title={`查看 ${user.nickname} 的帖子`}
                  >
                    <MemberAvatar name={user.name} size={34} />
                    <div className="contributor-info">
                      <div className="contributor-name-row">
                        <strong>{user.nickname}</strong>
                        <span className="contributor-likes">
                          <Heart size={12} weight="fill" />
                          {user.likes}
                        </span>
                      </div>
                      <small>{user.role}</small>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Widget 4: AIQUOS Pro Tip */}
          <section className="sidebar-card sidebar-tip-card">
            <div className="sidebar-card-head">
              <CheckCircle size={18} weight="fill" className="tip-icon" />
              <h3>实战小建议</h3>
            </div>
            <blockquote className="sidebar-tip-quote">
              “写提示词最怕面面俱到。好的提示词只规定目标、边界与验收标准，把中间的推理步骤留给模型自行展开。”
            </blockquote>
            <cite className="sidebar-tip-cite">AIQUOS 智核研讨室 · 2026</cite>
          </section>
        </aside>
      </div>
    </div>
  );
}
