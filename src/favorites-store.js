import { useSyncExternalStore } from "react";

let favorites = [];
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function addFavorite(item) {
  if (favorites.some((favorite) => favorite.id === item.id)) return;
  favorites = [item, ...favorites];
  emit();
}

export function removeFavorite(id) {
  favorites = favorites.filter((favorite) => favorite.id !== id);
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
