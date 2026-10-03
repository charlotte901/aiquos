// 个性化报告 PDF 的配图渲染器:在浏览器 canvas 上绘制图表并编码为
// 基线 JPEG,交给 PDF 引擎以 DCTDecode XObject 嵌入(矢量正文 + 位图图表)。
// 配色与觉醒报告页同源(深绿 + 薄弱维度琥珀标记), node 测试环境没有
// canvas,渲染器返回 null,由 PDF 侧跳过对应配图。

import { GLYPH_WORDS, glyphScore, glyphCoverage, glyphCellOrder } from "./ability-glyph.js";

const PALETTE = {
  paper: "#ffffff",
  ink: "#203c2b",
  muted: "#6d7b65",
  grid: "#dfe8d8",
  green: "#4a833c",
  greenDeep: "#285a33",
  greenSoft: "rgba(74, 131, 60, 0.16)",
  greenMid: "#7ca55f",
  greenLight: "#a9c68d",
  amber: "#b97a2a",
  amberSoft: "rgba(185, 122, 42, 0.30)",
};

const FONT_STACK = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

function scoreOf(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
}

function isCanvasAvailable() {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = PALETTE.paper;
  context.fillRect(0, 0, width, height);
  context.textBaseline = "alphabetic";
  return { canvas, context };
}

async function canvasToJpegBytes(canvas) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("图表 JPEG 编码失败"))), "image/jpeg", 0.92);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function roundedBarPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arc(x + width - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  context.lineTo(x + r, y + height);
  context.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI * 1.5);
  context.closePath();
}

// 图 4:六维能力字像(灰色点阵小图)。
//
// 网页报告页的字像是一块块绿色浮雕大方块(实心=已有积累,空心=成长空间);
// 印到正式报告里改成小尺寸、单色灰点阵:仍然是"每个点=一个能力单元"的
// 同一套编码(glyphCoverage 决定实心数量),但退成一行安静的图形记录,
// 不抢正文注意力、也不重复正文已经说过的维度名与分数(2026-10-03 用户
// 要求:只留这 12 个字)。
//
// 复用 ability-glyph.js 的字形采样与编码,保证与网页版字径一致;
// 每格画成实心/空心小方块,直接对应"已有积累/成长空间"的图例。
export async function renderDimensionGlyphs(dimensions) {
  if (!isCanvasAvailable() || !Array.isArray(dimensions) || !dimensions.length) return null;
  const items = dimensions
    .map((dimension) => ({ ...dimension, value: glyphScore(dimension.score) }))
    .filter((dimension) => dimension.value !== null);
  if (!items.length) return null;

  // 每个维度的字形以固定画布采样(与网页版同一套 280×148 / 5.5px 网格)
  const SAMPLE_W = 280;
  const SAMPLE_H = 148;
  const STEP = 5.5;
  const SIZE = 4.5;
  const cellsFor = (word) => {
    const sample = document.createElement("canvas");
    sample.width = SAMPLE_W;
    sample.height = SAMPLE_H;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });
    if (!sampleContext) return [];
    sampleContext.fillStyle = "white";
    sampleContext.font = '700 128px "Noto Sans SC", sans-serif';
    sampleContext.textAlign = "center";
    sampleContext.textBaseline = "alphabetic";
    sampleContext.fillText(word, SAMPLE_W / 2, 122);
    const pixels = sampleContext.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const cells = [];
    for (let y = 3; y < 143; y += STEP) {
      for (let x = 3; x < 275; x += STEP) {
        const px = Math.round(x + SIZE / 2);
        const py = Math.round(y + SIZE / 2);
        if (pixels[(py * SAMPLE_W + px) * 4 + 3] > 100) {
          cells.push({ x, y, rank: glyphCellOrder(Math.round(x), Math.round(y)) });
        }
      }
    }
    cells.sort((left, right) => left.rank - right.rank);
    return cells;
  };

  // 版式:六个字像一行平铺，只有点阵、不带任何文字标签。
  //
  // 分辨率:画布按 4 倍于 PDF 显示宽度绘制。显示宽度约 443pt，若按 2 倍
  // (934px)画，每个格点只有 ~1.4px，缩印后实心/空心糊成一片（实测）。
  // 4 倍下格点约 2.9px，实心与空心在 A4 打印时能清楚分开。
  const DISPLAY_SCALE = 4;
  const width = Math.round(467 * DISPLAY_SCALE);
  const gapX = 28;
  const marginX = 48;
  const perRow = 6;
  const boxW = Math.floor((width - marginX * 2 - gapX * (perRow - 1)) / perRow);
  const boxH = Math.round(boxW * (SAMPLE_H / SAMPLE_W));
  const { canvas, context } = createCanvas(width, boxH + 16);
  const rowWidth = perRow * boxW + (perRow - 1) * gapX;
  const startX = (width - rowWidth) / 2;
  const originY = 8;

  items.forEach((item, index) => {
    if (index >= perRow) return;
    const originX = startX + index * (boxW + gapX);
    const word = GLYPH_WORDS[item.key] ?? item.short ?? "能力";
    const cells = cellsFor(word);
    if (!cells.length) return;
    const coverage = glyphCoverage(cells.length, item.value);
    const weak = item.value < 60;

    const scale = Math.min(boxW / SAMPLE_W, boxH / SAMPLE_H);
    const offsetX = originX + (boxW - SAMPLE_W * scale) / 2;
    const offsetY = originY + (boxH - SAMPLE_H * scale) / 2;
    // 格点占步距的一半,保证点与点之间留白可读。
    const unit = Math.max(1.2, STEP * scale * 0.5);
    cells.forEach((cell, cellIndex) => {
      const filled = cellIndex < coverage.full
        || (cellIndex === coverage.full && coverage.partial > 0.5);
      const x = offsetX + cell.x * scale;
      const y = offsetY + cell.y * scale;
      // 实心格用深灰（缩印到 A4 后仍读得成"实心块"），空心格用浅灰。
      context.fillStyle = filled
        ? (weak ? "#8a5a1c" : "#39463f")
        : "#dcdfdd";
      context.fillRect(x, y, unit, unit);
    });
  });

  return { width, height: boxH + 8, bytes: await canvasToJpegBytes(canvas) };
}

// 图 1:六维雷达图。轴线自正上方起顺时针排列,与报告页的画像顺序一致。
export async function renderRadarChart(dimensions, { size = 780 } = {}) {
  if (!isCanvasAvailable() || !Array.isArray(dimensions) || dimensions.length < 3) return null;
  const scores = dimensions.map((dimension) => scoreOf(dimension.score));
  if (scores.some((score) => score === null)) return null;

  const { canvas, context } = createCanvas(size, size);
  const center = size / 2;
  const radius = size * 0.335;
  const labelRadius = radius + size * 0.085;
  const count = dimensions.length;
  const angleOf = (index) => -Math.PI / 2 + (index * 2 * Math.PI) / count;

  context.lineWidth = 1.4;
  for (let ring = 1; ring <= 5; ring += 1) {
    const ringRadius = (radius * ring) / 5;
    context.beginPath();
    for (let index = 0; index < count; index += 1) {
      const angle = angleOf(index);
      const x = center + Math.cos(angle) * ringRadius;
      const y = center + Math.sin(angle) * ringRadius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.strokeStyle = PALETTE.grid;
    context.stroke();
    if (ring < 5) {
      context.fillStyle = PALETTE.muted;
      context.font = `500 ${Math.round(size * 0.022)}px ${FONT_STACK}`;
      context.textAlign = "left";
      context.fillText(String(ring * 20), center + 6, center - ringRadius + Math.round(size * 0.026));
    }
  }

  for (let index = 0; index < count; index += 1) {
    const angle = angleOf(index);
    context.beginPath();
    context.moveTo(center, center);
    context.lineTo(center + Math.cos(angle) * radius, center + Math.sin(angle) * radius);
    context.strokeStyle = PALETTE.grid;
    context.stroke();
  }

  context.beginPath();
  for (let index = 0; index < count; index += 1) {
    const angle = angleOf(index);
    const x = center + Math.cos(angle) * (radius * scores[index]) / 100;
    const y = center + Math.sin(angle) * (radius * scores[index]) / 100;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = PALETTE.greenSoft;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = PALETTE.green;
  context.stroke();

  context.textAlign = "center";
  for (let index = 0; index < count; index += 1) {
    const angle = angleOf(index);
    const weak = scores[index] < 60;
    const pointX = center + Math.cos(angle) * (radius * scores[index]) / 100;
    const pointY = center + Math.sin(angle) * (radius * scores[index]) / 100;
    context.beginPath();
    context.arc(pointX, pointY, size * 0.0095, 0, Math.PI * 2);
    context.fillStyle = weak ? PALETTE.amber : PALETTE.greenDeep;
    context.fill();

    const labelX = center + Math.cos(angle) * labelRadius;
    const labelY = center + Math.sin(angle) * labelRadius;
    context.fillStyle = PALETTE.ink;
    context.font = `600 ${Math.round(size * 0.033)}px ${FONT_STACK}`;
    context.fillText(dimensions[index].short ?? dimensions[index].name, labelX, labelY - size * 0.008);
    context.fillStyle = weak ? PALETTE.amber : PALETTE.greenDeep;
    context.font = `700 ${Math.round(size * 0.036)}px ${FONT_STACK}`;
    context.fillText(String(scores[index]), labelX, labelY + size * 0.036);
  }

  return { width: size, height: size, bytes: await canvasToJpegBytes(canvas) };
}

// 图 2:六维分数横向条形图,薄弱维度排在最上方并以琥珀色标记。
export async function renderDimensionBars(dimensions, { width = 1360, height = 760 } = {}) {
  if (!isCanvasAvailable() || !Array.isArray(dimensions) || !dimensions.length) return null;
  const items = dimensions
    .map((dimension) => ({ ...dimension, value: scoreOf(dimension.score) }))
    .filter((dimension) => dimension.value !== null)
    .sort((left, right) => left.value - right.value);
  if (!items.length) return null;

  const { canvas, context } = createCanvas(width, height);
  const labelWidth = width * 0.17;
  const valueWidth = width * 0.062;
  const trackLeft = labelWidth;
  const trackWidth = width - trackLeft - valueWidth;
  const topPad = height * 0.16;
  const bottomPad = height * 0.07;
  const rowHeight = (height - topPad - bottomPad) / items.length;
  const barHeight = Math.min(rowHeight * 0.52, 46);
  const scale = (value) => trackLeft + (trackWidth * value) / 100;

  for (const guide of [60, 80]) {
    const guideX = scale(guide);
    context.setLineDash([7, 8]);
    context.beginPath();
    context.moveTo(guideX, topPad - rowHeight * 0.3);
    context.lineTo(guideX, height - bottomPad + rowHeight * 0.16);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1.6;
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = PALETTE.muted;
    context.font = `500 ${Math.round(width * 0.0135)}px ${FONT_STACK}`;
    context.textAlign = "center";
    context.fillText(guide === 60 ? "待提升线 60" : "稳固线 80", guideX, topPad - rowHeight * 0.42);
  }

  context.textAlign = "right";
  items.forEach((item, index) => {
    const centerY = topPad + rowHeight * index + rowHeight / 2;
    const weak = item.value < 60;
    context.fillStyle = PALETTE.ink;
    context.font = `600 ${Math.round(width * 0.019)}px ${FONT_STACK}`;
    context.fillText(item.short ?? item.name, trackLeft - width * 0.012, centerY + width * 0.0065);

    context.fillStyle = PALETTE.grid;
    roundedBarPath(context, trackLeft, centerY - barHeight / 2, trackWidth, barHeight, 6);
    context.globalAlpha = 0.38;
    context.fill();
    context.globalAlpha = 1;

    const barWidth = Math.max((trackWidth * item.value) / 100, barHeight);
    context.fillStyle = weak ? PALETTE.amber : PALETTE.green;
    roundedBarPath(context, trackLeft, centerY - barHeight / 2, barWidth, barHeight, 6);
    context.fill();

    context.textAlign = "left";
    context.fillStyle = weak ? PALETTE.amber : PALETTE.greenDeep;
    context.font = `700 ${Math.round(width * 0.021)}px ${FONT_STACK}`;
    context.fillText(String(item.value), trackLeft + barWidth + width * 0.012, centerY + width * 0.0072);
    context.textAlign = "right";
  });

  return { width, height, bytes: await canvasToJpegBytes(canvas) };
}

// 图 3(可选):同一维度在三通道上的分差图,仅当存在 ≥12 分通道落差时输出。
export async function renderChannelGaps(dimensions, { width = 1360 } = {}) {
  if (!isCanvasAvailable() || !Array.isArray(dimensions)) return null;
  const CHANNELS = [
    { key: "objective", label: "客观题" },
    { key: "interview", label: "对话采访" },
    { key: "practical", label: "实操工作台" },
  ];
  const rows = dimensions
    .map((dimension) => ({
      short: dimension.short ?? dimension.name,
      channels: CHANNELS.map((channel) => ({ ...channel, value: scoreOf(dimension.channels?.[channel.key]) })),
    }))
    .filter((row) => {
      const known = row.channels.filter((channel) => channel.value !== null);
      if (known.length < 2) return false;
      return Math.max(...known.map((channel) => channel.value)) - Math.min(...known.map((channel) => channel.value)) >= 12;
    })
    .slice(0, 3);
  if (!rows.length) return null;

  const rowHeight = 168;
  const height = 150 + rows.length * rowHeight;
  const { canvas, context } = createCanvas(width, height);
  const legendWidth = 210;
  const labelWidth = width * 0.16;
  const valueWidth = width * 0.06;
  const trackLeft = labelWidth;
  const trackWidth = width - trackLeft - valueWidth - legendWidth;
  const barHeight = 26;

  let legendX = width - legendWidth + 28;
  CHANNELS.forEach((channel, index) => {
    context.fillStyle = [PALETTE.greenDeep, PALETTE.green, PALETTE.greenLight][index];
    context.beginPath();
    context.arc(legendX, 52, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.muted;
    context.font = `500 ${Math.round(width * 0.0145)}px ${FONT_STACK}`;
    context.textAlign = "left";
    context.fillText(channel.label, legendX + 15, 58);
    legendX += 62 + width * 0.0145 * channel.length * 1.05;
  });

  rows.forEach((row, rowIndex) => {
    const rowTop = 118 + rowIndex * rowHeight;
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(width * 0.02, rowTop - 22);
    context.lineTo(width * 0.98, rowTop - 22);
    context.stroke();

    context.fillStyle = PALETTE.ink;
    context.font = `600 ${Math.round(width * 0.021)}px ${FONT_STACK}`;
    context.textAlign = "left";
    context.fillText(row.short, width * 0.02, rowTop + 20);

    row.channels.forEach((channel, channelIndex) => {
      if (channel.value === null) return;
      const centerY = rowTop + 48 + channelIndex * 38;
      context.fillStyle = [PALETTE.greenDeep, PALETTE.green, PALETTE.greenLight][channelIndex];
      context.font = `500 ${Math.round(width * 0.0145)}px ${FONT_STACK}`;
      context.fillText(channel.label, trackLeft, centerY - 7);
      roundedBarPath(context, trackLeft, centerY, Math.max((trackWidth * channel.value) / 100, 4), barHeight, 5);
      context.fill();
      context.fillStyle = PALETTE.greenDeep;
      context.font = `700 ${Math.round(width * 0.016)}px ${FONT_STACK}`;
      context.textAlign = "left";
      context.fillText(String(channel.value), trackLeft + (trackWidth * channel.value) / 100 + 12, centerY + barHeight - 5);
    });
  });

  return { width, height, bytes: await canvasToJpegBytes(canvas) };
}
