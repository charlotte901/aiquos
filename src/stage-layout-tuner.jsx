import { useEffect, useState } from "react";
import {
  readStageLayoutOverrides,
  writeStageLayoutOverrides,
  clearStageLayoutOverrides,
  emitStageLayoutChange,
  mergeStageLayout,
  saveStageLayoutToFile,
} from "./stage-layout-store";
import STAGE_LAYOUT_DEFAULTS from "./stage-layout-tuning.json";
import "./character-tuner.css";

/**
 * 页面布局调参面板（仅开发期使用，用 ?tune=1 打开）。
 *
 * 三条锚定规则（代码推导，面板只暴露允许调节的量）：
 *   ① TEST! 字标在左上角——左右 / 上下 / 缩放 全开放；
 *   ② 作答卡片左缘自动对齐字标水平中心——只开放 上下 / 宽度 / 高度；
 *   ③ 角色舞台自动居中于「卡片右缘 → 屏幕右缘」——只开放 上下 / 宽度 / 高度。
 *
 * 所有数值是视口百分比，随窗口等比缩放。「保存」写回
 * src/stage-layout-tuning.json，成为全局默认；保存成功后本地覆盖清除。
 */
const GROUPS = [
  {
    key: "mark",
    label: "TEST! 字标",
    note: "左上角锚点：左边距 / 上边距 / 缩放",
    fields: [
      { name: "x", label: "左边距", min: 0, max: 30, step: 0.1, unit: "%" },
      { name: "y", label: "上边距", min: 0, max: 25, step: 0.1, unit: "%" },
      { name: "scale", label: "缩放", min: 0.5, max: 1.8, step: 0.01, unit: "×" },
    ],
  },
  {
    key: "card",
    label: "作答卡片",
    note: "左缘自动对齐 TEST! 中心，无需手动调",
    fields: [
      { name: "y", label: "上边距", min: 0, max: 40, step: 0.1, unit: "%" },
      { name: "width", label: "宽度", min: 30, max: 90, step: 0.5, unit: "%" },
      { name: "height", label: "高度", min: 50, max: 95, step: 0.5, unit: "%" },
    ],
  },
  {
    key: "stage",
    label: "角色舞台",
    note: "自动居中于卡片右缘与屏幕右缘之间",
    fields: [
      { name: "y", label: "上边距", min: 0, max: 40, step: 0.1, unit: "%" },
      { name: "width", label: "宽度", min: 10, max: 60, step: 0.5, unit: "%" },
      { name: "height", label: "高度", min: 50, max: 95, step: 0.5, unit: "%" },
    ],
  },
];

export function StageLayoutTuner() {
  const [values, setValues] = useState(() => mergeStageLayout(readStageLayoutOverrides()));
  const [active, setActive] = useState("card");
  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | error message
  const [copied, setCopied] = useState(false);

  // 值变化时：持久化到本地 + 广播，页面元素即时重排（预览即所见）。
  useEffect(() => {
    writeStageLayoutOverrides(values);
    emitStageLayoutChange();
  }, [values]);

  const set = (key, patch) => setValues((v) => ({ ...v, [key]: { ...v[key], ...patch } }));
  const cur = values[active];

  const exported = JSON.stringify(
    { _说明: STAGE_LAYOUT_DEFAULTS._说明, card: values.card, stage: values.stage, mark: values.mark },
    null,
    2,
  );

  const save = async () => {
    setSaveState("saving");
    try {
      await saveStageLayoutToFile(values);
      // 文件已成为默认值：清掉本地覆盖，让所有人统一走文件值。
      clearStageLayoutOverrides();
      emitStageLayoutChange();
      setSaveState("saved");
    } catch (error) {
      setSaveState(error.message || "保存失败");
    }
    window.setTimeout(() => setSaveState(""), 2200);
  };

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
    clearStageLayoutOverrides();
    setValues(mergeStageLayout(null));
  };

  return (
    <div className="ctune-dock ctune-layout-dock">
      <header className="ctune-head">
        <strong>页面布局</strong>
        <span>锚定规则 · 保存后长期生效</span>
      </header>

      <div className="ctune-tabs">
        {GROUPS.map((group) => (
          <button
            key={group.key}
            type="button"
            className={group.key === active ? "is-active" : ""}
            onClick={() => setActive(group.key)}
          >
            {group.label}
          </button>
        ))}
      </div>

      <p className="ctune-note">{GROUPS.find((group) => group.key === active).note}</p>

      {GROUPS.find((group) => group.key === active).fields.map((field) => (
        <label className="ctune-row" key={field.name}>
          <span>{field.label}</span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={cur[field.name]}
            onChange={(event) => set(active, { [field.name]: Number(event.target.value) })}
          />
          <output>
            {field.step < 1 ? Number(cur[field.name]).toFixed(field.name === "scale" ? 2 : 1) : Math.round(cur[field.name])}
            {field.unit}
          </output>
        </label>
      ))}

      <div className="ctune-actions">
        <button type="button" onClick={save} disabled={saveState === "saving"}>
          {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存 ✓" : saveState || "保存到 JSON 文件"}
        </button>
        <button type="button" onClick={copy}>{copied ? "已复制 ✓" : "导出 JSON"}</button>
        <button type="button" className="is-ghost" onClick={reset}>重置</button>
      </div>

      <pre className="ctune-out" aria-label="当前布局 JSON">{exported}</pre>
    </div>
  );
}
