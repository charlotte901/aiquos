/**
 * 880 题客观题库（docx）解析器。
 *
 * 源文档每题一张表：首行 3 格放题号/题型/单元，后续行依次是
 * 考察方向、题干、选项、答案、解析。这里按同样的顺序读回来，
 * 并对每题做完整性断言——解析失败必须是显式的，不能静默丢题。
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TBL = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
const ROW = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
const CELL = /<w:tc>[\s\S]*?<\/w:tc>/g;
const PARA = /<w:p[ >][\s\S]*?<\/w:p>/g;
const TEXT = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

function decode(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function cellText(cell) {
  const paragraphs = cell.match(PARA) ?? [];
  return paragraphs
    .map((paragraph) => {
      const runs = paragraph.match(TEXT) ?? [];
      return runs.map((run) => decode(run.replace(TEXT, "$1"))).join("");
    })
    .filter((line) => line.trim())
    .join("\n")
    .trim();
}

/** Reads word/document.xml out of a .docx via the system unzip. */
export function readDocumentXml(docxPath) {
  return execFileSync("unzip", ["-p", docxPath, "word/document.xml"], {
    maxBuffer: 1024 * 1024 * 256,
    encoding: "utf8",
  });
}

/** Parses the 880-question bank into raw {id, type, unit, tag, stem, options, answer, analysis} records. */
export function parseObjectiveBank(docxPath) {
  const xml = readDocumentXml(docxPath);
  const tables = xml.match(TBL) ?? [];
  const records = [];

  for (const [index, table] of tables.entries()) {
    // Table 0 is the summary/TOC table, not a question.
    if (index === 0) continue;
    const rows = table.match(ROW) ?? [];
    if (rows.length === 0) continue;

    const firstRow = rows[0].match(CELL) ?? [];
    if (firstRow.length < 3) continue;
    const idCell = cellText(firstRow[0]);
    const idMatch = idCell.match(/^第\s*(\d+)\s*题$/);
    if (!idMatch) continue;

    const type = cellText(firstRow[1]);
    const unit = cellText(firstRow[2]);
    const body = rows
      .slice(1)
      .map((row) => (row.match(CELL) ?? []).map(cellText).join("\n"))
      .join("\n");

    const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
    const tag = (lines.find((line) => line.startsWith("考察方向")) ?? "")
      .replace(/^考察方向[：:]\s*/, "");
    const options = [];
    let stem = "";
    let answer = null;
    let judge = null;
    let analysis = "";

    for (const line of lines) {
      const optionMatch = line.match(/^([A-D])\.\s*(.+)$/);
      if (optionMatch && !line.startsWith("考察方向")) {
        options.push({ key: optionMatch[1], text: optionMatch[2].trim() });
        continue;
      }
      if (line.startsWith("正确答案（多选）")) {
        answer = line.replace(/^正确答案（多选）[：:]\s*/, "").trim();
        continue;
      }
      if (line.startsWith("正确答案")) {
        answer = line.replace(/^正确答案[：:]\s*/, "").trim();
        continue;
      }
      if (line.startsWith("判断结果")) {
        judge = line.replace(/^判断结果[：:]\s*/, "").trim();
        continue;
      }
      if (line.startsWith("解析")) {
        analysis = line.replace(/^解析[：:]\s*/, "").trim();
        continue;
      }
      if (line.startsWith("考察方向")) continue;
      stem = stem ? `${stem}\n${line}` : line;
    }

    records.push({
      number: Number(idMatch[1]),
      id: `obj-${String(idMatch[1]).padStart(3, "0")}`,
      sourceType: type,
      unit,
      tag,
      stem: stem.trim(),
      options,
      answerRaw: answer,
      judgeRaw: judge,
      analysis,
    });
  }

  records.sort((left, right) => left.number - right.number);
  return records;
}

/** Canonical question type for the scoring engine. */
export function resolveType(record) {
  if (record.sourceType === "多选题") return "multi";
  if (record.sourceType === "判断题") return "judge";
  return "single";
}

/**
 * Canonical answer keys.
 *
 * 判断题在源文档里有两个答案通道：`判断题` 专练用「判断结果：正确/错误」，
 * 而正文里的判断题用字母 A/B。两者都归一到选项键上——这正是上一版转换
 * 脚本丢掉 80 道答案的地方。
 */
export function resolveAnswer(record) {
  if (record.judgeRaw) {
    const isTrue = record.judgeRaw === "正确";
    const match = record.options.find(
      (option) => option.text === (isTrue ? "正确" : "错误"),
    );
    if (match) return [match.key];
  }
  if (record.answerRaw) {
    return record.answerRaw.replace(/\s/g, "").split("").filter(Boolean);
  }
  return [];
}
