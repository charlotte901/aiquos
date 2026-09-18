import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Pause,
  X,
  Play,
} from "@phosphor-icons/react";
import { Brand } from "./Brand";
import { CubeDisplay } from "./CubeDisplay";
import { LibraryHub } from "./LibraryHub";
import { getFlatLayout } from "./cube-geometry";
import { useStageSize } from "./DesignStage";
import { getViewportLayout } from "./layout";
import {
  CASES,
  CASE_INTERVAL,
  getCaseFaces,
  normalizeCaseIndex,
} from "./cases";


function ReferenceBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const source = new Image();
    source.src = "/assets/aiquos-reference.png";
    source.onload = () => {
      const ctx = ref.current?.getContext("2d");
      if (!ctx) return;
      const tile = document.createElement("canvas");
      tile.width = 128;
      tile.height = 128;
      tile
        .getContext("2d")
        .drawImage(source, 1220, 630, 128, 128, 0, 0, 128, 128);
      // Keep only the supplied fine grain, not its low-frequency lighting.
      // This avoids visible repeating patches on the responsive background.
      const tileContext = tile.getContext("2d");
      const pixels = tileContext.getImageData(0, 0, 128, 128);
      const original = new Uint8ClampedArray(pixels.data);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const previous = i >= 4 ? i - 4 : i;
        const grain = (original[i + 1] - original[previous + 1]) * 0.25;
        pixels.data[i] = 245 + grain;
        pixels.data[i + 1] = 107 + grain;
        pixels.data[i + 2] = 163 + grain;
      }
      tileContext.putImageData(pixels, 0, 0);
      ctx.fillStyle = ctx.createPattern(tile, "repeat");
      ctx.fillRect(0, 0, 1514, 1006);
    };
    return () => {
      source.onload = null;
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="pink-frame"
      width="1514"
      height="1006"
      aria-hidden="true"
    />
  );
}

function Modal({ children, title, subtitle, onClose, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    const close = (e) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", close);
    return () => {
      dialog.removeEventListener("cancel", close);
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">AIQUOS / PLAYGROUND</p>
            <h2 id="dialog-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="icon-button close-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}


export function App({
  onHome,
  onAssessment,
  onAccountSettings,
  onCases,
  onForum,
  tab = "home",
  flattened = false,
  active = true,
  transitionBusy = false,
  pushing = false,
  onCubeMotionChange,
}) {
  // The size the site is composed against: the fixed 16:9 design frame in wide
  // mode, the window in compact. Not the window in both, which is what let the
  // composition track the monitor (see stage.js).
  const size = useStageSize();
  const [faces, setFaces] = useState(() => getCaseFaces(0));
  const [preset, setPreset] = useState(0);
  const initialCaseIds = useRef(new Set(Object.values(getCaseFaces(0)).map((item) => item.id)));
  const [bootedCases, setBootedCases] = useState(() => new Set());
  const upcomingFaces = useMemo(() => getCaseFaces(preset + 1), [preset]);
  const [nextFaces, setNextFaces] = useState(upcomingFaces);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [visible, setVisible] = useState(() => !document.hidden);
  const [modal, setModal] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const casesReady = bootedCases.size === initialCaseIds.current.size;
  const handleCaseReady = useCallback((id) => {
    if (!initialCaseIds.current.has(id)) return;
    setBootedCases((previous) => previous.has(id)
      ? previous
      : new Set([...previous, id]));
  }, []);
  useEffect(() => {
    setDetailOpen(false);
  }, [tab]);
  const choosePreset = useCallback((index) => {
    if (!casesReady) return;
    const next = normalizeCaseIndex(index);
    setPreset(next);
    setFaces(getCaseFaces(next));
  }, [casesReady]);
  // Some embedded webviews never tick requestAnimationFrame inside iframes,
  // so scene frames can never arrive there. Reveal anyway after a bounded
  // wait instead of stranding the homepage behind the boot curtain forever;
  // fast environments still open on real frames.
  useEffect(() => {
    if (casesReady) return;
    const timer = setTimeout(
      () => setBootedCases(new Set(initialCaseIds.current)),
      8000,
    );
    return () => clearTimeout(timer);
  }, [casesReady]);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  // Mounting the next group's hidden iframes (scene compile + init) lands on
  // the main thread; defer it until the reveal/swap has fully settled.
  useEffect(() => {
    if (!casesReady) return;
    const timer = setTimeout(() => setNextFaces(upcomingFaces), 900);
    return () => clearTimeout(timer);
  }, [casesReady, upcomingFaces]);
  useEffect(() => {
    if (
      !casesReady ||
      !active ||
      transitionBusy ||
      !playing ||
      !visible ||
      modal ||
      preset < 0
    )
      return;
    const timer = setTimeout(() => {
      choosePreset(preset + 1);
    }, CASE_INTERVAL);
    return () => clearTimeout(timer);
  }, [casesReady, active, transitionBusy, playing, visible, modal, preset, choosePreset]);
  const layout = getViewportLayout(size.width, size.height);
  const flat = getFlatLayout(size.width, size.height);
  // The header is the nav and the account pill only. The AIQUOS wordmark used to
  // sit at the far left of this bar; it was removed on request, which is why
  // `--chrome-inset-x` now reads as breathing room for the nav rather than the
  // wordmark's left edge. The hero wordmark on Home is a separate element and is
  // untouched.
  const siteHeader = (
    <header className="site-header">
      <nav aria-label="Main navigation">
        <a
          className={tab === "home" && !modal ? "active" : ""}
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            if (tab === "home") setModal(null);
            else onHome?.();
          }}
        >
          Home
        </a>
        <a
          className={tab === "cases" ? "active" : ""}
          href="#cases"
          onClick={(e) => {
            e.preventDefault();
            onCases?.();
          }}
        >
          Cases
        </a>
        <a
          className={tab === "forum" ? "active" : ""}
          href="#forum"
          onClick={(e) => {
            e.preventDefault();
            onForum?.();
          }}
        >
          Forum
        </a>
      </nav>
      {/* Mounted on every tab and hidden by the cases/forum rules rather than
          unmounted: the header holds still through a push, so the account pill
          should fade with the tab change instead of blinking out of a header
          that is not moving. Hidden means `visibility: hidden`, so it leaves
          the tab order and the accessibility tree either way. */}
      <button
        className="pill-button home-account"
        onClick={onAccountSettings}
        disabled={transitionBusy}
        aria-label="账号"
      >
        账号
      </button>
    </header>
  );
  function reset() {
    choosePreset(0);
    setPlaying(true);
    setModal(null);
  }
  // Which archive, if any, the tab screen is showing. A push never has to be
  // consulted here: on the way home the tab stays on `cases` for the whole
  // travel and only flips once the page has arrived (see pushPages), so the
  // archive is mounted exactly while it is on screen — including while it is
  // the half of the sheet sliding out.
  const screenTab = tab !== "home" ? tab : null;
  return (
    <main
      className={`app ${casesReady ? "is-cases-ready" : "is-case-booting"}`}
      data-layout={layout.compact ? "compact" : "wide"}
      data-tab={tab}
      aria-busy={!casesReady}
      style={{ ...layout.variables, "--flat-x": `${flat.x}px`, "--flat-y": `${flat.y}px`, "--flat-scale": flat.scale }}
      data-detail-open={detailOpen ? "true" : undefined}
    >
      <div className="canvas-space">
        <section
          className="design-canvas"
          aria-label="AIQUOS creative learning playground"
          inert={!casesReady && tab === "home"}
        >
          <ReferenceBackground />
          {/* The header is chrome, not page content: it belongs to every tab at
              the same coordinates. Keeping it in this one child slot on every
              tab — instead of mounting a copy inside the tab's own layer — is
              what lets the two pages push past it (see slide-transition.js):
              the chrome holds still while the pages travel, and because the
              slot's type never changes React reuses the node, so the brand does
              not flicker between tabs. */}
          {(tab === "home" || !detailOpen) && siteHeader}
          <div className="home-stage" inert={tab !== "home"} aria-hidden={tab !== "home"}>
            <div className="home-hero-art"><Brand /></div>
            <div className="intro-copy">
              <h2>
                AI 时代，
                <br />
                你的实力
                <br />
                到哪一步？
              </h2>
              <p>
                用真实任务，检验你的 AI 能力。
                <br />
                从精准提问，到把想法变成作品。
              </p>
              <button
                className="pill-button explore"
                onClick={onAssessment}
                disabled={transitionBusy}
                aria-label="AI测评"
              >
                AI测评
                <ArrowUpRight size={24} weight="bold" />
              </button>
            </div>
            <div className="cube-position">
              <CubeDisplay faces={faces} nextFaces={nextFaces}
                flattened={flattened}
                active={active && visible && tab === "home"}
                onMotionChange={onCubeMotionChange}
                preloadCases={casesReady}
                onCaseReady={handleCaseReady} />
            </div>
            <section className="case-carousel" aria-label="案例轮播">
              <div className="case-carousel-controls">
                <div className="carousel-dots" aria-label="选择案例">
                  {CASES.map((item, i) => (
                    <button
                      key={item.id}
                      aria-label={`展示${item.name}`}
                      title={item.name}
                      aria-pressed={preset === i}
                      className={preset === i ? "selected" : ""}
                      onClick={() => choosePreset(i)}
                    />
                  ))}
                </div>
                <button
                  className="carousel-toggle"
                  aria-label={
                    playing && preset >= 0 ? "暂停案例轮播" : "继续案例轮播"
                  }
                  onClick={() => {
                    if (preset < 0) {
                      choosePreset(0);
                      setPlaying(true);
                    } else setPlaying(!playing);
                  }}
                >
                  {playing && preset >= 0 ? (
                    <Pause weight="fill" />
                  ) : (
                    <Play weight="fill" />
                  )}
                </button>
              </div>
              <p className="case-current">
                <span>
                  {preset >= 0
                    ? `${String(preset + 1).padStart(2, "0")} / ${String(CASES.length).padStart(2, "0")}`
                    : "CUSTOM"}
                </span>
                <strong>{preset >= 0 ? CASES[preset].name : "自定义屏幕"}</strong>
              </p>
              <p className="case-playback-state">
                {preset < 0
                  ? "已保留你的内容 · 点击播放恢复案例"
                  : playing
                    ? "每 15 秒切换 · 三面联播"
                    : "轮播已暂停 · 案例继续播放"}
              </p>
            </section>
          </div>
          {/* The tab is what keeps this mounted, and on the way home the tab
              stays on `cases` until the page has finished travelling, so the
              archive is never deleted mid-slide. `inert` covers the two cases
              where it is on screen but not the page in charge: a tab that has
              already left it, and a push that is carrying it out. */}
          {screenTab && (
            <div
              className="home-tab-screen"
              aria-label={`${screenTab} content`}
              inert={tab === "home" || pushing}
            >
              {screenTab === "cases" && <LibraryHub variant="cases" onDetailChange={setDetailOpen} />}
              {screenTab === "forum" && <LibraryHub variant="forum" onDetailChange={setDetailOpen} />}
            </div>
          )}
        </section>
      </div>
      {modal === "about" && (
        <Modal
          title="Learn. Create. Achieve."
          subtitle="一个立方体，装下无限灵感。"
          onClose={() => setModal(null)}
        >
          <div className="info-body">
            <p>AIQUOS 将学习、创作与专注，放在触手可及的三个屏幕上。</p>
            <p>
              在真实案例中观察 AI 的创作能力，并探索如何把想法变成作品。登录入口提供免验证的表单演示，登录后先进入功能选择页，再从测试闯关进入测评方式选择；真实账号与评分尚未接入。
            </p>
            <button className="done-button" onClick={reset}>
              开始探索
              <ArrowUpRight />
            </button>
          </div>
        </Modal>
      )}
      {modal === "pricing" && (
        <Modal
          title="A little more possibility."
          subtitle="先把灵感放上屏幕。"
          onClose={() => setModal(null)}
        >
          <div className="info-body">
            <span className="demo-label">INTERACTIVE DEMO</span>
            <h3>自由探索，不设门槛。</h3>
            <p>
              当前是前端交互演示，可以浏览真实案例和体验立方体转场。没有真实付费套餐，也不会收取任何费用。
            </p>
            <button className="done-button" onClick={reset}>
              Try the playground
              <ArrowUpRight />
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
