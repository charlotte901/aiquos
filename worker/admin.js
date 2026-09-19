// Admin API surface. Local demo trust model: same-origin, no auth token —
// the student app's answer key ships to the client anyway. Swap in real auth
// before any multi-tenant deployment.
import { getBankState, resetBank, setBank } from "./bank-store.js";

export const ADMIN_BANK_PATH = "/api/admin/bank";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function handleAdminBank(request) {
  if (request.method === "GET") return json(getBankState());
  if (request.method === "DELETE") return json(resetBank());
  if (request.method === "PUT") {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "invalid json body" }, 400);
    }
    if (!payload || !Array.isArray(payload.questions)) {
      return json({ error: "questions array required" }, 400);
    }
    try {
      return json(setBank(payload.questions));
    } catch (error) {
      return json({ error: error?.message ?? "bank validation failed" }, 400);
    }
  }
  return json({ error: "method not allowed" }, 405);
}
