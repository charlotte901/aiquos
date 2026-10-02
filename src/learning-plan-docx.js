import {
  LEARNING_PLAN_STYLE,
  buildLearningPlan,
  learningPlanFileName,
} from "./report-learning-plan.js";

const STYLE = LEARNING_PLAN_STYLE;
const A4_WIDTH_TWIPS = 11906;
const A4_HEIGHT_TWIPS = 16838;
const CONTENT_WIDTH_TWIPS = ptToTwips(STYLE.space.contentWidth);

function ptToTwips(value) {
  return Math.round(value * 20);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function colorValue(value) {
  return String(value || "#000000").replace("#", "").toUpperCase();
}

function runProperties({ size, color, bold } = {}) {
  const halfPoints = Math.round((size || STYLE.type.bodySize) * 2);
  return [
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei" w:cs="Arial" />',
    bold ? "<w:b /><w:bCs />" : "",
    `<w:color w:val="${colorValue(color)}" />`,
    `<w:sz w:val="${halfPoints}" /><w:szCs w:val="${halfPoints}" />`,
  ].filter(Boolean).join("");
}

function run(text, options = {}) {
  if (text === "" || text === null || text === undefined) return "";
  return `<w:r><w:rPr>${runProperties(options)}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paragraph(content, {
  size = STYLE.type.bodySize,
  color = STYLE.colors.ink,
  bold = false,
  line = STYLE.type.bodyLineHeight,
  after = STYLE.space.paragraphGap,
  before = 0,
  align = "both",
  border = "",
  shade = "",
} = {}) {
  const runs = Array.isArray(content) ? content.join("") : run(content, { size, color, bold });
  return [
    "<w:p><w:pPr>",
    border ? `<w:pBdr>${border}</w:pBdr>` : "",
    shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${colorValue(shade)}" />` : "",
    `<w:spacing w:before="${ptToTwips(before)}" w:after="${ptToTwips(after)}" w:line="${ptToTwips(line)}" w:lineRule="exact" />`,
    `<w:jc w:val="${align}" />`,
    "</w:pPr>",
    runs,
    "</w:p>",
  ].filter(Boolean).join("");
}

function heading(text, {
  size = STYLE.type.headingSize,
  line = STYLE.type.headingLineHeight,
  before = 18,
  after = STYLE.space.headingGap,
} = {}) {
  return paragraph(text, {
    size,
    color: STYLE.colors.heading,
    bold: true,
    line,
    after,
    before,
    align: "left",
  });
}

function spacer(height = STYLE.space.cardGap) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(height)}" w:line="1" w:lineRule="exact" /><w:jc w:val="left" /></w:pPr><w:r><w:rPr><w:sz w:val="2" /><w:szCs w:val="2" /></w:rPr><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
}

function cardTable(paragraphs) {
  const border = colorValue(STYLE.colors.border);
  const cellMargin = ptToTwips(STYLE.space.cardPadding);
  return [
    "<w:tbl><w:tblPr>",
    `<w:tblW w:w="${CONTENT_WIDTH_TWIPS}" w:type="dxa" />`,
    '<w:tblLayout w:type="fixed" />',
    `<w:tblCellMar><w:top w:w="${cellMargin}" w:type="dxa" /><w:left w:w="${ptToTwips(12)}" w:type="dxa" /><w:bottom w:w="${cellMargin}" w:type="dxa" /><w:right w:w="${ptToTwips(12)}" w:type="dxa" /></w:tblCellMar>`,
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${border}" /><w:left w:val="single" w:sz="4" w:space="0" w:color="${border}" /><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${border}" /><w:right w:val="single" w:sz="4" w:space="0" w:color="${border}" /></w:tblBorders>`,
    "</w:tblPr>",
    `<w:tblGrid><w:gridCol w:w="${CONTENT_WIDTH_TWIPS}" /></w:tblGrid>`,
    `<w:tr><w:trPr><w:cantSplit /></w:trPr><w:tc><w:tcPr><w:tcW w:w="${CONTENT_WIDTH_TWIPS}" w:type="dxa" /><w:shd w:val="clear" w:color="auto" w:fill="${colorValue(STYLE.colors.card)}" /></w:tcPr>${paragraphs.join("")}</w:tc></w:tr>`,
    "</w:tbl>",
  ].join("");
}

function field(instruction) {
  const props = runProperties({ size: STYLE.type.footnoteSize, color: STYLE.colors.footnote });
  return [
    `<w:r><w:rPr>${props}</w:rPr><w:fldChar w:fldCharType="begin" /></w:r>`,
    `<w:r><w:rPr>${props}</w:rPr><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r>`,
    `<w:r><w:rPr>${props}</w:rPr><w:fldChar w:fldCharType="end" /></w:r>`,
  ].join("");
}

function documentXml(plan) {
  const { type, space, colors } = STYLE;
  const generatedAt = new Date();
  const generatedText = `${generatedAt.getFullYear()}年${generatedAt.getMonth() + 1}月${generatedAt.getDate()}日`;
  const dividerBorder = `<w:bottom w:val="single" w:sz="4" w:space="1" w:color="${colorValue(colors.border)}" />`;

  const adviceTables = plan.adviceItems.map((item) => cardTable([
    paragraph(`${item.name} · ${item.score} 分 · ${item.gradeLabel}`, {
      size: type.cardTitleSize,
      color: colors.heading,
      bold: true,
      line: type.cardTitleLineHeight,
      after: space.lineGap,
      align: "left",
    }),
    paragraph(`当前水平：${item.overview}`, { after: space.lineGap }),
    paragraph(`学习行动：${item.practice}`, { after: space.lineGap }),
    paragraph(`完成标志：${item.checkpoint}`, { after: 0 }),
  ])).map((table) => `${table}${spacer(space.cardGap)}`).join("");

  const resourceTables = plan.resources.map((resource, index) => cardTable([
    paragraph(`推荐 ${String(index + 1).padStart(2, "0")}`, {
      size: type.brandSize,
      color: colors.brand,
      bold: true,
      line: type.brandLineHeight,
      after: 3,
      align: "left",
    }),
    paragraph(resource.title, {
      size: type.cardTitleSize,
      color: colors.heading,
      bold: true,
      line: type.cardTitleLineHeight,
      after: space.lineGap,
      align: "left",
    }),
    paragraph(`${resource.platform} · ${resource.type} · 匹配 ${resource.matchedDimension} · ${resource.stage} 档`, {
      size: type.smallSize,
      color: colors.muted,
      line: type.smallLineHeight,
      after: space.lineGap,
      align: "left",
    }),
    paragraph(resource.note, { after: space.lineGap }),
    paragraph(resource.url, {
      size: type.smallSize,
      color: colors.brand,
      line: type.smallLineHeight,
      after: 0,
      align: "left",
    }),
  ])).map((table) => `${table}${spacer(space.cardGap)}`).join("");

  const body = [
    paragraph("AIQUOS · 智核域", {
      size: type.brandSize,
      color: colors.muted,
      bold: true,
      line: type.brandLineHeight,
      after: space.headerGap,
      align: "left",
    }),
    paragraph("个性化学习方案", {
      size: type.titleSize,
      color: colors.heading,
      bold: true,
      line: type.titleLineHeight,
      after: 8,
      align: "left",
    }),
    paragraph(`生成日期：${generatedText} · 综合得分 ${plan.score} 分 · 综合评级 ${plan.grade} 档（${plan.stage.label}）`, {
      size: type.metaSize,
      color: colors.muted,
      line: type.metaLineHeight,
      after: 16,
      align: "left",
      border: dividerBorder,
    }),
    heading("第一部分 · 分数评价"),
    paragraph(plan.evaluation),
    heading("第二部分 · 个性化学习建议"),
    paragraph("以下按六个能力维度分别说明当前水平、学习行动和完成标志，薄弱维度排在前面。"),
    adviceTables,
    cardTable([paragraph(`练习节奏：${plan.advicePace}`, { after: 0 })]),
    spacer(space.cardGap),
    heading("第三部分 · 个性化学习资源"),
    paragraph(`以下 ${plan.resources.length} 条资源来自 100 条 AI 学习资源库，已按你的总分、薄弱维度和能力档位匹配。`),
    resourceTables,
    paragraph("本文档由 AIQUOS 觉醒报告生成。资源链接可在浏览器中打开。", {
      size: type.footnoteSize,
      color: colors.footnote,
      line: type.footnoteLineHeight,
      after: 0,
      align: "left",
      border: `<w:top w:val="single" w:sz="4" w:space="4" w:color="${colorValue(colors.border)}" />`,
    }),
    spacer(1),
  ].join("");

  const footerReference = '<w:footerReference w:type="default" r:id="rId2" />';
  const section = [
    `<w:sectPr>${footerReference}`,
    `<w:pgSz w:w="${A4_WIDTH_TWIPS}" w:h="${A4_HEIGHT_TWIPS}" />`,
    `<w:pgMar w:top="${ptToTwips(STYLE.page.marginTop)}" w:right="${ptToTwips(STYLE.page.marginRight)}" w:bottom="${ptToTwips(STYLE.page.marginBottom)}" w:left="${ptToTwips(STYLE.page.marginLeft)}" w:header="720" w:footer="680" w:gutter="0" />`,
    '<w:cols w:space="720" />',
    '<w:docGrid w:linePitch="360" />',
    "</w:sectPr>",
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}${section}</w:body></w:document>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei" w:cs="Arial" /><w:color w:val="${colorValue(STYLE.colors.ink)}" /><w:sz w:val="${Math.round(STYLE.type.bodySize * 2)}" /><w:szCs w:val="${Math.round(STYLE.type.bodySize * 2)}" /><w:lang w:val="en-US" w:eastAsia="zh-CN" /></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal" /><w:qFormat /><w:pPr><w:spacing w:after="${ptToTwips(STYLE.space.paragraphGap)}" w:line="${ptToTwips(STYLE.type.bodyLineHeight)}" w:lineRule="exact" /><w:jc w:val="both" /></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei" w:cs="Arial" /><w:color w:val="${colorValue(STYLE.colors.ink)}" /><w:sz w:val="${Math.round(STYLE.type.bodySize * 2)}" /><w:szCs w:val="${Math.round(STYLE.type.bodySize * 2)}" /></w:rPr></w:style></w:styles>`;
}

function footerXml() {
  const textProps = runProperties({ size: STYLE.type.footnoteSize, color: STYLE.colors.footnote });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${ptToTwips(STYLE.type.footnoteLineHeight)}" w:lineRule="exact" /><w:jc w:val="left" /></w:pPr><w:r><w:rPr>${textProps}</w:rPr><w:t xml:space="preserve">第 </w:t></w:r>${field("PAGE")}<w:r><w:rPr>${textProps}</w:rPr><w:t xml:space="preserve"> 页 / 共 </w:t></w:r>${field("NUMPAGES")}<w:r><w:rPr>${textProps}</w:rPr><w:t xml:space="preserve"> 页</w:t></w:r></w:p></w:ftr>`;
}

function relationshipXml(relations) {
  const body = relations.map(({ id, type, target }) => `<Relationship Id="${id}" Type="${type}" Target="${target}" />`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

function crc32(bytes) {
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let value = 0; value < 256; value += 1) {
      let current = value;
      for (let bit = 0; bit < 8; bit += 1) {
        current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
      }
      crc32.table[value] = current >>> 0;
    }
  }
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum = crc32.table[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  entries.forEach(([name, value]) => {
    const nameBytes = encoder.encode(name);
    const data = typeof value === "string" ? encoder.encode(value) : value;
    const checksum = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  });

  const centralSize = centrals.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  for (const item of [...locals, ...centrals, end]) {
    result.set(item, position);
    position += item.length;
  }
  return result;
}

export function buildLearningPlanDocx(plan) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="xml" ContentType="application/xml" /><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml" /><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml" /></Types>`;
  const rootRels = relationshipXml([
    { id: "rId1", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", target: "word/document.xml" },
  ]);
  const documentRels = relationshipXml([
    { id: "rId1", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", target: "styles.xml" },
    { id: "rId2", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer", target: "footer1.xml" },
  ]);

  return createStoredZip([
    ["[Content_Types].xml", contentTypes],
    ["_rels/.rels", rootRels],
    ["word/document.xml", documentXml(plan)],
    ["word/styles.xml", stylesXml()],
    ["word/footer1.xml", footerXml()],
    ["word/_rels/document.xml.rels", documentRels],
  ]);
}

export function downloadLearningPlan(model) {
  if (typeof document === "undefined" || typeof Blob === "undefined") return;
  const plan = buildLearningPlan(model);
  const blob = new Blob([buildLearningPlanDocx(plan)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${learningPlanFileName(plan)}.docx`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
