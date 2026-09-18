import test from "node:test";
import assert from "node:assert/strict";
import { pushPages, SLIDE_DURATION, SLIDE_EASING } from "../src/slide-transition.js";
import { STRIP_EASING } from "../src/split-transition.js";
import { DESIGN_WIDTH } from "../src/stage.js";

const HOME = ".home-stage";
const CASES = ".home-tab-screen";
const VIEWPORT = 1500;

/** Minimal stand-ins for the three things pushPages touches: the two travelling
 * layers, the app shell it marks with `data-pushing`, and the stage the travel
 * is measured against. Everything records itself, so the test can assert *order*
 * as well as values — the reverse-push bug was purely an ordering mistake.
 *
 * `stage` is a design-sized stage (1920 wide) rather than the 1500 window, and
 * the difference is the point: the layers being pushed live inside the scaled
 * stage, so the distance that clears the composition is the frame's width. A
 * window-derived travel would stop 420px short here and leave the departing page
 * still 28% on screen. */
function harness({ manual = false, stage = true } = {}) {
  const log = [];
  const frames = {};
  const pending = [];

  const makeLayer = (name) => ({
    name,
    style: {},
    getAnimations: () => [],
    animate(keyframes, options) {
      frames[name] = { from: keyframes[0].transform, to: keyframes[1].transform, options };
      log.push(`animate:${name}`);
      let settle;
      const finished = manual
        ? new Promise((resolve) => {
            settle = resolve;
            pending.push(resolve);
          })
        : Promise.resolve();
      return {
        effect: { getTiming: () => ({ duration: options.duration }), target: this },
        finished,
        pause() {},
        cancel() {},
        finish() {
          settle?.();
        },
      };
    },
  });
  const stageNode = stage
    ? { clientWidth: DESIGN_WIDTH, clientHeight: 1080, getBoundingClientRect: () => ({ width: DESIGN_WIDTH, height: 1080 }) }
    : null;

  const layers = { [HOME]: makeLayer("home"), [CASES]: makeLayer("cases") };
  const shell = {
    attributes: {},
    offsetHeight: 1000,
    setAttribute(key, value) {
      this.attributes[key] = value;
      log.push(`set:${key}=${value}`);
    },
    removeAttribute(key) {
      delete this.attributes[key];
      log.push(`remove:${key}`);
    },
    hasAttribute(key) {
      return key in this.attributes;
    },
  };

  const saved = {
    document: globalThis.document,
    innerWidth: globalThis.innerWidth,
    window: globalThis.window,
  };
  globalThis.innerWidth = VIEWPORT;
  globalThis.document = {
    querySelector: (selector) => (
      selector === ".app" ? shell
        : selector === ".design-stage" ? stageNode
          : layers[selector] ?? null
    ),
  };
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };

  return {
    log,
    frames,
    layers,
    shell,
    /** Let the travelling animations complete, the way a real 760ms move would. */
    release: () => pending.forEach((resolve) => resolve()),
    restore() {
      globalThis.document = saved.document;
      globalThis.innerWidth = saved.innerWidth;
      globalThis.window = saved.window;
    },
  };
}

test("a push lasts under a second and shares the strip pull's curve", () => {
  assert.equal(SLIDE_DURATION, 760);
  // The point of sharing the constant rather than copying its value: every
  // horizontal move in the site is meant to read as one gesture, so neither
  // side may retune on its own.
  assert.equal(SLIDE_EASING, STRIP_EASING);
  assert.equal(SLIDE_EASING, "cubic-bezier(.76,0,.24,1)");
});

test("forward: home leaves to the left and cases arrives from the right", async () => {
  const h = harness();
  try {
    await pushPages({ forward: true, enter: () => h.log.push("enter") });

    assert.deepEqual(h.frames.home, {
      from: "translateX(0px)",
      to: `translateX(${-DESIGN_WIDTH}px)`,
      options: { duration: SLIDE_DURATION, easing: SLIDE_EASING, fill: "both" },
    });
    assert.deepEqual(h.frames.cases, {
      from: `translateX(${DESIGN_WIDTH}px)`,
      to: "translateX(0px)",
      options: { duration: SLIDE_DURATION, easing: SLIDE_EASING, fill: "both" },
    });

    // The arriving page must exist before it can be animated, so the view change
    // has to land between the two animations, not after them.
    assert.ok(h.log.indexOf("enter") > h.log.indexOf("animate:home"));
    assert.ok(h.log.indexOf("enter") < h.log.indexOf("animate:cases"));
    // The travel is the frame's width, not the window's — the layers travel
    // inside the scaled stage, so a window-derived distance leaves the departing
    // page partly on screen when the push has finished.
    assert.notEqual(DESIGN_WIDTH, VIEWPORT);
  } finally {
    h.restore();
  }
});

test("reverse: the same two moves, mirrored", async () => {
  const h = harness();
  try {
    await pushPages({ forward: false, enter: () => {} });

    assert.deepEqual(h.frames.cases, {
      from: "translateX(0px)",
      to: `translateX(${DESIGN_WIDTH}px)`,
      options: { duration: SLIDE_DURATION, easing: SLIDE_EASING, fill: "both" },
    });
    assert.deepEqual(h.frames.home, {
      from: `translateX(${-DESIGN_WIDTH}px)`,
      to: "translateX(0px)",
      options: { duration: SLIDE_DURATION, easing: SLIDE_EASING, fill: "both" },
    });

    // The two pages tile the frame at every step: the arriving layer offset
    // is the exact negative of the departing one's travel, which is what makes
    // the seam invisible on a shared ground.
    assert.equal(
      h.frames.home.from,
      `translateX(${-DESIGN_WIDTH}px)`,
      "coming home, the homepage starts exactly one frame-width to the left",
    );
  } finally {
    h.restore();
  }
});

test("with no stage mounted the travel falls back to the design width", async () => {
  // Transitions can be asked to run before the stage has laid out (and in tests,
  // which have no DOM). The fallback must be the design size rather than 0, or a
  // push would animate a zero-distance travel and read as an instant cut.
  const h = harness({ stage: false });
  try {
    await pushPages({ forward: true, enter: () => {} });
    assert.equal(h.frames.home.to, `translateX(${-DESIGN_WIDTH}px)`);
  } finally {
    h.restore();
  }
});

test("reverse: the tab flip waits for the travel to finish", async () => {
  // The regression the browser gate caught: flipping the tab while the archive
  // is still on screen re-styles the page that is travelling out (forty of its
  // rules are scoped to its own tab), and unmounting it deletes the departing
  // half of the sheet — the reverse push then arrived onto a bare ground.
  //
  // So the invariant is not "the view change comes last in the source"; it is
  // "the view change does not happen until the pages have arrived". The stub
  // below therefore holds the travel open and checks that nothing has committed
  // while it is still running.
  const h = harness({ manual: true });
  try {
    const move = pushPages({
      forward: false,
      enter: () => h.log.push("enter"),
      commit: () => {
        assert.equal(
          h.shell.hasAttribute("data-pushing"),
          true,
          "commit must run while data-pushing is still armed",
        );
        h.log.push("commit");
      },
    });

    await Promise.resolve();
    assert.equal(h.log.includes("enter"), true, "the URL update happens up front");
    assert.equal(
      h.log.includes("commit"),
      false,
      "the view must NOT change while the departing page is still on screen",
    );
    assert.equal(
      h.shell.attributes["data-pushing"],
      "back",
      "the departing page keeps its own tab, only the direction is announced",
    );

    h.release();
    await move;

    assert.deepEqual(
      h.log.filter((entry) => entry.startsWith("set:") || entry.startsWith("remove:")),
      ["set:data-pushing=back", "remove:data-pushing"],
    );
    assert.equal(
      h.log.indexOf("commit") < h.log.indexOf("remove:data-pushing"),
      true,
      "commit lands before the marker is cleared, or the chrome flashes",
    );
  } finally {
    h.restore();
  }
});

test("the push is reported as forward or back, never as a bare marker", async () => {
  for (const [forward, marker] of [[true, "forward"], [false, "back"]]) {
    const h = harness();
    try {
      await pushPages({ forward, enter: () => {} });
      assert.equal(h.log[0], `set:data-pushing=${marker}`);
    } finally {
      h.restore();
    }
  }
});

test("both layers and the marker are released when the move ends", async () => {
  const h = harness();
  try {
    await pushPages({ forward: true, enter: () => {} });
    for (const selector of [HOME, CASES]) {
      assert.equal(h.layers[selector].style.willChange, "", `${selector} keeps no willChange`);
    }
    assert.equal(h.shell.hasAttribute("data-pushing"), false, "the marker never outlives the move");
  } finally {
    h.restore();
  }
});
