import { useState } from "react";
import { ArrowLeft, Check } from "@phosphor-icons/react";
import { TestWordmark } from "./TestWordmark";
import { useStageSize } from "./DesignStage";
import { EDITIONS, readEdition, writeEdition } from "./bank-editions";
import {
  ASSESSMENTS,
  ASSESSMENT_ART,
  getAssessmentLayout,
} from "./assessment-layout";

export function SourceCrop({ crop, className = "", source = ASSESSMENT_ART, width = 1672, height = 941 }) {
  return (
    <span
      className={`source-crop ${className}`}
      style={{ aspectRatio: `${crop[2]} / ${crop[3]}` }}
      aria-hidden="true"
    >
      <img
        src={source}
        alt=""
        draggable="false"
        style={{
          width: `${(width / crop[2]) * 100}%`,
          height: `${(height / crop[3]) * 100}%`,
          left: `${(-crop[0] / crop[2]) * 100}%`,
          top: `${(-crop[1] / crop[3]) * 100}%`,
        }}
      />
    </span>
  );
}

export function AssessmentHub({ onBack, onStart, busy }) {
  const size = useStageSize();
  const [selected, setSelected] = useState(null);
  // 题库版本：切换后立刻生效，三个通道（客观/对话/实操）与综合测评都跟随。
  const [edition, setEdition] = useState(() => readEdition());
  const layout = getAssessmentLayout(size.width, size.height);
  const chooseEdition = (id) => {
    setEdition(id);
    writeEdition(id);
  };
  return (
    <main
      className="assessment-screen"
      data-compact={layout.compact}
      style={layout.variables}
      aria-label="选择测评方式"
    >
      <button className="assessment-back" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} /> 返回选择
      </button>
      <div className="assessment-layout">
        <h1
          className="assessment-wordmark"
          tabIndex={-1}
          aria-label="TEST! 选择你的测评方式"
        >
          <TestWordmark />
        </h1>

        {/* 题库版本切换：放在卡片上方，学员先决定题池再进测评。 */}
        <div className="assessment-editions" role="group" aria-label="题库版本">
          {Object.values(EDITIONS).map((item) => (
            <button
              key={item.id}
              type="button"
              className="assessment-edition"
              aria-pressed={edition === item.id}
              disabled={busy}
              onClick={() => chooseEdition(item.id)}
            >
              <strong>{item.label}</strong>
              <span>
                客观 {item.counts.objective} · 实操 {item.counts.practical}
              </span>
            </button>
          ))}
        </div>

        <div className="assessment-grid" role="group" aria-label="测评类型">
          {ASSESSMENTS.map((item) => (
            <button
              key={item.id}
              className="assessment-card"
              aria-label={`${item.title} · ${item.subtitle}`}
              aria-pressed={selected === item.id}
              onClick={() => {
                setSelected(item.id);
                onStart?.(item.id);
              }}
              disabled={busy}
            >
              <SourceCrop crop={item.crop} />
              {item.id === "comprehensive" && (
                <span className="assessment-title-overlay" aria-hidden="true">
                  <strong>{item.title}</strong>
                  <i />
                  <small>{item.subtitle}</small>
                </span>
              )}
              {selected === item.id && (
                <span className="assessment-check">
                  <Check size={18} weight="bold" />
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="assessment-selection" role="status">
          {selected
            ? `已选择 · ${ASSESSMENTS.find((item) => item.id === selected).title} · ${EDITIONS[edition].label}`
            : `${EDITIONS[edition].label}题库 · 选择一种测评方式开始`}
        </p>
      </div>
    </main>
  );
}
