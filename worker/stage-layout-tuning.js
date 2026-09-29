import { readFileSync, writeFileSync } from "node:fs";

/**
 * 三元素锚定布局的保存通道（仅 dev server 挂载）。
 *
 * GET  → 返回 src/stage-layout-tuning.json 当前内容（面板打开时对齐文件值）。
 * POST → 校验后写回同一文件。写盘成功后 Vite 的 JSON HMR 会把新默认值
 *        推给页面，保存即所见。
 *
 * 锚定规则决定 card / stage 没有 x 字段（卡片左缘=字标中心、舞台区间居中
 * 都是推导值），校验按此形状进行。
 */

export const STAGE_LAYOUT_TUNING_PATH = "/api/stage-layout-tuning";

const GROUPS = {
  mark: ["x", "y", "scale"],
  card: ["y", "width", "height"],
  stage: ["y", "width", "height"],
};

const RANGES = {
  x: [0, 100],
  y: [0, 100],
  width: [10, 100],
  widthMax: [600, 2400],
  height: [30, 100],
  scale: [0.4, 2.5],
};

function validate(payload) {
  if (!payload || typeof payload !== "object") return "请求体必须是 JSON 对象。";
  for (const [group, fields] of Object.entries(GROUPS)) {
    const section = payload[group];
    if (!section || typeof section !== "object") return `缺少 ${group} 分组。`;
    for (const field of fields) {
      const value = section[field];
      if (!Number.isFinite(Number(value))) return `${group}.${field} 必须是数字。`;
      const [min, max] = RANGES[field] ?? [0, 1000];
      const num = Number(value);
      if (num < min || num > max) return `${group}.${field} 超出量程（${min}–${max}）。`;
      section[field] = num;
    }
  }
  return null;
}

export function handleStageLayoutTuning(request, filePath) {
  if (request.method === "GET") {
    try {
      const raw = readFileSync(filePath, "utf8");
      return new Response(raw, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch {
      return Response.json({ error: "布局配置文件不存在。" }, { status: 500 });
    }
  }

  if (request.method !== "POST") {
    return Response.json({ error: "仅支持 GET / POST。" }, { status: 405 });
  }

  return request.json().then((payload) => {
    const problem = validate(payload);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    // 原样保留 _说明 字段（读旧文件；没有就用默认占位）。
    let note;
    try {
      note = JSON.parse(readFileSync(filePath, "utf8"))?._说明;
    } catch {
      note = undefined;
    }
    const output = {
      _说明: note ?? "测评关卡页三元素锚定布局（?tune=1 可调）。视口百分比：字标左上角锚点；卡片左缘=字标中心；舞台居中于卡片右缘到屏幕右缘。",
      mark: payload.mark,
      card: payload.card,
      stage: payload.stage,
    };
    writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`);
    return Response.json({ ok: true, saved: output });
  });
}

/* ── 角色统一微调的保存通道（同一套 {scale, x, y} 应用于全部四个角色） ── */

export const CHARACTER_TUNING_PATH = "/api/character-tuning";

const CHARACTER_RANGES = {
  scale: [0.4, 2.5],
  x: [-60, 60],
  y: [-60, 60],
};

export function handleCharacterTuning(request, filePath) {
  if (request.method === "GET") {
    try {
      const raw = readFileSync(filePath, "utf8");
      return new Response(raw, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch {
      return Response.json({ error: "角色微调文件不存在。" }, { status: 500 });
    }
  }

  if (request.method !== "POST") {
    return Response.json({ error: "仅支持 GET / POST。" }, { status: 405 });
  }

  return request.json().then((payload) => {
    if (!payload || typeof payload !== "object") {
      return Response.json({ error: "请求体必须是 JSON 对象。" }, { status: 400 });
    }
    const values = {};
    for (const field of ["scale", "x", "y"]) {
      const value = payload[field];
      if (!Number.isFinite(Number(value))) {
        return Response.json({ error: `${field} 必须是数字。` }, { status: 400 });
      }
      const [min, max] = CHARACTER_RANGES[field];
      const num = Number(value);
      if (num < min || num > max) {
        return Response.json({ error: `${field} 超出量程（${min}–${max}）。` }, { status: 400 });
      }
      values[field] = num;
    }
    let note;
    try {
      note = JSON.parse(readFileSync(filePath, "utf8"))?._说明;
    } catch {
      note = undefined;
    }
    const output = {
      _说明: note ?? "伴学角色统一微调（?tune=1 可调）：一套 {scale,x,y} 应用于全部四个角色。",
      ...values,
    };
    writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`);
    return Response.json({ ok: true, saved: output });
  });
}
