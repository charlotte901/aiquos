import { ArrowRight } from "@phosphor-icons/react";
import {
  buildReportView,
  filterReportHistory,
  groupReportHistory,
  radarGeometry,
  resolveReportHistorySelection,
} from "./report-model.js";

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "comprehensive", label: "综合测评" },
  { id: "objective", label: "客观题测评" },
];

function historyDateLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "完成时间不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function radarRing(radius) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return `${100 + radius * Math.cos(angle)},${100 + radius * Math.sin(angle)}`;
  }).join(" ");
}

function PreviewRadar({ view }) {
  const geometry = radarGeometry(view.dimensions, 72);
  const point = ({ x, y }) => `${(100 + x).toFixed(1)},${(100 + y).toFixed(1)}`;
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={`${view.typeLabel}历史报告六维雷达缩略图`}>
      {[24, 48, 72].map((radius) => <polygon key={radius} points={radarRing(radius)} className="history-radar-ring" />)}
      {geometry.polygon && <polygon points={geometry.points.map(point).join(" ")} className="history-radar-value" />}
      {geometry.points.map((item) => (
        <circle key={item.key} cx={100 + item.x} cy={100 + item.y} r="3.5" className="history-radar-point" />
      ))}
    </svg>
  );
}

function HistoryPreview({ report, onOpen }) {
  if (!report) {
    return (
      <aside className="report-history-preview is-empty" aria-live="polite">
        <strong>暂无可预览的报告</strong>
        <p>当前筛选下没有完整的历史测评，切换筛选后可继续查看。</p>
      </aside>
    );
  }
  const view = buildReportView(report);
  return (
    <aside className="report-history-preview" data-type={view.assessmentType} aria-label="所选历史报告预览">
      <header>
        <div>
          <span>{view.typeLabel}</span>
          <h3>{historyDateLabel(view.timestamp)}</h3>
        </div>
        <strong>{view.overallScore}%</strong>
      </header>
      <PreviewRadar view={view} />
      <dl>
        {view.dimensions.map((dimension) => (
          <div key={dimension.key}>
            <dt>{dimension.short}</dt>
            <dd>{dimension.displayScore}</dd>
          </div>
        ))}
      </dl>
      <button className="report-history-open" type="button" onClick={() => onOpen(report)}>
        查看完整报告 <ArrowRight size={17} weight="bold" aria-hidden="true" />
      </button>
    </aside>
  );
}

function HistoryCard({ record, latestId, selectedId, onSelect }) {
  if (record.unavailable) {
    return (
      <button className="report-history-card is-unavailable" type="button" disabled>
        <span className="history-card-type">记录异常</span>
        <strong>数据不可用</strong>
        <small>这条记录不完整，无法打开报告。</small>
      </button>
    );
  }
  const view = buildReportView(record);
  const selected = record.id === selectedId;
  return (
    <button
      className={selected ? "report-history-card is-selected" : "report-history-card"}
      data-type={record.assessmentType}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(record.id)}
    >
      <span className="history-card-main">
        <span className="history-card-type">{view.typeLabel}</span>
        {record.id === latestId && <em>最新</em>}
        <strong>{historyDateLabel(record.completedAt)}</strong>
        <small>完整作答 · {view.answeredCount}/{view.totalQuestions}</small>
      </span>
      <span className="history-card-score">
        <strong>{view.overallScore}%</strong>
        <small>总百分比</small>
      </span>
      <ArrowRight size={18} weight="bold" aria-hidden="true" />
    </button>
  );
}

export function ReportHistory({
  history = [],
  selectedId = null,
  filter = "all",
  onFilter,
  onSelect,
  onOpen,
}) {
  const visible = filterReportHistory(history, filter);
  const groups = groupReportHistory(visible);
  const selected = resolveReportHistorySelection(history, filter, selectedId);
  const latest = resolveReportHistorySelection(history, "all", null);
  return (
    <section className="report-history" aria-labelledby="report-history-title">
      <header className="report-history-head">
        <div>
          <span>成长轨迹</span>
          <h2 id="report-history-title">历史能力报告</h2>
        </div>
        <p>每次完成的测评都以当时的结果快照保存，不会因后续作答重新计算。</p>
      </header>
      <div className="report-history-filters" role="tablist" aria-label="筛选历史报告">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => onFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="report-history-layout">
        <HistoryPreview report={selected} onOpen={onOpen} />
        <div className="report-history-list" aria-live="polite">
          {groups.length ? groups.map((group) => (
            <section key={group.key} className="report-history-group" aria-labelledby={`history-group-${group.key}`}>
              <h3 id={`history-group-${group.key}`}>{group.label}</h3>
              <div>
                {group.records.map((record) => (
                  <HistoryCard
                    key={record.id}
                    record={record}
                    latestId={latest?.id}
                    selectedId={selected?.id}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          )) : (
            <div className="report-history-empty">
              <strong>当前筛选下暂无历史报告</strong>
              <p>只有完成全部 25 题的测评才会出现在这里，未完成草稿不会进入历史记录。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
