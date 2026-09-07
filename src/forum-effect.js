// ── params ──────────────────────────────────────────────────────────

        const WORD = "Animation";

        const PALETTES = {
            chooseTest: { bg: "#fff4fa", box: "#d97424", handle: "#bf94ed", ink: "#ffffff" },
            chooseReport: { bg: "#fff4fa", box: "#2b78d6", handle: "#f99848", ink: "#ffffff" },
            chooseCenter: { bg: "#fff4fa", box: "#468d52", handle: "#7a98e2", ink: "#ffffff" },
            testPractical: { bg: "#fff4fa", box: "#3a7ccd", handle: "#498f4d", ink: "#ffffff" },
            accountSettings: { bg: "#fff4fa", box: "#468d52", handle: "#f99848", ink: "#ffffff" },
            accountWorks: { bg: "#fff4fa", box: "#6236ac", handle: "#3075d2", ink: "#ffffff" },
            accountRecords: { bg: "#fff4fa", box: "#d97424", handle: "#7a98e2", ink: "#ffffff" },
        };

        const PALETTE = PALETTES.volt;

        const VARIANTS = [
  { word: "share", palette: "chooseTest", shape: "rect", handle: "square" },
  { word: "discussion", palette: "chooseReport", shape: "round", handle: "circle", seed: 1 },
  { word: "member", palette: "chooseCenter", shape: "squircle", handle: "bar", seed: 2 },
  { word: "online", palette: "testPractical", shape: "ellipse", handle: "diamond", seed: 3 },
  { word: "public", palette: "accountSettings", shape: "round", handle: "hollow", seed: 4 },
  { word: "community", palette: "accountWorks", shape: "rect", handle: "square", seed: 5 },
  { word: "thread", palette: "accountRecords", shape: "squircle", handle: "circle", seed: 6 },
];

        const CYCLE_VARIANTS = true;
        const COLLAPSE_DUR = 0.42;
        const EMERGE_DUR = 0.5;
        const FIELD_FADE = 0.55;
        const FONT_SIZE = 178 / 700;
        const WORD_H = 208 / 700;
        const PAD_X = 22 / 700;
        const BASELINE_FRAC = 158 / 208;
        const HANDLE_R = 11.75 / 700;
        const HANDLE_R_GIANT = 30 / 700;
        const TIGHT = {
            R: [150 / 700, 174 / 700],
            e: [106 / 700, 126 / 700],
            a: [102 / 700, 126 / 700],
            l: [71 / 700, 161 / 700],
            i: [71 / 700, 161 / 700],
            t: [78 / 700, 150 / 700],
            y: [115 / 700, 154 / 700],
        };
        const REFERENCE_WORD = "Reality";
        const SCATTER_ANGLE = Math.PI * (3 - Math.sqrt(5));
        const SCATTER_INNER = 0.26;
        const SCATTER_OUTER = 0.46;
        const SCATTER_RELAX_PASSES = 60;
        const SCATTER_GAP = 0.03;
        const FIT_PAD_X = 0.16;
        const FIT_PAD_Y = 0.26;
        const SCATTER = {
            R: [20 / 700, 166 / 700],
            e: [177 / 700, 572 / 700],
            a: [350 / 700, 350 / 700],
            l: [572 / 700, 114 / 700],
            i: [672 / 700, 224 / 700],
            t: [474 / 700, 540 / 700],
            y: [626 / 700, 644 / 700],
        };
        const SEAM_GAPS = [33 / 700, 33 / 700, 29 / 700, 43 / 700, 29 / 700, 29 / 700];
        const DRIFT_D0 = 1430 / 700;
        const ZOOM = 3.46;
        const TRAIN_FIT = 0.86;
        const TRAIN_NORMALISE = 0.8;
        const ZOOM_FADE_IN = 0.05;
        const ZOOM_FADE_OUT = 0.34;
        const ZOOM_BLUR = 15 / 700;
        const TRAIN = ["a", "R", "e", "t"];
        const ARRIVE = [3.44, 4.12, 4.72];
        const ARRIVE_DUR = [0.28, 0.18, 0.18];
        const DEPART = [3.48, 4.08, 4.68, 5.24];
        const DEPART_DUR = 0.14;
        const TRAIN_ALL = true;
        const TRAIN_ARRIVE_SLOW = 0.2;
        const TRAIN_ARRIVE_FAST = 0.11;
        const TRAIN_DWELL_MIN = 0.09;
        const SPRING_FREQ = 8.5;
        const SPRING_DAMP = 5;
        const SPRING_AMP = 0.02;
        const TRAIN_OVERLAP = 0.35;
        const LOOP = 6.48;
        const T_SPLIT = 0.36;
        const T_SPREAD_END = 0.6;
        const T_SCATTER = 0.64;
        const T_SCATTER_END = 1.36;
        const T_ZOOM = 1.92;
        const T_ZOOM_END = 3.36;
        const T_POP = 5.52;
        const T_POP_END = 5.88;
        const SELECT_ALL_HOLD = 0.55;
        const SELECT_FADE = 0.45;
        const SELECT_DIM = 0.22;
        const TIGHTEN_IN = 0.11;
        const TIGHTEN_OUT = 0.55;
        const SCATTER_E = [
            [0, 0],
            [0.2, 0.02],
            [0.33, 0.05],
            [0.45, 0.35],
            [0.56, 0.8],
            [0.67, 0.94],
            [0.78, 0.99],
            [1, 1],
        ];
        const ZOOM_E = [
            [0, 0],
            [0.06, 0.02],
            [0.17, 0.06],
            [0.28, 0.15],
            [0.33, 0.26],
            [0.39, 0.66],
            [0.44, 0.8],
            [0.5, 0.86],
            [0.56, 0.9],
            [0.67, 0.955],
            [0.78, 0.98],
            [0.89, 0.995],
            [1, 1],
        ];
        const TRAV_E = [
            [0, 0],
            [0.2, 0.03],
            [0.35, 0.15],
            [0.5, 0.5],
            [0.65, 0.88],
            [0.8, 0.975],
            [1, 1],
        ];
        const POP_E = [
            [0, 0],
            [0.11, 0.01],
            [0.22, 0.045],
            [0.33, 0.16],
            [0.44, 0.81],
            [0.56, 0.92],
            [0.67, 0.964],
            [0.78, 0.986],
            [0.89, 0.997],
            [1, 1],
        ];

        const SQUIRCLE_N = 4;
        const BOX_RADIUS = 0.22;

        // ── spline ──────────────────────────────────────────────────────────

        function spline(pts) {
            const n = pts.length;
            const xs = pts.map(p => p[0]);
            const ys = pts.map(p => p[1]);
            const dx = [];
            const dy = [];
            const s = [];
            for (let i = 0; i < n - 1; i++) {
                dx.push(xs[i + 1] - xs[i]);
                dy.push(ys[i + 1] - ys[i]);
                s.push(dy[i] / dx[i]);
            }
            const m = [s[0]];
            for (let i = 1; i < n - 1; i++) {
                if (s[i - 1] * s[i] <= 0) m.push(0);
                else {
                    const w1 = 2 * dx[i] + dx[i - 1];
                    const w2 = dx[i] + 2 * dx[i - 1];
                    m.push((w1 + w2) / (w1 / s[i - 1] + w2 / s[i]));
                }
            }
            m.push(s[n - 2]);
            return function(k) {
                if (k <= 0) return ys[0];
                if (k >= 1) return ys[n - 1];
                let i = 0;
                while (i < n - 2 && xs[i + 1] < k) i++;
                const h = dx[i];
                const u = (k - xs[i]) / h;
                const u2 = u * u;
                const u3 = u2 * u;
                return ys[i] * (2 * u3 - 3 * u2 + 1) +
                    m[i] * h * (u3 - 2 * u2 + u) +
                    ys[i + 1] * (-2 * u3 + 3 * u2) +
                    m[i + 1] * h * (u3 - u2);
            };
        }

        const scatterE = spline(SCATTER_E);
        const zoomE = spline(ZOOM_E);
        const travE = spline(TRAV_E);
        const popE = spline(POP_E);

        // ── helpers ────────────────────────────────────────────────────────

        function mixHex(a, b, k) {
            const pa = parseInt(a.slice(1), 16);
            const pb = parseInt(b.slice(1), 16);
            const r = Math.round((pa >> 16 & 255) + (((pb >> 16 & 255) - (pa >> 16 & 255)) * k));
            const g = Math.round((pa >> 8 & 255) + (((pb >> 8 & 255) - (pa >> 8 & 255)) * k));
            const bl = Math.round((pa & 255) + (((pb & 255) - (pa & 255)) * k));
            return `rgb(${r},${g},${bl})`;
        }

        const easeOutCubic = k => 1 - (1 - k) ** 3;
        const clamp01 = k => Math.max(0, Math.min(1, k));
        const lerp = (a, b, k) => a + (b - a) * k;
        const smooth = k => { const c = clamp01(k); return c * c * (3 - 2 * c); };

        const SHAPE_INFLATE = { rect: 1, round: 1, ellipse: Math.SQRT2, squircle: Math.pow(2, 1 / SQUIRCLE_N) };

        // ── engine ──────────────────────────────────────────────────────────

        class RealitySplit {
            constructor(canvas, opts = {}) {
                this.canvas = canvas;
                this.ctx = canvas.getContext('2d');
                this.ok = !!this.ctx;
                this.running = false;
                this.raf = 0;
                this.last = 0;
                this.t = 0;
                this.W = 0;
                this.H = 0;
                this.dpr = 1;
                this.opts = opts;
                this.variants = opts.variants ?? (CYCLE_VARIANTS ? VARIANTS : []);
                this.vi = 0;
                this.word = WORD;
                this.pal = PALETTE;
                this.prevPal = null;
                this.started = false;
                this.shape = 'rect';
                this.handleShape = 'circle';
                this.seed = 0;
                this.layout = null;
                this.slots = null;
                this.sched = null;
                this.trainZoomCache = null;
                this.font = '';
                this.fontPx = 0;
                this.letters = [];
                this.wordW = 0;
                this.wordH = 0;
                this.baseline = 0;
                this.shapePath = null;
                this.cardSprites = [];
                this.cardPad = 0;

                if (this.ok) {
                    this.applyVariant(0);
                    this.resize();
                }
            }

            resolvePalette(p) {
                if (!p) return PALETTE;
                return typeof p === 'string' ? (PALETTES[p] ?? PALETTE) : p;
            }

            applyVariant(i) {
                const v = this.variants.length ? this.variants[i % this.variants.length] : {};
                this.prevPal = this.started ? this.pal : null;
                this.started = true;
                this.vi = i;
                this.word = v.word ?? this.opts.word ?? WORD;
                this.pal = this.resolvePalette(v.palette ?? this.opts.palette);
                this.shape = v.shape ?? this.opts.shape ?? 'rect';
                this.handleShape = v.handle ?? this.opts.handleShape ?? 'circle';
                this.seed = v.seed ?? this.opts.seed ?? 0;
                this.layout = null;
                this.slots = null;
                this.sched = null;
                this.trainZoomCache = null;
                if (this.fontPx > 0) this.measure();
            }

            resize() {
                const r = this.canvas.getBoundingClientRect();
                if (r.width < 1 || r.height < 1) return;
                this.dpr = Math.min(window.devicePixelRatio || 1, 2);
                this.W = r.width;
                this.H = r.height;
                this.canvas.width = Math.round(r.width * this.dpr);
                this.canvas.height = Math.round(r.height * this.dpr);
                this.ctx.imageSmoothingEnabled = true;
                this.ctx.imageSmoothingQuality = 'high';
                this.measure();
                if (!this.running) this.draw(this.t);
            }

            measure() {
                const ctx = this.ctx;
                if (!ctx) return;
                const S = this.H;
                this.fontPx = FONT_SIZE * S;
                this.font = `700 ${this.fontPx}px Helvetica, Arial, sans-serif`;
                ctx.font = this.font;

                const textW = ctx.measureText(this.word).width;
                this.wordW = textW + 2 * PAD_X * S;
                this.wordH = WORD_H * S;
                this.baseline = BASELINE_FRAC * this.wordH;

                const padX = PAD_X * S;
                this.letters = [];
                this.trainZoomCache = null;
                this.slots = null;
                this.sched = null;
                this.layout = null;
                this.cardSprites = [];
                this.buildShapePath();
                const inflate = SHAPE_INFLATE[this.shape] || 1;
                for (let i = 0; i < this.word.length; i++) {
                    const ch = this.word[i];
                    const pre = ctx.measureText(this.word.slice(0, i)).width;
                    const adv = ctx.measureText(this.word.slice(0, i + 1)).width;
                    const m = ctx.measureText(ch);
                    const asc = m.actualBoundingBoxAscent ?? this.fontPx * 0.72;
                    const desc = m.actualBoundingBoxDescent ?? 0;
                    const bbL = m.actualBoundingBoxLeft ?? 0;
                    const bbR = m.actualBoundingBoxRight ?? adv - pre;
                    const drawX = padX + pre;

                    const inkW = bbL + bbR;
                    const inkH = asc + desc;
                    this.letters.push({
                        ch,
                        cellL: i === 0 ? 0 : padX + pre,
                        cellR: i === this.word.length - 1 ? this.wordW : padX + adv,
                        drawX,
                        gcx: drawX + (bbR - bbL) / 2,
                        gcy: this.baseline + (desc - asc) / 2,
                        tw: (inkW + FIT_PAD_X * this.fontPx) * inflate,
                        th: (inkH + FIT_PAD_Y * this.fontPx) * inflate,
                    });
                }
                this.buildCardSprites();
                this.scatterLayout();
            }

            buildShapePath() {
                if (this.shape !== 'squircle') {
                    this.shapePath = null;
                    return;
                }
                const path = new Path2D();
                const steps = 96;
                const exp = 2 / SQUIRCLE_N;
                for (let i = 0; i <= steps; i++) {
                    const th = (i / steps) * Math.PI * 2;
                    const c = Math.cos(th);
                    const s = Math.sin(th);
                    const x = Math.sign(c) * Math.abs(c) ** exp;
                    const y = Math.sign(s) * Math.abs(s) ** exp;
                    if (i === 0) path.moveTo(x, y);
                    else path.lineTo(x, y);
                }
                path.closePath();
                this.shapePath = path;
            }

            buildCardSprites() {
                this.cardPad = Math.max(4, ZOOM_BLUR * this.H * 0.35);
                this.cardSprites = this.letters.map((L) => {
                    const cssW = L.tw + this.cardPad * 2;
                    const cssH = L.th + this.cardPad * 2;
                    // The resting canvas is DPR-scaled, but zoom pieces expand
                    // several times. Render their source bitmap at that final
                    // density so the browser downsamples instead of stretching.
                    const spriteScale = this.dpr * Math.max(1, this.letterZoom(L));
                    const sp = document.createElement('canvas');
                    sp.width = Math.max(1, Math.ceil(cssW * spriteScale));
                    sp.height = Math.max(1, Math.ceil(cssH * spriteScale));
                    const sc = sp.getContext('2d');
                    if (!sc) return null;
                    sc.setTransform(spriteScale, 0, 0, spriteScale, 0, 0);
                    sc.fillStyle = this.pal.box;
                    this.fillBoxOn(sc, this.cardPad, this.cardPad, L.tw, L.th);
                    sc.fillStyle = this.pal.ink;
                    sc.font = this.font;
                    sc.textAlign = 'left';
                    sc.textBaseline = 'alphabetic';
                    sc.fillText(
                        L.ch,
                        this.cardPad + L.tw / 2 + L.drawX - L.gcx,
                        this.cardPad + L.th / 2 + this.baseline - L.gcy
                    );
                    return sp;
                });
            }

            start() {
                if (this.running || !this.ok) return;
                this.running = true;
                this.last = performance.now();
                const tick = (now) => {
                    if (!this.running) return;
                    const speed = this.opts.speed ?? 1;
                    const loop = this.timeline().loop;
                    const next = this.t + Math.min((now - this.last) / 1000, 0.1) * speed;
                    if (next >= loop && this.variants.length > 1) {
                        this.applyVariant(this.vi + 1);
                    }
                    this.t = next % loop;
                    this.last = now;
                    this.draw(this.t);
                    this.raf = requestAnimationFrame(tick);
                };
                this.raf = requestAnimationFrame(tick);
            }

            stop() {
                this.running = false;
                cancelAnimationFrame(this.raf);
            }

            renderStill() { this.draw(0); }

            destroy() { this.stop(); }

            wordRect(scale) {
                return {
                    x: this.W / 2 - (this.wordW * scale) / 2,
                    y: this.H / 2 - (this.wordH * scale) / 2,
                    w: this.wordW * scale,
                    h: this.wordH * scale,
                };
            }

            scatterLayout() {
                if (this.layout) return this.layout;
                const n = this.letters.length;
                if (n === 0) return (this.layout = []);
                const span = this.H + (this.W - this.H) * (this.opts.scatterSpread ?? 0.5);
                const cx = this.W / 2;
                const cy = this.H / 2;
                const gap = SCATTER_GAP * this.H;

                const pts = [
                    [cx, cy]
                ];
                for (let i = 1; i < n; i++) {
                    const k = n > 2 ? (i - 1) / (n - 2) : 0;
                    const off = this.seed === 0 ? 0 : 1;
                    const h = Math.sin((this.seed + 1) * 12.9898 + i * 78.233) * 43758.5453;
                    const jitter = (h - Math.floor(h)) * off;
                    const r = lerp(SCATTER_INNER, SCATTER_OUTER, k) * (1 - 0.12 * off + 0.24 * jitter);
                    const a = i * SCATTER_ANGLE - Math.PI / 2 + this.seed * SCATTER_ANGLE;
                    pts.push([cx + Math.cos(a) * r * span, cy + Math.sin(a) * r * this.H]);
                }

                const halfW = this.letters.map(L => L.tw / 2);
                const halfH = this.letters.map(L => L.th / 2);
                for (let pass = 0; pass < SCATTER_RELAX_PASSES; pass++) {
                    for (let i = 0; i < n; i++) {
                        for (let j = i + 1; j < n; j++) {
                            const dx = pts[j][0] - pts[i][0];
                            const dy = pts[j][1] - pts[i][1];
                            const ox = halfW[i] + halfW[j] + gap - Math.abs(dx);
                            const oy = halfH[i] + halfH[j] + gap - Math.abs(dy);
                            if (ox <= 0 || oy <= 0) continue;
                            let px = 0,
                                py = 0;
                            if (ox < oy) px = (dx < 0 ? -ox : ox) / 2;
                            else py = (dy < 0 ? -oy : oy) / 2;
                            if (i === 0) { pts[j][0] += px * 2;
                                pts[j][1] += py * 2; } else { pts[i][0] -= px;
                                pts[i][1] -= py;
                                pts[j][0] += px;
                                pts[j][1] += py; }
                        }
                    }
                    for (let i = 1; i < n; i++) {
                        pts[i][0] = Math.max(halfW[i] + gap, Math.min(this.W - halfW[i] - gap, pts[i][0]));
                        pts[i][1] = Math.max(halfH[i] + gap, Math.min(this.H - halfH[i] - gap, pts[i][1]));
                    }
                }
                return (this.layout = pts);
            }

            target(ch, li) { void ch; return this.scatterLayout()[li] ?? [this.W / 2, this.H / 2]; }

            scatterPiece(li, t) {
                const S = this.H;
                const L = this.letters[li];
                const word = this.wordRect(1);

                const spreadK = t < T_SPLIT ? 0 : easeOutCubic(clamp01((t - T_SPLIT) / (T_SPREAD_END - T_SPLIT)));

                const seams = Math.max(this.letters.length - 1, 0);
                const gapAt = (i) => SEAM_GAPS[i % SEAM_GAPS.length];
                let cum = 0;
                for (let s = 0; s < li; s++) cum += gapAt(s);
                let total = 0;
                for (let s = 0; s < seams; s++) total += gapAt(s);
                const rowShift = (cum - total / 2) * S * spreadK;

                const sliceX = word.x + L.cellL + rowShift;
                const sliceW = L.cellR - L.cellL;
                const sliceGx = word.x + L.gcx + rowShift;
                const sliceCx = sliceX + sliceW / 2;

                if (t < T_SCATTER) {
                    return {
                        x: sliceX,
                        y: word.y,
                        w: sliceW,
                        h: word.h,
                        gx: sliceGx,
                        gy: word.y + L.gcy,
                        gs: 1,
                        hr: HANDLE_R * S,
                    };
                }

                const fly = scatterE(clamp01((t - T_SCATTER) / (T_SCATTER_END - T_SCATTER)));
                const tight = smooth((clamp01((t - T_SCATTER) / (T_SCATTER_END - T_SCATTER)) - TIGHTEN_IN) / (TIGHTEN_OUT -
                    TIGHTEN_IN));
                const [tx, ty] = this.target(L.ch, li);
                let cx = lerp(sliceCx, tx, fly);
                let cy = lerp(this.H / 2, ty, fly);
                const w = lerp(sliceW, L.tw, tight);
                const h = lerp(word.h, L.th, tight);

                let gox = lerp(sliceGx - sliceCx, 0, tight);
                let goy = lerp(L.gcy - this.wordH / 2, 0, tight);

                let gs = 1;
                let hr = HANDLE_R * S;
                if (t >= T_SCATTER_END) {
                    const q = clamp01((t - T_SCATTER_END) / (T_ZOOM - T_SCATTER_END));
                    const vx = tx - this.W / 2;
                    const vy = ty - this.H / 2;
                    const d = Math.hypot(vx, vy);
                    if (d > 0) {
                        const push = (d / (DRIFT_D0 * S)) * q * q;
                        cx = tx + vx * push;
                        cy = ty + vy * push;
                    }
                }
                if (t >= T_ZOOM) {
                    const zEnd = li === 0 ? this.letterZoom(L) : ZOOM;
                    const z = 1 + (zEnd - 1) * zoomE(clamp01((t - T_ZOOM) / (T_ZOOM_END - T_ZOOM)));
                    cx = this.W / 2 + (cx - this.W / 2) * z;
                    cy = this.H / 2 + (cy - this.H / 2) * z;
                    gs = z;
                    gox *= z;
                    goy *= z;
                    hr *= this.handleGrow(t);
                    const zw = w * z;
                    const zh = h * z;
                    if (cx + zw / 2 < 0 || cx - zw / 2 > this.W || cy + zh / 2 < 0 || cy - zh / 2 > this.H) return null;
                    let a = 1;
                    let blur = 0;
                    if (li !== 0) {
                        const k = clamp01((t - T_ZOOM) / (T_ZOOM_END - T_ZOOM));
                        const f = smooth((k - ZOOM_FADE_IN) / (ZOOM_FADE_OUT - ZOOM_FADE_IN));
                        a = 1 - f;
                        if (a <= 0.002) return null;
                        blur = f * ZOOM_BLUR * S;
                    }
                    return { x: cx - zw / 2, y: cy - zh / 2, w: zw, h: zh, gx: cx + gox, gy: cy + goy, gs, hr, a, blur };
                }
                return { x: cx - w / 2, y: cy - h / 2, w, h, gx: cx + gox, gy: cy + goy, gs, hr };
            }

            handleGrow(t) {
                const k = zoomE(clamp01((t - T_ZOOM) / (T_ZOOM_END - T_ZOOM)));
                return 1 + (HANDLE_R_GIANT / HANDLE_R - 1) * k * k;
            }

            trainIndex(ti) { return this.trainSlots()[ti] ?? 0; }

            trainSlots() {
                if (this.slots) return this.slots;
                const n = this.letters.length;
                if (n === 0) return (this.slots = [0, 0, 0, 0]);
                if (this.opts.trainAll ?? TRAIN_ALL) return (this.slots = this.letters.map((_, i) => i));
                const used = new Set();
                const out = [];
                for (let ti = 0; ti < TRAIN.length; ti++) {
                    const byName = this.letters.findIndex((l, i) => l.ch === TRAIN[ti] && !used.has(i));
                    let idx = byName >= 0 ? byName : Math.min(n - 1, Math.round((ti / (TRAIN.length - 1)) * (n - 1)));
                    let step = 0;
                    while (used.has(idx) && step < n) { step++;
                        idx = (idx + 1) % n; }
                    used.add(idx);
                    out.push(idx);
                }
                return (this.slots = out);
            }

            schedule() {
                if (this.sched) return this.sched;
                const slots = this.trainSlots();
                const n = slots.length;
                if (!(this.opts.trainAll ?? TRAIN_ALL) && n === TRAIN.length) {
                    this.sched = slots.map((_, i) => ({
                        arrive: i === 0 ? T_ZOOM_END : ARRIVE[i - 1],
                        arriveDur: i === 0 ? 0 : ARRIVE_DUR[i - 1],
                        depart: DEPART[i],
                    }));
                    return this.sched;
                }

                const refWindow = T_POP - T_ZOOM_END;
                const durAt = (i) => lerp(TRAIN_ARRIVE_SLOW, TRAIN_ARRIVE_FAST, n > 1 ? i / (n - 1) : 0);
                const cost = (dwell) => {
                    let total = 0;
                    for (let i = 0; i < n; i++) {
                        const overlap = i === 0 ? 0 : DEPART_DUR * TRAIN_OVERLAP;
                        total += (i === 0 ? 0 : durAt(i)) + dwell + DEPART_DUR - overlap;
                    }
                    return total;
                };
                const slack = (refWindow - cost(0)) / n;
                const dwell = Math.max(TRAIN_DWELL_MIN, slack);
                let cursor = T_ZOOM_END;
                this.sched = slots.map((_, i) => {
                    const arriveDur = i === 0 ? 0 : durAt(i);
                    const arrive = cursor;
                    const depart = arrive + arriveDur + dwell;
                    cursor = depart + DEPART_DUR - DEPART_DUR * TRAIN_OVERLAP;
                    return { arrive, arriveDur, depart };
                });
                return this.sched;
            }

            timeline() {
                const sched = this.schedule();
                const last = sched[sched.length - 1];
                const trainEnd = last ? last.depart + DEPART_DUR : T_POP;
                const pop = Math.max(T_POP, trainEnd);
                const popEnd = pop + (T_POP_END - T_POP);
                const loop = pop + (LOOP - T_POP);
                const collapse = this.variants.length > 1 ? Math.max(popEnd, loop - COLLAPSE_DUR) : loop;
                return { pop, popEnd, collapse, loop };
            }

            trainX(ti, t) {
                const S = this.H;
                const L = this.letters[this.trainIndex(ti)];
                if (!L) return null;
                const halfW = (L.tw * this.letterZoom(L)) / 2;
                const center = this.W / 2;
                const enterX = this.W + halfW;
                const exitX = -halfW - 0.05 * S;

                const sched = this.schedule();
                const slot = sched[ti];
                if (!slot) return null;

                let x = center;
                if (ti > 0) {
                    if (t < slot.arrive) return null;
                    const k = clamp01((t - slot.arrive) / slot.arriveDur);
                    x = lerp(enterX, center, travE(k));
                    const decay = Math.exp(-SPRING_DAMP * k);
                    x -= Math.sin(SPRING_FREQ * k) * decay * SPRING_AMP * this.W;
                }
                if (t >= slot.depart) {
                    x = lerp(center, exitX, travE(clamp01((t - slot.depart) / DEPART_DUR)));
                    if (t >= slot.depart + DEPART_DUR) return null;
                }
                return x;
            }

            trainZoom() {
                if (this.trainZoomCache !== null) return this.trainZoomCache;
                let tallest = 0,
                    widest = 0;
                for (const L of this.letters) {
                    if (L.th > tallest) tallest = L.th;
                    if (L.tw > widest) widest = L.tw;
                }
                if (tallest <= 0) return (this.trainZoomCache = ZOOM);
                const byH = (this.H * TRAIN_FIT) / tallest;
                const byW = (this.W * TRAIN_FIT) / Math.max(widest, 1);
                return (this.trainZoomCache = Math.min(ZOOM, byH, byW));
            }

            letterZoom(L) {
                const z = this.trainZoom();
                if (TRAIN_NORMALISE <= 0) return z;
                let tallest = 0;
                for (const m of this.letters)
                    if (m.th > tallest) tallest = m.th;
                if (tallest <= 0 || L.th <= 0) return z;
                const even = z * (tallest / L.th);
                return lerp(z, even, TRAIN_NORMALISE);
            }

            trainPiece(ti, t) {
                const x = this.trainX(ti, t);
                if (x === null) return null;
                const L = this.letters[this.trainIndex(ti)];
                if (!L) return null;
                const z = this.letterZoom(L);
                const w = L.tw * z;
                const h = L.th * z;
                return { x: x - w / 2, y: this.H / 2 - h / 2, w, h, gx: x, gy: this.H / 2, gs: z, hr: HANDLE_R_GIANT * this
                        .H };
            }

            fillBox(x, y, w, h) {
                this.fillBoxOn(this.ctx, x, y, w, h);
            }

            fillBoxOn(ctx, x, y, w, h) {
                if (this.shape === 'rect') { ctx.fillRect(x, y, w, h); return; }

                if (this.shape === 'squircle' && this.shapePath) {
                    ctx.save();
                    ctx.translate(x + w / 2, y + h / 2);
                    ctx.scale(w / 2, h / 2);
                    ctx.fill(this.shapePath);
                    ctx.restore();
                    return;
                }

                ctx.beginPath();
                if (this.shape === 'ellipse') {
                    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    return;
                }
                if (this.shape === 'round') {
                    const r = Math.min(w, h) * BOX_RADIUS;
                    ctx.moveTo(x + r, y);
                    ctx.arcTo(x + w, y, x + w, y + h, r);
                    ctx.arcTo(x + w, y + h, x, y + h, r);
                    ctx.arcTo(x, y + h, x, y, r);
                    ctx.arcTo(x, y, x + w, y, r);
                    ctx.closePath();
                    ctx.fill();
                    return;
                }
                const cx = x + w / 2,
                    cy = y + h / 2;
                const a = w / 2,
                    b = h / 2;
                const n = SQUIRCLE_N;
                const STEPS = 96;
                for (let i = 0; i <= STEPS; i++) {
                    const th = (i / STEPS) * Math.PI * 2;
                    const c = Math.cos(th),
                        si = Math.sin(th);
                    const px = cx + a * Math.sign(c) * Math.abs(c) ** (2 / n);
                    const py = cy + b * Math.sign(si) * Math.abs(si) ** (2 / n);
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
            }

            drawPiece(p, ch, li) {
                const ctx = this.ctx;
                const L = this.letters[li];
                const alpha = p.a ?? 1;
                const sprite = this.cardSprites[li];
                const useSprite = !!sprite &&
                    L.tw > 0 && L.th > 0 &&
                    Math.abs(p.w / L.tw - p.h / L.th) < 0.002 &&
                    Math.abs(p.gs - p.w / L.tw) < 0.002;
                if (useSprite) {
                    this.drawCardSprite(sprite, p, L, alpha);
                } else {
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = this.pal.box;
                    this.fillBox(p.x, p.y, p.w, p.h);
                    ctx.fillStyle = this.pal.ink;
                    ctx.save();
                    ctx.translate(p.gx, p.gy);
                    ctx.scale(p.gs, p.gs);
                    ctx.fillText(ch, L.drawX - L.gcx, this.baseline - L.gcy);
                    ctx.restore();
                    ctx.restore();
                }

                const sel = p.sel ?? 1;
                if (sel > 0.002) {
                    ctx.save();
                    ctx.globalAlpha = alpha * sel;
                    this.handles(p.x, p.y, p.w, p.h, p.hr);
                    ctx.restore();
                }
            }

            drawCardSprite(sprite, p, L, alpha) {
                const ctx = this.ctx;
                const scale = p.w / L.tw;
                const x = p.x - this.cardPad * scale;
                const y = p.y - this.cardPad * scale;
                const w = (L.tw + this.cardPad * 2) * scale;
                const h = (L.th + this.cardPad * 2) * scale;

                if (!p.blur || p.blur <= 0.2) {
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(sprite, x, y, w, h);
                    ctx.globalAlpha = 1;
                    return;
                }

                // A few offset copies approximate the original motion blur without
                // triggering the much slower per-letter canvas filter.
                const off = Math.min(p.blur * 0.28, this.cardPad * scale * 0.45);
                const layers = [
                    [0, 0, 0.67],
                    [off, 0, 0.09],
                    [-off, 0, 0.09],
                    [0, off, 0.075],
                    [0, -off, 0.075]
                ];
                for (const [dx, dy, a] of layers) {
                    ctx.globalAlpha = alpha * a;
                    ctx.drawImage(sprite, x + dx, y + dy, w, h);
                }
                ctx.globalAlpha = 1;
            }

            handles(x, y, w, h, r) {
                const ctx = this.ctx;
                const corners = [
                    [x, y],
                    [x + w, y],
                    [x, y + h],
                    [x + w, y + h]
                ];
                ctx.fillStyle = this.pal.handle;
                ctx.strokeStyle = this.pal.handle;
                for (const [hx, hy] of corners) {
                    switch (this.handleShape) {
                        case 'square':
                            ctx.fillRect(hx - r * 0.86, hy - r * 0.86, r * 1.72, r * 1.72);
                            break;
                        case 'hollow':
                            ctx.lineWidth = Math.max(1, r * 0.42);
                            ctx.strokeRect(hx - r * 0.8, hy - r * 0.8, r * 1.6, r * 1.6);
                            break;
                        case 'diamond':
                            ctx.beginPath();
                            ctx.moveTo(hx, hy - r * 1.15);
                            ctx.lineTo(hx + r * 1.15, hy);
                            ctx.lineTo(hx, hy + r * 1.15);
                            ctx.lineTo(hx - r * 1.15, hy);
                            ctx.closePath();
                            ctx.fill();
                            break;
                        case 'bar': {
                            const horiz = w >= h;
                            const len = r * 2.6;
                            const thick = Math.max(1.5, r * 0.7);
                            if (horiz) ctx.fillRect(hx - len / 2, hy - thick / 2, len, thick);
                            else ctx.fillRect(hx - thick / 2, hy - len / 2, thick, len);
                            break;
                        }
                        default:
                            ctx.beginPath();
                            ctx.arc(hx, hy, r, 0, Math.PI * 2);
                            ctx.fill();
                    }
                }
            }

            drawWord(scale) {
                const ctx = this.ctx;
                const r = this.wordRect(scale);
                if (scale > 0.002) {
                    ctx.fillStyle = this.pal.box;
                    this.fillBox(r.x, r.y, r.w, r.h);
                    if (scale > 0.02) {
                        ctx.fillStyle = this.pal.ink;
                        ctx.save();
                        ctx.translate(this.W / 2, this.H / 2);
                        ctx.scale(scale, scale);
                        ctx.translate(-this.wordW / 2, -this.wordH / 2);
                        for (const L of this.letters) ctx.fillText(L.ch, L.drawX, this.baseline);
                        ctx.restore();
                    }
                }
                this.handles(r.x, r.y, r.w, r.h, HANDLE_R * this.H);
            }

            draw(t) {
                const ctx = this.ctx;
                if (!ctx) return;
                ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

                ctx.fillStyle = this.prevPal && t < FIELD_FADE ?
                    mixHex(this.prevPal.bg, this.pal.bg, smooth(t / FIELD_FADE)) :
                    this.pal.bg;
                ctx.fillRect(0, 0, this.W, this.H);
                ctx.font = this.font;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';

                if (t < T_SPLIT) {
                    const emerge = this.prevPal && t < EMERGE_DUR ? popE(clamp01(t / EMERGE_DUR)) : 1;
                    this.drawWord(emerge);
                    return;
                }

                if (t < T_ZOOM_END) {
                    for (let li = 0; li < this.letters.length; li++) {
                        const p = this.scatterPiece(li, t);
                        if (!p) continue;
                        const fadeStart = T_SPLIT + SELECT_ALL_HOLD;
                        p.sel = li === 0 ? 1 : lerp(1, SELECT_DIM, smooth((t - fadeStart) / SELECT_FADE));
                        this.drawPiece(p, this.letters[li].ch, li);
                    }
                    return;
                }

                const { pop, popEnd } = this.timeline();

                if (t < pop) {
                    const slotCount = this.trainSlots().length;
                    for (let ti = 0; ti < slotCount; ti++) {
                        const p = this.trainPiece(ti, t);
                        if (p) {
                            const li = this.trainIndex(ti);
                            this.drawPiece(p, this.letters[li].ch, li);
                        }
                    }
                    return;
                }

                if (t < popEnd) {
                    this.drawWord(popE(clamp01((t - pop) / (popEnd - pop))));
                    return;
                }

                const { collapse, loop } = this.timeline();
                if (t >= collapse && loop > collapse) {
                    this.drawWord(1 - popE(clamp01((t - collapse) / (loop - collapse))));
                    return;
                }
                this.drawWord(1);
            }
        }


export { RealitySplit };
