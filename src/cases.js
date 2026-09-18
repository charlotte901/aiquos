// Add cases here; the three screens and carousel controls share this manifest.
//
// These cases are the evidence behind the assessment's own claim — "用真实任务，
// 检验你的 AI 能力". A visitor meets them before taking anything, so each `detail`
// line names what the AI actually did to produce the piece, rather than what medium
// the piece happens to be in. "实时 3D" describes a file format and tells a reader
// nothing about capability; "AI 生成场景 · 实时渲染" tells them what they are looking
// at and what they could ask for. Keep that distinction when adding cases.
export const CASE_INTERVAL = 15000;
export const CASES = [
  {
    id: "wing-it",
    name: "Wing It",
    detail: "AI 视频 · 分镜剪辑与配音",
    kind: "video",
    src: "/cases/wing-it.mp4",
  },
  {
    id: "mario",
    name: "超级马里奥",
    detail: "AI 写游戏 · 可试玩",
    kind: "scene",
    src: "/cases/mario/index.html?showcase=1",
  },
  {
    id: "conbini",
    name: "日式便利店",
    detail: "AI 建模 · 场景实时渲染",
    kind: "scene",
    src: "/cases/conbini/index.html?showcase=1",
  },
  {
    id: "pirate",
    name: "暴风雨海盗船",
    detail: "AI 建模 · 海浪实时演算",
    kind: "scene",
    src: "/cases/pirate/index.html?showcase=1",
  },
  {
    id: "penguin",
    name: "企鹅叠叠乐",
    detail: "AI 建模 · 一句话生成 3D",
    kind: "scene",
    src: "/cases/penguin/index.html?showcase=1",
  },
  {
    id: "moon-route",
    name: "人类登上月球",
    detail: "AI PPT · 史料变信息图",
    kind: "still",
    src: "/cases/moon-route/route.webp",
  },
  {
    id: "onboarding-schedule",
    name: "迎新志愿服务排班表",
    detail: "AI 表格 · 需求变排班表",
    kind: "still",
    src: "/cases/onboarding-schedule/schedule.webp",
    // A full schedule is a very tall sheet (≈1:2.8), far taller than the
    // newspaper the still default was tuned for. Left at 38% the cover crop
    // lands on anonymous middle rows; anchored to the top, the title block,
    // the service date and the first postings are what read as "排班表".
    focus: "50% 0%",
  },
  {
    id: "stop-motion",
    name: "纸箱宇航员",
    detail: "AI 视频 · 定格动画",
    kind: "video",
    src: "/cases/stop-motion/stop-motion.mp4",
  },
  {
    // A 16:9 document, so it fills the frame without the cropping that the
    // still default applies to a tall page — `focus` would only fight it.
    id: "security-audit",
    name: "红客挑战赛",
    detail: "AI 网络审计 · 发现双漏洞",
    kind: "still",
    src: "/cases/security-audit/audit.webp",
  },
  {
    id: "browser-ops",
    name: "电脑控制",
    detail: "AI 电脑操作 · 无人值守",
    kind: "video",
    src: "/cases/browser-ops/browser-ops.mp4",
  },
];
export function normalizeCaseIndex(index) {
  return ((index % CASES.length) + CASES.length) % CASES.length;
}
export function getCaseFaces(index) {
  return Object.fromEntries(
    ["top", "left", "right"].map((face, offset) => [
      face,
      { type: "case", ...CASES[normalizeCaseIndex(index + offset)] },
    ]),
  );
}
