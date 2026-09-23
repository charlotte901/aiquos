import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createTicketFrontTexture,
  createTicketBackTexture,
  createLoginBackdropBaseTexture,
  createLoginBackdropDecoTexture,
} from "./stamp-texture.js";
import { createStampMaterial } from "./stamp-shader.js";
import { createEjectCard } from "./cube-eject-shader.js";
import { createOrigamiTicket } from "./origami-shader.js";
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
 * 2. A full-cover backdrop veil — a replica of the login page's pink field,
 *    sheen, blurred PLAYGROUND word and grain — fades up beneath the flying
 *    ticket and fully covers home before the views swap, so there is never a
 *    hard background cut in either direction.
 * 3. On arrival the veil is pixel-indistinguishable from the mounted login
 *    screen and the ticket texture is a 1:1 replica of the DOM composition,
 *    so the WebGL → DOM handoff is masked down to the impact shudder.
 */
export function LoginTransitionOverlay({
  active = false,
  reverse = false,
  scheme = "A",
  onComplete,
}) {
  const containerRef = useRef(null);
  const [stampImpact, setStampImpact] = useState(false);

  useEffect(() => {
    if (!active) {
      setStampImpact(false);
      return undefined;
    }
    const container = containerRef.current;
    if (!container) return undefined;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const fov = 42;
    const camDist = 5;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);
    camera.position.set(0, 0, camDist);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    container.appendChild(renderer.domElement);

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

    // ── Backdrop veil: the login field, faded over home ────────────────────
    // Two staggered layers: the pink field covers home before the view swap,
    // while the PLAYGROUND word + grain only emerge once home has dissolved,
    // so the two heroes never fight mid-flight.
    const bgZ = -2.4;
    const bgVisH = visibleAt(camDist - bgZ);
    const bgVisW = bgVisH * (width / height);
    const makeVeil = (tex, z) => {
      const aspect = tex.image.width / tex.image.height;
      const cover = Math.max(bgVisW / aspect, bgVisH); // CSS cover fit
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(cover * aspect, cover),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: reverse ? 1 : 0,
          depthWrite: false,
        }),
      );
      mesh.position.z = z;
      scene.add(mesh);
      return mesh;
    };
    const bgBase = makeVeil(createLoginBackdropBaseTexture(), bgZ);
    const bgDeco = makeVeil(createLoginBackdropDecoTexture(), bgZ + 0.02);

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

    // ── Target: the centred DOM login composition ───────────────────────────
    const targetW = Math.min(706, width * 0.94);
    const targetH = targetW * (480 / 706);
    const toPos = pxToWorldAt(width / 2, height / 2, 0);
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
    const frontTex = createTicketFrontTexture();
    const backTex = createTicketBackTexture();
    let animObject = null;

    if (scheme === "A") {
      const baseH = 2.4 * (480 / 706);
      const geo = new THREE.PlaneGeometry(2.4, baseH, 36, 24);
      const mat = createStampMaterial(frontTex, targetW, targetH);
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);

      animObject = {
        update(p, speed, dirX) {
          mat.uniforms.uProgress.value = Math.min(1, p);
          mat.uniforms.uSpeed.value = speed;
          mat.uniforms.uDirection.value.set(dirX, 0);

          const arcZ = Math.sin(Math.min(1, p) * Math.PI) * 1.5;
          mesh.position.set(
            fromTransform.x + (toTransform.x - fromTransform.x) * p,
            fromTransform.y + (toTransform.y - fromTransform.y) * p,
            fromTransform.z + (toTransform.z - fromTransform.z) * p + arcZ,
          );
          mesh.rotation.set(
            fromTransform.rotX + (toTransform.rotX - fromTransform.rotX) * p,
            fromTransform.rotY + (toTransform.rotY - fromTransform.rotY) * p,
            fromTransform.rotZ + (toTransform.rotZ - fromTransform.rotZ) * p,
          );
          // Velocity stretch: the paper elongates a hair along travel.
          const s = fromTransform.scale + (toTransform.scale - fromTransform.scale) * p;
          mesh.scale.set(s * (1 + speed * 0.0022), s, s);
        },
        dispose() {
          geo.dispose();
          mat.dispose();
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

    // ── Flight loop ────────────────────────────────────────────────────────
    const duration = 820;
    const freezeParam = new URLSearchParams(location.search).get("flight-freeze");
    const freezeAt = freezeParam !== null && freezeParam !== "" ? Number(freezeParam) : null;
    let freezeUntil = 0;

    const startTime = performance.now();
    let animId = 0;
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
      // swap; the deco layer (PLAYGROUND word + grain) only emerges in the
      // flight's back half, so the homepage hero and login hero never
      // overlap mid-dissolve.
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
        onComplete?.();
      }
    };
    animId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      animObject?.dispose?.();
      for (const mesh of [bgBase, bgDeco]) {
        mesh.geometry.dispose();
        mesh.material.map?.dispose();
        mesh.material.dispose();
      }
      frontTex.dispose();
      backTex.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [active, reverse, scheme, onComplete]);

  if (!active) return null;

  return (
    <div className={`login-transition-viewport${stampImpact ? " has-impact" : ""}`}>
      <div className="login-transition-canvas" ref={containerRef} />
      {stampImpact && (
        <div className="transition-stamp-blast" aria-hidden="true">
          <div className="stamp-blast-ring" />
          <div className="stamp-blast-seal">ADMIT ONE</div>
        </div>
      )}
    </div>
  );
}
