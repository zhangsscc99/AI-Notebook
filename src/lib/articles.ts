import type { ContentSection } from "../types";

const articleCache = new Map<string, Promise<string>>();

function fetchArticle(section: ContentSection) {
  return fetch(section.source, {
    headers: { Accept: "text/html" },
    credentials: "same-origin",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Article request failed with HTTP ${response.status}`);
    }
    return response.text();
  });
}

export function loadArticle(section: ContentSection) {
  let request = articleCache.get(section.id);
  if (!request) {
    request = fetchArticle(section).catch((error) => {
      articleCache.delete(section.id);
      throw error;
    });
    articleCache.set(section.id, request);
  }
  return request;
}

export function preloadArticle(section?: ContentSection | null) {
  if (section) void loadArticle(section).catch(() => undefined);
}
