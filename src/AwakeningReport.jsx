import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Printer, X } from "@phosphor-icons/react";
import {
  REPORT_RESOURCES,
  adviceForDimensions,
  buildReportSvg,
  buildReportView,
  radarGeometry,
} from "./report-model.js";

const DIALOGUE_LINES = [
  "这是你的最新测评：智核觉醒报告。",
  "这里呈现的是你当前在 AI 六大维度上的能力画像。每一道已经完成的题目，都会成为对应维度的真实证据；尚未覆盖的维度会保留为待测。",
  "我也为你准备了针对当前结果的学习建议和资源。完成全部测评后，你会得到正式总分与综合评级，也可以随时回来查看自己的变化。",
];

function ringPoints(radius) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return `${220 + radius * Math.cos(angle)},${220 + radius * Math.sin(angle)}`;
  }).join(" ");
}

function toChartPoint(point) {
  return `${(220 + point.x).toFixed(1)},${(220 + point.y).toFixed(1)}`;
}

function toChartPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${toChartPoint(point)}`).join(" ");
}

export function saveReportImage(reportView) {
  const svg = buildReportSvg(reportView);
  if (!svg) return;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const link = document.createElement("a");
    link.download = reportView.exportFilename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}

function ReportActions({ view }) {
  const disabled = !view.hasReport;
  return (
    <div className="report-actions" aria-label="报告导出">
      <button type="button" onClick={() => saveReportImage(view)} disabled={disabled}>
        <Download size={17} weight="bold" /> 保存截图
      </button>
      <button type="button" onClick={() => window.print()} disabled={disabled}>
        <Printer size={17} weight="bold" /> 保存 PDF
      </button>
    </div>
  );
}

function ReportRadar({ view }) {
  const geometry = radarGeometry(view.dimensions, 176);
  return (
    <section className="report-radar" aria-labelledby={`report-radar-${view.id}`}>
      <header className="radar-head">
        <div>
          <span>能力画像</span>
          <h2 id={`report-radar-${view.id}`}>六维能力雷达</h2>
        </div>
        <span className="radar-legend"><i /> 已获得证据</span>
      </header>
      <svg viewBox="0 0 440 440" role="img" aria-label={`${view.typeLabel}六维能力雷达图，待测维度不参与连线`}>
        {[44, 88, 132, 176].map((radius) => (
          <polygon key={radius} points={ringPoints(radius)} className="radar-ring" />
        ))}
        <polygon points={ringPoints(176)} className="radar-ring radar-edge" />
        {geometry.polygon && (
          <polygon
            points={geometry.points.map(toChartPoint).join(" ")}
            className="radar-value"
          />
        )}
        {geometry.segments.map((segment) => (
          <path
            key={segment.points.map((point) => point.key).join("-")}
            d={toChartPath(segment.points)}
            className="radar-segment"
          />
        ))}
        {geometry.points.map((point) => (
          <circle
            key={point.key}
            cx={220 + point.x}
            cy={220 + point.y}
            r="5"
            className="radar-point"
          />
        ))}
        {view.dimensions.map((item, index) => {
          const angle = (-90 + index * 60) * Math.PI / 180;
          const x = 220 + 206 * Math.cos(angle);
          const y = 220 + 206 * Math.sin(angle);
          return (
            <text key={item.key} x={x} y={y} className={item.score === null ? "radar-label is-pending" : "radar-label"} textAnchor="middle">
              <tspan x={x} y={y}>{item.short}</tspan>
              <tspan x={x} y={y + 22}>{item.displayScore}</tspan>
            </text>
          );
        })}
      </svg>
    </section>
  );
}

function ReportScores({ view }) {
  return (
    <section className="report-scores" aria-labelledby={`report-scores-${view.id}`}>
      <header>
        <div>
          <span>直接得分</span>
          <h2 id={`report-scores-${view.id}`}>六项能力明细</h2>
        </div>
        <small>百分制</small>
      </header>
      <ul>
        {view.dimensions.map((item) => (
          <li key={item.key} className={item.score === null ? "is-pending" : undefined}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.displayScore}</span>
            </div>
            <div className="score-track" role="img" aria-label={`${item.name} ${item.displayScore}`}>
              {item.score !== null && <i style={{ width: `${item.score}%` }} />}
            </div>
            <small>{item.score === null ? "等待作答" : `${item.evidenceCount} 项证据`}</small>
          </li>
        ))}
      </ul>
      <div
        className={view.complete ? "report-summary is-complete" : "report-summary is-live"}
        aria-label={view.complete ? `总百分比 ${view.overallScore}%，综合评级 ${view.grade}` : `初步结果，已完成 ${view.answeredCount} / ${view.totalQuestions} 题`}
      >
        {view.complete ? (
          <>
            <div><span>总百分比</span><strong>{view.overallScore}%</strong></div>
            <div><span>综合评级</span><strong>{view.grade}</strong></div>
          </>
        ) : (
          <>
            <div><span>初步结果</span><strong>{view.answeredCount} / {view.totalQuestions}</strong></div>
            <p>已完成题目；正式总分与评级将在测评完成后生成。</p>
          </>
        )}
      </div>
    </section>
  );
}

function ReportHistoryEntry({ count = 0 }) {
  return (
    <a className="report-history-entry" href="#center/records">
      <span>
        <small>过往记录</small>
        <strong>查看历史记录</strong>
        <em>{count > 0 ? `已保存 ${count} 份完成报告` : "完成测评后将在这里持续积累"}</em>
      </span>
      <ArrowRight size={20} weight="bold" aria-hidden="true" />
    </a>
  );
}

function ReportGuidance({ view }) {
  const advice = adviceForDimensions(view.dimensions);
  return (
    <section className="report-guidance" aria-label="报告建议与资源">
      <div>
        <header>
          <span>下一步</span>
          <h2>个性化学习建议</h2>
        </header>
        <ul className="advice-list">
          {advice.map((item) => (
            <li key={item.key}>
              <div><em>{item.priority}</em><strong>{item.name}</strong></div>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <header>
          <span>精选内容</span>
          <h2>推荐学习资源</h2>
        </header>
        <ul className="resource-list">
          {REPORT_RESOURCES.map((item) => (
            <li key={item.key}>
              <em>{item.tag}</em>
              <strong>{item.title}</strong>
              <span>{item.result}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function AwakeningReportContent({ report, compact = false, history = [], onStartAssessment }) {
  const view = buildReportView(report);
  return (
    <section className="awakening-report-card" data-compact={compact} aria-label="智核觉醒报告结果">
      <header className="report-overview-head">
        <div>
          <span>{view.hasReport ? "最新测评" : "能力报告"}</span>
          <h1>{view.title}</h1>
        </div>
        <dl>
          <div><dt>测评来源</dt><dd>{view.typeLabel ?? "尚未选择"}</dd></div>
          <div><dt>{view.timestampLabel}</dt><dd>{view.dateLabel}</dd></div>
          <div><dt>当前状态</dt><dd>{view.statusLabel}</dd></div>
        </dl>
      </header>

      {view.hasReport ? (
        <>
          <div className="report-hero">
            <ReportRadar view={view} />
            <ReportScores view={view} />
          </div>
          <ReportHistoryEntry count={history.length} />
          <ReportGuidance view={view} />
        </>
      ) : (
        <div className="report-empty">
          <span aria-hidden="true">六维</span>
          <div>
            <strong>从一次真实测评开始</strong>
            <p>完成第一道题后，这里会显示有证据支持的维度；未覆盖的能力不会被伪装成零分。</p>
            {onStartAssessment && (
              <button type="button" onClick={onStartAssessment}>开始测评 <ArrowRight size={18} weight="bold" /></button>
            )}
          </div>
        </div>
      )}

      <ReportActions view={view} />
    </section>
  );
}

export function AwakeningReportModal({ report, open, onClose }) {
  const view = buildReportView(report);
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="report-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="awakening-report-modal-title">
        <header className="report-modal-head">
          <div>
            <em>{view.typeLabel ?? "测评报告"}</em>
            <h2 id="awakening-report-modal-title">{view.hasReport ? "智核觉醒报告" : "暂无可查看的报告"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭觉醒报告">
            <X size={20} weight="bold" />
          </button>
        </header>
        <div className="report-modal-body">
          <AwakeningReportContent report={report} compact />
        </div>
      </div>
    </div>
  );
}

export function AwakeningReport({
  report,
  history = [],
  storageWarning,
  onBack,
  onStartAssessment,
  busy,
  active = false,
}) {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (!active) setLineIndex(0);
  }, [active, report?.id]);

  const advanceDialogue = () => {
    if (lineIndex < DIALOGUE_LINES.length - 1) setLineIndex((current) => current + 1);
  };

  return (
    <main className="awakening-screen" aria-label="智核觉醒报告">
      <button className="report-back" type="button" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} /> 返回选择
      </button>

      {storageWarning && <p className="report-storage-warning" role="alert">{storageWarning}</p>}

      {report && (
        <div
          className="awakening-dialogue"
          role="button"
          tabIndex={0}
          aria-label={lineIndex === DIALOGUE_LINES.length - 1 ? "小源对话已完成" : "继续下一句小源对话"}
          onClick={advanceDialogue}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              advanceDialogue();
            }
          }}
        >
          <article className="awakening-story">
            <div className="awakening-story-head">
              <span>小源</span>
              <strong>{lineIndex + 1} / {DIALOGUE_LINES.length}</strong>
            </div>
            <p>{DIALOGUE_LINES[lineIndex]}</p>
            <small>{lineIndex === DIALOGUE_LINES.length - 1 ? "对话完成" : "点击继续 ▾"}</small>
          </article>
        </div>
      )}

      <AwakeningReportContent
        report={report}
        history={history}
        onStartAssessment={onStartAssessment}
      />
    </main>
  );
}
