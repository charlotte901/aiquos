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

const CASE_PROJECTS = [  {
    title: "Aiquos Identity Refresh",
    tags: "品牌重塑 · 视觉系统",
    year: 2025,
    description:
      "一次由 AI 参与收敛的品牌重塑。以原有的粉色为起点，标志的多个方向、字体配对与页面节奏都由模型先铺开，再由人挑出最安静的那一版——目标是让网站、印刷物和展陈物料说出同一种语气。",
  },  {
    title: "Spatial Learning Toolkit",
    tags: "学习路径 · 空间模块",
    year: 2025,
    description:
      "AI 把抽象的学习路径摊开成可以拖动的空间模块。信息架构与交互原型由模型快速铺出多套方案，人负责判断哪一种真的让人看得清任务的全貌和彼此的依赖关系。",
  },  {
    title: "Studio Workflow Assistant",
    tags: "协作面板 · 流程梳理",
    year: 2025,
    description:
      "AI 为小型工作室起草的协作面板。流程梳理、字段设计与说明文案都由模型先给出，把简报、素材、修改记录和交付检查收进同一条流程，减少在多个工具之间搬运信息的次数。",
  },  {
    title: "Retail Navigation Concept",
    tags: "门店导览 · 实时路线",
    year: 2024,
    description:
      "AI 参与设计的门店导览概念。实时路线与分层信息如何降噪、促销信息该压到多低，都由模型先给出可比较的版本，再用真实动线验证——让指引只在需要的时候出现。",
  },  {
    title: "Quiet City Guide",
    tags: "城市漫游 · 编辑体例",
    year: 2024,
    description:
      "AI 按编辑体例产出的低干扰城市漫游内容。图片筛选、短段落撰写与步行路线编排批量生成，人再删掉多余的部分，让散步重新变成一件可以自己发现事情的过程。",
  },  {
    title: "Modular Sound Archive",
    tags: "声音档案 · 片段重组",
    year: 2024,
    description:
      "AI 把声音档案拆成了可组合的片段。素材的标签体系与检索维度由模型从原始录音中提取，访问者能按地点、时间和材质重新编排自己的听觉路径，同一批素材可以拼出完全不同的叙事。",
  },  {
    title: "The Last Ice",
    tags: "海报设计 · 视觉定稿",
    year: 2026,
    description:
      "为一部虚构的气候短片设计的海报，视觉方向由 AI 生成、人来定稿。一块巨大的冰被当作棚拍产品来打光，冰里封着一把鲜红的塑料椅，荒谬却拍得像真的。珊瑚橘的纸面上只留大片空白，所有信息都用贴纸完成——深蓝的片名、写着 42°C 的圆标、银灰的 KEEP UNTIL SUNSET、红底编号 03，全部歪斜、卷边、裁切不齐。手写的一句 “it was still cold when we left.” 让整张海报停在一种安静的荒谬上。",
  },

];

const LIVE_CASE_DETAILS = {
  // These descriptions are the argument the assessment page makes, made concrete:
  // each one leads with what the AI did, then gives the detail that makes the
  // claim checkable. The opening sentence becomes the standfirst in the immersive
  // layout, so it has to stand alone as the capability statement.
  "wing-it": {
    title: "Wing It",
    tags: "分镜剪辑 · 中文配音",
    year: 2026,
    description:
      "AI 把一段故事剪成了成片。分镜、节奏、转场与中文解说词由模型给出，配音也由模型合成，人只负责提出想要的方向。音轨可以单独开关，方便对照画面与解说。",
  },
  mario: {
    title: "超级马里奥",
    tags: "游戏代码 · 可试玩",
    year: 2026,
    description:
      "AI 写出了一款能玩的游戏，而不是画了一张游戏截图。横版关卡、碰撞判定与镜头跟随都由模型产出的代码驱动，在这个页面里实时运行——你可以直接上手操作。",
  },
  conbini: {
    title: "日式便利店",
    tags: "场景生成 · 实时渲染",
    year: 2026,
    description:
      "AI 搭出了一个可以走进去的雨夜街角。霓虹招牌、积水反光与店内灯光不是渲染好的影片，而是实时计算的光照——角度一直在变，画面一直在动。",
  },
  pirate: {
    title: "暴风雨海盗船",
    tags: "海浪模拟 · 实时演算",
    year: 2026,
    description:
      "AI 让一艘船在风暴里真实地摇晃。浪涌高度、船体姿态与天色变化互相关联，不是循环播放的动画，而是持续演算的动态过程。",
  },
  penguin: {
    title: "企鹅叠叠乐",
    tags: "文生模型 · 一键生成",
    year: 2026,
    description:
      "一句话就生成了一个可用的 3D 模型。输入只有一句描述——一只顶着红茶、奶盅与橡皮鸭的企鹅——模型直接给出完整的网格、贴图与法线，没有手工建模，也没有中途修形。",
  },
  "moon-route": {
    title: "人类登上月球",
    tags: "史料整理 · 信息图",
    year: 1969,
    description:
      "AI 把一堆史料整理成了一张看得懂的图。阿波罗十一号的六个节点——升空、地月转移、环月轨道、鹰号落月、月面停留、溅落太平洋——各自带着日期落在手绘航线上。米黄新闻纸与朱红套印是模型按当年报纸制图语言还原的版式。",
  },
  "onboarding-schedule": {
    title: "迎新志愿服务排班表",
    tags: "需求排班 · 表格生成",
    year: 2026,
    description:
      "AI 把零散的迎新需求排成了一张能直接执行的表。服务点位、时段、人数与负责人之间的约束由模型自己权衡，65 名志愿者被分配到 17 个点位上，谁值全天、谁只来上午，都在表里对齐。表头、合并单元格与分页沿用了 Excel 的版式，输出即可交付。",
  },
  "stop-motion": {
    title: "纸箱宇航员",
    tags: "定格动画 · 逐帧拍摄",
    year: 2026,
    description:
      "AI 拍出了一部定格动画，而不是一段流畅的 CG。飞船内壁的划痕、毛毡宇航服的绒毛与角色的每一次顿挫都带着逐帧拍摄的手感，灯光在金属面板上留下真实的色偏。角色动作逐帧推进，飞船起降、舱门开合与角色行走都按定格节奏一格格拍出来。",
  },
  "security-audit": {
    title: "红客挑战赛",
    tags: "安全审计 · 双漏洞",
    year: 2026,
    description:
      "在官方授权的竞赛环境中，模型对字节跳动某平台的 AI 视频生成服务发起测试。它没有依赖任何人工提示或既有 POC，自己从全量网络流量中定位关键接口，推断出只在前端生效的产品约束，构造请求验证服务端校验缺位；随后又通过差分请求推断出敏感能力的门控只依赖客户端可写配置。两处缺陷相互独立，模型都完成了请求重放、成品留存与客观指标实测，并输出 P0–P2 纵深防御方案。全程无人工介入。",
  },
  "browser-ops": {
    title: "电脑控制",
    tags: "浏览器操作 · 无人值守",
    year: 2026,
    description:
      "AI 直接接管了一台电脑的浏览器，而不是调用某个站点的接口。它在地图上拖动平移、按缩放按钮逐级放大；在 Wikipedia 的表单里输入关键词、检索并跳到指定章节；在 Excalidraw 的画布上用鼠标拖出矩形、椭圆与一条自由曲线。整段过程没有写死的坐标脚本，页面布局变了它就重新找目标，全部动作实时完成，全程无人值守。",
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
  { top: "ROSTER", bottom: "READY", background: "#2f6f8f", ink: "#eaf6ff", accent: "#ffd98a" },
  { top: "FRAME", bottom: "BYFRAME", background: "#8a5a3c", ink: "#ffe8cf", accent: "#bfe3a0" },
  { top: "TRACE", bottom: "PROOF", background: "#3a4a5c", ink: "#e8edf3", accent: "#ffd98a" },
  { top: "STACK", bottom: "BALANCE", background: "#6d5a8f", ink: "#fff0e2", accent: "#a8e0c0" },
  { top: "ORBIT", bottom: "RETURN", background: "#2b3a52", ink: "#f2e6cf", accent: "#e8b96a" },
  { top: "AUTOMATE", bottom: "UNATTENDED", background: "#37503f", ink: "#e6f2e8", accent: "#ffd98a" },
  { top: "KEEP", bottom: "UNTIL SUNSET", background: "#e8623c", ink: "#2b1a12", accent: "#ffd98a" },
];

/** Which world each case wears, keyed by case rather than by position.
 *
 * This used to be `POSTER_WORLDS[poolIndex % POSTER_WORLDS.length]`. That only
 * held while the pool stayed the length the list was written for: the moment
 * archive cases were deleted the modulus shifted and every case from the first
 * live one onwards wore its neighbour's words — Wing It came up under
 * SUPER/MARIO, 纸箱宇航员 under EXPLORE/CONNECT. Binding by key means deleting,
 * reordering or inserting cases can never move the words again. Cases with no
 * entry fall back positionally, so a newly added case still gets a world. */
const WORLD_KEYS = {
  "live:wing-it": "WING",
  "live:mario": "SUPER",
  "live:conbini": "NIGHT",
  "live:pirate": "BRAVE",
  "live:penguin": "STACK",
  "live:moon-route": "ORBIT",
  "live:onboarding-schedule": "ROSTER",
  "live:stop-motion": "FRAME",
  "live:security-audit": "TRACE",
  "live:browser-ops": "AUTOMATE",
};

// Retail Navigation Concept is the archive case that positionally owned
// NOTICE/WONDER, so it keeps them; 电脑控制 gets words of its own.
const ARCHIVE_WORLD_KEYS = { 3: "NOTICE", 6: "KEEP" };

const WORLD_BY_TOP = Object.fromEntries(POSTER_WORLDS.map((world) => [world.top, world]));

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
  const named =
    WORLD_BY_TOP[WORLD_KEYS[entry.key]] ?? WORLD_BY_TOP[ARCHIVE_WORLD_KEYS[entry.archiveIndex]];
  entry.world = named ?? POSTER_WORLDS[poolIndex % POSTER_WORLDS.length];
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

/** The journey the poster opens with: every live scene, plus as many archive
 * covers as the cap allows.
 *
 * The archive share is derived rather than written down. It used to be a literal
 * six, which silently stopped matching once the cap was raised to twenty.
 *
 * The newest cover gets an explicit slot because newly added cases are appended
 * to `CASE_PROJECTS`, so a front-fill slice can miss them. The dedupe is what
 * keeps that slot safe now the archive list can be shorter than the front-fill:
 * in that case the newest case is already in the slice, and adding it again would
 * put the same poster on the wheel twice. */
const NEWEST_ARCHIVE_KEY = `archive:${CASE_PROJECTS.length - 1}`;
const DEFAULT_JOURNEY_KEYS = [
  ...new Set([
    ...CASE_PROJECTS
      .slice(0, Math.max(0, JOURNEY_MAX - LIVE_CASES.length - 1))
      .map((_, index) => `archive:${index}`),
    NEWEST_ARCHIVE_KEY,
    ...LIVE_CASES.map((item) => `live:${item.id}`),
  ]),
].slice(0, JOURNEY_MAX);

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
        {/* Each kind tells the reader what is actually on screen — a still has no
            interaction to offer, so the live-scene hint would be a false promise.
            The scene line names what is being generated before it lists the
            controls, because the point of the case is the generation, not the UI. */}
        {project.kind === "video"
          ? "AI 生成 · 循环播放 · 可开声音"
          : project.kind === "still"
            ? "AI 生成 · 整版呈现"
            : "AI 实时生成 · 可拖动 · 可交互"}
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

/** Split a case description into its two halves at the first sentence break.
 *
 * The detail view sets the copy across both side columns — the opening sentence
 * as a standfirst on the left, the rest as the body on the right — because a left
 * column holding only the work number and a tag line left the composition visibly
 * lopsided against a title and a full paragraph on the right.
 *
 * Splitting on punctuation rather than storing two fields keeps every existing
 * description valid: there is no second string to author or to fall out of sync.
 * A single-sentence description has no break to make, so the whole thing goes
 * right rather than leaving the left column holding a half-phrase. */
function splitDescription(text) {
  const value = typeof text === "string" ? text.trim() : "";
  const match = value.match(/^([\s\S]*?[。！？])\s*([\s\S]*)$/);
  if (!match || !match[2].trim()) return { lead: "", body: value };
  return { lead: match[1], body: match[2].trim() };
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
  // Live cases carry their own cover; archive entries are addressed by position.
  // Using the positional image for a live case showed an unrelated archive poster
  // as the detail artwork and, worse, blurred that poster behind the piece.
  const artwork = project.cover ?? projectImage(index);
  // The standfirst only exists in the immersive split layout; the stacked panel
  // keeps the description in one piece.
  const { lead, body } = splitDescription(project.description);
  // The blurred backdrop is derived from the case's own artwork and ground
  // colour, so it can never introduce a hue the piece did not have. Both travel
  // as custom properties rather than inline background styles, which keeps the
  // blur radius and veil opacity tunable in CSS.
  const backdropStyle = immersive
    ? {
      "--detail-art": `url("${artwork}")`,
      "--detail-ground": project.world?.background ?? "#171512",
    }
    : undefined;

  return (
    <section
      className={`case-archive case-detail${immersive ? " is-immersive" : ""}`}
      aria-label="Case detail"
      style={backdropStyle}
    >
      <button className="case-detail-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        {returnLabel}
      </button>
      {/* Two decorative layers behind the content: the blurred artwork, and a
          veil tinted with the poster's ground. Both are inert — they exist only
          to give the artwork somewhere to sit. */}
      {immersive && (
        <>
          <div className="case-detail-blur" aria-hidden="true" />
          <div className="case-detail-veil" aria-hidden="true" />
        </>
      )}
      <div className="case-detail-body">
        {/* Immersive only: the archival facts become their own column on the
            left, so the artwork can sit dead centre between two balanced
            annotations. The plain (non-immersive) layout keeps its single
            stacked info panel, which is why this is conditional rather than a
            permanent split. */}
        {immersive && (
          <div className="case-detail-aside is-meta">
            <p className="case-detail-index">
              Work {String(index + 1).padStart(2, "0")} / {total}
            </p>
            <p className="case-detail-meta">
              {project.tags}
              <i aria-hidden="true">•</i>
              {project.year}
            </p>
            {/* The description's opening sentence continues on the right, so the
                two halves read in order across the artwork. Wide layout only —
                with one column there is no left side to balance, and the body in
                the right column carries the whole description instead. */}
            {lead ? <p className="case-detail-lead">{lead}</p> : null}
          </div>
        )}
        <figure
          className="case-detail-figure"
          style={transitionName ? { viewTransitionName: transitionName } : undefined}
        >
          <img
            src={artwork}
            alt={project.title}
            draggable="false"
          />
        </figure>
        <div className="case-detail-info">
          {!immersive && (
            <p className="case-detail-index">
              Work {String(index + 1).padStart(2, "0")} / {total}
            </p>
          )}
          <h1>{project.title}</h1>
          {!immersive && (
            <p className="case-detail-meta">
              {project.tags}
              <i aria-hidden="true">•</i>
              {project.year}
            </p>
          )}
          <p className="case-detail-copy">{immersive && lead ? body : project.description}</p>
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
  // The transforms below consume `cqw` / `cqh`, which resolve against the 16:9
  // design box (`.case-poster-scaler`), not the window. Measuring against
  // `innerWidth`/`innerHeight` would put the corner poses out by however much
  // the box is letterboxed — a growing error as the window leaves 16:9.
  const design = scene.closest(".case-poster-scaler") ?? scene;
  const designBox = design.getBoundingClientRect();
  const width = designBox.width || 1;
  const height = designBox.height || 1;
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
  const designLeft = designBox.left;
  const designRight = designBox.right;
  poses.word = {
    offLeft: (Math.max(...boxes.map((box) => box.right - designLeft)) / width) * 100,
    offRight: (Math.max(...boxes.map((box) => designRight - box.left)) / width) * 100,
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
  const [journeyKeys, setJourneyKeys] = useState(() =>
    readJourney(CASE_POOL_KEYS, DEFAULT_JOURNEY_KEYS, JOURNEY_MAX),
  );
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

    // Opened from the developer panel. Read through the pool rather than from
    // `CASE_PROJECTS` directly: the pool is what carries each case's `world`, so
    // going straight to the source list would drop the poster's colours and any
    // recolour applied in the panel, leaving the blurred backdrop on its
    // fallback ground.
    const project = livePoolByKey.get(`archive:${openProject}`) ?? CASE_PROJECTS[openProject];
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
        {/* The 16:9 design box. `PosterRoute` and the stage both live inside it
           so the dashed route's coordinate space and the stamps it points at
           stay in register, and so every child can be sized as a percentage of
           this box instead of the viewport. */}
        <div className="case-poster-scaler">
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
