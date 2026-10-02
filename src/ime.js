// 输入法安全的回车处理。
//
// 中文/日文/韩文输入法在选词状态下按回车是"确认候选词"，不是"提交"。
// 若在 keydown 里直接判断 key === "Enter" 就提交，会导致：
// 学员打字到一半想选词，结果消息被提前发出（且发出的是未上屏的拼音）。
//
// 判定必须同时满足：
//   1. 不在 IME 组词中（compositionstart 之后、compositionend 之前）；
//   2. event.isComposing 为假（Safari/旧版 Chromium 的兜底字段）；
//   3. event.keyCode !== 229（Chrome 在组词中会把 keyCode 报成 229）。
//
// 用法：
//   <input onKeyDown={onEnterSubmit(send)} />
//   <textarea onKeyDown={onEnterSubmit(send, { withMeta: true })} />
// 组词中的回车交由浏览器与输入法处理（默认行为），不拦截。

/** 判断这次按键是否应当视为"提交"而不是"确认输入法候选"。 */
export function isSubmitEnter(event) {
  if (event.key !== "Enter") return false;
  // 组词中的三个信号，任一成立都不提交。
  if (event.isComposing) return false;
  if (event.nativeEvent?.isComposing) return false;
  if (event.keyCode === 229) return false;
  return true;
}

/**
 * 生成 onKeyDown 处理器。
 * @param {Function} submit 提交动作
 * @param {{ withMeta?: boolean, when?: Function }} options
 *   withMeta=true 时要求 Cmd/Ctrl+Enter（多行输入用，Enter 留给换行）
 *   when 返回 false 时不提交（例如正在发送中）
 */
export function onEnterSubmit(submit, { withMeta = false, when = null } = {}) {
  return (event) => {
    if (!isSubmitEnter(event)) return;
    if (withMeta && !(event.metaKey || event.ctrlKey)) return;
    if (!withMeta && event.shiftKey) return;
    if (when && !when(event)) return;
    event.preventDefault();
    submit(event);
  };
}

/**
 * textarea 自动伸缩：内容变化时把高度调成内容高，封顶后内部滚动。
 * field-sizing: content 的 JS 兜底——不支持该 CSS 的浏览器（旧 Edge/火狐）
 * 也能自动长高；发送后草稿清空，高度自动缩回。
 *
 * @param {number} max 高度上限（px），约 3 行
 * @returns {(el: HTMLTextAreaElement|null) => void} ref 回调，每次渲染重挂
 */
export function autoResizeRef(max = 96) {
  return (el) => {
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    };
    el.addEventListener("input", resize);
    // 初次挂载与草稿清空（value 变化不触发 input）时也校正一次。
    resize();
  };
}
