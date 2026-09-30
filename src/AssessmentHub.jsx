import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChalkboardTeacher, ClockCountdown, SealCheck } from "@phosphor-icons/react";
import { TestWordmark } from "./TestWordmark";
import { useStageSize } from "./DesignStage";
import { EDITIONS, readEdition, writeEdition } from "./bank-editions";
import { authFetch, readProfile } from "./auth-client";
import {
  ASSESSMENTS,
  ASSESSMENT_ART,
  getAssessmentLayout,
} from "./assessment-layout";

export function SourceCrop({ crop, className = "", source = ASSESSMENT_ART, width = 1672, height = 941 }) {
  return (
    <span
      className={`source-crop ${className}`}
      style={{ aspectRatio: `${crop[2]} / ${crop[3]}` }}
      aria-hidden="true"
    >
      <img
        src={source}
        alt=""
        draggable="false"
        style={{
          width: `${(width / crop[2]) * 100}%`,
          height: `${(height / crop[3]) * 100}%`,
          left: `${(-crop[0] / crop[2]) * 100}%`,
          top: `${(-crop[1] / crop[3]) * 100}%`,
        }}
      />
    </span>
  );
}

function formatDue(dueAt) {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日前完成`;
}

/**
 * 教师推送的组卷作业。登录后拉取 /api/data/assignments：老师从管理端
 * 「组卷中心」下发，学生在这里看到并直接进入对应的综合能力测评；
 * 完成后（成绩上报）这里会显示已完成与得分。
 */
function AssignmentBoard({ assignments, onAssign, busy }) {
  if (assignments.length === 0) return null;
  const pending = assignments.filter((item) => !item.myRun);
  const done = assignments.filter((item) => item.myRun);
  return (
    <section className="assessment-assignments" aria-label="教师推送的测评试卷">
      <header className="assessment-assignments-head">
        <ChalkboardTeacher size={20} weight="duotone" aria-hidden="true" />
        <div>
          <strong>老师推送的综合能力测评</strong>
          <span>按老师指定的题库作答，完成后成绩会同步给老师</span>
        </div>
        <em>{pending.length > 0 ? `${pending.length} 份待完成` : "全部完成"}</em>
      </header>
      <ul className="assessment-assignments-list">
        {[...pending, ...done].map((item) => (
          <li key={item.id} className={`assignment-card${item.myRun ? " is-done" : ""}${item.status === "closed" ? " is-closed" : ""}`}>
            <div className="assignment-card-main">
              <strong>{item.title}</strong>
              {item.note && <p>{item.note}</p>}
              <div className="assignment-card-meta">
                <span>{item.createdBy} 下发</span>
                <span>{EDITIONS[item.edition]?.label ?? "精选版"}题库</span>
                {item.dueAt && (
                  <span className="assignment-due"><ClockCountdown size={13} aria-hidden="true" /> {formatDue(item.dueAt)}</span>
                )}
              </div>
            </div>
            {item.myRun ? (
              <div className="assignment-card-status" aria-label="已完成">
                <SealCheck size={22} weight="fill" aria-hidden="true" />
                <strong>{Math.round(item.myRun.overallScore)} 分</strong>
                <span>{item.myRun.grade ? `${item.myRun.grade} 级` : "已完成"}</span>
              </div>
            ) : (
              <button
                type="button"
                className="assignment-start"
                onClick={() => onAssign(item)}
                disabled={busy || item.status === "closed"}
              >
                {item.status === "closed" ? "已截止" : "开始作答"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AssessmentHub({ onBack, onStart, onAssign, busy, active = true }) {
  const size = useStageSize();
  const [selected, setSelected] = useState(null);
  // 题库版本：切换后立刻生效，三个通道（客观/对话/实操）与综合测评都跟随。
  const [edition, setEdition] = useState(() => readEdition());
  // 教师推送：登录才有；未登录/离线时静默隐藏，不打扰匿名体验。
  const [assignments, setAssignments] = useState([]);
  const layout = getAssessmentLayout(size.width, size.height);
  const chooseEdition = (id) => {
    setEdition(id);
    writeEdition(id);
  };
  // 面板常驻挂载（hidden 切换视图），effect 不能只在应用启动时跑一次：
  // 登录发生在启动之后。以 active 为依赖，每次进入 TEST 页重新拉取，
  // 刚下发的作业无需刷新即可看到。
  useEffect(() => {
    if (!active) return undefined;
    if (!readProfile()) {
      setAssignments([]);
      return undefined;
    }
    let alive = true;
    authFetch("/api/data/assignments")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (alive && Array.isArray(payload?.assignments)) setAssignments(payload.assignments);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active]);
  return (
    <main
      className="assessment-screen"
      data-compact={layout.compact}
      style={layout.variables}
      aria-label="选择测评方式"
    >
      <button className="assessment-back" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} /> 返回选择
      </button>
      <div className="assessment-layout">
        <h1
          className="assessment-wordmark"
          tabIndex={-1}
          aria-label="TEST! 选择你的测评方式"
        >
          <TestWordmark />
        </h1>

        {/* 教师推送的作业：置于自选测评之前——老师布置的优先于自由练习。 */}
        <AssignmentBoard assignments={assignments} onAssign={onAssign} busy={busy} />

        {/* 题库版本切换：放在卡片上方，学员先决定题池再进测评。 */}
        <div className="assessment-editions" role="group" aria-label="题库版本">
          {Object.values(EDITIONS).map((item) => (
            <button
              key={item.id}
              type="button"
              className="assessment-edition"
              aria-pressed={edition === item.id}
              disabled={busy}
              onClick={() => chooseEdition(item.id)}
            >
              <strong>{item.label}</strong>
              <span>
                客观 {item.counts.objective} · 实操 {item.counts.practical}
              </span>
            </button>
          ))}
        </div>

        <div className="assessment-grid" role="group" aria-label="测评类型">
          {ASSESSMENTS.map((item) => (
            <button
              key={item.id}
              className="assessment-card"
              aria-label={`${item.title} · ${item.subtitle}`}
              aria-pressed={selected === item.id}
              onClick={() => {
                setSelected(item.id);
                onStart?.(item.id);
              }}
              disabled={busy}
            >
              <SourceCrop crop={item.crop} />
              {item.id === "comprehensive" && (
                <span className="assessment-title-overlay" aria-hidden="true">
                  <strong>{item.title}</strong>
                  <i />
                  <small>{item.subtitle}</small>
                </span>
              )}
              {selected === item.id && (
                <span className="assessment-check">
                  <Check size={18} weight="bold" />
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="assessment-selection" role="status">
          {selected
            ? `已选择 · ${ASSESSMENTS.find((item) => item.id === selected).title} · ${EDITIONS[edition].label}`
            : `${EDITIONS[edition].label}题库 · 选择一种测评方式开始`}
        </p>
      </div>
    </main>
  );
}
