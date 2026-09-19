import { useMemo, useState } from "react";
import { ArrowClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { allRuns } from "../cohort.js";

function formatDateTime(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function RecordsView({ roster, onRefreshRoster }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [selected, setSelected] = useState(null);

  const runs = useMemo(
    () => allRuns(roster)
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt)),
    [roster],
  );
  const filtered = useMemo(() => runs.filter((run) => {
    if (source !== "all" && run.source !== source) return false;
    if (!query.trim()) return true;
    return run.studentName.includes(query.trim()) || String(run.overallScore).includes(query.trim());
  }), [runs, query, source]);

  return (
    <div className="admin-view">
      <div className="toolbar">
        <label className="search-box">
          <MagnifyingGlass size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索学员或分数" />
        </label>
        <select value={source} onChange={(event) => setSource(event.target.value)} aria-label="按来源筛选">
          <option value="all">全部来源</option>
          <option value="local">本机真实</option>
          <option value="demo">演示班级</option>
        </select>
        <span className="toolbar-count">{filtered.length} 条记录</span>
        <button type="button" className="is-ghost" onClick={onRefreshRoster}>
          <ArrowClockwise size={15} weight="bold" /> 刷新本机数据
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <strong>暂无测评记录</strong>
          <p>去学生端完成一次综合测评，然后点右上角刷新本机数据。</p>
        </div>
      ) : (
        <table className="admin-table is-hover">
          <thead>
            <tr><th>完成时间</th><th>学员</th><th>班级</th><th>总分</th><th>等级</th><th>六维</th><th>来源</th><th>快照</th></tr>
          </thead>
          <tbody>
            {filtered.map((run) => (
              <tr key={run.id}>
                <td className="is-mono">{formatDateTime(run.completedAt)}</td>
                <td><b>{run.studentName}</b></td>
                <td>{run.className}</td>
                <td><b>{run.overallScore}</b></td>
                <td><span className={`grade-badge is-${run.grade.toLowerCase()}`}>{run.grade}</span></td>
                <td>
                  <span className="mini-dims" aria-hidden="true">
                    {run.dimensions.map((dim) => <i key={dim.key} style={{ width: `${Math.max(6, dim.score * 0.28)}px` }} title={`${dim.short} ${dim.score}`} />)}
                  </span>
                </td>
                <td><em className={`src-tag is-${run.source}`}>{run.source === "local" ? "本机真实" : "演示班级"}</em></td>
                <td>
                  <button type="button" className="row-edit" onClick={() => setSelected(run)}>查看</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="drawer-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <div className="edit-dialog is-snapshot" role="dialog" aria-modal="true" aria-label="测评快照">
            <header>
              <div>
                <h2>{selected.studentName} 的测评快照</h2>
                <p>{formatDateTime(selected.completedAt)} · {selected.answeredCount}/{selected.totalQuestions} 题{selected.bankVersion ? ` · ${selected.bankVersion}` : ""}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="关闭快照"><X size={18} weight="bold" /></button>
            </header>
            <div className="edit-body">
              <div className="snapshot-head">
                <div className="snapshot-grade">
                  <span className={`grade-badge is-${selected.grade.toLowerCase()}`}>{selected.grade}</span>
                  <b>{selected.overallScore}</b>
                  <span>总分</span>
                </div>
                <ul className="dim-averages is-snapshot">
                  {selected.dimensions.map((dim) => (
                    <li key={dim.key}>
                      <span title={dim.name}>{dim.short}</span>
                      <div className="grade-track"><i style={{ width: `${dim.score}%` }} /></div>
                      <b>{dim.score}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
