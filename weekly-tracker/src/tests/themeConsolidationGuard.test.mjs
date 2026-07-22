// themeConsolidationGuard.test.mjs
// Guards against the 2026-07-15 theme regression (commit 15140d3, "polish(ui):
// refine Weekly Reports operational review console") recurring: that commit
// silently replaced canonical design-system.css tokens with hardcoded hex/
// rgba literals across the Sidebar and Weekly Reports CSS, breaking Light
// mode (black sidebar) and turning Weekly Reports into an independent dark
// palette. Fixed in the 2026-07-22 theme consolidation pass.
//
// This does not ban color literals outright — data-viz/chart palettes,
// the intentionally theme-independent --field-*/--print-* palettes, and a
// handful of documented decorative exceptions are fine. It bans NEW,
// unaccounted literals in the files that must stay on the canonical token
// system, the same allowlist discipline architectureGuard.test.mjs uses for
// legacy imports.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const srcRoot    = path.resolve(__dirname, '..'); // weekly-tracker/src/

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;

// Files that legitimately define raw color values outright: the canonical
// token source itself, and the two documented theme-INDEPENDENT palettes
// (field capture UI, print output) — see their own header comments.
const EXEMPT_FILES = new Set([
  'design-system.css',
  'styles/print.css',
  'styles/snagFieldMode.css',
]);

function walkCss(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkCss(full, acc);
    else if (ent.name.endsWith('.css')) acc.push(full);
  }
  return acc;
}

// Explicit, audited allowlist — every hardcoded literal intentionally left
// in a canonical-token file, and why:
//   .modal-overlay / .mobile-nav-backdrop: fixed backdrop-dim convention,
//     matches .ds-overlay in design-system.css (not page background, so a
//     literal is fine in both themes).
//   .login-spinner: ring track drawn on top of the fixed-hue accent button,
//     not the page background.
//   .field-form-sticky-submit: fixed field-mode chrome, same family as
//     --field-* tokens.
const ALLOWED_LITERALS = {
  'index.css': new Set([
    'rgba(0, 0, 0, 0.65)',
    'rgba(0, 0, 0, 0.2)',
    'rgba(0, 0, 0, 0.45)',
    'rgba(0, 0, 0, 0.08)',
  ]),
};

const cssFiles = walkCss(srcRoot)
  .map(f => ({ abs: f, rel: path.relative(srcRoot, f).replace(/\\/g, '/') }))
  .filter(({ rel }) => !EXEMPT_FILES.has(rel));

check('at least the expected canonical-token CSS files were scanned', cssFiles.some(f => f.rel === 'index.css'));

for (const { abs, rel } of cssFiles) {
  const text = readFileSync(abs, 'utf8');
  const found = [...text.matchAll(COLOR_RE)].map(m => m[0]);
  const allowed = ALLOWED_LITERALS[rel] ?? new Set();
  const unexpected = found.filter(lit => !allowed.has(lit));
  check(`${rel} has no unaccounted hardcoded color literals`, unexpected.length === 0);
  if (unexpected.length) console.error(`    unexpected in ${rel}: ${unexpected.join(', ')}`);
}

// The sidebar-differentiation token must exist in both theme blocks and
// actually be consumed — guards against re-hardcoding .sidebar's background.
const designSystem = readFileSync(path.join(srcRoot, 'design-system.css'), 'utf8');
const lightSplit = designSystem.indexOf('[data-theme="light"]');
const rootBlock  = designSystem.slice(designSystem.indexOf(':root'), lightSplit);
const lightBlock = designSystem.slice(lightSplit);

check('--bg-sidebar is defined in the dark (:root) token block', /--bg-sidebar:\s*oklch/.test(rootBlock));
check('--bg-sidebar is defined in the [data-theme="light"] token block', /--bg-sidebar:\s*oklch/.test(lightBlock));

const indexCss = readFileSync(path.join(srcRoot, 'index.css'), 'utf8');
check(
  '.sidebar background consumes var(--bg-sidebar), not a literal',
  /\.sidebar\s*\{[^}]*background:\s*var\(--bg-sidebar\)/.test(indexCss)
);
check(
  'Weekly Reports panels consume canonical surface tokens (var(--bg-surface-alpha) / var(--bg-elevated)), not literals',
  /\.weekly-command-panel,\s*\n\.weekly-truth-console,\s*\n\.weekly-project-context\s*\{[^}]*background:\s*var\(--bg-surface-alpha\)/.test(indexCss)
);

// No page-local redefinition of canonical theme variable names outside the
// one designated token source file — the exact failure mode this task
// exists to prevent (a feature page quietly growing its own :root override).
const CANONICAL_VAR_NAMES = ['--bg-base', '--bg-surface', '--bg-elevated', '--bg-input', '--text-primary', '--text-secondary', '--accent', '--border'];
for (const { abs, rel } of cssFiles) {
  const text = readFileSync(abs, 'utf8');
  const redefines = CANONICAL_VAR_NAMES.filter(name => new RegExp(`(?::root|\\[data-theme=)[^{]*\\{[^}]*${name}\\s*:`, 's').test(text));
  check(`${rel} does not redefine canonical theme tokens in its own :root/[data-theme] block`, redefines.length === 0);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
