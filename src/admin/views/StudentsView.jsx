import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, MagnifyingGlass, X } from "@phosphor-icons/react";

function formatDate(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function MiniRadar({ dimensions }) {
  const points = dimensions.map((dim, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    const radius = (dim.score / 100) * 74;
    return `${80 + radius * Math.cos(angle)},${80 + radius * Math.sin(angle)}`;
  }).join(" ");
  const ring = (radius) => Array.from({ length: 6 }, (_, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return `${80 + radius * Math.cos(angle)},${80 + radius * Math.sin(angle)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 160 160" role="img" aria-label="六维雷达图">
      {[24, 48, 74].map((radius) => <polygon key={radius} points={ring(radius)} className="radar-grid" />)}
      <polygon points={points} className="radar-shape" />
      {dimensions.map((dim, index) => {
        const angle = (-90 + index * 60) * Math.PI / 180;
        return (
          <text key={dim.key} x={80 + 88 * Math.cos(angle)} y={80 + 88 * Math.sin(angle)} className="radar-tick" textAnchor="middle">
            {dim.short}
          </text>
        );
      })}
    </svg>
  );
}

export function StudentsView({ roster }) {
  const [query, setQuery] = useState("");
  const [className, setClassName] = useState("all");
  const [selected, setSelected] = useState(null);

  const classes = useMemo(() => ["all", ...new Set(roster.map((student) => student.className))], [roster]);
  const filtered = useMemo(() => roster.filter((student) => {
    if (className !== "all" && student.className !== className) return false;
    if (!query.trim()) return true;
    return student.name.includes(query.trim());
  }), [roster, query, className]);

  return (
    <div className="admin-view">
      <div className="toolbar">
        <label className="search-box">
          <MagnifyingGlass size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索学员姓名"
          />
        </label>
        <select value={className} onChange={(event) => setClassName(event.target.value)} aria-label="按班级筛选">
          {classes.map((name) => <option key={name} value={name}>{name === "all" ? "全部班级" : name}</option>)}
        </select>
        <span className="toolbar-count">{filtered.length} 名学员</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <strong>没有匹配的学员</strong>
          <p>调整搜索词或班级筛选后重试。</p>
        </div>
      ) : (
        <table className="admin-table is-hover">
          <thead>
            <tr>
              <th>学员</th><th>班级</th><th>完成次数</th><th>最近测评</th><th>平均总分</th><th>最近等级</th><th>来源</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((student) => {
              const average = Math.round(student.runs.reduce((sum, run) => sum + run.overallScore, 0) / student.runs.length);
              const latest = student.runs[student.runs.length - 1];
              return (
                <tr key={student.id} onClick={() => setSelected(student)}>
                  <td><b>{student.name}</b></td>
                  <td>{student.className}</td>
                  <td>{student.runs.length} 次</td>
                  <td>{formatDate(latest.completedAt)}</td>
                  <td>{average}</td>
                  <td><span className={`grade-badge is-${latest.grade.toLowerCase()}`}>{latest.grade}</span></td>
                  <td><em className={`src-tag is-${student.source}`}>{student.source === "local" ? "本机真实" : "演示班级"}</em></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="drawer-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <aside className="drawer" role="dialog" aria-label={`学员详情 ${selected.name}`}>
            <header>
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.className} · {selected.runs.length} 次完成 · 平均 {Math.round(selected.runs.reduce((sum, run) => sum + run.overallScore, 0) / selected.runs.length)} 分</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="关闭学员详情"><X size={18} weight="bold" /></button>
            </header>
            <div className="drawer-body">
              <div className="drawer-radar">
                <MiniRadar dimensions={selected.runs[selected.runs.length - 1].dimensions} />
                <p>最近一次六维画像</p>
              </div>
              <table className="admin-table">
                <thead>
                  <tr><th>完成时间</th><th>总分</th><th>等级</th><th>趋势</th></tr>
                </thead>
                <tbody>
                  {selected.runs.map((run, index) => {
                    const previous = selected.runs[index - 1]?.overallScore;
                    const delta = previous === undefined ? null : run.overallScore - previous;
                    return (
                      <tr key={run.id}>
                        <td>{formatDate(run.completedAt)}</td>
                        <td><b>{run.overallScore}</b></td>
                        <td><span className={`grade-badge is-${run.grade.toLowerCase()}`}>{run.grade}</span></td>
                        <td>
                          {delta === null ? "首次" : delta >= 0
                            ? <span className="is-up"><ArrowUpRight size={14} weight="bold" /> +{delta}</span>
                            : <span className="is-down"><ArrowDownRight size={14} weight="bold" /> {delta}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
