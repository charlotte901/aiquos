/** The journey behind the cases poster is an ordered subset of the case pool.
 * The pool itself is fixed — the archive projects plus the live scenes — so
 * nothing here invents content; it only decides what the poster walks through
 * and in which order. The one storage helper swallows failures so a private-mode
 * browser still works. */

export const JOURNEY_STORAGE_KEY = "aiquos.case-journey.v1";
/** How many cases the poster journey may hold. The pool is larger, so this is a
 * planning cap rather than a limit on the content that exists. */
export const JOURNEY_MAX = 20;

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
  if (out.length === 0) return fallback.slice(0, max);
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

/** Is this saved list just the grouped default a previous build shipped?
 *
 * The default journey used to be `[...archive covers, newest, ...live scenes]` —
 * every cover contiguous and in ascending index order, then every scene in
 * `CASES` order. That shape is not a preference, it is the arrangement of the
 * build that wrote it, so honouring it pins the very grouping the interleaved
 * default exists to replace: every reader who ever opened the poster would keep
 * seeing all the covers first, whatever the new default said.
 *
 * The test is deliberately strict. Only a list that is *exactly* covers-then-
 * scenes (after dropping keys this build no longer has) is treated as stale; one
 * the reader reordered by hand — even by moving a single case — fails the
 * comparison and is kept as their preference, which is the whole reason a saved
 * list wins at all. */
export function isStaleGroupedJourney(value, validKeys, fallback) {
  if (!Array.isArray(value) || !value.length) return false;
  const valid = new Set(validKeys);
  const seen = new Set();
  const saved = [];
  for (const key of value) {
    if (typeof key !== "string" || !valid.has(key) || seen.has(key)) continue;
    seen.add(key);
    saved.push(key);
  }
  const index = (key) => Number(key.split(":")[1]);
  const grouped = [
    ...fallback.filter((key) => key.startsWith("archive:")).sort((a, b) => index(a) - index(b)),
    ...fallback.filter((key) => key.startsWith("live:")),
  ];
  // A subset is still the grouped arrangement — an older build may not have had
  // every case that exists now, and `normalizeJourney` would append the rest.
  if (saved.length > grouped.length) return false;
  return saved.every((key, i) => key === grouped[i]);
}

export function readJourney(validKeys, fallback, max = JOURNEY_MAX) {
  if (typeof window === "undefined") return fallback.slice(0, max);
  try {
    const stored = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
    if (!stored) return fallback.slice(0, max);
    const parsed = JSON.parse(stored);
    // A stale shipped default is not a preference — fall through to the current
    // one. The caller persists the result, so the old list is replaced on mount.
    if (isStaleGroupedJourney(parsed, validKeys, fallback)) return fallback.slice(0, max);
    return normalizeJourney(parsed, validKeys, fallback, max);
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

