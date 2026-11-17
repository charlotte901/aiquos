import { ArrowCounterClockwise, Info } from "@phosphor-icons/react";
import { DIFFICULTY_ANCHORS, DIMENSIONS, SCORING_VERSION } from "../../../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

export function SettingsView({ bankMeta, dataStatus, dataError, teacher, onResetBank }) {
  return (
    <div className="admin-view settings-view">
      <section className="panel">
        <h2>评分模型</h2>
        <dl className="settings-list">
          <div><dt>评分版本</dt><dd>v{SCORING_VERSION}</dd></div>

          <div><dt>等级分界</dt><dd>S ≥ 90 · A ≥ 80 · B ≥ 70 · C ≥ 60 · D &lt; 60</dd></div>

          <div><dt>维度定义</dt><dd>{DIMENSIONS.map((dimension) => `${dimension.name}（${dimension.key}）`).join(" · ")}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <h2>题库与出题</h2>
        <dl className="settings-list">
          <div><dt>当前题库版本</dt><dd className="is-mono">{bankMeta?.bankVersion ?? "读取中"}</dd></div>
          <div><dt>来源</dt><dd>{bankMeta?.source === "override" ? "已发布题库" : "内置题库"}</dd></div>
          <div><dt>最近发布</dt><dd>{bankMeta?.updatedAt ? new Date(bankMeta.updatedAt).toLocaleString("zh-CN") : "暂无发布记录"}</dd></div>
          <div><dt>持久化</dt><dd>{bankMeta?.persistent ? "已保存" : "临时保存，重启后恢复内置题库"}</dd></div>
          <div><dt>出题方式</dt><dd>自适应出题</dd></div>
        </dl>
        {bankMeta?.source === "override" && (
          <button type="button" className="is-ghost" onClick={onResetBank}>
            <ArrowCounterClockwise size={15} weight="bold" /> 恢复内置题库
          </button>
        )}
      </section>

      <section className="panel">
        <h2>账号与同步状态</h2>
        <dl className="settings-list">
          <div><dt>数据状态</dt><dd>{dataStatus === "ready"
            ? "已同步"
            : `服务端暂不可达（${dataError ?? "未知错误"}），当前为离线演示名册。`}</dd></div>
          <div><dt>管理账号</dt><dd>{teacher ? `${teacher.nickname}（${teacher.account}）` : "—"}</dd></div>
          <div><dt>组卷推送</dt><dd>下发后学生可作答，完成情况自动更新。</dd></div>


        </dl>
      </section>


    </div>
  );
}
