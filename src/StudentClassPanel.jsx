import { useEffect, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { authFetch, apiMe } from "./auth-client.js";

async function dataRequest(path, body) {
  const response = await authFetch(path, body === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "班级数据暂时不可用");
  return data;
}

export function StudentClassPanel({ active }) {
  const [data, setData] = useState(null);
  const [code, setCode] = useState("");
  const [found, setFound] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setData(null);
    dataRequest("/api/data/me").then((next) => { if (alive) setData(next); })
      .catch((error) => { if (alive) setNotice(error.message); });
    return () => { alive = false; };
  }, [active]);
  async function search(event) {
    event.preventDefault(); setBusy(true); setNotice(""); setFound(null);
    try { setFound((await dataRequest(`/api/data/classes?code=${encodeURIComponent(code.trim())}`)).class); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function membership(body) {
    setBusy(true); setNotice("");
    try { setData(await dataRequest("/api/data/classes", body)); setFound(null); await apiMe(); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  const stats = data?.classStats;
  const maxBin = Math.max(1, ...(stats?.scoreBins || []).map((bin) => bin.people));
  return <section className="profile-detail-panel organization-panel student-class-panel" aria-label="我的组织">
    <header className="detail-panel-head organization-head">
      <div className="organization-title"><p>MY ORGANIZATION</p><h1>我的组织</h1>
        <span>{stats ? `${stats.className} · ${stats.term || "服务端班级"}` : data ? "尚未加入班级" : "正在读取班级…"}</span></div>
      <form className="class-code-form" onSubmit={search}><div className="class-code-field">
        <input aria-label="班级口令" placeholder="输入班级口令" value={code} onChange={(event) => setCode(event.target.value)} />
        <button aria-label="搜索班级" title="搜索班级" disabled={busy || !code.trim()}><MagnifyingGlass size={19} weight="bold" /></button></div>
        {stats && <button className="class-exit-button" type="button" disabled={busy} onClick={() => membership({ leave: true })}>退出班级</button>}
      </form>
    </header>
    <div className="class-search-area" role="status">{notice && <p className="class-notice">{notice}</p>}
      {found && <div className="class-search-result"><div><strong>{found.name}</strong><small>{found.students} 人</small></div>
        <button disabled={busy || found.name === stats?.className} onClick={() => membership({ code: found.code })}>{found.name === stats?.className ? "已加入" : "加入班级"}</button></div>}
    </div>
    {stats && <><div className="class-info-grid">{[
      ["班级人数", `${stats.studentCount} 人`], ["我的平均分", stats.myAverage === null ? "暂无" : `${stats.myAverage} 分`],
      ["班级平均分", stats.classAverage === null ? "暂无" : `${stats.classAverage} 分`],
      ["我的班级排名", stats.myRank === null ? "暂无成绩" : `第 ${stats.myRank} 名`],
    ].map(([label, value]) => <article key={label}><strong>{label}</strong><span>{value}</span></article>)}</div>
      <div className="rank-chart" role="img" aria-label={`班级平均分分布：我的平均分 ${stats.myAverage ?? "暂无"}，排名 ${stats.myRank ?? "暂无"}，共 ${stats.rankedCount} 人有成绩。`}>
        {stats.myAverage !== null && <div className="rank-callout" style={{ left: `${stats.myAverage}%` }}>
          <span>我的均分：{stats.myAverage}</span><small>班级均分：{stats.classAverage}</small>
        </div>}
        <div className="rank-bars">{(stats.scoreBins || []).map((bin) => <i key={bin.score} className={bin.current ? "is-current" : undefined}
          style={{ "--rank-height": `${bin.people / maxBin * 100}%` }}><b>{bin.people}</b></i>)}
          {stats.myAverage !== null && <em style={{ left: `${stats.myAverage}%` }} aria-hidden="true" />}
        </div>
        <div className="rank-scale" aria-hidden="true">{(stats.scoreBins || []).map((bin) => <span key={bin.score} className={bin.current ? "is-current" : undefined}>{bin.score}</span>)}</div>
        {stats.myAverage !== null && <div className="rank-track" aria-hidden="true"><i style={{ width: `${stats.myAverage}%` }} /><b style={{ left: `${stats.myAverage}%` }} /></div>}
        <div className="rank-result"><span>班级排名</span><strong>{stats.myRank ?? "—"}<small>/{stats.rankedCount}</small></strong></div>
      </div>
      </>}
  </section>;
}
