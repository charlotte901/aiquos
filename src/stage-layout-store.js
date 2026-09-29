/**
 * 测评页三元素（TEST! 字标 / 作答卡片 / 角色舞台）锚定布局。
 *
 * 布局规则（用户定义，代码推导、不允许打破）：
 *   ① TEST! 字标在左上角：x / y = 距屏幕左/上边的百分比，scale = 缩放。
 *   ② 作答卡片左缘 = TEST! 字标的水平中心（x 由规则推导，不独立设置）。
 *   ③ 角色舞台水平居中于「卡片右缘 → 屏幕右缘」区间（x 由规则推导）。
 *
 * 所有尺寸都是视口百分比（宽随 vw、高随 dvh）：窗口变大时元素等比变大，
 * 三条锚定关系在任何分辨率、任何窗口比例下恒成立——不存在居中/留白的
 * 二义性，这就是"自适应不混乱"的实现。
 *
 * 值来源：src/stage-layout-tuning.json（默认）+ localStorage 覆盖（调参
 * 面板产生）；「保存」POST /api/stage-layout-tuning 写回 JSON 文件。
 */
import { useEffect, useState } from "react";
import STAGE_LAYOUT_DEFAULTS from "./stage-layout-tuning.json";

const KEY = "aiquos.stage-layout.v1";

/** TEST! 字标基准宽 = 视口宽的 13.2%（沿用原 clamp 的中段值），scale 在其上乘。 */
const MARK_BASE_RATIO = 0.132;

export function readStageLayoutOverrides() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStageLayoutOverrides(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* 存储不可用时只是不能持久化，面板仍可用 */
  }
}

export function clearStageLayoutOverrides() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
}

const EVENT = "aiquos:stage-layout";

export function emitStageLayoutChange() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeStageLayout(handler) {
  const onEvent = () => handler(readStageLayoutOverrides());
  window.addEventListener(EVENT, onEvent);
  return () => window.removeEventListener(EVENT, onEvent);
}

/** 文件默认值 + 本地覆盖（浅合并每组）。旧 schema 的 card.x / stage.x 被忽略。 */
export function mergeStageLayout(overrides) {
  const base = STAGE_LAYOUT_DEFAULTS;
  const ov = overrides ?? {};
  return {
    mark: { ...base.mark, ...(ov.mark ?? {}) },
    card: { ...base.card, ...(ov.card ?? {}) },
    stage: { ...base.stage, ...(ov.stage ?? {}) },
  };
}

/**
 * 由三条锚定规则推导出每个元素的像素几何。
 * 输入的百分比是「设置值」，输出是确定性的 px——面板改值 / 窗口 resize
 * 都会重算，CSS 只消费结果，不再有任何自适应歧义。
 */
export function deriveStageGeometry(layout, winWidth, winHeight) {
  // ① 字标：左上角锚点
  const markLeft = (layout.mark.x / 100) * winWidth;
  const markTop = (layout.mark.y / 100) * winHeight;
  const markWidth = MARK_BASE_RATIO * winWidth * (layout.mark.scale ?? 1);
  const markCenterX = markLeft + markWidth / 2;

  // ② 卡片：左缘钉在字标水平中心上
  const cardLeft = markCenterX;
  const cardTop = (layout.card.y / 100) * winHeight;
  const cardWidth = (layout.card.width / 100) * winWidth;
  const cardHeight = (layout.card.height / 100) * winHeight;
  const cardRight = cardLeft + cardWidth;

  // ③ 舞台：在「卡片右缘 → 屏幕右缘」区间正中
  const stageWidth = (layout.stage.width / 100) * winWidth;
  const zoneLeft = cardRight;
  const zoneRight = winWidth;
  const stageLeft = (zoneLeft + zoneRight) / 2 - stageWidth / 2;
  const stageTop = (layout.stage.y / 100) * winHeight;
  const stageHeight = (layout.stage.height / 100) * winHeight;

  return {
    markLeft, markTop, markWidth, markCenterX,
    cardLeft, cardTop, cardWidth, cardHeight, cardRight,
    zoneLeft, zoneRight, stageLeft, stageTop, stageWidth, stageHeight,
  };
}

/**
 * 布局状态：文件默认 + 本地覆盖 + 按当前窗口推导的几何。
 * resize 时重算推导值；窄屏（<841px）由 CSS 回退到文档流堆叠，推导值
 * 不参与渲染但保持计算无害。
 */
export function useStageLayout() {
  const [overrides, setOverrides] = useState(readStageLayoutOverrides);
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => subscribeStageLayout((next) => setOverrides(readStageLayoutOverrides())), []);
  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const layout = mergeStageLayout(overrides);
  return { ...layout, geometry: deriveStageGeometry(layout, win.w, win.h) };
}

/** 推导几何 → 行内 CSS 变量（px）。CSS 端只读这些变量，别无定位逻辑。 */
export function stageLayoutVars(state) {
  const g = state.geometry;
  const px = (v) => `${Math.round(v)}px`;
  return {
    "--lo-mark-left": px(g.markLeft),
    "--lo-mark-top": px(g.markTop),
    "--lo-mark-width": px(g.markWidth),
    "--lo-card-left": px(g.cardLeft),
    "--lo-card-top": px(g.cardTop),
    "--lo-card-width": px(g.cardWidth),
    "--lo-card-height": px(g.cardHeight),
    "--lo-stage-left": px(g.stageLeft),
    "--lo-stage-top": px(g.stageTop),
    "--lo-stage-width": px(g.stageWidth),
    "--lo-stage-height": px(g.stageHeight),
  };
}

/** 保存到 JSON 文件（dev server 中间件写盘）。 */
export async function saveStageLayoutToFile(layout) {
  const payload = {
    _说明: STAGE_LAYOUT_DEFAULTS._说明,
    mark: (({ x, y, scale }) => ({ x, y, scale }))(layout.mark),
    card: (({ y, width, height }) => ({ y, width, height }))(layout.card),
    stage: (({ y, width, height }) => ({ y, width, height }))(layout.stage),
  };
  const response = await fetch("/api/stage-layout-tuning", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `保存失败（HTTP ${response.status}）`);
  }
  return null;
}
