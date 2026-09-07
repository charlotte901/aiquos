import { useEffect, useState } from "react";
import { ArrowLeft, Download, Printer, X } from "@phosphor-icons/react";

const DIMENSIONS = [
  { name: "AI基础认知", short: "认知", score: 84, advice: "补齐模型类型与能力边界，用一句话说清每个工具适合什么任务。" },
  { name: "提示词工程", short: "提示", score: 91, advice: "继续训练结构化提示：目标、背景、约束、示例和验收标准分开写。" },
  { name: "AI工具使用", short: "工具", score: 78, advice: "围绕真实工作流练习联网检索、文件分析、图像生成与结果交叉验证。" },
  { name: "结果评估优化", short: "评估", score: 86, advice: "为关键输出建立核查清单，主动追问依据、风险和反例。" },
  { name: "人机协同解决", short: "协同", score: 80, advice: "把复杂任务拆成AI可执行步骤，并在关键节点保留人工判断。" },
  { name: "伦理与合规", short: "伦理", score: 75, advice: "重点练习隐私脱敏、版权检查、偏见识别和高风险决策复核。" },
];

const RESOURCES = [
  { tag: "模型通识", title: "AI能力边界速览工作坊", result: "补强基础认知 · 预计 25 分钟" },
  { tag: "工具实战", title: "联网检索与文件分析挑战", result: "提升工具使用 · 预计 35 分钟" },
  { tag: "伦理案例", title: "偏见、隐私与版权审查实验室", result: "强化伦理合规 · 预计 30 分钟" },
];

function grade(score) {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

function radarPoints(radius) {
  return DIMENSIONS.map((item, index) => {
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

function saveReportImage() {
  const labels = DIMENSIONS.map((item, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return `<text x="${300 + 180 * Math.cos(angle)}" y="${300 + 180 * Math.sin(angle)}" fill="#5b6473" font-size="24" font-weight="700" text-anchor="middle">${item.short} ${item.score}</text>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680"><rect width="1200" height="680" fill="#f7f8ff"/><circle cx="940" cy="120" r="230" fill="#4ff0d822"/><circle cx="180" cy="620" r="180" fill="#ff5d8f22"/><text x="72" y="102" fill="#121826" font-size="52" font-weight="900">智核觉醒报告</text><text x="72" y="152" fill="#667085" font-size="28">综合评级 A · 六维能力画像 · 本地演示数据</text><g transform="translate(0 40)"><polygon points="${ringPoints(175)}" fill="#635bff11" stroke="#aab0c0" stroke-width="2"/><polygon points="${ringPoints(132)}" fill="none" stroke="#cfd4de" stroke-width="2"/><polygon points="${ringPoints(88)}" fill="none" stroke="#cfd4de" stroke-width="2"/><polygon points="${radarPoints(175)}" fill="#4f7cff33" stroke="#2f5cff" stroke-width="5" stroke-linejoin="round"/>${labels}</g><text x="72" y="628" fill="#3d4657" font-size="26">AIQUOS · 智核域</text></svg>`;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 680;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f7f8ff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const link = document.createElement("a");
    link.download = "aiquos-awakening-report.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const DIALOGUE_LINES = [
  { who: "xiao", text: "觉醒完成！这是你的智核觉醒报告。" },
  { who: "xiao", text: "看，这就是你在AI六大维度上的真实能力画像。每一道你做过的题目，都同时影响了多个维度的得分——这正是智核域综合测评的意义。你的强项和待提升的方面都清晰可见。" },
  { who: "xiao", text: "根据你的测评结果，我为你推荐了这些学习资源，帮助你在薄弱维度上提升。记住，AI能力不是一成不变的——你可以随时回来重新测评，看看自己是否有所进步。智核域的大门永远为你敞开！" },
];

export function AwakeningReportContent() {
  const average = Math.round(DIMENSIONS.reduce((sum, item) => sum + item.score, 0) / DIMENSIONS.length);

  return (
    <section className="awakening-report-card" aria-label="智核觉醒报告结果">
      <div className="report-radar">
        <header className="radar-head">
          <h2>六维能力雷达</h2>
          <div className="awakening-rating" aria-label={`综合评级 ${grade(average)}`}>
            <strong>{grade(average)}</strong>
            <span>综合评级</span>
          </div>
        </header>
        <svg viewBox="0 0 440 440" role="img" aria-label="六维能力雷达图">
          {[44, 88, 132, 176].map((radius) => (
            <polygon key={radius} points={ringPoints(radius)} className="radar-ring" />
          ))}
          <polygon points={ringPoints(176)} className="radar-ring radar-edge" />
          <polygon points={radarPoints(176)} className="radar-value" />
          {DIMENSIONS.map((item, index) => {
            const angle = (-90 + index * 60) * Math.PI / 180;
            const x = 220 + 206 * Math.cos(angle);
            const y = 220 + 206 * Math.sin(angle);
            return (
              <text key={item.name} x={x} y={y} className="radar-label" textAnchor="middle">
                <tspan x={x} y={y}>{item.short}</tspan>
                <tspan x={x} y={y + 22}>{item.score}</tspan>
              </text>
            );
          })}
        </svg>
        <div className="report-actions">
          <button type="button" onClick={saveReportImage}>
            <Download size={17} weight="bold" /> 保存截图
          </button>
          <button type="button" onClick={() => window.print()}>
            <Printer size={17} weight="bold" /> 保存 PDF
          </button>
        </div>
      </div>

      <div className="report-details">
        <section className="report-scores">
          <h2>各维度得分</h2>
          <ul>
            {DIMENSIONS.map((item) => (
              <li key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.score} 分</span>
                </div>
                <div className="score-track" role="img" aria-label={`${item.name} ${item.score}分`}>
                  <i style={{ width: `${item.score}%` }} />
                </div>
                <b>{grade(item.score)}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="report-guidance">
          <div>
            <h2>个性化学习建议</h2>
            <ul className="advice-list">
              {DIMENSIONS.map((item) => <li key={item.name}>{item.advice}</li>)}
            </ul>
          </div>
          <div>
            <h2>推荐学习资源</h2>
            <ul className="resource-list">
              {RESOURCES.map((item) => (
                <li key={item.title}>
                  <em>{item.tag}</em>
                  <strong>{item.title}</strong>
                  <span>{item.result}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
}

export function AwakeningReportModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="report-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="awakening-report-modal-title">
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
          <AwakeningReportContent />
        </div>
      </div>
    </div>
  );
}

export function AwakeningReport({ onBack, busy, active = false }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [dialogueVisible, setDialogueVisible] = useState(true);

  useEffect(() => {
    if (!active) {
      setLineIndex(0);
      setDialogueVisible(true);
    }
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
          </article>
        </div>
      )}

      <AwakeningReportContent />
    </main>
  );
}
