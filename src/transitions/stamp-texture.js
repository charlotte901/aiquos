import * as THREE from "three";

/**
 * High-fidelity 2D canvas textures for the login transition.
 * The front face is a 1:1 replica of the DOM `.login-composition` ticket
 * (706 × 480 logical px drawn at 2× = 1412 × 960) so the WebGL → DOM handoff
 * at the end of the flight swaps two nearly identical images.
 */

const T = 2; // 2× supersampling

export function createTicketFrontTexture() {
  const W = 706 * T;
  const H = 480 * T;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Card body — matches .login-composition: #fffdfb, radius 20
  ctx.fillStyle = "#fffdfb";
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 20 * T);
  ctx.fill();

  const splitX = (706 - 196) * T; // 510px logical divider

  // ── LEFT: main stub (.login-surface > .login-form, padding 50px 52px 42px) ──
  const padL = 52 * T;
  const padT = 50 * T;
  const formW = 510 * T - padL - 30 * T;

  // Inner panel gradient — matches .login-screen .login-form background
  const inner = ctx.createLinearGradient(0, padT - 14 * T, 0, H - 42 * T);
  inner.addColorStop(0, "#fff6fa");
  inner.addColorStop(1, "#fde7f1");
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.roundRect(padL - 12 * T, padT - 14 * T, formW + 24 * T, H - (padT - 14 * T) - 34 * T, 10 * T);
  ctx.fill();
  ctx.strokeStyle = "#f6d7e6";
  ctx.lineWidth = 1 * T;
  ctx.stroke();

  ctx.textAlign = "left";

  // Kicker — dot + AIQUOS · PLAYGROUND
  const kickY = padT + 12 * T;
  const kickGrad = ctx.createLinearGradient(0, 0, 12 * T, 12 * T);
  kickGrad.addColorStop(0, "#ff8abf");
  kickGrad.addColorStop(1, "#f568a3");
  ctx.fillStyle = kickGrad;
  ctx.beginPath();
  ctx.arc(padL + 4 * T, kickY - 4 * T, 4 * T, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c04a80";
  ctx.font = `700 ${10 * T}px "DM Sans", "Noto Sans SC", sans-serif`;
  ctx.letterSpacing = `${2.2 * T}px`;
  ctx.fillText("AIQUOS · PLAYGROUND", padL + 14 * T, kickY);
  ctx.letterSpacing = "0px";

  // Title 欢迎回来 — 34px #332030
  ctx.fillStyle = "#332030";
  ctx.font = `700 ${34 * T}px "Noto Sans SC", sans-serif`;
  ctx.fillText("欢迎回来", padL, kickY + 52 * T);

  // Subtitle — 14.5px #93637c
  ctx.fillStyle = "#93637c";
  ctx.font = `500 ${14.5 * T}px "Noto Sans SC", sans-serif`;
  ctx.fillText("登录，探索你的 AI 实力", padL, kickY + 78 * T);

  // Fields — 50px tall pills
  const fieldX = padL;
  const fieldW = formW;
  const fieldH = 50 * T;
  const f1Y = kickY + 100 * T;
  const f2Y = f1Y + 62 * T;

  for (const [y, label, isPassword] of [[f1Y, "手机号 / 邮箱", false], [f2Y, "••••••••", true]]) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.strokeStyle = "#f0bcd3";
    ctx.lineWidth = 1 * T;
    ctx.beginPath();
    ctx.roundRect(fieldX, y, fieldW, fieldH, fieldH / 2);
    ctx.fill();
    ctx.stroke();

    // Leading icon dot (user / lock silhouette → simple glyph circle)
    ctx.fillStyle = "#d16d9d";
    if (!isPassword) {
      ctx.beginPath();
      ctx.arc(fieldX + 24 * T, y + 19 * T, 5.5 * T, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(fieldX + 16 * T, y + 26 * T, 16 * T, 10 * T, 5 * T);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.roundRect(fieldX + 17 * T, y + 22 * T, 14 * T, 11 * T, 3 * T);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fieldX + 24 * T, y + 20 * T, 6 * T, Math.PI, 0);
      ctx.strokeStyle = "#d16d9d";
      ctx.lineWidth = 2.4 * T;
      ctx.stroke();
    }

    ctx.fillStyle = "#b98da3";
    ctx.font = `500 ${16 * T}px "Noto Sans SC", sans-serif`;
    ctx.fillText(label, fieldX + 42 * T, y + 31 * T);
  }

  // Submit — gradient pill, 50px
  const btnY = f2Y + 62 * T;
  const btnGrad = ctx.createLinearGradient(fieldX, btnY, fieldX + fieldW, btnY);
  btnGrad.addColorStop(0, "#ff7cb7");
  btnGrad.addColorStop(0.55, "#f568a3");
  btnGrad.addColorStop(1, "#ec5b97");
  ctx.fillStyle = btnGrad;
  ctx.beginPath();
  ctx.roundRect(fieldX, btnY, fieldW, fieldH, fieldH / 2);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${16 * T}px "Noto Sans SC", sans-serif`;
  ctx.fillText("登录  →", fieldX + fieldW / 2, btnY + 31 * T);
  ctx.textAlign = "left";

  // Note
  ctx.fillStyle = "#a5738c";
  ctx.font = `400 ${11 * T}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("演示模式 · 无需填写真实账号", fieldX + fieldW / 2, btnY + 74 * T);
  ctx.textAlign = "left";

  // ── Divider: dashed tear line + punched notches (matches DOM ::before/::after) ──
  ctx.save();
  ctx.setLineDash([7 * T, 8 * T]);
  ctx.strokeStyle = "#e3bccf";
  ctx.lineWidth = 2 * T;
  ctx.beginPath();
  ctx.moveTo(splitX, 6 * T);
  ctx.lineTo(splitX, H - 6 * T);
  ctx.stroke();
  ctx.restore();

  // The tear-line punch holes are cut by the fragment shader (real alpha
  // holes) rather than painted here: mid-flight the card travels over the
  // still-fading home, so painted ground-colour discs would read as stains.

  // ── RIGHT: keepsake stub (196px wide, padding 28px 18px) ──
  const stubCx = splitX + 98 * T;

  ctx.textAlign = "center";
  ctx.fillStyle = "#c04a80";
  ctx.font = `800 ${8.5 * T}px "DM Sans", sans-serif`;
  ctx.letterSpacing = `${1.4 * T}px`;
  ctx.fillText("AIQUOS · ASSESSMENT", stubCx, 44 * T);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#332030";
  ctx.font = `800 ${15 * T}px "DM Sans", sans-serif`;
  ctx.fillText("№ 2026-0919", stubCx, 78 * T);

  // Barcode — 46px tall
  const barY = 110 * T;
  const barW = 160 * T;
  const barX = splitX + 18 * T;
  ctx.fillStyle = "#17150f";
  ctx.globalAlpha = 0.88;
  let cx = barX;
  const pats = [4, 2, 7, 3, 2, 6, 3, 5, 2, 8, 4, 3, 6, 2, 5, 3, 7, 2, 4, 6, 3, 8, 2, 5, 4];
  let pi = 0;
  while (cx < barX + barW) {
    const w = pats[pi % pats.length] * T * 0.9;
    if (pi % 2 === 0) ctx.fillRect(cx, barY, Math.min(w, barX + barW - cx), 46 * T);
    cx += w;
    pi++;
  }
  ctx.globalAlpha = 1;

  // ADMIT ONE seal — 76px circle, tilted -8deg (matches .login-stub-stamp)
  ctx.save();
  ctx.translate(stubCx, H - 76 * T);
  ctx.rotate(-0.14);
  ctx.strokeStyle = "rgba(224, 71, 143, 0.72)";
  ctx.lineWidth = 2.5 * T;
  ctx.beginPath();
  ctx.arc(0, 0, 38 * T, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e0478f";
  ctx.font = `800 ${10 * T}px "DM Sans", sans-serif`;
  ctx.fillText("ADMIT", 0, -4 * T);
  ctx.fillText("ONE", 0, 10 * T);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The login backdrop, split into two layers so their opacity curves can be
 * staggered: the saturated pink field rises early (covering home before the
 * swap), while the blurred PLAYGROUND word and paper grain arrive late —
 * mid-flight the homepage hero never has to compete with the login hero.
 */
export function createLoginBackdropBaseTexture() {
  const W = 1280;
  const H = 800;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Base #f568a3 + the two radial sheens from .login-screen
  ctx.fillStyle = "#f568a3";
  ctx.fillRect(0, 0, W, H);

  const top = ctx.createRadialGradient(W / 2, -H * 0.05, 10, W / 2, -H * 0.05, W * 0.62);
  top.addColorStop(0, "rgba(255,255,255,0.16)");
  top.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H);

  const corner = ctx.createRadialGradient(W * 0.9, H * 1.08, 10, W * 0.9, H * 1.08, W * 0.5);
  corner.addColorStop(0, "rgba(23,21,15,0.14)");
  corner.addColorStop(1, "rgba(23,21,15,0)");
  ctx.fillStyle = corner;
  ctx.fillRect(0, 0, W, H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createLoginBackdropDecoTexture() {
  const W = 1280;
  const H = 800;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Transparent canvas: only the word + grain live here.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const word = "PLAYGROUND";
  // Blurred word — layered low-alpha passes (ctx.filter is unavailable in
  // some Safari versions).
  for (const [size, alpha] of [[168, 26], [168, 13], [168, 7]]) {
    ctx.font = `900 ${size}px "DM Sans", sans-serif`;
    ctx.fillStyle = `rgba(255,255,255,${alpha / 100})`;
    ctx.fillText(word, W / 2, H * 0.155);
  }
  ctx.font = `900 ${168}px "DM Sans", sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.30)";
  ctx.fillText(word, W / 2, H * 0.155);

  // Paper grain — soft round specks (stand-in for case-poster-grain.png).
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = "rgba(120,20,60,0.05)";
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Back face: deep burgundy passport with guilloche security rings and the
 * gold-foil AIQUOS emblem (scheme B's mid-air flip reveal).
 */
export function createTicketBackTexture() {
  const W = 1412;
  const H = 960;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#4a122e");
  bg.addColorStop(0.5, "#3b0c23");
  bg.addColorStop(1, "#260616");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(245, 104, 163, 0.18)";
  ctx.lineWidth = 1.5;
  for (let r = 50; r < 720; r += 28) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let x = -H; x < W + H; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
    ctx.stroke();
  }

  const cx = W / 2;
  const cy = H / 2;
  ctx.strokeStyle = "rgba(255, 215, 140, 0.85)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 190, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 215, 140, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 206, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 225, 170, 0.95)";
  ctx.font = `900 ${74}px "DM Sans", sans-serif`;
  ctx.fillText("AIQUOS", cx, cy + 10);
  ctx.fillStyle = "rgba(255, 215, 140, 0.75)";
  ctx.font = `700 ${22}px "DM Sans", sans-serif`;
  ctx.letterSpacing = "6px";
  ctx.fillText("CREATIVE PASSPORT", cx, cy + 68);
  ctx.fillText("EST. 2026", cx, cy - 64);
  ctx.letterSpacing = "0px";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
