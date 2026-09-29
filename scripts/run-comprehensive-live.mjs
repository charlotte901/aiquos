/**
 * 真实综合测评全流程运行器（升级版：对话定档 → 自适应客观题 → 实操 → 报告）。
 *
 *   node scripts/run-comprehensive-live.mjs [base]
 *
 * 与 qa-full-e2e 的区别：这条走的是「综合测评」完整链路（3 个计时阶段 + 觉醒
 * 报告），并注入 fetch 追踪器记录每一道 CAT 题、定档先验与三通道报告数据，
 * 产物落在 work/comprehensive-upgrade/real-run/：
 *   - trace.json      全部网络追踪（出题请求/响应、定档、评分）
 *   - snapshot.json   localStorage 历史里的最终快照（vendor result + composite）
 *   - report.md       从页面提取的报告文本
 *   - shots/*.png     关键节点截图
 *
 * 学员人设：中上水平（θ* = +0.5）——对话回答有具体事例与取舍，客观题按
 * 1PL 概率作答，实操写结构化提示词并迭代一次。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://127.0.0.1:4286";
const OUT = "work/comprehensive-upgrade/real-run";
mkdirSync(`${OUT}/shots`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

// ── 学员人设 ────────────────────────────────────────────────────────────────
const THETA_STAR = 0.5;
const PERSONA_ANSWERS = [
  // experience：具体事例 + 工具 + 结果 + 一点反思（0.65–0.8 档）
  "上个月做毕业设计开题，我把 20 篇英文文献丢给 DeepSeek 让它每篇提炼研究问题、方法和结论各一句话，它整理成表格后我逐条核对原文，发现它把两篇的方法张冠李戴了，我自己改掉之后再用它重排了格式，最后开题综述省了大概两天。",
  // goal：对象 + 产出形态 + 完成标准（0.65–0.8 档）
  "我会说：帮我给非计算机专业的读者写一份 800 字以内的注意力机制科普，分「是什么、为什么重要、一个例子」三段，至少举一个生活化的类比，不要出现公式。做完我拿给室友看，她能复述出来就算合格。",
  // constraints：两条以上独立约束 + 取舍理由（0.8 档）
  "我一般固定加三条：800 字以内、分「是什么/为什么重要/一个例子」三段、不许出现公式和术语堆砌。字数卡这么死是因为读者是新手，长了就没人看完；不要公式是因为他们看到公式会直接放弃。风格和语气我不限定，留给模型发挥。",
  // feedback：指出保留什么 + 改什么 + 判据（0.8 档）
  "先肯定再修：我会说「第二段的类比保留，第一段太学术，改成生活场景开头；另外补一个真实应用，比如翻译软件」。改到什么程度算好——我妈能一口气读完不卡壳，就算过关；她还停下来问细节的话，说明还不够顺。",
  // consolidate：四要素 + 承接细节 + 复用说明（0.8–0.92 档）
  "你是科普写作者：为非专业的本科生把「注意力机制」写成 800 字以内短文，分「是什么/为什么重要/一个例子」三段，用一个生活化类比、不出现公式，结尾用一句话说清它解决了什么问题。换成别的概念时只替换主题词，段落结构和约束照旧。",
];
// 任务感知提示词库：难度匹配会按 θ̂ 派任务（可能是代码/图片/文本任一种），
// 人设提示词必须与派到的任务对应，否则评委按 rubric 判「待改进」是正确行为。
const PROMPT_BANK = {
  code: {
    v1: "你是资深 Python 工程师。请重构素材中的复利本息和计算器：用幂运算替代逐期循环累加，去掉不必要的列表拼接，为非法输入（负数本金、非数字利率、期数为 0）补齐异常处理，保持对既有基准用例结果不变；重构后先自检三组典型用例（本金 10000/利率 5%/期数 10 一组、边界值两组），再输出完整代码与不超过 120 字的重构说明。",
    v2: "在上一版基础上调整：把异常处理收敛为单一的参数校验函数，主流程只保留计算逻辑；说明部分补充一条复杂度对比（重构前后）。",
  },
  image: {
    v1: "你是插画指导。请把参考照片转成水墨扁平插画：保留建筑主体的位置、朝向与大结构，剔除背景杂乱细节；整体走极简几何解构，分层平涂色块并带毛笔晕染笔触，大量米色留白；画面下方留白处居中排两行英文标题（主标题加副标题）与一条装饰分隔线。输出 3:2 横幅。",
    v2: "在上一版基础上调整：主体占比再放大一成，标题上移并居中，色块饱和度整体再降一档，边缘加轻微晕染过渡。",
  },
  essay: {
    v1: "你是课程助教。请基于素材写一篇 800 字以内的小论文：观点—论证—结论三段式，至少引用两处课程材料并标注出处，语气学术、不用口语与网络词，结尾附 50 字摘要。",
    v2: "在上一版基础上调整：论证段补一个反面观点并回应，全文再压缩 10%，其余保持。",
  },
  generic: {
    v1: "你是专业执行者。请按任务目标完成交付：先确认对象与产出形态，写明两条以上可检验的约束（篇幅/结构/风格），按「背景—做法—验收标准」组织，输出前逐条自查交付标准。",
    v2: "在上一版基础上调整：补齐遗漏的交付标准项，篇幅收紧 10%，其余保持。",
  },
};
const taskKindOf = (title) => /复利|代码|计算器|重构|程序/.test(title) ? "code"
  : /插画|海报|水墨|图片|绘画|视觉/.test(title) ? "image"
  : /论文|随笔|报告|文案|总结/.test(title) ? "essay"
  : "generic";

// 1PL 作答策略：P(答对) = σ(θ* − b)。错误时挑一个错误选项。
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
function decideKeys(question, rng) {
  const answerKeys = question.answer;
  const pCorrect = sigmoid(THETA_STAR - { low: -1, medium: 0, high: 1 }[question.difficulty]);
  const correct = rng() < pCorrect;
  if (correct) return { keys: answerKeys, correct: true, pCorrect };
  const wrongOptions = question.options.filter((option) => !answerKeys.includes(option.key));
  if (question.type === "multi" && wrongOptions.length > 0 && answerKeys.length > 1) {
    // 漏选 + 误选的组合：部分分路径。
    const keys = [...answerKeys.slice(0, Math.max(1, answerKeys.length - 1)), wrongOptions[0].key];
    return { keys: [...new Set(keys)], correct: false, pCorrect };
  }
  if (wrongOptions.length === 0) return { keys: answerKeys, correct: true, pCorrect };
  return { keys: [wrongOptions[Math.floor(rng() * wrongOptions.length) % wrongOptions.length].key], correct: false, pCorrect };
}

// ── CDP 基础设施 ────────────────────────────────────────────────────────────
const profile = join(tmpdir(), `aiquos-live-${Date.now()}`);
const child = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9371", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  try { if ((await fetch("http://127.0.0.1:9371/json/version")).ok) break; } catch {}
}
const target = await (await fetch("http://127.0.0.1:9371/json/new?about:blank", { method: "PUT" })).json();
const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let messageId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++messageId;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return reply.result?.result?.value;
};
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

// 在任何页面脚本之前注入 fetch 追踪器。
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    (() => {
      const originalFetch = window.fetch.bind(window);
      window.__trace = { cat: [], seed: null, practicalScore: null, deepseek: 0, ark: 0 };
      window.fetch = async (input, init = {}) => {
        const url = typeof input === "string" ? input : input.url;
        const method = (init.method || "GET").toUpperCase();
        const response = await originalFetch(input, init);
        if (url.includes("/api/comprehensive-question")) {
          try {
            const body = JSON.parse(init.body || "{}");
            const clone = response.clone();
            const data = await clone.json();
            window.__trace.cat.push({
              request: { session: body.session ?? null, interviewSeed: body.interviewSeed ?? null, outcome: body.outcome ?? null, coverageCritical: body.coverageCritical ?? false },
              response: { id: data.question?.id, difficulty: data.question?.difficulty, type: data.question?.type, dimKeys: data.question?.dimKeys, answer: data.question?.answer, options: data.question?.options ?? [], session: data.session, debug: data.debug ?? null },
            });
          } catch {}
        } else if (url.includes("/api/practical-score")) {
          try {
            const clone = response.clone();
            window.__trace.practicalScore = await clone.json();
          } catch {}
        } else if (url.includes("/api/deepseek/chat")) { window.__trace.deepseek += 1; }
        else if (url.includes("/api/ark/images")) { window.__trace.ark += 1; }
        return response;
      };
    })();
  `,
});

async function shot(name) {
  const page = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/shots/${name}.png`, Buffer.from(page.result.data, "base64"));
}
const shotIf = async (name, condition) => { if (condition) await shot(name); };
const go = async (hash, wait = 3500) => {
  await send("Page.navigate", { url: `${BASE}/${hash}` });
  await sleep(wait);
};
const problems = [];
const check = (label, ok, detail = "") => {
  log(`${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) problems.push(`${label}${detail ? ": " + detail : ""}`);
};

// 通用：跳过剧情对话（开场/结尾）。
const skipStory = async () => {
  for (let i = 0; i < 10; i += 1) {
    if (await evaluate("!document.querySelector('.comprehensive-dialogue-screen')")) return;
    await evaluate("document.querySelector('.comprehensive-dialogue-screen')?.click()");
    await sleep(700);
  }
};

// ── 入口：登录 → CHOOSE → TEST hub → 综合测评 ──────────────────────────────
log("进入登录页 → CHOOSE → 测评中心");
await go("#login", 4500);
await shot("01-login");
await evaluate("document.querySelector('.login-form button[type=submit], .login-form button')?.click()");
await sleep(2600);
await evaluate("[aria-label='测试闯关 · 走进智核域'] , [...document.querySelectorAll('.choose-card')].find(c => c.textContent.includes('测试闯关'))?.click()");
await sleep(2800);
await shot("02-testhub");
const comprehensiveCard = "[...document.querySelectorAll('.assessment-card')].find(c => c.textContent.includes('综合'))";
await evaluate(`${comprehensiveCard}?.click()`);
await sleep(3000);
check("进入综合测评关卡地图", await evaluate("!!document.querySelector('.map-stage')"));

// ── 阶段 1：对话式测评 ──────────────────────────────────────────────────────
log("阶段 1 · 对话式测评");
await evaluate("[...document.querySelectorAll('.map-stage')].find(b => b.className.includes('is-active'))?.click()");
await sleep(3000);
await skipStory();
// 等采访输入框就绪。
let ready = false;
for (let i = 0; i < 50; i += 1) {
  ready = await evaluate("!!document.querySelector('.interview-composer input') && !document.querySelector('.interview-composer input').disabled");
  if (ready) break;
  await sleep(800);
}
check("采访输入框就绪", ready);
await shot("03-interview");

const answerInterview = async (text, index) => {
  await evaluate(`(() => {
    const input = document.querySelector('.interview-composer input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.interview-composer button')?.click()");
  for (let i = 0; i < 140; i += 1) {
    const busy = await evaluate("!!document.querySelector('.chat-bubble.is-judging') || !!document.querySelector('.chat-bubble.is-typing')");
    const enabled = await evaluate("document.querySelector('.interview-composer input')?.disabled === false");
    const summary = await evaluate("!!document.querySelector('.interview-summary')");
    if (summary || (!busy && enabled)) return;
    if (i === 120) {
      // 卡住超 100 秒：截图留档，供事后诊断（聊天轨悬挂/打字投递中断）。
      await shot(`stall-interview-a${index + 1}`);
    }
    await sleep(900);
  }
};
const RESERVE_ANSWERS = [
  "结果做得不错：它给的是一份可以直接放进 PPT 的表格，我核对了三个数字都对，标题层级也按我说的分了两级。",
  "验收标准就一条：室友读完能用自己的话说出「注意力机制解决了什么问题」，说不出来就打回去重写。",
  "约束再加一条：不用「赋能」「抓手」这类空词，出现了就让它换掉——这种词一多，科普就成了黑话。",
];
const allAnswers = [...PERSONA_ANSWERS, ...RESERVE_ANSWERS];
let answerIndex = 0;
for (const answer of allAnswers) {
  answerIndex += 0;
  if (await evaluate("!!document.querySelector('.interview-summary')")) break;
  const stillAsking = await evaluate("!!document.querySelector('.interview-composer input') && !document.querySelector('.interview-composer input').disabled");
  if (!stillAsking) break;
  log("  回答话题 #" + (answerIndex + 1) + ":", answer.slice(0, 26) + "…");
  await answerInterview(answer, answerIndex);
  answerIndex += 1;
  await sleep(400);
}
// 收尾话术需要时间（打字投递）；给足等待，并持续输出进度诊断。
for (let i = 0; i < 90; i += 1) {
  if (await evaluate("!!document.querySelector('.interview-summary')")) break;
  if (i % 10 === 0) {
    const progress = await evaluate("document.querySelector('.interview-who span:last-child')?.textContent ?? document.querySelector('.interview-head span')?.textContent ?? ''");
    log("  等待收尾…", progress);
  }
  await sleep(1000);
}
check("采访自然收尾", await evaluate("!!document.querySelector('.interview-summary')"));
await shot("04-interview-summary");
await evaluate("document.querySelector('.interview-summary .task-action')?.click()");
await sleep(1500);
await skipStory();
await sleep(1500);

// ── 阶段 2：客观题 CAT（定档驱动） ─────────────────────────────────────────
log("阶段 2 · 自适应客观题（按对话定档）");
await evaluate("[...document.querySelectorAll('.map-stage')].find(b => b.className.includes('is-active'))?.click()");
await sleep(3000);
await skipStory();

let rngState = 20260929;
const rng = () => { rngState = (rngState * 9301 + 49297) % 233280; return rngState / 233280; };
const servedById = async () => {
  const list = await evaluate("window.__trace?.cat?.map(t => t.response.id) ?? []");
  return list ?? [];
};
let answeredCount = 0;
const seenIds = new Set();
for (let round = 0; round < 30; round += 1) {
  if (await evaluate("!!document.querySelector('.stage-complete')")) break;
  const questionText = await evaluate("document.querySelector('.objective-task h2')?.textContent ?? ''");
  if (!questionText) { await sleep(1500); continue; }
  const ids = await servedById();
  const currentId = ids.findLast ? ids.findLast((id) => !seenIds.has(id)) : [...ids].reverse().find((id) => !seenIds.has(id));
  const trace = await evaluate(`window.__trace?.cat?.find(t => t.response.id === ${JSON.stringify(currentId)}) ?? null`);
  if (!trace) { await sleep(1000); continue; }
  seenIds.add(currentId);
  const decision = decideKeys(trace.response, rng);
  log(`  Q${answeredCount + 1} ${trace.response.difficulty}/${trace.response.type} P=${decision.pCorrect.toFixed(2)} → ${decision.correct ? "对" : "错"} (${currentId})`);
  for (const key of decision.keys) {
    const index = trace.response.answer.length >= 0
      ? (await evaluate(`(() => {
          const opts = [...document.querySelectorAll('.comprehensive-option span')];
          const first = opts.findIndex(o => o.textContent.trim() === ${JSON.stringify(key)});
          return first;
        })()`))
      : 0;
    const optionIndex = index >= 0 ? index : 0;
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: String(${optionIndex + 1}), bubbles: true }))`);
    await sleep(350);
  }
  const isMulti = trace.response.type === "multi";
  if (isMulti) {
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
    await sleep(600);
  }
  answeredCount += 1;
  // 等反馈出现，再按 Enter 继续。
  for (let i = 0; i < 20; i += 1) {
    if (await evaluate("!!document.querySelector('.quiz-feedback')")) break;
    await sleep(300);
  }
  await shotIf(`cat-q${answeredCount}`, answeredCount <= 3);
  await sleep(250);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
  await sleep(1400);
}
const stopText = await evaluate("document.querySelector('.stage-complete-lead')?.textContent ?? ''");
check(`客观题阶段完成（${answeredCount} 题）`, answeredCount >= 6, stopText.slice(0, 60));
await shot("05-cat-summary");
await evaluate("document.querySelector('.stage-complete-next button')?.click()");
await sleep(1500);
await skipStory();
await sleep(1500);

// ── 阶段 3：实操工作台 ──────────────────────────────────────────────────────
log("阶段 3 · 实操工作台");
await evaluate("[...document.querySelectorAll('.map-stage')].find(b => b.className.includes('is-active'))?.click()");
await sleep(3200);
await skipStory();
// 简报态 → 开始作答。
for (let i = 0; i < 20; i += 1) {
  if (await evaluate("!!document.querySelector('.wb-brief-start')")) break;
  await sleep(700);
}
await shot("06-brief");
await evaluate("document.querySelector('.wb-brief-start')?.click()");
await sleep(1800);
check("进入作答界面", await evaluate(`document.querySelector('.task-body')?.dataset.phase === 'work' && !!document.querySelector('.wb-composer textarea')`));
await shot("07-workbench");

const runPrompt = async (text) => {
  await evaluate(`(() => {
    const textarea = document.querySelector('.wb-composer textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, ${JSON.stringify(text)}); textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.agent-send')?.click()");
};
const taskTitle = await evaluate("document.querySelector('.workbench-head h2')?.textContent ?? document.querySelector('.wb-brief-head + h2, h2')?.textContent ?? ''");
const kind = taskKindOf(taskTitle || "");
log("  派到任务:", (taskTitle || "").slice(0, 30), "→ 提示词类型:", kind);
const bank = PROMPT_BANK[kind] ?? PROMPT_BANK.generic;
await runPrompt(bank.v1);
let generated = false;
for (let i = 0; i < 160; i += 1) {
  const done = await evaluate("!!document.querySelector('.wb-complete-row') || !!document.querySelector('.agent-error')");
  if (done) { generated = await evaluate("!!document.querySelector('.wb-complete-row')"); break; }
  await sleep(1500);
}
check("第一轮生成完成", generated);
await shot("08-generated");
// 迭代一次（体现「会评估会优化」）。
if (generated) {
  await runPrompt(bank.v2);
  // 第二轮的等待以「运行态结束」为准：Agent 执行中交卷按钮是 disabled，
  // 过早点击会让整场缺实操证据（实测踩过）。
  for (let i = 0; i < 220; i += 1) {
    const idle = await evaluate("!document.querySelector('.wb-turn-pending') && document.querySelector('.agent-send')?.disabled !== true && document.querySelectorAll('.wb-turn').length >= 2");
    if (idle) break;
    await sleep(1500);
  }
  await shot("09-iterated");
}
// 交卷按钮就绪后点击；未就绪（迭代仍在跑）最多再等 90 秒重试。
let finishState = "unavailable";
for (let i = 0; i < 60; i += 1) {
  finishState = await evaluate("(() => { const b = document.querySelector('.wb-complete-row .task-action'); if (!b) return 'missing'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()");
  if (finishState === "clicked") break;
  await sleep(1500);
}

check("交卷评分可点击", finishState === "clicked", finishState);
let scoreShown = false;
// 3 票评委对代码类任务实测可达 12 分钟以上（每票上游 2–4 分钟）。
// 上限 30 分钟；评分响应已到（trace）但界面未切换时再多给 60 秒。
let traceArrived = false;
for (let i = 0; i < 1200; i += 1) {
  scoreShown = await evaluate(`document.querySelector('.task-body')?.dataset.phase === 'score'`);
  if (scoreShown) break;
  if (!traceArrived) traceArrived = await evaluate('!!window.__trace?.practicalScore');
  if (traceArrived && i > 40 && (i % 20 === 0)) {
    // 响应已回但 60 秒未进 score：截图诊断一次。
    if (i === 60) await shot('stall-score-transition');
  }
  await sleep(1500);
}
check("评分报告呈现", scoreShown);
await shot("10-practical-score");
await evaluate("document.querySelector('.wb-score-screen .wb-brief-start')?.click()");
await sleep(1800);
await skipStory();

// ── 觉醒报告 ────────────────────────────────────────────────────────────────
log("觉醒报告");
for (let i = 0; i < 12; i += 1) {
  const onReports = await evaluate("location.hash.includes('reports') || !!document.querySelector('.awakening-report-card')");
  if (onReports) break;
  await sleep(1500);
}
await go("#reports", 4500);
await evaluate("document.querySelector('.awakening-dialogue')?.click()");
await sleep(600);
await evaluate("[...document.querySelectorAll('.awakening-dialogue, .awakening-dialogue .story-skip')].pop()?.click?.()");
await sleep(800);
check("报告页渲染", await evaluate("!!document.querySelector('.awakening-report-card')"));
await shot("11-report");
await shot("12-report-advice");

// ── 数据导出 ────────────────────────────────────────────────────────────────
const trace = await evaluate("window.__trace ? JSON.parse(JSON.stringify(window.__trace, (k, v) => k === 'answer' ? v : v)) : null");
const historyRaw = await evaluate("localStorage.getItem('aiquos.comprehensive-history.v1')");
const draftRaw = await evaluate("localStorage.getItem('aiquos.comprehensive-attempt.v1')");
const reportText = await evaluate("document.querySelector('.awakening-report-card')?.innerText ?? ''");
const snapshot = historyRaw ? JSON.parse(historyRaw) : [];
writeFileSync(`${OUT}/trace.json`, JSON.stringify(trace, null, 2));
writeFileSync(`${OUT}/snapshot.json`, JSON.stringify(snapshot.at(-1) ?? null, null, 2));
writeFileSync(`${OUT}/report.md`, `# 智核觉醒报告（真实运行提取）\n\n${reportText}\n`);
const last = snapshot.at(-1);
log("=== 运行摘要 ===");
log("CAT 出题请求:", trace?.cat?.length ?? 0, "| deepseek 调用:", trace?.deepseek ?? 0, "| 生图调用:", trace?.ark ?? 0);
log("定档先验:", JSON.stringify(trace?.cat?.[0]?.response?.session?.prior ?? null));
log("停止原因:", stopText.trim().slice(0, 40));
log("vendor 总分:", last?.result?.overallScore, last?.result?.grade, "| 融合总分:", last?.composite?.overallScore, last?.composite?.grade);
log("对话总分:", last?.composite?.channels?.interview?.overallScore, "| 实操:", last?.composite?.channels?.practical?.overallScore, `(${last?.composite?.channels?.practical?.credit})`);
if (draftRaw) writeFileSync(`${OUT}/draft.json`, JSON.stringify(JSON.parse(draftRaw), null, 2));

console.log(`\n${problems.length === 0 ? "全流程通过 ✓" : `发现 ${problems.length} 个问题：\n  - ` + problems.join("\n  - ")}`);
socket.close();
child.kill();
process.exit(problems.length === 0 ? 0 : 1);
