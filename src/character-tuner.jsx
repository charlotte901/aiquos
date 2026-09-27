import { useEffect, useState } from "react";
import {
  readTuningOverrides,
  writeTuningOverrides,
  clearTuningOverrides,
  emitTuningChange,
} from "./character-tuning-store";
import "./character-tuner.css";

/**
 * 角色微调面板（仅开发期使用，用 ?tune=1 打开）。
 *
 * 四个测评通道的角色各自需要一点缩放/位移才能视觉居中，而"多少才合适"
 * 是主观判断——与其反复试错，不如把控制权交给调的人：
 * 面板实时改写 CSS 变量，点"导出 JSON"把结果复制出来，
 * 粘进 src/character-tuning.json 即成为默认值。
 *
 * 面板本身不参与生产渲染：没有 ?tune=1 时这个组件不会被挂载。
 */
const LABELS = {
  comprehensive: "综合测评",
  objective: "客观题测评",
  conversation: "对话式测评",
  practical: "实操任务测评",
};

const KEYS = Object.keys(LABELS);

export function CharacterTuner({ defaults }) {
  const [values, setValues] = useState(() => ({ ...defaults, ...(readTuningOverrides() ?? {}) }));
  const [active, setActive] = useState("comprehensive");
  const [copied, setCopied] = useState(false);

  // 值变化时：持久化 + 广播，角色组件订阅后重算自己的行内样式。
  // （不直接改 <html> 上的 CSS 变量——角色组件用行内样式持有最终值，
  //   两条写入路径会互相打架。）
  useEffect(() => {
    writeTuningOverrides(values);
    emitTuningChange();
  }, [values]);

  const set = (key, patch) => setValues((v) => ({ ...v, [key]: { ...v[key], ...patch } }));
  const cur = values[active] ?? { scale: 1, x: 0, y: 0 };

  const exported = JSON.stringify(
    { _说明: "scale = 缩放倍数；x / y = 平移（正数向右/向下），单位是视频元素自身尺寸的百分比。" , ...values },
    null,
    2,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    const clean = Object.fromEntries(KEYS.map((k) => [k, { scale: 1, x: 0, y: 0 }]));
    clearTuningOverrides();
    setValues(clean);
  };

  return (
    <div className="ctune-dock">
      <header className="ctune-head">
        <strong>角色微调</strong>
        <span>调好后点导出</span>
      </header>

      <div className="ctune-tabs">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={k === active ? "is-active" : ""}
            onClick={() => setActive(k)}
          >
            {LABELS[k]}
          </button>
        ))}
      </div>

      <label className="ctune-row">
        <span>缩放</span>
        <input
          type="range" min="0.5" max="1.6" step="0.01"
          value={cur.scale}
          onChange={(e) => set(active, { scale: Number(e.target.value) })}
        />
        <output>{cur.scale.toFixed(2)}</output>
      </label>

      <label className="ctune-row">
        <span>左右</span>
        <input
          type="range" min="-30" max="30" step="0.5"
          value={cur.x}
          onChange={(e) => set(active, { x: Number(e.target.value) })}
        />
        <output>{cur.x > 0 ? `+${cur.x}` : cur.x}%</output>
      </label>

      <label className="ctune-row">
        <span>上下</span>
        <input
          type="range" min="-30" max="30" step="0.5"
          value={cur.y}
          onChange={(e) => set(active, { y: Number(e.target.value) })}
        />
        <output>{cur.y > 0 ? `+${cur.y}` : cur.y}%</output>
      </label>

      <div className="ctune-actions">
        <button type="button" onClick={copy}>{copied ? "已复制 ✓" : "导出 JSON"}</button>
        <button type="button" className="is-ghost" onClick={reset}>重置</button>
      </div>

      <pre className="ctune-out" aria-label="导出的 JSON">{exported}</pre>
    </div>
  );
}
