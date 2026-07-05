import { ZodError } from 'zod';

/**
 * Validates an array against a Zod element schema, item by item.
 *
 * Deliberately NOT `arraySchema.parse(wholeArray)` — a single bad row (one
 * malformed report out of hundreds) would otherwise fail the whole parse and
 * this function would have to choose between throwing (crashing the page)
 * or returning [] for everything (silently wiping every project's data,
 * which is worse than not validating at all). Instead: keep every item that
 * passes, drop and warn about the ones that don't. Engines still only ever
 * see clean, typed rows.
 */
export function validateArray(itemSchema, data, label = 'unknown') {
  if (!Array.isArray(data)) {
    console.warn(`[Zod] ${label}: expected an array, got ${typeof data}`);
    return [];
  }
  const out = [];
  data.forEach((item, i) => {
    const result = itemSchema.safeParse(item);
    if (result.success) {
      out.push(result.data);
    } else {
      console.warn(`[Zod] ${label}[${i}] validation failed:`, result.error.issues);
    }
  });
  return out;
}

/**
 * Validates a single object against a Zod schema.
 * On failure: logs a warning and returns null (safe fallback).
 * Never throws — callers must always receive valid data or null.
 */
export function validateOne(schema, data, label = 'unknown') {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      console.warn(`[Zod] ${label} validation failed:`, err.issues);
    }
    return null;
  }
}
