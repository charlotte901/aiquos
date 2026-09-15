import practicalBank from "./practical-tasks.json" with { type: "json" };

export const PRACTICAL_TASKS_PATH = "/api/practical-tasks";

function publicTask(task) {
  return {
    title: task.title,
    goal: task.goal,
    requirements: task.requirements,
    source: task.material,
    ...(task.outputType === "image" ? { outputType: "image" } : {}),
  };
}

export function createPracticalTasks(levelId, origin = "all", rng = Math.random) {
  return practicalBank.tasks
    .filter((task) => task.levelId === levelId && (origin === "all" || task.origin === origin))
    .map((task) => ({ task, order: rng() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, 5)
    .map((item) => publicTask(item.task));
}

export async function handlePracticalTasks(request) {
  const url = new URL(request.url);
  const levelId = url.searchParams.get("levelId") || "academy";
  const origin = url.searchParams.get("origin") || "all";
  const tasks = createPracticalTasks(levelId, origin);
  return new Response(JSON.stringify({ tasks }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
