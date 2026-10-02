import { useEffect, useRef, useState } from "react";
import { ArrowLeft, DownloadSimple, X } from "@phosphor-icons/react";
import { AbilityGlyph } from "./AbilityGlyph";
import { glyphScore } from "./ability-glyph";
import { downloadLearningPlanPdf } from "./learning-plan-pdf";
import {
  latestCompletedSnapshot,
} from "./assessment-attempt";
import { readProfile } from "./auth-client";
import { buildRecommendations } from "./report-recommendations";

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

function reportModel(snapshot, demoPreview = false) {
  // 已登录且没有自己的快照：绝不给演示报告——新注册学员会把演示雷达误
  // 认为自己「凭空多出的报告」（2026-10-02 实测反馈）。改出空状态+去测评
  // CTA。演示数据只保留给未登录的匿名探索场景。
  if (!demoPreview && (!snapshot || !snapshot.result) && readProfile()) {
    return { isEmpty: true };
  }
  // A snapshot without a usable result (corrupt or hand-edited storage) falls
  // back to the labelled demo view instead of crashing the reports panel.
  if (demoPreview || !snapshot || !snapshot.result || !Array.isArray(snapshot.result.dimensions)) {
    const average = Math.round(DEMO_DIMENSIONS.reduce((sum, item) => sum + item.score, 0) / DEMO_DIMENSIONS.length);
    return {
      dimensions: DEMO_DIMENSIONS,
      overallScore: average,
      grade: grade(average),
      meta: demoPreview ? "测试预览 · 演示分数，不计入测评记录" : "本地演示数据 · 完成一次综合测评后展示真实画像",
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

export function AwakeningReportContent({ snapshot = null, demoPreview = false }) {
  const model = reportModel(snapshot, demoPreview);
  const [downloadState, setDownloadState] = useState("idle");
  useEffect(() => setDownloadState("idle"), [snapshot, demoPreview]);
  const handleDownload = async () => {
    if (downloadState === "loading") return;
    setDownloadState("loading");
    try {
      await downloadLearningPlanPdf(model);
      setDownloadState("done");
    } catch {
      setDownloadState("error");
    }
  };
  if (model.isEmpty) return (
    <section className="awakening-report-card is-empty" aria-label="暂无觉醒报告">
      <div className="report-empty-cta">
        <h2>你的能力，等待发现。</h2>
        <p>完成一次综合测评，生成属于你的六维能力画像。</p>
      </div>
    </section>
  );
  return (
    <section className="awakening-report-card ability-report" aria-label="智核觉醒报告结果">
      <header className="ability-report-heading">
        <div>
          <h2>六维能力画像</h2>
          <p>看见优势，也看见下一步。</p>
        </div>
        <div className="ability-report-summary" aria-label={`综合能力 ${glyphScore(model.overallScore) ?? "暂无"} 分，${model.grade}级`}>
          {model.isDemo && <span className="ability-demo-label">{demoPreview ? "测试预览 · 演示数据" : "演示画像"}</span>}
          <div className="ability-total"><span>综合能力</span><strong>{glyphScore(model.overallScore) ?? "—"}<small>/100</small></strong></div>
          <b className={`grade-badge is-${String(model.grade).toLowerCase()}`}>{model.grade}</b>
        </div>
      </header>
      <AbilityGlyph dimensions={model.dimensions} isDemo={model.isDemo} />
      <div className="ability-download-area">
        <button type="button" className="ability-download" onClick={handleDownload} disabled={downloadState === "loading"}>
          <span>{downloadState === "loading" ? "正在生成报告…" : downloadState === "error" ? "重新下载个性化报告" : "下载个性化报告"}</span>
          <DownloadSimple size={21} weight="bold" aria-hidden="true" />
        </button>
        <div className="ability-download-meta">
          <p className="ability-download-note" role="status" aria-live="polite">
            {downloadState === "error" ? "报告生成失败，请重试。" : downloadState === "done" ? "报告已生成 · PDF 包含能力解读与专属学习方案" : "PDF · 能力解读 / 成长建议 / 专属学习方案"}
          </p>
          <p className="ability-report-meta">{model.meta}</p>
        </div>
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
  // Explicit local design-preview link. Production reports still require a
  // completed account-scoped snapshot; this never creates or persists a run.
  const demoPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("report-preview") === "demo";
  const [snapshot, setSnapshot] = useState(() => latestCompletedSnapshot());
  useEffect(() => {
    if (active) setSnapshot(latestCompletedSnapshot());
  }, [active]);
  return (
    <main className="awakening-screen" aria-label="智核觉醒报告">
      <button className="report-back" type="button" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} /> 返回选择
      </button>
      <AwakeningReportContent snapshot={snapshot} demoPreview={demoPreview} />
      {!demoPreview && !snapshot && readProfile() && (
        <div className="ability-start"><button type="button" onClick={onStartAssessment}>开始综合测评</button></div>
      )}
    </main>
  );
}
