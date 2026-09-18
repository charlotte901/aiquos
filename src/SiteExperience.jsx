import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { App } from "./App";
import { AssessmentHub } from "./AssessmentHub";
import { AssessmentMap, AssessmentTask } from "./AssessmentFlow";
import { ErrorBoundary } from "./ErrorBoundary";
import { AccountSettings } from "./AccountSettings";
import { ChooseHub } from "./ChooseHub";
import { AwakeningReport } from "./AwakeningReport";
import { ProfileHub } from "./ProfileHub";
import { ProfileDetail } from "./ProfileDetail";
import { LoginForm } from "./LoginForm";
import { assessmentHash, getAssessmentRoute } from "./assessment-flow";
import { siteViewForHash } from "./routes";
import { createAdaptiveController } from "./comprehensive-adaptive";
import {
  COMPREHENSIVE_LEVELS,
  COMPREHENSIVE_QUESTION_COUNT,
  COMPREHENSIVE_QUESTIONS,
} from "./comprehensive-quiz";
import {
  answerCredit,
  appendHistorySnapshot,
  clearAttemptDraft,
  createAttempt,
  currentResult,
  isAttemptComplete,
  loadAttemptDraft,
  recordAnswer,
  saveAttemptDraft,
  snapshotAttempt,
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

// A move with no cards to cut around takes the whole frame as one band.
const defaultBands = () => {
  const height = getStageSize()[1];
  return [0, 0, height, height];
};

// Single source of truth for hash → view; see src/routes.js.
const route = () => siteViewForHash();

const isAdaptiveDebugOn = () => {
  try {
    return localStorage.getItem("aiquos.debug") === "1";
  } catch {
    return false;
  }
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
const SLIDE_MOVES = new Set(["home>cases", "cases>home"]);

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
  const [progress, setProgress] = useState(() => {
    const base = {
      comprehensive: 1,
      objective: 1,
      conversation: 1,
      practical: 1,
    };
    // A reloaded draft also restores how far the map was unlocked, so 继续测评
    // lands on the right stage instead of redoing answered ones.
    const draft = loadAttemptDraft();
    if (draft && draft.assessmentId === "comprehensive" && draft.evidence.length > 0) {
      base.comprehensive = Math.min(5, Math.floor(draft.evidence.length / 5) + 1);
    }
    return base;
  });
  const adaptiveController = useRef(createAdaptiveController(COMPREHENSIVE_QUESTIONS));
  // One comprehensive Attempt at a time: evidence from every submitted answer
  // accumulates here and is rescored from the complete set (integration guide).
  // An unfinished draft survives reloads; a completed attempt becomes an
  // immutable history snapshot exactly once.
  const [attemptState, setAttemptState] = useState(() => {
    const draft = loadAttemptDraft();
    return draft ? { attempt: draft, result: currentResult(draft) } : { attempt: null, result: null };
  });
  // Routing telemetry for the optional aiquos.debug overlay; off by default.
  const [adaptiveTelemetry, setAdaptiveTelemetry] = useState(null);
  const [moving, setMoving] = useState(false);
  // Narrower than `moving`: true only while a page push is in flight. The two
  // pages are siblings and only one of them is the current tab, so switching
  // tabs unmounts the other one — fine when it is merely not shown, fatal on the
  // way back, where the departing archive would be deleted on frame one instead
  // of travelling out. See the `tab !== "home" || pushing` test in App.jsx.
  // Deliberately not `moving`, which is also raised for the scroll and frozen
  // moves: those would keep the archive mounted under an unrelated transition.
  const [pushing, setPushing] = useState(false);
  const [cubeMounted, setCubeMounted] = useState(
    () => ["home", "login", "cases", "forum"].includes(route()),
  );
  const [homeShellFlat, setHomeShellFlat] = useState(() => route() === "choose");
  const panels = useRef({});
  const stage = useRef(null);
  const busy = useRef(false);
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
        const forward = move === "home>cases";
        if (forward) skipCaseIntro();
        // The URL moves with the intent either way; only the view has to wait
        // for the reverse, so the archive keeps its own `data-tab` while it
        // travels (see pushPages).
        const arrive = () => {
          window.scrollTo(0, 0);
          history.pushState(null, "", hash);
        };
        setPushing(true);
        try {
          await pushPages({
            forward,
            enter: forward
              ? () => {
                  flushSync(() => setView(next));
                  arrive();
                }
              : arrive,
            commit: forward ? undefined : () => flushSync(() => setView(next)),
          });
        } finally {
          setPushing(false);
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

  function openAssessmentMap(id) {
    const previousProgress = progress[id] ?? 1;
    const stage = Math.min(5, previousProgress);
    setAssessmentRoute({ id, stage, mode: "map" });
    go("assessment-map", assessmentHash(id));
  }

  function startAssessment(id) {
    if (id === "comprehensive") {
      adaptiveController.current.reset();
      // Card click always starts a clean run: fresh routing state, fresh
      // attempt, draft cleared so no earlier unfinished run can bleed in.
      const attempt = createAttempt({
        questions: COMPREHENSIVE_QUESTIONS,
        totalQuestions: COMPREHENSIVE_LEVELS.length * COMPREHENSIVE_QUESTION_COUNT,
      });
      clearAttemptDraft();
      setAttemptState({ attempt, result: null });
    }
    openAssessmentMap(id);
  }

  function leaveAssessmentMap() {
    if (assessmentRoute.id === "comprehensive") adaptiveController.current.reset();
    go("assessments");
  }

  function selectComprehensiveQuestion(levelId, stage) {
    return adaptiveController.current.select(levelId, stage);
  }

  function submitComprehensiveAnswer(question, selectedKeys, outcome) {
    // Credit feeds the adaptive router's ability estimate; computed outside
    // the state updater so StrictMode double-invocation cannot double-record.
    adaptiveController.current.record(outcome, answerCredit(question, selectedKeys));
    if (isAdaptiveDebugOn()) setAdaptiveTelemetry(adaptiveController.current.debugInfo());
    setAttemptState((current) => {
      if (!current.attempt) return current;
      const next = recordAnswer(current.attempt, question, selectedKeys);
      saveAttemptDraft(next.attempt);
      return next;
    });
  }

  function openAssessmentStage(stage) {
    const complete = progress[assessmentRoute.id] ?? 1;
    if (stage > complete) return;
    setAssessmentRoute((current) => ({ ...current, stage, mode: "task" }));
    go("assessment-task", assessmentHash(assessmentRoute.id, stage));
  }

  function restartComprehensiveAttempt() {
    const attempt = createAttempt({
      questions: COMPREHENSIVE_QUESTIONS,
      totalQuestions: COMPREHENSIVE_LEVELS.length * COMPREHENSIVE_QUESTION_COUNT,
    });
    clearAttemptDraft();
    adaptiveController.current.reset();
    setAdaptiveTelemetry(null);
    setAttemptState({ attempt, result: null });
  }

  function completeAssessmentStage(stage) {
    const id = assessmentRoute.id;
    const nextStage = Math.min(5, stage + 1);
    setProgress((current) => ({ ...current, [id]: Math.max(current[id] ?? 1, nextStage) }));
    // The final stage closes the Attempt: store the completed result as an
    // immutable snapshot exactly once, drop the draft, and open the awakening
    // report instead of returning to the map.
    if (id === "comprehensive" && stage === COMPREHENSIVE_LEVELS.length && isAttemptComplete(attemptState.result)) {
      appendHistorySnapshot(snapshotAttempt(attemptState.attempt, attemptState.result));
      clearAttemptDraft();
      setAttemptState({ attempt: null, result: null });
      setAssessmentRoute({ id, stage: COMPREHENSIVE_LEVELS.length, mode: "map" });
      go("reports");
      return;
    }
    setAssessmentRoute({ id, stage: nextStage, mode: "map" });
    go("assessment-map", assessmentHash(id));
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
              pushing={pushing}
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
          <section className="login-screen" aria-label="登录">
            <button className="pill-button login-back" onClick={() => go("home")} disabled={moving}>
              <ArrowLeft size={18} /> 返回首页
            </button>
            <div className="login-stage">
              <div className="login-surface">
                <LoginForm onLogin={() => {
                  go("choose");
                }} />
              </div>
            </div>
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
          <AssessmentHub onBack={() => go("choose")} onStart={startAssessment} busy={moving} />
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
          {view === "assessment-map" ? (
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
                  total: attemptState.result.totalQuestions,
                  startedAt: attemptState.attempt?.startedAt ?? null,
                  onRestart: restartComprehensiveAttempt,
                }
                : null}
            />
          ) : (
            <AssessmentTask
              id={assessmentRoute.id}
              stage={assessmentRoute.stage}
              complete={progress[assessmentRoute.id] ?? 1}
              onBack={() => openAssessmentMap(assessmentRoute.id)}
              onPick={openAssessmentStage}
              onComplete={completeAssessmentStage}
              onSelectComprehensiveQuestion={selectComprehensiveQuestion}
              onAnswerComprehensive={submitComprehensiveAnswer}
              comprehensiveResult={attemptState.result}
              adaptiveTelemetry={adaptiveTelemetry}
              busy={moving}
            />
          )}
        </ErrorBoundary>
            </div>
      <div className="split-transition" ref={stage} aria-hidden="true" />
    </div>
  );
}
