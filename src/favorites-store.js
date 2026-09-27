import { useSyncExternalStore } from "react";
import { getAccount, subscribeAccount } from "./account-store";
import { CASE_PROJECTS } from "./case-projects";

/** 收藏按账号分桶持久化：aiquos-favorites:<accountId>，刷新不丢。 */
const PREFIX = "aiquos-favorites:";
/** 首次进入时用案例铺满收藏页；每个账号只播种一次，之后用户删光了也不会再补。 */
const SEEDED_PREFIX = "aiquos-favorites-seeded:";

function storageKey() {
  const id = getAccount().accountId?.trim() || "guest";
  return PREFIX + id;
}

function seededKey() {
  const id = getAccount().accountId?.trim() || "guest";
  return SEEDED_PREFIX + id;
}

function loadFrom(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(migrateFavorite).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * 迁移历史收藏记录。
 *
 * 旧版本用数组下标当案例收藏的 id（`case-<下标>`），下标会随 CASE_PROJECTS
 * 增删而漂移——已收藏的作品因此可能指向另一件作品，这正是"收藏的和展示的
 * 不一样"的成因。这里按图片编号把 id 改写成稳定形式（`case-<编号>`），并把
 * 配色/图片数组按项目自身重建，让旧记录和案例库里看到的一致。
 */
function migrateFavorite(item) {
  if (!item || typeof item !== "object") return null;
  const image = item.image ?? item.images?.[0];
  // 只改案例类记录：论坛条目自带语义 id，不受下标漂移影响。
  if (item.kind !== "case" || typeof image !== "string") {
    return Array.isArray(item.images) ? item : { ...item, images: image ? [image] : [] };
  }
  const match = image.match(/\/(\d+)\.webp$/);
  if (!match) return Array.isArray(item.images) ? item : { ...item, images: [image] };

  // 用图片编号反查项目：旧记录里的配色是硬编码的单一绿色，必须从项目自身的
  // world 重新取，否则收藏页里每张卡都长成同一个颜色。
  const project = CASE_PROJECTS.find((entry) => entry.image === Number(match[1]));
  if (!project) return { ...item, id: `case-${match[1]}`, images: [image] };
  const world = project.world ?? {};
  return {
    ...item,
    id: `case-${match[1]}`,
    images: [image],
    color: world.background ?? item.color,
    ink: world.ink ?? item.ink,
    line: world.ink ?? item.line,
    accent: world.accent ?? item.accent,
  };
}

function readSeeded(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSeeded(key) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* 存储不可用时每次都会重新播种，属可接受的降级 */
  }
}

let currentKey = storageKey();
let favorites = dedupeFavorites(loadFrom(currentKey));
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  try {
    localStorage.setItem(currentKey, JSON.stringify(favorites));
  } catch {
    /* 存储不可用时仅保留内存态 */
  }
}

/**
 * 去重：同一件作品只能有一条收藏。
 *
 * 历史数据里同一张图可能同时存在案例入口与论坛入口的两条记录（两套 id），
 * 收藏页会因此把它们显示成两条不同的内容。以作品身份去重，保留先出现的那条
 * （列表按"最近收藏在前"排列，先出现的即最近一次操作）。
 */
function dedupeFavorites(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const identity = favoriteIdentity(item);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    result.push(item);
  }
  return result;
}

// 账号切换（含系统换发新 ID）时，把旧账号收藏迁移到新账号名下并装载。
subscribeAccount(() => {
  const nextKey = storageKey();
  if (nextKey === currentKey) return;
  try {
    if (!localStorage.getItem(nextKey) && localStorage.getItem(currentKey)) {
      localStorage.setItem(nextKey, localStorage.getItem(currentKey));
    }
  } catch {
    /* 迁移失败时按新桶读取 */
  }
  currentKey = nextKey;
  favorites = dedupeFavorites(loadFrom(currentKey));
  seedFavoritesFromCases();
  emit();
});

/** 收藏页需要内容才有意义，而本地演示账号从不产生真实收藏。
 *  首次进入时用 CASE_PROJECTS 铺一批案例进去；播种标记独立于收藏数据，
 *  所以用户主动清空收藏后不会再被重新填满。 */
export function seedFavoritesFromCases() {
  const flag = seededKey();
  if (readSeeded(flag)) return;
  // 已有收藏（含旧版本遗留）即视为已播种，只补标记不覆盖用户数据。
  if (favorites.length > 0) {
    writeSeeded(flag);
    return;
  }
  favorites = CASE_PROJECTS.slice(0, 4).map((project, index) =>
    favoriteFromCase(project, index),
  );
  persist();
  writeSeeded(flag);
}

seedFavoritesFromCases();

// 把迁移与去重的结果落盘：否则每次刷新都要重算一遍，而且旧的重复记录会一直
// 留在存储里，下次从别的入口取消收藏时又会命中重复项。
persist();

export function addFavorite(item) {
  // 同一件作品可能从案例库和论坛两个入口收藏：按作品身份去重，避免收藏页
  // 出现两条指向同一张图的记录（且各自带着不同的标题与元数据）。
  if (isFavoriteSaved(favorites, item)) return;
  favorites = [item, ...favorites];
  persist();
  emit();
}

export function removeFavorite(id) {
  // 调用方可能给的是条目 id，也可能是作品身份（图片路径）：两者都接受，
  // 否则从论坛详情取消收藏时无法命中案例页收藏的那一条。
  favorites = favorites.filter(
    (favorite) => favorite.id !== id && favoriteIdentity(favorite) !== id,
  );
  persist();
  emit();
}

export function toggleFavorite(item) {
  if (isFavoriteSaved(favorites, item)) removeFavorite(favoriteIdentity(item));
  else addFavorite(item);
}

export function subscribeFavorites(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFavorites() {
  return favorites;
}

export function useFavorites() {
  return useSyncExternalStore(subscribeFavorites, getFavorites, getFavorites);
}

export function useFavoriteSaved(id) {
  return useSyncExternalStore(
    subscribeFavorites,
    () => isFavoriteSaved(favorites, typeof id === "string" ? { id } : id),
    () => false,
  );
}

export function favoriteFromCase(project, index) {
  // 封面取自项目自身的 image 编号。archive 案例各自带 image（1/6/3/7/5/2/4），
  // 早期版本用 index+1 拼路径，一旦 CASE_PROJECTS 重排就会把封面配错。
  const cover = project.image ?? index + 1;
  // 配色同样读项目自带的 world，而不是写死一个绿色：写死会让收藏页里每张卡
  // 都长成同一个颜色，和案例库里看到的作品对不上（收藏的和展示的不一样）。
  const world = project.world ?? {};
  return {
    // ID 必须锚定作品本身，不能锚定数组下标：下标会随 CASE_PROJECTS 的增删
    // 漂移，让已存的收藏指向另一件作品。image 编号是项目内的稳定标识。
    id: `case-${cover}`,
    kind: "case",
    tag: project.tags || "案例收藏",
    title: project.title,
    summary: project.description,
    tags: project.tags,
    year: project.year,
    author: "AIQUOS Work",
    createdAt: String(project.year),
    views: 1200 + index * 37,
    likes: 96 + index * 17,
    comments: [],
    image: `/assets/cases/${cover}.webp`,
    images: [`/assets/cases/${cover}.webp`],
    imageRatio: "4 / 3",
    color: world.background ?? "#00a96d",
    ink: world.ink ?? "#ffffff",
    line: world.ink ?? "#ffffff",
    accent: world.accent ?? "#bdf2d8",
    content: [
      project.description,
      `案例标签：${project.tags}。完成年份：${project.year}。`,
    ],
  };
}

export function favoriteFromForum(post, comments = post.comments ?? []) {
  return {
    ...post,
    kind: "forum",
    line: post.line ?? post.ink,
    comments,
  };
}

/**
 * 收藏项的唯一键。
 *
 * 案例与论坛引用的是同一批作品（同一张 /assets/cases/N.webp），但各自带一套
 * 互不相干的 id：案例是 `case-<下标>`，论坛是语义串（`case-parrot`）。于是
 * 同一件作品从两个入口收藏会存成两条记录，收藏页里就会出现重复且内容不一致
 * 的条目——这正是"收藏的和展示的不一样"的来源。
 *
 * 图片路径是两边共用的稳定标识，因此以它作为去重键；图片缺失时退回条目自身
 * 的 id，保证任何一条记录都仍然可去重。
 */
export function favoriteIdentity(item) {
  const image = item?.images?.[0] ?? item?.image;
  if (typeof image === "string" && image) return image;
  return item?.id ?? "";
}

/** 判断某条收藏是否已在列表中（按作品身份而非来源 id 判定）。 */
export function isFavoriteSaved(favorites, item) {
  const identity = favoriteIdentity(item);
  if (!identity) return false;
  return favorites.some((favorite) => favoriteIdentity(favorite) === identity);
}
