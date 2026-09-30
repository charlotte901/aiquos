import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createTicketFrontTexture,
  createTicketBackTexture,
  createLoginBackdropBaseTexture,
  createLoginBackdropDecoTexture,
  createCardShadowTexture,
} from "./stamp-texture.js";
import { createStampMaterial } from "./stamp-shader.js";
import { createEjectCard } from "./cube-eject-shader.js";
import { createOrigamiTicket } from "./origami-shader.js";
import { measureLoginScene } from "./measure-login.js";
import "./login-transition.css";

const STORAGE_SCHEME_KEY = "aiquos.login-scheme";

export function getStoredScheme() {
  try {
    return localStorage.getItem(STORAGE_SCHEME_KEY) || "A";
  } catch {
    return "A";
  }
}

export function setStoredScheme(scheme) {
  try {
    localStorage.setItem(STORAGE_SCHEME_KEY, scheme);
  } catch {}
}

// ── 跨点击复用的重资源 ──────────────────────────────────────────────────────
// 每次点击都新建 WebGL 上下文 + 按屏幕尺寸重画 canvas 纹理 + 等待 shader
// 首次编译，实测在点击处造成 100–380ms 的停摆（两个长任务 102+87ms）。
// 渲染器与视口等大的纹理跟单次飞行无关，模块级缓存、空闲时预热——点击
// 路径只剩「测量 + 建 mesh + 起步」。
const shared = {
  renderer: null,
  canvas: null,
  textures: new Map(), // key -> THREE.Texture（键含视口尺寸）
};

function sharedTexture(key, make) {
  let tex = shared.textures.get(key);
  if (!tex) {
    tex = make();
    shared.textures.set(key, tex);
  }
  return tex;
}

function getSharedRenderer(width, height) {
  if (!shared.renderer) {
    shared.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    shared.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    shared.renderer.toneMappingExposure = 1.22;
    shared.canvas = shared.renderer.domElement;
  }
  shared.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  shared.renderer.setSize(width, height);
  return shared.renderer;
}

// 视口级资产：测量结果 + 幕布/票据的真实纹理。canvas 纹理要等第一次
// render 才上传 GPU（整屏 RGBA ≈ 数 MB），不预热这段上传就落在点击当刻。
const assetsByViewport = new Map();

function getAssets(width, height) {
  const key = `${width}x${height}`;
  let assets = assetsByViewport.get(key);
  if (assets) return assets;
  const m = measureLoginScene() ?? {
    width: Math.min(706, width * 0.94),
    height: Math.min(706, width * 0.94) * (383 / 706),
    splitX: Math.min(706, width * 0.94) - 196,
    stubHorizontal: false,
    center: { x: width / 2, y: height / 2 },
    fields: [],
    texts: {},
  };
  const wordScreen = m.word
    ? {
      ...m.word,
      cx: m.center.x + (m.word.cx - m.width / 2),
      cy: m.center.y + (m.word.cy - m.height / 2),
    }
    : null;
  assets = {
    m,
    wordScreen,
    baseTex: createLoginBackdropBaseTexture(width, height),
    decoTex: createLoginBackdropDecoTexture(width, height, wordScreen),
    frontRaw: createTicketFrontTexture(m, { rawColor: true }),
    frontStd: createTicketFrontTexture(m, { rawColor: false }),
  };
  assetsByViewport.set(key, assets);
  return assets;
}

/** 释放一组临时 mesh/material（纹理归缓存所有，不在这里销毁）。 */
function disposeTempObject(root) {
  root.traverse?.((node) => {
    node.geometry?.dispose?.();
    if (node.material) {
      if (node.material.map && ![...shared.textures.values()].includes(node.material.map)) {
        node.material.map.dispose?.();
      }
      node.material.dispose?.();
    }
  });
}

/**
 * 空闲预热：建好渲染器、画好与视口等大的幕布纹理，并用 1×1 占位纹理把
 * 三种方案的 shader 全部编译进 GL 上下文（编译成本发生在程序首次使用时，
 * 不预热就会落在点击当刻）。SiteExperience 在挂载后的空闲期调用一次。
 */
export function prewarmLoginTransition() {
  if (typeof window === "undefined") return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  getSharedRenderer(width, height);
  sharedTexture("shadow", () => createCardShadowTexture());
  sharedTexture("back", () => createTicketBackTexture());
  // 真实资产（测量 + 幕布/票据纹理）一并构建；下面的预热渲染把纹理上传
  // 进 GPU，点击当刻不再有任何整屏上传。
  const assets = getAssets(width, height);

  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 5);
    const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    dummy.needsUpdate = true;
    const ticketW = assets.m.width;
    const ticketH = assets.m.height;
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: assets.baseTex }),
    );
    scene.add(backdrop);
    const deco = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: assets.decoTex }),
    );
    scene.add(deco);
    const stamp = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4 * (ticketH / ticketW), 4, 4),
      createStampMaterial(assets.frontRaw, ticketW, ticketH),
    );
    scene.add(stamp);
    const eject = createEjectCard(assets.frontRaw, sharedTexture("back", () => createTicketBackTexture()), ticketW, ticketH);
    scene.add(eject.group);
    const origami = createOrigamiTicket(assets.frontRaw, dummy, ticketW, ticketH);
    scene.add(origami.root);
    shared.renderer.compile(scene, camera);
    shared.renderer.render(scene, camera);
    disposeTempObject(eject.group);
    disposeTempObject(origami.root);
    stamp.geometry.dispose();
    stamp.material.dispose();
    backdrop.geometry.dispose();
    backdrop.material.dispose();
    deco.geometry.dispose();
    deco.material.dispose();
    dummy.dispose();
  } catch {
    // 预热失败不致命：点击路径仍会完整构建。
  }
}

/** Eased flight: gentle ease-in (leaving the cube), hard ease-out into the
 * slam, then a damped 3.5% overshoot settle. No linear segments anywhere. */
function flightCurve(t) {
  if (t <= 0.86) {
    const s = t / 0.86;
    const eased = s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
    return eased;
  }
  const sub = (t - 0.86) / 0.14;
  return 1 + Math.sin(sub * Math.PI) * 0.035 * (1 - sub * 0.6);
}

/**
 * The home → login flight. Continuity is the whole point:
 *
 * 1. The ticket departs from the REAL cube on stage (its live rect is
 *    measured each run), so the flight reads as "the cube issued a pass".
 * 2. A full-cover backdrop veil — a 1:1 screen-scale replica of the login
 *    page's pink field, sheen, blurred PLAYGROUND word and grain — fades up
 *    beneath the flying ticket and fully covers home before the views swap.
 * 3. The ticket's front face is painted from LIVE MEASUREMENTS of the real
 *    `.login-composition` (the DOM card is content-height ≈706×383, not the
 *    706×480 the flight used to assume), and the shader retires its
 *    mid-air extras (edge perforations, foil sheen) before landing.
 * 4. On arrival the flight FREEZES on its final frame — which is now the
 *    spitting image of the mounted page — the real DOM fades in beneath the
 *    held frame, and only then does the overlay release. No hard cut either
 *    direction.
 */
export function LoginTransitionOverlay({
  active = false,
  reverse = false,
  scheme = "A",
  onComplete,
  onRelease,
}) {
  const containerRef = useRef(null);
  const [stampImpact, setStampImpact] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [blastRect, setBlastRect] = useState(null);

  useEffect(() => {
    if (!active) {
      setStampImpact(false);
      setReleasing(false);
      setBlastRect(null);
      return undefined;
    }
    const viewport = containerRef.current;
    if (!viewport) return undefined;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const fov = 42;
    const camDist = 5;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);
    camera.position.set(0, 0, camDist);

    const renderer = getSharedRenderer(width, height);
    viewport.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xf568a3, 2.6);
    rim.position.set(-4, -2, 2);
    scene.add(rim);

    // ── Depth-aware screen→world mapping ───────────────────────────────────
    const visibleAt = (dist) => 2 * Math.tan((fov * Math.PI) / 180 / 2) * dist;
    const pxToWorldAt = (px, py, z) => {
      const dist = camDist - z;
      const visH = visibleAt(dist);
      const visW = visH * (width / height);
      return {
        x: (px / width - 0.5) * visW,
        y: -(py / height - 0.5) * visH,
      };
    };
    const pxLenToWorldAt = (len, z) => len * (visibleAt(camDist - z) / height);

    // ── Shared per-viewport assets (measurement + real textures) ───────────
    // 预热时已构建并完成首次 GPU 上传；视口未变时这里全是缓存命中。
    const assets = getAssets(width, height);
    const m = assets.m;

    // ── Backdrop veil: the login field, faded over home ────────────────────
    // Textures are drawn at 1:1 screen scale and the planes are sized to the
    // exact frustum at their depth, so texture px = screen px and the DOM
    // swap underneath is truly seamless. Two staggered layers: the pink
    // field covers home before the view swap, while the PLAYGROUND word only
    // emerges once home has dissolved.
    const bgZ = -2.4;
    // m.word is measured relative to the card; the veil canvas is the whole
    // screen, so re-anchor it to the card's on-screen centre.
    const wordScreen = assets.wordScreen;
    const makeVeil = (tex, z) => {
      const visH = visibleAt(camDist - z);
      const visW = visH * (width / height);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(visW, visH),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: reverse ? 1 : 0,
          depthWrite: false,
          toneMapped: false, // the veil must equal the DOM wall, not ACES of it
        }),
      );
      mesh.position.z = z;
      scene.add(mesh);
      return mesh;
    };
    const bgBase = makeVeil(assets.baseTex, bgZ);
    const bgDeco = makeVeil(assets.decoTex, bgZ + 0.02);

    // ── Anchor: the ticket departs from / returns into the live cube ───────
    let anchorRect = null;
    const anchorEl = document.querySelector(".cube-position") || document.querySelector(".app");
    if (anchorEl) anchorRect = anchorEl.getBoundingClientRect();
    if (!anchorRect || anchorRect.width < 10) {
      anchorRect = {
        left: width * 0.56,
        top: height * 0.2,
        width: width * 0.34,
        height: width * 0.34 * (480 / 706),
      };
    }

    // ── Target: the measured DOM login composition ─────────────────────────
    const targetW = m.width;
    const targetH = m.height;
    const toPos = pxToWorldAt(m.center.x, m.center.y, 0);
    const toTransform = {
      x: toPos.x,
      y: toPos.y,
      z: 0,
      rotX: 0,
      rotY: 0,
      rotZ: -0.0279, // the ticket's resting -1.6° tilt
      scale: pxLenToWorldAt(targetW, 0) / 2.4,
    };

    // Departure pose: sitting in the cube's right screen, turned like it
    const anchorCx = anchorRect.left + anchorRect.width / 2;
    const anchorCy = anchorRect.top + anchorRect.height / 2;
    const anchorW = Math.min(anchorRect.width * 0.92, targetW * 1.25);
    const depZ = -0.9;
    const depPos = pxToWorldAt(anchorCx, anchorCy, depZ);
    const fromTransform = {
      x: depPos.x,
      y: depPos.y,
      z: depZ,
      rotX: 0.34,
      rotY: -0.52,
      rotZ: 0.12,
      scale: pxLenToWorldAt(anchorW, depZ) / 2.4,
    };

    // ── Scheme object ──────────────────────────────────────────────────────
    // Scheme A's hand-written shader samples raw (no three.js decode/encode),
    // so its texture must be un-tagged or the card renders washed out.
    // 正面纹理随视口资产缓存（raw/std 两个变体预热时都已构建）。
    const frontTex = scheme === "A" ? assets.frontRaw : assets.frontStd;
    const backTex = sharedTexture("back", () => createTicketBackTexture());
    let animObject = null;

    const makeGroundShadow = () => {
      const mat = new THREE.MeshBasicMaterial({
        map: sharedTexture("shadow", () => createCardShadowTexture()),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.scale.set(2.4 * 1.52, 2.4 * (targetH / targetW) * 1.73, 1);
      return { mesh, mat };
    };

    if (scheme === "A") {
      const baseH = 2.4 * (targetH / targetW);
      const geo = new THREE.PlaneGeometry(2.4, baseH, 36, 24);
      const mat = createStampMaterial(frontTex, targetW, targetH);
      const mesh = new THREE.Mesh(geo, mat);
      const ground = makeGroundShadow();
      ground.mesh.position.z = -0.015;
      const group = new THREE.Group();
      group.add(ground.mesh);
      group.add(mesh);
      scene.add(group);

      animObject = {
        update(p, speed, dirX) {
          mat.uniforms.uProgress.value = Math.min(1, p);
          mat.uniforms.uSpeed.value = speed;
          mat.uniforms.uDirection.value.set(dirX, 0);

          const arcZ = Math.sin(Math.min(1, p) * Math.PI) * 1.5;
          group.position.set(
            fromTransform.x + (toTransform.x - fromTransform.x) * p,
            fromTransform.y + (toTransform.y - fromTransform.y) * p,
            fromTransform.z + (toTransform.z - fromTransform.z) * p + arcZ,
          );
          group.rotation.set(
            fromTransform.rotX + (toTransform.rotX - fromTransform.rotX) * p,
            fromTransform.rotY + (toTransform.rotY - fromTransform.rotY) * p,
            fromTransform.rotZ + (toTransform.rotZ - fromTransform.rotZ) * p,
          );
          // Velocity stretch: the paper elongates a hair along travel.
          const s = fromTransform.scale + (toTransform.scale - fromTransform.scale) * p;
          group.scale.set(s * (1 + speed * 0.0022), s, s);

          const settle = Math.min(1, Math.max(0, (p - 0.55) / 0.45));
          ground.mat.opacity = settle * settle * 0.55;
        },
        dispose() {
          geo.dispose();
          mat.dispose();
          // ground.mat.map 是共享缓存的阴影纹理——归缓存所有，不在此销毁。
          ground.mat.dispose();
        },
      };
    } else if (scheme === "B") {
      const card = createEjectCard(frontTex, backTex, targetW, targetH);
      scene.add(card.group);
      animObject = {
        update(p) {
          card.updatePose(p, fromTransform, toTransform);
        },
        dispose() {
          card.mesh.geometry.dispose();
        },
      };
    } else {
      const origami = createOrigamiTicket(frontTex, backTex, targetW, targetH);
      scene.add(origami.root);
      animObject = {
        update(p) {
          origami.updatePose(p, fromTransform, toTransform);
        },
        dispose() {},
      };
    }

    // The impact blast is anchored to the real card rect, and its ADMIT ONE
    // seal stamps down exactly onto the seal PRINTED on the ticket.
    const stampScreen = m.stubChildren?.stamp
      ? {
          x: m.center.x + (m.stubChildren.stamp.cx - m.width / 2),
          y: m.center.y + (m.stubChildren.stamp.cy - m.height / 2),
        }
      : null;
    setBlastRect({
      x: m.center.x,
      y: m.center.y,
      w: targetW,
      h: targetH,
      seal: stampScreen,
    });

    // ── Flight loop ────────────────────────────────────────────────────────
    const duration = 820;
    const freezeParam = new URLSearchParams(location.search).get("flight-freeze");
    const freezeAt = freezeParam !== null && freezeParam !== "" ? Number(freezeParam) : null;
    let freezeUntil = 0;

    const startTime = performance.now();
    let animId = 0;
    let releaseTimer = 0;
    let prevP = reverse ? 1 : 0;
    let completed = false;

    const step = (now) => {
      let rawT = Math.min(1, (now - startTime) / duration);
      if (reverse) rawT = 1 - rawT;

      // Debug freeze: hold a frame so the transition can be screenshot.
      if (freezeAt !== null && !Number.isNaN(freezeAt)) {
        const rawForward = reverse ? 1 - rawT : rawT;
        if (rawForward >= freezeAt) {
          if (!freezeUntil) freezeUntil = now + 2600;
          if (now < freezeUntil) rawT = reverse ? 1 - freezeAt : freezeAt;
        }
      }

      const p = reverse
        ? Math.pow(Math.max(0, rawT), 2.2)
        : flightCurve(Math.min(1, rawT));

      // Veils: the pink field covers home early and fully before the view
      // swap; the PLAYGROUND word only emerges in the flight's back half, so
      // the homepage hero and login hero never overlap mid-dissolve.
      const baseT = reverse
        ? Math.min(1, Math.max(0, rawT / 0.62))
        : Math.min(1, rawT / 0.45);
      const decoT = reverse
        ? Math.min(1, Math.max(0, (rawT - 0.7) / 0.3))
        : Math.min(1, Math.max(0, (rawT - 0.55) / 0.3));
      bgBase.material.opacity = baseT;
      bgDeco.material.opacity = decoT;

      const speed = Math.abs(p - prevP) * 55;
      const dirX = p >= prevP ? 1 : -1;
      prevP = p;

      animObject?.update(Math.max(0, Math.min(1.04, p)), speed, dirX);
      renderer.render(scene, camera);

      if (!reverse && rawT >= 0.8) setStampImpact((v) => v || true);

      const finished = reverse ? rawT <= 0 : rawT >= 1;
      if (!finished) {
        animId = requestAnimationFrame(step);
      } else if (!completed) {
        completed = true;
        // The DOM page mounts beneath the held final frame (the parent swaps
        // the view synchronously in onComplete); then the frozen flight
        // dissolves into it and the overlay releases. A short timeout (not
        // rAF — throttled to zero in hidden tabs) lets the swapped frame
        // present before the fade starts.
        onComplete?.();
        releaseTimer = window.setTimeout(() => {
          setReleasing(true);
          releaseTimer = window.setTimeout(() => onRelease?.(), 480);
        }, 60);
      }
    };
    animId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animId);
      window.clearTimeout(releaseTimer);
      if (viewport.contains(renderer.domElement)) {
        viewport.removeChild(renderer.domElement);
      }
      animObject?.dispose?.();
      // mesh/material 是单次飞行的开销，销毁；渲染器与屏幕级纹理是模块级
      // 缓存（渲染器复用省去上下文重建，纹理复用省去整屏 canvas 重画），
      // 必须跨点击存活——只解除挂载，绝不 dispose。
      for (const mesh of [bgBase, bgDeco]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      scene.clear();
    };
  }, [active, reverse, scheme, onComplete, onRelease]);

  if (!active) return null;

  return (
    <div
      className={`login-transition-viewport${stampImpact ? " has-impact" : ""}${releasing ? " is-releasing" : ""}`}
      ref={containerRef}
    >
      {blastRect && stampImpact && (
        <div
          className="transition-stamp-blast"
          aria-hidden="true"
          style={{ left: blastRect.x, top: blastRect.y, width: blastRect.w, height: blastRect.h }}
        >
          <div className="stamp-blast-ring" />
          <div
            className="stamp-blast-seal"
            style={
              blastRect.seal
                ? { left: blastRect.seal.x - 44, top: blastRect.seal.y - 44, right: "auto", bottom: "auto" }
                : undefined
            }
          >
            ADMIT ONE
          </div>
        </div>
      )}
    </div>
  );
}
