// Admin API surface. 写操作（PUT/DELETE）自 2026-10-01 起要求教师 Bearer
// 令牌（与 /api/data/teacher/* 同一鉴权）；GET 保持公开——题库内容本身
// 会下发到学生端，读取无需鉴权。此前「同源零鉴权」的演示模型随严格
// 登录体系一并收口。
import { getBankState, resetBank, setBank } from "./bank-store.js";
import { DEFAULT_EDITION, normalizeEdition } from "../src/bank-editions.js";
import { bearerToken, verifyToken } from "./auth.js";

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

async function requireTeacher(request) {
  const verified = await verifyToken(bearerToken(request));
  if (!verified) return { error: json({ error: "登录状态已失效，请重新登录" }, 401) };
  if (verified.record.role !== "teacher") {
    return { error: json({ error: "仅教师账号可以修改题库" }, 403) };
  }
  return { profile: verified.record };
}

export async function handleAdminBank(request) {
  const edition = editionOf(request);
  if (request.method === "GET") return json(getBankState(edition));
  if (request.method === "DELETE" || request.method === "PUT") {
    const auth = await requireTeacher(request);
    if (auth.error) return auth.error;
  }
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
