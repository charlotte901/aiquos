import practicalFull from "../src/banks/practical-80.json" with { type: "json" };
import practicalLite from "../src/banks/practical-10.json" with { type: "json" };
import { DEFAULT_EDITION, normalizeEdition } from "../src/bank-editions.js";
import {
  heuristicPracticalScore,
  parsePracticalJudgeJson,
  practicalJudgeMessages,
  scorePracticalResult,
} from "../src/practical-scoring.js";

export const PRACTICAL_SCORE_PATH = "/api/practical-score";

/**
 * 实操任务评分：题库的评分标准（rubricPrompt / rubricProduct）与参考答案
 * （standardPrompt / standardProduct）只存在服务端，浏览器的公开任务接口
 * （publicTask）不下发；学员交卷后由本路由在服务端对照评分，回传逐维度
 * 得分与评语。
 */
const BANKS = { A: practicalFull.tasks, B: practicalLite.tasks };

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function readPayload(body) {
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const asText = (value) => (typeof value === "string" ? value.slice(0, 8000) : "");
  // 迭代轮次与前端上限（MAX_GENERATIONS = 8）保持一致：
  // 早期这里硬截到 3 条，学员改了 8 轮、评委只看到前 3 轮，
  // "迭代改进"这一评分维度就评不准了。
  const prompts = Array.isArray(body.prompts) ? body.prompts.map(asText).filter(Boolean).slice(0, 8) : [];
  // 图片任务的产物图：评委必须看到图才能判「原图保真/边缘自然」这类维度。
  // 只接受 data URI，且限制体积（单张约 1.5–2.7 MB；data URI 约 2–3.6 MB）。
  const rawImage = typeof body.productImage === "string" ? body.productImage : "";
  const productImage = /^data:image\/(png|jpe?g|webp);base64,/i.test(rawImage) && rawImage.length < 6_000_000
    ? rawImage
    : "";
  // 参考图（任务自带的输入素材）：判「原图保真」类维度时必须与原图比对。
  // 上限 3 张，单张同 productImage 的体积限制。
  const DATA_URI = /^data:image\/(png|jpe?g|webp);base64,/i;
  const referenceImages = (Array.isArray(body.referenceImages) ? body.referenceImages : [])
    .filter((src) => typeof src === "string" && DATA_URI.test(src) && src.length < 6_000_000)
    .slice(0, 3);
  return {
    taskId,
    finalPrompt: asText(body.prompt),
    product: asText(body.product),
    prompts,
    isImage: body.isImage === true,
    iterations: Number.isFinite(Number(body.iterations)) ? Math.max(1, Math.min(8, Number(body.iterations))) : 1,
    productImage,
    referenceImages,
  };
}

export async function handlePracticalScore(request, apiKey, fetcher = fetch) {
  if (request.method !== "POST") return json({ error: "仅支持 POST 请求。" }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不正确。" }, 400);
  }
  const edition = normalizeEdition(body.edition ?? DEFAULT_EDITION);
  const payload = readPayload(body);
  if (!payload.taskId) return json({ error: "缺少任务编号。" }, 400);
  if (!payload.finalPrompt && payload.prompts.length === 0) {
    return json({ error: "缺少提示词记录。" }, 400);
  }

  const pool = BANKS[edition] ?? BANKS[DEFAULT_EDITION];
  const task = pool.find((item) => item.id === payload.taskId);
  if (!task) return json({ error: "未找到该实操任务。" }, 404);

  // 无 Key 或上游失败 → 服务端离线规则评分（同样按 rubric 逐维给档），
  // 响应带 judged: "heuristic"，界面明示评审来源。
  if (!apiKey) return json(heuristicPracticalScore(task, payload));

  try {
    const upstream = await fetcher("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages: practicalJudgeMessages(task, payload),
        // 打分轨：温度 0 + 关思考（与对话打分轨同一套可靠性结论，见
        // worker/deepseek.js 的实测注释），档位输出才可复现。
        temperature: 0,
        thinking: { type: "disabled" },
        stream: false,
      }),
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const result = await upstream.json();
    const content = result?.choices?.[0]?.message?.content;
    const judged = parsePracticalJudgeJson(content);
    if (!judged) throw new Error("unparsable judge payload");
    return json(scorePracticalResult(task, judged, "llm"));
  } catch {
    return json(heuristicPracticalScore(task, payload));
  }
}
