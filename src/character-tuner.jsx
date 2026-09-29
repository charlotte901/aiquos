import { useEffect, useState } from "react";
import {
  readTuningOverrides,
  writeTuningOverrides,
  clearTuningOverrides,
  emitTuningChange,
} from "./character-tuning-store";
import TUNING_DEFAULTS from "./character-tuning.json";
import "./character-tuner.css";

/**
 * 角色微调面板（仅开发期使用，用 ?tune=1 打开）。
 *
 * 一套参数（大小 / 左右 / 上下）同时作用于全部四个角色——综合、客观、
 * 对话、实操的人物素材画幅一致，落位规则相同，调一次即可整体对齐。
 *
 * 「保存」把当前值 POST 给 dev server 写回 src/character-tuning.json，
 * 成为全局默认；保存成功后本地覆盖即被清除。
 */
const FIELDS = [
  { name: "scale", label: "大小", min: 0.5, max: 1.6, step: 0.01, unit: "×" },
  { name: "x", label: "左右", min: -30, max: 30, step: 0.5, unit: "%" },
  { name: "y", label: "上下", min: -30, max: 30, step: 0.5, unit: "%" },
];

async function saveToFile(values) {
  const payload = { _说明: TUNING_DEFAULTS._说明, scale: values.scale, x: values.x, y: values.y };
  const response = await fetch("/api/character-tuning", {
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

export function CharacterTuner() {
  const [values, setValues] = useState(() => {
    const { _说明, ...defaults } = TUNING_DEFAULTS;
    void _说明;
    return { ...defaults, ...(readTuningOverrides() ?? {}) };
  });
  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | error message
  const [copied, setCopied] = useState(false);

  // 值变化时：持久化到本地 + 广播，人物即时重排（预览即所见）。
  useEffect(() => {
    writeTuningOverrides(values);
    emitTuningChange();
  }, [values]);

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  const exported = JSON.stringify(
    { _说明: TUNING_DEFAULTS._说明, scale: values.scale, x: values.x, y: values.y },
    null,
    2,
  );

  const save = async () => {
    setSaveState("saving");
    try {
      await saveToFile(values);
      clearTuningOverrides();
      emitTuningChange();
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
    clearTuningOverrides();
    setValues({ scale: TUNING_DEFAULTS.scale, x: TUNING_DEFAULTS.x, y: TUNING_DEFAULTS.y });
  };

  return (
    <div className="ctune-dock ctune-character-dock">
      <header className="ctune-head">
        <strong>角色微调</strong>
        <span>统一应用于全部角色</span>
      </header>

      {FIELDS.map((field) => (
        <label className="ctune-row" key={field.name}>
          <span>{field.label}</span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={values[field.name]}
            onChange={(event) => set(field.name, Number(event.target.value))}
          />
          <output>
            {field.step < 1
              ? Number(values[field.name]).toFixed(field.name === "scale" ? 2 : 1)
              : Math.round(values[field.name])}
            {field.unit}
          </output>
        </label>
      ))}

      <div className="ctune-actions">
        <button type="button" onClick={save} disabled={saveState === "saving"}>
          {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存 ✓" : saveState || "保存到 JSON 文件"}
        </button>
        <button type="button" onClick={copy}>{copied ? "已复制 ✓" : "导出"}</button>
        <button type="button" className="is-ghost" onClick={reset}>重置</button>
      </div>

      <pre className="ctune-out" aria-label="当前角色微调 JSON">{exported}</pre>
    </div>
  );
}
