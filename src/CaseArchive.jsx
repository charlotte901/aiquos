import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookmarkSimple,
  Plus,
  X,
} from "@phosphor-icons/react";
import { favoriteFromCase, toggleFavorite, useFavoriteSaved } from "./favorites-store";
import { CaseScreen } from "./CaseScreen";
import { CASES as LIVE_CASES } from "./cases";
import {
  addJourneyKey,
  isDefaultJourney,
  JOURNEY_MAX,
  JOURNEY_MIN,
  moveJourney,
  readColors,
  readJourney,
  readRemovedKeys,
  removeJourneyKey,
  writeColors,
  writeJourney,
  writeRemovedKeys,
} from "./case-library";

const CASE_PROJECTS = [
  {
    title: "Aiquos Identity Refresh",
    tags: "Branding, Website",
    year: 2025,
    description:
      "以 AIQUOS 的粉色视觉为基底，重新整理标志、字体和页面节奏，让品牌在网站与展示物料之间保持同一种语气。",
  },
  {
    title: "Spatial Learning Toolkit",
    tags: "Education, Product",
    year: 2025,
    description:
      "把学习路径转成可拖拽的空间模块，帮助学习者先看见任务结构，再进入具体练习和成果整理。",
  },
  {
    title: "Studio Workflow Assistant",
    tags: "Productivity, AI",
    year: 2025,
    description:
      "为小型工作室设计的 AI 协作面板，将简报、素材、修改记录和交付检查放进同一条工作流。",
  },
  {
    title: "Retail Navigation Concept",
    tags: "Retail, Interactive",
    year: 2024,
    description:
      "通过实时导览和分层信息，减少实体零售空间中的寻找成本，让促销与路线信息保持安静而清晰。",
  },
  {
    title: "Quiet City Guide",
    tags: "Editorial, Mobile",
    year: 2024,
    description:
      "一组低干扰的城市漫游内容，用编辑式图片、短文和步行路线替代密集的评分列表。",
  },
  {
    title: "Modular Sound Archive",
    tags: "Culture, Web",
    year: 2024,
    description:
      "把声音档案拆成可组合的片段，访问者能够按地点、时间和材质重新编排自己的听觉路径。",
  },
  {
    title: "Field Research Atlas",
    tags: "Research, Data",
    year: 2024,
    description:
      "将田野记录、照片和统计数据叠放在同一张地图中，方便团队比较不同区域的变化过程。",
  },
  {
    title: "Soft Interface Study",
    tags: "Interaction, Prototype",
    year: 2024,
    description:
      "研究轻触、缓冲与渐进入场的界面语言，探索数字工具如何减少操作时的紧张感。",
  },
  {
    title: "Collaboration Service Design",
    tags: "Service, Branding",
    year: 2024,
    description:
      "从接待、沟通到交付重新梳理协作服务，让品牌承诺落实到每个可见的接触点。",
  },
  {
    title: "Neighborhood Commerce",
    tags: "Commerce, Web",
    year: 2024,
    description:
      "为街区小店构建轻量线上橱窗，保留店主叙事，同时让库存、预约和取货流程更直接。",
  },
  {
    title: "Motion Identity Draft",
    tags: "Motion, Branding",
    year: 2023,
    description:
      "以重复、停顿和轻微偏移组织品牌动效，使动态识别不会压过正文与图片内容。",
  },
  {
    title: "Archive Access System",
    tags: "Culture, Product",
    year: 2023,
    description:
      "为文化机构整理一套可检索的档案入口，让模糊的历史材料也能通过主题和时间被重新发现。",
  },
  {
    title: "Playful Data Reader",
    tags: "Data, Education",
    year: 2023,
    description:
      "把抽象数据转换成可触摸的图形任务，学习者在比较和排序中自然理解统计关系。",
  },
  {
    title: "Studio Collaboration Kit",
    tags: "Productivity, Web",
    year: 2023,
    description:
      "提供评审、标注和版本说明的共享模板，帮助远程团队减少反复同步造成的损耗。",
  },
  {
    title: "Museum Wayfinding",
    tags: "Culture, Interactive",
    year: 2023,
    description:
      "用安静的路线提示替代复杂指引，观众可以按停留时长和兴趣选择自己的展厅顺序。",
  },
  {
    title: "Health Companion Concept",
    tags: "Health, Mobile",
    year: 2023,
    description:
      "以温和的提醒和记录流为核心，让健康数据成为日常照顾的一部分，而不是冷冰的指标面板。",
  },
  {
    title: "Generative Type Workshop",
    tags: "Education, Type",
    year: 2023,
    description:
      "通过参数化字形实验讲解字体结构，参与者可以即时看到规则变化对识别度的影响。",
  },
  {
    title: "Low-energy Web Pilot",
    tags: "Sustainability, Web",
    year: 2023,
    description:
      "压缩媒体、限制动态层并重排加载顺序，在保留品牌氛围的前提下降低页面的能源消耗。",
  },
  {
    title: "Personal Knowledge Map",
    tags: "Tool, Product",
    year: 2022,
    description:
      "把笔记连接成不断生长的关系图，帮助个人在长期项目中保持上下文和灵感的可见性。",
  },
  {
    title: "Small Press Reader",
    tags: "Editorial, Mobile",
    year: 2022,
    description:
      "为独立出版社设计连续阅读体验，让标题、正文和图片在小屏幕上保留纸本的呼吸感。",
  },
  {
    title: "Maker Marketplace",
    tags: "Commerce, Web",
    year: 2022,
    description:
      "突出制作过程与材料来源，让买家在了解手作物件背景之后再进入购买流程。",
  },
  {
    title: "Remote Residency Platform",
    tags: "Culture, Web",
    year: 2022,
    description:
      "把驻留项目的展示、讨论和阶段记录集中在一个线上空间，支持分散地点的共同创作。",
  },
  {
    title: "Adaptive Learning Space",
    tags: "Education, AI",
    year: 2022,
    description:
      "根据练习结果调整任务难度和示例，AI 在这里承担反馈助手，而不是替代学习者的判断。",
  },
  {
    title: "Transport Signage Study",
    tags: "Wayfinding, Public",
    year: 2022,
    description:
      "比较不同换乘场景中的信息层级，用更大的距离对比和更少的颜色强化关键指示。",
  },
  {
    title: "Tactile Dashboard",
    tags: "Data, Prototype",
    year: 2022,
    description:
      "以厚实边缘、可按压区域和缓慢反馈组织数据界面，让复杂状态更容易被感知。",
  },
  {
    title: "Independent Film Hub",
    tags: "Entertainment, Web",
    year: 2022,
    description:
      "围绕导演、场景和主题组织独立影像，提供连续观看路径而不是单纯的片名列表。",
  },
  {
    title: "Garden Planning Tool",
    tags: "Sustainability, Mobile",
    year: 2022,
    description:
      "结合季节、光照和空间尺寸安排种植计划，帮助小型花园维持长期可维护的生态。",
  },
  {
    title: "Architecture Archive",
    tags: "Architecture, Culture",
    year: 2022,
    description:
      "将图纸、模型照片和现场记录按项目阶段排列，呈现建筑从概念到使用的完整过程。",
  },
  {
    title: "Open Studio Index",
    tags: "Community, Web",
    year: 2022,
    description:
      "为开放工作室活动建立共享索引，访客可以按区域规划路线，创作者也能更新当日状态。",
  },
  {
    title: "Quiet Product Studio",
    tags: "Product, Editorial",
    year: 2022,
    description:
      "以留白、克制色彩和长段落说明展示产品，强调材料、使用方式与长期维护。",
  },
  {
    title: "Light Archive Editorial",
    tags: "Editorial, Culture",
    year: 2022,
    description:
      "以自然光为主题整理摄影专题，文字与图片交替出现，形成缓慢推进的阅读节奏。",
  },
  {
    title: "Sequential Memory",
    tags: "Archive, Interactive",
    year: 2022,
    description:
      "让访问者按时间顺序揭开记忆片段，影像之间的间隙成为回忆与补充说明的位置。",
  },
  {
    title: "Soft Machine Study",
    tags: "Prototype, Technology",
    year: 2022,
    description:
      "探索柔软材质与机械结构结合的原型，记录它们在压力、温度和触碰下的反应。",
  },
  {
    title: "Everyday Interface Atlas",
    tags: "Interface, Research",
    year: 2022,
    description:
      "收集日常环境中的界面样本，比较它们如何通过形状、文字和位置引导行为。",
  },
  {
    title: "Studio Season Review",
    tags: "Editorial, Web",
    year: 2022,
    description:
      "以季度为单位回顾工作室项目，保留失败草图和过程笔记，呈现完整决策路径。",
  },
  {
    title: "Process Library",
    tags: "Community, Archive",
    year: 2022,
    description:
      "把可复用的制作方法整理成公共资料库，鼓励创作者贡献自己的修改与验证结果。",
  },
];

const LIVE_CASE_DETAILS = {
  "wing-it": {
    title: "Wing It",
    tags: "Animation, Editing",
    year: 2026,
    description:
      "一支以中文解说串起节奏、镜头与角色表演的动画剪辑。案例会在页面内循环播放，并保留独立的声音开关。",
  },
  mario: {
    title: "超级马里奥",
    tags: "Pixel Game, Interactive",
    year: 2026,
    description:
      "把经典横版像素游戏装进浏览器场景，角色、关卡与镜头按实时逻辑运行，在案例页内即可观看和尝试。",
  },
  conbini: {
    title: "日式便利店",
    tags: "Realtime 3D, Atmosphere",
    year: 2026,
    description:
      "以雨夜街角为舞台的实时 3D 氛围实验。霓虹、湿润地面与便利店灯光共同构成一段持续流动的夜间场景。",
  },
  pirate: {
    title: "暴风雨海盗船",
    tags: "Realtime 3D, Adventure",
    year: 2026,
    description:
      "一艘海盗船穿过风暴海面的实时 3D 演示，以不断变化的浪涌、天空与航行姿态呈现完整冒险场景。",
  },
};

const projectImage = (index) => `/assets/cases/${index + 1}.webp`;

/** The journey route is a true sine wave running along the screen diagonal —
 * from the upper-left corner, behind the centered stamp, to the lower-right
 * corner, mirroring the stamps' diagonal travel. It is rebuilt in real screen
 * pixels (ResizeObserver) so every dash stays exactly the same length at any
 * viewport. The dashes that would graze the centered card are dropped, so the
 * line stops a clear margin short of it instead of clipping at its edge. A page
 * change empties the line at once; WHILE the covers swap the route is redrawn
 * from BOTH CORNERS TOWARD THE MIDDLE, each dash materialising out of
 * translucency as the pen reaches it, and the pass closes exactly as the new
 * cover lands. */
const ROUTE_DASH = 16;
const ROUTE_GAP = 12;
const ROUTE_REVEAL = 520;
const ROUTE_FEATHER = 9;
// How the page change's clock maps onto the redraw. Slightly front-loaded so the
// pens pair up with the incoming cover's ease-out, but spread across the whole
// move so the two-sided drawing stays readable and the middle closes last.
const ROUTE_MOVE_CURVE = 1.5;
// Keep-out margin around the centered card, as a share of its short side. Wide
// enough that the two ends of the line read as standing well clear of the card
// rather than merely not touching it.
const ROUTE_CARD_CLEARANCE = 0.24;
const ROUTE_CARD_CLEARANCE_MIN = 46;
const ROUTE_CARD_CLEARANCE_MAX = 92;

function routeCardKeepOut(card, margin) {
  if (!card || card.width < 2 || card.height < 2) return null;
  return {
    left: card.x - margin,
    top: card.y - margin,
    right: card.x + card.width + margin,
    bottom: card.y + card.height + margin,
  };
}

function buildRouteDashes(width, height, card = null) {
  const clearance = card
    ? Math.max(
      ROUTE_CARD_CLEARANCE_MIN,
      Math.min(ROUTE_CARD_CLEARANCE_MAX, Math.min(card.width, card.height) * ROUTE_CARD_CLEARANCE),
    )
    : 0;
  const keepOut = routeCardKeepOut(card, clearance);
  const from = { x: -70, y: -70 };
  const to = { x: width + 70, y: height + 70 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const cycles = Math.max(3, Math.round(length / 300));
  const amplitude = Math.min(54, Math.max(30, height * 0.075));
  const samples = Math.max(120, Math.ceil(length / 4));

  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const wobble = amplitude * Math.sin(2 * Math.PI * cycles * t);
    points.push([
      from.x + dx * t + nx * wobble,
      from.y + dy * t + ny * wobble,
    ]);
  }
  const arc = [0];
  for (let i = 1; i < points.length; i += 1) {
    arc.push(arc[i - 1] + Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    ));
  }
  const pointAt = (s) => {
    let i = 1;
    while (i < arc.length - 1 && arc[i] < s) i += 1;
    const span = arc[i] - arc[i - 1] || 1;
    const t = (s - arc[i - 1]) / span;
    return [
      points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
    ];
  };
  const insideCard = keepOut
    ? (x, y) => (
      x > keepOut.left && x < keepOut.right && y > keepOut.top && y < keepOut.bottom
    )
    : () => false;
  const total = arc[arc.length - 1];
  const dashes = [];
  for (let start = 0; start + ROUTE_DASH * 0.5 <= total; start += ROUTE_DASH + ROUTE_GAP) {
    const end = Math.min(start + ROUTE_DASH, total);
    let d = "";
    let grazes = false;
    for (let k = 0; k <= 8; k += 1) {
      const [x, y] = pointAt(start + ((end - start) * k) / 8);
      if (insideCard(x, y)) grazes = true;
      d += `${k === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    if (grazes) continue;
    dashes.push(d);
  }
  return { dashes, width, height, card, clearance };
}

/** The ground the poster opens on. The cases tab is entered straight off the
 * home page, and the home page's pink is a generated grain canvas painted from
 * these channel values (see `ReferenceBackground` in App.jsx) — so the first
 * world borrows that exact ground and the tab change moves the ink, not the
 * paper. Without this the archive opened a deeper pink (#ef5c9b) and the whole
 * screen shifted colour the instant you left Home. Keep in step with the
 * `245 / 107 / 163` written in `ReferenceBackground`. */
const HOME_GROUND = "#f56ba3";

const POSTER_WORLDS = [
  { top: "IMAGINE", bottom: "CREATE", background: HOME_GROUND, ink: "#fff1f6", accent: "#fff1f6" },
  { top: "EXPLORE", bottom: "CONNECT", background: "#557fa8", ink: "#ffc4dc", accent: "#ffe6b5" },
  { top: "SHAPE", bottom: "TOGETHER", background: "#934d4d", ink: "#184e37", accent: "#e4b44c" },
  { top: "NOTICE", bottom: "WONDER", background: "#386b58", ink: "#ffd5e4", accent: "#ffd56a" },
  { top: "BUILD", bottom: "FORWARD", background: "#7b67a8", ink: "#ffe5ef", accent: "#d7f06c" },
  { top: "REVEAL", bottom: "POSSIBLE", background: "#db7653", ink: "#173f34", accent: "#ffe5a8" },
  { top: "WING", bottom: "IT", background: "#ef5c9b", ink: "#ffddec", accent: "#fff1f6" },
  { top: "SUPER", bottom: "MARIO", background: "#557fa8", ink: "#ffc4dc", accent: "#ffe6b5" },
  { top: "NIGHT", bottom: "STORE", background: "#386b58", ink: "#ffd5e4", accent: "#ffd56a" },
  { top: "BRAVE", bottom: "STORM", background: "#934d4d", ink: "#173f34", accent: "#e4b44c" },
];

/** Every case the poster is able to walk through, in a fixed canonical order:
 * the archive projects, then the live scenes. Each entry carries a stable `key`
 * so a saved journey order survives a reload, and its own poster world so
 * reordering or removing a case never repaints the ones already on screen. */
const CASE_POOL = [
  ...CASE_PROJECTS.map((item, archiveIndex) => ({
    ...item,
    key: `archive:${archiveIndex}`,
    type: "archive",
    archiveIndex,
    cover: projectImage(archiveIndex),
  })),
  ...LIVE_CASES.map((item) => ({
    ...item,
    ...LIVE_CASE_DETAILS[item.id],
    key: `live:${item.id}`,
    type: "live",
    cover: `/assets/case-covers/${item.id}.webp`,
  })),
];

CASE_POOL.forEach((entry, poolIndex) => {
  entry.world = POSTER_WORLDS[poolIndex % POSTER_WORLDS.length];
});

const CASE_POOL_KEYS = CASE_POOL.map((entry) => entry.key);

/** Each case's shipped poster colours, so the panel can show a colour picker's
 * value and offer a per-case reset without having to read the live world back
 * out (which may already carry an override). */
const COLOR_DEFAULTS = Object.fromEntries(
  CASE_POOL.map((entry) => [entry.key, { background: entry.world.background, ink: entry.world.ink }]),
);

/** Fold the journey down to one entry per case, first occurrence wins.
 *
 * Deleting a case has to take it out of the journey too, and both lists are
 * user-editable, so this is the single place that reconciles them. */
function pruneJourneyToPool(journeyKeys, poolKeys) {
  const allowed = new Set(poolKeys);
  const seen = new Set();
  const out = [];
  for (const key of journeyKeys) {
    if (!allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** The journey the poster opens with: the six archive covers that ship with the
 * poster plus the four live scenes. */
const DEFAULT_JOURNEY_KEYS = [
  ...CASE_PROJECTS.slice(0, 6).map((_, index) => `archive:${index}`),
  ...LIVE_CASES.map((item) => `live:${item.id}`),
];

/** The fullscreen-to-stamp opening from the motion reference plays once per
 * session; later visits land directly on the settled poster composition. */
const CASE_INTRO_DURATION = 1680;
let caseIntroPlayed = false;

/** Retire the opening before the archive mounts.
 *
 * The homepage reaches the archive through a push (see slide-transition.js),
 * and a page that is already travelling does not need a second entrance: the
 * opening's first beat is a full-bleed cover image, so the arriving page came
 * in as a giant cat sliding across the screen. A push is a warm move between
 * two screens, so the cold-open belongs to the other way in — loading or
 * reloading `#cases` straight, where `go()` never runs and it still plays. */
export function skipCaseIntro() {
  caseIntroPlayed = true;
}

/** One stamp. `morph` is how a travelling stamp wears both bodies at once: the
 * centre stamp is the full one (shorter artwork over a title/tags/year caption)
 * and the corner peek is the compact one (artwork filling the frame, only the
 * year in the corner), so a stamp flying between the two has to cross-fade one
 * into the other as it travels. Without it the frame lands exactly on the corner
 * and then the picture inside it re-lays itself out one frame later — the frame
 * arrives correctly and its contents jump. */
function PosterStamp({ project, compact = false, morph = null, transitionName }) {
  const body = (isCompact, opacity) => (
    <span
      className={`poster-stamp-content${isCompact ? " is-compact" : ""}`}
      style={opacity === null ? undefined : { opacity }}
    >
      <img
        className="poster-stamp-art"
        src={project.cover}
        alt=""
        draggable="false"
        decoding="async"
      />
      {isCompact ? (
        <time className="poster-stamp-year">{project.year}</time>
      ) : (
        <span className="poster-stamp-caption">
          <strong>{project.title}</strong>
          <span>{project.tags}</span>
          <time>{project.year}</time>
        </span>
      )}
    </span>
  );

  return (
    <span
      className={`poster-stamp${compact ? " is-compact" : ""}${morph === null ? "" : " is-morphing"}`}
      style={transitionName ? { viewTransitionName: transitionName } : undefined}
    >
      <img className="poster-stamp-frame" src="/assets/case-poster-stamp.png" alt="" />
      {morph === null ? body(compact, null) : (
        <>
          {body(false, 1 - morph)}
          {body(true, morph)}
        </>
      )}
    </span>
  );
}

/** The journey editor: the poster's running order with controls to move an entry
 * up or down, take it out, and a pool of every case that is not on the journey
 * yet. Purely a list editor — nothing here creates new content. */
function JourneyEditor({ journey, pool, onMove, onAdd, onRemove, onReset, isDefault, max = JOURNEY_MAX }) {
  const lastIndex = journey.length - 1;
  const atCap = journey.length >= max;
  return (
    <div className="case-journey-editor">
      <div className="case-journey-head">
        <p>
          JOURNEY ORDER <span>{String(journey.length).padStart(2, "0")}</span>
          <i aria-hidden="true">/</i>{String(max).padStart(2, "0")}
          <i aria-hidden="true">·</i>SAVED IN THIS BROWSER
        </p>
        <button type="button" onClick={onReset} disabled={isDefault}>
          <ArrowCounterClockwise size={13} aria-hidden="true" />
          RESET
        </button>
      </div>

      <ol className="case-journey-list">
        {journey.map((entry, index) => (
          <li key={entry.key} className="case-journey-row">
            <span className="case-journey-order">{String(index + 1).padStart(2, "0")}</span>
            <img className="case-journey-cover" src={entry.cover} alt="" draggable="false" />
            <span className="case-journey-meta">
              <strong>{entry.title}</strong>
              <small>
                {entry.type === "live" ? "LIVE CASE" : "ARCHIVE"}
                <i aria-hidden="true">•</i>{entry.tags}<i aria-hidden="true">•</i>{entry.year}
              </small>
            </span>
            <span className="case-journey-controls">
              <button
                type="button"
                onClick={() => onMove(index, index - 1)}
                disabled={index === 0}
                aria-label={`上移：${entry.title}`}
              >
                <ArrowUp size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onMove(index, index + 1)}
                disabled={index === lastIndex}
                aria-label={`下移：${entry.title}`}
              >
                <ArrowDown size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="is-remove"
                onClick={() => onRemove(entry.key)}
                disabled={journey.length <= JOURNEY_MIN}
                aria-label={`从旅程中移除：${entry.title}`}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ol>

      <div className="case-journey-pool">
        <p className="case-journey-pool-head">
          可添加案例 <span>{String(pool.length).padStart(2, "0")}</span>
          {atCap ? <i>· 旅程已满 {max}，先移除一个再加</i> : null}
        </p>
        {pool.length === 0 ? (
          <p className="case-journey-pool-empty">案例池里的全部案例都已经在旅程中了。</p>
        ) : (
          <ul className="case-journey-pool-list">
            {pool.map((entry) => (
              <li key={entry.key}>
                <button type="button" onClick={() => onAdd(entry.key)} disabled={atCap}>
                  <img src={entry.cover} alt="" draggable="false" />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{entry.type === "live" ? "LIVE CASE" : "ARCHIVE"}<i aria-hidden="true">•</i>{entry.tags}</small>
                  </span>
                  <Plus size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ShowcaseCaseDetail({ project, index, total, onBack, transitionName }) {
  return (
    <section className="case-archive case-showcase-detail" aria-label={`${project.title} 案例`}>
      <div
        className="case-showcase-detail-media"
        style={transitionName ? { viewTransitionName: transitionName } : undefined}
      >
        <CaseScreen config={project} active preload={false} />
      </div>
      <div className="case-showcase-detail-shade" aria-hidden="true" />
      <button className="case-detail-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        返回案例
      </button>
      <div className="case-showcase-detail-info">
        <p className="case-showcase-detail-index">
          LIVE CASE {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </p>
        <h1>{project.title}</h1>
        <p className="case-showcase-detail-meta">
          {project.tags}<i aria-hidden="true">•</i>{project.year}
        </p>
        <p className="case-showcase-detail-copy">{project.description}</p>
      </div>
      <p className="case-showcase-detail-hint">
        {project.kind === "video" ? "LOOPING FILM · SOUND AVAILABLE" : "LIVE SCENE · MOVE · CLICK · PLAY"}
      </p>
    </section>
  );
}

// `move` is the page change's own clock: 0 the instant the covers start swapping,
// 1 as the new cover lands, or null once the scene has settled. Driving the route
// from it lets the two pens run WHILE the covers travel instead of waiting for
// them, so the line closes exactly as the new cover takes the centre.
function PosterRoute({ move = null, delay = 80 }) {
  const moving = move !== null;
  const svgRef = useRef(null);
  const drawnRef = useRef(0);
  const cardRef = useRef(null);
  const [route, setRoute] = useState(() => buildRouteDashes(
    window.innerWidth || 1280,
    window.innerHeight || 800,
  ));
  const [drawn, setDrawn] = useState(0);

  // Rebuild the wave in real pixels whenever the scene changes size, so the
  // dashes never stretch with the viewport aspect. The centered card is measured
  // from the stable scene only: the travelling stamps are scaled and offset, so
  // their boxes would move the keep-out around mid-flight.
  const syncRoute = useCallback(() => {
    const node = svgRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const card = document.querySelector(".case-poster-scene.is-stable .case-poster-feature");
    if (card) {
      const box = card.getBoundingClientRect();
      if (box.width > 2 && box.height > 2) {
        cardRef.current = {
          x: box.left - rect.left,
          y: box.top - rect.top,
          width: box.width,
          height: box.height,
        };
      }
    }
    const nextCard = cardRef.current;
    setRoute((current) => (
      Math.abs(current.width - rect.width) < 1
      && Math.abs(current.height - rect.height) < 1
      && current.card === nextCard
        ? current
        : buildRouteDashes(rect.width, rect.height, nextCard)
    ));
  }, []);

  useLayoutEffect(() => {
    syncRoute();
    const node = svgRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(syncRoute);
    observer.observe(node);
    return () => observer.disconnect();
  }, [syncRoute]);

  // While a move is in flight the pens ride the page change's clock. React
  // batches the move's final `time: 1` frame together with the transition
  // clearing, so the settled value cannot be read off the clock — a completed
  // move simply means a completed line.
  const moveDraw = moving
    ? Math.pow(Math.min(1, Math.max(0, move)), ROUTE_MOVE_CURVE)
    : 0;
  const moveWasActiveRef = useRef(false);
  useLayoutEffect(() => {
    if (moving) {
      moveWasActiveRef.current = true;
      return undefined;
    }
    if (!moveWasActiveRef.current) return undefined;
    moveWasActiveRef.current = false;
    drawnRef.current = 1;
    setDrawn(1);
    // A resize during the move could only measure the travelling stamps, so the
    // keep-out is re-read here, with the settled card back in the DOM.
    syncRoute();
    return undefined;
  }, [moving, syncRoute]);

  // An intro or a plain settle (no page change in flight) draws the route in
  // from the two corners as its own quick pass.
  useEffect(() => {
    if (moving) {
      drawnRef.current = 0;
      setDrawn(0);
      return undefined;
    }
    if (drawnRef.current >= 1) {
      setDrawn(1);
      return undefined;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      drawnRef.current = 1;
      setDrawn(1);
      return undefined;
    }
    let frame = 0;
    const timer = window.setTimeout(() => {
      const startedAt = performance.now();
      const tick = (now) => {
        const t = Math.min(1, Math.max(0, (now - startedAt) / ROUTE_REVEAL));
        const value = 1 - Math.pow(1 - t, 2.2);
        drawnRef.current = value;
        setDrawn(value);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [moving, delay]);

  const draw = moving ? moveDraw : drawn;
  const count = route.dashes.length;
  const center = (count - 1) / 2;

  return (
    <svg
      ref={svgRef}
      className={`case-poster-route${moving ? " is-moving" : ""}`}
      viewBox={`0 0 ${Math.round(route.width)} ${Math.round(route.height)}`}
      aria-hidden="true"
      focusable="false"
    >
      {route.dashes.map((d, index) => {
        // Both ends advance inward; a dash materialises over a short window, so
        // the pen leaves a soft, translucent leading edge behind it. The window
        // is added to the travel distance so the last dashes still reach full
        // opacity (and therefore full length) exactly when the draw completes.
        const edge = Math.min(index, count - 1 - index);
        const local = Math.min(1, Math.max(0, (
          draw * (center + 1 + ROUTE_FEATHER) - edge
        ) / ROUTE_FEATHER));
        const length = Math.pow(local, 0.72);
        // On top of the travelling fade, the whole line eases up from
        // translucent to solid, so the two ends do not snap to full strength the
        // instant the pens touch down — the redraw reads as a fade-in.
        const ramp = 0.3 + 0.7 * Math.min(1, draw * 1.9);
        const opacity = ramp * Math.pow(local, 1.35);
        return (
          <path
            key={d}
            className="case-poster-route-dash"
            d={d}
            pathLength="1"
            style={{
              strokeDasharray: `${length.toFixed(3)} 1`,
              opacity: opacity <= 0.004 ? 0 : Number(opacity.toFixed(3)),
            }}
          />
        );
      })}
    </svg>
  );
}

export function CaseDetail({
  project,
  index,
  total = CASE_PROJECTS.length,
  onBack,
  returnLabel = "返回",
  immersive = false,
  transitionName,
}) {
  const saved = useFavoriteSaved(`case-${index}`);

  return (
    <section
      className={`case-archive case-detail${immersive ? " is-immersive" : ""}`}
      aria-label="Case detail"
    >
      <button className="case-detail-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        {returnLabel}
      </button>
      <div className="case-detail-body">
        <figure
          className="case-detail-figure"
          style={transitionName ? { viewTransitionName: transitionName } : undefined}
        >
          <img
            src={projectImage(index)}
            alt={project.title}
            draggable="false"
          />
        </figure>
        <div className="case-detail-info">
          <p className="case-detail-index">
            Work {String(index + 1).padStart(2, "0")} / {total}
          </p>
          <h1>{project.title}</h1>
          <p className="case-detail-meta">
            {project.tags}
            <i aria-hidden="true">•</i>
            {project.year}
          </p>
          <p className="case-detail-copy">{project.description}</p>
          <button
            type="button"
            className={`favorite-button case-favorite-button${saved ? " is-saved" : ""}`}
            aria-pressed={saved}
            onClick={() => toggleFavorite(favoriteFromCase(project, index))}
          >
            <BookmarkSimple size={17} weight={saved ? "fill" : "regular"} />
            {saved ? "已收藏" : "收藏作品"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Where each leg of a page-change sweep has to start and end.
 *
 * The corner peeks are the sweep's landing strip and launch pad: the case that
 * leaves the centre reappears as the peek on the side it flew out toward, and
 * the case that arrives was itself a peek one frame earlier. So the two ends of
 * the flight are not free parameters — they are those two corner boxes, plus
 * the distance the display words need to clear the viewport edge, all read off
 * the settled composition the instant a page change starts.
 *
 * They are measured rather than restated here because the corner rules carry
 * layout-specific overrides (the `top` under the cases tab, the compact block,
 * the width clamps) that this file would otherwise have to duplicate and keep
 * in step by hand. A wrong endpoint is not subtle: the stamp finishes its
 * flight short of the corner, the moving scene unmounts, and the settled peek
 * appears under it — which reads as the stamp finding the wrong home and then
 * shrinking and snapping into place a frame later. */
const PEEK_SIDES = ["previous", "next"];

function measureCornerPoses(feature) {
  const scene = feature?.parentElement;
  if (!scene || !feature.offsetWidth) return null;

  const sceneBox = scene.getBoundingClientRect();
  const origin = feature.getBoundingClientRect();
  const originX = origin.left + origin.width / 2;
  const originY = origin.top + origin.height / 2;
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  const poses = {};

  for (const side of PEEK_SIDES) {
    const peek = scene.querySelector(`.case-poster-peek.is-${side}`);
    if (!peek) return null;
    const box = peek.getBoundingClientRect();
    const style = window.getComputedStyle(peek);
    const parts = (style.transform.match(/matrix\(([^)]+)\)/)?.[1] ?? "1,0")
      .split(",")
      .map(Number);
    poses[side] = {
      // `--stamp-x` is a vw translation and `--stamp-y` a vh one, so the corner
      // offsets go back out in the units the transform is going to consume.
      x: ((box.left + box.width / 2 - originX) / width) * 100,
      y: ((box.top + box.height / 2 - originY) / height) * 100,
      // The corner stamps are the same box at a smaller clamp, and both are
      // tilted, so the layout width is the size ratio — not the tilted bounds.
      scale: peek.offsetWidth / feature.offsetWidth,
      rotation: (Math.atan2(parts[1], parts[0]) * 180) / Math.PI,
      opacity: Number.parseFloat(style.opacity) || 1,
    };
  }

  // The display words leave the frame on the same sweep. They sit at the centre
  // of the poster, not at its edge, so clearing the viewport costs half the
  // poster plus the whole word — much further than a margin picked by eye. Both
  // words are measured because they are different lengths.
  const words = [...scene.querySelectorAll(".case-poster-words span")];
  if (!words.length) return null;
  const boxes = words.map((word) => word.getBoundingClientRect());
  poses.word = {
    offLeft: (Math.max(...boxes.map((box) => box.right - sceneBox.left)) / width) * 100,
    offRight: (Math.max(...boxes.map((box) => sceneBox.right - box.left)) / width) * 100,
  };
  return poses;
}

export function CaseArchive({ onDetailChange }) {
  const [active, setActive] = useState(0);
  const [openProject, setOpenProject] = useState(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [detailOrigin, setDetailOrigin] = useState("featured");
  const [transition, setTransition] = useState(null);
  const [intro, setIntro] = useState(() => {
    if (caseIntroPlayed) return false;
    caseIntroPlayed = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    return !reduced;
  });
  const activeRef = useRef(0);
  const transitionRef = useRef(null);
  const pendingMove = useRef(null);
  const animationFrame = useRef(0);
  const animationFallback = useRef(0);
  const wheelReady = useRef(true);
  const wheelReset = useRef(0);
  const touchStart = useRef(null);
  const pointerStart = useRef(null);
  const featureRef = useRef(null);
  const [editing, setEditing] = useState(false);
  // Cases the developer panel has deleted. Held as a set of keys so the pool
  // below is derived, never mutated — `CASE_POOL` stays the canonical content
  // list and a reset simply clears this.
  const [removedKeys, setRemovedKeys] = useState(() => readRemovedKeys(CASE_POOL_KEYS));
  // Per-case poster colours, keyed the same way. Only cases the developer
  // actually recoloured appear here; everything else reads its own default.
  const [colorOverrides, setColorOverrides] = useState(() => readColors(CASE_POOL_KEYS, COLOR_DEFAULTS));
  const livePool = useMemo(() => {
    const removed = new Set(removedKeys);
    return CASE_POOL.filter((entry) => !removed.has(entry.key)).map((entry) => {
      const override = colorOverrides[entry.key];
      // The world is copied, not mutated: `CASE_POOL` entries are module-level
      // objects shared across mounts, so writing through them would leak a
      // recolour into the next mount and into every other reader.
      return override
        ? { ...entry, world: { ...entry.world, ...override } }
        : entry;
    });
  }, [removedKeys, colorOverrides]);
  const livePoolByKey = useMemo(() => new Map(livePool.map((entry) => [entry.key, entry])), [livePool]);
  const [journeyKeys, setJourneyKeys] = useState(() => readJourney(CASE_POOL_KEYS, DEFAULT_JOURNEY_KEYS));
  const journey = useMemo(
    () => journeyKeys.map((key) => livePoolByKey.get(key)).filter(Boolean),
    [journeyKeys, livePoolByKey],
  );
  const journeyCount = journey.length;
  const wrapFeatured = useCallback(
    (index) => ((index % journeyCount) + journeyCount) % journeyCount,
    [journeyCount],
  );
  const addablePool = useMemo(() => {
    const onJourney = new Set(journeyKeys);
    return livePool.filter((entry) => !onJourney.has(entry.key));
  }, [journeyKeys, livePool]);

  const closeIndex = useCallback(() => {
    setEditing(false);
    setIndexOpen(false);
  }, []);

  useEffect(() => {
    writeJourney(journeyKeys);
  }, [journeyKeys]);

  useEffect(() => {
    writeRemovedKeys(removedKeys);
  }, [removedKeys]);

  useEffect(() => {
    writeColors(colorOverrides);
  }, [colorOverrides]);

  // Editing the journey can strand the reader past its end, or leave a case
  // detail pointing at a slot that no longer exists. Reel both back in, and drop
  // any page change that was in flight for the old list.
  useEffect(() => {
    const next = Math.min(activeRef.current, journeyCount - 1);
    activeRef.current = next;
    setActive(next);
    setOpenProject((current) => (current !== null && current > journeyCount - 1 ? null : current));
    cancelAnimationFrame(animationFrame.current);
    window.clearTimeout(animationFallback.current);
    transitionRef.current = null;
    pendingMove.current = null;
    setTransition(null);
  }, [journeyCount]);

  useEffect(() => {
    onDetailChange?.(openProject !== null || indexOpen);
  }, [indexOpen, openProject, onDetailChange]);

  useEffect(() => {
    if (openProject !== null) return;
    const feature = featureRef.current;
    const tabScroller = feature?.closest(".home-tab-screen");
    const canvasScroller = feature?.closest(".design-canvas");
    if (tabScroller) tabScroller.scrollTop = 0;
    if (canvasScroller) canvasScroller.scrollTop = 0;
  }, [indexOpen, openProject]);

  useEffect(() => () => {
    cancelAnimationFrame(animationFrame.current);
    window.clearTimeout(animationFallback.current);
    window.clearTimeout(wheelReset.current);
    pendingMove.current = null;
  }, []);

  useEffect(() => {
    if (!intro) return undefined;
    const timer = window.setTimeout(() => setIntro(false), CASE_INTRO_DURATION);
    return () => window.clearTimeout(timer);
  }, [intro]);

  const move = useCallback((delta, requestedIndex = null) => {
    if (openProject !== null || intro) return;
    if (transitionRef.current) {
      pendingMove.current = { delta, requestedIndex };
      return;
    }

    const from = activeRef.current;
    const to = requestedIndex === null
      ? wrapFeatured(from + delta)
      : wrapFeatured(requestedIndex);
    if (from === to) return;

    const direction = requestedIndex === null
      ? (delta > 0 ? 1 : -1)
      : (to > from ? 1 : -1);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const duration = reduced ? 180 : 920;
    // Measured once per page change, not per frame: the settled composition is
    // still on screen at this point, so both corner boxes are there to read.
    const corners = measureCornerPoses(featureRef.current);
    const initial = { from, to, direction, progress: 0, time: 0, spring: 0, reduced, corners };
    const startedAt = performance.now();
    transitionRef.current = initial;
    setTransition(initial);

    const finish = () => {
      if (!transitionRef.current) return;
      cancelAnimationFrame(animationFrame.current);
      window.clearTimeout(animationFallback.current);
      activeRef.current = to;
      setActive(to);
      transitionRef.current = null;
      setTransition(null);

      const queued = pendingMove.current;
      pendingMove.current = null;
      if (queued) {
        animationFrame.current = requestAnimationFrame(() => {
          move(queued.delta, queued.requestedIndex);
        });
      }
    };

    const animate = (now) => {
      const time = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const progress = reduced ? time : 1 - Math.pow(1 - time, 3);
      const back = 1.70158;
      const spring = reduced
        ? time
        : 1 + (back + 1) * Math.pow(time - 1, 3)
          + back * Math.pow(time - 1, 2);
      const next = { from, to, direction, progress, time, spring, reduced, corners };
      transitionRef.current = next;
      setTransition(next);

      if (time < 1) {
        animationFrame.current = requestAnimationFrame(animate);
        return;
      }
      finish();
    };

    animationFrame.current = requestAnimationFrame(animate);
    animationFallback.current = window.setTimeout(finish, duration + 140);
  }, [openProject, intro, wrapFeatured]);

  const changeOpenProject = useCallback((nextProject, nextIndexOpen = null, nextOrigin = null) => {
    const commit = () => flushSync(() => {
      setOpenProject(nextProject);
      if (nextIndexOpen !== null) setIndexOpen(nextIndexOpen);
      if (nextOrigin !== null) setDetailOrigin(nextOrigin);
    });
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (document.startViewTransition && !reduceMotion) {
      document.startViewTransition(commit);
      return;
    }
    commit();
  }, []);

  const closeProject = useCallback(() => {
    changeOpenProject(null, detailOrigin === "library");
  }, [changeOpenProject, detailOrigin]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (indexOpen) {
        closeIndex();
        return;
      }
      if (openProject !== null) closeProject();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeIndex, closeProject, indexOpen, openProject]);

  const project = journey[wrapFeatured(active)];
  const visual = project.world;

  const tiltFeature = (event) => {
    const element = featureRef.current;
    const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!element || !finePointer || reduced || event.pointerType === "touch") return;
    const bounds = element.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    element.style.setProperty("--stamp-tilt-x", `${(-y * 3.2).toFixed(2)}deg`);
    element.style.setProperty("--stamp-tilt-y", `${(x * 3.2).toFixed(2)}deg`);
    element.style.setProperty("--stamp-shift-x", `${(x * 5).toFixed(1)}px`);
    element.style.setProperty("--stamp-shift-y", `${(y * 5 - 7).toFixed(1)}px`);
  };

  const resetFeatureTilt = () => {
    const element = featureRef.current;
    if (!element) return;
    element.style.removeProperty("--stamp-tilt-x");
    element.style.removeProperty("--stamp-tilt-y");
    element.style.removeProperty("--stamp-shift-x");
    element.style.removeProperty("--stamp-shift-y");
  };

  const reorderJourney = useCallback((from, to) => {
    setJourneyKeys((current) => moveJourney(current, from, to));
  }, []);

  const addToJourney = useCallback((key) => {
    setJourneyKeys((current) => (
      current.length >= JOURNEY_MAX ? current : addJourneyKey(current, key)
    ));
  }, []);

  const removeFromJourney = useCallback((key) => {
    setJourneyKeys((current) => removeJourneyKey(current, key));
  }, []);

  const resetJourneyList = useCallback(() => {
    setJourneyKeys(DEFAULT_JOURNEY_KEYS.slice());
  }, []);

  /** Delete a case from the pool for good.
   *
   * The journey is reconciled in the same update so a removed case cannot linger
   * on the poster or leave `wrapFeatured` pointing at a slot that no longer
   * exists. `pruneJourneyToPool` keeps at least the remaining live pool, and the
   * `journeyCount` effect below reels the poster's index back in if it was
   * sitting past the new end. */
  const removeFromPool = useCallback((key) => {
    setRemovedKeys((current) => (current.includes(key) ? current : [...current, key]));
    setJourneyKeys((current) => pruneJourneyToPool(
      current,
      CASE_POOL_KEYS.filter((poolKey) => poolKey !== key),
    ));
  }, []);

  const restorePool = useCallback(() => {
    setRemovedKeys([]);
  }, []);

  /** Recolour one case's two master colours. Both are written together so a
   * half-applied override can never reach a render. */
  const setCaseColor = useCallback((key, channel, value) => {
    setColorOverrides((current) => {
      const fallback = COLOR_DEFAULTS[key];
      if (!fallback) return current;
      const existing = current[key] ?? fallback;
      return { ...current, [key]: { ...existing, [channel]: value } };
    });
  }, []);

  const resetCaseColor = useCallback((key) => {
    setColorOverrides((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  if (openProject !== null) {
    if (detailOrigin === "featured") {
      const featuredProject = journey[wrapFeatured(openProject)];
      if (featuredProject.type === "archive") {
        return (
          <CaseDetail
            project={featuredProject}
            index={featuredProject.archiveIndex}
            total={journeyCount}
            immersive
            returnLabel="返回案例"
            transitionName="case-art"
            onBack={closeProject}
          />
        );
      }
      return (
        <ShowcaseCaseDetail
          project={featuredProject}
          index={wrapFeatured(openProject)}
          total={journeyCount}
          transitionName="case-art"
          onBack={closeProject}
        />
      );
    }

    const project = CASE_PROJECTS[openProject];
    return (
      <CaseDetail
        project={project}
        index={openProject}
        immersive
        transitionName="case-art"
        onBack={closeProject}
      />
    );
  }

  const shownIndex = transition && transition.progress > 0.54
    ? transition.to
    : active;
  const shownProject = journey[wrapFeatured(shownIndex)];
  const shownVisual = shownProject.world;

  // Every child of a scene carries an explicit key. React reuses the stage's
  // scene div by position across a page change, so without keys it matches the
  // children by index too — and the moving scene's travelling stamp is a
  // <button>, so it used to be recycled into the stable scene's *previous peek*
  // button. That node kept the mid-flight transform (`--stamp-x/y/scale`) and
  // the peek's own `transition: transform` then animated it back into place, so
  // the top-left stamp visibly flew in from off-screen while the bottom-right
  // one simply appeared. Distinct keys keep the slots from crossing over.
  const renderWords = (index) => {
    const sceneVisual = journey[wrapFeatured(index)].world;
    return (
      <div className="case-poster-words" aria-hidden="true" key="words">
        <span>{sceneVisual.top}</span>
        <span>{sceneVisual.bottom}</span>
      </div>
    );
  };

  const renderStableScene = () => (
      <div
        className="case-poster-scene is-stable"
        style={{
          "--scene-ink": visual.ink,
          "--scene-accent": visual.accent,
        }}
      >
        {renderWords(active)}

        <button
          type="button"
          className="case-poster-peek is-previous"
          key="peek-previous"
          aria-label={`上一个案例：${journey[wrapFeatured(active - 1)].title}`}
          onClick={() => move(-1)}
        >
          <PosterStamp project={journey[wrapFeatured(active - 1)]} compact />
        </button>
        <button
          type="button"
          className="case-poster-peek is-next"
          key="peek-next"
          aria-label={`下一个案例：${journey[wrapFeatured(active + 1)].title}`}
          onClick={() => move(1)}
        >
          <PosterStamp project={journey[wrapFeatured(active + 1)]} compact />
        </button>

        <button
          ref={featureRef}
          type="button"
          className="case-poster-feature"
          key="feature"
          aria-label={`打开案例：${project.title}`}
          onClick={() => changeOpenProject(active, false, "featured")}
          onPointerMove={tiltFeature}
          onPointerLeave={resetFeatureTilt}
          onBlur={resetFeatureTilt}
        >
          <PosterStamp project={project} transitionName="case-art" />
          <span className="case-poster-open">OPEN CASE</span>
        </button>

        {intro && (
          <span className="case-poster-hero" aria-hidden="true" key="hero">
            <img src={project.cover} alt="" draggable="false" decoding="async" />
          </span>
        )}
      </div>
  );

  const renderMovingScene = (index, role) => {
    const sceneVisual = journey[wrapFeatured(index)].world;
    const { progress, spring, direction, reduced, corners } = transition;
    const outgoing = role === "outgoing";
    const travel = outgoing ? progress : 1 - progress;
    // A "next" page sends the departing case up to the top-left `is-previous`
    // slot and pulls the arriving one out of the bottom-right `is-next` slot; a
    // "previous" page is that mirrored. Either way each leg of the sweep finishes
    // on the corner pose that this same case wears one frame later — position,
    // size, tilt and opacity alike — so the hand-off to the settled composition
    // has nothing left to move. Aiming the flight at a corner by eye leaves the
    // stamp short of it and the settled peek then appears under it.
    const towardsPrevious = outgoing ? direction > 0 : direction < 0;
    const pose = (corners ? corners[towardsPrevious ? "previous" : "next"] : null)
      ?? { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
    // Both words leave on the far side of the sweep's own direction, so the
    // clearance is the one that empties the edge they are heading for.
    const clearance = corners?.word
      ? (direction > 0 ? corners.word.offLeft : corners.word.offRight)
      : 62;
    const x = reduced ? 0 : pose.x * travel;
    const y = reduced ? 0 : pose.y * travel;
    const pop = reduced ? 0 : Math.sin(Math.min(1, travel) * Math.PI);
    const scale = reduced
      ? 1
      : outgoing
        // The departing stamp swells on its way out and still has to land at the
        // corner size, so the spring-back is scaled by that landing size instead
        // of being a fixed amount that overshoots a narrow stamp and undershoots
        // a wide one.
        ? 1 + pop * 0.95 - (1 - pose.scale) * spring
        : pose.scale + spring * (1 - pose.scale);
    const opacity = outgoing
      ? (reduced ? 1 - progress : 1 + (pose.opacity - 1) * progress)
      // The arriving stamp is nearly solid: the shared route passes behind it,
      // so a very translucent arrival would read as a line over the artwork.
      : (reduced ? progress : pose.opacity + (1 - pose.opacity) * progress);
    const wordX = reduced ? 0 : (outgoing ? -direction : direction) * clearance * travel;

    return (
      <div
        className={`case-poster-scene is-${role}`}
        aria-hidden="true"
        style={{
          "--scene-ink": sceneVisual.ink,
          "--scene-accent": sceneVisual.accent,
          "--word-x": `${wordX}vw`,
          "--word-opacity": opacity,
          "--stamp-x": `${x}vw`,
          "--stamp-y": `${y}vh`,
          "--stamp-scale": scale,
          "--stamp-opacity": opacity,
          "--stamp-rotation": `${reduced ? 0 : pose.rotation * travel}deg`,
        }}
      >
        {renderWords(index)}
        <button type="button" className="case-poster-feature" key="travelling-stamp" disabled>
          <PosterStamp project={journey[wrapFeatured(index)]} morph={travel} />
        </button>
      </div>
    );
  };

  return (
    <section
      className={`case-archive case-poster${indexOpen ? " is-index-open" : ""}${intro ? " is-intro" : ""}`}
      aria-label="Case archive"
      aria-describedby="case-poster-instructions"
      aria-busy={Boolean(transition)}
      tabIndex="0"
      style={{
        "--poster-background": visual.background,
        "--poster-ink": shownVisual.ink,
        "--poster-accent": shownVisual.accent,
      }}
      onKeyDown={(event) => {
        if (indexOpen) return;
        if (event.repeat) return;
        if (
          event.key === "ArrowLeft"
          || event.key === "ArrowUp"
          || event.key === "PageUp"
          || (event.key === " " && event.shiftKey)
        ) {
          event.preventDefault();
          move(-1);
        }
        if (
          event.key === "ArrowRight"
          || event.key === "ArrowDown"
          || event.key === "PageDown"
          || (event.key === " " && !event.shiftKey)
        ) {
          event.preventDefault();
          move(1);
        }
        if (event.key === "Enter") changeOpenProject(active, false, "featured");
      }}
      onWheel={(event) => {
        if (indexOpen) return;
        event.preventDefault();
        const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
        if (Math.abs(delta) < 7) return;

        window.clearTimeout(wheelReset.current);
        wheelReset.current = window.setTimeout(() => {
          wheelReady.current = true;
        }, 170);

        if (!wheelReady.current) return;
        wheelReady.current = false;
        move(delta > 0 ? 1 : -1);
      }}
      onTouchStart={(event) => {
        if (indexOpen) return;
        const touch = event.touches[0];
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        if (indexOpen) return;
        if (touchStart.current === null) return;
        const touch = event.changedTouches[0];
        const distanceX = touchStart.current.x - (touch?.clientX ?? touchStart.current.x);
        const distanceY = touchStart.current.y - (touch?.clientY ?? touchStart.current.y);
        const distance = Math.abs(distanceY) > Math.abs(distanceX) ? distanceY : distanceX;
        touchStart.current = null;
        if (Math.abs(distance) > 44) move(distance > 0 ? 1 : -1);
      }}
      onPointerDown={(event) => {
        if (indexOpen || event.pointerType === "touch" || event.button !== 0) return;
        if (event.target.closest?.("button, a")) return;
        pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (pointerStart.current?.id !== event.pointerId) return;
        const distanceX = pointerStart.current.x - event.clientX;
        const distanceY = pointerStart.current.y - event.clientY;
        const distance = Math.abs(distanceY) > Math.abs(distanceX) ? distanceY : distanceX;
        pointerStart.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (Math.abs(distance) > 48) move(distance > 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        pointerStart.current = null;
      }}
    >
      <p id="case-poster-instructions" className="sr-only">
        使用滚轮、拖拽、滑动、方向键或翻页按钮浏览案例；按回车打开当前案例。
      </p>
      <div className="case-poster-background is-current" style={{ background: visual.background }} />
      {transition && (
        <div
          className="case-poster-background is-incoming"
          style={{
            background: journey[wrapFeatured(transition.to)].world.background,
            transform: transition.reduced
              ? "none"
              : `translateX(${transition.direction * (1 - transition.progress) * 100}%)`,
            opacity: transition.reduced ? transition.progress : 1,
          }}
        />
      )}

      {/* The words, the stamps and the dashed route are one composition, so this
          single wrapper scales them together: the route measures its own
          `getBoundingClientRect()` and rebuilds its dashes from it, so shrinking
          the wrapper shrinks the line with the stamps instead of leaving a
          full-size route behind a smaller card. The inset that clears the fixed
          header lives here too, which is why the stage below never has to know
          about the chrome. */}
      <div className="case-poster-frame">
        <PosterRoute
          move={transition && !transition.reduced ? transition.time : null}
          delay={intro ? 1050 : 80}
        />

        <div className="case-poster-stage">
          {transition
            ? (
              <>
                {renderMovingScene(transition.from, "outgoing")}
                {renderMovingScene(transition.to, "incoming")}
              </>
            )
            : renderStableScene()}
        </div>
      </div>

      <p className="case-poster-mode">{transition ? "MOVING" : "SCROLL · SWIPE · DRAG"}</p>

      <button
        type="button"
        className="case-poster-arrow is-left"
        aria-label={`上一个精选案例：${journey[wrapFeatured(shownIndex - 1)].title}`}
        onClick={() => move(-1)}
      >
        <ArrowLeft aria-hidden="true" />
        <span>PREV</span>
      </button>
      <button
        type="button"
        className="case-poster-arrow is-right"
        aria-label={`下一个精选案例：${journey[wrapFeatured(shownIndex + 1)].title}`}
        onClick={() => move(1)}
      >
        <span>NEXT</span>
        <ArrowRight aria-hidden="true" />
      </button>

      <button
        type="button"
        className="case-poster-all"
        onClick={() => setIndexOpen(true)}
      >
        CASE LIBRARY
      </button>
      <p className="case-poster-credit">
        <span>{shownProject.tags}</span>
        <strong>{shownProject.title}</strong>
        <time>{shownProject.year}</time>
      </p>

      {/* Developer panel, not a designed page.
       *
       * This is a working tool for inspecting and reordering the case pool, so it
       * is deliberately plain: a native <dialog>-style box, system monospace, no
       * poster fonts, no brand colours, no entrance animation. It reads like
       * devtools because that is what it is — the styled "CASE LIBRARY" surface
       * it replaces kept being mistaken for product UI, and its centred header
       * collided with the nav once the nav moved up.
       *
       * The data and the journey editing are unchanged: same CASE_PROJECTS list,
       * same open-a-case action (`detailOrigin: "library"`), same JourneyEditor. */}
      {indexOpen && (
        <section
          className="case-devpanel"
          role="dialog"
          aria-modal="true"
          aria-label="案例库开发者面板"
        >
          <header className="case-devpanel-bar">
            <strong>case pool</strong>
            <span className="case-devpanel-meta">
              {journeyCount} / {JOURNEY_MAX} in journey
              {" · "}
              {livePool.length} live
              {removedKeys.length > 0 ? ` · ${removedKeys.length} deleted` : ""}
            </span>
            <span className="case-devpanel-spacer" />
            {removedKeys.length > 0 && (
              <button type="button" className="case-devpanel-btn" onClick={restorePool}>
                restore {removedKeys.length} deleted
              </button>
            )}
            <button
              type="button"
              className="case-devpanel-btn"
              aria-pressed={editing}
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "done" : "edit journey"}
            </button>
            <button type="button" className="case-devpanel-btn" onClick={closeIndex}>
              close
            </button>
          </header>

          <div className="case-devpanel-body">
            {editing ? (
              <JourneyEditor
                journey={journey}
                pool={addablePool}
                onMove={reorderJourney}
                onAdd={addToJourney}
                onRemove={removeFromJourney}
                onReset={resetJourneyList}
                isDefault={isDefaultJourney(journeyKeys, DEFAULT_JOURNEY_KEYS)}
                max={JOURNEY_MAX}
              />
            ) : (
              /* Every case in the pool, one row each: two colour pickers for the
                 case's master colours, its identity, and a delete. The colours
                 are live — the row writes straight into `colorOverrides`, so the
                 poster repaints as the picker moves. */
              <ol className="case-devpanel-list">
                {livePool.map((entry) => {
                  const colors = colorOverrides[entry.key] ?? COLOR_DEFAULTS[entry.key];
                  const onJourney = journeyKeys.includes(entry.key);
                  return (
                    <li key={entry.key} className="case-devpanel-item">
                      <span className="case-devpanel-n">
                        {entry.type === "live" ? "L" : String(entry.archiveIndex + 1).padStart(2, "0")}
                      </span>
                      <span className="case-devpanel-copy">
                        <button
                          type="button"
                          className="case-devpanel-title case-devpanel-open"
                          onClick={() => {
                            if (entry.type === "archive") {
                              changeOpenProject(entry.archiveIndex, false, "library");
                            }
                          }}
                          disabled={entry.type !== "archive"}
                        >
                          {entry.title}
                        </button>
                        <span className="case-devpanel-key">
                          {entry.key} · {entry.tags} · {entry.year}
                          {onJourney ? " · on journey" : ""}
                        </span>
                      </span>
                      <span className="case-devpanel-colors">
                        <label className="case-devpanel-color">
                          <input
                            type="color"
                            value={colors.background}
                            aria-label={`${entry.title} 背景色`}
                            onChange={(event) => setCaseColor(entry.key, "background", event.target.value)}
                          />
                          <span>bg</span>
                        </label>
                        <label className="case-devpanel-color">
                          <input
                            type="color"
                            value={colors.ink}
                            aria-label={`${entry.title} 文字色`}
                            onChange={(event) => setCaseColor(entry.key, "ink", event.target.value)}
                          />
                          <span>ink</span>
                        </label>
                        {colorOverrides[entry.key] && (
                          <button
                            type="button"
                            className="case-devpanel-btn case-devpanel-sm"
                            onClick={() => resetCaseColor(entry.key)}
                          >
                            reset
                          </button>
                        )}
                      </span>
                      <button
                        type="button"
                        className="case-devpanel-btn case-devpanel-sm case-devpanel-del"
                        aria-label={`删除案例 ${entry.title}`}
                        onClick={() => removeFromPool(entry.key)}
                      >
                        delete
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
