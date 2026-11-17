import { assessmentLabel } from '../../server-records.js';
import { createPortal } from 'react-dom';
import { AbilityProgress } from './AbilityProgress.jsx';
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, MagnifyingGlass, X } from "@phosphor-icons/react";
function formatDate(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
export function StudentsView({ roster, dataSource }) {
  const [tab,setTab]=useState("students");
  const [query, setQuery] = useState("");
  const [className, setClassName] = useState("all");
  const [selected, setSelected] = useState(null);
  const classes = useMemo(() => ["all", ...new Set(roster.map((student) => student.className))], [roster]);
  const filtered = useMemo(() => roster.filter((student) => {
    if (className !== "all" && student.className !== className) return false;
    if (!query.trim()) return true;
    return student.name.includes(query.trim());
  }), [roster, query, className]);
  const averageOf=student=>{const values=student.runs.map(r=>r.overallScore).filter(Number.isFinite);return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*100)/100:null;};
  const ranked=roster.filter(s=>className==='all'||s.className===className).map(s=>({...s,average:averageOf(s)})).filter(s=>s.average!==null).sort((a,b)=>b.average-a.average);
  const rankingRows=ranked.filter(s=>!query.trim()||s.name.includes(query.trim()));
  const sourceLabel = (source) => (source === "server" ? "服务端" : source === "local" ? "本机真实" : "演示班级");

  return (
    <div className="admin-view">
      <div className="teacher-tabs" role="tablist" aria-label="学员管理视图">{[["students","学员列表"],["ranking","学员排名"]].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?"is-active":""} onClick={()=>setTab(id)}>{label}</button>)}</div>
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
      {tab==='ranking'?<section className="panel"><h2>学员平均分排名</h2><p>按平均分排序，同分并列。</p><table className="admin-table is-hover"><thead><tr><th>排名</th><th>学员</th><th>班级</th><th>完成次数</th><th>平均分</th></tr></thead><tbody>{rankingRows.map(s=><tr key={s.id} onClick={()=>setSelected(s)}><td>{ranked.findIndex(r=>r.average===s.average)+1}</td><td><b>{s.name}</b></td><td>{s.className}</td><td>{s.runs.length}</td><td>{s.average}</td></tr>)}</tbody></table>{!rankingRows.length&&<p className="empty-state">暂无排名数据</p>}</section>:filtered.length === 0 ? (
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
              const average = student.runs.length > 0
                ? Math.round(student.runs.reduce((sum, run) => sum + run.overallScore, 0) / student.runs.length)
                : null;
              const latest = student.runs[student.runs.length - 1];
              return (
                <tr key={student.id} onClick={() => setSelected(student)}>
                  <td><b>{student.name}</b></td>
                  <td>{student.className}</td>
                  <td>{student.runs.length} 次</td>
                  <td>{latest ? formatDate(latest.completedAt) : "—"}</td>
                  <td>{average ?? "—"}</td>
                  <td>{latest?.grade
                    ? <span className={`grade-badge is-${latest.grade.toLowerCase()}`}>{latest.grade}</span>
                    : "—"}</td>
                  <td><em className={`src-tag is-${student.source}`}>{sourceLabel(student.source)}</em></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {selected && createPortal(
        <div className="drawer-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <aside className="drawer" role="dialog" aria-label={`学员详情 ${selected.name}`}>
            <header>
              <div>
                <h2>{selected.name}</h2>
                <p>
                  {selected.className} · {selected.runs.length} 次完成
                  {selected.runs.length > 0 && ` · 平均 ${Math.round(selected.runs.reduce((sum, run) => sum + run.overallScore, 0) / selected.runs.length)} 分`}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="关闭学员详情"><X size={18} weight="bold" /></button>
            </header>
            <div className="drawer-body">
              {selected.runs.length > 0 && (
                <div className="drawer-radar">
                  <AbilityProgress key={selected.id} roster={[selected]} showStudentFilter={false} />
                </div>
              )}
              <table className="admin-table">
                <thead>
                  <tr><th>完成时间</th><th>测评类型</th><th>总分</th><th>等级</th><th>趋势</th></tr>
                </thead>
                <tbody>
                  {selected.runs.length === 0 && (
                    <tr><td colSpan={5}>该学员还没有完成记录</td></tr>
                  )}
                  {selected.runs.map((run, index) => {
                    const previous = selected.runs.slice(0, index).filter(item => (item.assessmentId || "comprehensive") === (run.assessmentId || "comprehensive")).at(-1)?.overallScore;
                    const delta = previous === undefined ? null : Math.round((run.overallScore - previous) * 10) / 10;
                    return (
                      <tr key={run.id}>
                        <td>{formatDate(run.completedAt)}</td><td>{assessmentLabel(run.assessmentId)}</td>
                        <td><b>{run.overallScore}</b></td>
                        <td>{run.grade
                          ? <span className={`grade-badge is-${run.grade.toLowerCase()}`}>{run.grade}</span>
                          : "—"}</td>
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
        </div>, document.body
      )}
    </div>
  );
}