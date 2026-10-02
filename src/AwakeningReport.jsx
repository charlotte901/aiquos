import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileDoc, FilePdf, X } from "@phosphor-icons/react";
import {
  exportAttemptHistory,
  historyAtCapacity,
  latestCompletedSnapshot,
} from "./assessment-attempt";
import { buildRecommendations } from "./report-recommendations";
import { downloadLearningPlan } from "./learning-plan-docx";
import { downloadLearningPlanPdf } from "./learning-plan-pdf";

// Demo scores shown when no completed comprehensive attempt exists yet. Real
// reports always come from a stored history snapshot produced by the vendored
// six-dimension scoring core.
const DEMO_DIMENSIONS = [
  { key: "D1", name: "AI基础认知", short: "认知", score: 84, advice: "补齐模型类型与能力边界，用一句话说清每个工具适合什么任务。" },
  { key: "D2", name: "提示词工程", short: "提示", score: 91, advice: "继续训练结构化提示：目标、背景、约束、示例和验收标准分开写。" },
  { key: "D3", name: "AI工具使用", short: "工具", score: 78, advice: "围绕真实工作流练习联网检索、文件分析、图像生成与结果交叉验证。" },
  { key: "D4", name: "AI结果评估与优化", short: "评估", score: 86, advice: "为关键输出建立核查清单，主动追问依据、风险和反例。" },
  { key: "D5", name: "人机协同解决问题", short: "协同", score: 80, advice: "把复杂任务拆成AI可执行步骤，并在关键节点保留人工判断。" },
  { key: "D6", name: "AI伦理与合规", short: "伦理", score: 75, advice: "重点练习隐私脱敏、版权检查、偏见识别和高风险决策复核。" },
];

const RESOURCES = [
  { tag: "模型通识", title: "AI能力边界速览工作坊", result: "补强基础认知 · 预计 25 分钟" },
  { tag: "工具实战", title: "联网检索与文件分析挑战", result: "提升工具使用 · 预计 35 分钟" },
  { tag: "伦理案例", title: "偏见、隐私与版权审查实验室", result: "强化伦理合规 · 预计 30 分钟" },
];

// Advice bands per dimension for real reports: strong (80+), developing
// (60-79), focus (<60). Keys follow the scoring core's D1-D6 order.
const ADVICE_BANDS = {
  D1: {
    strong: "基础认知扎实。可以开始接触多模态、Agent 等进阶概念，并关注模型能力边界的最新变化。",
    developing: "用一句话说清每个主流模型擅长什么任务，补齐对训练数据与能力边界的理解。",
    focus: "从最常用的三款 AI 工具入手，先弄清它们各自擅长与不擅长什么，再谈进阶技巧。",
  },
  D2: {
    strong: "提示词能力出色。尝试把常用提示沉淀为可复用模板，并练习约束与验收标准的精确表达。",
    developing: "继续训练结构化提示：目标、背景、约束、示例和验收标准分开写，逐项检查。",
    focus: "从模仿优秀提示开始，练习「角色 + 目标 + 约束 + 示例」四段式结构，写完再自查一遍。",
  },
  D3: {
    strong: "工具使用娴熟。可以挑战把多个工具串成完整工作流，并建立自己的工具选择决策树。",
    developing: "围绕真实工作流练习联网检索、文件分析、图像生成与结果交叉验证。",
    focus: "每周选定一个真实任务，完整走一遍「选工具 → 下指令 → 核对结果」的流程。",
  },
  D4: {
    strong: "评估能力强。为关键输出建立量化核查清单，并练习让 AI 自检后再人工复核。",
    developing: "为关键输出建立核查清单，主动追问依据、风险和反例。",
    focus: "拿到 AI 结果先问三个问题：依据是什么？哪里可能错？和事实如何核对？",
  },
  D5: {
    strong: "人机协同流畅。尝试把复杂项目拆成 AI 可执行的阶段计划，并在关键节点保留人工判断。",
    developing: "把复杂任务拆成AI可执行步骤，并在关键节点保留人工判断。",
    focus: "从一个中等任务开始练习分工：哪些交给 AI、哪些必须自己判断、如何衔接。",
  },
  D6: {
    strong: "伦理意识可靠。在团队中主动推动隐私脱敏、版权检查与高风险决策复核的规范落地。",
    developing: "重点练习隐私脱敏、版权检查、偏见识别和高风险决策复核。",
    focus: "了解数据隐私、版权与偏见三类高频风险，养成提交前脱敏、引用前核权的习惯。",
  },
};

function bandOf(score) {
  return score >= 80 ? "strong" : score >= 60 ? "developing" : "focus";
}

function bandLabel(band) {
  return band === "strong" ? "优势" : band === "developing" ? "发展中" : "待提升";
}

function channelCell(score) {
  return score === null || score === undefined ? "—" : String(score);
}

function channelOverallText(score, count, unit) {
  if (score === null || score === undefined) return count > 0 ? `完成 ${count} ${unit}` : "未参加";
  return `${score} 分 · ${count > 0 ? `${count} ${unit}` : "无记录"}`;
}

const gradeClass = (letter) => `grade-badge is-${String(letter ?? "D").toLowerCase()}`;

function grade(score) {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

function formatCompletedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function reportModel(snapshot) {
  // A snapshot without a usable result (corrupt or hand-edited storage) falls
  // back to the labelled demo view instead of crashing the reports panel.
  if (!snapshot || !snapshot.result || !Array.isArray(snapshot.result.dimensions)) {
    const average = Math.round(DEMO_DIMENSIONS.reduce((sum, item) => sum + item.score, 0) / DEMO_DIMENSIONS.length);
    return {
      dimensions: DEMO_DIMENSIONS,
      overallScore: average,
      grade: grade(average),
      meta: "本地演示数据 · 完成一次综合测评后展示真实画像",
      isDemo: true,
    };
  }
  // 三通道加权视图（升级后的快照带 composite）：雷达与总分用它；
  // 旧快照没有 composite 时按 vendor IRT 结果渲染，行为与升级前一致。
  const composite = snapshot.composite && Array.isArray(snapshot.composite.dimensions) ? snapshot.composite : null;
  const source = composite ?? snapshot.result;
  return {
    dimensions: source.dimensions.map((item) => ({
      key: item.key,
      name: item.name,
      short: item.short,
      score: item.score,
      evidenceCount: item.evidenceCount,
      channels: item.channels ?? null,
      advice: ADVICE_BANDS[item.key]?.[bandOf(item.score ?? 0)] ?? "",
    })),
    overallScore: source.overallScore,
    grade: source.grade ?? grade(source.overallScore ?? 0),
    meta: `综合测评 · 完成于 ${formatCompletedAt(snapshot.completedAt)} · ${snapshot.result.answeredCount}/${snapshot.result.totalQuestions} 题`,
    versions: {
      scoring: snapshot.scoringVersion,
      bank: snapshot.questionBankVersion,
      ...(composite ? { weighting: composite.weightingVersion } : {}),
    },
    composite,
    channelOveralls: composite
      ? {
        objective: composite.channels.objective.overallScore,
        interview: composite.channels.interview.overallScore,
        practical: composite.channels.practical.overallScore,
      }
      : null,
    recommendations: composite ? buildRecommendations(composite) : null,
    isDemo: false,
  };
}

function radarPoints(dimensions, radius) {
  return dimensions.map((item, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    const x = 220 + radius * (item.score / 100) * Math.cos(angle);
    const y = 220 + radius * (item.score / 100) * Math.sin(angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function ringPoints(radius) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return `${220 + radius * Math.cos(angle)},${220 + radius * Math.sin(angle)}`;
  }).join(" ");
}

const DIALOGUE_LINES = [
  { who: "xiao", text: "觉醒完成！这是你的智核觉醒报告。" },
  { who: "xiao", text: "看，这就是你在AI六大维度上的真实能力画像。每一道你做过的题目，都同时影响了多个维度的得分——这正是智核域综合测评的意义。你的强项和待提升的方面都清晰可见。" },
  { who: "xiao", text: "根据你的测评结果，我为你推荐了这些学习资源，帮助你在薄弱维度上提升。记住，AI能力不是一成不变的——你可以随时回来重新测评，看看自己是否有所进步。智核域的大门永远为你敞开！" },
];

export function AwakeningReportContent({ snapshot = null }) {
  const model = reportModel(snapshot);
  const [methodOpen, setMethodOpen] = useState(false);
  const [learningPlanAction, setLearningPlanAction] = useState(null);
  const capNotice = !model.isDemo && historyAtCapacity();

  const handleLearningPlanPdf = async () => {
    let failed = false;
    setLearningPlanAction("pdf");
    try {
      await downloadLearningPlanPdf(model);
    } catch {
      failed = true;
      setLearningPlanAction("error");
      setTimeout(() => setLearningPlanAction(null), 2400);
    } finally {
      if (!failed) setLearningPlanAction(null);
    }
  };

  return (
    <section className="awakening-report-card" aria-label="智核觉醒报告结果">
      <div className="report-radar">
        <header className="radar-head">
          <h2>六维能力雷达</h2>
          <div className={`awakening-rating ${gradeClass(model.grade)}`} aria-label={`综合评级 ${model.grade}`}>
            <strong>{model.grade}</strong>
            <span>综合评级</span>
          </div>
        </header>
        <p className={`report-meta${model.isDemo ? " is-demo" : ""}`}>{model.meta}</p>
        <svg viewBox="0 0 440 440" role="img" aria-label="六维能力雷达图">
          {[44, 88, 132, 176].map((radius) => (
            <polygon key={radius} points={ringPoints(radius)} className="radar-ring" />
          ))}
          <polygon points={ringPoints(176)} className="radar-ring radar-edge" />
          <polygon points={radarPoints(model.dimensions, 176)} className="radar-value" />
          {model.dimensions.map((item, index) => {
            const angle = (-90 + index * 60) * Math.PI / 180;
            const x = 220 + 206 * Math.cos(angle);
            const y = 220 + 206 * Math.sin(angle);
            return (
              <text key={item.key} x={x} y={y} className="radar-label" textAnchor="middle">
                <tspan x={x} y={y}>{item.short}</tspan>
                <tspan x={x} y={y + 22}>{item.score}</tspan>
              </text>
            );
          })}
        </svg>
        <div className="report-actions">
          <button
            type="button"
            className="learning-plan-download"
            onClick={() => downloadLearningPlan(model)}
            disabled={learningPlanAction === "pdf"}
            aria-label="下载与当前分数对应的个性化学习方案 Word 文档"
          >
            <FileDoc size={17} weight="bold" /> 方案 Word
          </button>
          <button
            type="button"
            className="learning-plan-download"
            onClick={handleLearningPlanPdf}
            disabled={learningPlanAction === "pdf"}
            aria-label="导出与当前分数对应的个性化学习方案 PDF 文档"
          >
            <FilePdf size={17} weight="bold" /> {learningPlanAction === "pdf" ? "生成中…" : learningPlanAction === "error" ? "生成失败" : "方案 PDF"}
          </button>
        </div>
      </div>

      <div className="report-details">
        <section className="report-scores">
          <h2>各维度得分</h2>
          <ul>
            {model.dimensions.map((item) => (
              <li key={item.key}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.score} 分</span>
                </div>
                <div className="score-track" role="img" aria-label={`${item.name} ${item.score}分`}>
                  <i style={{ width: `${item.score}%` }} />
                </div>
                <b className={gradeClass(grade(item.score))}>{grade(item.score)}</b>
              </li>
            ))}
          </ul>
        </section>

        {model.composite && (
          <section className="report-channels" aria-label="三通道得分分解">
            <h2>三个阶段各测出了什么</h2>
            <p className="report-channels-note">
              同一维度由三个通道分别测量后加权融合（客观 {Math.round((model.composite.weights.objective ?? 0) * 100)}% · 对话 {Math.round((model.composite.weights.interview ?? 0) * 100)}% · 实操 {Math.round((model.composite.weights.practical ?? 0) * 100)}%）。落差大的维度会在下方建议里单独解释。
            </p>
            <table className="report-channel-table">
              <thead>
                <tr>
                  <th>维度</th>
                  <th>客观题</th>
                  <th>对话</th>
                  <th>实操</th>
                  <th>融合</th>
                </tr>
              </thead>
              <tbody>
                {model.dimensions.map((item) => (
                  <tr key={item.key}>
                    <th scope="row">{item.name}</th>
                    <td>{channelCell(item.channels?.objective)}</td>
                    <td>{channelCell(item.channels?.interview)}</td>
                    <td>{channelCell(item.channels?.practical)}</td>
                    <td><b>{item.score}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="report-channel-overalls">
              <li><span>客观题阶段</span><b>{channelOverallText(model.channelOveralls?.objective, model.composite.channels.objective.answeredCount, "题")}</b></li>
              <li><span>对话式采访</span><b>{channelOverallText(model.channelOveralls?.interview, model.composite.channels.interview.answeredSlots, "话题")}</b></li>
              <li><span>实操任务</span><b>{channelOverallText(model.channelOveralls?.practical, model.composite.channels.practical.taskCount, "题")}</b></li>
            </ul>
          </section>
        )}

        <section className="report-guidance">
          <div className="report-method">
            <button
              type="button"
              className="report-method-toggle"
              aria-expanded={methodOpen}
              onClick={() => setMethodOpen((current) => !current)}
            >
              分数如何得出？{methodOpen ? "收起" : "展开"}
            </button>
            {methodOpen && (
              <ul className="report-method-list">
                <li>流程：先对话式采访定档（约 5 分钟）→ 客观题按定档自适应出题（约 5 分钟）→ 实操任务（约 5 分钟）。</li>
                <li>客观题阶段以对话分数为初始先验定档出题，先验只影响「出哪道题、何时停」，不进评分；题目难度锚点：低 = −1、中 = 0、高 = +1，维度估计采用 N(0,1) 先验的能力估计（与官方评分核心一致）。</li>
                <li>多选题部分得分：命中率 − 0.6 × 误选率，限制在 0 到 1；单选与判断题须完全正确；实操按逐维评分标准折算 20 分制得分率。</li>
                <li>三通道分数先各自反演到共同的能力潜变量（客观题 IRT 量表的逆映射、对话评分模型的逆映射、实操锚点曲线的逆映射），再按权重融合后映射回 0–100（当前客观 {Math.round((model.composite?.weights.objective ?? 0.5) * 100)}% · 对话 {Math.round((model.composite?.weights.interview ?? 0.25) * 100)}% · 实操 {Math.round((model.composite?.weights.practical ?? 0.25) * 100)}%），缺失通道按维度重新归一化权重；总分 = 六维融合分的平均值四舍五入；等级 S ≥ 90、A ≥ 80、B ≥ 70、C ≥ 60、D &lt; 60。</li>
                <li>进行中只显示已有作答维度的估计，不产生总分与等级。</li>
              </ul>
            )}
          </div>
          {capNotice && (
            <p className="report-cap-note" role="status">
              本机最多保留最近 12 份报告，新的完成会替换最旧的一份。
              <button type="button" onClick={() => exportAttemptHistory()}>导出全部记录</button>
            </p>
          )}
          <div>
            <h2>个性化学习建议</h2>
            {model.recommendations ? (
              <>
                {model.recommendations.summary && <p className="advice-summary">{model.recommendations.summary}</p>}
                {model.recommendations.consistency?.flag && (
                  <p className="advice-consistency" role="note">{model.recommendations.consistency.note}</p>
                )}
                <ol className="advice-priority-list">
                  {model.recommendations.priorities.map((item) => (
                    <li key={item.key} className={`is-${item.band}`}>
                      <div className="advice-priority-head">
                        <strong>{item.name}</strong>
                        <span className={`advice-band is-${item.band}`}>{bandLabel(item.band)} · {item.score} 分</span>
                      </div>
                      <p>{item.advice}</p>
                      {item.gap && (
                        <div className="advice-gap">
                          <em>{item.gap.title}</em>
                          <p>{item.gap.note}</p>
                          {item.gap.actions.map((action) => <p key={action} className="advice-action">{action}</p>)}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <ul className="advice-list">
                {model.dimensions.map((item) => <li key={item.key}>{item.advice}</li>)}
              </ul>
            )}
          </div>
          <div>
            <h2>推荐学习资源</h2>
            <ul className="resource-list">
              {(model.recommendations?.resources ?? RESOURCES).map((item) => (
                <li key={item.title}>
                  <em>{item.tag}</em>
                  <strong>{item.title}</strong>
                  <span>{item.result}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <footer className="report-footnote">
          {model.versions
            ? `基于 ${model.versions.bank} 题库 · 评分模型 v${model.versions.scoring}${model.versions.weighting ? ` · 加权方案 v${model.versions.weighting}` : ""} · 结果保存在本机`
            : "演示数据 · 完成一次综合测评后展示真实画像"}
        </footer>
      </div>
    </section>
  );
}

export function AwakeningReportModal({ open, onClose, snapshot = null }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    // Dialog hygiene: move focus in, lock background scroll, restore both.
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus instanceof HTMLElement && previousFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="report-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="awakening-report-modal-title"
      >
        <header className="report-modal-head">
          <div>
            <em>综合测评</em>
            <h2 id="awakening-report-modal-title">智核觉醒报告</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭觉醒报告">
            <X size={20} weight="bold" />
          </button>
        </header>
        <div className="report-modal-body">
          <AwakeningReportContent snapshot={snapshot} />
        </div>
      </div>
    </div>
  );
}

export function AwakeningReport({ onBack, onStartAssessment, busy, active = false }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [dialogueVisible, setDialogueVisible] = useState(true);
  const [snapshot, setSnapshot] = useState(() => latestCompletedSnapshot());

  useEffect(() => {
    if (!active) {
      setLineIndex(0);
      setDialogueVisible(true);
      return;
    }
    // This panel stays mounted while hidden, so the initializer ran before any
    // attempt existed. History is written before the page opens: re-read on
    // arrival (integration guide: the latest report points at the latest
    // completed snapshot).
    setSnapshot(latestCompletedSnapshot());
  }, [active]);

  const advanceDialogue = () => {
    if (lineIndex < DIALOGUE_LINES.length - 1) {
      setLineIndex((current) => current + 1);
    }
  };

  const dialogueLine = DIALOGUE_LINES[lineIndex];

  return (
    <main className="awakening-screen" aria-label="智核觉醒报告">
      <button className="report-back" type="button" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} /> 返回选择
      </button>

      {dialogueVisible && dialogueLine && (
        <div
          className="awakening-dialogue"
          role="button"
          tabIndex={0}
          aria-label={lineIndex === DIALOGUE_LINES.length - 1 ? "小源对话已完成" : "继续下一句小源对话"}
          onClick={advanceDialogue}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              advanceDialogue();
            }
          }}
        >
          <article className="awakening-story">
            <div className="awakening-story-head">
              <span>小源</span>
              <strong>{lineIndex + 1} / {DIALOGUE_LINES.length}</strong>
            </div>
            <p>{dialogueLine.text}</p>
            <small>
              {lineIndex === DIALOGUE_LINES.length - 1 ? "对话完成" : "点击继续 ▾"}
            </small>
            {lineIndex < DIALOGUE_LINES.length - 1 && (
              <button
                type="button"
                className="story-skip"
                onClick={(event) => {
                  event.stopPropagation();
                  setLineIndex(DIALOGUE_LINES.length - 1);
                }}
              >
                跳过对话
              </button>
            )}
          </article>
        </div>
      )}

      {snapshot
        ? <AwakeningReportContent snapshot={snapshot} />
        : (
          <div className="report-empty">
            <AwakeningReportContent snapshot={null} />
            <div className="report-empty-cta">
              <p>还没有真实报告——完成一次 25 题的综合测评，这里会展示你的六维能力画像。</p>
              <button type="button" onClick={onStartAssessment}>去完成综合测评</button>
            </div>
          </div>
        )}
    </main>
  );
}
