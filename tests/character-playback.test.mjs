import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * 伴学角色的播放节奏：整段动画播完 → 停 10 秒 → 再播下一轮。
 *
 * 这套行为挂在 <video> 的事件与定时器上，没法在 Node 里跑真实解码，
 * 所以用两层验证：
 *  1) 结构断言——源码里确实用 ended + 10s 定时器重播，而不是 loop 无缝循环；
 *  2) 行为仿真——把同一套控制流抄进一个假 video 对象上跑，确认时序。
 */

const SOURCE = readFileSync(new URL("../src/Task3DCharacter.jsx", import.meta.url), "utf8");

test("角色视频不用 loop 无缝循环，而是靠 ended + 延时重播", () => {
  // 关键点：一旦挂回 loop，动作会一轮接一轮没有间隔，人物看起来一直在动。
  assert.ok(!/\bloop\b/.test(SOURCE.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
    "不应再出现 loop 属性");
  assert.match(SOURCE, /addEventListener\("ended", handleEnded\)/);
  assert.match(SOURCE, /REPLAY_DELAY_MS = 10_000/);
  assert.match(SOURCE, /replayTimer = window\.setTimeout/, "重播应由定时器驱动");
});

test("重播前把播放头拨回开头", () => {
  // 不拨回开头的话 play() 会立刻再次触发 ended，形成零间隔死循环。
  const block = SOURCE.slice(SOURCE.indexOf("const handleEnded"), SOURCE.indexOf("const applyMotionPreference"));
  assert.match(block, /video\.currentTime = 0/);
  assert.ok(block.indexOf("video.currentTime = 0") < block.indexOf("video.play()"),
    "必须先归零再播放");
});

/** 把组件的控制流照搬到假 video 上，验证时序。 */
function simulate({ durationMs = 6840, replayDelayMs = 10_000, runForMs = 40_000 }) {
  const events = [];
  const timers = [];
  let now = 0;
  let endedHandler = null;

  const video = {
    paused: true, ended: false, currentTime: 0,
    play() { this.paused = false; this.ended = false; events.push({ type: "play", at: now }); return { catch() {} }; },
    pause() { this.paused = true; events.push({ type: "pause", at: now }); },
    addEventListener(ev, fn) { if (ev === "ended") endedHandler = fn; },
    advance(ms) {
      if (this.paused) return;
      this.currentTime += ms;
      if (this.currentTime >= durationMs) {
        this.currentTime = durationMs;
        this.paused = true;
        this.ended = true;
        events.push({ type: "ended", at: now });
        endedHandler?.();
      }
    },
  };

  const setTimeoutStub = (fn, delay) => { timers.push({ fn, at: now + delay }); return timers.length; };
  const clearTimeoutStub = () => {};

  // 组件里的 handlers
  const REPLAY_DELAY_MS = replayDelayMs;
  const handleEnded = () => {
    setTimeoutStub(() => {
      video.currentTime = 0;          // 归零
      video.play();
    }, REPLAY_DELAY_MS);
  };
  video.addEventListener("ended", handleEnded);
  video.play();

  const step = 100;
  while (now < runForMs) {
    now += step;
    video.advance(step);
    // 只消费已到期的定时器，未到期的留到下一拍（早期版本用 splice(0) 全取出，
    // 把还没到点的重播定时器直接丢了，导致只跑得完一轮）。
    for (let i = timers.length - 1; i >= 0; i -= 1) {
      if (timers[i].at <= now) {
        const [t] = timers.splice(i, 1);
        t.fn();
      }
    }
  }
  return events;
}

test("播放 → 结束 → 等 10 秒 → 重播（行为仿真）", () => {
  const events = simulate({});
  const ended = events.filter((e) => e.type === "ended").map((e) => e.at);
  const plays = events.filter((e) => e.type === "play").map((e) => e.at);

  assert.ok(ended.length >= 2, `40 秒内应至少播完两轮，实际 ${ended.length}`);
  assert.equal(plays[0], 0, "首轮立刻开始");

  // 每处重播都应比上一次结束晚约 10 秒
  for (let i = 1; i < plays.length; i += 1) {
    const gap = plays[i] - ended[i - 1];
    assert.ok(Math.abs(gap - 10_000) <= 200,
      `第 ${i} 轮重播应在上轮结束约 10 秒后（实际 ${gap}ms）`);
  }
});

test("间隔期内视频保持暂停（画面停在结束姿态）", () => {
  const events = simulate({ runForMs: 12_000 });
  const endedAt = events.find((e) => e.type === "ended")?.at;
  const nextPlay = events.filter((e) => e.type === "play").find((e) => e.at > endedAt)?.at;
  assert.ok(endedAt !== undefined, "第一轮应在 12 秒内播完（素材约 6.84s）");
  assert.ok(nextPlay === undefined || nextPlay - endedAt >= 9_000, "间隔不应短于 9 秒");
});
