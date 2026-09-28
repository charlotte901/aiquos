/**
 * 免费验证：lite-008 那种「2 张参考图 + 无显式 size」的请求体能否通过结构校验。
 *
 * 手法：第 2 张故意放无法解析的图 → 上游若在**生成前**就报「参考图片无法解析」，
 * 说明数组结构、字段名、张数都被接受了，报错只针对图片本身（不产生费用）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const KEY = pick("ARK_API_KEY");

const good = `data:image/jpeg;base64,${readFileSync(join(ROOT, "public", "tasks", "ink-style-reference.jpg")).toString("base64")}`;
const corrupt = "data:image/jpeg;base64,QUJD"; // "ABC" —— 不是有效图像

const cases = [
  ["2张图·第2张损坏（复刻 lite-008 的形态）", [good, corrupt]],
  ["2张图·第1张损坏", [corrupt, good]],
];

for (const [label, images] of cases) {
  const body = { model: "gpt-image-2", prompt: "转成水墨扁平插画", n: 1, size: "1024x1024", images: images.map((image_url) => ({ image_url })) };
  console.log(`\n[${label}]`);
  console.log(`   images 数组长度 ${body.images.length}，字段 ${Object.keys(body.images[0]).join(",")}`);
  try {
    const res = await fetch("https://api.vllmproxy.com/v1/images/edits", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = null; }
    const msg = parsed?.error?.message || parsed?.message || text.slice(0, 200);
    const generated = res.status === 200;
    console.log(`   HTTP ${res.status}${generated ? "  ⚠ 竟然生成了（产生费用）" : "  （未生成，无费用）"}`);
    console.log(`   ${String(msg).slice(0, 220)}`);
    if (String(msg).includes("参考图片无法解析")) {
      console.log("   ✓ 结构通过校验：数组/字段名/张数都被接受，仅图片内容无效");
    }
  } catch (err) {
    console.log(`   异常 ${err.name}: ${err.message}`);
  }
}
