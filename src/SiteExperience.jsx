import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Fingerprint, SealCheck } from "@phosphor-icons/react";
import { App } from "./App";
import { AssessmentHub } from "./AssessmentHub";
import { AssessmentMap, AssessmentTask, ComprehensivePapers } from "./AssessmentFlow";
import { ErrorBoundary } from "./ErrorBoundary";
import { AccountSettings } from "./AccountSettings";
import { ChooseHub } from "./ChooseHub";
import { AwakeningReport } from "./AwakeningReport";
import { ProfileHub } from "./ProfileHub";
import { ProfileDetail } from "./ProfileDetail";
import { LoginForm } from "./LoginForm";
import { adoptAuthenticatedProfile } from "./account-store";
import { apiListAssignments, apiMe, readProfile } from "./auth-client";
import {
  readActiveAssignmentId,
  reportRunSnapshot,
  writeActiveAssignmentId,
} from "./run-report";
import { assessmentHash, getAssessmentRoute } from "./assessment-flow";
import { siteViewForHash } from "./routes";
import { readEdition, writeEdition } from "./bank-editions";
import { loadExposureStore, saveExposureStore } from "./comprehensive-adaptive";
import { COMPREHENSIVE_PHASES, phaseCount } from "./assessment-timing";
import {
  answerCredit,
  appendExternalEvidence,
  appendHistorySnapshot,
  clearAttemptDraft,
  createAttempt,
  currentResult,
  finalizeAttempt,
  isAttemptComplete,
  loadAttemptDraft,
  readCurrentBankVersion,
  recordAnswer,
  recordInterviewScore,
  saveAttemptDraft,
  snapshotAttempt,
  withBankVersion,
  writeCurrentBankVersion,
} from "./assessment-attempt";
import { getProfileDetailId, getProfileDetailRoute } from "./profile-layout";
import { animateCards } from "./card-transition";
import { CUBE_TURN_DURATION } from "./cube-geometry";
import {
  animateStrips,
  collectSceneFrames,
  freezeView,
  holdView,
  measureAssessmentBands,
} from "./split-transition";
import { animateScrollPage } from "./transitions";
import { pushPages } from "./slide-transition";
import { skipCaseIntro } from "./CaseArchive";
import { getStageSize } from "./stage";
import { LoginTransitionOverlay, getStoredScheme, prewarmLoginTransition } from "./transitions/LoginTransitionOverlay";
import { SchemeSwitcher } from "./transitions/SchemeSwitcher";

// A move with no cards to cut around takes the whole frame as one band.
const defaultBands = () => {
  const height = getStageSize()[1];
  return [0, 0, height, height];
};

// Upper bound on evidence a whole timed run can collect (objective ≤14,
// conversation ≤5 ladder slots, practical 1) — finalised down to the real
// count when the run completes.
const EVIDENCE_BUDGET = 40;

// Single source of truth for hash → view; see src/routes.js.
const route = () => siteViewForHash();

const isAdaptiveDebugOn = () => {
  try {
    return localStorage.getItem("aiquos.debug") === "1";
  } catch {
    return false;
  }
};

// Reconstruct the routing signal of the latest answered question from draft
// evidence, so a reload between answering and the next request loses nothing.
const outcomeFromEvidence = (item) => {
  if (!item || typeof item.credit !== "number") return null;
  return {
    outcome: item.credit >= 1 ? "correct" : item.credit <= 0 ? "wrong" : "partial",
    credit: item.credit,
    questionId: item.questionId,
  };
};

const PANEL = {
  home: "cube",
  login: "login-page",
  choose: "choose",
  assessments: "assessments",
  cases: "cube",
  forum: "cube",
  "account-settings": "account-settings",
  reports: "reports",
  "profile-detail": "profile-detail",
  profile: "profile",
  "assessment-map": "assessment-flow",
  "assessment-task": "assessment-flow",
};
// CHOOSE keeps the cube still; its strip pull uses the live homepage as the
// outgoing surface. Return moves pull the same bands back. Login scrolls and
// choose/test/center pages fly whole cards.
const SCROLL_MOVES = new Set([
  "home>login",
  "login>home",
  "cases>login",
  "forum>login",
]);
const STRIP_MOVES = new Set([
  "home>choose",
  "login>choose",
  "choose>login",
  "choose>home",
]);
const REVERSE_STRIP_MOVES = new Set(["choose>login", "choose>home"]);
const CARD_MOVES = new Set([
  "choose>assessments",
  "assessments>choose",
  "choose>profile",
  "profile>choose",
]);
// Homepage and case library share one panel node, so they cannot be frozen and
// cut like the moves above; they push instead, on the live layers themselves.
// We extend the slide transition to cover Home ↔ Cases ↔ Forum across all three tabs.
const SLIDE_MOVES = new Set([
  "home>cases",
  "cases>home",
  "home>forum",
  "forum>home",
  "cases>forum",
  "forum>cases",
]);
const TAB_ORDER = { home: 0, cases: 1, forum: 2 };

function waitForCubeSettle() {
  return new Promise((resolve) => {
    const cube = document.querySelector(".cube-display");
    if (!cube) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cube.removeEventListener("aiquos:cube-settled", finish);
      resolve();
    };
    const timeout = setTimeout(finish, CUBE_TURN_DURATION * 4 + 1000);
    cube.addEventListener("aiquos:cube-settled", finish, { once: true });
  });
}

export function SiteExperience() {
  const [view, setView] = useState(route);
  const [assessmentRoute, setAssessmentRoute] = useState(
    () => getAssessmentRoute() ?? { id: "comprehensive", stage: 1, mode: "map" },
  );
  const [profileDetailRoute, setProfileDetailRoute] = useState(() => getProfileDetailRoute());
  // 学生收件箱：老师推送的组卷作业（测评选择页常驻展示）。登录态变化与
  // 每次完成上报后刷新；未登录保持空（收件箱本来就是登录功能）。
  const [hubAssignments, setHubAssignments] = useState([]);
  const refreshHubAssignments = useCallback(async () => {
    if (!readProfile()) {
      setHubAssignments([]);
      return;
    }
    try {
      setHubAssignments(await apiListAssignments());
    } catch {
      setHubAssignments([]); // 拉取失败静默：hub 的空态提示已覆盖
    }
  }, []);
  useEffect(() => {
    refreshHubAssignments();
  }, [refreshHubAssignments]);
  // 完成一次综合测评后收件箱的 myRun 会变（已完成+分数），上报后刷新。
  useEffect(() => {
    if (view === "assessments" || (view === "assessment-map" && assessmentRoute.id === "comprehensive")) {
      refreshHubAssignments();
    }
  }, [view, assessmentRoute.id, refreshHubAssignments]);
  const [progress, setProgress] = useState(() => {
    const base = {
      comprehensive: 1,
      objective: 1,
      conversation: 1,
      practical: 1,
    };
    // A reloaded draft also restores how far the map was unlocked, so 继续测评
    // lands on the right phase instead of redoing completed ones.
    const draft = loadAttemptDraft();
    if (draft && draft.assessmentId === "comprehensive" && Array.isArray(draft.phasesDone)) {
      base.comprehensive = Math.min(phaseCount("comprehensive"), draft.phasesDone.length + 1);
    }
    return base;
  });
  // One comprehensive Attempt at a time: evidence from every submitted answer
  // accumulates here and is rescored from the complete set (integration guide).
  // An unfinished draft survives reloads; a completed attempt becomes an
  // immutable history snapshot exactly once. The draft also carries the
  // server's routing session so a resumed run keeps its adaptive position.
  const bootstrap = useRef(null);
  if (!bootstrap.current) {
    // Drafts resume only against the bank version the server last served
    // (cached locally); falls back to the code constant before any fetch.
    const draft = loadAttemptDraft(readCurrentBankVersion());
    bootstrap.current = {
      state: draft ? { attempt: draft, result: currentResult(draft) } : { attempt: null, result: null },
      routing: draft?.routing ?? null,
      phasesDone: Array.isArray(draft?.phasesDone) ? draft.phasesDone : [],
      pendingOutcome: draft?.evidence?.length
        ? outcomeFromEvidence(draft.evidence[draft.evidence.length - 1])
        : null,
    };
  }
  const [attemptState, setAttemptState] = useState(() => bootstrap.current.state);
  // Server-authoritative routing: this client only carries the opaque session
  // between requests. Selection lives in worker/comprehensive-quiz.js.
  const routingRef = useRef(bootstrap.current.routing);
  const pendingOutcomeRef = useRef(bootstrap.current.pendingOutcome);
  // 对话通道的最新评分摘要（ref 版）：fetchComprehensiveQuestion 是
  // useCallback([])，读 state 会拿到旧闭包；客观题第一题请求要靠它带上
  // 定档输入。submitInterviewScore 每次判分后同步刷新。
  const interviewRef = useRef(bootstrap.current.state.attempt?.interview ?? null);
  // Which timed phases (conversation/objective/practical) a resumed draft has
  // already finished — persists with the draft so the map unlocks correctly.
  const phasesDoneRef = useRef(Array.isArray(bootstrap.current.phasesDone) ? bootstrap.current.phasesDone : []);
  // Routing telemetry for the optional aiquos.debug overlay; off by default.
  const [adaptiveTelemetry, setAdaptiveTelemetry] = useState(null);
  // 服务端定档先验的镜像：停止判据（shouldStopCat 的 SE 分母）必须与
  // 路由同一口径计入先验信息量，否则「定档提前停」在客户端永远不触发。
  // 续答恢复时从 draft 的 routing session 里带回来——否则客观题中途刷新
  // 后客户端 SE 口径与服务端路由不一致（只影响停止时机，不影响分数）。
  const [adaptivePrior, setAdaptivePrior] = useState(() => bootstrap.current.routing?.prior ?? null);
  // 每次进入任务页递增，作为 AssessmentTask 的 key。
  // 没有它时，从 TEST 页再次进入同一关卡会复用上一次的组件实例，
  // 上一轮的对话记录、计时归零与「已结束」状态会残留（学员看到无法作答的死页面）。
  const [taskEntryId, setTaskEntryId] = useState(0);
  // 进入作业前的自选题库版本：作业完成上报后还原（见 completeAssessmentStage）。
  const editionBeforeAssignmentRef = useRef(null);
  const [moving, setMoving] = useState(false);
  // Narrower than `moving`: true only while a page push is in flight. The two
  // pages are siblings and only one of them is the current tab, so switching
  // tabs unmounts the other one — fine when it is merely not shown, fatal on the
  // way back, where the departing archive would be deleted on frame one instead
  // of travelling out. See the `tab !== "home" || pushing` test in App.jsx.
  // Deliberately not `moving`, which is also raised for the scroll and frozen
  // moves: those would keep the archive mounted under an unrelated transition.
  const [pushing, setPushing] = useState(false);
  // The tab we're pushing FROM and TO. App uses these to mount only the two
  // involved tab screens during a slide, never the unrelated third one.
  const [pushFrom, setPushFrom] = useState(null);
  const [pushTo, setPushTo] = useState(null);
  const [cubeMounted, setCubeMounted] = useState(
    () => ["home", "login", "cases", "forum"].includes(route()),
  );
  const [homeShellFlat, setHomeShellFlat] = useState(() => route() === "choose");
  const [transitionScheme, setTransitionScheme] = useState(() => getStoredScheme());
  const [webglTransition, setWebglTransition] = useState({
    active: false,
    reverse: false,
    entered: false,
  });
  const panels = useRef({});
  const stage = useRef(null);
  const busy = useRef(false);

  // Kept in a ref so the completion callback identity never changes mid-flight:
  // the overlay's animation effect depends on it, and a new identity would
  // tear down and restart an in-air ticket.
  const webglTransitionRef = useRef(webglTransition);
  useEffect(() => {
    webglTransitionRef.current = webglTransition;
  }, [webglTransition]);
  // Flight finished: the view swaps UNDER the overlay's held final frame, so
  // the real page is already in place while the frozen flight dissolves.
  // Releasing (the overlay's fade-out end) is what unmounts it.
  const handleTransitionComplete = useCallback(() => {
    const { active, reverse } = webglTransitionRef.current;
    if (!active) return;
    if (!reverse) {
      flushSync(() => {
        setView("login");
        setWebglTransition((prev) => ({ ...prev, entered: true }));
      });
      history.pushState(null, "", "#login");
    } else {
      flushSync(() => {
        setView("home");
        setWebglTransition((prev) => ({ ...prev, entered: false }));
      });
      history.pushState(null, "", "#home");
    }
    window.scrollTo(0, 0);
    busy.current = false;
    setMoving(false);
  }, []);
  const handleTransitionRelease = useCallback(() => {
    const { reverse } = webglTransitionRef.current;
    setWebglTransition({ active: false, reverse: false, entered: !reverse });
  }, []);
  useEffect(() => {
    const pop = () => {
      const nextAssessment = getAssessmentRoute();
      if (nextAssessment) setAssessmentRoute(nextAssessment);
      setProfileDetailRoute(getProfileDetailRoute());
      const nextView = route();
      if (nextView === "login" && location.hash === "#choose") {
        history.replaceState(null, "", "#login");
      }
      setView(nextView);
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("hashchange", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("hashchange", pop);
    };
  }, []);
  // 登录转场预热：等首屏与案例准备就绪后的空闲期，把 WebGL 渲染器、屏幕级
  // 纹理与三种方案的 shader 编译全部提前完成，点击「AI测评」时零停摆起步。
  useEffect(() => {
    const warm = () => { prewarmLoginTransition(); };
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(warm, { timeout: 6000 })
      : window.setTimeout(warm, 3200);
    return () => {
      if (window.cancelIdleCallback && typeof idle === "number") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);
  // 会话探针：令牌过期/服务端重启时静默清掉本地会话（作业看板随之隐藏），
  // 避免拿着死会话等到完成上报那一刻才失败。
  useEffect(() => {
    apiMe().catch(() => {});
  }, []);
  useEffect(() => {
    if (["home", "login", "cases", "forum"].includes(view)) {
      setCubeMounted(true);
    }
    if (view === "login" && location.hash === "#choose") {
      history.replaceState(null, "", "#login");
    }
    document.title = view === "assessments"
      ? "AIQUOS — 选择测评方式"
      : view === "assessment-map"
        ? "AIQUOS — 闯关地图"
        : view === "assessment-task"
          ? "AIQUOS — AI 能力测评"
      : view === "choose"
        ? "AIQUOS — 选择你的下一步"
        : view === "reports"
          ? "AIQUOS — 智核觉醒报告"
        : view === "profile"
          ? "AIQUOS — 个人中心"
        : view === "profile-detail"
          ? "AIQUOS — 个人中心"
        : view === "cases"
          ? "AIQUOS — 案例库"
        : view === "forum"
          ? "AIQUOS — 社区论坛"
        : view === "account-settings"
          ? "AIQUOS — 账号设置"
        : view === "login"
          ? "AIQUOS — 登录"
          : "AIQUOS — 你的 AI 实力到哪一步？";
  }, [view]);
  useEffect(() => {
    if (!moving) {
      const target = view === "assessments"
        ? ".assessment-wordmark"
        : view === "assessment-map" || view === "assessment-task"
          ? ".flow-wordmark"
        : view === "choose"
          ? ".choose-wordmark"
        : view === "reports"
          ? ".report-back"
        : view === "profile"
          ? ".profile-wordmark"
        : view === "profile-detail"
          ? ".detail-back"
        : view === "cases" || view === "forum"
          ? ".home-brand"
        : view === "account-settings"
          ? ".account-settings-title"
        : view === "login"
            ? ".login-title"
            : ".home-brand";
      document.querySelector(target)?.focus({ preventScroll: true });
    }
  }, [moving, view]);
  // CHOOSE itself never turns the cube. Keep the homepage shell flat while it
  // is hidden behind CHOOSE, then let the post-strip return rotate it back.
  useEffect(() => {
    if (view === "choose") setHomeShellFlat(true);
    else if (!busy.current) setHomeShellFlat(false);
  }, [view]);

  const handleShellMotion = (active) => {
    setMoving(active || busy.current);
  };
  const nextFrame = () => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

  async function go(next, hash = `#${next}`) {
    if (busy.current || next === view) return;
    const fromPanel = panels.current[PANEL[view]];
    const toPanel = panels.current[PANEL[next]];
    const move = `${view}>${next}`;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextProfileDetail = next === "profile-detail" ? getProfileDetailId(hash) : null;
    const shouldAnimate = SCROLL_MOVES.has(move)
      || STRIP_MOVES.has(move)
      || CARD_MOVES.has(move)
      || SLIDE_MOVES.has(move);
    setCubeMounted(true);
    if (reduce || !stage.current || !shouldAnimate) {
      setProfileDetailRoute(nextProfileDetail);
      setView(next);
      window.scrollTo(0, 0);
      history.pushState(null, "", hash);
      return;
    }

    // High-End 3D WebGL Transitions for Home <-> Login
    if (move === "home>login" || move === "cases>login" || move === "forum>login") {
      busy.current = true;
      setMoving(true);
      setWebglTransition({ active: true, reverse: false, entered: false });
      return;
    }
    if (move === "login>home") {
      busy.current = true;
      setMoving(true);
      flushSync(() => {
        setView("home");
        setWebglTransition({ active: true, reverse: true, entered: false });
      });
      history.pushState(null, "", "#home");
      window.scrollTo(0, 0);
      return;
    }

    busy.current = true;
    setMoving(true);
    const scrollPage = SCROLL_MOVES.has(move);
      try {
        if (scrollPage && document.startViewTransition) {
          const reverse = move === "login>home";
          document.documentElement.dataset.verticalTransition = reverse
            ? "reverse"
            : "forward";
          const transition = document.startViewTransition(() => {
            flushSync(() => setView(next));
            history.pushState(null, "", hash);
            window.scrollTo(0, 0);
          });
          await transition.finished.catch(() => {});
          return;
        }
        const scrollY = window.scrollY;
        if (scrollPage) {
        const outgoing = await freezeView(
          fromPanel,
          await collectSceneFrames(fromPanel),
        );
        holdView(stage.current, outgoing, scrollY);
        setView(next);
        window.scrollTo(0, 0);
        history.pushState(null, "", hash);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const incoming = await freezeView(
          toPanel,
          await collectSceneFrames(toPanel),
        );
        await animateScrollPage(stage.current, outgoing, incoming, scrollY, move === "login>home");
        return;
      }

      // Homepage and case library are two live layers inside one canvas, so
      // there is nothing to freeze: each one travels as a whole. The swap has
      // to commit synchronously so the arriving layer exists in the same task
      // the push starts in.
      if (SLIDE_MOVES.has(move)) {
        // The arriving page is already travelling; the archive's cold-open
        // would be a second entrance on top of it.
        const forward = (TAB_ORDER[next] ?? 1) > (TAB_ORDER[view] ?? 0);
        if (forward && next === "cases") skipCaseIntro();
        // The URL moves with the intent either way; only the view has to wait
        // for the reverse, so the archive keeps its own `data-tab` while it
        // travels (see pushPages).
        const arrive = () => {
          window.scrollTo(0, 0);
          history.pushState(null, "", hash);
        };
        flushSync(() => {
          setPushing(true);
          setPushFrom(view);
          setPushTo(next);
        });
        try {
          await pushPages({
            forward,
            move,
            enter: forward
              ? () => {
                  flushSync(() => setView(next));
                  arrive();
                }
              : arrive,
            commit: () => {
              flushSync(() => setView(next));
              arrive();
            },
          });
        } finally {
          flushSync(() => {
            setPushing(false);
            setPushFrom(null);
            setPushTo(null);
          });
        }
        return;
      }

      // The seams must cut card whitespace, so measure whichever side carries
      // cards while it is still laid out on screen.
      const cardPage = (node) =>
        node.querySelector(".choose-card, .assessment-card, .profile-card");
      const boundsFrom = cardPage(fromPanel)
        ? measureAssessmentBands(fromPanel)
        : null;
      const outgoing = await freezeView(
        fromPanel,
        await collectSceneFrames(fromPanel),
      );
      holdView(stage.current, outgoing, scrollY);
      setProfileDetailRoute(nextProfileDetail);
      setView(next);
      window.scrollTo(0, 0);
      history.pushState(null, "", hash);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const boundaries = cardPage(toPanel)
        ? measureAssessmentBands(toPanel)
        : boundsFrom ?? defaultBands();
      const incoming = await freezeView(
        toPanel,
        await collectSceneFrames(toPanel),
      );
      if (STRIP_MOVES.has(move)) {
        await animateStrips(
          stage.current,
          outgoing,
          incoming,
          scrollY,
          REVERSE_STRIP_MOVES.has(move),
          boundaries,
        );
        if (move === "choose>home") {
          setHomeShellFlat(false);
          await nextFrame();
          await waitForCubeSettle();
          await nextFrame();
        }
      } else {
        await animateCards(stage.current, outgoing, incoming, scrollY, next === "choose");
      }
    } finally {
      delete document.documentElement.dataset.verticalTransition;
      stage.current?.replaceChildren();
      stage.current?.classList.remove("is-running");
      busy.current = false;
      setMoving(false);
    }
  }

  // Visual-acceptance hook: `?flight-freeze=<0..1>` auto-launches the login
  // flight once and holds it at that progress inside the overlay, so key
  // frames can be screenshot deterministically for review. StrictMode's
  // setup→cleanup→setup is safe: cleanup clears the first timer, the second
  // setup schedules the one that fires.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("flight-freeze") === null) return;
    if (route() !== "home") return;
    const timer = setTimeout(() => {
      if (!busy.current) go("login");
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAssessmentMap(id) {
    const previousProgress = progress[id] ?? 1;
    const stage = Math.min(5, previousProgress);
    setAssessmentRoute({ id, stage, mode: "map" });
    go("assessment-map", assessmentHash(id));
  }

  function startAssessment(id, options = {}) {
    if (id === "comprehensive") {
      // 综合测评的第一屏是「老师的试卷」选卷界面（2026-10-03 用户决策，
      // 替换原关卡地图）。真正的开考动作发生在选定试卷之后
      // （startComprehensivePaper），卡片点击不再静默清空未完成的草稿——
      // 是否继续由选卷屏上的续答横幅决定。
      setAssessmentRoute({ id, stage: 1, mode: "map" });
      go("assessment-map", assessmentHash(id));
      return;
    }
    // Standalone channels run one timed phase straight away — no stage map.
    setProgress((current) => ({ ...current, [id]: 1 }));
    setAssessmentRoute({ id, stage: 1, mode: "task" });
    setTaskEntryId((current) => current + 1);
    go("assessment-task", assessmentHash(id, 1));
  }

  // 选卷开考：assignment 为老师推送的组卷作业对象，null 表示官方标准卷。
  function startComprehensivePaper(assignment) {
    if (assignment) {
      // 教师推送的组卷作业：记住 assignmentId（完成上报时带上），并切换到
      // 作业指定的题库版本——作业以哪个题池下发，就以哪个题池作答。
      // 学员进入前的自选题库版本记在 ref 里，作业完成后还原，避免一次
      // 作业永久改写学员的自主练习偏好。
      writeActiveAssignmentId(assignment.id);
      if (assignment.edition) {
        editionBeforeAssignmentRef.current = readEdition();
        writeEdition(assignment.edition);
      }
    } else {
      // 标准卷开考必须清掉遗留的作业上下文：否则一个被中途放弃的作业
      // 会在标准卷完成时被误报为该作业的完成记录。
      writeActiveAssignmentId(null);
      if (editionBeforeAssignmentRef.current !== null) {
        writeEdition(editionBeforeAssignmentRef.current);
        editionBeforeAssignmentRef.current = null;
      }
    }
    // 选定试卷 = 干净开考：全新路由 session 与 attempt，草稿清掉，
    // 上一次未完成的作答不会渗进这一次（时间制跑到收口时按实际证据
    // 定稿，见 finalizeComprehensive）。
    const attempt = createAttempt({ totalQuestions: EVIDENCE_BUDGET });
    clearAttemptDraft();
    routingRef.current = null;
    pendingOutcomeRef.current = null;
    phasesDoneRef.current = [];
    interviewRef.current = null;
    setAdaptiveTelemetry(null);
    setAdaptivePrior(null);
    setAttemptState({ attempt, result: null });
    // A fresh run starts from phase 1: without this reset a previous
    // finished run would leave every node unlocked and let a student skip
    // straight into the practical phase.
    setProgress((current) => ({ ...current, comprehensive: 1 }));
    // 选卷界面取代了关卡地图：选定后直达第一阶段任务。
    setAssessmentRoute({ id: "comprehensive", stage: 1, mode: "task" });
    setTaskEntryId((current) => current + 1);
    go("assessment-task", assessmentHash("comprehensive", 1));
  }

  function leaveAssessmentMap() {
    // Leaving keeps the draft (attempt + routing session) intact; the map's
    // resume banner is the way back in, and a new card click starts clean.
    go("assessments");
  }

  // Ask the backend for the next adaptive question. The routing session is
  // opaque to this client: send it back untouched, plus the outcome of the
  // question just answered (if any) and the persisted exposure counters.
  const fetchComprehensiveQuestion = useCallback(async (levelId, stage, options = {}) => {
    const outcome = pendingOutcomeRef.current;
    pendingOutcomeRef.current = null;
    // 对话定档：客观题阶段的第一题（尚无路由 session）把对话通道的分数
    // 摘要带给服务端，由服务端折算路由先验。之后 session 由服务端生成并
    // 原样回传，这里不再重复携带。
    const interviewSeed = routingRef.current === null && interviewRef.current
      ? {
        overallScore: interviewRef.current.overallScore ?? null,
        dimensions: Array.isArray(interviewRef.current.dimensions) ? interviewRef.current.dimensions : [],
        answeredSlots: interviewRef.current.answeredSlots ?? 0,
        totalSlots: interviewRef.current.totalSlots ?? 5,
        completed: Boolean(interviewRef.current.completed),
      }
      : null;
    try {
      const response = await fetch("/api/comprehensive-question", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(levelId === null ? {} : { levelId }),
          stage,
          ...(options.scope ? { scope: options.scope } : {}),
          ...(options.coverageCritical ? { coverageCritical: true } : {}),
          session: routingRef.current,
          exposure: loadExposureStore(),
          edition: readEdition(),
          ...(interviewSeed ? { interviewSeed } : {}),
          ...(outcome ? { outcome } : {}),
          // 复现调试（仅 dev 构建）：URL 带 ?qid=<题目id> 时强制出该题。
          // 生产构建 import.meta.env.DEV 为 false，该分支被静态消除——
          // 线上出题永远走自适应路由，指定题目只是本地测试入口。
          ...(import.meta.env.DEV && new URLSearchParams(location.search).get("qid")
            ? { forceQuestionId: new URLSearchParams(location.search).get("qid") }
            : {}),
          debug: isAdaptiveDebugOn(),
        }),
      });
      if (!response.ok) throw new Error(`出题服务返回 ${response.status}`);
      const data = await response.json();
      if (!data.question) throw new Error("出题服务未返回题目");
      routingRef.current = data.session ?? null;
      setAdaptivePrior(data.session?.prior ?? null);
      if (data.exposure && typeof data.exposure === "object") saveExposureStore(data.exposure);
      if (typeof data.bankVersion === "string") {
        writeCurrentBankVersion(data.bankVersion);
        // Follow an admin publish: re-label the in-progress attempt so its
        // draft and future snapshot attribute to the bank actually serving.
        setAttemptState((current) =>
          current.attempt && current.result?.status !== "completed"
            ? { attempt: withBankVersion(current.attempt, data.bankVersion), result: current.result }
            : current,
        );
      }
      if (isAdaptiveDebugOn() && data.debug) setAdaptiveTelemetry(data.debug);
      return data;
    } catch (error) {
      // Put the outcome back so a retry does not lose the routing signal.
      if (outcome && !pendingOutcomeRef.current) pendingOutcomeRef.current = outcome;
      throw error;
    }
  }, []);

  function submitComprehensiveAnswer(question, selectedKeys, outcome) {
    // Evidence/scoring stays client-side (the vendored package's integration
    // guide explicitly endorses browser scoring); the same credit rides with
    // the next question request to steer server-side routing.
    const credit = answerCredit(question, selectedKeys);
    pendingOutcomeRef.current = { outcome, credit, questionId: question.id };
    setAttemptState((current) => {
      if (!current.attempt) return current;
      const next = recordAnswer(current.attempt, question, selectedKeys);
      saveAttemptDraft({ ...next.attempt, routing: routingRef.current, phasesDone: phasesDoneRef.current });
      return next;
    });
  }

  // Rubric evidence from the practical workbench: LLM-judged (offline
  // heuristic fallback) credits on chosen dimensions, scored by the vendored
  // posterior alongside question evidence. The CONVERSATION channel does NOT
  // come through here — it has its own scoring model (submitInterviewScore).
  function submitExternalEvidence(evidence) {
    setAttemptState((current) => {
      if (!current.attempt) return current;
      const next = appendExternalEvidence(current.attempt, evidence);
      saveAttemptDraft({ ...next.attempt, routing: routingRef.current, phasesDone: phasesDoneRef.current });
      return next;
    });
  }

  // 对话通道的独立评分：走 src/interview-scoring-model.js，不并入证据数组。
  //
  // attempt 兜底：综合测评的 attempt 只在从测评卡片进入时创建（startAssessment）。
  // 若学员通过直链（#assessment/comprehensive/level/1）或刷新进入对话关，
  // attempt 可能还是空的 —— 此时惰性创建一个，否则对话分数会被静默丢弃。
  function submitInterviewScore(interview) {
    setAttemptState((current) => {
      const base = current.attempt ?? createAttempt({ totalQuestions: EVIDENCE_BUDGET });
      const next = recordInterviewScore(base, interview);
      // 同步 ref：客观题第一题请求的定档输入读这里（见 fetchComprehensiveQuestion）。
      interviewRef.current = next.attempt.interview;
      saveAttemptDraft({ ...next.attempt, routing: routingRef.current, phasesDone: phasesDoneRef.current });
      return { ...current, attempt: next.attempt, result: next.result ?? current.result };
    });
  }

  function openAssessmentStage(stage) {
    const complete = progress[assessmentRoute.id] ?? 1;
    if (stage > complete) return;
    setAssessmentRoute((current) => ({ ...current, stage, mode: "task" }));
    setTaskEntryId((current) => current + 1);
    go("assessment-task", assessmentHash(assessmentRoute.id, stage));
  }

  function restartComprehensiveAttempt() {
    const attempt = createAttempt({ totalQuestions: EVIDENCE_BUDGET });
    clearAttemptDraft();
    routingRef.current = null;
    pendingOutcomeRef.current = null;
    phasesDoneRef.current = [];
    interviewRef.current = null;
    setAdaptiveTelemetry(null);
    setAdaptivePrior(null);
    setAttemptState({ attempt, result: null });
    setProgress((current) => ({ ...current, comprehensive: 1 }));
  }

  function completeAssessmentStage(stage) {
    const id = assessmentRoute.id;
    const total = phaseCount(id);
    // Standalone channels have exactly one timed phase — completion returns
    // to the TEST hub for another session.
    if (id !== "comprehensive") {
      setProgress((current) => ({ ...current, [id]: 1 }));
      setAssessmentRoute({ id, stage: 1, mode: "map" });
      go("assessments");
      return;
    }
    const phaseDef = COMPREHENSIVE_PHASES[Math.max(0, Math.min(COMPREHENSIVE_PHASES.length - 1, stage - 1))];
    if (phaseDef) {
      phasesDoneRef.current = [...new Set([...phasesDoneRef.current, phaseDef.mode])];
    }
    const nextStage = Math.min(total, stage + 1);
    setProgress((current) => ({ ...current, [id]: Math.max(current[id] ?? 1, nextStage) }));
    // The final phase closes the Attempt: a time-based run finalises its
    // question budget to the evidence actually collected, then stores the
    // completed result as an immutable snapshot exactly once, drops the
    // draft, and opens the awakening report instead of the map.
    if (stage === total) {
      const finalized = finalizeAttempt(attemptState.attempt ?? createAttempt({ totalQuestions: 1 }));
      if (isAttemptComplete(finalized.result)) {
        const snapshot = snapshotAttempt(finalized.attempt, finalized.result);
        appendHistorySnapshot(snapshot);
        // 登录状态下把这次完成上报给教师端（得分/六维/题库版本）；同时若
        // 这次是老师推送的作业，服务端会把它计入该作业的完成名单。
        const assignmentId = readActiveAssignmentId();
        reportRunSnapshot(snapshot, assignmentId);
        writeActiveAssignmentId(null);
        if (editionBeforeAssignmentRef.current !== null) {
          writeEdition(editionBeforeAssignmentRef.current);
          editionBeforeAssignmentRef.current = null;
        }
        clearAttemptDraft();
        setAttemptState({ attempt: null, result: null });
        phasesDoneRef.current = [];
        setAssessmentRoute({ id, stage: total, mode: "map" });
        go("reports");
        return;
      }
    }
    if (attemptState.attempt) {
      saveAttemptDraft({
        ...attemptState.attempt,
        routing: routingRef.current,
        phasesDone: phasesDoneRef.current,
      });
    }
    // 关卡地图已被选卷界面取代：阶段完成后直接进入下一阶段任务，
    // 三阶段进度由任务页顶部节点展示。
    setAssessmentRoute({ id, stage: nextStage, mode: "task" });
    setTaskEntryId((current) => current + 1);
    go("assessment-task", assessmentHash(id, nextStage));
  }

  return (
    <div className="site-experience" data-view={view} aria-busy={moving}>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current.cube = node;
        }}
        hidden={!["home", "cases", "forum"].includes(view)}
      >
        <ErrorBoundary>
          {cubeMounted && (
            <App
              tab={["cases", "forum"].includes(view) ? view : "home"}
              onHome={() => go("home")}
              onAssessment={() => go("login")}
              onAccountSettings={() => go("account-settings")}
              onCases={() => go("cases")}
              onForum={() => go("forum")}
              active={view === "home"}
              flattened={homeShellFlat}
              transitionBusy={moving}
              transitionActive={webglTransition.active}
              pushing={pushing}
              pushFrom={pushFrom}
              pushTo={pushTo}
              onCubeMotionChange={handleShellMotion}
            />
          )}
        </ErrorBoundary>
            </div>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current["account-settings"] = node;
        }}
        hidden={view !== "account-settings"}
      >
        <ErrorBoundary>
          <AccountSettings onBack={() => go("home")} onLogout={() => go("home")} busy={moving} />
        </ErrorBoundary>
            </div>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current["login-page"] = node;
        }}
        hidden={view !== "login"}
      >
        <ErrorBoundary>
          <section className="login-screen" aria-label="登录" data-webgl={webglTransition.entered ? "true" : undefined}>
            <div className="login-stage">
              <div className="login-composition">
                <div className="login-word" aria-hidden="true">PLAYGROUND</div>
                <div className="login-ink-ring" aria-hidden="true" />
                <aside className="login-stub" aria-hidden="true">
                  <span className="login-stub-brand">AWAKEN YOUR INTELLIGENCE</span>
                  <strong className="login-stub-title">智核域通行证</strong>
                  <span className="login-stub-print">
                    <Fingerprint size={72} weight="duotone" />
                  </span>
                  <span className="login-stub-verified">
                    <SealCheck size={15} weight="fill" /> 已认证
                  </span>
                  <span className="login-stub-stamp">AIQUOS</span>
                </aside>
                <div className="login-surface">
                  <LoginForm onLogin={(profile) => {
                    // 严格登录成功（或注册即登录）后：本机身份换成服务端账号，
                    // 教师端名册与后续完成上报都以这个身份配对。
                    adoptAuthenticatedProfile(profile);
                    refreshHubAssignments();
                    go("choose");
                  }} />
                </div>
              </div>
            </div>
            <button className="pill-button login-back" onClick={() => go("home")} disabled={moving}>
              <ArrowLeft size={18} /> 返回首页
            </button>
          </section>
        </ErrorBoundary>
      </div>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current.choose = node;
        }}
        hidden={view !== "choose"}
      >
        <ErrorBoundary>
          <ChooseHub
            onBack={() => go("home")}
            onTest={() => go("assessments")}
            onReports={() => go("reports")}
            onProfile={() => go("profile")}
            busy={moving}
          />
        </ErrorBoundary>
            </div>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current.assessments = node;
        }}
        hidden={view !== "assessments"}
      >
        <ErrorBoundary>
          <AssessmentHub
            onBack={() => go("choose")}
            onStart={startAssessment}
            busy={moving}
            active={view === "assessments"}
          />
        </ErrorBoundary>
            </div>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current.profile = node;
        }}
        hidden={view !== "profile"}
      >
        <ErrorBoundary>
          <ProfileHub onBack={() => go("choose")} onOpen={(id) => go("profile-detail", `#center/${id}`)} busy={moving} />
        </ErrorBoundary>
            </div>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current.reports = node;
        }}
        hidden={view !== "reports"}
      >
        <ErrorBoundary>
          <AwakeningReport
          active={view === "reports"}
          onBack={() => go("choose")}
          onStartAssessment={() => go("assessments")}
          busy={moving}
        />
        </ErrorBoundary>
            </div>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current["profile-detail"] = node;
        }}
        hidden={view !== "profile-detail"}
      >
        <ErrorBoundary>
          <ProfileDetail
            id={profileDetailRoute ?? "organizations"}
            onBack={() => go("profile")}
            onHome={() => go("home")}
            busy={moving}
            active={view === "profile-detail"}
          />
        </ErrorBoundary>
            </div>
      <div
        className="experience-panel"
        ref={(node) => {
          panels.current["assessment-flow"] = node;
        }}
        hidden={view !== "assessment-map" && view !== "assessment-task"}
      >
        <ErrorBoundary>
          {view === "assessment-map" && assessmentRoute.id === "comprehensive" ? (
            <ComprehensivePapers
              assignments={hubAssignments}
              busy={moving}
              onBack={leaveAssessmentMap}
              onStartPaper={startComprehensivePaper}
              onResume={() => openAssessmentStage(progress.comprehensive ?? 1)}
              resume={attemptState.result?.status === "in_progress"
                ? {
                  answered: attemptState.result.answeredCount,
                  phasesDone: phasesDoneRef.current.length,
                  currentStage: progress.comprehensive ?? 1,
                  currentStageLabel: (COMPREHENSIVE_PHASES[(progress.comprehensive ?? 1) - 1] ?? {}).short ?? "对话",
                  startedAt: attemptState.attempt?.startedAt ?? null,
                  onRestart: restartComprehensiveAttempt,
                }
                : null}
            />
          ) : view === "assessment-map" ? (
            <AssessmentMap
              id={assessmentRoute.id}
              current={progress[assessmentRoute.id] ?? 1}
              complete={progress[assessmentRoute.id] ?? 1}
              onBack={leaveAssessmentMap}
              onOpenStage={openAssessmentStage}
              busy={moving}
              resume={assessmentRoute.id === "comprehensive" && attemptState.result?.status === "in_progress"
                ? {
                  answered: attemptState.result.answeredCount,
                  phasesDone: phasesDoneRef.current.length,
                  currentStage: progress.comprehensive ?? 1,
                  currentStageLabel: (COMPREHENSIVE_PHASES[(progress.comprehensive ?? 1) - 1] ?? {}).short ?? "对话",
                  startedAt: attemptState.attempt?.startedAt ?? null,
                  onRestart: restartComprehensiveAttempt,
                }
                : null}
            />
          ) : (
            <AssessmentTask
              key={`task-${taskEntryId}-${assessmentRoute.id}-${assessmentRoute.stage}`}
              id={assessmentRoute.id}
              stage={assessmentRoute.stage}
              complete={progress[assessmentRoute.id] ?? 1}
              onBack={() => (assessmentRoute.id === "comprehensive" ? openAssessmentMap(assessmentRoute.id) : go("assessments"))}
              onPick={openAssessmentStage}
              onComplete={completeAssessmentStage}
              onExternalEvidence={submitExternalEvidence}
              onInterviewScore={submitInterviewScore}
              onFetchComprehensiveQuestion={fetchComprehensiveQuestion}
              adaptivePrior={adaptivePrior}
              onAnswerComprehensive={submitComprehensiveAnswer}
              comprehensiveResult={attemptState.result}
              adaptiveTelemetry={adaptiveTelemetry}
              busy={moving}
            />
          )}
        </ErrorBoundary>
            </div>
      <div className="split-transition" ref={stage} aria-hidden="true" />

      {["home", "login"].includes(view) && new URLSearchParams(window.location.search).has("schemes") && (
        <SchemeSwitcher
          currentScheme={transitionScheme}
          onSelectScheme={setTransitionScheme}
          onTriggerDemo={() => {
            if (view === "home") go("login");
            else if (view === "login") go("home");
          }}
        />
      )}

      <LoginTransitionOverlay
        active={webglTransition.active}
        reverse={webglTransition.reverse}
        scheme={transitionScheme}
        onComplete={handleTransitionComplete}
        onRelease={handleTransitionRelease}
      />
    </div>
  );
}
