// 测评流程编排器：关卡地图、选卷入口与 AssessmentTask（三阶段状态机外壳）。
// 各阶段组件在 ./assessment-flow/ 下；共享构件在 ./assessment-flow/flow-shared.jsx。
// 2026-11 拆分：纯移动，逻辑零改动。
import { ArrowLeft, ArrowRight, ChalkboardTeacher, Check } from "@phosphor-icons/react";
import { Task3DCharacter } from "./Task3DCharacter";
import { TestWordmark } from "./TestWordmark";
import { ASSESSMENT_THEMES, STAGE_LABELS, getStageMode } from "./assessment-flow";
import { COMPREHENSIVE_PHASES, phaseCount } from "./assessment-timing";
import { CharacterTuner } from "./character-tuner";
import {  } from "./interviewer";
import { useStageLayout, stageLayoutVars } from "./stage-layout-store";
import { StageLayoutTuner } from "./stage-layout-tuner";
import { Progress, Guides, TaskHeader, useSettledAfterAnimation } from "./assessment-flow/flow-shared";
import { InterviewPhase } from "./assessment-flow/interview-phase";
import { AdaptiveObjectivePhase } from "./assessment-flow/objective-phase";
import { PracticalWorkbenchPhase } from "./assessment-flow/practical-phase";

export function AssessmentMap({ id, current, complete, onBack, onOpenStage, busy, resume = null }) {
  const theme = ASSESSMENT_THEMES[id];
  const total = phaseCount(id);
  const stageLabels = id === "comprehensive"
    ? COMPREHENSIVE_PHASES.map((phase) => phase.label)
    : STAGE_LABELS;
  const resumeStarted = resume?.startedAt
    ? new Date(resume.startedAt)
    : null;
  const resumeLabel = resumeStarted && !Number.isNaN(resumeStarted.getTime())
    ? `${resumeStarted.getMonth() + 1}月${resumeStarted.getDate()}日 ${String(resumeStarted.getHours()).padStart(2, "0")}:${String(resumeStarted.getMinutes()).padStart(2, "0")}`
    : "";
  return (
    <main className="assessment-flow map-flow" style={{ "--assessment-color": theme.color, "--assessment-soft": theme.soft, "--assessment-glow": theme.glow, "--assessment-deep": theme.deep }}>
      <button className="flow-back" type="button" onClick={onBack} disabled={busy}>
        <ArrowLeft weight="bold" /> 返回
      </button>
      <h1 className="flow-wordmark" aria-label="TEST! 闯关地图"><TestWordmark /></h1>
      <Progress current={current} complete={complete} onPick={onOpenStage} disabled={busy} total={total} />
      <section className="level-map" aria-label={`${theme.title}关卡地图`}>
        <p className="map-kicker">{theme.title}</p>
        <h2>从这一关开始</h2>
        <p>{theme.description}</p>
        {resume && (
          <div className="map-resume" role="status">
            <div>
              <strong>检测到未完成的综合测评</strong>
              <p>
                {/* 进度用"当前阶段 + 已答轮次"表述：只说"已完成 0 个阶段"会让
                    刚答了几轮的学员以为记录丢失。 */}
                {resume.phasesDone > 0
                  ? `已完成 ${resume.phasesDone} / ${total} 个阶段`
                  : `正在第 ${resume.currentStage} 关（${resume.currentStageLabel}）`}
                {resume.answered > 0 ? `，已作答 ${resume.answered} 轮` : ""}
                {resumeLabel ? ` · 开始于 ${resumeLabel}` : ""}，记录保存在本机，可随时继续。
              </p>
            </div>
            <div className="map-resume-actions">
              <button type="button" onClick={() => onOpenStage?.(current)}>继续测评</button>
              <button type="button" className="is-ghost" onClick={resume.onRestart}>重新开始</button>
            </div>
          </div>
        )}
        <div className="map-path" role="list" aria-label={`${total} 个闯关节点`}>
          {Array.from({ length: total }, (_, index) => index + 1).map((number) => {
            const state = number < current ? "complete" : number === current ? "active" : "locked";
            return (
              <button
                key={number}
                type="button"
                className={`map-stage is-${state}`}
                disabled={busy || number > complete}
                onClick={() => onOpenStage(number)}
                aria-label={`第 ${number} 关：${stageLabels[number - 1]}`}
              >
                <span className="map-stage-number">{state === "complete" ? <Check weight="bold" /> : number}</span>
                <span>{stageLabels[number - 1]}</span>
              </button>
            );
          })}
        </div>
        <Guides />
      </section>
    </main>
  );
}

/**
 * 综合测评的第一屏：选卷（2026-10-03 用户决策，替换原关卡地图）。
 *
 * 进入综合测评先选卷：老师推送的组卷作业为主，官方标准卷兜底，保证没有
 * 作业时流程不断头。原地图的三阶段进度改由任务页顶部节点承担，阶段完成
 * 后直接进入下一阶段；未完成草稿的续答横幅沿用 map-resume 保留在这一屏。
 */

export function ComprehensivePapers({ assignments = [], onStartPaper, onBack, onResume, busy, resume = null }) {
  const theme = ASSESSMENT_THEMES.comprehensive;
  const resumeStarted = resume?.startedAt
    ? new Date(resume.startedAt)
    : null;
  const resumeLabel = resumeStarted && !Number.isNaN(resumeStarted.getTime())
    ? `${resumeStarted.getMonth() + 1}月${resumeStarted.getDate()}日 ${String(resumeStarted.getHours()).padStart(2, "0")}:${String(resumeStarted.getMinutes()).padStart(2, "0")}`
    : "";
  const paperCard = (assignment) => (
    <button
      key={assignment.id}
      type="button"
      className="hub-assignment-card"
      onClick={() => onStartPaper?.(assignment)}
      disabled={busy}
      aria-label={`${assignment.title}${assignment.myRun ? " · 已完成" : " · 开始作答"}`}
    >
      {/* 卡面只留学生真正要用的三件事：卷名、截止（若有）、状态/动作。
          下发范围与题库版本属于教师端信息，对学生没有决策价值，已移除
          （2026-10-03 用户要求）。 */}
      <strong>{assignment.title}</strong>
      {assignment.dueAt && <small>截止 {assignment.dueAt.slice(5, 10)}</small>}
      <em className={assignment.myRun ? "is-done" : ""}>
        {assignment.myRun
          ? `已完成 · ${assignment.myRun.overallScore} 分（${assignment.myRun.grade}）`
          : busy ? "进入中…" : "开始作答 →"}
      </em>
    </button>
  );
  return (
    <main className="assessment-flow map-flow" style={{ "--assessment-color": theme.color, "--assessment-soft": theme.soft, "--assessment-glow": theme.glow, "--assessment-deep": theme.deep }}>
      <button className="flow-back" type="button" onClick={onBack} disabled={busy}>
        <ArrowLeft weight="bold" /> 返回
      </button>
      <h1 className="flow-wordmark" aria-label="TEST! 综合测评选卷"><TestWordmark /></h1>
      <section className="level-map papers-map" aria-label="选择试卷">
        <p className="map-kicker">综合测评 · COMPREHENSIVE</p>
        <h2>选择试卷</h2>
        {resume && (
          <div className="map-resume" role="status">
            <div>
              <strong>检测到未完成的综合测评</strong>
              <p>
                {/* 进度用"当前阶段 + 已答轮次"表述：只说"已完成 0 个阶段"会让
                    刚答了几轮的学员以为记录丢失。 */}
                {resume.phasesDone > 0
                  ? `已完成 ${resume.phasesDone} / ${phaseCount("comprehensive")} 个阶段`
                  : `正在第 ${resume.currentStage} 关（${resume.currentStageLabel}）`}
                {resume.answered > 0 ? `，已作答 ${resume.answered} 轮` : ""}
                {resumeLabel ? ` · 开始于 ${resumeLabel}` : ""}，记录保存在本机，可随时继续。
              </p>
            </div>
            <div className="map-resume-actions">
              <button type="button" onClick={onResume}>继续测评</button>
              <button type="button" className="is-ghost" onClick={resume.onRestart}>重新开始</button>
            </div>
          </div>
        )}
        {assignments.length ? (
          <div className="papers-block">
            <p className="papers-block-title"><ChalkboardTeacher size={17} weight="fill" /> 老师推送</p>
            <div className="papers-grid">
              {assignments.map((assignment) => paperCard(assignment))}
            </div>
          </div>
        ) : (
          <div className="papers-block is-empty">
            <p className="papers-block-title"><ChalkboardTeacher size={17} weight="fill" /> 老师推送</p>
            <p className="papers-empty-note">暂无老师推送的试卷，可直接开始下面的标准综合测评。</p>
          </div>
        )}
        <button type="button" className="papers-standard" onClick={() => onStartPaper?.(null)} disabled={busy} aria-label="标准综合测评 · 开始测评">
          <span className="papers-standard-main">
            <strong>标准综合测评</strong>
          </span>
          <span className="papers-standard-go">{busy ? "进入中…" : "开始测评"}<ArrowRight weight="bold" /></span>
        </button>
        <Guides />
      </section>
    </main>
  );
}

export function AssessmentTask({
  id,
  stage,
  complete,
  onBack,
  onPick,
  onComplete,
  onFetchComprehensiveQuestion,
  onAnswerComprehensive,
  comprehensiveResult,
  adaptiveTelemetry = null,
  adaptivePrior = null,
  onExternalEvidence = null,
  onInterviewScore = null,
  busy,
}) {
  const layoutSettled = useSettledAfterAnimation();

  // 三元素自由布局（卡片 / 角色舞台 / TEST! 字标）：
  // 值来自 src/stage-layout-tuning.json + ?tune=1 面板的本地覆盖，
  // 以 --lo-* CSS 变量注入，所有定位由 CSS 端读取（见 assessment-flow.css）。
  const stageLayout = useStageLayout();

  const theme = ASSESSMENT_THEMES[id];
  const comprehensive = id === "comprehensive";
  const total = phaseCount(id);
  const phaseDef = comprehensive ? COMPREHENSIVE_PHASES[stage - 1] : null;
  const mode = phaseDef ? phaseDef.mode : getStageMode(id, 1);
  const guardian = phaseDef?.guardian
    ?? { conversation: "苏记者", objective: "林教授", practical: "陈创客" }[mode]
    ?? "导师";
  const taskKey = `${id}-${stage}-${mode}`;
  const props = {
    hasStory: false,
    guardian,
    onComplete: () => onComplete(stage),
  };
  const displayMode = comprehensive ? mode : mode;
  return (
    <main
      className="assessment-flow task-flow"
      data-mode={displayMode}      style={{
        "--assessment-color": theme.color,
        "--assessment-soft": theme.soft,
        "--assessment-glow": theme.glow,
        "--assessment-deep": theme.deep,
        ...stageLayoutVars(stageLayout),
      }}
    >
      <button className="flow-back" type="button" onClick={onBack} disabled={busy}>
        <ArrowLeft weight="bold" /> 返回
      </button>
      <Progress current={stage} complete={complete} onPick={onPick} disabled={busy} total={total} />

      <div className={`task-stage-layout${layoutSettled ? " is-settled" : ""}`}>
        {/* 字标放进画布容器：随 --lo-zoom 与卡片/舞台同一坐标系等比缩放 */}
        <h1 className="flow-wordmark" aria-label="TEST! 测评关卡">
          <TestWordmark />
        </h1>
        <section className="task-panel is-enlarged" aria-label={`${theme.title}第 ${stage} 关`}>
          <Guides />
          <TaskHeader id={id} stage={stage} mode={mode} />
          {mode === "objective" ? (
            <AdaptiveObjectivePhase
              key={`${taskKey}-cat`}
              {...props}
              stage={stage}
              onFetchQuestion={onFetchComprehensiveQuestion}
              onAnswer={onAnswerComprehensive}
              comprehensiveResult={comprehensiveResult}
              adaptiveTelemetry={adaptiveTelemetry}
              adaptivePrior={adaptivePrior}
            />
          ) : mode === "conversation" ? (
            <InterviewPhase
              key={`${taskKey}-interview`}
              {...props}
              onInterviewScore={comprehensive ? onInterviewScore : null}
            />
          ) : (
            <PracticalWorkbenchPhase
              key={`${taskKey}-workbench`}
              {...props}
              levelId={comprehensive ? "workshop" : "all"}
              taskId={new URLSearchParams(window.location.search).get("task")}
              onTaskEvidence={comprehensive ? onExternalEvidence : null}
              abilityResult={comprehensiveResult}
            />
          )}
        </section>

        <aside className="task-character-stage" aria-label="AI 伴学导师舞台">
          <Task3DCharacter id={id} />
        </aside>
      </div>

      {/* 调参面板：仅在 ?tune=1 时挂载，生产页面完全不加载。
          两个面板各管一层：页面布局（卡片/舞台/字标坐标）与角色视频微调。 */}
      {new URLSearchParams(window.location.search).has("tune") && (
        <>
          <StageLayoutTuner />
          <CharacterTuner />
        </>
      )}
    </main>
  );
}
