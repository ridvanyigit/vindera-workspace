/**
 * Real, per-browser "recently viewed" tracking via localStorage — no backend,
 * no fake personalization. Recorded on every product detail page visit,
 * read back by the homepage's "Recently Viewed" rail.
 */

const STORAGE_KEY = 'vindera_recently_viewed';
const MAX_ITEMS = 12;

function safeRead(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Records a product view, most-recent first, deduplicated, capped at MAX_ITEMS. */
export function recordProductView(id: string) {
  try {
    const current = safeRead().filter(existing => existing !== id);
    current.unshift(id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current.slice(0, MAX_ITEMS)));
  } catch {
    // Private browsing / blocked storage — recently-viewed just won't populate.
  }
}

/** Ids in most-recently-viewed-first order. */
export function getRecentlyViewedIds(): string[] {
  return safeRead();
}
