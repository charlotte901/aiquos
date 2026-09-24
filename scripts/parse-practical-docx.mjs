/**
 * 实操题库（docx）解析器。
 *
 * 两份源文档同源但字段命名不完全一致，解析器必须两边都吃下：
 *
 *   AI实操任务题库（80题）.docx        实操任务题库（单独测试）4版.docx
 *   ───────────────────────────────   ───────────────────────────────
 *   第 N 题 / ★☆☆ / 代码类            第 N 题 / 难度：低 / 图片类
 *   【场景】                            （无标签，题干即首段正文）
 *   【实操任务】                        （无）
 *   【示例提示词】                      【标准提示词】
 *   【示例产物】                        【标准产物】—— 后缀说明
 *   标准答案（含示例提示词与示例产物）      标准答案（含标准提示词与标准产物）
 *
 * 难度词表也不同：★☆☆ / ★★☆ / ★★★ 对 low/medium/high，
 * 长写形式 难度：低/中/高 对同一组。
 */
import { execFileSync } from "node:child_process";

// OOXML 里标签可能带属性也可能不带（`<w:tr>` 与 `<w:tr w:rsidR="…">` 并存），
// 所以每个开标签的属性部分都必须是可选的：只写 `<w:tr[ >]` 会漏掉无属性写法。
/**
 * 表格内部的切分（行 / 单元格 / 段落）。
 *
 * 这里用非贪婪正则即可：`<w:tr>` 不会嵌套 `<w:tr>`，`<w:tc>` 不会嵌套
 * `<w:tc>`，所以「最短闭合」就是正确边界。整表切分另见 splitTopLevelBlocks。
 */
const ROW = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
const CELL = /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g;
const PARA = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

/**
 * 把 body XML 切成顶层块（表格 / 段落）。
 *
 * 不能用一条 alternation 正则来做：表格内部本身含 `<w:p>`，正则扫到
 * `<w:tbl>` 之后会在表格**内部**的 `<w:p>` 上提前闭合，把一张表切成若干
 * 碎片（实测 241 张表只切出 213 个块，导致 28 道题丢失）。这里改成标签
 * 配对扫描：维护深度计数器，只在深度归零时收口一个块。
 */
function splitTopLevelBlocks(xml) {
  const blocks = [];
  // `\b` 用来把 `<w:pPr>`（样式容器）排除在外；`[^>]*?` 用非贪婪并在其后
  // 单列 `(\/)?`，才能正确识别自闭合写法 `<w:p w14:paraId="…"/>`——若把
  // `[^>]*` 写成贪婪，它会把结尾的 `/` 一起吃掉，自闭合标签就被当成开标签，
  // 深度再也回不到 0，整篇文档会并成一个块。
  const re = /<w:(tbl|p)\b[^>]*?(\/)?>|<\/w:(tbl|p)>/g;
  let depth = 0;
  let start = -1;
  let kind = null;
  let match;

  while ((match = re.exec(xml))) {
    const [full, openTag, selfClose, closeTag] = match;
    const tag = openTag ?? closeTag;

    if (openTag) {
      if (depth === 0) {
        start = match.index;
        kind = tag;
      }
      if (selfClose) {
        // 自闭合：本身就是一个完整块，不改变深度。
        if (depth === 0) {
          blocks.push({ kind: tag, xml: full });
          start = -1;
          kind = null;
        }
      } else {
        depth += 1;
      }
      continue;
    }

    depth -= 1;
    if (depth === 0 && start >= 0 && kind) {
      blocks.push({ kind, xml: xml.slice(start, match.index + full.length) });
      start = -1;
      kind = null;
    }
  }

  return blocks;
}

function decode(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function paragraphText(paragraph) {
  const runs = paragraph.match(TEXT) ?? [];
  return runs.map((run) => decode(run.replace(TEXT, "$1"))).join("");
}

function cellText(cell) {
  return (cell.match(PARA) ?? [])
    .map(paragraphText)
    .filter((line) => line.trim())
    .join("\n")
    .trim();
}

export function readDocumentXml(docxPath) {
  return execFileSync("unzip", ["-p", docxPath, "word/document.xml"], {
    maxBuffer: 1024 * 1024 * 256,
    encoding: "utf8",
  });
}

const STAR_DIFFICULTY = { "★☆☆": "low", "★★☆": "medium", "★★★": "high" };
const WORD_DIFFICULTY = { 低: "low", 中: "medium", 高: "high" };

/** 头部表：题干号、难度、类别三格，外加一行合并的「考察维度… | 满分… | 建议用时…」。 */
function parseHeader(cellTexts) {
  if (cellTexts.length < 3) return null;
  const numberMatch = cellTexts[0].match(/^第\s*(\d+)\s*题$/);
  if (!numberMatch) return null;

  const difficultyCell = cellTexts[1];
  const difficulty =
    STAR_DIFFICULTY[difficultyCell] ??
    (difficultyCell.match(/难度[：:]\s*([低中高])/) ? WORD_DIFFICULTY[difficultyCell.match(/难度[：:]\s*([低中高])/)[1]] : null);

  const category = cellTexts[2].trim();
  const metaCell = cellTexts[3] ?? "";

  // 「考察维度：提示词工程、AI工具使用 | 满分：20分 | 建议用时：5-8分钟」
  const dimsMatch = metaCell.match(/考察维度[：:]\s*([^|｜]+)/);
  const minutesMatch = metaCell.match(/建议用时[：:]\s*([^|｜]+)/);
  const dims = dimsMatch
    ? dimsMatch[1].split(/[、,，]/).map((part) => part.trim()).filter(Boolean)
    : [];
  const minutes = minutesMatch ? minutesMatch[1].trim() : "";

  return { number: Number(numberMatch[1]), difficulty, category, dims, minutes };
}

/**
 * 评分标准表 → 维度数组。
 * 表头是「评分维度 | 分值 | 优秀 | 良好 | 及格」，首行之后每行一个维度。
 */
function parseRubric(tableXml) {
  const rows = tableXml.match(ROW) ?? [];
  const out = [];
  for (const [index, row] of rows.entries()) {
    if (index === 0) continue; // 表头
    const cells = (row.match(CELL) ?? []).map(cellText);
    if (cells.length < 2) continue;
    const [dimension, points] = cells;
    if (!dimension || !points) continue;
    out.push({
      dimension: dimension.replace(/\s+/g, " ").trim(),
      points: points.replace(/\s+/g, " ").trim(),
      excellent: (cells[2] ?? "").replace(/\s+/g, " ").trim(),
      good: (cells[3] ?? "").replace(/\s+/g, " ").trim(),
      pass: (cells[4] ?? "").replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

/**
 * 解析一份实操 docx。
 * 结构：每题 = 头部表 + （正文段落） + 评分标准一表 + 评分标准二表。
 * 正文段落里带【标签】的字段是答案素材，其余是题干。
 */
export function parsePracticalBank(docxPath) {
  const xml = readDocumentXml(docxPath);

  // 按文档顺序切出「段落 / 表格」流，才能把正文与它前后的表关联起来。
  const blocks = [];
  for (const raw of splitTopLevelBlocks(xml)) {
    if (raw.kind === "tbl") {
      blocks.push({ kind: "table", xml: raw.xml });
    } else {
      const text = paragraphText(raw.xml).trim();
      if (text) blocks.push({ kind: "p", text });
    }
  }

  const tasks = [];
  let current = null;
  let pendingRubrics = 0;

  for (const block of blocks) {
    if (block.kind === "table") {
      const rows = block.xml.match(ROW) ?? [];
      const firstCells = rows.length ? (rows[0].match(CELL) ?? []).map(cellText) : [];
      const header = parseHeader(firstCells);

      if (header) {
        // 新题开始：先收尾上一题。
        if (current) tasks.push(current);
        current = {
          number: header.number,
          difficulty: header.difficulty,
          category: header.category,
          dims: header.dims,
          minutes: header.minutes,
          paragraphs: [],
          rubricPrompt: null,
          rubricProduct: null,
          assets: [],
        };
        pendingRubrics = 0;
        continue;
      }

      if (current && pendingRubrics < 2) {
        const rubric = parseRubric(block.xml);
        if (rubric.length) {
          if (pendingRubrics === 0) current.rubricPrompt = rubric;
          else current.rubricProduct = rubric;
          pendingRubrics += 1;
        }
      }
      continue;
    }

    if (current) current.paragraphs.push(block.text);
  }
  if (current) tasks.push(current);

  return tasks;
}

/** 把正文段落切成带标签的字段：{ scene, material, prompt, product, instructions }。 */
export function extractFields(paragraphs) {
  const LABEL = /^【([^】]+)】(.*)$/;
  let scene = "";
  let material = "";
  let prompt = "";
  let product = "";
  const instructions = [];
  const extras = {};

  let mode = "scene";
  for (const raw of paragraphs) {
    const line = raw.trim();
    if (!line) continue;
    const labelMatch = line.match(LABEL);

    // 「标准答案（含示例提示词与示例产物）」这类分隔标题：切换后续内容的归属。
    if (/^标准答案/.test(line)) {
      mode = "answer";
      continue;
    }

    if (labelMatch) {
      const [, label, rest] = labelMatch;
      const body = rest.trim();
      if (/^(示例提示词|标准提示词)$/.test(label)) {
        mode = "prompt";
        prompt = prompt ? `${prompt}\n${body}` : body;
        continue;
      }
      if (/^(示例产物|标准产物)/.test(label)) {
        mode = "product";
        // 【标准产物】—— AI生成的… ：破折号后是说明，不是正文的一部分。
        const cleaned = body.replace(/^[—–-]{1,2}\s*/, "");
        product = product ? `${product}\n${cleaned}` : cleaned;
        continue;
      }
      if (/^(实操任务|修正要求|输出要求|任务要求)$/.test(label)) {
        mode = "instructions";
        if (body) instructions.push(body);
        continue;
      }
      if (/^场景$/.test(label)) {
        mode = "scene";
        scene = scene ? `${scene}\n${body}` : body;
        continue;
      }
      // 【待修正代码】【待处理内容】【角色设定】等：并入当前字段。
      if (mode === "prompt" || mode === "instructions") {
        const target = mode === "prompt" ? (v) => { prompt = prompt ? `${prompt}\n${v}` : v; } : (v) => instructions.push(v);
        if (body) target(body);
      } else if (mode === "product") {
        if (body) product = product ? `${product}\n${body}` : body;
      } else {
        if (body) material = material ? `${material}\n${body}` : body;
      }
      extras[label] = body;
      continue;
    }

    // 无标签段落：按当前归属追加。
    if (mode === "prompt") prompt = prompt ? `${prompt}\n${line}` : line;
    else if (mode === "product") product = product ? `${product}\n${line}` : line;
    else if (mode === "instructions") instructions.push(line);
    else if (mode === "answer") product = product ? `${product}\n${line}` : line;
    else if (!scene) scene = line;
    else material = material ? `${material}\n${line}` : line;
  }

  return { scene, material, prompt, product, instructions, extras };
}

/** 类别词 → 我方 outputType（决定生成走文本还是图片通道）。 */
export function resolveOutputType(category, product) {
  if (category === "图片类") return "image";
  if (category === "代码类") return "text";
  // 文本类里若是英文绘图提示词，也按图片处理。
  return /--ar\s|--v\s|stable diffusion/i.test(product ?? "") ? "image" : "text";
}
