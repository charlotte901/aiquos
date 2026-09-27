import test from "node:test";
import assert from "node:assert/strict";
import { ARK_IMAGE_PATH, DEEPSEEK_CHAT_PATH, handleArkImage, handleDeepSeekChat } from "../worker/deepseek.js";

const requestFor = (body, method = "POST") => new Request(`http://local.test${DEEPSEEK_CHAT_PATH}`, {
  method,
  headers: { "content-type": "application/json" },
  body: method === "POST" ? JSON.stringify(body) : undefined,
});

test("DeepSeek proxy keeps the credential server-side and rejects missing configuration", async () => {
  const response = await handleDeepSeekChat(requestFor({ messages: [{ role: "user", content: "你好" }] }), "");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "尚未配置 DeepSeek 服务。");
});

test("DeepSeek proxy validates content and relays the streaming response", async () => {
  const calls = [];
  const response = await handleDeepSeekChat(
    requestFor({ messages: [{ role: "user", content: "请给建议" }], stream: true }),
    "test-key",
    async (...args) => {
      calls.push(args);
      return new Response('data: {"choices":[{"delta":{"content":"已连接"}}]}\n\ndata: [DONE]\n\n', {
        headers: { "content-type": "text/event-stream" },
      });
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.match(await response.text(), /已连接/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0][1].headers.authorization, "Bearer test-key");
  assert.match(calls[0][1].body, /"model":"deepseek-flash"/);
});

test("DeepSeek proxy honours per-request temperature with clamping and a sane default", async () => {
  const calls = [];
  const relay = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ choices: [{ message: { content: "好" } }] }), {
      headers: { "content-type": "application/json" },
    });
  };
  // 聊天轨 0.85 / 打分轨 0.15 原样透传；越界钳制到 [0,2]；缺省回落 0.55。
  await handleDeepSeekChat(requestFor({ messages: [{ role: "user", content: "a" }], stream: false, temperature: 0.85 }), "k", relay);
  await handleDeepSeekChat(requestFor({ messages: [{ role: "user", content: "b" }], stream: false, temperature: 0.15 }), "k", relay);
  await handleDeepSeekChat(requestFor({ messages: [{ role: "user", content: "c" }], stream: false, temperature: 99 }), "k", relay);
  await handleDeepSeekChat(requestFor({ messages: [{ role: "user", content: "d" }], stream: false }), "k", relay);
  const temps = calls.map(([, init]) => JSON.parse(init.body).temperature);
  assert.deepEqual(temps, [0.85, 0.15, 2, 0.55]);
});

test("an empty upstream reply becomes an explicit error, not a silent blank", async () => {
  // 回归：上游偶尔 200 但 content 为空（内容过滤 / 只出 reasoning）。
  // 以前用 `|| ""` 静默成空消息，调用方拿到空串后既不报错也没内容——
  // 对话测评里表现为"记者不答复了"。必须变成明确错误。
  const relay = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "" }, finish_reason: "length" }],
  }), { headers: { "content-type": "application/json" } });

  const response = await handleDeepSeekChat(
    requestFor({ messages: [{ role: "user", content: "在吗" }], stream: false }),
    "test-key",
    relay,
  );
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.match(body.error, /未返回内容/);
  assert.match(body.error, /length/, "应带上 finish_reason 便于排查");
  assert.equal(body.message, undefined, "不能把空串当成正常 message 返回");
});

test("a whitespace-only reply is treated as empty too", async () => {
  const relay = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "   \n  " } }],
  }), { headers: { "content-type": "application/json" } });
  const response = await handleDeepSeekChat(
    requestFor({ messages: [{ role: "user", content: "在吗" }], stream: false }),
    "test-key",
    relay,
  );
  assert.equal(response.status, 502);
});

test("normal replies still pass through unchanged", async () => {
  const relay = async () => new Response(JSON.stringify({
    choices: [{ message: { content: " 哦？自己做游戏。说来听听。 " } }],
  }), { headers: { "content-type": "application/json" } });
  const response = await handleDeepSeekChat(
    requestFor({ messages: [{ role: "user", content: "我做了一款游戏" }], stream: false }),
    "test-key",
    relay,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, " 哦？自己做游戏。说来听听。 ");
});

test("DeepSeek proxy does not accept unsafe chat payloads", async () => {
  const response = await handleDeepSeekChat(requestFor({ messages: [{ role: "tool", content: "not allowed" }] }), "test-key");
  assert.equal(response.status, 400);
});

test("image proxy 调用 vLLM 代理的 gpt-image-2，并把 b64 转成 data URI", async () => {
  const calls = [];
  // 上游稳定返回 b64_json（实测；不传 response_format 时）
  const fakeB64 = "iVBORw0KGgoAAAANSUhEUg=="; // 极简 base64 片段，够验证转换逻辑
  const request = new Request(`http://local.test${ARK_IMAGE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "一只橘猫坐在窗台上看夕阳，水彩风格" }),
  });
  const response = await handleArkImage(request, "image-test-key", async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ data: [{ b64_json: fakeB64, revised_prompt: "x" }] }), {
      headers: { "content-type": "application/json" },
    });
  });

  assert.deepEqual(await response.json(), { image: `data:image/png;base64,${fakeB64}` });
  assert.equal(calls[0][0], "https://api.vllmproxy.com/v1/images/generations");
  assert.equal(calls[0][1].headers.authorization, "Bearer image-test-key");

  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.model, "gpt-image-2");
  assert.equal(body.n, 1);
  assert.equal(body.size, "1024x1024");
  // 关键回归：绝不能带 response_format —— 实测上游收到它会断开连接
  assert.ok(!("response_format" in body), "不得传 response_format（会导致上游断连）");
});

test("image proxy 白名单校验可选参数，非法值回落默认", async () => {
  const calls = [];
  const request = new Request(`http://local.test${ARK_IMAGE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "测试", size: "9999x9999", quality: "ultra", style: "weird" }),
  });
  await handleArkImage(request, "k", async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ data: [{ b64_json: "AA==" }] }), {
      headers: { "content-type": "application/json" },
    });
  });
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.size, "1024x1024", "非法 size 应回落默认");
  assert.equal(body.quality, "standard", "非法 quality 应回落默认");
  assert.equal(body.style, "vivid", "非法 style 应回落默认");
});

test("image proxy 兼容将来可能出现的 url 返回形态", async () => {
  const request = new Request(`http://local.test${ARK_IMAGE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "测试" }),
  });
  const response = await handleArkImage(request, "k", async () =>
    new Response(JSON.stringify({ data: [{ url: "https://example.test/a.png" }] }), {
      headers: { "content-type": "application/json" },
    }));
  assert.deepEqual(await response.json(), { image: "https://example.test/a.png" });
});


test("思考模式可被显式关闭（温度在思考模式下会被忽略）", async () => {
  // 官方文档：Thinking mode 下 temperature 不生效（不报错但无作用）。
  // 打分轨必须关思考才能让温度真正起作用，所以 worker 要能透传 thinking。
  const calls = [];
  const relay = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ choices: [{ message: { content: "好" } }] }), {
      headers: { "content-type": "application/json" },
    });
  };

  // 显式关闭：应把 thinking 透传给上游
  await handleDeepSeekChat(
    requestFor({ messages: [{ role: "user", content: "a" }], stream: false, thinking: { type: "disabled" } }),
    "k", relay,
  );
  assert.match(calls[0][1].body, /"thinking":\{"type":"disabled"\}/);

  // 不传：不应出现 thinking 字段（保持服务端默认 = 思考开）
  await handleDeepSeekChat(
    requestFor({ messages: [{ role: "user", content: "b" }], stream: false }),
    "k", relay,
  );
  assert.ok(!calls[1][1].body.includes("thinking"), "未请求时应保持默认，不注入 thinking");

  // 非法值：忽略，不透传
  await handleDeepSeekChat(
    requestFor({ messages: [{ role: "user", content: "c" }], stream: false, thinking: "hack" }),
    "k", relay,
  );
  assert.ok(!calls[2][1].body.includes("thinking"), "非法的 thinking 值不应透传");
});

// ── 多模态消息（实操任务上传参考图）──────────────────────────────────────

test("worker 接受带图片的多模态消息并原样透传", async () => {
  const calls = [];
  const relay = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ choices: [{ message: { content: "好" } }] }), {
      headers: { "content-type": "application/json" },
    });
  };
  const dataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  await handleDeepSeekChat(requestFor({
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "按这张图生成提示词" },
        { type: "image_url", image_url: { url: dataUri } },
      ],
    }],
    stream: false,
  }), "k", relay);

  const sent = JSON.parse(calls[0][1].body);
  const content = sent.messages[0].content;
  assert.ok(Array.isArray(content), "多模态 content 应保持数组形态");
  assert.equal(content[0].text, "按这张图生成提示词");
  assert.equal(content[1].image_url.url, dataUri);
});

test("worker 接受 http(s) 图片 URL", async () => {
  const calls = [];
  const relay = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      headers: { "content-type": "application/json" },
    });
  };
  const res = await handleDeepSeekChat(requestFor({
    messages: [{ role: "user", content: [
      { type: "text", text: "看这张" },
      { type: "image_url", image_url: { url: "https://example.test/a.png" } },
    ] }],
    stream: false,
  }), "k", relay);
  assert.equal(res.status, 200);
});

test("worker 拒绝非法的多模态内容", async () => {
  const relay = async () => new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }), {
    headers: { "content-type": "application/json" },
  });
  const bad = [
    // 非图片协议
    [{ type: "text", text: "x" }, { type: "image_url", image_url: { url: "file:///etc/passwd" } }],
    // javascript 协议
    [{ type: "text", text: "x" }, { type: "image_url", image_url: { url: "javascript:alert(1)" } }],
    // 未知部件类型
    [{ type: "text", text: "x" }, { type: "audio", data: "..." }],
    // 只有图片没有文字指令
    [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }],
    // 缺 image_url
    [{ type: "text", text: "x" }, { type: "image_url" }],
  ];
  for (const content of bad) {
    const res = await handleDeepSeekChat(
      requestFor({ messages: [{ role: "user", content }], stream: false }), "k", relay);
    assert.equal(res.status, 400, `应拒绝：${JSON.stringify(content).slice(0, 60)}`);
  }
});

test("纯文本消息仍是字符串（不因多模态支持而改变形态）", async () => {
  const calls = [];
  const relay = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      headers: { "content-type": "application/json" },
    });
  };
  await handleDeepSeekChat(requestFor({
    messages: [{ role: "user", content: "  普通文本  " }], stream: false,
  }), "k", relay);
  assert.equal(JSON.parse(calls[0][1].body).messages[0].content, "普通文本");
});
