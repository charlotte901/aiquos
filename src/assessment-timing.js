// 时间制测评的阶段计划与计时工具。
//
// 一次完整综合测评 ≈ 20 分钟：对话式 ≈ 5 分钟、客观题 ≈ 5 分钟、实操 ≈ 5 分钟，
// 加上开场/收尾剧情与觉醒报告。单独通道只跑自己那一个 5 分钟阶段。
// 阶段内题目数量不再固定——客观题由 CAT 引擎按时间预算与测量精度决定
// （见 src/comprehensive-adaptive.js 的 shouldStopCat）。
import { useEffect, useRef, useState } from "react";

export const PHASE_SECONDS = 300;

// 综合测评的三个阶段。守门人与既有剧情角色一致：对话在信息迷城（苏记者
// 质询），客观题回智核学院（林教授监考），实操进创客工坊（陈创客验收），
// 收尾由方法官宣读总评。
export const COMPREHENSIVE_PHASES = [
  {
    id: "labyrinth",
    mode: "conversation",
    label: "对话 · 信息迷城",
    short: "对话",
    guardian: "苏记者",
    seconds: PHASE_SECONDS,
  },
  {
    id: "academy",
    mode: "objective",
    label: "客观 · 智核学院",
    short: "客观",
    guardian: "林教授",
    seconds: PHASE_SECONDS,
  },
  {
    id: "workshop",
    mode: "practical",
    label: "实操 · 创客工坊",
    short: "实操",
    guardian: "陈创客",
    seconds: PHASE_SECONDS,
  },
];

export function getPhase(assessmentId, stage) {
  const phases = assessmentId === "comprehensive" ? COMPREHENSIVE_PHASES : null;
  if (!phases) return null;
  return phases[Math.max(0, Math.min(phases.length - 1, stage - 1))];
}

export function phaseCount(assessmentId) {
  return assessmentId === "comprehensive" ? COMPREHENSIVE_PHASES.length : 1;
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// 阶段倒计时：只在 running 时走表，时间到自动停在 0 并触发 onExpire。
// 用 requestAnimationFrame 之外的 250ms interval 即可（秒级显示）；
// 页面隐藏时照常计时——测评时钟不等标签页。
export function usePhaseClock({ seconds, running = false, onExpire = null }) {
  const [remainingMs, setRemainingMs] = useState(() => seconds * 1000);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const expiredRef = useRef(false);
  // 每次进入 running 都要重新取基准：如果沿用上一轮的 remainingMs，
  // 一个已经走到 0 的阶段（例如 starting 期间被烧完）会让下一段计时
  // 一启动就显示 00:00，学员再也答不了题。
  const baselineRef = useRef(remainingMs);
  const phaseRef = useRef(null);
  const signature = `${seconds}:${running}`;

  useEffect(() => {
    if (phaseRef.current !== signature) {
      phaseRef.current = signature;
      if (running) {
        // 进入 running：以当前剩余时间为基准重新计时。
        baselineRef.current = remainingMs > 0 ? remainingMs : seconds * 1000;
      }
    }
    if (!running) return undefined;
    const startedAt = Date.now();
    const baseline = baselineRef.current;
    const tick = () => {
      const left = Math.max(0, baseline - (Date.now() - startedAt));
      setRemainingMs(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        expireRef.current?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
    // remainingMs is read once per running transition on purpose (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return { remainingMs, expired: remainingMs <= 0 };
}
