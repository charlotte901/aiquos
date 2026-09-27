/**
 * Live measurement of the real login composition.
 *
 * The flight's end state must be pixel-identical to the mounted login page,
 * so instead of hardcoding 706×480 (the DOM card is actually content-height,
 * ≈706×383) we unhide the always-mounted login panel for one synchronous
 * layout pass, read every block's rect + computed style, then re-hide it.
 * No frame is painted in between, and the numbers are true for whatever
 * viewport / media query is in effect.
 */

const px = (v) => parseFloat(v) || 0;

function relRect(el, origin) {
  const r = el.getBoundingClientRect();
  return {
    x: r.x - origin.x,
    y: r.y - origin.y,
    w: r.width,
    h: r.height,
    cx: r.x - origin.x + r.width / 2,
    cy: r.y - origin.y + r.height / 2,
  };
}

function textStyle(el, origin) {
  const cs = getComputedStyle(el);
  return {
    rect: relRect(el, origin),
    text: el.textContent.trim(),
    fontSize: px(cs.fontSize),
    fontWeight: cs.fontWeight,
    fontStyle: cs.fontStyle,
    color: cs.color,
    letterSpacing: px(cs.letterSpacing),
    fontFamily: cs.fontFamily,
  };
}

/**
 * @returns {object|null} scene metrics, or null when the login panel is
 * absent (then the overlay falls back to the legacy constants).
 */
export function measureLoginScene() {
  const panel = [...document.querySelectorAll(".experience-panel")]
    .find((p) => p.querySelector(".login-screen"));
  const card = panel?.querySelector(".login-composition");
  if (!panel || !card) return null;

  const wasHidden = panel.hidden;
  panel.hidden = false;
  // The composition carries a slam animation (scale 2.3 → 1) and a resting
  // -1.6° tilt; both would poison the rects (getBoundingClientRect includes
  // transforms). Neutralise them for the measurement pass: animation off,
  // transform off, so every rect reads in card-local space — the card centre
  // is unchanged by either (rotation is about the centre).
  card.style.animation = "none";
  card.style.transform = "none";
  const cardRect = card.getBoundingClientRect();
  const origin = { x: cardRect.x, y: cardRect.y };
  const width = card.offsetWidth;
  const height = card.offsetHeight;

  // Panels flow stacked in the document, so with the panel force-shown
  // during a home→login flight the card measures BELOW the home content.
  // When the panel is the active view it sits at the viewport origin, so
  // anchor the card's screen position to the panel's own origin.
  const panelRect = panel.getBoundingClientRect();
  const screen = {
    x: cardRect.x - panelRect.x,
    y: cardRect.y - panelRect.y,
  };

  const q = (sel) => panel.querySelector(sel);
  const qa = (sel) => [...panel.querySelectorAll(sel)];

  const stub = q(".login-stub");
  const stubRect = stub ? relRect(stub, origin) : null;
  // Side-by-side layout (≥760px): the stub is a right column. Below that it
  // becomes a bottom strip — the painter needs to know which one it drew.
  const stubHorizontal = stubRect ? stubRect.h < height * 0.6 : false;
  const splitX = stubRect && !stubHorizontal ? stubRect.x : width - 196;

  const fields = qa(".login-field").map((field) => ({
    rect: relRect(field, origin),
    placeholder: field.querySelector("input")?.placeholder ?? "",
    hasToggle: !!field.querySelector(".login-password-toggle"),
  }));

  const submit = q(".login-submit");
  const submitLabel = submit?.querySelector("span");
  const submitIcon = submit?.querySelector("svg");

  const data = {
    width,
    height,
    splitX,
    stubHorizontal,
    // Screen-space centre of the card when the panel is active (rotation
    // about the centre keeps it under the -1.6° tilt).
    center: { x: screen.x + cardRect.width / 2, y: screen.y + cardRect.height / 2 },
    formPanel: q(".login-form") ? relRect(q(".login-form"), origin) : null,
    kickerDot: q(".login-kicker-dot") ? relRect(q(".login-kicker-dot"), origin) : null,
    texts: {
      kicker: q(".login-kicker") ? textStyle(q(".login-kicker"), origin) : null,
      title: q(".login-title") ? textStyle(q(".login-title"), origin) : null,
      subtitle: q(".login-heading p") ? textStyle(q(".login-heading p"), origin) : null,
      submitLabel: submitLabel ? textStyle(submitLabel, origin) : null,
      note: q(".login-note") ? textStyle(q(".login-note"), origin) : null,
      brand: q(".login-stub-brand") ? textStyle(q(".login-stub-brand"), origin) : null,
      serial: q(".login-stub-no") ? textStyle(q(".login-stub-no"), origin) : null,
    },
    fields,
    submit: submit ? relRect(submit, origin) : null,
    submitIcon: submitIcon ? relRect(submitIcon, origin) : null,
    toggle: q(".login-password-toggle") ? relRect(q(".login-password-toggle"), origin) : null,
    stub: stubRect,
    stubChildren: stub
      ? {
          brand: q(".login-stub-brand") ? relRect(q(".login-stub-brand"), origin) : null,
          serial: q(".login-stub-no") ? relRect(q(".login-stub-no"), origin) : null,
          barcode: q(".login-stub-barcode") ? relRect(q(".login-stub-barcode"), origin) : null,
          stamp: q(".login-stub-stamp") ? relRect(q(".login-stub-stamp"), origin) : null,
        }
      : null,
    word: null,
  };

  const word = q(".login-word");
  if (word) {
    const cs = getComputedStyle(word);
    const r = word.getBoundingClientRect();
    data.word = {
      cx: r.x - origin.x + r.width / 2,
      cy: r.y - origin.y + r.height / 2,
      w: r.width,
      h: r.height,
      text: word.textContent.trim(),
      fontSize: px(cs.fontSize),
      fontWeight: cs.fontWeight,
      color: cs.color,
      letterSpacing: px(cs.letterSpacing),
      fontFamily: cs.fontFamily,
      blur: px(cs.filter) || cs.filter, // "blur(14px)" → 14, else raw string
    };
  }

  panel.hidden = wasHidden;
  card.style.animation = "";
  card.style.transform = "";
  return data;
}
