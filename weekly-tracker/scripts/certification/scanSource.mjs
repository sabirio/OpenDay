// Cross-platform recursive source scanner — replaces `grep -rl ... || true`,
// which is Unix-only (grep and the `|| true` shell fallback are not
// available under Windows' default cmd.exe shell, which is what
// child_process.execSync uses there). Pure Node.js fs/path, no shell, no
// platform-specific command.
//
// Used by certifyRls.mjs's service-role secret exposure scan, and directly
// unit-testable in isolation (scanSource.test.mjs).

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

export const DEFAULT_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
export const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'dist-ssr',
  'migrations',            // SQL migration folder may legitimately discuss service_role in comments
  'tests', '__tests__',    // test files may legitimately reference the string in fixtures/assertions
  'certification',         // this certification harness itself references "service_role" in comments/docs — not app source
]);

/**
 * Recursively scans `rootDir` for files matching `extensions` (skipping
 * `excludeDirs` entirely — not just filtering results after the fact) and
 * returns the root-relative (forward-slash) paths of every file whose
 * content matches `pattern`.
 *
 * @param {string} rootDir
 * @param {RegExp} pattern
 * @param {{ extensions?: string[], excludeDirs?: Set<string> }} [options]
 * @returns {string[]} root-relative paths, forward-slash separated
 */
export function findFilesContaining(rootDir, pattern, options = {}) {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const excludeDirs = options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
  const matches = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory (permissions, race with deletion) — skip, don't crash the scan
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        if (!extensions.includes(path.extname(entry.name))) continue;
        const full = path.join(dir, entry.name);
        let text;
        try {
          text = readFileSync(full, 'utf8');
        } catch {
          continue; // unreadable file — skip, don't crash the scan
        }
        const re = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
        re.lastIndex = 0;
        if (re.test(text)) {
          matches.push(path.relative(rootDir, full).replace(/\\/g, '/'));
        }
      }
    }
  }

  walk(rootDir);
  return matches;
}
