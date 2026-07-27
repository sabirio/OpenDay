// costIntelligenceArchitectureGuard.test.mjs — proves Cost Intelligence
// Engine v1 (costIntelligenceEngine.js) stays a pure calculation layer that
// consumes Historical Data Foundation output rather than duplicating its
// formulas, shares (not duplicates) statistics/cost-evidence-policy with
// Benchmark Engine, and never reaches for Supabase, React, UI, persistence,
// Forecast Engine, Contractor Scoring, AI, or Benchmark UI. Mirrors
// benchmarkArchitectureGuard.test.mjs's source-text-contract convention.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { buildCostIntelligence } from './costIntelligenceEngine.js';
import { buildHistoricalProjectFacts } from './historyEngine.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const text = readFileSync(path.join(dir, 'costIntelligenceEngine.js'), 'utf8');

console.log('\ncostIntelligenceArchitectureGuard - pure calculation layer only');

// Import-only / call-syntax checks (not bans on the English words
// themselves — this module's own doc comments legitimately explain what it
// deliberately does NOT do, e.g. "never queries Supabase" or "no Forecast
// Engine dependency" — a bare word-match on such comments false-positived
// while writing historyArchitectureGuard.test.mjs; every pattern here is
// anchored to actual import/call syntax to avoid repeating that mistake.
const FORBIDDEN_PATTERNS = [
  { label: 'React', re: /from\s+['"]react(-dom)?['"]|import\s+React\b/ },
  { label: 'Supabase client', re: /from\s+['"][^'"]*supabase[^'"]*['"]|createClient\(/i },
  { label: 'the services/ layer', re: /from\s+['"][^'"]*\/services\// },
  { label: 'a direct project DB write (.insert(/.update(/.delete()', re: /\.insert\(|\.update\(|\.delete\(/ },
  { label: 'a from(\'projects\') query', re: /from\(['"]projects['"]\)/ },
  { label: 'Portfolio/UI (pages/ or components/)', re: /from\s+['"][^'"]*\/(pages|components)\// },
  { label: 'the Import workflow (core/import/, core/importWorkflow/, hooks/import/)', re: /from\s+['"][^'"]*\/(core\/import|core\/importWorkflow|hooks\/import)\// },
  { label: 'browser storage (localStorage/sessionStorage/indexedDB) — no persisted result', re: /localStorage|sessionStorage|indexedDB/ },
  { label: 'a network fetch', re: /\bfetch\(/ },
  { label: 'the Benchmark Engine (a dataset-wide breakdown must not depend on the target-relative engine)', re: /from\s+['"]\.\/benchmarkEngine\.js['"]/ },
  { label: 'a Forecast Engine / Contractor Scoring / AI engine import', re: /from\s+['"][^'"]*\/(forecastEngine|contractorScoring|contractorScoringEngine|aiEngine)[^'"]*['"]/i },
];
for (const forbidden of FORBIDDEN_PATTERNS) {
  check(`costIntelligenceEngine.js does not import/reference ${forbidden.label}`, !forbidden.re.test(text));
}

console.log('\ncostIntelligenceArchitectureGuard - shares (not duplicates) neutral utilities');

check('costIntelligenceEngine.js imports computeStatistics from the neutral statistics.js (not a second implementation, not via benchmarkEngine.js)',
  /from\s+['"]\.\/statistics\.js['"]/.test(text) && /computeStatistics/.test(text));
check('costIntelligenceEngine.js imports isUsableActualCostEvidence from the shared costEvidencePolicy.js (not a re-inlined actualCost > 0 check)',
  /from\s+['"]\.\/costEvidencePolicy\.js['"]/.test(text) && /isUsableActualCostEvidence/.test(text));

console.log('\ncostIntelligenceArchitectureGuard - consumes Historical Foundation rather than duplicating its formulas');

// [ \t]* rather than \s* — a bare \s* spans newlines, so "...per-area budget"
// at the end of one comment line followed by a "// ..." comment on the next
// line false-positived as "budget\n/" (a real mistake hit while writing this
// guard). Restricting to same-line whitespace keeps the check meaningful
// (an actual same-line division like `actualCost / area`) without matching
// two unrelated adjacent comment lines.
check('costIntelligenceEngine.js never re-derives a cost-per-area or cost-variance formula itself (no cost/area division, no (actual-budget)/budget of its own)',
  !/actualCost[ \t]*\/[ \t]*|budget[ \t]*\/[ \t]*|\/[ \t]*budget\b/.test(text));

console.log('\ncostIntelligenceArchitectureGuard - no DB persistence, no analytics tables');

// Anchored to actual query/DDL syntax — not a bare "cost_intelligence"
// substring match, which would false-positive against this module's own
// SUPPORTED_COST_INTELLIGENCE_METRICS/MIN_COST_INTELLIGENCE_SAMPLE_SIZE
// identifiers (the exact category of mistake made twice while writing
// historyArchitectureGuard.test.mjs).
check('costIntelligenceEngine.js contains no SQL table/migration references',
  !/CREATE TABLE|from\(['"]cost_intelligence['"]\)|analytics_snapshot|materialized view/i.test(text));

console.log('\ncostIntelligenceArchitectureGuard - no ranking, no FX (source-text guard on the code, not the doc comments)');
{
  // Anchored to actual identifiers/behavior a ranking or FX implementation
  // would need (a sort comparator keyed on a statistic, or a currency
  // conversion table/rate lookup) — not a ban on the words "rank"/"FX" in
  // prose, which this file's own doc comment legitimately uses.
  check('no sort/rank comparator keyed on a statistic value (median/mean) — only identity fields are ever sorted',
    !/sort\([^)]*\.(median|mean|statistics)/i.test(text));
  check('no FX/exchange-rate table or conversion call', !/exchangeRate|fxRate|convertCurrency|CURRENCY_RATES/i.test(text));
}

console.log('\ncostIntelligenceArchitectureGuard - behavioral proof: pure function, no target project, immutable, deterministic');
{
  const dataset = [1, 2, 3, 4].map(i => buildHistoricalProjectFacts({
    storeCode: `GUARD-CI-${i}`, country: 'Kazakhstan', projectType: 'Rebuilding', storeConcept: 'Flagship', locationType: 'Mall',
    storeSizeSqm: 1000, actualCost: 400000 + i * 1000, currencyCode: 'KZT',
  }));
  const snapshot = JSON.stringify(dataset);

  const a = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  const b = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  check('calling buildCostIntelligence twice with the same input never accumulates/mutates shared state', JSON.stringify(a) === JSON.stringify(b));
  check('buildCostIntelligence does not mutate the input dataset', JSON.stringify(dataset) === snapshot);
  check('the result has no target/comparison field — this is a dataset-wide breakdown, not a per-project cohort',
    !('target' in a) && !('comparison' in a) && !('cohort' in a));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
