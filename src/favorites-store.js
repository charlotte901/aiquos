import { useSyncExternalStore } from "react";
import { getAccount, subscribeAccount } from "./account-store";

/** 收藏按账号分桶持久化：aiquos-favorites:<accountId>，刷新不丢。 */
const PREFIX = "aiquos-favorites:";

function storageKey() {
  const id = getAccount().accountId?.trim() || "guest";
  return PREFIX + id;
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
  emit();
});

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
  return {
    id: `case-${index}`,
    kind: "case",
    tag: "案例收藏",
    title: project.title,
    summary: project.description,
    tags: project.tags,
    year: project.year,
    author: "AIQUOS Work",
    createdAt: String(project.year),
    views: 1200 + index * 37,
    likes: 96 + index * 17,
    comments: [],
    image: `/assets/cases/${index + 1}.webp`,
    images: [`/assets/cases/${index + 1}.webp`],
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
