/**
 * 任务素材 → Word（.docx）下载器。
 *
 * 与 learning-plan-docx 同一套纯客户端 OOXML 生成思路，但输入是任意
 * Markdown 任务素材（# 标题 / ```代码块 / | 表格 | / > 引用 / 列表 / 段落），
 * 供工作台把「原始素材」以正式文档附件的形式提供给学员下载。
 * 自包含：不依赖 learning-plan 的私有构建函数。
 */

const PAGE_WIDTH_TWIPS = 11906;
const PAGE_HEIGHT_TWIPS = 16838;
const CONTENT_WIDTH_TWIPS = 9360; // A4 − 左右边距（约 467pt）
const THETA = { code: "F1F5F9", codeBorder: "CBD5E1", ink: "#1E293B", muted: "#64748B", brand: "#1D4ED8", quote: "#475569" };

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

function runProperties({ size = 11, color = THETA.ink, bold = false, italic = false, mono = false } = {}) {
  const halfPoints = Math.round(size * 2);
  const font = mono
    ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei" w:cs="Consolas" />'
    : '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Calibri" />';
  return [
    font,
    bold ? "<w:b /><w:bCs />" : "",
    italic ? "<w:i /><w:iCs />" : "",
    `<w:color w:val="${String(color).replace("#", "").toUpperCase()}" />`,
    `<w:sz w:val="${halfPoints}" /><w:szCs w:val="${halfPoints}" />`,
  ].join("");
}

function run(text, options = {}) {
  if (text === "" || text === null || text === undefined) return "";
  return `<w:r><w:rPr>${runProperties(options)}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paragraph(text, options = {}) {
  const { size, color, bold, italic, mono, before = 0, after = 8, line, align = "left", shade = "", indent = 0 } = options;
  return [
    "<w:p><w:pPr>",
    indent ? `<w:ind w:left="${ptToTwips(indent)}" />` : "",
    shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${THETA.code.replace("#", "")}" />` : "",
    `<w:spacing w:before="${ptToTwips(before)}" w:after="${ptToTwips(after)}"${line ? ` w:line="${ptToTwips(line)}" w:lineRule="exact"` : ""} />`,
    `<w:jc w:val="${align}" />`,
    "</w:pPr>",
    run(text, { size, color, bold, italic, mono }),
    "</w:p>",
  ].join("");
}

function codeBlock(lines) {
  return lines.map((line, index) => paragraph(line || " ", {
    mono: true,
    size: 9.5,
    after: index === lines.length - 1 ? 10 : 0,
    line: 14,
    shade: THETA.code,
  })).join("");
}

function tableMarkdown(rows) {
  const cells = rows.map((line) => line.split("|").map((cell) => cell.trim()).filter((cellItem, index, all) => !(index === 0 && cellItem === "") && !(index === all.length - 1 && cellItem === "")));
  const bodyRows = cells.filter((cellsRow) => !cellsRow.every((cell) => /^:?-{2,}:?$/.test(cell)));
  if (!bodyRows.length) return "";
  const colWidth = Math.floor(CONTENT_WIDTH_TWIPS / bodyRows[0].length);
  const cellXml = (text, bold = false) => `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa" /><w:shd w:val="clear" w:color="auto" w:fill="${bold ? "EEF2FF" : "FFFFFF"}" /></w:tcPr><w:p><w:pPr><w:spacing w:after="0" /><w:jc w:val="left" /></w:pPr>${run(text, { size: 10, bold })}</w:p></w:tc>`;
  const rowXml = (cellsRow, header = false) => `<w:tr>${cellsRow.map((cell) => cellXml(cell, header)).join("")}</w:tr>`;
  return [
    `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH_TWIPS}" w:type="dxa" /><w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${THETA.codeBorder.replace("#", "")}" />`).join("") +
    `</w:tblBorders></w:tblPr>`,
    rowXml(bodyRows[0], true),
    ...bodyRows.slice(1).map((cellsRow) => rowXml(cellsRow)),
    "</w:tbl>",
    paragraph("", { after: 10 }),
  ].join("");
}

/** 极简 Markdown → docx 段落序列（与工作台 MarkdownLite 的子集对齐）。 */
function markdownToBody(markdown) {
  const lines = String(markdown ?? "").split("\n");
  const parts = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      parts.push(codeBlock(codeLines.length ? codeLines : [" "]));
      continue;
    }
    if (/^\|.*\|/.test(line)) {
      const tableLines = [];
      while (index < lines.length && /^\|.*\|/.test(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      parts.push(tableMarkdown(tableLines));
      continue;
    }
    if (line.startsWith("### ")) parts.push(paragraph(line.slice(4), { size: 12, bold: true, before: 10, after: 6, color: THETA.brand }));
    else if (line.startsWith("## ")) parts.push(paragraph(line.slice(3), { size: 13.5, bold: true, before: 12, after: 6, color: THETA.brand }));
    else if (line.startsWith("# ")) parts.push(paragraph(line.slice(2), { size: 16, bold: true, before: 4, after: 10, color: THETA.ink, align: "center" }));
    else if (line.startsWith("> ")) parts.push(paragraph(line.slice(2), { italic: true, color: THETA.quote, indent: 12, after: 6 }));
    else if (/^\s*[-*] /.test(line)) parts.push(paragraph(`• ${line.replace(/^\s*[-*] /, "")}`, { indent: 10, after: 4 }));
    else if (/^\s*\d+[.、] /.test(line)) parts.push(paragraph(line.trim(), { indent: 10, after: 4 }));
    else if (line.trim() === "") parts.push(paragraph("", { after: 6 }));
    else parts.push(paragraph(line.trim(), { after: 8, line: 19 }));
    index += 1;
  }
  return parts.join("");
}

function documentXml(title, markdown) {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    "<w:body>",
    paragraph("AIQUOS · 实操任务素材", { size: 9, color: THETA.muted, align: "center", after: 4 }),
    paragraph(title, { size: 17, bold: true, align: "center", after: 6, color: THETA.ink }),
    paragraph(new Date().toLocaleDateString("zh-CN"), { size: 9.5, color: THETA.muted, align: "center", after: 14 }),
    `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${THETA.brand.replace("#", "")}" /></w:pBdr><w:spacing w:after="240" /></w:pPr></w:p>`,
    markdownToBody(markdown),
    '<w:sectPr>',
    `<w:pgSz w:w="${PAGE_WIDTH_TWIPS}" w:h="${PAGE_HEIGHT_TWIPS}" />`,
    '<w:pgMar w:top="1440" w:right="1260" w:bottom="1440" w:left="1260" />',
    "</w:sectPr>",
    "</w:body>",
    "</w:document>",
  ].join("");
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="xml" ContentType="application/xml" /><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml" /></Types>';
const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" /></Relationships>';
const WORD_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml" /></Relationships>';
const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>' + runProperties() + '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>';

export function buildTaskMaterialDocx(title, markdown) {
  const zip = [];
  const push = (name, data) => zip.push({ name, data });
  push("[Content_Types].xml", CONTENT_TYPES);
  push("_rels/.rels", ROOT_RELS);
  push("word/document.xml", documentXml(title, markdown));
  push("word/_rels/document.xml.rels", WORD_RELS);
  push("word/styles.xml", STYLES_XML);
  return zip;
}

function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xFF];
  return (crc ^ -1) >>> 0;
}

/** 无压缩（store）ZIP：docx 允许 stored 条目，省掉 inflate/deflate 依赖。 */
export function zipStore(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = encoder.encode(name);
    const content = encoder.encode(data);
    const crc = crc32(content);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); // UTF-8 文件名
    view.setUint16(8, 0, true); // store
    view.setUint32(14, crc, true);
    view.setUint32(18, content.length, true);
    view.setUint32(22, content.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, content);
    central.push({ nameBytes, crc, size: content.length, offset });
    offset += local.length + content.length;
  }
  const centralStart = offset;
  for (const { nameBytes, crc, size, offset: entryOffset } of central) {
    const entry = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(entry.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint32(42, entryOffset, true);
    entry.set(nameBytes, 46);
    chunks.push(entry);
    offset += entry.length;
  }
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, central.length, true);
  endView.setUint16(10, central.length, true);
  endView.setUint32(12, offset - centralStart, true);
  endView.setUint32(16, centralStart, true);
  chunks.push(end);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}

export function taskMaterialFileName(task) {
  const safe = String(task?.title ?? task?.id ?? "任务素材")
    .replace(/[\\/:*?"<>|]/g, "")
    .slice(0, 40);
  return `任务素材 · ${safe}.docx`;
}

export function downloadTaskMaterialDocx(task) {
  if (typeof document === "undefined" || typeof Blob === "undefined" || !task?.source) return false;
  const title = String(task.title ?? "任务素材").slice(0, 60);
  const bytes = zipStore(buildTaskMaterialDocx(title, task.source));
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = taskMaterialFileName(task);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
