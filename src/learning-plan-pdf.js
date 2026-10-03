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

export function pdfColor(hex) {
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

  // 先按空格切词，但**不因一个放不下的词就结束当前行**——中英混排时
  // 「……要求 AI」这类句子里，空格后常常是「列出依据…」这样的中文长句，
  // 若此处直接换行，会留下一行只写到一半的空白（实测出现在报告第 4 页）。
  // 正确做法：词放不下时，先尝试按字符把它塞进当前行的剩余空间，塞不下
  // 再换行。这样中英混排也能填满整行。
  const pushCharWise = (word) => {
    for (const character of word) {
      const next = line + character;
      const trailingPunctuation = /^[，。；：、！？）》”’%.,;:!?)\]]$/u.test(character);
      if (measuredWidth(next, size, bold) <= maxWidth || (line && trailingPunctuation)) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = character;
    }
  };

  for (const word of source.split(" ")) {
    const candidate = (line ? `${line} ` : "") + word;
    if (measuredWidth(candidate, size, bold) <= maxWidth) {
      line = candidate;
      continue;
    }
    // 放不下时按词的形态分三种处理：
    //  · 超长拉丁串（URL 是典型）本身宽过一整行——必须硬切，否则会溢出
    //    页边（实测资源链接被截断在纸外）；
    //  · 普通拉丁词（AI / Checklist）有天然断点，整词换行，绝不拆字；
    //  · 含 CJK 的长串没有空格断点，按字符填满当前行，否则会留大片空白。
    const isLatinWord = /^[\x20-\x7E]+$/u.test(word);
    const widerThanLine = measuredWidth(word, size, bold) > maxWidth;
    if (isLatinWord && !widerThanLine) {
      if (line) lines.push(line);
      line = word;
      continue;
    }
    if (line) {
      const withSpace = `${line} `;
      if (measuredWidth(withSpace, size, bold) <= maxWidth) line = withSpace;
    }
    pushCharWise(word);
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

export function createDocument() {
  const pages = [];
  let page = null;

  const startPage = () => {
    page = { operations: [], cursor: PAGE.height - PAGE.marginTop - 14 };
    pages.push(page);
  };

  const ensure = (height) => {
    if (page.cursor - height < PAGE.marginBottom + 26) startPage();
  };

  const lineX = (line, x, width, align, size, bold) => {
    if (align === "center") return x + Math.max(0, (width - measuredWidth(line, size, bold)) / 2);
    if (align === "right") return x + Math.max(0, width - measuredWidth(line, size, bold));
    return x;
  };

  const text = (value, {
    x = PAGE.margin,
    size = 10.5,
    color = COLORS.ink,
    bold = false,
    align = "left",
    lineHeight = Math.round(size * 1.58 * 10) / 10,
    width = STYLE.space.contentWidth,
    blockGap = 0,
    noBreak = false,
  } = {}) => {
    const lines = wrapText(value, size, width, bold);
    if (!lines.length) {
      page.cursor -= lineHeight + blockGap;
      return 0;
    }
    lines.forEach((line) => {
      // noBreak covers fixed-coordinate layouts (report cover) where the
      // caller positions the baseline manually and never wants a page break.
      if (!noBreak) ensure(lineHeight);
      page.operations.push({
        kind: "text",
        x: lineX(line, x, width, align, size, bold),
        y: page.cursor,
        size,
        color,
        bold,
        text: line,
      });
      page.cursor -= lineHeight;
    });
    if (lines.length && blockGap) page.cursor -= blockGap;
    return lines.length;
  };

  const rule = (gapBefore = 14, gapAfter = 16, color = COLORS.border) => {
    ensure(1);
    page.cursor -= gapBefore;
    page.operations.push({
      kind: "rule",
      x: PAGE.margin,
      y: page.cursor,
      width: STYLE.space.contentWidth,
      color,
    });
    page.cursor -= gapAfter;
  };

  // Parameterized rectangle for report furniture (accent bars, badges, panels).
  const shape = ({ x, y, width, height, fill = null, stroke = null, lineWidth = 0.5, anchor = "cursor", gapAfter = 0 }) => {
    if (anchor === "cursor") {
      ensure(height);
      page.operations.push({
        kind: "shape", x, y: page.cursor - height, width, height, fill, stroke, lineWidth,
      });
      page.cursor -= height + gapAfter;
      return;
    }
    page.operations.push({ kind: "shape", x, y, width, height, fill, stroke, lineWidth });
  };

  // Embeds a pre-encoded JPEG ({ width, height, bytes }) as a block image.
  // Height defaults from the bitmap ratio; width defaults to the content width.
  // anchor:"fixed" + yTop places it at a fixed distance from the page top
  // (used by the report cover, which lays out by距页顶 rather than by cursor).
  const image = (bitmap, { x = PAGE.margin, width = STYLE.space.contentWidth, height = null, align = "center", gapAfter = 12, anchor = "cursor", yTop = null } = {}) => {
    if (!bitmap || !bitmap.bytes || !bitmap.width || !bitmap.height) return;
    const drawHeight = height ?? Math.round((width * bitmap.height) / bitmap.width);
    const drawWidth = height ? Math.round((height * bitmap.width) / bitmap.height) : width;
    const left = align === "center" ? x + Math.max(0, (width - drawWidth) / 2) : x;
    if (anchor === "fixed" && yTop !== null) {
      page.operations.push({
        kind: "image",
        x: left,
        y: PAGE.height - yTop - drawHeight,
        width: drawWidth,
        height: drawHeight,
        image: bitmap,
      });
      return;
    }
    ensure(drawHeight);
    page.operations.push({
      kind: "image",
      x: left,
      y: page.cursor - drawHeight,
      width: drawWidth,
      height: drawHeight,
      image: bitmap,
    });
    page.cursor -= drawHeight + gapAfter;
  };

  const card = (render, padding = 9, panel = {}) => {
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
      fill: panel.fill ?? COLORS.card,
      stroke: panel.stroke ?? COLORS.border,
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
    image,
    shape,
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

/** 字重 → 页面资源表里的字体引用名。 */
function fontRefFor(weight) {
  return { regular: "FR", bold: "FB" }[weight] ?? "FR";
}

function operationBytes(operation, imageNameById, embedded = null) {
  if (operation.kind === "rule") {
    return [
      "0.8 w ", (operation.color ?? COLORS.border).join(" "), " RG ",
      operation.x, " ", operation.y, " m ",
      operation.x + operation.width, " ", operation.y, " l S\n",
    ].join("");
  }

  if (operation.kind === "card" || operation.kind === "shape") {
    const parts = ["q "];
    if (operation.fill) parts.push(operation.fill.join(" "), " rg ");
    if (operation.stroke) parts.push((operation.lineWidth ?? 0.5).toFixed(2), " w ", operation.stroke.join(" "), " RG ");
    parts.push(
      operation.x, " ", operation.y, " ", operation.width, " ", operation.height, " re ",
      operation.fill && operation.stroke ? "B" : operation.fill ? "f" : "S",
      " Q\n",
    );
    return parts.join("");
  }

  if (operation.kind === "image") {
    const name = imageNameById.get(operation.image);
    return [
      "q ", operation.width.toFixed(2), " 0 0 ", operation.height.toFixed(2), " ",
      operation.x.toFixed(2), " ", operation.y.toFixed(2), " cm /", name, " Do Q\n",
    ].join("");
  }

  // 嵌入字体模式：单字体族（Noto Sans SC 子集）承担中英混排，用 Identity-H
  // 编码 + 一个 Tf；字重差异由不同字体资源（FR/FM/FB）表达，因此不再需要
  // 旧实现的「偏移叠加伪粗体」——那会让嵌入字体的描边发虚。
  if (embedded) {
    const fontRef = operation.bold && embedded.bold
      ? fontRefFor("bold")
      : fontRefFor("regular");
    return [
      "BT ",
      operation.color.join(" "), " rg /", fontRef, " ", operation.size, " Tf 0 Tr ",
      "1 0 0 1 ", operation.x, " ", operation.y, " Tm <",
      identityHex(operation.text),
      "> Tj ET\n",
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

/**
 * 页脚：左侧「本报告基于 …… 生成」，右侧页码。
 *
 * footer 参数由报告层传入（`{ source, generatedAt, account }`），三种数据都
 * 来自真实运行环境：source 说明证据来源、generatedAt 是生成时刻、account
 * 是登录档案。缺省时只写页码，不编造内容。
 */
function addFooter(pages, footer = null) {
  pages.forEach((page, index) => {
    if (page.noFooter) return;
    const PAGE_FONT = 7;
    const pageLabel = `第 ${index + 1} 页 / 共 ${pages.length} 页`;
    // 两段文字都用真实字宽测量（loadReportFonts 载入后 measuredWidth 走嵌入
    // 字体的字宽表）。之前用 Helvetica 近似估算，与实际渲染的 Noto Sans SC
    // 不一致，页脚两段会重叠（实测）。
    const pageLabelWidth = measuredWidth(pageLabel, PAGE_FONT, false);
    const pageLabelX = PAGE.margin + STYLE.space.contentWidth - pageLabelWidth;
    if (footer?.text) {
      const leftWidth = STYLE.space.contentWidth - pageLabelWidth - 12;
      let cut = footer.text.length;
      for (let i = 1; i <= footer.text.length; i += 1) {
        if (measuredWidth(footer.text.slice(0, i), PAGE_FONT, false) > leftWidth) {
          cut = i - 1;
          break;
        }
      }
      const trimmed = cut < footer.text.length
        ? `${footer.text.slice(0, Math.max(0, cut - 1))}…`
        : footer.text;
      page.operations.push({
        kind: "text",
        x: PAGE.margin,
        y: 34,
        size: PAGE_FONT,
        color: COLORS.muted,
        bold: false,
        text: trimmed,
      });
    }
    page.operations.push({
      kind: "text",
      x: pageLabelX,
      y: 34,
      size: PAGE_FONT,
      color: COLORS.muted,
      bold: false,
      text: pageLabel,
    });
  });
}

export function buildPdfBytes(pages, fonts = null, footer = null) {
  if (!Array.isArray(pages) || !pages.length || !lineCount(pages)) {
    throw new Error("PDF 至少需要一页内容");
  }

  addFooter(pages, footer);
  // JPEG bitmaps referenced by image operations become DCTDecode XObjects.
  const images = [];
  const imageSeen = new Set();
  const imageNameById = new Map();
  for (const page of pages) {
    for (const operation of page.operations) {
      if (operation.kind !== "image" || imageSeen.has(operation.image)) continue;
      imageSeen.add(operation.image);
      imageNameById.set(operation.image, `Im${images.length + 1}`);
      images.push(operation.image);
    }
  }
  // 字体：嵌入子集时用 CIDFontType2 + Identity-H（每字重 4 个对象：Type0 →
  // CIDFont → 描述符 → 字体文件流）；未提供时回退到内置 STSong-Light
  // （node 测试环境没有 fetch，走回退分支）。
  // 对象编号必须先算清楚：字体从 8 号起，其后依次是图片、页面与内容流。
  // 每个字重占 5 个对象：Type0 → CIDFontType2 → 描述符 → 字体流 → CIDToGIDMap 流。
  const embedded = fonts && Object.keys(fonts).length ? fonts : null;
  const fontObjects = new Map();
  let nextObjectId = 8;
  for (const [weight, spec] of Object.entries(embedded ?? {})) {
    fontObjects.set(weight, {
      type0Id: nextObjectId,
      cidId: nextObjectId + 1,
      descriptorId: nextObjectId + 2,
      fileId: nextObjectId + 3,
      mapId: nextObjectId + 4,
      baseName: `AIQUOSNoto-${weight}`,
      metrics: readFontMetrics(spec.bytes),
      bytes: spec.bytes,
      cidMap: spec.cidMap ?? null,
      widths: spec.widths ?? null,
    });
    nextObjectId += 5;
  }
  const firstImageId = nextObjectId;
  const pageIds = Array.from({ length: pages.length }, (_, index) => firstImageId + images.length + index * 2);

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
  const object = (id, ...body) => {
    offsets.set(id, offset);
    push(`${id} 0 obj\n`, ...body, "\nendobj\n");
  };

  push("%PDF-1.4\n", new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const pageCount = pages.length;

  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`);

  if (embedded) {
    for (const record of fontObjects.values()) {
      const { type0Id, cidId, descriptorId, fileId, mapId, baseName, metrics, bytes, cidMap } = record;
      const cidToGidMap = buildCIDToGIDMap(cidMap);
      object(type0Id, `<< /Type /Font /Subtype /Type0 /BaseFont /${baseName} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] >>`);
      // CIDFontType2 + Identity-H：CID 直接等于 Unicode 码点；/CIDToGIDMap
      // 指向显式映射流（子集字体的 GID 是重编号的，不能用 /Identity）。
      object(
        cidId,
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /DW 1000 /CIDToGIDMap ${cidToGidMap ? `${mapId} 0 R` : "/Identity"}${widthArray(record.widths)} >>`,
      );
      object(
        descriptorId,
        `<< /Type /FontDescriptor /FontName /${baseName} /Flags 4 /FontBBox [${metrics.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${metrics.ascent} /Descent ${metrics.descent} /CapHeight ${metrics.capHeight} /StemV 80 /FontFile2 ${fileId} 0 R >>`,
      );
      object(
        fileId,
        `<< /Length ${bytes.byteLength} /Length1 ${bytes.byteLength} >>\nstream\n`,
        bytes,
        "\nendstream",
      );
      if (cidToGidMap) {
        object(mapId, `<< /Length ${cidToGidMap.byteLength} >>\nstream\n`, cidToGidMap, "\nendstream");
      }
    }
  } else {
    object(3, "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>");
    object(4, "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 /FontDescriptor 5 0 R >>");
    object(5, "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -254 /CapHeight 880 /StemV 93 >>");
    object(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    object(7, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  }

  images.forEach((bitmap, index) => {
    object(
      firstImageId + index,
      `<< /Type /XObject /Subtype /Image /Width ${bitmap.width} /Height ${bitmap.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bitmap.bytes.byteLength} >>\nstream\n`,
      bitmap.bytes,
      "\nendstream",
    );
  });

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const pageImageNames = new Set(
      page.operations.filter((operation) => operation.kind === "image").map((operation) => imageNameById.get(operation.image)),
    );
    const xobjects = [...pageImageNames].map((name) => {
      const imageIndex = Number(name.slice(2)) - 1;
      return `/${name} ${firstImageId + imageIndex} 0 R`;
    }).join(" ");
    const xobjectDict = xobjects ? ` /XObject << ${xobjects} >>` : "";
    // 字体资源表：嵌入模式下每个字重都挂到页面上（三个字重共 9 个字符名，
    // 未使用的不会增加体积，引用缺失反而会导致阅读器静默丢字）。
    // 注意 fontObjects 是 Map：必须用 .entries() 迭代，Object.entries(Map)
    // 返回空数组，会导致页面字体资源表为空、文字全部丢失（实测踩到）。
    const fontDict = embedded
      ? [...fontObjects.entries()].map(([weight, record]) => `/${fontRefFor(weight)} ${record.type0Id} 0 R`).join(" ")
      : "/F1 3 0 R /F2 6 0 R /F3 7 0 R";
    const content = page.operations.map((operation) => operationBytes(operation, imageNameById, embedded)).join("");
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width.toFixed(2)} ${PAGE.height.toFixed(2)}] /Resources << /ProcSet [/PDF /Text /Image] /Font << ${fontDict} >>${xobjectDict} >> /Contents ${contentId} 0 R >>`);
    object(contentId, `<< /Length ${new TextEncoder().encode(content).byteLength} >>\nstream\n${content}endstream`);
  });

  const xrefOffset = offset;
  const objectCount = firstImageId + images.length + pageCount * 2;
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

// ── 嵌入字体支持 ────────────────────────────────────────────────────────
//
// 报告从「内置 STSong-Light（阅读器替代字体，各设备字形不一）」换成自带
// Noto Sans SC 子集：字体由 scripts/build-pdf-font.py 在构建期产出
// （public/fonts/report-cjk-*.ttf，每个约 227KB），运行期用 fetch 取回并按
// CIDFontType2 嵌入。用 CIDFontType2 + Identity-H 编码：2 字节 CID 直接等于
// Unicode 码点，无需额外的 CMap 表，也避免 WinAnsi 只覆盖拉丁的局限。
// 只嵌两个字重（regular 承担正文、bold 承担标题与维度名）：三个字重会让
// PDF 膨胀约 1.2MB，而 medium 在报告里实际用不到。
const EMBEDDED_FONTS = {
  regular: {
    file: "/fonts/report-cjk-regular.ttf",
    map: "/fonts/report-cjk-regular.map.json",
    widths: "/fonts/report-cjk-regular.widths.json",
  },
  bold: {
    file: "/fonts/report-cjk-bold.ttf",
    map: "/fonts/report-cjk-bold.map.json",
    widths: "/fonts/report-cjk-bold.widths.json",
  },
};
let embeddedFontCache = null;

/**
 * 当前生效的字符宽度表（码点 → 1000 em 单位）。
 *
 * 加载嵌入字体后由 loadReportFonts 填入；未加载时回退到 Helvetica 近似。
 * 排版测量必须用**将要真正渲染的字体**的字宽，否则会出现「量着放得下、
 * 渲染却重叠」——页脚曾因此糊成一团（实测）。
 */
let activeWidths = null;

/** 用真实字宽测量文本（嵌入字体加载后自动生效）。 */
function measuredWidth(text, size, bold = false) {
  let width = 0;
  for (const character of text) {
    const code = character.codePointAt(0);
    const known = activeWidths?.get(code);
    if (Number.isFinite(known)) {
      width += (known / 1000) * size;
      continue;
    }
    width += characterWidth(character, size, bold);
  }
  return width;
}

/** 读取并缓存字重的子集字体字节、CID→GID 映射与字宽表（浏览器环境）。 */
export async function loadReportFonts() {
  if (embeddedFontCache) return embeddedFontCache;
  if (typeof fetch !== "function") return null;
  const entries = await Promise.all(Object.entries(EMBEDDED_FONTS).map(async ([weight, spec]) => {
    try {
      const [fontResponse, mapResponse, widthResponse] = await Promise.all([
        fetch(spec.file), fetch(spec.map), fetch(spec.widths),
      ]);
      if (!fontResponse.ok) return null;
      const bytes = new Uint8Array(await fontResponse.arrayBuffer());
      // 映射表缺失时退化为 Identity（拉丁等码点恰好等于 GID 的场景仍可用）。
      const cidMap = mapResponse.ok ? await mapResponse.json() : null;
      const widths = widthResponse.ok ? await widthResponse.json() : null;
      return [weight, { ...spec, bytes, cidMap, widths }];
    } catch {
      return null;
    }
  }));
  const loaded = entries.filter(Boolean);
  if (!loaded.length) {
    embeddedFontCache = null;
    return null;
  }
  embeddedFontCache = Object.fromEntries(loaded);
  // 用 regular 的字宽作为排版测量基准（与正文渲染一致）。
  const regularWidths = embeddedFontCache.regular?.widths;
  activeWidths = regularWidths
    ? new Map(Object.entries(regularWidths).map(([code, value]) => [Number(code), Number(value)]))
    : null;
  return embeddedFontCache;
}

/** 把 Uint16BE 编码的字符串转成 Identity-H 的 CMap 字节串（CID = 码点）。 */
function identityHex(value) {
  let out = "";
  for (const character of String(value ?? "")) {
    const code = character.codePointAt(0);
    // 基本平面外的字符在 CIDFontType2 里需要代理对，报告用不到，跳过。
    if (code > 0xffff) continue;
    out += code.toString(16).padStart(4, "0");
  }
  return out;
}

/** TrueType 表的校验和（PDF 嵌入要求 head.checkSumAdjustment 正确）。 */
function computeChecksum(bytes, start, length) {
  let sum = 0;
  for (let i = 0; i < length; i += 4) {
    const b0 = bytes[start + i] ?? 0;
    const b1 = bytes[start + i + 1] ?? 0;
    const b2 = bytes[start + i + 2] ?? 0;
    const b3 = bytes[start + i + 3] ?? 0;
    sum = (sum + ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3)) >>> 0;
  }
  return sum;
}

/**
 * 子集字体在嵌入前必须修 head.checkSumAdjustment：
 * fontTools 产出的子集里该字段仍是全字体的值，PDF 阅读器（尤其 Adobe）
 * 校验失败会拒绝渲染整份文件。这里按 OpenType 规范重算：
 *   0xB1B0AFBA - sum(整个字体文件，checkSumAdjustment 先置 0)
 */
function patchFontChecksum(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  let headOffset = 0;
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(
      bytes[record], bytes[record + 1], bytes[record + 2], bytes[record + 3],
    );
    if (tag === "head") {
      headOffset = view.getUint32(record + 8);
      break;
    }
  }
  if (!headOffset) return bytes;
  const adjustmentOffset = headOffset + 8;
  view.setUint32(adjustmentOffset, 0);
  const total = computeChecksum(bytes, 0, bytes.byteLength);
  view.setUint32(adjustmentOffset, (0xb1b0afba - total) >>> 0);
  return bytes;
}

/** 从 TTF 二进制里读出嵌入 PDF 需要的元数据。 */
function readFontMetrics(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  const tables = {};
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(
      bytes[record], bytes[record + 1], bytes[record + 2], bytes[record + 3],
    );
    tables[tag] = { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) };
  }
  const head = tables.head;
  const hhea = tables.hhea;
  const os2 = tables["OS/2"];
  const unitsPerEm = head ? view.getUint16(head.offset + 18) : 1000;
  const xMin = head ? view.getInt16(head.offset + 36) : -200;
  const yMin = head ? view.getInt16(head.offset + 38) : -250;
  const xMax = head ? view.getInt16(head.offset + 40) : 1200;
  const yMax = head ? view.getInt16(head.offset + 42) : 1000;
  const ascent = hhea ? view.getInt16(hhea.offset + 4) : Math.round(unitsPerEm * 0.88);
  const descent = hhea ? view.getInt16(hhea.offset + 6) : -Math.round(unitsPerEm * 0.12);
  const capHeight = os2 ? view.getInt16(os2.offset + 88) : ascent;
  // 子集化后按 1000 单位归一，PDF 的 /DW 与 FontDescriptor 都以 1000 为基准。
  const scale = 1000 / unitsPerEm;
  const at = (value) => Math.round(value * scale);
  return {
    unitsPerEm, scale,
    bbox: [at(xMin), at(yMin), at(xMax), at(yMax)],
    ascent: at(ascent), descent: at(descent), capHeight: at(capHeight),
    tables, view,
  };
}

/**
 * 构造 CIDFont 的 /W 数组：每个 CID 的真实 advance width（1000 em 单位）。
 *
 * 不写 /W 时 PDF 用 /DW（此处 1000 = 全角）作为所有字符宽度，数字与拉丁也会
 * 按全角排，正文松散、页脚溢出（实测）。
 *
 * 一律用 `cid [w]` 逐字形式，不做连续段压缩：`[c_first c_last w]` 与
 * `[c [w w ...]]` 两种形式对阅读器解析器的宽容度不同，实测某些解析器
 * （MuPDF / pypdf）对压缩形式报 "invalid key in dict"。逐字形式体积略大
 * 但兼容性最好——报告对象只多几十 KB，不值得为体积冒险。
 */
function widthArray(widths) {
  if (!widths) return "";
  const entries = Object.entries(widths)
    .map(([code, value]) => [Number(code), Number(value)])
    .filter(([code, value]) => Number.isFinite(code) && Number.isFinite(value))
    .sort((left, right) => left[0] - right[0]);
  if (!entries.length) return "";
  return ` /W [${entries.map(([code, value]) => `${code} [${value}]`).join(" ")}]`;
}

/**
 * 生成 CIDToGIDMap 流。
 *
 * 为什么不能用 `/CIDToGIDMap /Identity`：我们用 Identity-H 编码（2 字节 CID
 * 直接等于 Unicode 码点，如「测」= 0x6D4B），但字体子集里的 glyph id 是重新
 * 编号的（「测」的 GID 是 649，不是 0x6D4B）。Identity 映射会让阅读器拿
 * CID 当 GID 去查字形，结果是满纸乱字（实测踩到：正文渲染成 "? WQ? a?"）。
 *
 * 映射表由构建脚本用 fontTools 生成（report-cjk-*.map.json，码点→GID），
 * 不在浏览器里手工解析二进制表——那既容易出错又没必要。
 * 表长 = (最大实际码点 + 1) × 2；超出表长的 CID 由 PDF 默认值规则映射到 GID 0。
 */
function buildCIDToGIDMap(cidMap) {
  if (!cidMap) return null;
  let maxCid = 0;
  for (const code of Object.keys(cidMap)) {
    const value = Number(code);
    if (value > maxCid) maxCid = value;
  }
  const map = new Uint8Array((maxCid + 1) * 2);
  for (const [code, gid] of Object.entries(cidMap)) {
    const offset = Number(code) * 2;
    const glyph = Number(gid) & 0xffff;
    map[offset] = (glyph >> 8) & 0xff;
    map[offset + 1] = glyph & 0xff;
  }
  return map;
}

export function savePdfBytes(bytes, fileName) {
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
