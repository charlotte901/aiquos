// Worker 侧共享的 HTTP 小工具：JSON 响应与请求体解析。
// 之前每个路由文件都逐字复制一份 json()/readJson()（6 处），改这里即可。

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** 解析 JSON 请求体；非法/非对象返回 null（调用方回 400）。 */
export async function readJson(request) {
  try {
    const payload = await request.json();
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/**
 * 真实客户端 IP：cf-connecting-ip 由 Cloudflare 附加、不可伪造，优先；
 * 自建部署只能信 x-forwarded-for 的**最后**一段（最靠近本服务的一跳），
 * 链首是客户端自报的，攻击者可以随意换着刷限速键。dev 中间件无代理头，
 * 归入 "local" —— 同源本机请求按账号维度限速。
 */
export function clientIp(request) {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((piece) => piece.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "local";
}

/**
 * 固定窗口内存限速器（每个 isolate 独立计数，尽力而为）。
 *
 * 返回 true 表示放行。条目数超过 maxEntries 时整体丢弃过期窗口，
 * 防止攻击者用随机 key 把内存刷爆。
 */
export function createRateLimiter({ max, windowMs, maxEntries = 4096 }) {
  const hits = new Map();
  return {
    allow(key, now = Date.now()) {
      if (hits.size > maxEntries) {
        for (const [entryKey, entry] of hits) {
          if (now - entry.firstAt > windowMs) hits.delete(entryKey);
        }
      }
      const entry = hits.get(key);
      if (!entry || now - entry.firstAt > windowMs) {
        hits.set(key, { firstAt: now, count: 1 });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
  };
}
