// Every hash route in one place. Construct and parse through these helpers so
// a rule change is a one-file edit; never hand-build route strings elsewhere.
const ASSESSMENT_IDS = new Set(["comprehensive", "objective", "conversation", "practical"]);
const PROFILE_IDS = new Set(["organizations", "works", "records", "favorites", "settings"]);

export function assessmentHash(id, stage) {
  return stage === undefined
    ? `#assessment/${id}`
    : `#assessment/${id}/level/${stage}`;
}

export function parseAssessmentRoute(hash = location.hash) {
  const match = /^#assessment\/([a-z]+)(?:\/level\/(\d))?$/.exec(hash);
  if (!match || !ASSESSMENT_IDS.has(match[1])) return null;
  return {
    id: match[1],
    stage: Math.max(1, Math.min(5, Number(match[2] ?? 1))),
    mode: match[2] ? "task" : "map",
  };
}

export function profileDetailHash(id) {
  return `#center/${id}`;
}

export function parseProfileDetailRoute(hash = location.hash) {
  const match = /^#center\/([a-z-]+)$/.exec(hash);
  if (!match || !PROFILE_IDS.has(match[1])) return null;
  return match[1];
}

export function forumHash(view) {
  return `#forum/${view}`;
}

export function siteViewForHash(hash = location.hash) {
  const assessment = parseAssessmentRoute(hash);
  if (assessment) return assessment.mode === "task" ? "assessment-task" : "assessment-map";
  if (parseProfileDetailRoute(hash)) return "profile-detail";
  if (hash === "#assessments") return "assessments";
  if (hash === "#cases") return "cases";
  if (/^#forum(\/|$)/.test(hash)) return "forum";
  if (hash === "#account-settings") return "account-settings";
  if (hash === "#reports") return "reports";
  if (hash === "#choose") return "choose";
  if (hash === "#profile") return "profile";
  if (hash === "#login") return "login";
  return "home";
}
