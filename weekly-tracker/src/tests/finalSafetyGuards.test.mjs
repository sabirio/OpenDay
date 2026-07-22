import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { userSafeError } from '../utils/userError.js';

let pass = 0, fail = 0;
const check = (label, ok) => ok ? (pass++, console.log(`  OK ${label}`)) : (fail++, console.error(`  FAIL ${label}`));
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.resolve(srcRoot, '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    entry.isDirectory() ? walk(full, out) : out.push(full);
  }
  return out;
}

const suppressions = walk(srcRoot)
  .filter(file => /\.(js|jsx|mjs)$/.test(file) && !file.endsWith('finalSafetyGuards.test.mjs'))
  .flatMap(file => readFileSync(file, 'utf8').split(/\r?\n/)
    .map((line, index) => ({ rel: path.relative(srcRoot, file).replace(/\\/g, '/'), line: index + 1, text: line.trim() }))
    .filter(row => /eslint-disable(?:-next-line|-line)?|@ts-(?:ignore|expect-error)/.test(row.text)));

// UX audit (2026-07-21): 21st entry is components/shared/Toast.jsx's
// `useToast` export, using the exact same react-refresh/only-export-components
// suppression already reviewed/accepted for auth/AuthContext.jsx's `useAuth`
// (a context+hook pair in one file is the standard React pattern this rule
// otherwise flags).
//
// Site Visit phase-collapse UX (2026-07-22): 22nd entry is
// components/sitevisit/SiteVisitPhaseSection.jsx's auto-collapse effect,
// using the exact same react-hooks/exhaustive-deps suppression already
// reviewed/accepted for components/contractor/GanttWPSection.jsx's
// PhaseSection (identical pattern: intentionally react only to `allComplete`
// changing, not to `open`/`toggle`, so manually re-opening a completed phase
// doesn't immediately re-trigger the auto-close).
check('suppression inventory is exactly the reviewed 22 entries', suppressions.length === 22);
check('every suppression is a single-line exception', suppressions.every(row => /eslint-disable-(?:next-line|line)|@ts-(?:ignore|expect-error)/.test(row.text)));
check('no blanket eslint-disable exists', suppressions.every(row => !/^\/\/\s*eslint-disable\s*$/.test(row.text)));

const findOrphans = readFileSync(path.join(appRoot, 'scripts/storage/findOrphanCandidates.mjs'), 'utf8');
const deleteOrphans = readFileSync(path.join(appRoot, 'scripts/storage/deleteOrphans.mjs'), 'utf8');
check('orphan scan requires explicit non-VITE environment variables', /ORPHAN_SUPABASE_URL/.test(findOrphans) && !/process\.env\.VITE_/.test(findOrphans));
check('orphan scan contains no Storage delete call', !/\.remove\s*\(/.test(findOrphans));
check('cleanup is dry-run unless --execute is explicit', /arg === '--execute'/.test(deleteOrphans) && /execute: false/.test(deleteOrphans));
check('cleanup requires project, reviewed path file and reason', ['--project=<id>', '--paths-file=<path>', '--reason="<text>"'].every(flag => deleteOrphans.includes(flag)));
check('cleanup revalidates DB references before removal', /referencedNow\.has\(p\)/.test(deleteOrphans));

for (const context of ['auth', 'password', 'load', 'save', 'upload']) {
  const message = userSafeError(context);
  check(`${context} user error contains no backend implementation detail`, !/PGRST|SQLSTATE|public\.|profiles|supabase|stack|\.rpc/i.test(message));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
