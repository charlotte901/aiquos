import practicalBank from "./practical-tasks.json" with { type: "json" };

export const PRACTICAL_TASKS_PATH = "/api/practical-tasks";

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

export function createPracticalTasks({ levelId = "academy", origin = "all", taskId = null, count = 5, rng = Math.random } = {}) {
  if (taskId) {
    const exact = practicalBank.tasks.find((task) => task.id === taskId);
    return exact ? [publicTask(exact)] : [];
  }
  const pool = practicalBank.tasks.filter((task) =>
    (levelId === "all" || task.levelId === levelId)
    && (origin === "all" || task.origin === origin));
  return pool
    .map((task) => ({ task, order: rng() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.max(1, Math.min(practicalBank.tasks.length, count)))
    .map((item) => publicTask(item.task));
}

export async function handlePracticalTasks(request) {
  const url = new URL(request.url);
  const tasks = createPracticalTasks({
    levelId: url.searchParams.get("levelId") || "academy",
    origin: url.searchParams.get("origin") || "all",
    taskId: url.searchParams.get("taskId"),
    count: Number(url.searchParams.get("count")) || 5,
  });
  return new Response(JSON.stringify({ tasks }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
