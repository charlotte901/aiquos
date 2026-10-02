const END_EVENT = "[DONE]";

/** 瞬时性连接错误：连接被中途掐断（AbortError——实测 dev 链路上长请求偶发，
 * 错误信息裸露为 "Aborted"）、网络抖动（TypeError: Failed to fetch）、
 * 上游超时。这类错误重试通常即愈；服务端明确返回的 4xx/5xx 不算瞬时，
 * 重试无意义。 */
function isTransientError(error) {
  return error?.name === "AbortError"
    || error?.name === "TimeoutError"
    || error?.name === "TypeError"
    || error?.name === "NetworkError";
}

const RETRY_DELAY_MS = 800;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function readError(response) {
  return response.json().then((payload) => payload?.error || "DeepSeek 暂时无法完成回应。").catch(() => "DeepSeek 暂时无法完成回应。");
}

async function streamDeepSeekOnce({ messages, onDelta, onReasoning, signal }) {
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
  let reasoning = "";

  const consume = (chunk) => {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === END_EVENT) continue;
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta;
        const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning;
        if (reasoningDelta) {
          reasoning += reasoningDelta;
          onReasoning?.(reasoning);
        }
        const contentDelta = delta?.content;
        if (contentDelta) {
          complete += contentDelta;
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

/** 带一次重试的流式对话：仅当**一字未收**就断链时才重试（已流出部分
 * 内容无法安全重来）。聊天/采访调用方因此对瞬时断链自愈，不再闪离线。 */
export async function streamDeepSeek(options) {
  try {
    return await streamDeepSeekOnce(options);
  } catch (error) {
    if (!isTransientError(error) || options?.signal?.aborted) throw error;
    await sleep(RETRY_DELAY_MS);
    return streamDeepSeekOnce(options);
  }
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
async function generateArkImageOnce({ prompt, images = [], size, signal }) {
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

/** 带一次重试的生图：连接被掐断（"Aborted"）或网络抖动时自动补一发。
 * 每次尝试各自新建 240s 超时（最坏 2×75s 实测耗时仍远在其内），不复用
 * 已中止的信号。两次都失败才把错误抛给界面走占位图降级。 */
export async function generateArkImage(options) {
  try {
    return await generateArkImageOnce(options);
  } catch (error) {
    if (!isTransientError(error) || options?.signal?.aborted) throw error;
    await sleep(RETRY_DELAY_MS);
    return generateArkImageOnce(options);
  }
}
