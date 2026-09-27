import * as THREE from "three";

/**
 * High-fidelity 2D canvas textures for the login transition.
 *
 * The front face is painted from LIVE MEASUREMENTS of the real DOM login
 * composition (see measure-login.js): every block, field, icon and the stub
 * are drawn at their measured rects with the computed styles, so the final
 * WebGL frame is a pixel-stand-in for the mounted page and the
 * WebGL → DOM handoff can freeze-and-dissolve invisibly.
 */

const T = 2; // 2× supersampling (logical px → texture px)

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x * T, y * T, w * T, h * T, r * T);
}

/** Elliptical radial gradient in CSS-percentage terms over a WxH field. */
function ellipseSheen(ctx, W, H, cxPct, cyPct, rxPct, ryPct, stops) {
  const cx = (W * cxPct) / 100;
  const cy = (H * cyPct) / 100;
  const rx = (W * rxPct) / 100;
  const ry = (H * ryPct) / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(-cx / rx, -cy / ry, W / rx, H / ry);
  ctx.restore();
}

function fontOf(style, scale = T) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize * scale}px ${style.fontFamily}`;
}

function drawText(ctx, style, { centerX = false, alpha = 1 } = {}) {
  const { rect } = style;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = style.color;
  ctx.font = fontOf(style);
  try {
    ctx.letterSpacing = `${style.letterSpacing * T}px`;
  } catch {
    /* older engines: tracking is skipped, position still holds */
  }
  ctx.textAlign = centerX ? "center" : "left";
  // Centre the glyph run inside its measured line box.
  ctx.textBaseline = "middle";
  const x = centerX ? (rect.x + rect.w / 2) * T : rect.x * T;
  ctx.fillText(style.text, x, (rect.y + rect.h / 2) * T);
  ctx.restore();
}

/* ── Phosphor-style stroke icons, drawn inside their measured SVG rects ── */

function iconUser(ctx, r, color) {
  ctx.save();
  ctx.translate(r.cx * T, r.cy * T);
  const s = Math.min(r.w, r.h) * T;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.089;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -s * 0.19, s * 0.21, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, s * 0.42, s * 0.40, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.restore();
}

function iconLock(ctx, r, color) {
  ctx.save();
  ctx.translate(r.cx * T, r.cy * T);
  const s = Math.min(r.w, r.h) * T;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.089;
  ctx.lineCap = "round";
  const bw = s * 0.62;
  const bh = s * 0.5;
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -s * 0.05, bw, bh, s * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.08, s * 0.21, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, s * 0.16, s * 0.055, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function iconEye(ctx, r, color) {
  ctx.save();
  ctx.translate(r.cx * T, r.cy * T);
  const s = Math.min(r.w, r.h) * T;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.089;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, 0);
  ctx.quadraticCurveTo(0, -s * 0.52, s * 0.46, 0);
  ctx.quadraticCurveTo(0, s * 0.52, -s * 0.46, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function iconArrowRight(ctx, r, color) {
  ctx.save();
  ctx.translate(r.cx * T, r.cy * T);
  const s = Math.min(r.w, r.h) * T;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.135;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, 0);
  ctx.lineTo(s * 0.38, 0);
  ctx.moveTo(s * 0.1, -s * 0.3);
  ctx.lineTo(s * 0.4, 0);
  ctx.lineTo(s * 0.1, s * 0.3);
  ctx.stroke();
  ctx.restore();
}

/* ─────────────────────────── front (the ticket) ─────────────────────────── */

/**
 * @param {object} m measured metrics (measure-login.js)
 * @param {boolean} rawColor true for the custom stamp shader (scheme A): it
 *   bypasses three's decode/encode pipeline, so the texture must be sampled
 *   raw or every colour renders washed out. MeshPhysicalMaterial schemes
 *   (B/C) need the normal sRGB handling.
 */
export function createTicketFrontTexture(m, { rawColor = false } = {}) {
  const W = m.width * T;
  const H = m.height * T;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Card body — .login-composition: #fffdfb, radius 20.
  // The tear-line punch holes are cut by the fragment shader (real alpha
  // holes) rather than painted: mid-flight the card travels over the
  // still-fading home, so painted wall-colour discs would read as stains.
  ctx.fillStyle = "#fffdfb";
  rr(ctx, 0, 0, m.width, m.height, 20);
  ctx.fill();

  // ── Inner form panel — .login-screen .login-form ──
  if (m.formPanel) {
    const p = m.formPanel;
    ctx.save();
    rr(ctx, p.x, p.y, p.w, p.h, 10);
    ctx.clip();
    const g = ctx.createLinearGradient(p.x * T, p.y * T, (p.x + p.w * 0.24) * T, (p.y + p.h) * T);
    g.addColorStop(0, "#fff6fa");
    g.addColorStop(1, "#fde7f1");
    ctx.fillStyle = g;
    ctx.fillRect(p.x * T, p.y * T, p.w * T, p.h * T);
    ctx.restore();
    ctx.strokeStyle = "#f6d7e6";
    ctx.lineWidth = 1 * T;
    rr(ctx, p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1, 10);
    ctx.stroke();
  }

  // ── Heading block (kicker / title / subtitle) at measured positions ──
  if (m.kickerDot) {
    const d = m.kickerDot;
    const grad = ctx.createLinearGradient(d.x * T, d.y * T, (d.x + d.w) * T, (d.y + d.h) * T);
    grad.addColorStop(0, "#ff8abf");
    grad.addColorStop(1, "#f568a3");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(d.cx * T, d.cy * T, (d.w / 2) * T, 0, Math.PI * 2);
    ctx.fill();
  }
  if (m.texts.kicker) drawText(ctx, m.texts.kicker);
  if (m.texts.title) drawText(ctx, m.texts.title);
  if (m.texts.subtitle) drawText(ctx, m.texts.subtitle);

  // ── Input pills — .login-field ──
  for (const field of m.fields) {
    const f = field.rect;
    ctx.save();
    ctx.shadowColor = "rgba(231, 164, 194, 0.18)";
    ctx.shadowBlur = 10 * T;
    ctx.shadowOffsetY = 2 * T;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    rr(ctx, f.x, f.y, f.w, f.h, f.h / 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#f0bcd3";
    ctx.lineWidth = 1 * T;
    rr(ctx, f.x, f.y, f.w, f.h, f.h / 2);
    ctx.stroke();

    const iconRect = { x: f.x + 16, y: f.y + (f.h - 19) / 2, w: 19, h: 19, cx: f.x + 16 + 9.5, cy: f.y + f.h / 2 };
    if (field.hasToggle) iconLock(ctx, iconRect, "#d16d9d");
    else iconUser(ctx, iconRect, "#d16d9d");

    // Placeholder text — sits where the real input starts.
    ctx.fillStyle = "#b98da3";
    ctx.font = `400 ${16 * T}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(field.placeholder, (f.x + 46) * T, (f.y + f.h / 2) * T);

    if (field.hasToggle && m.toggle) iconEye(ctx, m.toggle, "#b06d90");
  }

  // ── Submit — .login-submit ──
  if (m.submit) {
    const b = m.submit;
    ctx.save();
    ctx.shadowColor = "rgba(245, 104, 163, 0.3)";
    ctx.shadowBlur = 22 * T;
    ctx.shadowOffsetY = 10 * T;
    const g = ctx.createLinearGradient(b.x * T, b.y * T, (b.x + b.w) * T, (b.y + b.h) * T);
    g.addColorStop(0, "#ff7cb7");
    g.addColorStop(0.55, "#f568a3");
    g.addColorStop(1, "#ec5b97");
    ctx.fillStyle = g;
    rr(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fill();
    ctx.restore();
    // inset 0 1px 0 highlight along the top inner edge
    ctx.save();
    rr(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.clip();
    const hi = ctx.createLinearGradient(0, b.y * T, 0, (b.y + b.h * 0.5) * T);
    hi.addColorStop(0, "rgba(255,255,255,0.35)");
    hi.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hi;
    ctx.fillRect(b.x * T, b.y * T, b.w * T, b.h * 0.5 * T);
    ctx.restore();

    if (m.texts.submitLabel) drawText(ctx, m.texts.submitLabel);
    if (m.submitIcon) iconArrowRight(ctx, m.submitIcon, "#ffffff");
  }

  if (m.texts.note) drawText(ctx, m.texts.note);

  // ── Keepsake stub — .login-stub ──
  if (m.stub) {
    const s = m.stub;
    ctx.save();
    rr(ctx, 0, 0, m.width, m.height, 20);
    ctx.clip();
    const sg = ctx.createLinearGradient(0, s.y * T, 0, (s.y + s.h) * T);
    sg.addColorStop(0, "#fff5f9");
    sg.addColorStop(1, "#fde7f1");
    ctx.fillStyle = sg;
    ctx.fillRect(s.x * T, s.y * T, s.w * T, s.h * T);
    ctx.restore();

    // Dashed tear border (left for the column layout, top for the strip).
    ctx.save();
    ctx.strokeStyle = "#e3bccf";
    ctx.lineWidth = 2 * T;
    ctx.setLineDash([6 * T, 7 * T]);
    ctx.beginPath();
    if (m.stubHorizontal) {
      ctx.moveTo(0, s.y);
      ctx.lineTo(m.width, s.y);
    } else {
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, m.height);
    }
    ctx.stroke();
    ctx.restore();

    const c = m.stubChildren;
    if (c?.barcode) {
      // repeating-linear-gradient(90deg, #17150f 0 2px, tr 2 5, #17150f 5 6, tr 6 11)
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "#17150f";
      for (let bx = 0; bx < c.barcode.w; bx += 11) {
        ctx.fillRect((c.barcode.x + bx) * T, c.barcode.y * T, 2 * T, c.barcode.h * T);
        ctx.fillRect((c.barcode.x + bx + 5) * T, c.barcode.y * T, 1 * T, c.barcode.h * T);
      }
      ctx.globalAlpha = 1;
    }
    if (c?.stamp) {
      const st = c.stamp;
      ctx.save();
      ctx.translate(st.cx * T, st.cy * T);
      ctx.rotate((-13 * Math.PI) / 180);
      ctx.strokeStyle = "rgba(224, 71, 143, 0.72)";
      ctx.lineWidth = 2.5 * T;
      ctx.beginPath();
      ctx.arc(0, 0, (st.w / 2 - 1.25) * T, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#e0478f";
      ctx.font = `800 ${10 * T}px "DM Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      try {
        ctx.letterSpacing = `${1.3 * T}px`;
      } catch {}
      ctx.fillText("ADMIT ONE", 0, 0);
      ctx.restore();
    }
    if (m.texts.brand) drawText(ctx, m.texts.brand);
    if (m.texts.serial) drawText(ctx, m.texts.serial);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = rawColor ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* ─────────────────────────── backdrop (the wall) ─────────────────────────── */

function paintWall(ctx, W, H) {
  // .login-screen: two radial sheens over #f568a3.
  ctx.fillStyle = "#f568a3";
  ctx.fillRect(0, 0, W, H);
  ellipseSheen(ctx, W, H, 50, -4, 90, 62, [
    [0, "rgba(255,255,255,0.16)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  ellipseSheen(ctx, W, H, 88, 108, 60, 40, [
    [0, "rgba(23,21,15,0.14)"],
    [1, "rgba(23,21,15,0)"],
  ]);
}

function paintSpeckGrain(ctx, W, H) {
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
}

/**
 * The pink wall at 1:1 screen scale (the veil planes are sized to the exact
 * viewport, so texture px = screen px). Grain starts as specks and is
 * re-painted with the real case-poster grain once the tile loads, matching
 * .login-screen::after (opacity .3, overlay blend).
 */
export function createLoginBackdropBaseTexture(width = 1280, height = 800) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  paintWall(ctx, width, height);
  paintSpeckGrain(ctx, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const img = new Image();
  img.onload = () => {
    paintWall(ctx, width, height);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.globalCompositeOperation = "overlay";
    for (let y = 0; y < height; y += img.height) {
      for (let x = 0; x < width; x += img.width) ctx.drawImage(img, x, y);
    }
    ctx.restore();
    texture.needsUpdate = true;
  };
  img.src = "/assets/case-poster-grain.png";
  return texture;
}

/**
 * The blurred PLAYGROUND word alone (it emerges late in the flight), drawn at
 * its real screen position/size as measured from the DOM. Heavy CSS blur is
 * approximated with stacked low-alpha passes when ctx.filter is unavailable.
 */
export function createLoginBackdropDecoTexture(width = 1280, height = 800, word = null) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (word) {
    const passes = [
      [0, 0, 0.2],
      [5, 3, 0.12],
      [-4, 5, 0.08],
      [7, -4, 0.05],
      [-6, -6, 0.05],
    ];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${word.fontWeight} ${word.fontSize}px ${word.fontFamily}`;
    try {
      ctx.letterSpacing = `${word.letterSpacing}px`;
    } catch {}
    for (const [dx, dy, alpha] of passes) {
      ctx.fillStyle = word.color;
      ctx.globalAlpha = alpha;
      ctx.fillText(word.text, (word.cx + dx) * 1, (word.cy + dy) * 1);
    }
    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Soft rounded-square drop shadow (the DOM card's `0 36px 80px` shadow),
 * offset downward inside the texture. Drawn blurred via ctx.filter with a
 * stacked-outline fallback.
 */
export function createCardShadowTexture() {
  const W = 256;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const rect = { x: 44, y: 50, w: 168, h: 148, r: 24 }; // offset down = the 36px lift

  ctx.fillStyle = "rgba(76, 26, 56, 1)";
  if (ctx.filter !== undefined) {
    ctx.filter = "blur(16px)";
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rect.r);
    ctx.fill();
    ctx.filter = "none";
  } else {
    for (let i = 10; i >= 1; i--) {
      ctx.globalAlpha = 0.05;
      ctx.beginPath();
      ctx.roundRect(rect.x - i * 1.8, rect.y - i * 1.8 + 4, rect.w + i * 3.6, rect.h + i * 3.6, rect.r + i * 1.8);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
