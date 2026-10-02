import {
  LEARNING_PLAN_STYLE,
  buildLearningPlan,
  learningPlanFileName,
} from "./report-learning-plan.js";

const STYLE = LEARNING_PLAN_STYLE;
const PAGE = {
  width: STYLE.page.width,
  height: STYLE.page.height,
  marginTop: STYLE.page.marginTop,
  marginBottom: STYLE.page.marginBottom,
  margin: STYLE.page.marginLeft,
};

function pdfColor(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

const COLORS = {
  brand: pdfColor(STYLE.colors.brand),
  heading: pdfColor(STYLE.colors.heading),
  ink: pdfColor(STYLE.colors.ink),
  muted: pdfColor(STYLE.colors.muted),
  card: pdfColor(STYLE.colors.card),
  border: pdfColor(STYLE.colors.border),
};

const HELVETICA_WIDTHS = {
  " ": 278, "!": 278, "\"": 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333,
  "{": 334, "|": 260, "}": 334, "~": 584,
};
const HELVETICA_BOLD_WIDTHS = {
  " ": 278, "!": 333, "\"": 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 238,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  "[": 333, "\\": 278, "]": 333, "^": 584, "_": 556, "`": 333,
  "{": 389, "|": 280, "}": 389, "~": 584,
};
for (let code = 48; code <= 57; code += 1) {
  HELVETICA_WIDTHS[String.fromCharCode(code)] = 556;
  HELVETICA_BOLD_WIDTHS[String.fromCharCode(code)] = 556;
}
const UPPERCASE_WIDTHS = [
  ["A", 667, 722], ["B", 667, 722], ["C", 722, 722], ["D", 722, 722], ["E", 667, 667],
  ["F", 611, 611], ["G", 778, 778], ["H", 722, 722], ["I", 278, 278], ["J", 500, 556],
  ["K", 667, 722], ["L", 556, 611], ["M", 833, 833], ["N", 722, 722], ["O", 778, 778],
  ["P", 667, 667], ["Q", 778, 778], ["R", 722, 722], ["S", 667, 667], ["T", 611, 611],
  ["U", 722, 722], ["V", 667, 667], ["W", 944, 944], ["X", 667, 667], ["Y", 667, 667],
  ["Z", 611, 611],
];
for (const [character, regular, bold] of UPPERCASE_WIDTHS) {
  HELVETICA_WIDTHS[character] = regular;
  HELVETICA_BOLD_WIDTHS[character] = bold;
}
const LOWERCASE_WIDTHS = [
  ["a", 556, 556], ["b", 556, 611], ["c", 500, 556], ["d", 556, 611], ["e", 556, 556],
  ["f", 278, 333], ["g", 556, 611], ["h", 556, 611], ["i", 222, 278], ["j", 222, 278],
  ["k", 500, 556], ["l", 222, 278], ["m", 833, 889], ["n", 556, 611], ["o", 556, 611],
  ["p", 556, 611], ["q", 556, 611], ["r", 333, 389], ["s", 500, 556], ["t", 278, 333],
  ["u", 556, 611], ["v", 500, 556], ["w", 722, 778], ["x", 500, 556], ["y", 500, 556],
  ["z", 500, 500],
];
for (const [character, regular, bold] of LOWERCASE_WIDTHS) {
  HELVETICA_WIDTHS[character] = regular;
  HELVETICA_BOLD_WIDTHS[character] = bold;
}

const WIN_ANSI_MAP = new Map([
  [0x2013, 0x96], [0x2014, 0x97], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2026, 0x85],
]);

function usesLatinFont(character) {
  const code = character.codePointAt(0);
  return code <= 0xff || WIN_ANSI_MAP.has(code);
}

function characterWidth(character, size, bold) {
  if (!usesLatinFont(character)) return size;
  const widths = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  return ((widths[character] ?? 556) / 1000) * size;
}

function textWidth(text, size, bold = false) {
  let width = 0;
  for (const character of text) {
    width += characterWidth(character, size, bold);
  }
  return width;
}

export function wrapText(text, size, maxWidth, bold = false) {
  const source = String(text ?? "").replace(/\s+/gu, " ").trim();
  if (!source) return [];
  const lines = [];
  let line = "";

  for (const word of source.split(" ")) {
    const candidate = (line ? `${line} ` : "") + word;
    if (line && textWidth(candidate, size, bold) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (!line && textWidth(word, size, bold) <= maxWidth) {
      line = word;
      continue;
    }
    if (line) lines.push(line);
    if (textWidth(word, size, bold) <= maxWidth) {
      line = word;
      continue;
    }

    // CJK sentences and long URLs have few natural break points.
    line = "";
    for (const character of word) {
      const next = line + character;
      const trailingPunctuation = /^[，。；：、！？）》”’%.,;:!?)\]]$/u.test(character);
      if (textWidth(next, size, bold) <= maxWidth || (line && trailingPunctuation)) {
        line = next;
        continue;
      }
      lines.push(line);
      line = character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function utf16beHex(value) {
  return Array.from(String(value), (character) => {
    const code = character.codePointAt(0);
    if (code > 0xffff) {
      const offset = code - 0x10000;
      const high = 0xd800 + Math.floor(offset / 0x400);
      const low = 0xdc00 + (offset % 0x400);
      return `${high.toString(16).padStart(4, "0")}${low.toString(16).padStart(4, "0")}`;
    }
    return code.toString(16).padStart(4, "0");
  }).join("");
}

function winAnsiHex(value) {
  return Array.from(String(value), (character) => {
    const code = character.codePointAt(0);
    const byte = WIN_ANSI_MAP.get(code) ?? code;
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

function splitFontRuns(value) {
  const runs = [];
  for (const character of String(value ?? "")) {
    const latin = usesLatinFont(character);
    const last = runs.at(-1);
    if (last?.latin === latin) last.text += character;
    else runs.push({ latin, text: character });
  }
  return runs;
}

function createDocument() {
  const pages = [];
  let page = null;

  const startPage = () => {
    page = { operations: [], cursor: PAGE.height - PAGE.marginTop - 14 };
    pages.push(page);
  };

  const ensure = (height) => {
    if (page.cursor - height < PAGE.marginBottom + 26) startPage();
  };

  const text = (value, {
    x = PAGE.margin,
    size = 10.5,
    color = COLORS.ink,
    bold = false,
    lineHeight = Math.round(size * 1.58 * 10) / 10,
    width = STYLE.space.contentWidth,
    blockGap = 0,
  } = {}) => {
    const lines = wrapText(value, size, width, bold);
    if (!lines.length) {
      page.cursor -= lineHeight + blockGap;
      return 0;
    }
    lines.forEach((line) => {
      ensure(lineHeight);
      page.operations.push({ kind: "text", x, y: page.cursor, size, color, bold, text: line });
      page.cursor -= lineHeight;
    });
    if (lines.length && blockGap) page.cursor -= blockGap;
    return lines.length;
  };

  const rule = (gapBefore = 14, gapAfter = 16) => {
    ensure(1);
    page.cursor -= gapBefore;
    page.operations.push({
      kind: "rule",
      x: PAGE.margin,
      y: page.cursor,
      width: STYLE.space.contentWidth,
    });
    page.cursor -= gapAfter;
  };

  const card = (render, padding = 9) => {
    const panelFor = (target) => ({
      ensure: target.ensure,
      text: (value, options = {}) => target.text(value, {
        x: PAGE.margin + padding,
        width: STYLE.space.contentWidth - padding * 2,
        ...options,
      }),
    });
    const probe = createDocument();
    probe.startPage();
    probe.pages.at(-1).cursor -= padding;
    render(panelFor(probe));
    probe.pages.at(-1).cursor -= padding - 2;
    const height = (PAGE.height - PAGE.marginTop - 14 - padding) - probe.pages.at(-1).cursor;
    ensure(height);
    const top = page.cursor;
    page.operations.push({
      kind: "card",
      x: PAGE.margin,
      y: top - height,
      width: PAGE.width - PAGE.margin * 2,
      height,
    });
    page.cursor -= padding;
    render(panelFor(api));
    page.cursor = top - height - 8;
  };

  const api = {
    pages,
    startPage,
    ensure,
    text,
    card,
    heading(value, size = STYLE.type.headingSize) {
      this.ensure(size * 2.2);
      this.text("", { size: 1, lineHeight: 18 });
      this.text(value, { size, color: COLORS.heading, bold: true, lineHeight: STYLE.type.headingLineHeight });
      this.text("", { size: 1, lineHeight: STYLE.space.headingGap });
    },
    rule,
  };
  return api;
}

function lineCount(pages) {
  return pages.reduce((total, page) => total + page.operations.length, 0);
}

export function buildLearningPlanPdf(plan) {
  const doc = createDocument();
  doc.startPage();
  const s = STYLE;
  const { type, space } = s;

  doc.text("AIQUOS · 智核域", { size: type.brandSize, color: COLORS.muted, bold: true, lineHeight: type.brandLineHeight });
  doc.text("", { size: 1, lineHeight: space.headerGap });
  doc.text("个性化学习方案", { size: type.titleSize, color: COLORS.heading, bold: true, lineHeight: type.titleLineHeight });
  const generatedAt = new Date();
  doc.text(
    `生成日期：${generatedAt.getFullYear()}年${generatedAt.getMonth() + 1}月${generatedAt.getDate()}日 · 综合得分 ${plan.score} 分 · 综合评级 ${plan.grade} 档（${plan.stage.label}）`,
    { size: type.metaSize, color: COLORS.muted, lineHeight: type.metaLineHeight },
  );
  doc.rule(14, 16);

  doc.heading("第一部分 · 分数评价");
  doc.text(plan.evaluation, { size: type.bodySize, lineHeight: type.bodyLineHeight, blockGap: space.paragraphGap });

  doc.heading("第二部分 · 个性化学习建议");
  doc.text("以下按六个能力维度分别说明当前水平、学习行动和完成标志，薄弱维度排在前面。", {
    size: type.bodySize,
    lineHeight: type.bodyLineHeight,
    blockGap: space.paragraphGap,
  });

  plan.adviceItems.forEach((item) => {
    doc.card((panel) => {
      panel.text(`${item.name} · ${item.score} 分 · ${item.gradeLabel}`, {
        size: type.cardTitleSize,
        color: COLORS.heading,
        bold: true,
        lineHeight: type.cardTitleLineHeight,
        blockGap: space.lineGap,
      });
      panel.text(`当前水平：${item.overview}`, { size: type.bodySize, lineHeight: type.bodyLineHeight, blockGap: space.lineGap });
      panel.text(`学习行动：${item.practice}`, { size: type.bodySize, lineHeight: type.bodyLineHeight, blockGap: space.lineGap });
      panel.text(`完成标志：${item.checkpoint}`, { size: type.bodySize, lineHeight: type.bodyLineHeight });
    }, space.cardPadding);
  });

  doc.card((panel) => {
    panel.text(`练习节奏：${plan.advicePace}`, { size: type.bodySize, lineHeight: type.bodyLineHeight });
  }, space.cardPadding);

  doc.heading("第三部分 · 个性化学习资源");
  doc.text(`以下 ${plan.resources.length} 条资源来自 100 条 AI 学习资源库，已按你的总分、薄弱维度和能力档位匹配。`, {
    size: type.bodySize,
    lineHeight: type.bodyLineHeight,
    blockGap: space.paragraphGap,
  });

  plan.resources.forEach((resource, index) => {
    doc.card((panel) => {
      panel.text(`推荐 ${String(index + 1).padStart(2, "0")}`, {
        size: type.brandSize,
        color: COLORS.brand,
        bold: true,
        lineHeight: type.brandLineHeight,
        blockGap: 3,
      });
      panel.text(resource.title, { size: type.cardTitleSize, bold: true, lineHeight: type.cardTitleLineHeight, blockGap: space.lineGap });
      panel.text(`${resource.platform} · ${resource.type} · 匹配 ${resource.matchedDimension} · ${resource.stage} 档`, {
        size: type.smallSize,
        color: COLORS.muted,
        lineHeight: type.smallLineHeight,
        blockGap: space.lineGap,
      });
      panel.text(resource.note, { size: type.bodySize, lineHeight: type.bodyLineHeight, blockGap: space.lineGap });
      panel.text(resource.url, { size: type.smallSize, color: COLORS.brand, lineHeight: type.smallLineHeight });
    }, space.cardPadding);
  });

  doc.rule(20, 9);
  doc.text("本文档由 AIQUOS 觉醒报告生成。资源链接可在浏览器中打开。", {
    size: type.footnoteSize,
    color: COLORS.muted,
    lineHeight: type.footnoteLineHeight,
  });

  return buildPdfBytes(doc.pages);
}

function operationBytes(operation) {
  if (operation.kind === "rule") {
    return [
      "0.8 w ", COLORS.border.join(" "), " RG ",
      operation.x, " ", operation.y, " m ",
      operation.x + operation.width, " ", operation.y, " l S\n",
    ].join("");
  }

  if (operation.kind === "card") {
    return [
      "q ",
      COLORS.card.join(" "), " rg ",
      operation.x, " ", operation.y, " ", operation.width, " ", operation.height, " re f ",
      "0.4 w ", COLORS.border.join(" "), " RG ",
      operation.x, " ", operation.y, " ", operation.width, " ", operation.height, " re S Q\n",
    ].join("");
  }

  let x = operation.x;
  const content = splitFontRuns(operation.text).map((run) => {
    const font = run.latin ? (operation.bold ? "/F3" : "/F2") : "/F1";
    const encoded = run.latin ? winAnsiHex(run.text) : utf16beHex(run.text);
    // PDF's standard Chinese fonts have no bold face. Fill-drawing a tiny offset
    // stack is cleaner than stroking text, whose color can inherit card borders.
    const offsets = !run.latin && operation.bold
      ? [[0, 0], [operation.size * 0.014, 0], [0, operation.size * 0.01], [operation.size * 0.014, operation.size * 0.01]]
      : [[0, 0]];
    const text = offsets.map(([dx, dy]) => [
      "BT ",
      operation.color.join(" "), " rg ", font, " ", operation.size, " Tf 0 Tr ",
      "1 0 0 1 ", x + dx, " ", operation.y + dy, " Tm <",
      encoded,
      "> Tj ET\n",
    ].join("")).join("");
    x += textWidth(run.text, operation.size, operation.bold && run.latin);
    return text;
  });
  return content.join("");
}

function addFooter(pages) {
  pages.forEach((page, index) => {
    page.operations.push({
      kind: "text",
      x: PAGE.margin,
      y: 34,
      size: 8.5,
      color: COLORS.muted,
      bold: false,
      text: `第 ${index + 1} 页 / 共 ${pages.length} 页`,
    });
  });
}

export function buildPdfBytes(pages) {
  if (!Array.isArray(pages) || !pages.length || !lineCount(pages)) {
    throw new Error("PDF 至少需要一页内容");
  }

  addFooter(pages);
  const chunks = [];
  const offsets = new Map();
  let offset = 0;
  const encode = (value) => (typeof value === "string" ? new TextEncoder().encode(value) : value);
  const push = (...values) => {
    for (const value of values) {
      const bytes = encode(value);
      chunks.push(bytes);
      offset += bytes.byteLength;
    }
  };
  const object = (id, body) => {
    offsets.set(id, offset);
    push(`${id} 0 obj\n`, encode(body), "\nendobj\n");
  };

  push("%PDF-1.4\n", new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const pageCount = pages.length;
  const pageIds = Array.from({ length: pageCount }, (_, index) => 9 + index * 2);

  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`);
  object(3, "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>");
  object(4, "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 /FontDescriptor 5 0 R >>");
  object(5, "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -254 /CapHeight 880 /StemV 93 >>");
  object(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  object(7, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const content = page.operations.map(operationBytes).join("");
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width.toFixed(2)} ${PAGE.height.toFixed(2)}] /Resources << /ProcSet [/PDF /Text] /Font << /F1 3 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents ${contentId} 0 R >>`);
    object(contentId, `<< /Length ${new TextEncoder().encode(content).byteLength} >>\nstream\n${content}endstream`);
  });

  const xrefOffset = offset;
  const objectCount = 9 + pageCount * 2;
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let id = 1; id < objectCount; id += 1) {
    push(`${String(offsets.get(id)).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const result = new Uint8Array(offset);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.byteLength;
  }
  return result;
}

function savePdfBytes(bytes, fileName) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadLearningPlanPdf(model) {
  if (typeof document === "undefined" || typeof Blob === "undefined") return;
  const plan = buildLearningPlan(model);
  savePdfBytes(buildLearningPlanPdf(plan), learningPlanFileName(plan));
}
