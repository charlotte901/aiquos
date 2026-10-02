import practicalFull from "../src/banks/practical-80.json" with { type: "json" };
import practicalLite from "../src/banks/practical-10.json" with { type: "json" };
import { DEFAULT_EDITION, normalizeEdition } from "../src/bank-editions.js";

export const PRACTICAL_TASKS_PATH = "/api/practical-tasks";

/**
 * 实操题池按版本切分：全量版 80 题、精选版 10 题，两份题库各自独立。
 * 这两套是从 docx 导入的（scripts/import-practical-bank.mjs），不要手改。
 */
const BANKS = { A: practicalFull.tasks, B: practicalLite.tasks };

function poolFor(edition) {
  return BANKS[edition] ?? BANKS[DEFAULT_EDITION];
}

function publicTask(task) {
  return {
    id: task.id,
    title: task.title,
    goal: task.goal,
    requirements: task.requirements,
    // 素材字段双轨：显式 source 优先（如 lite-007 的报告节选）；docx 导入的
    // 旧任务素材存在 material 里，回退取用——39 个旧任务行为不变。
    source: task.source ?? task.material,
    // 难度元数据随任务下发：前端把真实难度写进实操证据，融合层据此做
    // IRT 等值校准（见 src/comprehensive-weighting.js 的 practicalChannel）。
    ...(task.difficulty ? { difficulty: task.difficulty } : {}),
    ...(Array.isArray(task.dimKeys) && task.dimKeys.length ? { dimKeys: task.dimKeys } : {}),
    ...(Array.isArray(task.assets) && task.assets.length ? { assets: task.assets } : {}),
    ...(task.outputType === "image" ? { outputType: "image" } : {}),
  };
}

// 任务难度锚点（与客观题同一难度量纲）。
const TASK_ANCHOR = { low: -1, medium: 0, high: 1 };

export function createPracticalTasks({
  levelId = "academy",
  origin = "all",
  taskId = null,
  count = 5,
  rng = Math.random,
  edition: editionInput,
  difficultyHint = null,
} = {}) {
  const edition = normalizeEdition(editionInput ?? DEFAULT_EDITION);
  const pool = poolFor(edition);
  if (taskId) {
    const exact = pool.find((task) => task.id === taskId);
    return exact ? [publicTask(exact)] : [];
  }
  const filtered = pool.filter((task) =>
    (levelId === "all" || task.levelId === levelId)
      && (origin === "all" || task.origin === origin));
  // 能力知情选任务（实验 3 的 R1 规则）：把任务难度对到当前能力估计附近
  // （相对能力目标 ≈ −0.5..0.5，锚点曲线最陡、区分度最大的判别带），
  // 而不是纯随机——随机失配会把学员推进 credit 饱和区（全优/全待改进），
  // 实操通道因此失去区分度（模拟实测地板率 11.7%→4.4%）。
  // difficultyHint 缺省或非法时保持纯随机，老客户端不受影响。
  const hint = Number(difficultyHint);
  const usable = Number.isFinite(hint) ? Math.max(-1.6, Math.min(1.6, hint)) : null;
  if (usable !== null) {
    const target = usable - 0.5;
    return filtered
      .map((task) => ({ task, distance: Math.abs((TASK_ANCHOR[task.difficulty] ?? 0) - target), order: rng() }))
      .sort((left, right) => left.distance - right.distance || left.order - right.order)
      .slice(0, Math.max(1, Math.min(filtered.length, count)))
      .map((item) => publicTask(item.task));
  }
  return filtered
    .map((task) => ({ task, order: rng() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.max(1, Math.min(filtered.length, count)))
    .map((item) => publicTask(item.task));
}

export async function handlePracticalTasks(request) {
  const url = new URL(request.url);
  const edition = normalizeEdition(url.searchParams.get("edition") ?? DEFAULT_EDITION);
  const tasks = createPracticalTasks({
    levelId: url.searchParams.get("levelId") || "academy",
    origin: url.searchParams.get("origin") || "all",
    taskId: url.searchParams.get("taskId"),
    count: Number(url.searchParams.get("count")) || 5,
    edition,
    difficultyHint: url.searchParams.get("difficultyHint"),
  });
  return new Response(JSON.stringify({ tasks, edition }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
