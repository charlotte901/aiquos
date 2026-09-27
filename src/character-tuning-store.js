/**
 * 角色微调值的持久化（localStorage）。
 *
 * 拆成独立模块是为了避免循环依赖：Task3DCharacter 需要读、调参面板需要
 * 读写，而面板又依赖角色相关的展示逻辑。
 *
 * 覆盖值只在调参时产生；没有覆盖时一律用 src/character-tuning.json 的默认值。
 */
const KEY = "aiquos.character-tuning.v1";

export function readTuningOverrides() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeTuningOverrides(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* 存储不可用时只是不能持久化，面板仍可用 */
  }
}

export function clearTuningOverrides() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
}

/** 调参变化的通知事件：面板改完值后广播，角色组件据此重算行内样式。 */
const EVENT = "aiquos:character-tuning";

export function emitTuningChange() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * 订阅调参变化。
 * @returns {Function} 取消订阅
 */
export function subscribeTuning(handler) {
  const onEvent = () => handler(readTuningOverrides());
  window.addEventListener(EVENT, onEvent);
  return () => window.removeEventListener(EVENT, onEvent);
}
