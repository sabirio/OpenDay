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
const sourceFiles = allFiles
  .map(file => ({
    abs: file,
    rel: path.relative(srcRoot, file).replace(/\\/g, '/'),
    text: readFileSync(file, 'utf8'),
  }))
  .filter(({ rel }) =>
    !rel.endsWith('.test.mjs') &&
    !rel.includes('/__tests__/') &&
    !rel.startsWith('tests/')
  );
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
  'core/contractorReport/adaptContractorReportToLegacy.js', // decodeLegacyWpTaskId (P0 fix, ganttTasks.length===0 rows only)
  'core/contractorReport/buildContractorReportSubmission.js', // encodeLegacyWpTaskId (P0 fix, ganttTasks.length===0 branch only)
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

// Canonical Core boundary: production consumers outside core/canonical must
// use its public index, never reach into normalization/engine internals.
const canonicalBoundaryViolations = sourceFiles
  .filter(({ rel }) => !rel.startsWith('core/canonical/'))
  .flatMap(({ rel, text }) => [...text.matchAll(/from\s+['"]([^'"]*core\/canonical[^'"]*)['"]/g)]
    .filter(([, spec]) => !spec.endsWith('/canonical') && !spec.endsWith('/canonical/index.js'))
    .map(([, spec]) => `${rel} -> ${spec}`));
check(
  `canonical core is consumed through its public index (violations: ${canonicalBoundaryViolations.join(', ') || 'none'})`,
  canonicalBoundaryViolations.length === 0
);

const deprecatedProjectStateImporters = sourceFiles
  .filter(({ rel, text }) => rel !== 'core/canonical/runOpenDayOrchestrator.js' && /from\s+['"][^'"]*opendayEngine\/evaluateProjectState/.test(text))
  .map(({ rel }) => rel);
check(
  `evaluateProjectState is compatibility-only (new production importers: ${deprecatedProjectStateImporters.join(', ') || 'none'})`,
  deprecatedProjectStateImporters.length === 0
);

const riskEngineText = readFileSync(path.join(srcRoot, 'engines/riskEngine.js'), 'utf8');
check('riskEngine does not import raw progress calculators', !/from\s+['"][^'"]*progressEngine/.test(riskEngineText));

const portfolioEngineText = readFileSync(path.join(srcRoot, 'engines/portfolioEngine.js'), 'utf8');
check('portfolioEngine does not import raw project progress calculators', !/from\s+['"][^'"]*progressEngine/.test(portfolioEngineText));

for (const rel of ['pages/ContractorReport.jsx', 'pages/SiteVisitReport.jsx']) {
  const text = readFileSync(path.join(srcRoot, rel), 'utf8');
  check(`${rel} does not call Supabase or low-level Tier-1 write primitives`,
    !/\bsupabase\b|insertSiteVisitHeader|insertSiteVisitWPObservations|insertSiteVisitDiscrepancies|submitReport\(/.test(text));
}

const browserSource = sourceFiles.filter(({ rel }) => !rel.startsWith('migrations/') && !rel.startsWith('scripts/'));
const serviceRoleLeaks = browserSource.filter(({ text }) => /SUPABASE_SERVICE_ROLE_KEY|service_role/.test(text)).map(({ rel }) => rel);
check(`browser runtime contains no service-role credential references (found: ${serviceRoleLeaks.join(', ') || 'none'})`, serviceRoleLeaks.length === 0);

const evidenceUi = sourceFiles.filter(({ rel }) => /^(pages|components|hooks)\//.test(rel) && /evidence/i.test(rel + ' ' + readFileSync(path.join(srcRoot, rel), 'utf8')));
const evidenceDirectWrites = evidenceUi.filter(({ text }) => /from\(['"]snag_evidence['"]\)\.(insert|update|delete)|storage_path\s*:/.test(text)).map(({ rel }) => rel);
check(`evidence UI contains no direct table writes or arbitrary registered paths (found: ${evidenceDirectWrites.join(', ') || 'none'})`, evidenceDirectWrites.length === 0);
const permanentEvidenceUrls = evidenceUi.filter(({ text }) => /getPublicUrl|createSignedUrl|signedUrl|access_token/.test(text)).map(({ rel }) => rel);
check(`evidence UI stores no public/signed URLs or access tokens (found: ${permanentEvidenceUrls.join(', ') || 'none'})`, permanentEvidenceUrls.length === 0);
const evidencePageText = readFileSync(path.join(srcRoot, 'pages/snags/SnagDetailPage.jsx'), 'utf8');
check('Snag detail delegates evidence and closeout behavior outside React', /<EvidenceSection/.test(evidencePageText) && !/get_snag_closeout|authorize_snag_evidence|register_snag_evidence/.test(evidencePageText));
const evidenceServiceText = readFileSync(path.join(srcRoot, 'services/evidence/evidenceService.js'), 'utf8');
check('registered evidence identity cannot be silently replaced', /upsert:false/.test(evidenceServiceText) && !/\.update\(|upsert:true/.test(evidenceServiceText));
check('Phase 4 does not implement PDF or analytics integrations', !sourceFiles.some(({ rel, text }) => /evidence/i.test(rel) && /pdf export|Risk Engine|Opening Readiness|Contractor Performance|OpenDay FM/i.test(text)));

// Snag bounded-context guard. This scans the complete production domain tree,
// rather than protecting a hand-picked filename, so newly added domain files
// inherit the same isolation rules automatically.
const snagDomainFiles = sourceFiles.filter(({ rel }) => rel.startsWith('core/snags/'));
const forbiddenSnagDomainImports = snagDomainFiles.flatMap(({ rel, text }) =>
  [...text.matchAll(/^\s*import(?:[\s\S]*?)from\s+['"]([^'"]+)['"]/gm)].filter(([, spec]) =>
    /(^|\/)(react|react-router|lib\/supabase|services|components|pages|hooks|engines|contractor|siteVisit|site-visit|pdf)/i.test(spec)
  ).map(([, spec]) => `${rel} -> ${spec}`));
check(`Snag domain has no UI, Supabase, browser, adjacent-module or engine imports (found: ${forbiddenSnagDomainImports.join(', ') || 'none'})`, forbiddenSnagDomainImports.length === 0);

const snagBrowserApiUses = snagDomainFiles.filter(({ text }) =>
  /\b(window|document|localStorage|sessionStorage|navigator|URL\.createObjectURL|fetch)\b/.test(text)
).map(({ rel }) => rel);
check(`Snag domain uses no browser APIs (found: ${snagBrowserApiUses.join(', ') || 'none'})`, snagBrowserApiUses.length === 0);

const snagUiFiles = sourceFiles.filter(({ rel }) => /^(pages\/snags|components\/snags|hooks\/useSnag)/.test(rel));
const snagUiDirectPersistence = snagUiFiles.filter(({ text }) =>
  /\.from\(['"](?:snags|snag_events|snag_evidence|snag_plan_versions)['"]\)|\.rpc\(['"](?:execute_snag_command|create_snag_|register_snag_)/.test(text)
).map(({ rel }) => rel);
check(`Snag UI performs no direct database writes/RPCs (found: ${snagUiDirectPersistence.join(', ') || 'none'})`, snagUiDirectPersistence.length === 0);

const snagLifecycleDefinitions = snagDomainFiles.filter(({ text }) => /export const SNAG_STATUSES\s*=/.test(text)).map(({ rel }) => rel);
check(`Snag lifecycle has one canonical definition (found: ${snagLifecycleDefinitions.join(', ')})`, snagLifecycleDefinitions.length === 1 && snagLifecycleDefinitions[0] === 'core/snags/config.js');

const standaloneEntryText = readFileSync(path.join(srcRoot, 'core/snags/index.js'), 'utf8');
check('Snag standalone public entry does not depend on adjacent business modules', !/(weekly|contractor|siteVisit|site-visit|progress|risk|readiness)/i.test(standaloneEntryText));

const siteVisitSubmitText = readFileSync(path.join(srcRoot, 'core/siteVisit/submitSiteVisitModel.js'), 'utf8');
check('site visit application command uses one atomic service and no legacy multi-write imports',
  /submitSiteVisitAtomic/.test(siteVisitSubmitText) && !/insertSiteVisitHeader|insertSiteVisitWPObservations|insertSiteVisitDiscrepancies|updateGanttDiscrepancy/.test(siteVisitSubmitText));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);

// -----------------------------------------------------------------------------
// HARD architecture guard: layer boundaries, calculation placement, and
// service purity. Zero tolerance — ANY violation fails the build. There is
// no baseline/allowlist; the calculation-debt ratchet (103 -> 0, closed
// 2026-07-10) is done, so nothing is grandfathered in anymore.
//
// Canon this enforces:
//   engines/  = all formulas, pure, no side-effects.
//   core/     = orchestration + read-models; composes engines, never computes.
//   services/ = persistence/I/O only; never imports engines/core, never computes.
//   UI (pages/components/hooks) = display only; reaches engines/core ONLY via
//     core/presentation/*Model.js facades + hooks/use*Presentation.js hooks.
// Direction: UI -> hooks -> core -> engines; core -> services.
// -----------------------------------------------------------------------------

const IMPORT_RE = /^\s*import(?:[\s\S]*?)from\s+['"]([^'"]+)['"]/gm;
const STATUS_LITERALS = ['At Risk', 'Critical', 'Overdue', 'NOT_ACHIEVABLE', 'Delayed', 'CRITICAL', 'HIGH'];
const STATUS_BRANCH_RE = /(===|!==|==|!=|\.includes\(|\bcase\b|\bswitch\b)/;
const SERVICE_DOMAIN_TOKENS = /\b(spi|discrepancy|progress|weight|risk|score|plannedAvg|delta|planned|actual)\b/i;
const CALC_RE = /(\.reduce\(|\.filter\([^)]*\)\.length|Math\.(round|min|max|abs|floor|ceil)\(|\*\s*100|\/\s*100|\/\s*86400000)/;

function layerOf(rel) {
  if (rel.startsWith('pages/')) return 'page';
  if (rel.startsWith('components/')) return 'component';
  if (rel.startsWith('hooks/')) return 'hook';
  if (rel.startsWith('services/')) return 'service';
  if (rel.startsWith('core/')) return 'core';
  return 'other';
}

function importTargetLayer(spec) {
  const normalized = spec.replace(/\\/g, '/');
  if (normalized.includes('/engines/') || normalized.startsWith('../engines') || normalized.startsWith('../../engines')) return 'engines';
  if (normalized.includes('/core/') || normalized.startsWith('../core') || normalized.startsWith('../../core')) return 'core';
  if (normalized.includes('/services/') || normalized.startsWith('../services') || normalized.startsWith('../../services')) return 'services';
  if (normalized.includes('/lib/supabase') || normalized.startsWith('../lib/supabase') || normalized.startsWith('../../lib/supabase')) return 'lib/supabase';
  return null;
}

function severityFor(rule, layer, target = '') {
  if (rule === 'layer-import') return 'A';
  if (rule === 'service-purity') return 'A';
  if (rule === 'calculation' && layer === 'core') return 'B';
  if (rule === 'status-literal') return 'B';
  return target ? 'A' : 'B';
}

function addViolation(list, { rel, line = 1, rule, layer, detail, target = '' }) {
  list.push({
    id: `${rel}:${line}:${rule}:${detail}`,
    file: rel,
    line,
    rule,
    severity: severityFor(rule, layer, target),
    layer,
    target,
    detail,
  });
}

function scanArchitectureDebt() {
  const violations = [];

  for (const { rel, text } of sourceFiles) {
    const layer = layerOf(rel);
    if (layer === 'other') continue;

    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1];
      const target = importTargetLayer(spec);
      if (!target) continue;

      const prefix = text.slice(0, match.index);
      const line = prefix.split('\n').length;
      const forbidden =
        ((layer === 'page' || layer === 'component') && ['engines', 'core', 'services', 'lib/supabase'].includes(target)) ||
        (layer === 'hook' && ['engines', 'services', 'lib/supabase'].includes(target)) ||
        (layer === 'service' && ['engines', 'core'].includes(target));

      if (forbidden) {
        addViolation(violations, {
          rel, line, rule: 'layer-import', layer, target,
          detail: `${layer} imports ${target}: ${spec}`,
        });
      }
    }

    const lines = text.split('\n');
    lines.forEach((lineText, index) => {
      const lineNo = index + 1;
      const trimmed = lineText.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (/filter\(Boolean\)|filter\(\s*\w+\s*=>\s*\w+\s*\)/.test(trimmed)) return;

      if (layer === 'service' && CALC_RE.test(trimmed) && SERVICE_DOMAIN_TOKENS.test(trimmed)) {
        addViolation(violations, {
          rel, line: lineNo, rule: 'service-purity', layer,
          detail: trimmed,
        });
      } else if (['page', 'component', 'hook', 'core'].includes(layer) && CALC_RE.test(trimmed)) {
        addViolation(violations, {
          rel, line: lineNo, rule: 'calculation', layer,
          detail: trimmed,
        });
      }

      if (STATUS_BRANCH_RE.test(trimmed) && STATUS_LITERALS.some(lit => trimmed.includes(`'${lit}'`) || trimmed.includes(`"${lit}"`))) {
        addViolation(violations, {
          rel, line: lineNo, rule: 'status-literal', layer,
          detail: trimmed,
        });
      }
    });
  }

  return violations.sort((a, b) => a.id.localeCompare(b.id));
}

// Actionable guidance per rule — printed for every violation so a failing
// build tells you exactly what to do, not just that something is wrong.
const RULE_GUIDANCE = {
  'layer-import':   'UI (pages/components) and hooks must never import engines/core/services/lib/supabase directly. Add or reuse a core/presentation/*Model.js facade + a hooks/use*Presentation.js hook, then import from the hook instead.',
  'service-purity': 'services/ must be I/O-only — no formulas, no engines/core imports. Move this calculation into the matching engines/*.js file and have core/ call the engine; the service should only pass data through.',
  'calculation':    'All formulas live in engines/. Move this line into the appropriate engines/*.js file (reuse an existing export if one already computes this), then expose it via a core/presentation/*Model.js facade + hooks/use*Presentation.js hook for UI/core to consume.',
  'status-literal': 'Hardcoded status/severity string compared inline. Use a named constant/level map (e.g. RISK_LEVELS, CONFIDENCE_LEVELS) exported from the owning engine or config/*Config.js instead of a raw literal.',
};

function formatViolation(v) {
  const guidance = RULE_GUIDANCE[v.rule] ?? 'See DESIGN.md for the canonical layer architecture.';
  return `\n  [${v.rule}] ${v.file}:${v.line}\n    ${v.detail}\n    -> ${guidance}`;
}

const archViolations = scanArchitectureDebt();

if (process.argv.includes('--write-allowlist')) {
  console.error('architectureGuard is HARD: there is no allowlist to (re)write anymore. Fix the violation(s) instead — see DESIGN.md.');
  process.exit(1);
}

const debtBySeverity = archViolations.reduce((acc, v) => {
  acc[v.severity] = (acc[v.severity] ?? 0) + 1;
  return acc;
}, {});
const debtByRule = archViolations.reduce((acc, v) => {
  acc[v.rule] = (acc[v.rule] ?? 0) + 1;
  return acc;
}, {});

if (archViolations.length > 0) {
  console.error(
    `\nArchitecture guard (HARD): ${archViolations.length} violation(s) found ` +
    `(A:${debtBySeverity.A ?? 0}, B:${debtBySeverity.B ?? 0}, C:${debtBySeverity.C ?? 0}; ` +
    Object.entries(debtByRule).map(([rule, n]) => `${rule}:${n}`).join(', ') + ')'
  );
  archViolations.forEach(v => console.error(formatViolation(v)));
}

check(
  `architecture guard is HARD: zero layer-import/calculation/service-purity/status-literal violations allowed (found: ${archViolations.length})`,
  archViolations.length === 0
);

console.log(`\n-- FINAL RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
