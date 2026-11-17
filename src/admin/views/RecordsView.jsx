import { reportFooter } from "../../report-pdf.js";
import { buildLearningPlan } from "../../report-learning-plan.js";
import { generateReportText, reportTemplateText } from "../../report-text.js";
import { renderDimensionGlyphs } from "../../report-charts.js";
import { reportModel } from "../../AwakeningReport.jsx";
import { runReportSnapshot } from "../../server-records.js";
import { chatDeepSeek } from "../../deepseek.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { assessmentLabel } from "../../server-records.js";
import { allRuns } from "../cohort.js";

function formatDateTime(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function RecordsView({ roster, assignments = [], onRefreshRoster }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(20);
  useEffect(()=>{setPage(1);},[query,source,pageSize]);
  const [selected, setSelected] = useState(null);
  const closeButton = useRef(null);
  const [report,setReport]=useState(null);
  useEffect(()=>{let alive=true;setReport(null);if(selected){const snap=runReportSnapshot(selected);if(snap){const model=reportModel(snap),plan=buildLearningPlan(model);setReport({model,plan,footer:reportFooter(model,{nickname:selected.studentName,account:roster.find(s=>s.id===selected.studentId)?.account||selected.studentId}),text:reportTemplateText(model,plan)});generateReportText(model,plan,chatDeepSeek).then(copy=>{if(alive)setReport(r=>({...r,text:copy.text}));}).catch(()=>{});renderDimensionGlyphs(model.dimensions).then(g=>{if(alive&&g)setReport(r=>({...r,image:'data:image/jpeg;base64,'+btoa(Array.from(g.bytes,b=>String.fromCharCode(b)).join(''))}));}).catch(()=>{});}}return()=>{alive=false;};},[selected]);

  useEffect(() => {
    if (!selected) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSelected(null);
      // The close button is the only interactive control inside this dialog.
      if (event.key === "Tab") {
        event.preventDefault();
        closeButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [selected]);

  const runs = useMemo(
    () => allRuns(roster)
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt)),
    [roster],
  );
  const filtered = useMemo(() => runs.filter((run) => {
    if (source === "assigned" && !run.assignmentId) return false;
    if (source === "autonomous" && run.assignmentId) return false;
    if (!query.trim()) return true;
    return run.studentName.includes(query.trim()) || String(run.overallScore).includes(query.trim());
  }), [runs, query, source]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,pageCount);
  const visibleRuns=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const assignmentNames = new Map(assignments.map(a=>[a.id,a.title]));

  return (
    <div className="admin-view">
      <div className="toolbar">
        <label className="search-box">
          <MagnifyingGlass size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索学员或分数" />
        </label>
        <select value={source} onChange={(event) => setSource(event.target.value)} aria-label="按来源筛选">
          <option value="all">全部来源</option>
          <option value="assigned">教师试卷</option>
          <option value="autonomous">自主测评</option>
        </select>
        <span className="toolbar-count">{filtered.length} 条记录</span>
        <button type="button" className="is-ghost" onClick={onRefreshRoster}>
          <ArrowClockwise size={15} weight="bold" /> 刷新数据
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <strong>暂无测评记录</strong>

        </div>
      ) : (
        <table className="admin-table is-hover">
          <thead>
            <tr><th>完成时间</th><th>学员</th><th>班级</th><th>测评类型</th><th>总分</th><th>等级</th><th>六维</th><th>来源</th><th>报告</th></tr>
          </thead>
          <tbody>
            {visibleRuns.map((run) => (
              <tr key={run.id}>
                <td className="is-mono">{formatDateTime(run.completedAt)}</td>
                <td><b>{run.studentName}</b></td>
                <td>{run.className}</td><td>{assessmentLabel(run.assessmentId)}</td>
                <td><b>{run.overallScore}</b></td>
                <td>{run.grade
                  ? <span className={`grade-badge is-${run.grade.toLowerCase()}`}>{run.grade}</span>
                  : "—"}</td>
                <td>
                  <span className="mini-dims" aria-hidden="true">
                    {run.dimensions.map((dim) => <i key={dim.key} style={{ width: `${Math.max(6, dim.score * 0.28)}px` }} title={`${dim.short} ${dim.score}`} />)}
                  </span>
                </td>
                <td><em className={`src-tag is-${run.assignmentId ? "assigned" : "autonomous"}`}>{run.assignmentId ? "教师试卷" : "自主测评"}</em>{run.assignmentId && <span className="record-assignment-title">{assignmentNames.get(run.assignmentId) || "原试卷已不可用"}</span>}</td>
                <td>
                  <button type="button" className="row-edit" onClick={() => setSelected(run)}>查看</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {filtered.length>0&&<nav className="records-pagination" aria-label="测评记录分页"><span>共 {filtered.length} 条 · 第 {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize,filtered.length)} 条</span><label>每页 <select aria-label="每页记录数" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[20,30,50,100].map(n=><option key={n} value={n}>{n} 条</option>)}</select></label><div><button type="button" disabled={currentPage===1} onClick={()=>setPage(1)}>首页</button><button type="button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage} / {pageCount}</span><button type="button" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}>下一页</button><button type="button" disabled={currentPage===pageCount} onClick={()=>setPage(pageCount)}>末页</button></div></nav>}
      {selected && createPortal(
        <div className="drawer-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <div className="edit-dialog is-snapshot" role="dialog" aria-modal="true" aria-label="测评快照">
            <header>
              <div>
                <h2>{selected.studentName} 的测评报告</h2>
                <p>{selected.className} · {assessmentLabel(selected.assessmentId)} · {formatDateTime(selected.completedAt)}{selected.answeredCount != null && selected.totalQuestions != null ? ` · ${selected.answeredCount}/${selected.totalQuestions} 题` : ""}</p>
              </div>
              <button ref={closeButton} type="button" onClick={() => setSelected(null)} aria-label="关闭快照"><X size={18} weight="bold" /></button>
            </header>
            <div className="edit-body inline-student-report">{report?<article><h2>AIQUOS测评报告</h2><p className="report-meta">{[
 '综合得分 '+report.plan.score+' 分（'+report.plan.grade+' 档 · '+report.plan.stage.label+'）',
 report.model.detail?.completedAtText?'完成于 '+report.model.detail.completedAtText:null,
 report.model.detail?.questionCountText?'作答 '+report.model.detail.questionCountText:null,
 report.model.isDemo?'演示数据':null].filter(Boolean).join(' · ')}</p>
 {report.image&&<img src={report.image} alt="六维能力字像" style={{width:'100%',height:'auto'}}/>}
 <h3>一、学员能力评价</h3><p>{report.text.evaluation}</p>
 <h3>二、个性化学习建议</h3><p>{report.text.advice}</p>
 {report.plan.adviceItems.map((item,index)=>{const gap=report.model.recommendations?.priorities?.find(p=>p.key===item.key)?.gap;return <section className="report-advice-item" key={item.key}><h4>{index+1}. {item.name} · {item.score} 分 · {item.gradeLabel}</h4><p>当前水平：{item.overview}{gap?'通道数据还显示「'+gap.title+'」：'+gap.note:''}</p><p>学习行动：{item.practice}</p><p>完成标志：{item.checkpoint}</p></section>})}
 <p>练习节奏：{report.plan.advicePace}</p>
 <h3>三、推荐学习资源</h3><p>{report.text.resources}</p>
 {report.plan.resources.map((r,i)=><section className="report-resource-item" key={i}><h4>{String(i+1).padStart(2,'0')}. {r.title}</h4><p>{r.platform} · {r.type} · {r.stage} 档 · 匹配 {r.matchedDimension} · {r.note}</p><p>{r.url}</p></section>)}
 <footer>{report.footer.text}</footer></article>:<p>暂无可用的报告数据</p>}</div>
          </div>
        </div>, document.body,
      )}
    </div>
  );
}
