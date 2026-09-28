const END_EVENT = "[DONE]";

function readError(response) {
  return response.json().then((payload) => payload?.error || "DeepSeek 暂时无法完成回应。").catch(() => "DeepSeek 暂时无法完成回应。");
}

export async function streamDeepSeek({ messages, onDelta, signal }) {
  const response = await fetch("/api/deepseek/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, stream: true }),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error("DeepSeek 未返回可读取的内容。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = "";

  const consume = (chunk) => {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === END_EVENT) continue;
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (delta) {
          complete += delta;
          onDelta(complete);
        }
      } catch {
        // Ignore non-content SSE frames and retain the valid streamed output.
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    frames.forEach(consume);
    if (done) break;
  }
  if (buffer) consume(buffer);
  return complete;
}

/** 生图耗时的默认上限。
 *
 * 实测（vLLM 代理 gpt-image-2）：成功调用约 40–75 秒，但也遇到过 240 秒无响应。
 * 没有超时兜底时，请求会长挂、界面停在"正在生成"不动，学员只能干等。
 * 240 秒足够覆盖实测最慢的成功调用，又能把"卡死"限定在可接受范围内。 */
const IMAGE_TIMEOUT_MS = 240_000;

/**
 * 生成图片。
 *
 * @param {string} prompt 画面描述
 * @param {string[]} [images] 参考图（data URI）。图片类任务（扩图、风格迁移）
 *   必须把参考图传过去，否则 Agent 看不到输入图，只能凭空生成。
 *   服务端据此走 /images/edits（图生图）；无参考图时走 /images/generations。
 * @param {string} [size] 输出尺寸（须在白名单内）。任务对画面比例有硬要求时
 *   必须传，否则默认方形（1024x1024），"生成 16:9 海报"这类题目会不达标。
 */
export async function generateArkImage({ prompt, images = [], size, signal }) {
  const body = { prompt };
  if (Array.isArray(images) && images.length) body.image = images;
  if (size) body.size = size;

  // 调用方没给 signal 时，用 AbortSignal.timeout 兜住长挂；
  // 两者都允许时以调用方的 signal 为主（timeout 仍作为上限叠加）。
  const timeout = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  try {
    response = await fetch("/api/ark/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (error) {
    // 超时要给出可读原因：否则上层只会显示笼统的"生成失败"。
    if (timeout.aborted && !signal?.aborted) {
      throw new Error("图片生成超时（超过 4 分钟未返回），请重试或稍后再试。");
    }
    throw error;
  }
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json();
  if (!payload.image) throw new Error("图片服务未返回图片地址。");
  return payload.image;
}
