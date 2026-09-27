// Admin API surface. Local demo trust model: same-origin, no auth token —
// the student app's answer key ships to the client anyway. Swap in real auth
// before any multi-tenant deployment.
import { getBankState, resetBank, setBank } from "./bank-store.js";
import { DEFAULT_EDITION, normalizeEdition } from "../src/bank-editions.js";

export const ADMIN_BANK_PATH = "/api/admin/bank";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** 版本（edition）由查询参数指定；缺省为精选版。 */
function editionOf(request) {
  const url = new URL(request.url);
  return normalizeEdition(url.searchParams.get("edition") ?? DEFAULT_EDITION);
}

export async function handleAdminBank(request) {
  const edition = editionOf(request);
  if (request.method === "GET") return json(getBankState(edition));
  if (request.method === "DELETE") return json(resetBank(edition));
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
      return json(setBank(payload.questions, edition));
    } catch (error) {
      return json({ error: error?.message ?? "bank validation failed" }, 400);
    }
  }
  return json({ error: "method not allowed" }, 405);
}
