export const PROFILE_ART = "/assets/profile-reference.png";
// Source pixels: white bounce lettering ("CENTER") over five category cards.
export const PROFILE_WORDMARK = [456, 140, 813, 174];
export const PROFILE_CARDS = [
  { id: "organizations", title: "我的组织", subtitle: "My Organization", crop: [110, 350, 294, 438] },
  { id: "works", title: "我的作品", subtitle: "My Works", crop: [420, 350, 285, 438] },
  { id: "records", title: "测评记录", subtitle: "Assessment Records", crop: [720, 350, 275, 438] },
  { id: "favorites", title: "我的收藏", subtitle: "My Favorites", crop: [1010, 350, 285, 438] },
  { id: "settings", title: "账号设置", subtitle: "Account Settings", crop: [1310, 350, 268, 438] },
];

// Detail pages stay intentionally empty; each color is sampled from its card.
export const PROFILE_DETAILS = {
  organizations: { title: "我的组织", color: "#62a7fa" },
  works: { title: "我的作品", color: "#76b664" },
  records: { title: "测评记录", color: "#bf94ed" },
  favorites: { title: "我的收藏", color: "#f99848" },
  settings: { title: "账号设置", color: "#7a98e2" },
};

export function getProfileDetailId(hash = location.hash) {
  const match = hash.match(/^#center\/(organizations|works|records|favorites|settings)$/);
  return match ? match[1] : null;
}

export function getProfileDetailRoute() {
  return getProfileDetailId(location.hash);
}

export function getProfileLayout(width, height) {
  // TEST's shared unit, scaled down for the five-across row: five cards on
  // the 1502 span read crowded at laptop widths, so the whole page keeps its
  // internal rhythm at 88%.
  const unit = 0.88 * Math.min(width / 1672, Math.max(height, 560) / 941);
  return { compact: width < 760, variables: { "--profile-unit": unit } };
}
