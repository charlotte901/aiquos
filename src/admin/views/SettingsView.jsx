import { ArrowCounterClockwise, Info } from "@phosphor-icons/react";
import { DIFFICULTY_ANCHORS, DIMENSIONS, SCORING_VERSION } from "../../../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

export function SettingsView({ bankMeta, dataStatus, dataError, teacher, onResetBank }) {
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
          <div><dt>数据链路</dt><dd>{dataStatus === "ready"
            ? "服务端实时：学生登录后完成综合测评，成绩摘要（总分/六维/题库版本）经 /api/data/runs 上报，本页与概览、学员、组卷中心共用这一份数据。"
            : `服务端暂不可达（${dataError ?? "未知错误"}），当前为离线演示名册。`}</dd></div>
          <div><dt>教师账号</dt><dd>{teacher ? `${teacher.nickname}（${teacher.account}）· 服务端校验，PBKDF2 密码哈希，HMAC 会话令牌` : "—"}</dd></div>
          <div><dt>组卷推送</dt><dd>组卷中心下发的试卷实时出现在学生端「老师推送」区；学生完成后该作业的完成名单与均分自动回填。</dd></div>
          <div><dt>学生端存储</dt><dd className="is-mono">aiquos.comprehensive-attempt.v1 / aiquos.comprehensive-history.v1 / aiquos.adaptive-exposure.v1 / aiquos.auth.v1</dd></div>
          <div><dt>版本契约</dt><dd>每次保存题库自动晋升版本；进行中的学生草稿按新版本续跑，历史快照保留原版本可查。</dd></div>
        </dl>
      </section>

      <p className="overview-foot">
        <Info size={14} weight="fill" />
        本控制台与学生端同源同设计体系，接口同走 worker；账号与学生数据在 dev 下落盘于 worker/auth-accounts.json 与 worker/aiquos-shared-data.json（gitignored）。
      </p>
    </div>
  );
}
