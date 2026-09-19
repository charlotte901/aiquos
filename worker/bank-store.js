// Override-aware question-bank store. The serving endpoint and the admin API
// both read through here so an admin edit reaches students immediately.
//
// Version contract (vendor integration guide): ANY change to question records
// requires an explicit bankVersion bump — saving always publishes the next
// version (v6 -> v7 -> ...). Client drafts recorded against an older version
// are dropped on read by design; history snapshots keep their recorded version
// so old reports stay attributable.
//
// Persistence is pluggable: the vite dev middleware injects an fs-backed
// loader/saver (worker/bank-overrides.json, gitignored); a deployed worker
// without injection keeps overrides in module memory per isolate and reports
// persistent: false.
import bundledBank from "../src/comprehensive-questions.json" with { type: "json" };
import { validateQuestionBank } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

export const BUNDLED_BANK_VERSION = "objective-bank-v6-120";
const VERSION_PATTERN = /^objective-bank-v(\d+)-(\d+)$/;

let persistence = null;
let state = null;

function publicState(raw) {
  return {
    bankVersion: raw.bankVersion,
    questions: raw.questions,
    source: raw.source,
    updatedAt: raw.updatedAt,
    persistent: Boolean(persistence),
  };
}

function compileOverride(payload) {
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
  };
}

function nextVersion(previous, count) {
  const match = VERSION_PATTERN.exec(previous ?? "");
  const major = match ? Number(match[1]) + 1 : 2;
  return `objective-bank-v${major}-${count}`;
}

export function setBankPersistence(next) {
  persistence = next;
  state = null;
}

export function getBankState() {
  if (state) return publicState(state);
  if (persistence) {
    try {
      const raw = persistence.load();
      if (raw) {
        state = compileOverride(JSON.parse(raw));
        return publicState(state);
      }
    } catch {
      // Unreadable override file: fall back to the bundled bank rather than
      // taking the assessment down. The admin UI surfaces the fallback.
    }
  }
  state = {
    bankVersion: BUNDLED_BANK_VERSION,
    questions: bundledBank.questions,
    source: "bundled",
    updatedAt: null,
  };
  return publicState(state);
}

// Save an edited bank. Always publishes: the bump is the version contract.
export function setBank(questions) {
  validateQuestionBank(questions);
  const current = getBankState();
  const payload = {
    bankVersion: nextVersion(current.bankVersion, questions.length),
    questions,
    source: "override",
    updatedAt: new Date().toISOString(),
  };
  if (persistence) persistence.save(JSON.stringify(payload, null, 2));
  state = payload;
  return publicState(state);
}

// Discard the override and return to the bundled bank (also bumps nothing:
// the bundled version is the baseline again).
export function resetBank() {
  if (persistence) persistence.clear();
  state = null;
  return getBankState();
}
