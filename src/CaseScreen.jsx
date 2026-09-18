import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowClockwise, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { getCaseLayers } from "./case-buffer";

/** Keep the outgoing scene until its replacement has a decoded/rendered frame.
 * Only one current layer and one pending layer are mounted per display. */
export function CaseScreen({ config, nextConfig, active = true, preload = true, onCaseReady }) {
  const [shown, setShown] = useState(config);
  const [previous, setPrevious] = useState(null);
  const ready = useRef(new Set());
  const requested = useRef(config);
  const displayed = useRef(shown);
  const fadeTimer = useRef(null);
  requested.current = config;
  displayed.current = shown;
  const promote = useCallback((next) => {
    if (displayed.current.id === next.id) return;
    setPrevious(displayed.current);
    displayed.current = next;
    setShown(next);
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setPrevious(null), 220);
  }, []);
  const prepared = useCallback((id) => {
    ready.current.add(id);
    onCaseReady?.(id);
    if (requested.current.id === id) promote(requested.current);
  }, [onCaseReady, promote]);
  const disposed = useCallback((id) => ready.current.delete(id), []);
  useEffect(() => {
    if (ready.current.has(config.id)) promote(config);
  }, [config, promote]);
  useEffect(() => () => clearTimeout(fadeTimer.current), []);

  // Do not preload a third scene during the short crossfade or a manual jump.
  // During the first visit only the three visible screens are allowed to load.
  // The next group begins warming after all three have a real frame.
  const layers = getCaseLayers(previous, shown, config, preload ? nextConfig : null);
  return (
    <div className="case-screen" data-case={shown.id} data-requested-case={config.id}>
      {layers.map((item) => (
        <CaseLayer key={item.id} config={item}
          visible={item.id === shown.id} outgoing={item.id === previous?.id}
          active={active && item.id === shown.id}
          onReady={prepared} onDispose={disposed} />
      ))}
    </div>
  );
}

function CaseLayer({ config, visible, outgoing, active, onReady, onDispose }) {
  const media = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const syncPlayback = useCallback(() => {
    const node = media.current;
    if (!node) return;
    if (config.kind === "video") {
      if (activeRef.current) node.play().catch(() => {});
      else node.pause();
    } else node.contentWindow?.postMessage({ type: "aiquos:visibility", active: activeRef.current }, "*");
  }, [config.kind]);
  const markReady = useCallback(() => {
    setReady(true);
    onReady(config.id);
    syncPlayback();
  }, [config.id, onReady, syncPlayback]);
  // An iframe can paint two scene frames before a normal effect has attached
  // its message listener.  Attach during the layout phase and acknowledge the
  // ready signal, so a fast local scene can never strand the cold homepage in
  // its boot state.
  useLayoutEffect(() => {
    const receive = (event) => {
      if (event.source === media.current?.contentWindow && event.data?.type === "aiquos:ready") {
        markReady();
        media.current?.contentWindow?.postMessage({ type: "aiquos:ready-ack" }, "*");
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      onDispose(config.id);
    };
  }, [config.id, markReady, onDispose]);
  useEffect(syncPlayback, [active, syncPlayback, attempt]);
  // Hidden-frame heals: a scene that came on-screen while its iframe was
  // frozen or whose activation message was lost would otherwise stay on its
  // stale warm-up frame (the conbini black screen). Re-assert the CURRENT
  // activation state on a slow beat while this layer is the visible one —
  // paused stays paused (login turn), active always repaints.
  useEffect(() => {
    // Only a live scene has a frame to re-assert; a film handles its own
    // playback and a still has nothing to repaint.
    if (!visible || config.kind !== "scene") return;
    const nudge = () =>
      media.current?.contentWindow?.postMessage(
        { type: "aiquos:visibility", active: activeRef.current === true },
        "*",
      );
    nudge();
    const timer = setInterval(nudge, 1200);
    return () => clearInterval(timer);
  }, [visible, config.kind]);
  return (
    <div className={`case-layer ${visible ? "is-visible" : ""} ${outgoing ? "is-outgoing" : ""} ${ready ? "is-ready" : ""}`}
      data-layer-case={config.id} data-preloaded={!visible} data-ready={ready}
      data-playing={active}
      aria-hidden={!visible} inert={!visible}>
      {config.kind === "video" ? (
        <video key={attempt} ref={media} src={config.src}
          playsInline loop muted={muted} preload="auto"
          aria-label={`${config.name} · ${config.detail}`}
          onLoadedData={markReady} onCanPlay={syncPlayback}
          onError={() => { setFailed(true); onReady(config.id); }} />
      ) : config.kind === "still" ? (
        // A still is neither a film nor a live scene: there is nothing to play
        // and no scene to hand a visibility message to. It marks itself ready on
        // load, which is the whole handshake.
        //
        // `focus` is the one per-case say over the crop. The sheet in the
        // stylesheet is tuned for a newspaper page; a document with a different
        // aspect has its own idea of what the top of the page is, so the case
        // carries a position and the default stands when it does not.
        <img key={attempt} ref={media} src={config.src}
          className="case-still" alt={`${config.name} · ${config.detail}`}
          style={config.focus ? { objectPosition: config.focus } : undefined}
          draggable="false" decoding="async"
          onLoad={markReady}
          onError={() => { setFailed(true); onReady(config.id); }} />
      ) : (
        <iframe key={attempt} ref={media}
          src={`${config.src}&preload=1`}
          title={`${config.name} · 实时案例`} sandbox="allow-scripts"
          tabIndex={-1} onLoad={syncPlayback} onError={() => { setFailed(true); onReady(config.id); }} />
      )}
      {!ready && !failed && visible && <div className="case-loading">正在准备画面…</div>}
      {failed && visible && (
        <div className="case-loading" role="alert">
          <span>这个案例暂时无法播放</span>
          <button onClick={() => { setFailed(false); setReady(false); setAttempt(attempt + 1); }}>
            <ArrowClockwise /> 重新加载
          </button>
        </div>
      )}
      <div className="case-caption">
        <span><strong>{config.name}</strong><small>{config.detail}</small></span>
        {config.kind === "video" && (
          <button className="case-audio" onClick={() => setMuted(!muted)}
            aria-label={`${muted ? "开启" : "关闭"}${config.name}解说声音`}>
            {muted ? <SpeakerSlash weight="bold" /> : <SpeakerHigh weight="bold" />}
          </button>
        )}
      </div>
    </div>
  );
}
