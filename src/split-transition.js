import { getFrameScaleFromDom, getStageSize } from "./stage.js";

export const STRIP_DIRECTIONS = [-1, 1, -1];
export const TRANSITION_DURATION = 1080;

/** Strong at both ends: the sheet is pulled, it does not drift. Shared with the
 * homepage/case-library push (see slide-transition.js) so every horizontal move
 * in the site reads as the same gesture — a constant rather than a copied
 * comment, so the two cannot drift apart. */
export const STRIP_EASING = "cubic-bezier(.76,0,.24,1)";

/** Cut through the whitespace around the complete card group, never through
 * a card. On phones the middle band contains both rows. Offscreen regions can
 * collapse to zero height without introducing a cut into visible artwork. */
export function getCardStripBounds(height, cards, headingBottom) {
  if (!cards.length) return [0, 0, height, height];
  const top = Math.min(...cards.map((card) => card.top));
  const bottom = Math.max(...cards.map((card) => card.bottom));
  const padding = Math.max(0, Math.min(24, (top - headingBottom) / 2));
  const clamp = (value) => Math.max(0, Math.min(height, value));
  return [0, clamp(top - padding), clamp(bottom + padding), height];
}

export function measureAssessmentBands(root) {
  // Card rects come back in screen pixels; the strip clip paths they produce are
  // applied inside the stage, which is in design pixels. Dividing through by the
  // frame scale is what keeps a seam on the whitespace it was measured from once
  // the frame is no longer 1:1 with the window. Everything measured inside one
  // stage shares that scale, so the boundaries stay correct relative to each
  // other at any window size.
  const scale = getFrameScaleFromDom() || 1;
  const cards = [...root.querySelectorAll(".assessment-card, .choose-card, .profile-card")].map((card) =>
    card.getBoundingClientRect(),
  );
  const heading = root.querySelector(".assessment-wordmark, .choose-wordmark, .profile-wordmark");
  return getCardStripBounds(
    getStageSize()[1],
    cards.map((box) => ({
      top: box.top / scale,
      bottom: box.bottom / scale,
    })),
    (heading?.getBoundingClientRect().bottom ?? 0) / scale,
  );
}

/** Capture sandboxed WebGL screens after their next rendered frame. No same-origin
 * privilege is granted: each child explicitly returns its own canvas pixels. */
export async function collectSceneFrames(root) {
  // Hidden next-group layers are deliberately paused and need not respond.
  // Waiting for them delays every transition by the capture timeout.
  const frames = [...root.querySelectorAll(".case-layer.is-visible iframe")];
  const images = new Map();
  if (!frames.length) return images;
  const requestId = crypto.randomUUID();
  await new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      resolve();
    };
    const receive = (event) => {
      const frame = frames.find((node) => node.contentWindow === event.source);
      if (
        !frame ||
        event.data?.type !== "aiquos:frame" ||
        event.data.requestId !== requestId
      )
        return;
      if (
        typeof event.data.image === "string" &&
        event.data.image.startsWith("data:image/png;base64,")
      )
        images.set(frame, event.data.image);
      if (images.size === frames.length) done();
    };
    const timer = setTimeout(done, 600);
    window.addEventListener("message", receive);
    frames.forEach((frame) =>
      frame.contentWindow?.postMessage(
        { type: "aiquos:capture", requestId },
        "*",
      ),
    );
  });
  return images;
}

function copyComputedStyle(source, target) {
  const style = getComputedStyle(source);
  for (const key of style)
    target.style.setProperty(key, style.getPropertyValue(key));
}

/** Create an inert visual mirror. Canvases/video frames are copied, sandboxed
 * iframes become their current image, and no duplicate game/runtime is mounted. */
export async function freezeView(root, sceneFrames = new Map()) {
  const copy = root.cloneNode(true);
  copy.style.background = getComputedStyle(document.documentElement).backgroundColor;
  copy.removeAttribute("hidden");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  // Frozen login visuals must never carry credentials into transition layers.
  copy.querySelectorAll("input, textarea").forEach((input) => {
    input.value = "";
    input.removeAttribute("value");
  });
  const originals = [...root.querySelectorAll("canvas,video,iframe")];
  const copies = [...copy.querySelectorAll("canvas,video,iframe")];
  const decoding = [];
  originals.forEach((source, index) => {
    const target = copies[index];
    if (source.tagName === "IFRAME") {
      const image = new Image();
      copyComputedStyle(source, image);
      image.alt = "";
      const src = sceneFrames.get(source);
      if (src) {
        image.src = src;
        decoding.push(image.decode().catch(() => {}));
      } else {
        image.style.visibility = "hidden";
      }
      target.replaceWith(image);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth || source.width;
    canvas.height = source.videoHeight || source.height;
    copyComputedStyle(source, canvas);
    try {
      canvas.getContext("2d").drawImage(source, 0, 0);
    } catch {
      /* unloaded custom media keeps its existing backing */
    }
    target.replaceWith(canvas);
  });
  copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  copy.querySelectorAll("img").forEach((image) => {
    if (image.src) decoding.push(image.decode().catch(() => {}));
  });
  await Promise.all(decoding);
  return copy;
}

function duplicateFrozen(source) {
  const copy = source.cloneNode(true);
  const originals = source.querySelectorAll("canvas");
  copy
    .querySelectorAll("canvas")
    .forEach((canvas, index) =>
      canvas.getContext("2d").drawImage(originals[index], 0, 0),
    );
  return copy;
}

export function holdView(host, view, scrollY = 0) {
  const frozen = duplicateFrozen(view);
  frozen.style.width = `${getStageSize()[0]}px`;
  frozen.style.transform = `translateY(${-scrollY}px)`;
  host.replaceChildren(frozen);
  host.classList.add("is-running");
}

export async function animateStrips(
  host,
  outgoing,
  incoming,
  scrollY = 0,
  reverse = false,
  boundaries = null,
) {
  // The strips are children of the stage, so their clip insets and travel
  // distance are design pixels. Seal the read once, here, so both cannot be
  // taken in different units.
  const [width, height] = getStageSize();
  const bands = boundaries ?? [0, 0, height, height];
  // Development-only slow motion for screenshot-based transition inspection.
  const slowPreview =
    import.meta.env?.DEV &&
    new URLSearchParams(location.search).has("transition-preview");
  const animations = [];
  host.replaceChildren();
  host.classList.add("is-running");
  STRIP_DIRECTIONS.forEach((direction, index) => {
    const sign = direction * (reverse ? -1 : 1);
    for (const [kind, view] of [
      ["out", outgoing],
      ["in", incoming],
    ]) {
      const strip = document.createElement("div");
      strip.className = `transition-strip strip-${kind}`;
      strip.dataset.band = String(index);
      strip.style.clipPath = `inset(${bands[index]}px 0 ${height - bands[index + 1]}px 0)`;
      const frozen = duplicateFrozen(view);
      frozen.style.width = `${width}px`;
      frozen.style.transform =
        kind === "out" ? `translateY(${-scrollY}px)` : "none";
      strip.append(frozen);
      host.append(strip);
      const start = kind === "out" ? 0 : -sign * (width + 32);
      const end = kind === "out" ? sign * (width + 32) : 0;
      animations.push(
        strip.animate(
          [
            { transform: `translateX(${start}px)` },
            { transform: `translateX(${end}px)` },
          ],
          {
            duration: slowPreview ? 30000 : TRANSITION_DURATION,
            delay: index * (slowPreview ? 300 : 85),
            easing: STRIP_EASING,
            fill: "both",
          },
        ),
      );
    }
  });
  const cancel = () => animations.forEach((animation) => animation.finish());
  window.addEventListener("resize", cancel, { once: true });
  try {
    await Promise.all(
      animations.map((animation) => animation.finished.catch(() => {})),
    );
  } finally {
    window.removeEventListener("resize", cancel);
    host.replaceChildren();
    host.classList.remove("is-running");
  }
}
