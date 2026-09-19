import { ArrowCounterClockwise, Info } from "@phosphor-icons/react";
import { DIFFICULTY_ANCHORS, DIMENSIONS, SCORING_VERSION } from "../../../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

export function SettingsView({ bankMeta, onResetBank }) {
  return (
    <div className="admin-view settings-view">
      <section className="panel">
        <h2>评分模型</h2>
        <dl className="settings-list">
          <div><dt>评分版本</dt><dd>v{SCORING_VERSION}（官方核心，冻结于 vendor/，不在管理端修改）</dd></div>
          <div><dt>难度锚点</dt><dd>低 {DIFFICULTY_ANCHORS.low} · 中 {DIFFICULTY_ANCHORS.medium} · 高 {DIFFICULTY_ANCHORS.high}，N(0,1) 后验能力估计</dd></div>
          <div><dt>等级分界</dt><dd>S ≥ 90 · A ≥ 80 · B ≥ 70 · C ≥ 60 · D &lt; 60；总分 = 六维均值四舍五入</dd></div>
          <div><dt>完成判定</dt><dd>答满 25 题且六个维度均有作答证据</dd></div>
          <div><dt>维度定义</dt><dd>{DIMENSIONS.map((dimension) => `${dimension.name}（${dimension.key}）`).join(" · ")}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <h2>题库与出题</h2>
        <dl className="settings-list">
          <div><dt>当前题库版本</dt><dd className="is-mono">{bankMeta?.bankVersion ?? "读取中"}</dd></div>
          <div><dt>来源</dt><dd>{bankMeta?.source === "override" ? "管理端已覆盖（编辑结果生效中）" : "内置题库"}</dd></div>
          <div><dt>最近发布</dt><dd>{bankMeta?.updatedAt ? new Date(bankMeta.updatedAt).toLocaleString("zh-CN") : "从未发布覆盖"}</dd></div>
          <div><dt>持久化</dt><dd>{bankMeta?.persistent ? "已落盘（worker/bank-overrides.json）" : "内存态（重启后回到内置题库）"}</dd></div>
          <div><dt>出题方式</dt><dd>服务端自适应路由（难度瞄准、维度覆盖、题型连击断路、跨场曝光均衡）</dd></div>
        </dl>
        {bankMeta?.source === "override" && (
          <button type="button" className="is-ghost" onClick={onResetBank}>
            <ArrowCounterClockwise size={15} weight="bold" /> 恢复内置题库
          </button>
        )}
      </section>

      <section className="panel">
        <h2>数据说明</h2>
        <dl className="settings-list">
          <div><dt>学员数据</dt><dd>概览与学员页的班级数据为确定性生成的演示数据；「本机学员」来自这台机器上学生端的真实完成记录。</dd></div>
          <div><dt>学生端存储</dt><dd className="is-mono">aiquos.comprehensive-attempt.v1 / aiquos.comprehensive-history.v1 / aiquos.adaptive-exposure.v1</dd></div>
          <div><dt>管理端口令</dt><dd>本地演示口令 admin，仅前端校验，无真实账号体系。</dd></div>
          <div><dt>版本契约</dt><dd>每次保存题库自动晋升版本；进行中的学生草稿按新版本续跑，历史快照保留原版本可查。</dd></div>
        </dl>
      </section>

      <p className="overview-foot">
        <Info size={14} weight="fill" />
        本控制台与学生端同源同设计体系，接口同走 worker；接入真实账号与数据库时替换 src/admin/ 的数据层即可。
      </p>
    </div>
  );
}
