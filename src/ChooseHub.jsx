import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { SourceCrop } from "./AssessmentHub";
import { TestWordmark } from "./TestWordmark";
import { CHOICES, CHOOSE_ART, CHOOSE_WORDMARK, getChooseLayout } from "./choose-layout";

export function ChooseHub({ onBack, onTest, onReports, onProfile, busy }) {
  const [size, setSize] = useState(() => ({ width: innerWidth, height: innerHeight }));
  useEffect(() => {
    const resize = () => setSize({ width: document.documentElement.clientWidth, height: innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const layout = getChooseLayout(size.width, size.height);
  return (
    <main className="choose-screen" data-compact={layout.compact} style={layout.variables} aria-label="选择你的下一步">
      <button className="assessment-back" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} /> 返回首页
      </button>
      <div className="choose-layout">
        <h1 className="choose-wordmark" tabIndex={-1} aria-label="CHOOSE! 选择你的下一步">
          <TestWordmark reference={CHOOSE_ART} crop={CHOOSE_WORDMARK} />
        </h1>
        <div className="choose-grid" role="group" aria-label="功能选择">
          {CHOICES.map((item) => (
            <button key={item.id} className="choose-card"
              aria-label={`${item.title} · ${item.subtitle}`}
              disabled={busy}
              onClick={() => item.id === "test" ? onTest() : item.id === "reports" ? onReports?.() : item.id === "profile" ? onProfile?.() : null}>
              <SourceCrop crop={item.crop} source={CHOOSE_ART} width={1822} height={863} />
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
