// Pure, dependency-free line-ending normalization for SQL certification
// comparisons and masking. No filesystem, network, database, or
// environment access - safe to import from both the DB-independent static
// contract test (atomicWriteSecurityReconciliation.test.mjs, which must run
// standalone under `npm test` with no local Supabase stack required) and the
// DB-backed runtime certification script
// (certifyAtomicWriteSecurityReconciliation.mjs).
//
// Why this exists - two independent, confirmed line-ending artifacts:
//   1. A Windows checkout with core.autocrlf=true (this repository's
//      default; no .gitattributes overrides it) converts every committed
//      LF line ending to a single CRLF on disk.
//   2. This environment's Windows psql.exe client (`psql -f <file>`) has
//      been reproduced in isolation to DOUBLE an already-CRLF file's line
//      endings when applying it: a minimal CRLF-only fixture function,
//      applied via `psql -f`, comes back from `pg_proc.prosrc` with every
//      "\r\n" turned into "\r\r\n".
// A naive single-pass `.replace(/\r\n/g, '\n')` cannot undo case 2: it
// consumes only the trailing \r\n of a doubled "\r\r\n" pair, leaving one
// stray \r behind, so two values that are semantically identical compare
// unequal. normalizeLineEndings() instead collapses any RUN of one-or-more
// \r (optionally followed by \n) into exactly one \n, so it is idempotent
// and produces the same result for LF, single CRLF, doubled/corrupted
// CRLF, and lone-CR input alike.

/**
 * Collapses every line-ending variant - LF, CRLF, doubled/corrupted CRLF
 * (\r\r\n or longer runs), or a lone CR - into exactly one LF. Never
 * touches spaces, tabs, comments, casing, or token content; only
 * collapses \r-based line-ending noise.
 */
export function normalizeLineEndings(text) {
  return text.replace(/\r+\n?/g, '\n');
}

/**
 * Extracts a `CREATE OR REPLACE FUNCTION public.<name>(...) ... $$;` block
 * (signature line through the closing `$$;`) from SQL text. Normalizes
 * line endings first so the extraction regex and its result behave
 * identically regardless of the source's on-disk line endings. Returns the
 * normalized, trimmed block, or null if the function is not found.
 */
export function extractFunctionDefinition(sql, functionName) {
  const normalized = normalizeLineEndings(sql);
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`);
  const match = normalized.match(pattern);
  return match ? match[0].trim() : null;
}

/**
 * Extracts just the function BODY - the text between `AS $$` and the
 * closing `\n$$;` - for a given function name. Normalizes line endings
 * first, same rationale as extractFunctionDefinition. Used to compare a
 * migration file's intended body against a live database's
 * pg_proc.prosrc value.
 */
export function extractFunctionBody(sql, functionName) {
  const normalized = normalizeLineEndings(sql);
  const start = normalized.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}(`);
  if (start === -1) return null;
  const match = normalized.slice(start).match(/AS \$\$([\s\S]*?)\n\$\$;/);
  return match ? match[1].trim() : null;
}

/**
 * Fail-closed masking: normalizes `source`, verifies `needle` (itself
 * normalized) occurs in it EXACTLY once, then replaces that exact
 * occurrence with `placeholder`. Throws - never silently no-ops - if
 * `needle` is empty/absent, not found in the normalized source, or found
 * more than once. A security-mutation guard must never pass because a
 * mask silently failed to apply.
 */
export function maskExactlyOnce(source, needle, placeholder) {
  const normalizedSource = normalizeLineEndings(source);
  if (!needle) {
    throw new Error('maskExactlyOnce: needle is empty/absent - refusing to mask nothing');
  }
  const normalizedNeedle = normalizeLineEndings(needle).trim();
  const occurrences = normalizedSource.split(normalizedNeedle).length - 1;
  if (occurrences === 0) {
    throw new Error('maskExactlyOnce: needle not found in normalized source');
  }
  if (occurrences > 1) {
    throw new Error(`maskExactlyOnce: needle found ${occurrences} times in normalized source, expected exactly once`);
  }
  return normalizedSource.replace(normalizedNeedle, placeholder);
}

/**
 * Strips SQL line-comments (lines whose trimmed content starts with `--`)
 * after normalizing line endings, so downstream top-level-mutation regex
 * checks never trip on a keyword that only appears inside a comment.
 */
export function stripLineComments(sql) {
  return normalizeLineEndings(sql)
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}
