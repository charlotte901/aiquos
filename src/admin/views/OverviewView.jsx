import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Sparkle } from "@phosphor-icons/react";
import {
  dimensionAverages,
  gradeDistribution,
  overviewKpis,
  weeklyTrend,
} from "../stats.js";
import { allRuns } from "../cohort.js";

const GRADE_COLORS = { S: "var(--grade-s)", A: "var(--grade-a)", B: "var(--grade-b)", C: "var(--grade-c)", D: "var(--grade-d)" };

function formatDate(iso) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function OverviewView({ roster, bankMeta }) {
  const kpis = useMemo(() => overviewKpis(roster), [roster]);
  const grades = useMemo(() => gradeDistribution(roster), [roster]);
  const dims = useMemo(() => dimensionAverages(roster), [roster]);
  const trend = useMemo(() => weeklyTrend(roster), [roster]);
  const recent = useMemo(
    () => allRuns(roster).sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, 6),
    [roster],
  );
  const gradeTotal = Object.values(grades).reduce((sum, count) => sum + count, 0) || 1;
  const maxTrend = Math.max(1, ...trend.map((bucket) => bucket.count));
  const weakest = [...dims].sort((left, right) => left.average - right.average)[0];
  const strongest = [...dims].sort((left, right) => right.average - left.average)[0];

  return (
    <div className="admin-view">
      <section className="kpi-grid" aria-label="关键指标">
        {[
          { label: "在册学员", value: kpis.studentCount, hint: "含演示班级与本机真实作答" },
          { label: "累计完成测评", value: kpis.runCount, hint: "综合测评完整通关" },
          { label: "平均总分", value: kpis.averageOverall, hint: "全部完成记录的均分" },
          { label: "近 7 天完成", value: kpis.weeklyCompletions, hint: "本周新增完成数" },
        ].map((item) => (
          <article key={item.label} className="kpi-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.hint}</small>
          </article>
        ))}
      </section>

      <div className="overview-columns">
        <section className="panel" aria-label="等级分布">
          <h2>等级分布</h2>
          <div className="grade-bars">
            {Object.entries(grades).map(([grade, count]) => (
              <div key={grade} className="grade-row">
                <b style={{ background: GRADE_COLORS[grade] }}>{grade}</b>
                <div className="grade-track"><i style={{ width: `${Math.round((count / gradeTotal) * 100)}%`, background: GRADE_COLORS[grade] }} /></div>
                <span>{count} 次 · {Math.round((count / gradeTotal) * 100)}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" aria-label="六维平均分">
          <h2>六维平均分</h2>
          <ul className="dim-averages">
            {dims.map((dim) => (
              <li key={dim.key}>
                <span title={dim.name}>{dim.short}</span>
                <div className="grade-track"><i style={{ width: `${dim.average}%` }} /></div>
                <b>{dim.average}</b>
              </li>
            ))}
          </ul>
          <p className="panel-note">
            {weakest && strongest && (
              <>最待提升：<b>{weakest.name}（{weakest.average}）</b>，最强项：<b>{strongest.name}（{strongest.average}）</b></>
            )}
          </p>
        </section>

        <section className="panel" aria-label="完成趋势">
          <h2>近 8 周完成趋势</h2>
          <div className="trend-chart" role="img" aria-label="每周完成测评数量柱状图">
            {trend.map((bucket) => (
              <div key={bucket.label} className="trend-col" title={`${bucket.label}：${bucket.count} 次${bucket.average !== null ? `，均分 ${bucket.average}` : ""}`}>
                <i style={{ height: `${Math.max(4, Math.round((bucket.count / maxTrend) * 100))}%` }} />
                <span>{bucket.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" aria-label="最近完成">
          <h2>最近完成</h2>
          <table className="admin-table">
            <thead>
              <tr><th>学员</th><th>时间</th><th>总分</th><th>等级</th><th>来源</th></tr>
            </thead>
            <tbody>
              {recent.map((run) => (
                <tr key={run.id}>
                  <td>{run.studentName}</td>
                  <td>{formatDate(run.completedAt)}</td>
                  <td><b>{run.overallScore}</b></td>
                  <td><span className={`grade-badge is-${run.grade.toLowerCase()}`}>{run.grade}</span></td>
                  <td><em className={`src-tag is-${run.source}`}>{run.source === "local" ? "本机真实" : "演示班级"}</em></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {bankMeta && (
        <p className="overview-foot">
          <Sparkle size={14} weight="fill" />
          出题引擎：自适应（服务端路由） · 评分模型 v1.0.0 · 题库 {bankMeta.bankVersion}（{bankMeta.source === "override" ? "管理端已覆盖" : "内置"}）
        </p>
      )}
    </div>
  );
}
