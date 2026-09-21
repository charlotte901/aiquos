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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
let favorites = loadFrom(currentKey);
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
  favorites = loadFrom(currentKey);
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

export function addFavorite(item) {
  if (favorites.some((favorite) => favorite.id === item.id)) return;
  favorites = [item, ...favorites];
  persist();
  emit();
}

export function removeFavorite(id) {
  favorites = favorites.filter((favorite) => favorite.id !== id);
  persist();
  emit();
}

export function toggleFavorite(item) {
  if (favorites.some((favorite) => favorite.id === item.id)) removeFavorite(item.id);
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
    () => favorites.some((favorite) => favorite.id === id),
    () => false,
  );
}

export function favoriteFromCase(project, index) {
  // 封面取自项目自身的 image 编号。archive 案例各自带 image（1/6/3/7/5/2/4），
  // 早期版本用 index+1 拼路径，一旦 CASE_PROJECTS 重排就会把封面配错。
  const cover = project.image ?? index + 1;
  return {
    id: `case-${index}`,
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
    color: "#00a96d",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#bdf2d8",
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
