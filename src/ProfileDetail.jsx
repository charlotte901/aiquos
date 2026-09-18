import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  BookmarkSimple,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartBar,
  ChatsCircle,
  Article,
  GraduationCap,
  Image,
  Minus,
  Plus,
  MagnifyingGlass,
  SignOut,
  Stack,
  Trophy,
  Users,
} from "@phosphor-icons/react";
import { AccountSettings } from "./AccountSettings";
import { CaseDetail } from "./CaseArchive";
import { ForumDetail } from "./ForumBoard";
import { AwakeningReportModal } from "./AwakeningReport";
import { filterReportHistory } from "./report-model.js";
import { useAccount } from "./account-store";
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
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
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
    category: "article",
    title: "城市通勤可视化",
    type: "数据叙事",
    year: "2026.08",
    summary: "把等待、换乘和拥挤程度压缩成一张可扫描的时间图。",
    detail: "从 14 天通勤记录中保留三类信息：等待时长、移动时长和车厢拥挤度。最终图形只使用冷热两级颜色，让读者三秒内找到高峰换乘点。",
    result: "完成 3 轮修正，可复述率 92%。",
  },
  {
    id: "prompt-playbook",
    category: "prompt",
    title: "结构化提示词手册",
    type: "AI 方法",
    year: "2026.08",
    summary: "用目标、背景、约束、示例和验收标准拆开每一次提问。",
    detail: "整理 27 个真实任务提示，标注每次修改带来的输出变化。手册里保留了失败版本，方便对比模糊指令与结构化指令的差距。",
    result: "包含 12 个可复用模板和 9 个反例。",
  },
  {
    id: "campus-guide",
    category: "article",
    title: "校园 AI 工作坊方案",
    type: "课程设计",
    year: "2026.07",
    summary: "以十分钟小任务开场，让参与者先做出结果，再理解原理。",
    detail: "方案把工作坊拆成任务演示、边界讨论、协作改造和复核展示四段。所有练习都要求参与者写下AI不能替代的判断点。",
    result: "服务 42 名同学，现场完成率 87%。",
  },
  {
    id: "weekly-report",
    category: "prompt",
    title: "周报改写实验",
    type: "写作实验",
    year: "2026.07",
    summary: "同一份口语周报被改写成五个不同受众的版本。",
    detail: "分别面向项目组、管理层、新成员、外部合作者和未来的自己。实验重点是比较事实保留度、语气变化和决策信息的清晰度。",
    result: "沉淀出一份 6 项事实核对清单。",
  },
];
const PROMPT_WORKS = WORKS.filter((work) => work.category === "prompt");
const ARTICLE_WORKS = WORKS.filter((work) => work.category === "article");
const WORK_IMAGE_CARDS = [
  {
    id: "image-city",
    title: "城市流动",
    tag: "Data Story",
    image: "/assets/cases/21.webp",
    x: 2,
    y: 12,
    width: 32,
    rotation: -7,
    z: 2,
  },
  {
    id: "image-prompt",
    title: "提示词卡组",
    tag: "Prompt Lab",
    image: "/assets/cases/7.webp",
    x: 17,
    y: 40,
    width: 22,
    rotation: 4,
    z: 4,
  },
  {
    id: "image-workshop",
    title: "工作坊现场",
    tag: "Learning",
    image: "/assets/cases/12.webp",
    x: 42,
    y: 7,
    width: 24,
    rotation: -3,
    z: 5,
  },
  {
    id: "image-report",
    title: "周报改写",
    tag: "Writing",
    image: "/assets/cases/17.webp",
    x: 63,
    y: 9,
    width: 34,
    rotation: 5,
    z: 3,
  },
  {
    id: "image-collage",
    title: "图像拼贴",
    tag: "Visual",
    image: "/assets/cases/2.webp",
    x: 62,
    y: 50,
    width: 26,
    rotation: 8,
    z: 1,
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

function clampImageCard(card, board) {
  const angle = Math.abs(card.rotation) * Math.PI / 180;
  const aspect = card.ratio || 4 / 3;
  const cardWidth = (card.width / 100) * board.width;
  const cardHeight = cardWidth / aspect;
  const boundWidth = Math.abs(cardWidth * Math.cos(angle)) + Math.abs(cardHeight * Math.sin(angle));
  const boundHeight = Math.abs(cardWidth * Math.sin(angle)) + Math.abs(cardHeight * Math.cos(angle));
  const marginX = ((boundWidth - cardWidth) / 2 / board.width) * 100;
  const marginY = ((boundHeight - cardHeight) / 2 / board.height) * 100;
  const minX = marginX;
  const minY = marginY;
  const maxX = Math.max(minX, 100 - card.width - marginX);
  const maxY = Math.max(minY, 100 - ((cardWidth / aspect) / board.height) * 100 - marginY);
  const nextX = Number.isFinite(card.x) ? card.x : minX;
  const nextY = Number.isFinite(card.y) ? card.y : minY;

  return {
    ...card,
    x: Math.max(minX, Math.min(maxX, nextX)),
    y: Math.max(minY, Math.min(maxY, nextY)),
  };
}

function fitImageCard(card, board) {
  const angle = Math.abs(card.rotation) * Math.PI / 180;
  const aspect = card.ratio || 4 / 3;
  const verticalFactor = (Math.abs(Math.sin(angle)) + Math.abs(Math.cos(angle))) / aspect;
  const maxWidthPercent = ((board.height * .78) / board.width) * 100 / verticalFactor;

  return { ...card, width: Math.min(card.width, maxWidthPercent) };
}

function createImageBoardControls(cards, setCards, drag, setDrag, boardRef) {
  return {
    updateImageRatio(id, ratio) {
      const board = boardRef.current?.getBoundingClientRect();
      if (!board || !Number.isFinite(ratio) || ratio <= 0) return;

      setCards((current) => current.map((card) => {
        if (card.id !== id) return card;
        const fitted = fitImageCard({ ...card, ratio }, board);
        return clampImageCard(fitted, board);
      }));
    },
    resizeImageCard(id, direction) {
      const board = boardRef.current?.getBoundingClientRect();
      if (!board) return;

      setCards((current) => current.map((card) => {
        if (card.id !== id) return card;
        const width = Math.max(16, Math.min(46, card.width + (direction === "larger" ? 4 : -4)));
        const fitted = fitImageCard({ ...card, width }, board);
        return clampImageCard(fitted, board);
      }));
    },
    beginImageDrag(event, id) {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({
        id,
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
      });
    },
    moveImageDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;

      const board = boardRef.current?.getBoundingClientRect();
      if (!board) return;

      const offsetX = ((event.clientX - drag.pointerX) / board.width) * 100;
      const offsetY = ((event.clientY - drag.pointerY) / board.height) * 100;
      const dragId = drag.id;

      setCards((current) => current.map((card) => {
        if (card.id !== dragId) return card;
        return clampImageCard({ ...card, x: card.x + offsetX, y: card.y + offsetY }, board);
      }));
      setDrag({ ...drag, pointerX: event.clientX, pointerY: event.clientY });
    },
    endImageDrag(event) {
      if (drag?.pointerId === event.pointerId) setDrag(null);
    },
    rotateImageCard(id, offset) {
      setCards((current) => current.map((card) => (
        card.id === id ? { ...card, rotation: card.rotation + offset } : card
      )));
    },
    moveImageLayer(id, direction) {
      setCards((current) => {
        const target = current.find((card) => card.id === id);
        if (!target) return current;

        const nextLayer = direction === "front"
          ? Math.max(...current.map((card) => card.z)) + 1
          : Math.min(...current.map((card) => card.z)) - 1;

        return [...current]
          .map((card) => (card.id === id ? { ...card, z: nextLayer } : card))
          .sort((left, right) => left.z - right.z)
          .map((card, index) => ({ ...card, z: index + 1 }));
      });
    },
  };
}

const FAVORITE_IMAGE_LAYOUTS = [
  { x: 3, y: 12, width: 31, rotation: -7 },
  { x: 26, y: 40, width: 23, rotation: 5 },
  { x: 39, y: 7, width: 27, rotation: -3 },
  { x: 59, y: 16, width: 34, rotation: 4 },
  { x: 58, y: 50, width: 27, rotation: 8 },
  { x: 5, y: 52, width: 22, rotation: 3 },
  { x: 31, y: 26, width: 25, rotation: -5 },
];

function getFavoriteImageCards(favorites) {
  const cards = [];
  favorites.forEach((favorite) => {
    const images = favorite.images?.length ? favorite.images : favorite.image ? [favorite.image] : [];

    images.forEach((image, imageIndex) => {
      const index = cards.length;
      cards.push({
        id: `${favorite.id}-${imageIndex}`,
        image,
        title: "收藏图片",
        ...FAVORITE_IMAGE_LAYOUTS[index % FAVORITE_IMAGE_LAYOUTS.length],
        z: index + 1,
      });
    });
  });
  return cards;
}

/** 图片板块摆放按账号持久化：aiquos-board:<板块>:<accountId>。 */
function loadBoardLayout(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveBoardLayout(key, map) {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* 存储不可用时仅保留内存态 */
  }
}

function boardLayoutMap(cards) {
  const map = {};
  cards.forEach((card) => {
    map[card.id] = { x: card.x, y: card.y, width: card.width, rotation: card.rotation, z: card.z, ratio: card.ratio };
  });
  return map;
}

function applyBoardLayout(cards, map) {
  return cards.map((card) => {
    const saved = map[card.id];
    if (!saved) return card;
    return {
      ...card,
      x: Number.isFinite(saved.x) ? saved.x : card.x,
      y: Number.isFinite(saved.y) ? saved.y : card.y,
      width: Number.isFinite(saved.width) && saved.width > 0 ? saved.width : card.width,
      rotation: Number.isFinite(saved.rotation) ? saved.rotation : card.rotation,
      z: Number.isFinite(saved.z) ? saved.z : card.z,
      ratio: Number.isFinite(saved.ratio) ? saved.ratio : card.ratio,
    };
  });
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
  const { accountId } = useAccount();
  const worksLayoutKey = `aiquos-board:works:${accountId}`;
  const favoriteLayoutKey = `aiquos-board:favorites:${accountId}`;
  const viewportLayout = useViewportLayout();
  const realAssessmentRecords = buildProfileAssessmentRecords(assessmentHistory);
  const newestAssessmentKey = Object.keys(realAssessmentRecords)[0] ?? null;
  const initialRecordDate = newestAssessmentKey ? dateFromKey(newestAssessmentKey) : TODAY;
  const [cursor, setCursor] = useState({ year: initialRecordDate.getFullYear(), month: initialRecordDate.getMonth() });
  const [selected, setSelected] = useState(initialRecordDate);
  const [openWork, setOpenWork] = useState(0);
  const [worksTab, setWorksTab] = useState("images");
  const [imageCards, setImageCards] = useState(() => applyBoardLayout(WORK_IMAGE_CARDS, loadBoardLayout(worksLayoutKey)));
  const [imageDrag, setImageDrag] = useState(null);
  const [favoriteId, setFavoriteId] = useState(null);
  const [favoritesView, setFavoritesView] = useState("list");
  const [openFavorite, setOpenFavorite] = useState(-1);
  const [favoriteImageCards, setFavoriteImageCards] = useState([]);
  const [favoriteImageDrag, setFavoriteImageDrag] = useState(null);
  const [favoriteLayouts, setFavoriteLayouts] = useState(() => loadBoardLayout(favoriteLayoutKey));
  const [favoriteActivity, setFavoriteActivity] = useState({});
  const [activeClass, setActiveClass] = useState(CLASS_LIBRARY[0]);
  const [classQuery, setClassQuery] = useState("");
  const [classSearch, setClassSearch] = useState(null);
  const [classNotice, setClassNotice] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [recordDrafts, setRecordDrafts] = useState({});
  const [recordEntries, setRecordEntries] = useState({});
  const worksBoardRef = useRef(null);
  const favoriteBoardRef = useRef(null);
  const favorites = useFavorites();
  const favoriteImageCount = getFavoriteImageCards(favorites).length;
  useEffect(() => {
    if (id !== "records") return;
    setCursor({ year: TODAY.getFullYear(), month: TODAY.getMonth() });
    setSelected(TODAY);
  }, [id]);
  useEffect(() => {
    if (id !== "favorites" || favoritesView !== "images") return;
    const nextCards = getFavoriteImageCards(favorites);

    setFavoriteImageCards(nextCards.map((card) => {
      const saved = favoriteLayouts[card.id];
      return {
        ...card,
        x: Number.isFinite(saved?.x) ? saved.x : card.x,
        y: Number.isFinite(saved?.y) ? saved.y : card.y,
        width: Number.isFinite(saved?.width) && saved.width > 0 ? saved.width : card.width,
        rotation: Number.isFinite(saved?.rotation) ? saved.rotation : card.rotation,
        z: saved?.z ?? card.z,
      };
    }));

    const timer = window.setTimeout(() => {
      const board = favoriteBoardRef.current?.getBoundingClientRect();
      if (!board) return;

      setFavoriteImageCards((current) => current.map((card) => (
        clampImageCard(fitImageCard(card, board), board)
      )));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [id, favorites, favoritesView, favoriteLayouts]);

  // 拖拽 / 缩放 / 旋转 / 层级一旦变化就按账号落盘，刷新后自动恢复。
  useEffect(() => {
    saveBoardLayout(worksLayoutKey, boardLayoutMap(imageCards));
  }, [worksLayoutKey, imageCards]);

  useEffect(() => {
    saveBoardLayout(favoriteLayoutKey, boardLayoutMap(favoriteImageCards));
  }, [favoriteLayoutKey, favoriteImageCards]);

  // 账号更换（系统换发新 ID）时，重新装载该账号上一次的摆放。
  useEffect(() => {
    setImageCards(applyBoardLayout(WORK_IMAGE_CARDS, loadBoardLayout(worksLayoutKey)));
  }, [worksLayoutKey]);

  useEffect(() => {
    setFavoriteLayouts(loadBoardLayout(favoriteLayoutKey));
  }, [favoriteLayoutKey]);
  const selectedKey = dateKey(selected);
  const records = [
    ...(realAssessmentRecords[selectedKey] ?? []),
    ...(DEMONSTRATION_RECORDS[selectedKey] ?? []),
  ];
  const recordDraft = recordDrafts[selectedKey] ?? "";
  const selectedRecordEntries = recordEntries[selectedKey] ?? [];
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

  const updateRecordDraft = (content) => {
    setRecordDrafts((current) => ({ ...current, [selectedKey]: content }));
  };

  const addRecordEntry = () => {
    const content = recordDraft.trim();
    if (!content) return;

    setRecordEntries((current) => ({
      ...current,
      [selectedKey]: [
        {
          id: `${Date.now()}`,
          time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
          content,
        },
        ...(current[selectedKey] ?? []),
      ],
    }));
    updateRecordDraft("");
  };

  const worksImageControls = createImageBoardControls(
    imageCards,
    setImageCards,
    imageDrag,
    setImageDrag,
    worksBoardRef,
  );
  const favoriteImageControls = createImageBoardControls(
    favoriteImageCards,
    setFavoriteImageCards,
    favoriteImageDrag,
    setFavoriteImageDrag,
    favoriteBoardRef,
  );

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
      className={`profile-detail-screen${id === "favorites" && favoritesView === "images" ? " is-image-view" : ""}`}
      style={{ "--detail-color": detail.color }}
      data-screen={id}
      data-view={id === "favorites" ? favoritesView : undefined}
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
        <section className="profile-detail-panel organization-panel" aria-label="我的组织">
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
        <section className="works-dashboard" aria-label="我的作品">
          <aside className="works-rail">
            <nav className="works-menu" aria-label="作品分类">
              {[
                { id: "images", label: "图片", meta: `${WORK_IMAGE_CARDS.length} 件`, icon: Image },
                { id: "prompts", label: "提示词", meta: `${PROMPT_WORKS.length} 份`, icon: ChatsCircle },
                { id: "articles", label: "文章", meta: `${ARTICLE_WORKS.length} 篇`, icon: Article },
              ].map((item) => {
                const Icon = item.icon;
                const selected = worksTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={selected ? "is-selected" : undefined}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      setWorksTab(item.id);
                      setOpenWork(0);
                    }}
                  >
                    <i>
                      <Icon size={26} weight="bold" />
                    </i>
                    <span>
                      <strong>{item.label}</strong>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="works-canvas">
            {worksTab === "images" ? (
              <div className="works-board" ref={worksBoardRef}>
                {imageCards.map((card) => {
                  const active = imageDrag?.id === card.id;
                  return (
                    <article
                      key={card.id}
                      className={`works-board-card${active ? " is-dragging" : ""}`}
                      style={{
                        left: `${card.x}%`,
                        top: `${card.y}%`,
                        zIndex: card.z,
                        transform: `rotate(${card.rotation}deg)`,
                        "--base-width": `${card.width}%`,
                      }}
                      onPointerDown={(event) => worksImageControls.beginImageDrag(event, card.id)}
                      onPointerMove={worksImageControls.moveImageDrag}
                      onPointerUp={worksImageControls.endImageDrag}
                      onPointerCancel={worksImageControls.endImageDrag}
                    >
                      <img src={card.image} alt="" draggable={false} decoding="async" onLoad={(event) => {
                        const image = event.currentTarget;
                        worksImageControls.updateImageRatio(card.id, image.naturalWidth / image.naturalHeight);
                      }} />

                      <div className="works-card-tools">
                        <button type="button" aria-label={`缩小图片：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => worksImageControls.resizeImageCard(card.id, "smaller")}>
                          <Minus size={14} weight="bold" />
                        </button>
                        <button type="button" aria-label={`放大图片：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => worksImageControls.resizeImageCard(card.id, "larger")}>
                          <Plus size={14} weight="bold" />
                        </button>
                        <button type="button" aria-label={`逆时针旋转：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => worksImageControls.rotateImageCard(card.id, -8)}>
                          <ArrowCounterClockwise size={14} weight="bold" />
                        </button>
                        <button type="button" aria-label={`顺时针旋转：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => worksImageControls.rotateImageCard(card.id, 8)}>
                          <ArrowClockwise size={14} weight="bold" />
                        </button>
                        <button type="button" aria-label={`置顶图层：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => worksImageControls.moveImageLayer(card.id, "front")}>
                          <ArrowUp size={14} weight="bold" />
                        </button>
                        <button type="button" aria-label={`下移图层：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => worksImageControls.moveImageLayer(card.id, "back")}>
                          <ArrowDown size={14} weight="bold" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="work-accordion">
                {(worksTab === "prompts" ? PROMPT_WORKS : ARTICLE_WORKS).map((work, index) => {
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
            )}
          </div>
        </section>
      )}

      {id === "favorites" && (
        <section className="profile-favorites" aria-label="我的收藏">
          <div className="favorites-view-switch" role="group" aria-label="收藏显示方式">
            <button
              type="button"
              className={favoritesView === "list" ? "is-selected" : undefined}
              onClick={() => setFavoritesView("list")}
            >
              <BookmarkSimple size={16} weight="bold" />
              收藏内容
            </button>
            <button
              type="button"
              className={favoritesView === "images" ? "is-selected" : undefined}
              onClick={() => setFavoritesView("images")}
            >
              <Stack size={16} weight="bold" />
              收藏图片
            </button>
          </div>

          {favoritesView === "images" ? (
            favoriteImageCount === 0 ? (
              <div className="favorites-image-empty">
                <Stack size={34} weight="bold" />
                <strong>还没有收藏图片</strong>
                <p>收藏带图片的论坛或案例后，图片会出现在这里。</p>
              </div>
            ) : (
              <div className="favorites-image-dashboard">
                <div className="favorites-canvas">
                  <div className="works-board favorites-board" ref={favoriteBoardRef}>
                    {favoriteImageCards.map((card) => {
                      const active = favoriteImageDrag?.id === card.id;
                      return (
                        <article
                          key={card.id}
                          className={`works-board-card${active ? " is-dragging" : ""}`}
                          style={{
                            left: `${card.x}%`,
                            top: `${card.y}%`,
                            zIndex: card.z,
                            transform: `rotate(${card.rotation}deg)`,
                            "--base-width": `${card.width}%`,
                          }}
                          onPointerDown={(event) => favoriteImageControls.beginImageDrag(event, card.id)}
                          onPointerMove={favoriteImageControls.moveImageDrag}
                          onPointerUp={favoriteImageControls.endImageDrag}
                          onPointerCancel={favoriteImageControls.endImageDrag}
                        >
                          <img
                            src={card.image}
                            alt=""
                            draggable={false}
                            decoding="async"
                            onLoad={(event) => {
                              const image = event.currentTarget;
                              favoriteImageControls.updateImageRatio(card.id, image.naturalWidth / image.naturalHeight);
                            }}
                          />

                          <div className="works-card-tools">
                            <button type="button" aria-label={`缩小图片：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => favoriteImageControls.resizeImageCard(card.id, "smaller")}>
                              <Minus size={14} weight="bold" />
                            </button>
                            <button type="button" aria-label={`放大图片：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => favoriteImageControls.resizeImageCard(card.id, "larger")}>
                              <Plus size={14} weight="bold" />
                            </button>
                            <button type="button" aria-label={`逆时针旋转：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => favoriteImageControls.rotateImageCard(card.id, -8)}>
                              <ArrowCounterClockwise size={14} weight="bold" />
                            </button>
                            <button type="button" aria-label={`顺时针旋转：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => favoriteImageControls.rotateImageCard(card.id, 8)}>
                              <ArrowClockwise size={14} weight="bold" />
                            </button>
                            <button type="button" aria-label={`置顶图层：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => favoriteImageControls.moveImageLayer(card.id, "front")}>
                              <ArrowUp size={14} weight="bold" />
                            </button>
                            <button type="button" aria-label={`下移图层：${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => favoriteImageControls.moveImageLayer(card.id, "back")}>
                              <ArrowDown size={14} weight="bold" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
          ) : (
            <>
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
                <div className="favorites-accordion">
                  {favorites.map((item, index) => {
                    const isOpen = openFavorite === index;
                    return (
                      <article key={item.id} className={isOpen ? "is-open" : undefined}>
                        <div className="favorite-accordion-head">
                          <button
                            type="button"
                            className="favorite-expand"
                            aria-expanded={isOpen}
                            onClick={() => setOpenFavorite(isOpen ? -1 : index)}
                          >
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.tag} · {item.comments.length} 条评论</small>
                            </span>
                            <CaretDown weight="bold" />
                          </button>
                          <button
                            type="button"
                            className="favorite-open"
                            aria-label={`进入${item.kind === "case" ? "案例" : "论坛"}详情：${item.title}`}
                            onClick={() => setFavoriteId(item.id)}
                          >
                            <ArrowRight size={19} weight="bold" />
                          </button>
                        </div>

                        {isOpen && (
                          <div className="favorite-accordion-body">
                            <p>{item.summary}</p>
                            <footer>
                              <span>{item.author} · {item.createdAt}</span>
                              <button
                                type="button"
                                className="favorite-remove"
                                aria-label={`取消收藏：${item.title}`}
                                onClick={() => removeFavorite(item.id)}
                              >
                                移除
                              </button>
                            </footer>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </>
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
                    {(realAssessmentRecords[key]?.length || DEMONSTRATION_RECORDS[key]?.length || recordEntries[key]?.length) && <i className="has-record" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <div className="record-composer">
              <label htmlFor="record-composer-input">我的记录</label>
              <textarea
                id="record-composer-input"
                value={recordDraft}
                onChange={(event) => updateRecordDraft(event.target.value)}
                placeholder={`写给 ${selected.getMonth() + 1}月${selected.getDate()}日的一段记录...`}
                rows={3}
              />
              <div className="record-composer-actions">
                {selectedRecordEntries.length > 0 && (
                  <span>{selectedRecordEntries.length} 条记录</span>
                )}
                <button type="button" onClick={addRecordEntry} disabled={!recordDraft.trim()}>
                  <Plus size={14} weight="bold" />
                  保存记录
                </button>
              </div>
              {selectedRecordEntries.length > 0 && (
                <ul aria-label="我的记录列表">
                  {selectedRecordEntries.map((entry) => (
                    <li key={entry.id}>
                      <small>{entry.time}</small>
                      <p>{entry.content}</p>
                    </li>
                  ))}
                </ul>
              )}
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
