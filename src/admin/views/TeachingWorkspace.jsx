const TEACHING_ACTIVITIES = {
 D1:{goal:'区分模型生成、事实检索与规则计算，说明 AI 输出需要人工核验的原因。',steps:['5 分钟：独立判断“编写摘要、查询实时信息、精确计算”分别适合怎样完成，并写出理由。','15 分钟：两人一组核查一段 AI 回答，圈出事实、推断和无法验证的内容。','10 分钟：各组选择一个错误，展示核验来源并说明修正方法。'],output:'提交一份标注后的回答和一张“适用场景—限制—核验方式”表。',check:'能解释至少两项能力边界；引用可查来源；修正错误时说明依据。'},
 D2:{goal:'将模糊要求改写为包含任务、材料、约束和输出格式的提示词。',steps:['5 分钟：使用同一条模糊提示词，记录输出中缺失或偏离要求的部分。','15 分钟：补齐目标、背景和格式，保留两轮修改前后的提示词与回答。','10 分钟：交换提示词，由同伴按相同要求复测，讨论结果是否稳定。'],output:'提交提示词初稿、两轮修改记录，以及输出对照表。',check:'每次修改对应一个具体问题；最终输出符合约束；能说明仍需人工处理的部分。'},
 D3:{goal:'依据任务需求选择工具，并独立完成输入、操作、导出和结果检查。',steps:['5 分钟：明确一个共同任务，例如从给定材料提取信息并制作对照表。','15 分钟：用两种可用工具分别完成任务，记录操作步骤、耗时和输出差异。','10 分钟：检查遗漏与格式问题，选择适合的工具并说明取舍。'],output:'提交两个工具的结果、关键操作记录和工具选择理由。',check:'结果覆盖给定材料；可以按记录复现；选择理由涉及准确性、操作成本和适用限制。'},
 D4:{goal:'建立核验清单，识别 AI 输出中的事实错误、遗漏和不确定表述。',steps:['5 分钟：阅读一份待核验回答，先独立标记存疑内容。','15 分钟：逐条查找依据，记录原说法、来源、判断和修正建议。','10 分钟：小组互审，对证据不足的条目保留“不确定”结论。'],output:'提交核验表与修订后的回答，保留引用链接或材料页码。',check:'关键事实有依据；推断与事实区分明确；不把无法确认的内容写成确定结论。'},
 D5:{goal:'合理安排人工与 AI 的分工，通过检查和反馈完成一次协作迭代。',steps:['5 分钟：将共同任务拆成资料整理、初稿、核验和定稿，标明负责人。','15 分钟：按分工协作，记录 AI 建议、人工判断及每次修改的原因。','10 分钟：交叉检查成果，复盘一次采纳建议和一次拒绝建议的依据。'],output:'提交任务分工表、迭代记录和最终成果。',check:'每个环节有责任人；重要结论经过人工核验；能说明 AI 在何处提高效率、何处需要限制。'},
 D6:{goal:'识别隐私、版权和偏见风险，形成任务开始前可执行的检查步骤。',steps:['5 分钟：阅读含个人信息、图片引用与群体描述的三个案例，独立标记风险。','15 分钟：分组进行脱敏、来源核对和措辞修订，并解释每项处理的目的。','10 分钟：交换修订结果，用“是否必要、是否获准、是否可追溯”逐项检查。'],output:'提交案例修订稿及一份隐私、引用和偏见检查表。',check:'不保留无关个人信息；标明引用来源及使用条件；避免没有依据的群体概括。'}
};
import { AbilityProgress } from './AbilityProgress.jsx';
import { useState, useRef } from 'react';
import { allRuns } from '../cohort.js';
import { dimensionAverages } from '../stats.js';
import { assessmentLabel } from '../../server-records.js';
const mean = (values) => values.length ? (values.reduce((a,b)=>a+b,0)/values.length).toFixed(2) : '—';
const scoreValues = (runs) => runs.map(r=>r.overallScore).filter(Number.isFinite);
function Metrics({ items }) { return <div className="kpi-grid">{items.map(([label,value,hint])=><article className="kpi-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>; }
export function TeachingWorkspace({ mode, roster, teacherData, onNavigate }) {
  const [className,setClassName]=useState('all');
  const [channel,setChannel]=useState('all');
  const [tab,setTab]=useState('overview');
  const classes=[...new Set(roster.map(s=>s.className).filter(Boolean))];
  const members=roster.filter(s=>className==='all'||s.className===className);
  const filtered=members.map(s=>({...s,runs:s.runs.filter(r=>channel==='all'||(r.assessmentId||'comprehensive')===channel)}));
  const runs=allRuns(filtered);
  const dims=dimensionAverages(filtered).map(d=>({...d,available:runs.some(r=>r.dimensions.some(x=>x.key===d.key&&Number.isFinite(x.score)))}));
  const ranked=filtered.map(s=>({...s,average:mean(scoreValues(s.runs))})).filter(s=>s.average!=='—').sort((a,b)=>Number(b.average)-Number(a.average));
  const title={classes:'班级与学情',analytics:'能力与成长分析',teaching:'能力提升与跟进'}[mode];
  const description={classes:'统一查看班级信息、能力画像与测评对比。',analytics:'在同一范围内对比六维能力、测评通道和学员排名。',teaching:'根据测评表现安排练习，并跟进下一轮复测。'}[mode];
  return <div className="admin-view teaching-workspace">
    <section className="teacher-hero"><div><span className="teacher-eyebrow">{mode === "classes" ? "班级管理" : mode === "analytics" ? "学情研究" : "能力管理"}</span><h2>{title}</h2></div></section>
    <div className="toolbar"><label>班级 <select aria-label="选择分析班级" value={className} onChange={e=>setClassName(e.target.value)}><option value="all">全部班级</option>{classes.map(c=><option key={c}>{c}</option>)}</select></label>{(mode==='teaching'||(mode==='classes'&&['channels','ranking'].includes(tab)))&&<label>测评 <select aria-label="选择分析测评" value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">全部测评</option>{['conversation','objective','practical','comprehensive'].map(c=><option value={c} key={c}>{assessmentLabel(c)}</option>)}</select></label>}<span className="toolbar-count">{members.length} 位学员 · {runs.length} 条记录</span></div>
    {mode==='classes' && <Metrics items={[["在册学员",members.length,'当前班级范围'],['已完成测评',runs.length,'当前测评类型'],['记录平均分',mean(scoreValues(runs)),'每条完成记录等权'],['有成绩学员',ranked.length,'至少一条有效成绩']]} />}
    {mode==='classes'&&<div className="teacher-tabs" role="tablist" aria-label="班级空间视图">{[['overview','班级概况'],['dimensions','能力画像'],['channels','通道对比']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?'is-active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>}
    {mode==='classes'&&tab==='overview'&&<><div className="teacher-card-grid">{classes.filter(c=>className==='all'||c===className).map(c=>{const group=roster.filter(s=>s.className===c);const records=allRuns(group).filter(r=>channel==='all'||(r.assessmentId||'comprehensive')===channel);const detail=teacherData?.classDetails?.find(d=>d.name===c);return <section className="panel teacher-class-card" key={c}><h2>{c}</h2><p>{detail?.teacherName||'班级学员'}{detail?.term?` · ${detail.term}`:''}</p><div className="teacher-class-numbers"><strong>{group.length}<small>学员</small></strong><strong>{records.length}<small>测评记录</small></strong><strong>{mean(scoreValues(records))}<small>记录均分</small></strong></div>{detail?.code&&<p>班级口令：<b>{detail.code}</b></p>}</section>})}</div></>}
    {mode==='classes'&&tab!=='overview'&&<><section className={`panel analytics-content ${tab === "dimensions" ? "is-portrait" : ""}`}>{tab==='dimensions'?<AbilityProgress roster={members} initialType={channel==='all'?'comprehensive':channel} key={channel}/>:tab==='channels'?<><h2>四种测评对比</h2><ChannelCards runs={runs}/></>:null}</section></>}
    {mode==='teaching'&&<><section className="panel"><h2>能力提升建议</h2><div className="teacher-card-grid">{dims.filter(d=>d.available).sort((a,b)=>a.average-b.average).slice(0,3).map((d,i)=><article className="teacher-advice" key={d.key}><span>关注重点 0{i+1}</span><h3>{d.name}</h3><strong>{d.average}<small> / 100</small></strong><div className="teaching-activity-detail"><h4>提升目标</h4><p>{TEACHING_ACTIVITIES[d.key].goal}</p><h4>专项练习参考</h4><ol>{TEACHING_ACTIVITIES[d.key].steps.map(step=><li key={step}>{step}</li>)}</ol><h4>成果要求</h4><p>{TEACHING_ACTIVITIES[d.key].output}</p><h4>验收标准</h4><p>{TEACHING_ACTIVITIES[d.key].check}</p><h4>分层练习</h4><p>{d.average<60?'优先安排基础示例练习，检查通过后再增加独立任务。':d.average<80?'先独立完成基础任务，再增加一项限制条件复练。':'增加材料冲突或多工具协作任务，要求解释方案取舍。'}</p></div></article>)}</div>{!runs.length&&<p className="empty-state">暂无测评数据，完成测评后可查看提升建议。</p>}</section><section className="panel"><h2>管理跟进安排</h2><div className="teaching-followup-grid">{[
 ['01','确定跟进对象','结合当前班级的薄弱维度和个人测评记录，整理需要重点跟进的学员。区分尚未完成测评、基础能力待补强和成绩波动较大的情况。'],
 ['02','安排专项任务','按待提升维度选择练习材料，明确成果要求和完成期限。基础较弱的学员先做单项任务，已有基础的学员增加限制条件或综合任务。'],
 ['03','检查完成质量','核查任务是否按期完成，并检查操作记录、引用依据和修改理由。对未完成或成果不达要求的情况记录原因，调整后续任务。'],
 ['04','复测与调整','安排同类型复测，对照同一学员前后成绩和六维变化。结合任务成果判断是否继续跟进，避免仅凭单次分数调整安排。']
 ].map(([n,title,body])=><article key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div></section></>}
    {mode==='teaching'&&<TeachingNotes key={className} className={className}/>}
    {!members.length&&<div className="empty-state">当前范围暂无学员，可先在学员管理中查看名册。</div>}
  </div>;
}
function ChannelCards({runs}) {return <div className="teacher-channel-grid">{['conversation','objective','practical','comprehensive'].map(c=>{const rows=runs.filter(r=>(r.assessmentId||'comprehensive')===c);return <article key={c}><span>{assessmentLabel(c)}</span><strong>{mean(scoreValues(rows))}</strong><small>{rows.length} 条完成记录 · 平均分</small><div className="grade-track"><i style={{width:`${rows.length?mean(scoreValues(rows)):0}%`}}/></div></article>})}</div>;}

function TeachingNotes({className}) {
 const account=(()=>{try{return JSON.parse(localStorage.getItem('aiquos.admin-auth.v1'))?.profile?.accountId||'local';}catch{return 'local';}})();
 const storageKey='aiquos.admin-teaching-notes.v1:'+account+':'+className;
 const blank=()=>({id:crypto.randomUUID(),text:'',title:'',color:'pink'});
 const [notes,setNotes]=useState(()=>{try{const old=JSON.parse(localStorage.getItem(storageKey));return Array.isArray(old?.notes)&&old.notes.length?old.notes:old?.text?[{...blank(),text:old.text}]:[blank()];}catch{return [blank()];}});
 const [status,setStatus]=useState(''),[dragged,setDragged]=useState(null),[dropTarget,setDropTarget]=useState(null),[offset,setOffset]=useState({x:0,y:0});
 const drag=useRef(null);
 function reorder(from,to){if(!from||!to||from===to)return;setNotes(items=>{const next=[...items],a=next.findIndex(n=>n.id===from),b=next.findIndex(n=>n.id===to);if(a<0||b<0)return items;const [note]=next.splice(a,1);next.splice(b,0,note);return next;});setStatus('未保存');}
 function finishDrag(cancel=false){const current=drag.current;if(current&&!cancel)reorder(current.id,current.target);drag.current=null;setDragged(null);setDropTarget(null);setOffset({x:0,y:0});}

 const edit=(id,patch)=>{setNotes(items=>items.map(n=>n.id===id?{...n,...patch}:n));setStatus('未保存');};
 function save(){try{localStorage.setItem(storageKey,JSON.stringify({notes,updatedAt:new Date().toISOString()}));setStatus('已保存');}catch{setStatus('保存失败，请复制笔记后重试');}}
 return <section className="panel sticky-board"><header className="sticky-board-heading"><div><h2>管理笔记</h2><p>{className==='all'?'全部班级':className}</p></div><button type="button" className="sticky-add" onClick={()=>{setNotes(n=>[...n,blank()]);setStatus('未保存');}}>＋ 新建便签</button></header><div className="sticky-note-grid">{notes.map((n,i)=><article data-note-id={n.id} className={'sticky-note is-'+n.color+(dragged===n.id?' is-dragging':'')+(dropTarget===n.id?' is-drop-target':'')} style={dragged===n.id?{transform:'translate('+offset.x+'px,'+offset.y+'px) rotate(-2deg)'}:undefined} key={n.id}><div className="sticky-note-top"><button type="button" className="sticky-drag-handle" aria-label={'移动便签'+(i+1)} title="拖动排序，也可用方向键移动" onKeyDown={e=>{if(e.key==='Escape'){finishDrag(true);return;}if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();const target=notes[i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)];if(target)reorder(n.id,target.id);}}} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:n.id,x:e.clientX,y:e.clientY,target:null};}} onPointerMove={e=>{const current=drag.current;if(!current||current.id!==n.id)return;const x=e.clientX-current.x,y=e.clientY-current.y;if(Math.hypot(x,y)<6&&!dragged)return;setDragged(n.id);setOffset({x,y});const target=document.elementsFromPoint(e.clientX,e.clientY).map(el=>el.closest('[data-note-id]')).find(el=>el&&el.dataset.noteId!==n.id);current.target=target?.dataset.noteId||null;setDropTarget(current.target);if(e.clientY<70)window.scrollBy(0,-16);else if(e.clientY>window.innerHeight-70)window.scrollBy(0,16);}} onPointerUp={()=>finishDrag()} onPointerCancel={()=>finishDrag(true)}>⠿ <span>便签 {String(i+1).padStart(2,'0')}</span></button><button type="button" aria-label={'移除便签'+(i+1)} onClick={()=>{setNotes(items=>items.filter(item=>item.id!==n.id));setStatus('未保存');}}>×</button></div><input aria-label={'便签'+(i+1)+'标题'} placeholder="写个标题" maxLength={60} value={n.title} onChange={e=>edit(n.id,{title:e.target.value})}/><textarea aria-label={'便签'+(i+1)+'内容'} placeholder="记下待办、观察或下一步安排…" maxLength={20000} value={n.text} onChange={e=>edit(n.id,{text:e.target.value})}/><div className="sticky-note-bottom"><div className="sticky-colors" aria-label="便签颜色">{[['pink','粉色'],['yellow','米黄'],['mint','薄荷绿'],['lilac','浅紫']].map(([color,label])=><button type="button" key={color} className={'note-color is-'+color} aria-label={label} aria-pressed={n.color===color} onClick={()=>edit(n.id,{color})}/>)}</div><span>{n.text.length} 字</span></div></article>)}</div><footer className="sticky-board-footer"><button type="button" onClick={save}>保存笔记</button><span role="status">{status}</span><small>保存在当前浏览器</small></footer></section>;
}
