/**
 * 免费参数探测：故意发**缺参/非法**请求，让上游在生成前返回 400，不产生费用。
 *
 * 目的：确认 /images/edits 的完整参数契约（字段名、必需项、size 约束），
 * 避免用付费调用去试错。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const KEY = pick("ARK_API_KEY");
const BASE = "https://api.vllmproxy.com/v1";

const probe = async (label, body) => {
  try {
    const res = await fetch(`${BASE}/images/edits`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40_000),
    });
    const text = await res.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = null; }
    const msg = parsed?.error?.message || parsed?.message || parsed?.detail || text.slice(0, 260);
    const generated = res.status === 200; // 200 = 真的生成了（花钱）
    console.log(`\n[${label}]  HTTP ${res.status}${generated ? "  ⚠ 已生成（产生费用）" : "  （无费用）"}`);
    console.log(`   ${String(msg).slice(0, 300)}`);
    return res.status;
  } catch (err) {
    console.log(`\n[${label}]  异常 ${err.name}: ${err.message}`);
    return 0;
  }
};

console.log("═══ 探测 /images/edits 的参数契约（全部为非法请求，应返回 4xx）═══");

// 1. 空 body
await probe("空body", {});
// 2. 只给 prompt，确认 images 是否必需
await probe("只prompt", { model: "gpt-image-2", prompt: "x" });
// 3. images 为空数组
await probe("images空数组", { model: "gpt-image-2", prompt: "x", images: [] });
// 4. images 里给空对象，确认 image_url 是否唯一必需项
await probe("image_url空", { model: "gpt-image-2", prompt: "x", images: [{}] });
// 5. 非法 image_url 字符串，看它如何校验 URL
await probe("image_url非法串", { model: "gpt-image-2", prompt: "x", images: [{ image_url: "not-a-url" }] });
// 6. 非法 size（若 size 不在白名单，应在生成前报错）
await probe("非法size", { model: "gpt-image-2", prompt: "x", images: [{ image_url: "not-a-url" }], size: "9999x9999" });
