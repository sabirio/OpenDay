/**
 * paginationEngine.js — generic, domain-agnostic pure math for paging a
 * client-side list (page count, slice bounds, and a bounded page-number
 * window for a footer control). No business rules live here — just the
 * reusable arithmetic behind Portfolio's master-detail pagination.
 */

/** Total pages for `totalCount` items at `pageSize` per page — never less than 1. */
export function computePageCount(totalCount, pageSize) {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/** Clamp a requested page into [1, pageCount]. */
export function clampPage(page, pageCount) {
  return Math.min(Math.max(1, page), pageCount);
}

/** Normalize an untrusted URL page value into a positive 1-based page. */
export function parseRequestedPage(value) {
  return Math.max(1, Number(value) || 1);
}

/** The `[start, end]` (1-based, inclusive) item range shown on `page`. */
export function pageRange(page, pageSize, totalCount) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  return { start, end };
}

/** Slice `items` to the given 1-based `page` of `pageSize` items each. */
export function paginate(items, page, pageSize) {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

/** A bounded run of page numbers (at most `windowSize`) centered on `page`,
 * clamped to [1, pageCount] — avoids rendering hundreds of page buttons for
 * a very large list. */
export function pageWindow(page, pageCount, windowSize = 5) {
  const windowStart = Math.max(1, page - Math.floor(windowSize / 2));
  const windowEnd = Math.min(pageCount, windowStart + windowSize - 1);
  const clampedStart = Math.max(1, windowEnd - windowSize + 1);
  const pages = [];
  for (let p = clampedStart; p <= windowEnd; p++) pages.push(p);
  return pages;
}
