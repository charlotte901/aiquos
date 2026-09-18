import { DIMENSIONS } from "../skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

const TYPE_LABELS = { comprehensive: "综合测评", objective: "客观题测评" };
const HISTORY_ASSESSMENT_TYPES = new Set(["comprehensive", "objective"]);
const COMPLETED_GRADES = new Set(["S", "A", "B", "C", "D"]);
const ADVICE = {
  D1: "补齐模型类型与能力边界，用一句话说清每个工具适合什么任务。",
  D2: "继续训练结构化提示：目标、背景、约束、示例和验收标准分开写。",
  D3: "围绕真实工作流练习联网检索、文件分析、图像生成与结果交叉验证。",
  D4: "为关键输出建立核查清单，主动追问依据、风险和反例。",
  D5: "把复杂任务拆成AI可执行步骤，并在关键节点保留人工判断。",
  D6: "重点练习隐私脱敏、版权检查、偏见识别和高风险决策复核。",
};

export const REPORT_RESOURCES = [
  { key: "D1", tag: "模型通识", title: "AI能力边界速览工作坊", result: "补强基础认知 · 预计 25 分钟" },
  { key: "D3", tag: "工具实战", title: "联网检索与文件分析挑战", result: "提升工具使用 · 预计 35 分钟" },
  { key: "D6", tag: "伦理案例", title: "偏见、隐私与版权审查实验室", result: "强化伦理合规 · 预计 30 分钟" },
];

function isCompletedHistoryRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (typeof record.id !== "string" || !record.id) return false;
  if (record.status !== "completed" || !HISTORY_ASSESSMENT_TYPES.has(record.assessmentType)) return false;
  if (typeof record.completedAt !== "string" || !record.completedAt.trim() || !Number.isFinite(Date.parse(record.completedAt))) return false;
  if (record.answeredCount !== 25 || record.totalQuestions !== 25) return false;
  if (!Array.isArray(record.responses) || record.responses.length !== 25) return false;
  const responseIds = record.responses.map((response) => response?.questionId);
  if (responseIds.some((id) => typeof id !== "string" || !id.trim()) || new Set(responseIds).size !== responseIds.length) return false;
  if (!Array.isArray(record.result?.dimensions) || record.result.dimensions.length !== DIMENSIONS.length) return false;
  if (!Number.isInteger(record.result.overallScore) || record.result.overallScore < 0 || record.result.overallScore > 100) return false;
  if (!COMPLETED_GRADES.has(record.result.grade)) return false;
  return DIMENSIONS.every(({ key }) => {
    const dimension = record.result.dimensions.find((item) => item?.key === key);
    return Number.isFinite(dimension?.score) && dimension.score >= 0 && dimension.score <= 100
      && Number.isInteger(dimension.evidenceCount) && dimension.evidenceCount >= 0;
  });
}

function isKnownInProgressDraft(record) {
  return record
    && typeof record === "object"
    && !Array.isArray(record)
    && typeof record.id === "string"
    && record.id
    && HISTORY_ASSESSMENT_TYPES.has(record.assessmentType)
    && record.status === "in_progress"
    && record.completedAt === null;
}

function normalizedReportHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.flatMap((record, index) => {
    if (isKnownInProgressDraft(record)) return [];
    if (isCompletedHistoryRecord(record)) return [record];
    const value = record && typeof record === "object" ? record : {};
    return [{ ...value, id: value.id || `unavailable-${index + 1}`, unavailable: true }];
  });
}

export function filterReportHistory(history, filter = "all") {
  const records = normalizedReportHistory(history);
  const filtered = filter === "all"
    ? records
    : records.filter((record) => record.assessmentType === filter);
  return filtered.toSorted((left, right) => {
    if (left.unavailable !== right.unavailable) return left.unavailable ? 1 : -1;
    if (left.unavailable) return 0;
    return Date.parse(right.completedAt) - Date.parse(left.completedAt);
  });
}

export function groupReportHistory(history) {
  const groups = new Map();
  const unavailable = [];
  for (const record of filterReportHistory(history, "all")) {
    if (record.unavailable) {
      unavailable.push(record);
      continue;
    }
    const date = new Date(record.completedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, { key, label: `${date.getFullYear()}年${date.getMonth() + 1}月`, records: [] });
    groups.get(key).records.push(record);
  }
  const result = [...groups.values()];
  if (unavailable.length) result.push({ key: "unavailable", label: "数据不可用", records: unavailable });
  return result;
}

export function resolveReportHistorySelection(history, filter = "all", selectedId = null) {
  const visible = filterReportHistory(history, filter).filter((record) => !record.unavailable);
  return visible.find((record) => record.id === selectedId) ?? visible[0] ?? null;
}

function orderedDimensions(dimensions = []) {
  return DIMENSIONS.map((metadata) => {
    const item = dimensions.find((dimension) => dimension.key === metadata.key);
    const score = Number.isFinite(item?.score) && item.score >= 0 && item.score <= 100 ? item.score : null;
    return { ...metadata, score, evidenceCount: item?.evidenceCount ?? 0, displayScore: score === null ? "待测" : `${score}%` };
  });
}

export function buildReportView(report) {
  const hasReport = Boolean(report?.id && TYPE_LABELS[report.assessmentType] && Array.isArray(report.result?.dimensions));
  const complete = hasReport && report.status === "completed";
  const typeLabel = hasReport ? TYPE_LABELS[report.assessmentType] : null;
  const timestamp = hasReport ? (complete ? report.completedAt : report.startedAt) : null;
  const date = timestamp ? new Date(timestamp) : null;
  const validDate = date && Number.isFinite(date.getTime());
  const dateLabel = validDate ? new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date) : "时间未记录";
  const answeredCount = hasReport ? report.answeredCount : 0;
  const totalQuestions = hasReport ? report.totalQuestions : 25;
  return {
    hasReport, complete,
    id: hasReport ? report.id : null,
    title: hasReport ? `${typeLabel} · 智核觉醒报告` : "尚未生成能力报告",
    assessmentType: hasReport ? report.assessmentType : null,
    typeLabel, timestamp, dateLabel,
    timestampLabel: complete ? "完成于" : "开始于",
    statusLabel: !hasReport ? "等待开始" : complete ? "已完成" : `进行中 · ${answeredCount}/${totalQuestions}`,
    answeredCount, totalQuestions,
    dimensions: orderedDimensions(hasReport ? report.result.dimensions : []),
    overallScore: complete ? report.result.overallScore ?? null : null,
    grade: complete ? report.result.grade ?? null : null,
    exportFilename: hasReport ? `aiquos-${report.assessmentType}-${validDate ? date.toISOString().slice(0, 10) : "undated"}-${String(report.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.png` : null,
  };
}

// Coordinates are relative to the center so the UI and image export share geometry.
// Unknown axes split the circular sequence; they never become a point at zero.
export function radarGeometry(dimensions, radius) {
  const axes = orderedDimensions(dimensions).map((item, index) => {
    if (item.score === null) return null;
    const angle = (-90 + index * 60) * Math.PI / 180;
    return { key: item.key, score: item.score, x: radius * item.score / 100 * Math.cos(angle), y: radius * item.score / 100 * Math.sin(angle) };
  });
  const points = axes.filter(Boolean);
  const coordinates = (items) => items.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  if (points.length === 6) return { points, segments: [], polygon: coordinates(points) };
  const segments = [];
  let run = [];
  const endRun = () => {
    if (run.length > 1) segments.push({ points: run, path: `M ${coordinates(run).replaceAll(" ", " L ")}` });
    run = [];
  };
  const firstMissing = axes.indexOf(null);
  for (let offset = 1; offset <= 6; offset += 1) {
    const point = axes[(firstMissing + offset) % 6];
    if (point) run.push(point);
    else endRun();
  }
  return { points, segments, polygon: null };
}

export function adviceForDimensions(dimensions) {
  return orderedDimensions(dimensions)
    .toSorted((left, right) => (left.score ?? Infinity) - (right.score ?? Infinity))
    .map((item, index) => ({
      ...item,
      priority: item.score === null ? "待测" : index < 2 ? "优先练习" : "继续巩固",
      text: item.score === null ? `完成后续测评，了解你的${item.name}表现，再制定学习计划。` : ADVICE[item.key],
    }));
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[character]));
}

export function buildReportSvg(view) {
  if (!view.hasReport) return null;
  const geometry = radarGeometry(view.dimensions, 184);
  const text = (x, y, value, size = 24, color = "#344054", extra = "") => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${escapeXml(value)}</text>`;
  const rings = [46, 92, 138, 184].map((radius) => `<polygon points="${radarGeometry(DIMENSIONS.map((item) => ({ ...item, score: 100 })), radius).polygon}" fill="none" stroke="#dce6f6" stroke-width="2"/>`).join("");
  const data = geometry.polygon
    ? `<polygon class="radar-value" points="${geometry.polygon}" fill="#247cf126" stroke="#247cf1" stroke-width="4"/>`
    : geometry.segments.map((segment) => `<path d="${segment.path}" fill="none" stroke="#247cf1" stroke-width="4"/>`).join("");
  const points = geometry.points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#247cf1" stroke="white" stroke-width="2"/>`).join("");
  const labels = view.dimensions.map((item, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return text(239 * Math.cos(angle), 239 * Math.sin(angle), `${item.short} ${item.displayScore}`, 20, "#53647e", 'text-anchor="middle" dominant-baseline="middle"');
  }).join("");
  const rows = view.dimensions.map((item, index) => {
    const y = 242 + index * 67;
    return `${text(654, y, item.name, 22)}${text(1080, y, item.displayScore, 26, "#155cca", 'text-anchor="end" font-weight="700"')}<rect x="654" y="${y + 15}" width="426" height="7" rx="3.5" fill="#e9eff8"/>${item.score === null ? "" : `<rect x="654" y="${y + 15}" width="${426 * item.score / 100}" height="7" rx="3.5" fill="#247cf1"/>`}`;
  }).join("");
  const summary = view.complete ? `总百分比 ${view.overallScore ?? "待测"}%  ·  综合评级 ${view.grade ?? "待测"}` : `已完成 ${view.answeredCount} / ${view.totalQuestions} 题 · 初步结果`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#edf4ff"/><rect x="32" y="32" width="1136" height="836" rx="28" fill="white"/><g font-family="Noto Sans SC, Microsoft YaHei, sans-serif">${text(72, 98, view.title, 36, "#172b4d", 'font-weight="700"')}${text(72, 145, `${view.timestampLabel} ${view.dateLabel} · ${view.statusLabel}`, 22, "#607086")}<g transform="translate(328 426)">${rings}${data}${points}${labels}</g>${rows}<rect x="72" y="711" width="1056" height="74" rx="18" fill="#edf4ff"/>${text(104, 758, summary, 29, "#155cca", 'font-weight="700"')}${text(72, 829, "AIQUOS · 智核域   /   本次测评的六维能力画像", 20, "#607086")}</g></svg>`;
}
