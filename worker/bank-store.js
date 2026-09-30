// Override-aware question-bank store. The serving endpoint and the admin API
// both read through here so an admin edit reaches students immediately.
//
// Version contract (vendor integration guide): ANY change to question records
// requires an explicit bankVersion bump — saving always publishes the next
// version (v6 -> v7 -> ...). Client drafts recorded against an older version
// are dropped on read by design; history snapshots keep their recorded version
// so old reports stay attributable.
//
// Two editions share this store. The 精选版 (B) is the bundled bank; the 全量版
// (A) is a separate 880-question file. Each keeps its own override file and its
// own bankVersion, so publishing an edit to one edition cannot disturb the
// other — and a draft recorded under one edition is dropped when the student
// switches to the other, which is the intended behaviour.
//
// Persistence is pluggable: the vite dev middleware injects an fs-backed
// loader/saver (worker/bank-overrides.json, gitignored); a deployed worker
// without injection keeps overrides in module memory per isolate and reports
// persistent: false.
import bundledLite from "../src/comprehensive-questions.json" with { type: "json" };
import bundledFull from "../src/banks/comprehensive-880.json" with { type: "json" };
import { DEFAULT_EDITION, normalizeEdition } from "../src/bank-editions.js";
import { validateQuestionBank } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

/** 版本串 → 该版本的起始版本号。两套题池各自独立编号。 */
const BUNDLED_VERSIONS = {
  B: "objective-bank-v6-120",
  // v7: 2026-09-30 全量审计的数据修复（详见 docs/audit-2026-09-30.md）：
  //   1) 选项洗牌答案重映射方向错误——432/880 题答案重写；
  //   2) 判断题难度整体错位一档（partIndex 差一）——130 题难度回写。
  // 两项均由 scripts/repair-objective-answers.mjs / repair-judge-difficulty.mjs
  // 幂等修复，导入脚本根因已同步修正。
  A: "objective-bank-v7-880",
};

export const BUNDLED_BANK_VERSION = BUNDLED_VERSIONS[DEFAULT_EDITION];
const VERSION_PATTERN = /^objective-bank-v(\d+)-(\d+)$/;

/** 各版本的内置题池。 */
const BUNDLED_BANKS = {
  B: bundledLite.questions,
  A: bundledFull.questions,
};

let persistence = null;
// 按版本缓存：{ [edition]: state }
const states = new Map();
// 各版次历史上发布过的最大主版本号。resetBank 回到内置基线后再次发布时，
// nextVersion 必须越过历史最大值——否则 v6→发布v7→reset→再发布会再次产出
// v7，内容却已不同，旧 v7 时期的草稿会在"新 v7"下错误存活（版本契约要求
// 按版本丢弃旧草稿）。仅内存级（无后端的演示部署够用；多 isolate 各自记账）。
const maxPublishedMajor = new Map();

function publicState(raw) {
  return {
    bankVersion: raw.bankVersion,
    questions: raw.questions,
    source: raw.source,
    updatedAt: raw.updatedAt,
    persistent: Boolean(persistence),
    edition: raw.edition,
  };
}

function compileOverride(payload, edition) {
  if (!payload || !Array.isArray(payload.questions)) throw new Error("override payload has no questions array");
  validateQuestionBank(payload.questions);
  if (typeof payload.bankVersion !== "string" || !VERSION_PATTERN.test(payload.bankVersion)) {
    throw new Error("override payload has an invalid bankVersion");
  }
  return {
    bankVersion: payload.bankVersion,
    questions: payload.questions,
    source: "override",
    updatedAt: payload.updatedAt ?? null,
    edition,
  };
}

function nextVersion(previous, count, edition) {
  const match = VERSION_PATTERN.exec(previous ?? "");
  const candidates = [
    match ? Number(match[1]) + 1 : 2,
    (maxPublishedMajor.get(edition) ?? 0) + 1,
  ];
  const major = Math.max(...candidates);
  maxPublishedMajor.set(edition, Math.max(maxPublishedMajor.get(edition) ?? 0, major));
  return `objective-bank-v${major}-${count}`;
}

export function setBankPersistence(next) {
  persistence = next;
  states.clear();
}

export function getBankState(editionInput) {
  const edition = normalizeEdition(editionInput);
  const cached = states.get(edition);
  if (cached) return publicState(cached);
  if (persistence) {
    try {
      const raw = persistence.load(edition);
      if (raw) {
        const state = compileOverride(JSON.parse(raw), edition);
        states.set(edition, state);
        // 持久化覆盖的版本号计入历史最大值：重启后 reset+再发布也不会回卷。
        const loaded = VERSION_PATTERN.exec(state.bankVersion ?? "");
        if (loaded) maxPublishedMajor.set(edition, Math.max(maxPublishedMajor.get(edition) ?? 0, Number(loaded[1])));
        return publicState(state);
      }
    } catch {
      // Unreadable override file: fall back to the bundled bank rather than
      // taking the assessment down. The admin UI surfaces the fallback.
    }
  }
  const state = {
    bankVersion: BUNDLED_VERSIONS[edition],
    questions: BUNDLED_BANKS[edition],
    source: "bundled",
    updatedAt: null,
    edition,
  };
  states.set(edition, state);
  return publicState(state);
}

// Save an edited bank. Always publishes: the bump is the version contract.
export function setBank(questions, editionInput) {
  const edition = normalizeEdition(editionInput);
  validateQuestionBank(questions);
  const current = getBankState(edition);
  const payload = {
    bankVersion: nextVersion(current.bankVersion, questions.length, edition),
    questions,
    source: "override",
    updatedAt: new Date().toISOString(),
    edition,
  };
  if (persistence) persistence.save(JSON.stringify(payload, null, 2), edition);
  states.set(edition, payload);
  return publicState(payload);
}

// Discard the override and return to the bundled bank (also bumps nothing:
// the bundled version is the baseline again).
export function resetBank(editionInput) {
  const edition = normalizeEdition(editionInput);
  if (persistence) persistence.clear(edition);
  states.delete(edition);
  return getBankState(edition);
}
