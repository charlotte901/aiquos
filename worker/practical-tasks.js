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
    source: task.material,
    ...(Array.isArray(task.dimKeys) && task.dimKeys.length ? { dimKeys: task.dimKeys } : {}),
    ...(Array.isArray(task.assets) && task.assets.length ? { assets: task.assets } : {}),
    ...(task.outputType === "image" ? { outputType: "image" } : {}),
  };
}

export function createPracticalTasks({
  levelId = "academy",
  origin = "all",
  taskId = null,
  count = 5,
  rng = Math.random,
  edition: editionInput,
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
  return filtered
    .map((task) => ({ task, order: rng() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.max(1, Math.min(pool.length, count)))
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
  });
  return new Response(JSON.stringify({ tasks, edition }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
