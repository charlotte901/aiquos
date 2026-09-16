import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookmarkSimple,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartBar,
  ChatsCircle,
  GraduationCap,
  MagnifyingGlass,
  SignOut,
  Trophy,
  Users,
} from "@phosphor-icons/react";
import { AccountSettings } from "./AccountSettings";
import { CaseDetail } from "./CaseArchive";
import { ForumDetail } from "./ForumBoard";
import { AwakeningReportModal } from "./AwakeningReport";
import { filterReportHistory } from "./report-model.js";
import { PROFILE_DETAILS } from "./profile-layout";
import { getViewportLayout } from "./layout";
import {
  removeFavorite,
  useFavorites,
} from "./favorites-store";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const TODAY = new Date(2026, 8, 6);
const CLASS_LIBRARY = [
  {
    id: "ai-class-1",
    code: "AI2026A",
    name: "AI 应用 1 班",
    term: "2026 秋季",
    students: 48,
    rank: 3,
    score: 92,
    average: 86.4,
  },
  {
    id: "ai-class-2",
    code: "AI2026B",
    name: "AI 应用 2 班",
    term: "2026 秋季",
    students: 45,
    rank: 7,
    score: 88,
    average: 84.1,
  },
  {
    id: "data-class",
    code: "DATA2026",
    name: "数据科学实验班",
    term: "2026 秋季",
    students: 52,
    rank: 12,
    score: 96,
    average: 89.3,
  },
];
const CLASS_SCORE_BINS = [
  { score: 5, people: 2, current: false },
  { score: 15, people: 4, current: false },
  { score: 25, people: 5, current: false },
  { score: 35, people: 7, current: false },
  { score: 45, people: 8, current: false },
  { score: 55, people: 7, current: false },
  { score: 65, people: 6, current: false },
  { score: 75, people: 4, current: false },
  { score: 85, people: 3, current: true },
  { score: 95, people: 2, current: false },
];
const WORKS = [
  {
    id: "city-flow",
    title: "城市通勤可视化",
    type: "数据叙事",
    year: "2026.08",
    summary: "把等待、换乘和拥挤程度压缩成一张可扫描的时间图。",
    detail: "从 14 天通勤记录中保留三类信息：等待时长、移动时长和车厢拥挤度。最终图形只使用冷热两级颜色，让读者三秒内找到高峰换乘点。",
    result: "完成 3 轮修正，可复述率 92%。",
  },
  {
    id: "prompt-playbook",
    title: "结构化提示词手册",
    type: "AI 方法",
    year: "2026.08",
    summary: "用目标、背景、约束、示例和验收标准拆开每一次提问。",
    detail: "整理 27 个真实任务提示，标注每次修改带来的输出变化。手册里保留了失败版本，方便对比模糊指令与结构化指令的差距。",
    result: "包含 12 个可复用模板和 9 个反例。",
  },
  {
    id: "campus-guide",
    title: "校园 AI 工作坊方案",
    type: "课程设计",
    year: "2026.07",
    summary: "以十分钟小任务开场，让参与者先做出结果，再理解原理。",
    detail: "方案把工作坊拆成任务演示、边界讨论、协作改造和复核展示四段。所有练习都要求参与者写下AI不能替代的判断点。",
    result: "服务 42 名同学，现场完成率 87%。",
  },
  {
    id: "weekly-report",
    title: "周报改写实验",
    type: "写作实验",
    year: "2026.07",
    summary: "同一份口语周报被改写成五个不同受众的版本。",
    detail: "分别面向项目组、管理层、新成员、外部合作者和未来的自己。实验重点是比较事实保留度、语气变化和决策信息的清晰度。",
    result: "沉淀出一份 6 项事实核对清单。",
  },
];
const RECORD_OFFSETS = [-11, -5, 0, 2, 6, 13, 21, 34];
const RECORD_LIBRARY = [
  [
    { type: "客观题", title: "AI 基础认知测评", score: "86 分", time: "10:20 · 16 分钟" },
    { type: "实操任务", title: "周报提示词优化", score: "优秀", time: "15:06 · 23 分钟" },
  ],
  [
    { type: "对话测评", title: "需求澄清对话", score: "82 分", time: "14:30 · 18 分钟" },
  ],
  [
    { type: "客观题", title: "提示词工程专项", score: "88 分", time: "10:12 · 15 分钟" },
  ],
];
const FUTURE_COMPREHENSIVE_RECORD = {
  type: "综合测评", title: "综合测评", score: "待完成", time: "08:30 · 34 分钟",
};

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildDemonstrationRecords(today = TODAY) {
  return Object.fromEntries(RECORD_OFFSETS.map((offset, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const status = offset <= 0 ? "已完成" : "已安排";
    const scheduled = offset === 13
      ? [FUTURE_COMPREHENSIVE_RECORD, ...RECORD_LIBRARY[index % RECORD_LIBRARY.length]]
      : RECORD_LIBRARY[index % RECORD_LIBRARY.length];
    return [
      dateKey(date),
      scheduled.map((record) => ({
        ...record,
        score: offset <= 0 ? record.score : "待完成",
        status,
      })),
    ];
  }));
}

const DEMONSTRATION_RECORDS = buildDemonstrationRecords();

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function buildProfileAssessmentRecords(assessmentHistory = []) {
  const records = {};
  for (const report of filterReportHistory(assessmentHistory, "all")) {
    if (report.unavailable) continue;
    const completed = new Date(report.completedAt);
    const key = dateKey(completed);
    const time = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(completed);
    const type = report.assessmentType === "comprehensive" ? "综合测评" : "客观题测评";
    if (!records[key]) records[key] = [];
    records[key].push({
      id: report.id,
      assessmentType: report.assessmentType,
      type,
      title: `${type} · 智核觉醒报告`,
      score: `${report.result.overallScore}%`,
      time: `${time} · ${report.answeredCount}/${report.totalQuestions}`,
      status: "已完成",
      report,
    });
  }
  return records;
}

function getCalendarCells(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function getClassInfo(activeClass) {
  if (!activeClass) return [];
  return [
    { label: "班级", value: activeClass.name, icon: GraduationCap },
    { label: "学期", value: activeClass.term, icon: ChatsCircle },
    { label: "班级人数", value: `${activeClass.students} 人`, icon: ChartBar },
    { label: "当前排名", value: `${activeClass.rank} / ${activeClass.students}`, icon: Trophy },
  ];
}

function getClassScoreBins(score) {
  return CLASS_SCORE_BINS.map((bin) => ({
    ...bin,
    current: score >= bin.score && score < bin.score + 10,
  }));
}

function useViewportLayout() {
  const [layout, setLayout] = useState(() =>
    getViewportLayout(document.documentElement.clientWidth, window.innerHeight),
  );

  useEffect(() => {
    const update = () => setLayout(
      getViewportLayout(document.documentElement.clientWidth, window.innerHeight),
    );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}

export function ProfileDetail({ id, assessmentHistory = [], onBack, onHome, busy }) {
  const detail = PROFILE_DETAILS[id];
  const viewportLayout = useViewportLayout();
  const realAssessmentRecords = buildProfileAssessmentRecords(assessmentHistory);
  const newestAssessmentKey = Object.keys(realAssessmentRecords)[0] ?? null;
  const initialRecordDate = newestAssessmentKey ? dateFromKey(newestAssessmentKey) : TODAY;
  const [cursor, setCursor] = useState({ year: initialRecordDate.getFullYear(), month: initialRecordDate.getMonth() });
  const [selected, setSelected] = useState(initialRecordDate);
  const [openWork, setOpenWork] = useState(0);
  const [favoriteId, setFavoriteId] = useState(null);
  const [favoriteActivity, setFavoriteActivity] = useState({});
  const [activeClass, setActiveClass] = useState(CLASS_LIBRARY[0]);
  const [classQuery, setClassQuery] = useState("");
  const [classSearch, setClassSearch] = useState(null);
  const [classNotice, setClassNotice] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const favorites = useFavorites();
  const selectedKey = dateKey(selected);
  const records = [
    ...(realAssessmentRecords[selectedKey] ?? []),
    ...(DEMONSTRATION_RECORDS[selectedKey] ?? []),
  ];
  const cells = getCalendarCells(cursor.year, cursor.month);
  const activeFavorite = favorites.find((item) => item.id === favoriteId);
  const activeFavoriteActivity = favoriteActivity[activeFavorite?.id] ?? {
    liked: false,
    comments: activeFavorite?.comments ?? [],
  };

  useEffect(() => {
    if (!newestAssessmentKey) return;
    const newestDate = dateFromKey(newestAssessmentKey);
    setCursor({ year: newestDate.getFullYear(), month: newestDate.getMonth() });
    setSelected(newestDate);
  }, [newestAssessmentKey]);

  const updateFavoriteActivity = (itemId, next) => {
    setFavoriteActivity((current) => ({ ...current, [itemId]: next }));
  };

  const searchClass = (event) => {
    event.preventDefault();
    const code = classQuery.trim();
    if (!code) {
      setClassSearch(null);
      setClassNotice("请输入班级口令后再搜索。");
      return;
    }

    const found = CLASS_LIBRARY.find((item) => item.code.toLowerCase() === code.toLowerCase());
    if (!found) {
      setClassSearch(null);
      setClassNotice(`没有找到口令为「${code}」的班级。`);
      return;
    }

    setClassSearch(found);
    setClassNotice(found.id === activeClass?.id ? "这是你当前加入的班级。" : "");
  };

  const joinClass = (classItem) => {
    setActiveClass(classItem);
    setClassSearch(null);
    setClassNotice(`已加入「${classItem.name}」。`);
  };

  const leaveClass = () => {
    const className = activeClass?.name;
    setActiveClass(null);
    setClassSearch(null);
    setClassNotice(className ? `已退出「${className}」。` : "已退出班级。");
  };

  const shiftMonth = (offset) => {
    const next = new Date(cursor.year, cursor.month + offset, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  if (id === "settings") {
    return (
      <main className="profile-detail-screen" style={{ "--detail-color": detail.color }} data-screen={id} aria-label={`${detail.title}详情`}>
        <button className="detail-back" type="button" onClick={onBack} disabled={busy} aria-label="返回个人中心">
          <ArrowLeft size={20} weight="bold" />
        </button>
        <AccountSettings variant="panel" onLogout={onHome} busy={busy} />
      </main>
    );
  }

  if (id === "favorites" && activeFavorite) {
    const detailChrome = {
      "data-layout": viewportLayout.compact ? "compact" : "desktop",
      style: { "--ui-scale": viewportLayout.unit },
    };

    if (activeFavorite.kind === "case") {
      return (
        <div className="profile-favorite-detail" {...detailChrome}>
          <CaseDetail
            key={activeFavorite.id}
            project={{
              title: activeFavorite.title,
              tags: activeFavorite.tags,
              year: activeFavorite.year,
              description: activeFavorite.summary,
            }}
            index={Number(activeFavorite.id.replace(/^case-/, ""))}
            onBack={() => setFavoriteId(null)}
            returnLabel="返回收藏"
          />
        </div>
      );
    }

    return (
      <div className="profile-favorite-detail" {...detailChrome}>
        <ForumDetail
          key={activeFavorite.id}
          post={activeFavorite}
          activity={activeFavoriteActivity}
          returnLabel="返回收藏"
          onBack={() => setFavoriteId(null)}
          onToggleLike={(itemId) => {
            const current = favoriteActivity[itemId] ?? { liked: false, comments: activeFavorite.comments ?? [] };
            updateFavoriteActivity(itemId, { ...current, liked: !current.liked });
          }}
          onAddComment={(itemId, content) => {
            const current = favoriteActivity[itemId] ?? { liked: false, comments: activeFavorite.comments ?? [] };
            const now = new Date();
            updateFavoriteActivity(itemId, {
              ...current,
              comments: [...current.comments, {
                id: `${now.getTime()}`,
                author: "你",
                createdAt: now.toLocaleString("zh-CN", { hour12: false }),
                content,
              }],
            });
          }}
        />
      </div>
    );
  }

  return (
    <main
      className="profile-detail-screen"
      style={{ "--detail-color": detail.color }}
      data-screen={id}
      aria-label={`${detail.title}详情`}
    >
      <button
        className="detail-back"
        type="button"
        onClick={onBack}
        disabled={busy}
        aria-label="返回个人中心"
      >
        <ArrowLeft size={20} weight="bold" />
      </button>
      {id === "organizations" && (
        <section className="profile-detail-panel" aria-label="我的组织">
          <header className="detail-panel-head organization-head">
            <div className="organization-title">
              <p>MY ORGANIZATION</p>
              <h1>我的组织</h1>
              <span>{activeClass ? `${activeClass.name} · ${activeClass.term}学期` : "尚未加入班级"}</span>
            </div>
            <form className="class-code-form" onSubmit={searchClass}>
              <div className="class-code-field">
                <input
                  value={classQuery}
                  onChange={(event) => setClassQuery(event.target.value)}
                  placeholder="输入班级口令，如 AI2026B"
                  aria-label="班级口令"
                />
                <button type="submit" aria-label="搜索班级" title="搜索班级">
                  <MagnifyingGlass size={19} weight="bold" />
                </button>
              </div>
              {activeClass && (
                <button type="button" className="class-exit-button" onClick={leaveClass}>
                  <SignOut size={17} weight="bold" />
                  退出班级
                </button>
              )}
            </form>
          </header>
          <div className="class-search-area" role="status">
            {classNotice && <p className="class-notice">{classNotice}</p>}
            {classSearch && classSearch.id !== activeClass?.id && (
              <div className="class-search-result">
                <div>
                  <strong>{classSearch.name}</strong>
                  <small>{classSearch.term} · {classSearch.students} 人 · 口令 {classSearch.code}</small>
                </div>
                <button type="button" onClick={() => joinClass(classSearch)}>加入班级</button>
              </div>
            )}
            {classSearch && classSearch.id === activeClass?.id && (
              <div className="class-search-result is-current">
                <div>
                  <strong>{classSearch.name}</strong>
                  <small>{classSearch.term} · {classSearch.students} 人 · 口令 {classSearch.code}</small>
                </div>
                <span className="class-joined-pill">已加入</span>
              </div>
            )}
          </div>
          {activeClass ? (
            <>
              <div className="class-info-grid">
                {getClassInfo(activeClass).map((item) => (
                  <article key={item.label}>
                    <item.icon size={20} weight="bold" />
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </article>
                ))}
              </div>
              <div
                className="rank-chart"
                role="img"
                aria-label={`班级能力分数分布：我的分数 ${activeClass.score} 分，平均分 ${activeClass.average} 分，排名 ${activeClass.rank} / ${activeClass.students}。`}
              >
                <div className="rank-callout" style={{ left: `${activeClass.score}%` }}>
                  <span>You: {activeClass.score}</span>
                  <small>avg {activeClass.average}</small>
                </div>
                <div className="rank-bars">
                  {getClassScoreBins(activeClass.score).map((bin) => (
                    <i key={bin.score} className={bin.current ? "is-current" : undefined} style={{ "--rank-height": `${25 + bin.people * 9}%` }}>
                      <b>{bin.people}</b>
                    </i>
                  ))}
                  <em style={{ left: `${activeClass.score}%` }} aria-hidden="true" />
                </div>
                <div className="rank-scale" aria-hidden="true">
                  {getClassScoreBins(activeClass.score).map((bin) => (
                    <span key={bin.score} className={bin.current ? "is-current" : undefined}>{bin.score}</span>
                  ))}
                </div>
                <div className="rank-track" aria-hidden="true">
                  <i style={{ width: `${activeClass.score}%` }} />
                  <b style={{ left: `${activeClass.score}%` }} />
                </div>
                <div className="rank-result">
                  <span>My Rank</span>
                  <strong>{activeClass.rank}<small>/{activeClass.students}</small></strong>
                </div>
              </div>
            </>
          ) : (
            <div className="organization-empty">
              <Users size={34} weight="bold" />
              <strong>还没有加入班级</strong>
              <p>输入老师提供的班级口令，搜索并加入后即可查看班级信息和排名。</p>
            </div>
          )}
        </section>
      )}

      {id === "works" && (
        <section className="profile-detail-panel" aria-label="我的作品">
          <header className="detail-panel-head">
            <p>MY WORKS</p>
            <h1>我的作品</h1>
            <span>点击展开作品的过程、方法与成果。</span>
          </header>
          <div className="work-accordion">
            {WORKS.map((work, index) => {
              const isOpen = openWork === index;
              return (
                <article key={work.id} className={isOpen ? "is-open" : undefined}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpenWork(isOpen ? -1 : index)}>
                    <span>
                      <strong>{work.title}</strong>
                      <small>{work.type} · {work.year}</small>
                    </span>
                    <CaretDown weight="bold" />
                  </button>
                  {isOpen && (
                    <div className="work-detail">
                      <p>{work.summary}</p>
                      <p>{work.detail}</p>
                      <strong>{work.result}</strong>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {id === "favorites" && (
        <section className="profile-favorites" aria-label="我的收藏">
          <div className="favorites-head">
            <div>
              <p>MY FAVORITES</p>
              <h1>我的收藏</h1>
            </div>
            <span>{favorites.length} 条内容</span>
          </div>
          {favorites.length === 0 ? (
            <div className="favorites-empty">
              <BookmarkSimple size={28} />
              <strong>还没有收藏</strong>
              <p>打开 Cases 或 Forum 详情页，点击“收藏”按钮，内容会显示在这里。</p>
            </div>
          ) : (
            <div className="forum-masonry favorites-masonry">
              {favorites.map((item) => (
                <article
                  key={item.id}
                  className="forum-card favorite-card"
                  style={{
                    "--card-color": item.color,
                    "--card-ink": item.ink,
                    "--card-line": item.line,
                    "--card-accent": item.accent,
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`展开收藏：${item.title}`}
                  onClick={() => setFavoriteId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setFavoriteId(item.id);
                    }
                  }}
                >
                  <span className="forum-card-media" aria-hidden="true">
                    <img src={item.image} alt="" loading="lazy" decoding="async" draggable="false" />
                  </span>
                  <div className="forum-card-body">
                    <span className="forum-tag">{item.tag}</span>
                    <h3 className="forum-card-title">{item.title}</h3>
                    <p className="forum-card-summary">{item.summary}</p>
                  </div>
                  <footer className="forum-card-meta">
                    <strong>{item.author}</strong>
                    <time>{item.createdAt}</time>
                    <span>评论量<b>{item.comments.length.toLocaleString("zh-CN")}</b></span>
                    <span>点赞量<b>{item.likes.toLocaleString("zh-CN")}</b></span>
                    <button
                      type="button"
                      className="favorite-remove"
                      aria-label={`取消收藏：${item.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFavorite(item.id);
                      }}
                    >
                      移除
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {id === "records" && (
        <section className="profile-detail-panel profile-records" aria-label="测评记录">
          <div className="records-calendar">
            <header className="calendar-header">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="上个月">
                <CaretLeft size={14} weight="bold" />
              </button>
              <h1>{MONTHS[cursor.month]}, {cursor.year}</h1>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="下个月">
                <CaretRight size={14} weight="bold" />
              </button>
            </header>
            <div className="calendar-week" aria-hidden="true">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="calendar-grid">
              {cells.map((date) => {
                const key = dateKey(date);
                const outside = date.getMonth() !== cursor.month;
                return (
                  <button
                    key={key}
                    type="button"
                    className={[outside && "is-outside", key === dateKey(TODAY) && "is-today"].filter(Boolean).join(" ") || undefined}
                    aria-pressed={key === selectedKey}
                    disabled={outside}
                    onClick={() => setSelected(date)}
                  >
                    <span>{date.getDate()}</span>
                    {(realAssessmentRecords[key]?.length || DEMONSTRATION_RECORDS[key]?.length) && <i className="has-record" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="records-panel">
            <header>
              <p>测评记录 · {selected.getMonth() + 1}月{selected.getDate()}日</p>
              <strong>{records.length} 条记录</strong>
            </header>
            {records.length ? (
              <ul>
                {records.map((record) => (
                  <li key={record.id ?? `${record.title}-${record.time}`} data-type={record.assessmentType}>
                    <span>{record.type}</span>
                    <div>
                      <h2>{record.title}</h2>
                      <p>{record.time} · {record.score} · {record.status}</p>
                      {record.report && (
                        <button
                          type="button"
                          className="record-report-button"
                          aria-haspopup="dialog"
                          onClick={() => setSelectedReport(record.report)}
                        >
                          觉醒报告
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="records-empty">
                <strong>当天暂无测评</strong>
                <p>选择左侧带圆点的日期，查看对应测评记录。</p>
              </div>
            )}
          </div>
        </section>
      )}
      <AwakeningReportModal
        report={selectedReport}
        open={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
      />
    </main>
  );
}
