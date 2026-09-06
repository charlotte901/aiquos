import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "@phosphor-icons/react";
import { TestWordmark } from "./TestWordmark";
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
  const [size, setSize] = useState(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const resize = () =>
      setSize({
        width: document.documentElement.clientWidth,
        height: innerHeight,
      });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const layout = getAssessmentLayout(size.width, size.height);
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
            ? `已选择 · ${ASSESSMENTS.find((item) => item.id === selected).title}`
            : ""}
        </p>
      </div>
    </main>
  );
}
