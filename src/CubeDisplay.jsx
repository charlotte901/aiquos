import { useEffect, useRef, useState } from "react";
import { CaseScreen } from "./CaseScreen";
import { FACE_CORNERS, projectPlane, getCubeGeometry, CUBE_TURN_DURATION } from "./cube-geometry";
import {
  faceVisible,
  screenQuad,
} from "./cube3d";
import { loadCubeTextures, TEXTURE_SIZE } from "./cube-textures";
import {
  ArrowClockwise,
  MusicNotes,
  Pause,
  Play,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
export const FACE_NAMES = {
  top: "顶部屏幕",
  left: "左侧屏幕",
  right: "右侧屏幕",
};
export { FACE_CORNERS, projectPlane } from "./cube-geometry";
const CUBE_SETTLED_EVENT = "aiquos:cube-settled";
function FocusClock() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const end = useRef(null);
  useEffect(() => {
    if (!running) return;
    end.current = Date.now() + seconds * 1000;
    const timer = setInterval(() => {
      const value = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setSeconds(value);
      if (!value) setRunning(false);
    }, 250);
    return () => clearInterval(timer);
  }, [running]);
  return (
    <div className="screen-widget focus-widget">
      <div className="screen-kicker">
        <span className="status-light" /> YOUR TIME, WELL SPENT
      </div>
      <p className="widget-caption">
        A little focus.
        <br />A lot of possibility.
      </p>
      <div className="clock-digits">
        {String(Math.floor(seconds / 60)).padStart(2, "0")}
        <span>:</span>
        {String(seconds % 60).padStart(2, "0")}
      </div>
      <div className="clock-controls">
        <button
          onClick={() => {
            if (!seconds) setSeconds(1500);
            setRunning(!running);
          }}
          aria-label={running ? "暂停计时" : "开始计时"}
        >
          {running ? <Pause weight="fill" /> : <Play weight="fill" />}
          {running ? "Pause" : "Let’s focus"}
        </button>
        <button
          onClick={() => {
            setRunning(false);
            setSeconds(1500);
          }}
          aria-label="重置计时器"
        >
          <ArrowClockwise />
        </button>
      </div>
      <p className="widget-footnote">ONE THING AT A TIME.</p>
    </div>
  );
}
function ProgressWidget() {
  const [value, setValue] = useState(78);
  return (
    <div className="screen-widget progress-widget">
      <div className="screen-kicker">KEEP GROWING</div>
      <h3>
        Small steps.
        <br />
        Big things.
      </h3>
      <div className="live-progress">
        <strong>
          {value}
          <small>%</small>
        </strong>
        <span>This week’s goal</span>
      </div>
      <div className="progress-bars" aria-hidden="true">
        {[92, 54, 38, 49, value].map((v, i) => (
          <div key={i} style={{ height: v + "%" }} />
        ))}
      </div>
      <label className="progress-slider">
        Your progress
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="调整学习进度"
        />
      </label>
      <p className="widget-footnote">YOU’RE DOING BETTER THAN YOU THINK.</p>
    </div>
  );
}
function MusicWidget() {
  const [playing, setPlaying] = useState(false);
  const audio = useRef(null);
  useEffect(() => {
    const pause = () => {
      audio.current?.suspend();
      setPlaying(false);
    };
    window.addEventListener("aiquos:pause-audio", pause);
    return () => window.removeEventListener("aiquos:pause-audio", pause);
  }, []);
  useEffect(
    () => () => {
      audio.current?.close();
    },
    [],
  );
  async function toggle() {
    if (playing) {
      await audio.current?.suspend();
      setPlaying(false);
      return;
    }
    if (!audio.current) {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      audio.current = context;
      const volume = context.createGain();
      volume.gain.value = 0.045;
      volume.connect(context.destination);
      [174.61, 220, 261.63, 349.23].forEach((frequency, i) => {
        const tone = context.createOscillator();
        tone.type = "sine";
        tone.frequency.value = frequency;
        const gain = context.createGain();
        gain.gain.value = 0.45 / (i + 1);
        tone.connect(gain);
        gain.connect(volume);
        tone.start();
      });
    }
    await audio.current.resume();
    setPlaying(true);
  }
  return (
    <div className={`screen-widget music-widget ${playing ? "playing" : ""}`}>
      <div className="screen-kicker">SOUND / SPACE</div>
      <MusicNotes className="music-art" weight="duotone" />
      <h3>A softer world.</h3>
      <p>Ambient harmony · Made for focus</p>
      <div className="sound-meter" aria-hidden="true">
        {[3, 7, 4, 10, 6, 11, 8, 4, 9, 5, 8, 3].map((h, i) => (
          <i
            key={i}
            style={{ height: h * 4, animationDelay: `${i * 0.09}s` }}
          />
        ))}
      </div>
      <button
        className="music-play"
        onClick={toggle}
        aria-label={playing ? "暂停声音" : "播放声音"}
      >
        {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
        {playing ? "Pause sound" : "Press play"}
      </button>
      <p className="widget-footnote">
        {playing ? "PLAYING · SOFT SINE HARMONY" : "A MOMENT, JUST FOR YOU."}
      </p>
    </div>
  );
}
function QuoteWidget({ text }) {
  return (
    <div className="screen-widget quote-widget">
      <div className="screen-kicker">A NOTE TO YOURSELF</div>
      <Sparkle size={56} weight="duotone" />
      <h3>{text || "Make room for a little wonder."}</h3>
      <p>Good things begin with an idea.</p>
      <div className="widget-footnote">AIQUOS / EVERYDAY INSPIRATION</div>
    </div>
  );
}
function Media({ config, onEdit }) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const common = {
    src: config.src,
    style: { objectFit: config.fit || "cover" },
    onError: () => {
      setFailed(true);
      setLoading(false);
    },
  };
  if (failed)
    return (
      <div className="media-error">
        <WarningCircle size={40} />
        <h3>画面未能加载</h3>
        <p>请检查直链或换一个文件。</p>
        <button onClick={onEdit}>更换内容</button>
      </div>
    );
  return (
    <div className="screen-media">
      {loading && (
        <div className="media-loading">Loading your inspiration…</div>
      )}
      {config.type === "video" ? (
        <video
          {...common}
          muted
          playsInline
          loop
          autoPlay
          controls
          onLoadedData={() => setLoading(false)}
          aria-label={config.name || "自定义视频"}
        />
      ) : (
        <img
          {...common}
          alt={config.name || "自定义屏幕图片"}
          onLoad={() => setLoading(false)}
        />
      )}
    </div>
  );
}
/** Public contract: {top,left,right} → {type, src?, fit?, content?, text?}.
 * Pass any React node as config.content with type: 'component'. */
export function ScreenContent({ config, onEdit, nextConfig, active = true, preload, onCaseReady }) {
  if (config.type === "case")
    return <CaseScreen config={config} nextConfig={nextConfig} active={active}
      preload={preload} onCaseReady={onCaseReady} />;
  if (config.type === "component") return config.content;
  if (config.type === "clock") return <FocusClock />;
  if (config.type === "progress") return <ProgressWidget />;
  if (config.type === "music") return <MusicWidget />;
  if (config.type === "quote") return <QuoteWidget text={config.text} />;
  if (["image", "video"].includes(config.type))
    return (
      <Media
        key={`${config.type}:${config.src}`}
        config={config}
        onEdit={onEdit}
      />
    );
  return null;
}
export function CubeDisplay({
  faces,
  nextFaces,
  flattened = false,
  active = true,
  onMotionChange,
  loginContent,
  loginScreenSize,
  preloadCases = true,
  onCaseReady,
}) {
  const root = useRef(null);
  const progress = useRef(flattened ? 1 : 0);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(flattened);
  const [turning, setTurning] = useState(false);
  const webgl = useRef(null);
  const [shell, setShell] = useState("dom");
  const blankFaces = flattened || turning;
  const showLogin = flattened && settled && ready && !turning && Boolean(loginContent);
  useEffect(() => {
    let cancelled = false;
    loadCubeTextures().then((textures) => {
      if (cancelled) return;
      root.current.querySelectorAll(".cube-frame-face").forEach((canvas) => {
        canvas.getContext("2d").drawImage(textures[canvas.dataset.face], 0, 0);
      });
      setReady(true);
    }).catch(() => setReady(false));
    return () => { cancelled = true; };
  }, []);
  // The WebGL shell replaces the three separately warped DOM quads whose
  // seams tore mid-turn. Own canvas lifecycle so StrictMode remounts stay clean.
  useEffect(() => {
    let cancelled = false;
    let api = null;
    Promise.all([import("./cube-scene"), loadCubeTextures()])
      .then(([{ createCubeScene }, textures]) => {
        if (cancelled || !root.current) return;
        const canvas = document.createElement("canvas");
        canvas.className = "cube-webgl";
        canvas.setAttribute("aria-hidden", "true");
        root.current.insertBefore(canvas, root.current.querySelector(".cube-frame-face"));
        try {
          api = createCubeScene(canvas, textures);
        } catch (error) {
          canvas.remove();
          throw error;
        }
        webgl.current = api;
        setShell("webgl");
        api.setProgress(progress.current);
      })
      .catch(() => {
        // No WebGL (or scene failure): the DOM projection path stays in charge.
      });
    return () => {
      cancelled = true;
      api?.dispose();
      webgl.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const node = root.current;
    const from = progress.current, to = flattened ? 1 : 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const slowPreview = import.meta.env.DEV && new URLSearchParams(location.search).has("cube-preview");
    const duration = reduced ? 0 : (slowPreview ? 12000 : CUBE_TURN_DURATION) * Math.abs(to - from);
    let frame;
    let start;
    setSettled(false);
    setTurning(duration > 0);
    onMotionChange?.(duration > 0);
    const surfaces = Object.fromEntries(Object.keys(FACE_CORNERS).map((key) => [key, {
      texture: node.querySelector(`.cube-frame-face[data-face="${key}"]`),
      screen: node.querySelector(`.screen-plane[data-screen="${key}"]`),
    }]));
    const draw = (p) => {
      progress.current = p;
      node.dataset.rotation = p.toFixed(4);
      // One eased clock drives the shell mesh, the screen planes AND the
      // container pan/scale, so the whole move reads as a single gesture.
      const app = node.closest(".app");
      if (app) app.style.setProperty("--turn-p", p.toFixed(4));
      const shellBlend = Math.min(1, p / 0.055);
      node.style.setProperty("--shell-opacity", 1 - shellBlend);
      node.style.setProperty("--texture-opacity", shellBlend);
      node.style.setProperty("--flat-progress", p);
      if (webgl.current) {
        // Shell and screens share one projection, so edges cannot tear.
        webgl.current.setProgress(p);
        for (const key of Object.keys(FACE_CORNERS)) {
          const plane = surfaces[key].screen;
          const visible = faceVisible(key, p);
          plane.style.visibility = visible ? "visible" : "hidden";
          if (!visible) continue;
          const quad = screenQuad(key, p);
          plane.style.transform = projectPlane(quad, Number(plane.dataset.width), Number(plane.dataset.height));
        }
        return;
      }
      const geometry = getCubeGeometry(p);
      for (const [key, face] of Object.entries(geometry)) {
        const { texture, screen } = surfaces[key];
        texture.style.visibility = screen.style.visibility = face.visible ? "visible" : "hidden";
        if (!face.visible) continue;
        texture.style.transform = projectPlane(face.frame, TEXTURE_SIZE, TEXTURE_SIZE);
        screen.style.transform = projectPlane(face.screen, Number(screen.dataset.width), Number(screen.dataset.height));
      }
    };
    const tick = (time) => {
      start ??= time;
      const t = duration ? Math.min(1, (time - start) / duration) : 1;
      const eased = 1 - (1 - t) ** 3;
      draw(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        setSettled(flattened);
        setTurning(false);
        onMotionChange?.(false);
        node.dispatchEvent(new CustomEvent(CUBE_SETTLED_EVENT));
      }
    };
    if (!duration) {
      // Zero-length moves land synchronously: reduced-motion users and
      // webviews that withhold vsync still reach the exact final pose.
      draw(to);
      setSettled(flattened);
      setTurning(false);
      onMotionChange?.(false);
      node.dispatchEvent(new CustomEvent(CUBE_SETTLED_EVENT));
      return () => {};
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flattened, ready, onMotionChange]);

  return (
    <div className="cube-display" ref={root} data-flat={settled} data-blank={blankFaces}
      data-shell={shell}
      role="group" aria-label={flattened ? "浅粉色正面屏幕" : "三面立方体显示器"}>
      <div className="cube-shadow" aria-hidden="true" />
      <img
        className="cube-shell"
        src="/assets/aiquos-reference.png"
        alt=""
        draggable="false"
      />
      {Object.keys(FACE_CORNERS).map((key) => (
        <canvas key={key} className={`cube-frame-face ${key}`} data-face={key}
          width={TEXTURE_SIZE} height={TEXTURE_SIZE} aria-hidden="true" />
      ))}
      {Object.entries(FACE_CORNERS).map(([key, corners]) => {
        const original = faces[key].type === "original";
        const wide = key === "top" && faces[key].type === "case";
        const width = wide ? 640 : 500;
        const height = wide ? 360 : 520;
        return (
          <div
            key={key}
            className={`screen-plane ${key} ${original ? "original" : "custom"}`}
            style={{
              width,
              height,
              transform: projectPlane(corners, width, height),
            }}
            data-screen={key}
            data-width={width}
            data-height={height}
            aria-hidden={!(showLogin && key === "right") && (blankFaces || (settled && key !== "right"))}
            inert={!(showLogin && key === "right") && (blankFaces || (settled && key !== "right"))}
          >
            {!original && (
              <ScreenContent config={faces[key]} nextConfig={nextFaces?.[key]}
                active={active && !blankFaces}
                preload={preloadCases} onCaseReady={onCaseReady} />
            )}
            {showLogin && key === "right" && (
              <div className="login-surface" style={{
                width: loginScreenSize.width,
                height: loginScreenSize.height,
                transform: `scale(${width / loginScreenSize.width}, ${height / loginScreenSize.height})`,
              }}>
                {loginContent}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
