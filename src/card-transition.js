import { getFrameScaleFromDom, getStageSize } from "./stage.js";

export const CARD_FLIGHT = { exit: 520, enter: 620, stagger: 28, overlap: 260 };

/** Entire cards travel beyond the viewport; no masks or cuts cross the artwork. */
export function getCardFlight(kind, index, count, rect, viewport, reverse = false) {
  const spread = index - (count - 1) / 2;
  const direction = reverse ? -1 : 1;
  const distance = kind === "out"
    ? direction > 0 ? -rect.bottom - 60 : viewport.height - rect.top + 60
    : direction > 0 ? viewport.height - rect.top + 60 : -rect.bottom - 60;
  const away = `translate3d(${spread * viewport.width * .08}px, ${distance}px, 0) rotate(${spread * 5 * direction}deg) scale(.94)`;
  const rest = "translate3d(0, 0, 0) rotate(0deg) scale(1)";
  return {
    keyframes: kind === "out"
      ? [{ transform: rest, opacity: 1 }, { transform: away, opacity: 0 }]
      : [{ transform: away, opacity: 0 }, { transform: rest, opacity: 1 }],
    options: {
      duration: kind === "out" ? CARD_FLIGHT.exit : CARD_FLIGHT.enter,
      delay: (kind === "out" ? 0 : CARD_FLIGHT.overlap) + index * CARD_FLIGHT.stagger,
      easing: kind === "out" ? "cubic-bezier(.4,0,.2,1)" : "cubic-bezier(.22,1,.36,1)",
      fill: "both",
    },
  };
}

export async function animateCards(host, outgoing, incoming, scrollY = 0, reverse = false) {
  const animations = [];
  // The flight layers are children of the stage, so "clear the screen" means
  // clearing the frame. Card rects are screen pixels; dividing through by the
  // frame scale puts them in the same space as the frame's own width/height, or
  // the two would disagree by the scale factor at every size but 1:1.
  const [frameWidth, frameHeight] = getStageSize();
  const scale = getFrameScaleFromDom() || 1;
  const viewport = { width: frameWidth, height: frameHeight };
  const slowPreview = import.meta.env?.DEV && new URLSearchParams(location.search).has("card-preview");
  const speed = slowPreview ? 12 : 1;
  host.replaceChildren();
  host.classList.add("is-running");
  for (const [kind, frozen] of [["out", outgoing], ["in", incoming]]) {
    const layer = document.createElement("div");
    layer.className = `card-flight-layer flight-${kind}`;
    frozen.style.width = `${viewport.width}px`;
    frozen.style.transform = kind === "out" ? `translateY(${-scrollY / scale}px)` : "none";
    layer.append(frozen);
    host.append(layer);
    const cards = [...frozen.querySelectorAll(".choose-card, .assessment-card, .profile-card")];
    cards.forEach((card, index) => {
      const box = card.getBoundingClientRect();
      const motion = getCardFlight(kind, index, cards.length, {
        top: box.top / scale,
        bottom: box.bottom / scale,
      }, viewport, reverse);
      card.dataset.flight = kind;
      animations.push(card.animate(motion.keyframes, {
        ...motion.options, duration: motion.options.duration * speed, delay: motion.options.delay * speed,
      }));
    });
    const heading = frozen.querySelector(".choose-wordmark, .assessment-wordmark, .profile-wordmark");
    if (heading) {
      // Preserve the reference's optical x-alignment while the lettering changes.
      const base = getComputedStyle(heading).transform;
      const rest = base === "none" ? "translateY(0)" : base;
      const away = `${rest} translateY(${kind === "out" ? -36 : 36}px)`;
      animations.push(heading.animate(kind === "out"
        ? [{ opacity: 1, transform: rest }, { opacity: 0, transform: away }]
        : [{ opacity: 0, transform: away }, { opacity: 1, transform: rest }],
      { duration: 300 * speed, delay: (kind === "out" ? 120 : CARD_FLIGHT.overlap) * speed, easing: "ease", fill: "both" }));
    }
  }
  const finish = () => animations.forEach((animation) => animation.finish());
  window.addEventListener("resize", finish, { once: true });
  try {
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  } finally {
    window.removeEventListener("resize", finish);
    host.replaceChildren();
    host.classList.remove("is-running");
  }
}
