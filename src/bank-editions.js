/**
 * 题库版本（edition）定义 —— 前后端共用。
 *
 * 工程上有两套完整题库：
 *
 *   A 全量版   客观 880 + 实操 80 + 综合 880
 *   B 精选版   客观 120 + 实操 10 + 综合 120
 *
 * 「什么题目就呆在什么类型题目的区域」：客观通道只吃客观池，实操通道只吃
 * 实操池，综合测评按版本吃对应的综合池。切换版本只换数据源，评分与自适应
 * 引擎完全不动。
 *
 * 首页默认 B（精选）：它是评委与访客第一次打开时看到的那一套，题量适中，
 * 20 分钟能走完；A 由学员在测评入口切换。
 */

export const EDITION_KEY = "aiquos.bank-edition.v1";

export const EDITIONS = {
  A: {
    id: "A",
    label: "全量版",
    short: "全量",
    // 各通道的题池规模（用于界面文案与版本串）
    counts: { objective: 880, practical: 80, comprehensive: 880 },
    // 版本串后缀：bank-store 用它区分不同版本的 override 文件
    versionSuffix: "880",
  },
  B: {
    id: "B",
    label: "精选版",
    short: "精选",
    counts: { objective: 120, practical: 10, comprehensive: 120 },
    versionSuffix: "120",
  },
};

export const DEFAULT_EDITION = "B";

/** 归一化版本 id：任何非法输入都回到默认版本。 */
export function normalizeEdition(value) {
  const id = String(value ?? "").trim().toUpperCase();
  return EDITIONS[id] ? id : DEFAULT_EDITION;
}

export function editionMeta(value) {
  return EDITIONS[normalizeEdition(value)];
}

/** 读取学员选择的版本（localStorage 不可用时回默认）。 */
export function readEdition() {
  try {
    return normalizeEdition(localStorage.getItem(EDITION_KEY));
  } catch {
    return DEFAULT_EDITION;
  }
}

/** 写入学员选择的版本。 */
export function writeEdition(value) {
  try {
    localStorage.setItem(EDITION_KEY, normalizeEdition(value));
  } catch {
    /* 存储不可用时仅影响本次会话，不影响作答 */
  }
}

/** 该版本下某个通道的题量，用于「全量版 · 880 题」这类文案。 */
export function editionCount(value, channel) {
  return editionMeta(value).counts[channel] ?? 0;
}

/** 「全量版 · 客观 880 · 实操 80」——入口与徽章共用的一行说明。 */
export function editionSummary(value) {
  const meta = editionMeta(value);
  return `${meta.label} · 客观 ${meta.counts.objective} · 实操 ${meta.counts.practical}`;
}
