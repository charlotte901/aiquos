
        // ── constants ─────────────────────────────────────────────────────────

        const TICKS = 57;
        const FPS = 30;
        const PAPER = "#fff4fa";
        const INK = "#1b1b1b";
        const BODY_TINT = 0.45;
        const ARRIVAL_STEP = 3;
        const FONT_FRAC = 0.122;
        const BASELINE_FRAC = 0.541;
        const GAP_EM = 0.17;
        const FONT_WEIGHT = 600;
        const ARRIVE_SCALE_FIRST = 2.0;
        const ARRIVE_SCALE_REST = 1.35;
        const SCALE_RETAIN = 0.7;
        const THUMP_EXCESS = 0.09;
        const SLIDE_EM = 1.0;
        const BLUR_MOST = [3, 1.6, 0.7, 0];
        const BLUR_LAST = [9, 7, 5, 3.2, 1.8, 0.8, 0];
        const RECENTER = [
            0.91, 0.69, 0.36, 0.16, 0.052, -0.011, -0.052, -0.080, -0.092, -0.098,
            -0.103, -0.098, -0.092, -0.086, -0.075, -0.063, -0.052, -0.040, -0.029,
            -0.017, -0.011, -0.006, 0
        ];
        const GLIDE_RATE = 1.35;
        const TINT_TICK = 18;
        const TINT_LEN = 6;
        const SHAKE_TICK = 24;
        const SHAKE_END = 37;
        const SHAKE_ROT = 13;
        const SHAKE_DY = 6;
        const SHAKE_DX = 2.5;
        const SHAKE_OMEGA = 1.15;
        const LETTER_DRIFT = [
            [-1.5, 4, -9],
            [-0.5, 1.5, 6],
            [0.5, 4.5, -5],
            [2, 2.5, 11]
        ];
        const INHALE_TICKS = 3;
        const INHALE_LIFT = 4.5;
        const INHALE_SCALE = 0.055;
        const BURST_TICK = 38;
        const REF_BURST = 44;
        const STROKE_OFFSET = REF_BURST - BURST_TICK;
        const SEG_BANDS = 8;
        const SEG_MAX_PER_LETTER = 16;
        const SEG_MIN_RUN_EM = 0.05;
        const MORPH_LEN = 2.8;
        const MORPH_STAGGER = 0.9;
        const DART_SPIKE_MIN = 0.15;
        const DART_BELLY = 0.7;
        const DART_WOBBLE = 0.12;
        const FINALE_SPIKE = 0.8;
        const SEG_EXIT = 2;
        const SEG_GAP_MUL = 1.4;
        const SLOT_PROG_JIT = 0.06;
        const TRAIL_DT = 0.8;
        const TRAIL_ALPHA = 0.12;
        const RING_TICKS = 3;
        const RING_R0 = 14;
        const RING_V = 42;
        const RING_ALPHA = 0.35;
        const RING_WIDTH = 2.2;
        const ZOOM_MAX = 0.35;
        const ZOOM_EXP = 1.8;
        const THROW_PX = 17;
        const THROW_EXP = 2.5;
        const THROW_BALLISTIC = 1.9;
        const THROW_BALLISTIC_AT = BURST_TICK + 7;
        const WORD_FADE_START = BURST_TICK + 6.5;
        const WORD_FADE_END = BURST_TICK + 8;
        const STREAK_LEN = 90;
        const STREAK_ALPHA = 0.35;
        const STREAK_WIDTH = 1.6;
        const FLECK_COUNT = 14;
        const FLECK_SPD_MIN = 2.5;
        const FLECK_SPD_MAX = 5.5;
        const FLECK_R_MIN = 1.4;
        const FLECK_R_MAX = 3.2;
        const FLECK_DELAY_MAX = 1.5;
        const FLECK_FADE_START = BURST_TICK + 3;
        const FLECK_FADE_LEN = 3;
        const KICK_BASE = [
            [2.2, -1.4],
            [-1.5, 0.9]
        ];
        const KICK_JIT = 1.2;
        const KICK_ZOOM = 1.012;
        const STILL_TICK = BURST_TICK + 3;
        const REF_W = 700;
        const REF_H = 392;
        const ORIGIN_X = 358;
        const ORIGIN_Y = 205;
        const SEED = 0x10cd;

        // ── sentences ────────────────────────────────────────────────────────

        const SENTENCES = [
  {
    words: ["representative", "AI", "use-cases"],
    burst: 1,
    theme: {
      inks: ["#ff665e", "#ff6c2f", "#0078bf", "#765ba7"],
      body: "#0078bf",
      burst: "#ff665e",
    },
  },
  {
    words: ["typical", "AI", "applications"],
    burst: 1,
    theme: {
      inks: ["#ff48b0", "#ff6c2f", "#00a95c", "#00838a"],
      body: "#00838a",
      burst: "#ff48b0",
    },
  },
  {
    words: ["successful", "AI", "deployments"],
    burst: 1,
    theme: {
      inks: ["#0078bf", "#00838a", "#765ba7", "#3255a4"],
      body: "#3255a4",
      burst: "#765ba7",
    },
  },
  {
    words: ["AI", "application", "scenarios"],
    burst: 0,
    theme: {
      inks: ["#914e72", "#ff665e", "#ffb511", "#ff6c2f"],
      body: "#914e72",
      burst: "#ffb511",
    },
  },
];

        // ── stroke groups ──────────────────────────────────────────────────

        const GROUPS = [{
            count: 6,
            gap: 6.5,
            sat: 0.78,
            lit: 0.72,
            keys: [
                { t: 40, x: 424, y: 174, len: 20, wid: 1.8, ang: -9, hue: 294 },
                { t: 42, x: 438, y: 172, len: 27, wid: 2.7, ang: -9, hue: 284 },
                { t: 44, x: 460, y: 166, len: 43, wid: 4.0, ang: -10, hue: 266 },
                { t: 46, x: 510, y: 148, len: 81, wid: 6.5, ang: -12, hue: 246 },
                { t: 47, x: 554, y: 147, len: 128, wid: 8.5, ang: -11, hue: 238 },
                { t: 48, x: 626, y: 124, len: 190, wid: 11, ang: -12, hue: 230 },
                { t: 49, x: 726, y: 100, len: 220, wid: 13, ang: -12, hue: 226 },
            ],
        }, {
            count: 6,
            gap: 7,
            sat: 0.55,
            lit: 0.7,
            keys: [
                { t: 40, x: 326, y: 219, len: 33, wid: 2.4, ang: -12, hue: 14 },
                { t: 42, x: 318, y: 223, len: 32, wid: 3.0, ang: -12, hue: 18 },
                { t: 44, x: 296, y: 227, len: 57, wid: 5.0, ang: -12, hue: 22 },
                { t: 46, x: 277, y: 235, len: 86, wid: 9.0, ang: -13, hue: 26 },
                { t: 48, x: 236, y: 277, len: 169, wid: 16, ang: -23, hue: 27 },
                { t: 50, x: 186, y: 299, len: 190, wid: 20, ang: -27, hue: 31 },
                { t: 51, x: 140, y: 312, len: 210, wid: 22, ang: -24, hue: 33,
                fade: 0.4 },
            ],
        }, {
            count: 2,
            gap: 8,
            sat: 0.42,
            lit: 0.66,
            keys: [
                { t: 40, x: 400, y: 188, len: 27, wid: 1.5, ang: 0, hue: 320 },
                { t: 44, x: 420, y: 218, len: 19, wid: 2.5, ang: -2, hue: 318 },
                { t: 47, x: 415, y: 225, len: 30, wid: 4.8, ang: 1, hue: 313 },
                { t: 49, x: 423, y: 257, len: 80, wid: 9, ang: 7, hue: 313 },
                { t: 51, x: 402, y: 300, len: 78, wid: 16, ang: -6, hue: 318 },
                { t: 52, x: 412, y: 290, len: 60, wid: 19, ang: -6, hue: 308,
                fade: 0 },
            ],
        }, {
            count: 7,
            gap: 6.5,
            sat: 0.55,
            lit: 0.68,
            keys: [
                { t: 46, x: 485, y: 181, len: 50, wid: 3.5, ang: -6, hue: 262 },
                { t: 47, x: 472, y: 201, len: 74, wid: 5.0, ang: -3, hue: 273 },
                { t: 48, x: 477, y: 211, len: 68, wid: 6.0, ang: -5, hue: 268 },
                { t: 49, x: 478, y: 231, len: 90, wid: 9.0, ang: -2, hue: 272 },
                { t: 50, x: 536, y: 280, len: 148, wid: 18, ang: 14, hue: 262 },
                { t: 51, x: 626, y: 368, len: 146, wid: 24, ang: 18, hue: 261 },
            ],
        }, {
            count: 4,
            gap: 9,
            sat: 0.58,
            lit: 0.7,
            keys: [
                { t: 47, x: 180, y: 260, len: 90, wid: 6, ang: -16, hue: 45 },
                { t: 49, x: 133, y: 277, len: 186, wid: 9, ang: -17, hue: 54 },
                { t: 50, x: 88, y: 303, len: 247, wid: 14, ang: -21, hue: 55 },
                { t: 51, x: 40, y: 290, len: 220, wid: 16, ang: -14, hue: 58,
                fade: 0.4 },
            ],
        }, {
            count: 1,
            gap: 0,
            sat: 0.62,
            lit: 0.7,
            keys: [
                { t: 51, x: 250, y: 290, len: 200, wid: 26, ang: -17, hue: 22 },
                { t: 52, x: 204, y: 304, len: 294, wid: 37, ang: -17, hue: 23 },
                { t: 53, x: 135, y: 331, len: 339, wid: 58, ang: -18, hue: 29 },
                { t: 53.8, x: -80, y: 400, len: 340, wid: 60, ang: -18, hue: 32 },
            ],
        }, {
            count: 1,
            gap: 0,
            sat: 0.58,
            lit: 0.7,
            keys: [
                { t: 52, x: 57, y: 214, len: 169, wid: 20, ang: -3, hue: 65 },
                { t: 53, x: 0, y: 180, len: 296, wid: 28, ang: -2, hue: 68 },
                { t: 53.6, x: -200, y: 165, len: 296, wid: 28, ang: -2, hue: 70 },
            ],
        }, {
            count: 1,
            gap: 0,
            sat: 0.5,
            lit: 0.68,
            keys: [
                { t: 51, x: 150, y: 140, len: 120, wid: 12, ang: 6, hue: 80 },
                { t: 52, x: 117, y: 106, len: 260, wid: 20, ang: 8, hue: 80 },
                { t: 54, x: 95, y: 53, len: 223, wid: 45, ang: 6, hue: 81 },
                { t: 54.7, x: 80, y: -120, len: 200, wid: 50, ang: 6, hue: 82 },
            ],
        }, {
            count: 1,
            gap: 0,
            sat: 0.45,
            lit: 0.66,
            keys: [
                { t: 52, x: 438, y: 81, len: 43, wid: 16, ang: 4, hue: 200 },
                { t: 53, x: 459, y: 118, len: 28, wid: 18, ang: -6, hue: 219 },
                { t: 54, x: 520, y: 100, len: 30, wid: 18, ang: -6, hue: 224,
                fade: 0 },
            ],
        }, {
            count: 1,
            gap: 0,
            sat: 0.85,
            lit: 0.7,
            keys: [
                { t: 53, x: 480, y: 170, len: 180, wid: 40, ang: 2, hue: 228 },
                { t: 54, x: 576, y: 160, len: 277, wid: 58, ang: 1, hue: 224 },
                { t: 54.7, x: 880, y: 150, len: 280, wid: 60, ang: 1, hue: 222 },
            ],
        }, {
            count: 1,
            gap: 0,
            sat: 0.5,
            lit: 0.67,
            keys: [
                { t: 53, x: 442, y: 248, len: 155, wid: 30, ang: -4, hue: 279 },
                { t: 54, x: 580, y: 430, len: 170, wid: 34, ang: 12, hue: 275 },
                { t: 54.6, x: 700, y: 540, len: 170, wid: 34, ang: 14, hue: 273 },
            ],
        }, ];

        // ── helpers ────────────────────────────────────────────────────────

        const clamp01 = (v) => Math.min(1, Math.max(0, v));
        const lerp = (a, b, u) => a + (b - a) * u;
        const rad = (d) => d * Math.PI / 180;

        const hexRgb = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return [r, g, b];
        };
        const rgbStr = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
        const mixArr = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
        const mixRgb = (a, b, u) => rgbStr(mixArr(a, b, u));

        const hueOf = ([r, g, b]) => {
            const mx = Math.max(r, g, b);
            const mn = Math.min(r, g, b);
            const d = mx - mn;
            if (d === 0) return 0;
            let h;
            if (mx === r) h = ((g - b) / d) % 6;
            else if (mx === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            return ((h * 60) % 360 + 360) % 360;
        };
        const circDist = (a, b) => {
            const d = Math.abs(((a % 360) + 360) % 360 - ((b % 360) + 360) % 360);
            return Math.min(d, 360 - d);
        };

        const mulberry32 = (seed) => {
            let a = seed >>> 0;
            return () => {
                a |= 0;
                a = (a + 0x6d2b79f5) | 0;
                let t = Math.imul(a ^ (a >>> 15), 1 | a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        };

        function groupAt(g, t) {
            const ks = g.keys;
            if (t < ks[0].t || t > ks[ks.length - 1].t) return null;
            let i = 0;
            while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
            const a = ks[i];
            const b = ks[Math.min(i + 1, ks.length - 1)];
            const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
            const L = (p, q) => p + (q - p) * u;
            return {
                x: L(a.x, b.x),
                y: L(a.y, b.y),
                len: L(a.len, b.len),
                wid: L(a.wid, b.wid),
                ang: L(a.ang, b.ang),
                hue: L(a.hue, b.hue),
                alpha: L(a.fade ?? 1, b.fade ?? 1),
            };
        }

        // ── engine ──────────────────────────────────────────────────────────

        class LoudBurst {
            constructor(canvas, fontFamily) {
                this.canvas = canvas;
                this.ctx = canvas.getContext('2d');
                this.ok = !!this.ctx;
                this.font = fontFamily ?? 'Inter, system-ui, sans-serif';
                this.running = false;
                this.lastTick = -1;
                this.t0 = 0;
                this.raf = 0;
                this.dpr = 1;
                this.scratch = [];
                this.wordSprites = [];
                this.segs = [];
                this.segCount = [];
                this.segsReady = false;
                this.si = 0;
                this.flecks = [];
                this.dashJitter = [];
                this.segJitter = [];
                this.kick = KICK_BASE.map((v) => [...v]);
                this.fontPx = 0;
                this.refS = 1;

                if (this.ok) {
                    this.resize();
                    this.applySentence(0);
                }
            }

            resize() {
                const c = this.canvas;
                const r = c.getBoundingClientRect();
                this.dpr = Math.min(window.devicePixelRatio || 1, 2);
                c.width = Math.max(1, Math.round(r.width * this.dpr));
                c.height = Math.max(1, Math.round(r.height * this.dpr));
                this.buildLayout();
                this.lastTick = -1;
                if (!this.running && this.words) this.renderStill();
            }

            buildLayout() {
                const H = this.canvas.height;
                this.refS = H / REF_H;
                this.fontPx = FONT_FRAC * H;
                this.baseline = BASELINE_FRAC * H;
                this.gap = GAP_EM * this.fontPx;
                if (this.words) this.layoutSentence();
            }

            applySentence(i) {
                this.si = i;
                this.sentence = SENTENCES[i];
                this.words = this.sentence.words;
                this.burstIdx = this.sentence.burst;
                this.arrivals = this.words.map((_, k) => k * ARRIVAL_STEP);

                const th = this.sentence.theme;
                const inkRgbs = th.inks.map(hexRgb);
                const inkHues = inkRgbs.map(hueOf);
                this.burstRgb = hexRgb(th.burst);
                this.bodyRgb = mixArr(hexRgb(INK), hexRgb(th.body), BODY_TINT);
                this.bodyCss = rgbStr(this.bodyRgb);

                const nearest = (h, excl = -1) => {
                    let best = excl === 0 ? 1 : 0;
                    for (let k = 0; k < inkHues.length; k++) {
                        if (k === excl) continue;
                        if (circDist(h, inkHues[k]) < circDist(h, inkHues[best])) best = k;
                    }
                    return best;
                };
                this.journeys = GROUPS.map((g) => {
                    const h0 = g.keys[0].hue;
                    const h1 = g.keys[g.keys.length - 1].hue;
                    const a = nearest(h0);
                    let b = nearest(h1);
                    if (b === a && circDist(h0, h1) > 25) b = nearest(h1, a);
                    return [inkRgbs[a], inkRgbs[b]];
                });

                const rnd = mulberry32((SEED ^ Math.imul(i, 0x9e3779b9)) >>> 0);
                this.dashJitter = GROUPS.map((g) =>
                    Array.from({ length: g.count }, () => ({
                        along: (rnd() - 0.5) * 24,
                        lenMul: 0.75 + rnd() * 0.3,
                        angJit: (rnd() - 0.5) * 6,
                        bend: (rnd() - 0.5) * 0.24,
                    }))
                );
                const SEG_POOL = 96;
                this.segJitter = Array.from({ length: SEG_POOL }, () => ({
                    along: (rnd() - 0.5) * 20,
                    lenMul: 0.75 + rnd() * 0.3,
                    angJit: (rnd() - 0.5) * 6,
                    bend: (rnd() - 0.5) * 0.24,
                    delay: rnd(),
                    sk: 1.1 + rnd() * 0.8,
                }));
                this.flecks = Array.from({ length: FLECK_COUNT }, () => ({
                    ang: rnd() * Math.PI * 2,
                    spd: FLECK_SPD_MIN + rnd() * (FLECK_SPD_MAX - FLECK_SPD_MIN),
                    r: FLECK_R_MIN + rnd() * (FLECK_R_MAX - FLECK_R_MIN),
                    color: th.inks[Math.floor(rnd() * th.inks.length)],
                    delay: rnd() * FLECK_DELAY_MAX,
                }));
                this.kick = KICK_BASE.map(([kx, ky]) => [
                    kx + (rnd() - 0.5) * KICK_JIT,
                    ky + (rnd() - 0.5) * KICK_JIT,
                ]);

                if (this.fontPx > 0) this.layoutSentence();
                this.segsReady = false;
                this.segs = [];
            }

            arriveScale(i) { return i === 0 ? ARRIVE_SCALE_FIRST : ARRIVE_SCALE_REST; }

            layoutSentence() {
                const ctx = this.ctx;
                if (!ctx) return;
                const W = this.canvas.width;

                ctx.font = `${FONT_WEIGHT} ${this.fontPx}px ${this.font}`;
                this.wordW = this.words.map((w) => ctx.measureText(w).width);
                const lineW = this.wordW.reduce((a, b) => a + b, 0) + this.gap * (this.words.length - 1);
                let x = (W - lineW) / 2;
                this.slotX = this.wordW.map((w) => { const sx = x;
                    x += w + this.gap; return sx; });

                this.originX = this.slotX[this.burstIdx] + this.wordW[this.burstIdx] / 2;
                this.originY = this.baseline - 0.35 * this.fontPx;

                const word = this.words[this.burstIdx];
                this.letterX = [];
                this.letterW = [];
                let lx = 0;
                for (const ch of word) {
                    const w = ctx.measureText(ch).width;
                    this.letterX.push(lx);
                    this.letterW.push(w);
                    lx += w;
                }

                this.shift = [];
                const s0 = (W - this.wordW[0]) / 2 - this.slotX[0];
                for (let t = 0; t < TICKS; t++) {
                    if (t < this.arrivals[1]) {
                        this.shift.push(s0);
                        continue;
                    }
                    const idx = Math.round((t - this.arrivals[1]) * GLIDE_RATE);
                    this.shift.push(s0 * (idx < RECENTER.length ? RECENTER[idx] : 0));
                }

                this.landAge = this.words.map((_, i) => {
                    const settle = Math.ceil(
                        Math.log(THUMP_EXCESS / (this.arriveScale(i) - 1)) /
                        Math.log(SCALE_RETAIN)
                    );
                    return i === this.words.length - 1 ?
                        Math.max(settle, BLUR_LAST.length - 1) :
                        settle;
                });

                this.wordSprites = this.words.map((w) => {
                    const pad = Math.ceil(this.fontPx * 0.35);
                    const wpx = Math.ceil(ctx.measureText(w).width);
                    const sp = document.createElement('canvas');
                    sp.width = (wpx + pad * 2) * 2;
                    sp.height = Math.ceil(this.fontPx * 1.6) * 2;
                    const sc = sp.getContext('2d');
                    if (!sc) return null;
                    sc.scale(2, 2);
                    sc.font = `${FONT_WEIGHT} ${this.fontPx}px ${this.font}`;
                    sc.fillStyle = this.bodyCss;
                    sc.textBaseline = 'alphabetic';
                    sc.fillText(w, pad, this.fontPx * 1.1);
                    return sp;
                });
                this.segs = [];
                this.segCount = [];
                this.segsReady = false;
            }

            shakeAmp(t) {
                if (t < SHAKE_TICK) return 0;
                return clamp01((t - SHAKE_TICK) / (SHAKE_END - SHAKE_TICK)) ** 2;
            }

            tintProgress(t) {
                if (t < TINT_TICK) return 0;
                const u = clamp01((t - TINT_TICK) / TINT_LEN);
                return 1 - (1 - u) * (1 - u);
            }

            wordFill(t) {
                const p = this.tintProgress(t);
                if (p <= 0) return this.bodyCss;
                return mixRgb(this.bodyRgb, this.burstRgb, p);
            }

            journeyAt(gi, u) {
                const [a, b] = this.journeys[gi];
                return mixArr(a, b, clamp01(u));
            }

            letterJitter(i, t) {
                const A = this.shakeAmp(t);
                if (A <= 0) return [0, 0, 0];
                const [ddx, ddy, drot] = LETTER_DRIFT[i % LETTER_DRIFT.length];
                const s = this.refS;
                const wob = Math.sin(t * SHAKE_OMEGA + i * 2.1);
                const wob2 = Math.sin(t * SHAKE_OMEGA * 0.63 + i * 2.1 * 1.7);
                return [
                    A * (ddx + wob2 * SHAKE_DX) * s,
                    A * (ddy + wob * SHAKE_DY) * s,
                    rad(A * (drot + wob * SHAKE_ROT * 0.45)),
                ];
            }

            scratchAt(idx, w, h) {
                let c = this.scratch[idx];
                if (!c) { c = document.createElement('canvas');
                    this.scratch[idx] = c; }
                c.width = w;
                c.height = h;
                return c;
            }

            blurDraw(sp, dx, dy, dw, dh, sigma) {
                const ctx = this.ctx;
                if (!ctx) return;
                if (sigma < 0.6) { ctx.drawImage(sp, dx, dy, dw, dh); return; }

                const k = sigma < 2 ? 1 : sigma < 5 ? 2 : 3;
                let src = sp;
                let sw = sp.width;
                let sh = sp.height;
                let si = 0;
                for (let i = 0; i < k; i++) {
                    const step = this.scratchAt(si++, Math.max(1, Math.round(sw / 2)), Math.max(1, Math.round(sh / 2)));
                    const sc2 = step.getContext('2d');
                    if (!sc2) break;
                    sc2.imageSmoothingEnabled = true;
                    sc2.drawImage(src, 0, 0, sw, sh, 0, 0, step.width, step.height);
                    src = step;
                    sw = step.width;
                    sh = step.height;
                }
                for (let i = 0; i < k - 1; i++) {
                    const step = this.scratchAt(si++, sw * 2, sh * 2);
                    const sc2 = step.getContext('2d');
                    if (!sc2) break;
                    sc2.imageSmoothingEnabled = true;
                    sc2.drawImage(src, 0, 0, sw, sh, 0, 0, step.width, step.height);
                    src = step;
                    sw = step.width;
                    sh = step.height;
                }
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(src, 0, 0, sw, sh, dx, dy, dw, dh);
            }

            drawDart(tailX, tailY, bendX, bendY, headX, headY, wMax, spike, skew, wobPhase, tailC, headC, alpha) {
                const ctx = this.ctx;
                if (!ctx || alpha <= 0.001) return;
                const span = Math.hypot(headX - tailX, headY - tailY);
                if (span < 1) return;
                wMax = Math.min(wMax, span * 0.32);
                const N = 12;
                const xs = [],
                    ys = [],
                    ws = [],
                    pxs = [],
                    pys = [];
                for (let i = 0; i <= N; i++) {
                    const u = i / N;
                    const v = 1 - u;
                    xs.push(v * v * tailX + 2 * v * u * bendX + u * u * headX);
                    ys.push(v * v * tailY + 2 * v * u * bendY + u * u * headY);
                    const tx = 2 * v * (bendX - tailX) + 2 * u * (headX - bendX);
                    const ty = 2 * v * (bendY - tailY) + 2 * u * (headY - bendY);
                    const n = Math.hypot(tx, ty) || 1;
                    pxs.push(-ty / n);
                    pys.push(tx / n);
                    const prof = Math.sin(Math.PI * u ** skew) ** DART_BELLY;
                    let w = wMax * lerp(1, prof, spike);
                    const wob = DART_WOBBLE * Math.min(1, span / (wMax * 5));
                    w *= 1 + wob * spike * Math.sin(u * 13 + wobPhase);
                    ws.push(Math.max(0, w));
                }
                const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
                grad.addColorStop(0, rgbStr(tailC));
                grad.addColorStop(1, rgbStr(headC));
                ctx.fillStyle = grad;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.moveTo(xs[0] + (pxs[0] * ws[0]) / 2, ys[0] + (pys[0] * ws[0]) / 2);
                for (let i = 1; i <= N; i++) {
                    ctx.lineTo(xs[i] + (pxs[i] * ws[i]) / 2, ys[i] + (pys[i] * ws[i]) / 2);
                }
                for (let i = N; i >= 0; i--) {
                    ctx.lineTo(xs[i] - (pxs[i] * ws[i]) / 2, ys[i] - (pys[i] * ws[i]) / 2);
                }
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            rasterBurstWord(fill, t, scratchIdx) {
                const pad = Math.ceil(this.fontPx * 0.5);
                const w = Math.ceil(this.letterX[this.letterX.length - 1] + this.letterW[this.letterW.length - 1]);
                const sp = this.scratchAt(scratchIdx, w + pad * 2, Math.ceil(this.fontPx * 1.9));
                const sc = sp.getContext('2d', { willReadFrequently: true });
                const base = this.fontPx * 1.15;
                if (!sc) return { sp: null, pad, base };
                sc.font = `${FONT_WEIGHT} ${this.fontPx}px ${this.font}`;
                sc.textBaseline = 'alphabetic';
                const word = this.words[this.burstIdx];
                for (let i = 0; i < word.length; i++) {
                    const [jx, jy, jr] = this.letterJitter(i, t);
                    const cx = pad + this.letterX[i] + this.letterW[i] / 2;
                    const cy = base - this.fontPx * 0.35;
                    sc.save();
                    sc.translate(cx + jx, cy + jy);
                    sc.rotate(jr);
                    sc.fillStyle = fill(i);
                    sc.fillText(word[i], -this.letterW[i] / 2, this.fontPx * 0.35);
                    sc.restore();
                }
                return { sp, pad, base };
            }

            captureSegs() {
                this.segsReady = true;
                this.segs = [];
                this.segCount = GROUPS.map(() => 0);
                const capT = BURST_TICK - 1;
                const { sp, pad, base } = this.rasterBurstWord(() => '#000', capT, 5);
                if (!sp) return;
                const sc = sp.getContext('2d', { willReadFrequently: true });
                if (!sc) return;
                let img;
                try { img = sc.getImageData(0, 0, sp.width, sp.height); } catch { return; }
                const alphaAt = (x, y) => img.data[(y * sp.width + x) * 4 + 3];

                let minY = sp.height,
                    maxY = 0;
                for (let y = 0; y < sp.height; y++) {
                    for (let x = 0; x < sp.width; x += 2) {
                        if (alphaAt(x, y) > 96) {
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                            break;
                        }
                    }
                }
                if (maxY <= minY) return;
                const bandH = Math.max(2, (maxY - minY + 1) / SEG_BANDS);
                const minRun = Math.max(2, this.fontPx * SEG_MIN_RUN_EM);
                const spriteX = this.slotX[this.burstIdx] + this.shift[capT] - pad;
                const spriteTop = this.baseline - base;
                const word = this.words[this.burstIdx];

                const perLetter = word.split('').map(() => []);
                for (let b = 0; b < SEG_BANDS; b++) {
                    const y = Math.min(sp.height - 1, Math.round(minY + (b + 0.5) * bandH));
                    let runStart = -1,
                        gapRun = 0;
                    const flush = (endX) => {
                        if (runStart < 0) return;
                        const len = endX - runStart;
                        if (len >= minRun) {
                            const rcx = runStart + len / 2;
                            let li = 0;
                            while (li < word.length - 1 && rcx - pad > this.letterX[li] + this.letterW[li]) li++;
                            perLetter[li].push({
                                bx: spriteX + rcx,
                                by: spriteTop + y,
                                blen: len,
                                bwid: bandH * 0.92,
                                letter: li,
                                gi: 0,
                                slot: 0,
                                ji: 0,
                            });
                        }
                        runStart = -1;
                        gapRun = 0;
                    };
                    for (let x = 0; x < sp.width; x++) {
                        if (alphaAt(x, y) > 96) {
                            if (runStart < 0) runStart = x;
                            gapRun = 0;
                        } else if (runStart >= 0 && ++gapRun > 3) {
                            flush(x - gapRun + 1);
                        }
                    }
                    flush(sp.width);
                }

                for (let i = 0; i < perLetter.length; i++) {
                    const list = perLetter[i];
                    if (list.length > SEG_MAX_PER_LETTER) {
                        const step = list.length / SEG_MAX_PER_LETTER;
                        perLetter[i] = Array.from({ length: SEG_MAX_PER_LETTER }, (_, k) => list[Math.floor(k * step)]);
                    }
                }
                const segs = perLetter.flat();
                if (!segs.length) return;

                const burstGroups = GROUPS.map((g, gi) => ({ g, gi })).filter(({ g }) => g.count > 1);
                const dirs = burstGroups.map(({ g }) => {
                    const k = g.keys[0];
                    const dx = k.x - ORIGIN_X;
                    const dy = k.y - ORIGIN_Y;
                    const n = Math.hypot(dx, dy) || 1;
                    return [dx / n, dy / n];
                });
                const cap = Math.ceil(segs.length / burstGroups.length) + 1;
                const counts = burstGroups.map(() => 0);
                for (const seg of segs) {
                    const ox = (seg.bx - this.originX) / this.refS;
                    const oy = (seg.by - this.originY) / this.refS;
                    const n = Math.hypot(ox, oy) || 1;
                    let best = 0,
                        bestScore = -Infinity;
                    for (let k = 0; k < burstGroups.length; k++) {
                        if (counts[k] >= cap) continue;
                        const score = (ox / n) * dirs[k][0] + (oy / n) * dirs[k][1];
                        if (score > bestScore) { bestScore = score;
                            best = k; }
                    }
                    counts[best]++;
                    seg.gi = burstGroups[best].gi;
                }

                for (let k = 0; k < burstGroups.length; k++) {
                    const { g, gi } = burstGroups[k];
                    const ang = rad(g.keys[0].ang);
                    const px = -Math.sin(ang),
                        py = Math.cos(ang);
                    const members = segs.filter((sg) => sg.gi === gi).sort((a, b) => (a.bx * px + a.by * py) - (b.bx * px +
                        b.by * py));
                    members.forEach((sg, idx) => { sg.slot = idx; });
                    this.segCount[gi] = members.length;
                }
                segs.forEach((sg, idx) => { sg.ji = idx % 96; });
                this.segs = segs;
            }

            segStateAt(seg, tR) {
                const g = GROUPS[seg.gi];
                const keys = g.keys;
                const tEnd = keys[keys.length - 1].t;
                const over = tR - tEnd;
                if (over > SEG_EXIT) return null;
                const st = groupAt(g, Math.min(Math.max(tR, keys[0].t), tEnd));
                if (!st) return null;
                let exitMul = 1;
                if (over > 0) {
                    const ka = keys[keys.length - 2];
                    const kb = keys[keys.length - 1];
                    const dt = kb.t - ka.t || 1;
                    st.x += ((kb.x - ka.x) / dt) * over;
                    st.y += ((kb.y - ka.y) / dt) * over;
                    exitMul = (1 - over / SEG_EXIT) ** 2;
                }
                const j = this.segJitter[seg.ji];
                const t0 = Math.max(REF_BURST, keys[0].t);
                const uRaw = clamp01((tR - t0 - j.delay * MORPH_STAGGER) / MORPH_LEN);
                const e = uRaw * uRaw * (3 - 2 * uRaw);

                const s = this.refS;
                const cxOff = this.originX - ORIGIN_X * s;
                const cyOff = this.originY - ORIGIN_Y * s;

                const n = this.segCount[seg.gi] || 1;
                const pxp = -Math.sin(rad(st.ang));
                const pyp = Math.cos(rad(st.ang));
                const spreadMul = Math.sqrt(Math.max(1, st.len / keys[0].len));
                const gapPx = g.gap * (g.count / n) * SEG_GAP_MUL;
                const off = (seg.slot - (n - 1) / 2) * gapPx * spreadMul;
                const tx = (st.x + pxp * off + Math.cos(rad(st.ang)) * j.along) * s + cxOff;
                const ty = (st.y + pyp * off + Math.sin(rad(st.ang)) * j.along) * s + cyOff;
                const tlen = st.len * j.lenMul * s;
                const twid = st.wid * s * (0.5 + 0.2 * j.lenMul);

                const x = lerp(seg.bx, tx, e);
                const y = lerp(seg.by, ty, e);
                const len = Math.max(1, lerp(seg.blen, tlen, e));
                const wid = Math.max(1, lerp(seg.bwid, twid, e));
                const ang = lerp(0, st.ang + j.angJit, e);
                const alpha = st.alpha * exitMul;
                if (alpha <= 0) return null;

                const dirx = Math.cos(rad(ang));
                const diry = Math.sin(rad(ang));
                const half = len / 2;
                const bendAmt = j.bend * half * e;

                const life = tEnd - keys[0].t || 1;
                const prog = clamp01((tR - keys[0].t) / life) + ((seg.slot % 3) - 1) * SLOT_PROG_JIT;
                const headC = mixArr(this.burstRgb, this.journeyAt(seg.gi, prog), e);
                const tailC = mixArr(this.burstRgb, this.journeyAt(seg.gi, prog - 0.18), e);

                return {
                    tailX: x - dirx * half,
                    tailY: y - diry * half,
                    bendX: x + -diry * bendAmt,
                    bendY: y + dirx * bendAmt,
                    headX: x + dirx * half,
                    headY: y + diry * half,
                    w: wid,
                    tailC,
                    headC,
                    alpha,
                    e,
                };
            }

            render(t) {
                const ctx = this.ctx;
                if (!ctx) return;
                const W = this.canvas.width;
                const H = this.canvas.height;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = PAPER;
                ctx.fillRect(0, 0, W, H);

                if (t === BURST_TICK || t === BURST_TICK + 1) {
                    const [kx, ky] = this.kick[t - BURST_TICK];
                    ctx.translate(kx * this.refS, ky * this.refS);
                    ctx.translate(this.originX, this.originY);
                    ctx.scale(KICK_ZOOM, KICK_ZOOM);
                    ctx.translate(-this.originX, -this.originY);
                }
                ctx.font = `${FONT_WEIGHT} ${this.fontPx}px ${this.font}`;
                ctx.textBaseline = 'alphabetic';

                if (t < BURST_TICK) this.renderLine(t);
                else this.renderBurstWords(t);
                this.renderRing(t);
                this.renderFlecks(t);
                this.renderStrokes(t);
            }

            renderLine(t) {
                const ctx = this.ctx;
                if (!ctx) return;
                const s = this.refS;
                const shift = this.shift[t] || 0;
                for (let i = 0; i < this.words.length; i++) {
                    if (this.arrivals[i] > t) continue;
                    const age = t - this.arrivals[i];

                    if (i === this.burstIdx && t >= TINT_TICK) {
                        const fill = this.wordFill(t);
                        const wordCx = this.slotX[i] + shift + this.wordW[i] / 2;
                        const wordCy = this.baseline - this.fontPx * 0.35;
                        const wI = t >= BURST_TICK - INHALE_TICKS ?
                            (t - (BURST_TICK - INHALE_TICKS) + 1) / INHALE_TICKS :
                            0;
                        ctx.save();
                        if (wI > 0) {
                            const k = 1 + INHALE_SCALE * wI;
                            ctx.translate(wordCx, wordCy - INHALE_LIFT * wI * s);
                            ctx.scale(k, k);
                            ctx.translate(-wordCx, -wordCy);
                        }
                        for (let li = 0; li < this.words[i].length; li++) {
                            const [jx, jy, jr] = this.letterJitter(li, t);
                            const cx = this.slotX[i] + shift + this.letterX[li] + this.letterW[li] / 2;
                            const cy = this.baseline - this.fontPx * 0.35;
                            ctx.save();
                            ctx.translate(cx + jx, cy + jy);
                            ctx.rotate(jr);
                            ctx.fillStyle = fill;
                            ctx.fillText(this.words[i][li], -this.letterW[li] / 2, this.fontPx * 0.35);
                            ctx.restore();
                        }
                        ctx.restore();
                        continue;
                    }

                    const scale = 1 + (this.arriveScale(i) - 1) * SCALE_RETAIN ** age;
                    const blurTable = i === this.words.length - 1 ? BLUR_LAST : BLUR_MOST;
                    const sigma = (blurTable[Math.min(age, blurTable.length - 1)] ?? 0) * s;
                    const sp = this.wordSprites[i];
                    if (!sp) continue;
                    const dw = (sp.width / 2) * scale;
                    const dh = (sp.height / 2) * scale;
                    const slide = i === 0 ? 0 : SLIDE_EM * this.fontPx * SCALE_RETAIN ** age;
                    const cx = this.slotX[i] + shift + slide + this.wordW[i] / 2;
                    const cy = this.baseline - this.fontPx * 0.35;
                    this.blurDraw(sp, cx - dw / 2, cy - dh * (0.75 / 1.6), dw, dh, sigma);
                }
            }

            renderBurstWords(t) {
                const ctx = this.ctx;
                if (!ctx) return;
                const s = this.refS;
                const u = clamp01((t - (BURST_TICK - 1)) / 8);
                const zoom = 1 + ZOOM_MAX * u ** ZOOM_EXP;
                let throwPx = THROW_PX * s * u ** THROW_EXP;
                if (t > THROW_BALLISTIC_AT) {
                    throwPx *= THROW_BALLISTIC ** (t - THROW_BALLISTIC_AT);
                }
                const alpha = 1 - clamp01((t - WORD_FADE_START) / (WORD_FADE_END - WORD_FADE_START));

                const shift = this.shift[BURST_TICK - 1] || 0;
                for (let i = 0; i < this.words.length; i++) {
                    if (i === this.burstIdx) continue;
                    const side = i < this.burstIdx ? -1 : 1;
                    const cx = this.slotX[i] + shift + this.wordW[i] / 2;
                    const cy = this.baseline - this.fontPx * 0.35;

                    const zx = this.originX + (cx - this.originX) * zoom + side * throwPx;
                    const zy = this.originY + (cy - this.originY) * zoom;
                    if (alpha > 0) {
                        ctx.save();
                        ctx.globalAlpha = alpha;
                        ctx.translate(zx, zy);
                        ctx.scale(zoom, zoom);
                        ctx.fillStyle = this.bodyCss;
                        ctx.fillText(this.words[i], -this.wordW[i] / 2, this.fontPx * 0.35);
                        ctx.restore();
                    }

                    const sw = clamp01((t - (WORD_FADE_START - 1)) / 1.5);
                    if (sw > 0 && t < WORD_FADE_END + 1) {
                        const sl = (0.4 + 0.6 * sw) * STREAK_LEN * s;
                        for (let k = 0; k < 2; k++) {
                            const sy = zy - this.fontPx * 0.2 + ((i * 37 + k * 53) % 5 - 2) * 3 * s;
                            const ix = zx - side * sl;
                            this.drawDart(
                                ix, sy, (ix + zx) / 2, sy, zx, sy,
                                STREAK_WIDTH * 2 * s, 1, 1.4, i * 2.3 + k,
                                this.bodyRgb, this.bodyRgb,
                                STREAK_ALPHA * sw * (k === 0 ? 1 : 0.6)
                            );
                        }
                    }
                }

                if (!this.segsReady) this.captureSegs();
                if (!this.segs || !this.segs.length) {
                    if (alpha > 0) {
                        ctx.save();
                        ctx.globalAlpha = alpha;
                        ctx.fillStyle = this.wordFill(BURST_TICK - 1);
                        ctx.fillText(this.words[this.burstIdx], this.slotX[this.burstIdx] + shift, this.baseline);
                        ctx.restore();
                    }
                    return;
                }
                this.renderSegs(t);
            }

            renderSegs(t) {
                const tR = t + STROKE_OFFSET;
                for (const seg of this.segs) {
                    const main = this.segStateAt(seg, tR);
                    if (!main) continue;
                    const j = this.segJitter[seg.ji];
                    const phase = seg.ji * 1.7;
                    if (main.e > 0.3) {
                        const tr = this.segStateAt(seg, tR - TRAIL_DT);
                        if (tr) {
                            this.drawDart(
                                tr.tailX, tr.tailY, tr.bendX, tr.bendY, tr.headX, tr.headY,
                                tr.w * 0.8,
                                DART_SPIKE_MIN + (1 - DART_SPIKE_MIN) * tr.e,
                                j.sk, phase,
                                tr.tailC, tr.headC,
                                tr.alpha * TRAIL_ALPHA
                            );
                        }
                    }
                    this.drawDart(
                        main.tailX, main.tailY, main.bendX, main.bendY, main.headX, main.headY,
                        main.w,
                        DART_SPIKE_MIN + (1 - DART_SPIKE_MIN) * main.e,
                        j.sk, phase,
                        main.tailC, main.headC,
                        main.alpha
                    );
                }
            }

            renderRing(t) {
                const age = t - BURST_TICK;
                if (age < 0 || age >= RING_TICKS) return;
                const ctx = this.ctx;
                if (!ctx) return;
                const s = this.refS;
                const r = (RING_R0 + RING_V * age) * s;
                ctx.save();
                ctx.globalAlpha = RING_ALPHA * (1 - age / RING_TICKS);
                ctx.strokeStyle = rgbStr(this.burstRgb);
                ctx.lineWidth = Math.max(1.2, RING_WIDTH * s);
                ctx.beginPath();
                ctx.ellipse(this.originX, this.originY, r, r * 0.8, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            renderFlecks(t) {
                if (t < BURST_TICK) return;
                const ctx = this.ctx;
                if (!ctx) return;
                const s = this.refS;
                const fade = 1 - clamp01((t - FLECK_FADE_START) / FLECK_FADE_LEN);
                if (fade <= 0) return;
                ctx.save();
                ctx.globalAlpha = fade;
                for (const fl of this.flecks) {
                    const a = t - BURST_TICK + 1 - fl.delay;
                    if (a <= 0) continue;
                    const d = fl.spd * (a + 0.25 * a * a) * s;
                    const x = this.originX + Math.cos(fl.ang) * d;
                    const y = this.originY + Math.sin(fl.ang) * d * 0.8;
                    ctx.fillStyle = fl.color;
                    ctx.beginPath();
                    ctx.arc(x, y, fl.r * s * (0.5 + 0.5 * fade), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            renderStrokes(t) {
                const tR = t + STROKE_OFFSET;
                const s = this.refS;
                const cxOff = this.originX - ORIGIN_X * s;
                const cyOff = this.originY - ORIGIN_Y * s;
                for (let gi = 0; gi < GROUPS.length; gi++) {
                    const g = GROUPS[gi];
                    if (g.count > 1) continue;
                    const st = groupAt(g, tR);
                    if (!st || st.alpha <= 0) continue;
                    const dir = rad(st.ang);
                    const ux = Math.cos(dir),
                        uy = Math.sin(dir);
                    const px = -uy,
                        py = ux;
                    const j = this.dashJitter[gi][0];
                    const cx = (st.x + ux * j.along) * s + cxOff;
                    const cy = (st.y + uy * j.along) * s + cyOff;
                    const half = (st.len * j.lenMul * s) / 2;

                    const life = g.keys[g.keys.length - 1].t - g.keys[0].t || 1;
                    const prog = clamp01((tR - g.keys[0].t) / life);
                    this.drawDart(
                        cx - ux * half, cy - uy * half,
                        cx + px * j.bend * half, cy + py * j.bend * half,
                        cx + ux * half, cy + uy * half,
                        st.wid * s,
                        FINALE_SPIKE,
                        1.4 + j.bend,
                        gi * 2.9,
                        this.journeyAt(gi, prog - 0.25),
                        this.journeyAt(gi, prog),
                        st.alpha
                    );
                }
            }

            renderStill() {
                if (!this.ok) return;
                this.render(STILL_TICK);
            }

            start() {
                if (this.running || !this.ok) return;
                this.running = true;
                this.t0 = performance.now();
                this.lastTick = -1;
                const tick = (now) => {
                    if (!this.running) return;
                    const t = Math.floor(((now - this.t0) / 1000) * FPS) % TICKS;
                    if (t !== this.lastTick) {
                        if (t < this.lastTick && this.lastTick >= 0) {
                            this.applySentence((this.si + 1) % SENTENCES.length);
                        }
                        this.lastTick = t;
                        this.render(t);
                    }
                    this.raf = requestAnimationFrame(tick);
                };
                this.raf = requestAnimationFrame(tick);
            }

            stop() {
                this.running = false;
                cancelAnimationFrame(this.raf);
            }

            destroy() {
                this.stop();
                this.ctx = null;
                this.wordSprites = [];
                this.segs = [];
                this.scratch = [];
            }
        }


export { LoudBurst };
