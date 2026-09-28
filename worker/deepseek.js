export const DEEPSEEK_CHAT_PATH = "/api/deepseek/chat";
export const ARK_IMAGE_PATH = "/api/ark/images";

// 图片生成服务（vLLM 代理）。允许用环境变量覆盖端点，便于换服务商。
const IMAGE_BASE_URL = "https://api.vllmproxy.com/v1";
const IMAGE_MODEL = "gpt-image-2";
// 尺寸白名单。注意这里**包含 16:9**（1536x864）：上游接受非标的 16:9 取值，
// 实测返回尺寸与请求完全一致。早期只放 gpt-image 的三个常规尺寸
// （1024x1024 / 1536x1024 / 1024x1536），其中最高只有 3:2，
// 于是"生成 16:9 海报/壁纸"这类明确要求比例的题目永远做不到规格合规。
const IMAGE_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "1536x864", "864x1536"]);
const IMAGE_QUALITIES = new Set(["standard", "hd"]);
const IMAGE_STYLES = new Set(["vivid", "natural"]);
// 参考图必须是 data URI（上游不接受裸 base64）；上限与前端上传数一致。
const ALLOWED_IMAGE_DATA_URI = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i;
const MAX_REFERENCE_IMAGES = 6;
// 上游生图耗时的上限。实测成功调用 40–75 秒；留足余量后仍要有个封顶，
// 否则上游长挂时这个请求会一直占着连接（前端另有 240s 超时兜底）。
const IMAGE_UPSTREAM_TIMEOUT_MS = 200_000;

const MAX_MESSAGES = 16;
const MAX_CONTENT_LENGTH = 12_000;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * 归一化聊天消息。
 *
 * content 支持两种形态：
 *   1. 字符串 —— 纯文本消息（绝大多数）
 *   2. 数组   —— 多模态消息，元素为 {type:"text",text} 或
 *              {type:"image_url",image_url:{url}}（data URI 或 http(s) URL）
 *
 * 多模态是实操任务上传图片所必需的：学员贴一张参考图，Agent 要能看见它。
 * deepseek-flash 支持 image 输入（官方 /models 的 input_modalities 含 image）。
 *
 * 校验要点：只放行白名单类型；图片 URL 必须是 data:image/* 或 http(s)，
 * 防止把任意字符串塞进上游请求。
 */
const ALLOWED_IMAGE_SCHEMES = /^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/)/i;
const MAX_IMAGES_PER_MESSAGE = 4;

function normalizeContent(content) {
  if (typeof content === "string") {
    const text = content.trim();
    if (!text || text.length > MAX_CONTENT_LENGTH) return null;
    return text;
  }
  if (Array.isArray(content)) {
    if (content.length === 0 || content.length > MAX_IMAGES_PER_MESSAGE * 2) return null;
    const parts = [];
    let imageCount = 0;
    let textLength = 0;
    for (const part of content) {
      if (!part || typeof part !== "object") return null;
      if (part.type === "text") {
        if (typeof part.text !== "string") return null;
        textLength += part.text.length;
        if (textLength > MAX_CONTENT_LENGTH) return null;
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        const url = part.image_url?.url;
        if (typeof url !== "string" || !ALLOWED_IMAGE_SCHEMES.test(url)) return null;
        imageCount += 1;
        if (imageCount > MAX_IMAGES_PER_MESSAGE) return null;
        parts.push({ type: "image_url", image_url: { url } });
      } else {
        return null;
      }
    }
    // 至少要有一段文字，否则模型没有指令可执行
    if (!parts.some((p) => p.type === "text" && p.text.trim())) return null;
    return parts;
  }
  return null;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
  const allowedRoles = new Set(["system", "user", "assistant"]);
  const safe = messages.map(({ role, content }) => ({ role, content: normalizeContent(content) }));
  if (safe.some(({ role, content }) => !allowedRoles.has(role) || content === null)) return null;
  return safe;
}

export async function handleDeepSeekChat(request, apiKey, fetcher = fetch) {
  if (request.method !== "POST") return json({ error: "仅支持 POST 请求。" }, 405);
  if (!apiKey) return json({ error: "尚未配置 DeepSeek 服务。" }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "请求格式不正确。" }, 400);
  }

  const messages = normalizeMessages(payload.messages);
  if (!messages) return json({ error: "对话内容不符合要求。" }, 400);

  // One endpoint, two sampling regimes: the conversation track asks for
  // lively persona chat (client passes ~0.8) while the grading track needs
  // reproducible scores (client passes ~0.15). Unknown/absent callers keep
  // the historical default.
  const requestedTemp = Number(payload.temperature);
  const temperature = Number.isFinite(requestedTemp)
    ? Math.max(0, Math.min(2, requestedTemp))
    : 0.55;

  // 思考模式开关（官方 API 的 thinking 参数）。
  //
  // 为什么必须能关：官方文档明确 —— 「Thinking mode does not support the
  // temperature ... setting these parameters will not trigger an error but
  // will also have no effect.」即思考模式下 temperature 被静默忽略。
  //
  // 实测（本项目 30 份对话 × 10 个温度点）：
  //   关思考时温度真实生效，T=0 的 ICC 达 0.998、完全一致率 73%；
  //   开思考时同一批数据在所有温度下表现无差异（温度扫了个寂寞）。
  //
  // 因此打分轨必须关闭思考才能让温度真正起作用；聊天轨保留默认（思考开），
  // 因为它要靠模型的推理能力把话说得像人。
  const thinking = payload.thinking;
  const thinkingBody =
    thinking && typeof thinking === "object" && thinking.type === "disabled"
      ? { thinking: { type: "disabled" } }
      : {};

  const wantsStream = payload.stream !== false;
  let upstream;
  try {
    upstream = await fetcher("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages,
        temperature,
        stream: wantsStream,
        ...thinkingBody,
        ...(wantsStream ? { stream_options: { include_usage: true } } : {}),
      }),
    });
  } catch {
    return json({ error: "暂时无法连接 DeepSeek，请稍后重试。" }, 502);
  }

  if (!upstream.ok) {
    let detail = "DeepSeek 暂时无法完成本次回应。";
    try { detail = (await upstream.json())?.error?.message || detail; } catch { /* keep generic detail */ }
    return json({ error: detail }, upstream.status);
  }

  if (!wantsStream) {
    const result = await upstream.json();
    // 上游偶尔返回 200 但 content 为空（例如命中内容过滤、或模型只产出
    // reasoning 而没给最终答案）。以前这里用 `|| ""` 把空回复伪装成正常
    // 结果，调用方拿到空字符串后既不报错也没有内容——界面上表现为"记者的
    // 话迟迟不来"。现在把它变成明确的错误，让调用方走兜底话术。
    const message = result?.choices?.[0]?.message?.content;
    if (typeof message !== "string" || message.trim() === "") {
      const finish = result?.choices?.[0]?.finish_reason;
      return json({ error: `模型未返回内容${finish ? `（${finish}）` : ""}，请重试。` }, 502);
    }
    return json({ message });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

/**
 * 图片生成：vLLM 代理的 gpt-image-2。
 *
 * **两个端点的分工（这是实测出来的，必须按此分流）**：
 *
 *   无参考图 → POST /images/generations
 *     body: { model, prompt, n, size, quality, style }
 *     纯文生图，可用。
 *
 *   有参考图 → POST /images/edits
 *     body: { model, prompt, n, size, images: [{ image_url }] }
 *     图生图（扩图、风格迁移）**必须走这个端点**。
 *
 * 踩过的坑（都验证过）：
 *   1. generations + image:[dataURI] 返回 200，但**参考图被静默忽略**：
 *      不报错、字段照收，产物却与参考图毫无关系。lite-004（把落日水面
 *      竖图扩成 16:9）的实测产物是"樱花古装少女"的二次元图 —— 内容、风格、
 *      色调、构图全不对。任何"只看请求体"的验证都发现不了这一点，
 *      必须看产物图片本身。
 *      edits 端点会真正吃参考图：同一道题返回的是原图落日水面 + 钓鱼剪影，
 *      仅向两侧扩展 —— 正是"扩图"该有的结果。
 *   2. **不要传 response_format** —— 文档称支持 url|b64_json，但实测
 *      传 response_format:"url" 会让上游在约 10 秒后断开连接
 *      （Node 侧报 UND_ERR_SOCKET，curl 侧同样失败）。
 *      不传该参数时，上游稳定返回 data[0].b64_json。
 *   3. size 受白名单限制（见 IMAGE_SIZES）。上游接受非标的 16:9
 *      （1536x864 实测按请求尺寸返回），所以"生成 16:9 海报"能真正做到
 *      规格合规 —— 早期白名单里最高只有 3:2，这类题目永远做不对。
 *   4. 返回的图片是 base64（单张约 1.5–2.7 MB），本函数转成 data URI
 *      交给前端，调用方不必关心编码差异。
 */
export async function handleArkImage(request, apiKey, fetcher = fetch) {
  if (request.method !== "POST") return json({ error: "仅支持 POST 请求。" }, 405);
  if (!apiKey) return json({ error: "尚未配置图片生成服务。" }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "请求格式不正确。" }, 400);
  }
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt || prompt.length > 4_000) return json({ error: "图片提示词不符合要求。" }, 400);

  // 参考图：学员上传的图 + 任务自带素材。
  //
  // 为什么必须支持：图片类任务（如"把这张竖屏图扩成 16:9"、"按这张风格图
  // 迁移水墨画风"）的全部意义就在于"我有一张图"。参考图没被真正采用时，
  // 学员传了图却对结果毫无影响，题目也就失去意义。
  //
  // 上游要求 data URI 形态（带 data:image/...;base64, 前缀的完整串）；
  // 实测纯 base64 会被拒。同时上限取 6 张，与前端上传上限一致。
  const rawRefs = payload.image;
  let images = [];
  if (typeof rawRefs === "string") images = [rawRefs];
  else if (Array.isArray(rawRefs)) images = rawRefs.filter((x) => typeof x === "string");
  images = images.filter((src) => ALLOWED_IMAGE_DATA_URI.test(src)).slice(0, MAX_REFERENCE_IMAGES);

  const size = IMAGE_SIZES.has(payload.size) ? payload.size : "1024x1024";

  // 有参考图走 edits，无参考图走 generations（见函数头注释的实测说明）。
  const useEdits = images.length > 0;
  // 注意：绝不传 response_format —— 上游收到它会断连（见函数头注释）。
  // edits 不接受 quality/style，只发它认识的字段。
  const body = useEdits
    ? { model: IMAGE_MODEL, prompt, n: 1, size, images: images.map((image_url) => ({ image_url })) }
    : {
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size,
        quality: IMAGE_QUALITIES.has(payload.quality) ? payload.quality : "standard",
        style: IMAGE_STYLES.has(payload.style) ? payload.style : "vivid",
      };
  const endpoint = useEdits ? `${IMAGE_BASE_URL}/images/edits` : `${IMAGE_BASE_URL}/images/generations`;

  let upstream;
  try {
    upstream = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      // 上游正常 40–75 秒返回，偶发长挂。加超时避免占着连接不放，
      // 也让前端拿到明确的错误而不是永久等待。
      signal: AbortSignal.timeout(IMAGE_UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return json({ error: "图片生成服务响应超时，请稍后重试。" }, 504);
    }
    return json({ error: "暂时无法连接图片生成服务，请稍后重试。" }, 502);
  }

  if (!upstream.ok) {
    let detail = "图片生成服务暂时无法完成本次任务。";
    try {
      const err = await upstream.json();
      detail = err?.error?.message || err?.message || detail;
    } catch { /* keep generic detail */ }
    return json({ error: detail }, upstream.status);
  }

  const result = await upstream.json();
  const item = result?.data?.[0];
  if (!item) return json({ error: "图片服务未返回图片数据。" }, 502);

  // 上游稳定返回 b64_json；同时兼容将来可能出现的 url 形态
  if (typeof item.b64_json === "string" && item.b64_json) {
    return json({ image: `data:image/png;base64,${item.b64_json}` });
  }
  if (typeof item.url === "string" && item.url) return json({ image: item.url });
  return json({ error: "图片服务未返回可用的图片数据。" }, 502);
}
