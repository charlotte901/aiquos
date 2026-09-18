/** The journey behind the cases poster is an ordered subset of the case pool.
 * The pool itself is fixed — the archive projects plus the live scenes — so
 * nothing here invents content; it only decides what the poster walks through
 * and in which order. Everything in this module is pure except the two storage
 * helpers, which swallow failures so a private-mode browser still works. */

export const JOURNEY_STORAGE_KEY = "aiquos.case-journey.v1";
export const JOURNEY_MIN = 1;
/** How many cases the poster journey may hold. The pool is larger, so this is a
 * planning cap rather than a limit on the content that exists. */
export const JOURNEY_MAX = 20;

/** Removed cases and edited poster colours are dev-panel state, so they persist
 * next to the journey. Both are keyed by the case's stable `key`. */
export const POOL_STORAGE_KEY = "aiquos.case-pool.v1";
export const COLOR_STORAGE_KEY = "aiquos.case-colors.v1";

/** A poster world is two master colours: the ground the case sits on and the ink
 * drawn over it. Both are plain hex, so the panel can hand them straight to an
 * `<input type="color">` and to CSS without a translation step. */
export function normalizeColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

/** Keep only entries whose key still exists, and only valid hex values. Unknown
 * cases and junk values fall back rather than throwing, so a stale saved blob
 * from an older build can never break the poster. */
export function normalizeColors(value, validKeys, defaults) {
  const valid = new Set(validKeys);
  const out = {};
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (!valid.has(key) || !entry || typeof entry !== "object") continue;
      const fallback = defaults[key];
      if (!fallback) continue;
      out[key] = {
        background: normalizeColor(entry.background, fallback.background),
        ink: normalizeColor(entry.ink, fallback.ink),
      };
    }
  }
  return out;
}

/** Keep only keys the pool actually has, drop duplicates, and fall back to the
 * default journey when nothing usable survives.
 *
 * A saved journey is preferred over the default, because the reader may have
 * reordered it by hand. That preference used to hide newly added cases forever:
 * any saved list with at least one entry won outright, so a case added after the
 * list was written never became reachable — it existed in the pool and on the
 * library wheel, but not on the poster the reader actually lands on.
 *
 * The fix is to treat the saved list as a *preference about order*, not as a
 * fixed membership: anything in the current default that the saved list omits is
 * added on the end, up to the cap. A case the reader deliberately removed is
 * unaffected — that lives in the separate removed-keys set and is filtered out of
 * `validKeys` before this runs, so it can never be reintroduced here. */
export function normalizeJourney(value, validKeys, fallback, max = JOURNEY_MAX) {
  const valid = new Set(validKeys);
  const seen = new Set();
  const out = [];
  if (Array.isArray(value)) {
    for (const key of value) {
      if (typeof key !== "string" || !valid.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  if (out.length < JOURNEY_MIN) return fallback.slice(0, max);
  // Adopt cases that the current default includes but this saved list predates,
  // without letting the list grow past the cap the editor enforces.
  for (const key of fallback) {
    if (out.length >= max) break;
    if (seen.has(key) || !valid.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Lift one entry out and drop it back in at `to`, clamping the target so a
 * stale index can never punch a hole in the list. */
export function moveJourney(list, from, to) {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item);
  return next;
}

export function addJourneyKey(list, key) {
  return list.includes(key) ? list : [...list, key];
}

/** The journey is never allowed to empty out — there would be nothing left to
 * page through. */
export function removeJourneyKey(list, key) {
  if (list.length <= JOURNEY_MIN) return list;
  const next = list.filter((item) => item !== key);
  return next.length >= JOURNEY_MIN ? next : list;
}

export function isDefaultJourney(list, fallback) {
  return list.length === fallback.length && list.every((key, i) => key === fallback[i]);
}

export function readJourney(validKeys, fallback, max = JOURNEY_MAX) {
  if (typeof window === "undefined") return fallback.slice(0, max);
  try {
    const stored = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
    if (!stored) return fallback.slice(0, max);
    return normalizeJourney(JSON.parse(stored), validKeys, fallback, max);
  } catch {
    return fallback.slice(0, max);
  }
}

export function writeJourney(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* Private mode or a full quota — the order simply does not persist. */
  }
}

/** The set of case keys the developer panel has deleted from the pool.
 *
 * Removal is permanent from the panel's point of view — a removed case is gone
 * from the journey, from the addable pool and from the poster — so the set is
 * what gets stored rather than the surviving list. That way adding new cases to
 * `CASE_POOL` later does not silently resurrect an old deletion, and RESET can
 * clear the whole set to bring everything back. */
export function readRemovedKeys(validKeys) {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(POOL_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(validKeys);
    return [...new Set(parsed.filter((key) => typeof key === "string" && valid.has(key)))];
  } catch {
    return [];
  }
}

export function writeRemovedKeys(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POOL_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* Private mode — deletions simply do not persist. */
  }
}

export function readColors(validKeys, defaults) {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(COLOR_STORAGE_KEY);
    if (!stored) return {};
    return normalizeColors(JSON.parse(stored), validKeys, defaults);
  } catch {
    return {};
  }
}

export function writeColors(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Private mode — colours simply do not persist. */
  }
}
