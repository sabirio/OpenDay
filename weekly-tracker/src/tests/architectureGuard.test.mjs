// architectureGuard.test.mjs - P1.1 legacy-import regression guard.
// Run: node src/tests/architectureGuard.test.mjs
//
// Purpose: config/workPackages.js and config/reportWeights.js are @legacy
// (pre-Gantt) modules. Canonical modules must derive WP/scope data from
// masterTaskLibrary.js / projectTemplates.js / templatesApi.js /
// domainPack.js instead. This test does NOT try to guess intent file by
// file — it walks all of src/, collects every file that imports the two
// legacy modules, and diffs that set against an explicit, audited
// allowlist below. Any new import (or a fixed file regressing) fails the
// build until the allowlist is deliberately updated, so accidental legacy
// coupling can't creep back in silently.

import { readFileSync, readdirSync, statSync } from 'node:fs';
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

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (/\.(js|jsx|mjs)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

const LEGACY_IMPORT_RE = /from\s+['"][^'"]*config\/(workPackages|reportWeights)(\.js)?['"]/;

const allFiles = walk(srcRoot);
const importers = new Map(); // relPath -> Set(module names imported: 'workPackages' | 'reportWeights')

for (const file of allFiles) {
  const rel = path.relative(srcRoot, file).replace(/\\/g, '/');
  if (rel === 'config/workPackages.js' || rel === 'config/reportWeights.js') continue;
  const text = readFileSync(file, 'utf8');
  const matches = text.matchAll(/from\s+['"][^'"]*config\/(workPackages|reportWeights)(\.js)?['"]/g);
  for (const m of matches) {
    if (!importers.has(rel)) importers.set(rel, new Set());
    importers.get(rel).add(m[1]);
  }
}

// Audited P1.1 legacy-fallback surface: every file allowed to still import
// config/workPackages.js and/or config/reportWeights.js, and why. All of
// these are guarded behind ganttTasks.length === 0 / isWPReport() /
// !visit.wps / @legacy-marked code paths — see workPackages.js /
// reportWeights.js header comments for the full audit.
const ALLOWED_LEGACY_IMPORTERS = new Set([
  'pages/WeeklyReports.jsx',           // legacy-report display branch (isWPReport() gate)
  'pages/SiteVisitReport.jsx',         // no-Gantt submit fallback (makeEmptyPMWPStatuses)
  'components/contractor/formHelpers.js',
  'components/contractor/LegacyWPSection.jsx',
  'components/contractor/ReportingWorkPackagesSection.jsx',
  'components/contractor/WorkPackageProgressSection.jsx',
  'components/sitevisit/ComparisonResultsView.jsx',
  'components/sitevisit/SiteVisitFormView.jsx',
  'config/dashboardConstants.js',
  'engines/legacyReportEngine.js',
  'engines/pmAlignmentEngine.js',
  'engines/projectSummaryEngine.js',
  'engines/siteVisitEngine.js',
  'utils/reportUtils.js',
]);

console.log('\narchitectureGuard - legacy config/workPackages + config/reportWeights import surface');

// Canonical files that must have ZERO legacy import (the P1.1 live-bug fix).
const MUST_BE_CLEAN = [
  'components/weekly/PhaseStepper.jsx',
  'components/weekly/PhaseTimeline.jsx',
  'components/weekly/shared.jsx',
  'components/weekly/sharedUtils.js',
  'engines/progressDeltaEngine.js',
  'config/masterTaskLibrary.js',
  'config/projectTemplates.js',
  'config/statusScores.js',
  'engines/ganttEngine.js',
  'domains/construction/domainPack.js',
  'domains/construction/templates/constructionRetailV1.js',
  'data/templatesApi.js',
];

for (const rel of MUST_BE_CLEAN) {
  check(`${rel} does not import config/workPackages or config/reportWeights`, !importers.has(rel));
}

// WeeklyReports.jsx is allowed WORK_PACKAGES (legacy-report fallback) but
// must not still pull WP_STATUS_SCORES from the legacy module.
const weeklyReportsText = readFileSync(path.join(srcRoot, 'pages/WeeklyReports.jsx'), 'utf8');
const weeklyLegacyImportLine = weeklyReportsText.split('\n').find(l => LEGACY_IMPORT_RE.test(l));
check(
  'WeeklyReports.jsx legacy import no longer includes WP_STATUS_SCORES',
  !!weeklyLegacyImportLine && !weeklyLegacyImportLine.includes('WP_STATUS_SCORES')
);
// UI-domain-logic pass: the page's own current-vs-cumulative status score
// comparison moved into reportUtils.pickReconciledStatusEntry(), so
// WeeklyReports.jsx no longer needs WP_STATUS_SCORES at all (from either
// module) — a stronger version of "no legacy import" than importing the
// canonical map directly.
check(
  'WeeklyReports.jsx no longer imports WP_STATUS_SCORES from any module (reconciliation moved to reportUtils.pickReconciledStatusEntry)',
  !/import\s*\{[^}]*\bWP_STATUS_SCORES\b[^}]*\}\s*from/.test(weeklyReportsText)
);

// Every remaining importer of the legacy modules must be on the audited
// allowlist — this is the actual regression guard: any new file (or an
// already-fixed file regressing) that starts importing legacy config fails
// here until someone deliberately reviews and adds it above.
const unexpected = [...importers.keys()].filter(rel => !ALLOWED_LEGACY_IMPORTERS.has(rel));
check(
  `no unexpected importers of legacy config (found: ${unexpected.join(', ') || 'none'})`,
  unexpected.length === 0
);

// Sanity: the allowlist itself shouldn't silently rot — every entry should
// still actually import one of the legacy modules (otherwise the file was
// migrated and the allowlist should shrink).
const staleAllowlistEntries = [...ALLOWED_LEGACY_IMPORTERS].filter(rel => !importers.has(rel));
check(
  `allowlist has no stale entries that no longer import legacy config (stale: ${staleAllowlistEntries.join(', ') || 'none'})`,
  staleAllowlistEntries.length === 0
);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
