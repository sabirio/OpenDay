// benchmarkArchitectureGuard.test.mjs — proves Benchmark Engine v1
// (benchmarkEngine.js) stays a pure calculation layer that consumes
// Historical Data Foundation output rather than duplicating its formulas,
// and never reaches for Supabase, React, UI, persistence, Forecast Engine,
// Contractor Scoring, or AI. Mirrors historyArchitectureGuard.test.mjs's
// source-text-contract convention.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { buildProjectBenchmark, buildProjectBenchmarks } from './benchmarkEngine.js';
import { buildHistoricalProjectFacts } from './historyEngine.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const text = readFileSync(path.join(dir, 'benchmarkEngine.js'), 'utf8');

console.log('\nbenchmarkArchitectureGuard - pure calculation layer only');

// Import-only / call-syntax checks (not bans on the English words
// themselves — this module's own doc comments legitimately explain what it
// deliberately does NOT do, e.g. "never queries Supabase" or "no Forecast
// Engine dependency" — a bare word-match on such comments false-positived
// twice while writing historyArchitectureGuard.test.mjs; every pattern here
// is anchored to actual import/call syntax to avoid repeating that mistake.
const FORBIDDEN_PATTERNS = [
  { label: 'React', re: /from\s+['"]react(-dom)?['"]|import\s+React\b/ },
  { label: 'Supabase client', re: /from\s+['"][^'"]*supabase[^'"]*['"]|createClient\(/i },
  { label: 'the services/ layer', re: /from\s+['"][^'"]*\/services\// },
  { label: 'a direct project DB write (.insert(/.update(/.delete()', re: /\.insert\(|\.update\(|\.delete\(/ },
  { label: 'a from(\'projects\') query', re: /from\(['"]projects['"]\)/ },
  { label: 'Portfolio/UI (pages/ or components/)', re: /from\s+['"][^'"]*\/(pages|components)\// },
  { label: 'the Import workflow (core/import/, core/importWorkflow/, hooks/import/)', re: /from\s+['"][^'"]*\/(core\/import|core\/importWorkflow|hooks\/import)\// },
  { label: 'browser storage (localStorage/sessionStorage/indexedDB) — no persisted benchmark result', re: /localStorage|sessionStorage|indexedDB/ },
  { label: 'a network fetch', re: /\bfetch\(/ },
  { label: 'a Forecast Engine / Contractor Scoring / AI engine import', re: /from\s+['"][^'"]*\/(forecastEngine|contractorScoring|contractorScoringEngine|aiEngine)[^'"]*['"]/i },
];
for (const forbidden of FORBIDDEN_PATTERNS) {
  check(`benchmarkEngine.js does not import/reference ${forbidden.label}`, !forbidden.re.test(text));
}

console.log('\nbenchmarkArchitectureGuard - consumes Historical Foundation rather than duplicating its formulas');

check('benchmarkEngine.js imports buildHistoricalProjectFacts from historyEngine.js (single source of derived metrics/eligibility)',
  /from\s+['"]\.\/historyEngine\.js['"]/.test(text) && /buildHistoricalProjectFacts/.test(text));
check('benchmarkEngine.js never re-derives a cost/schedule/opening formula itself (no ms/day division, no cost/area division of its own)',
  !/\/\s*86400000|actualCost\s*\/\s*|budget\s*\/\s*/.test(text));

console.log('\nbenchmarkArchitectureGuard - no DB persistence, no benchmark/cohort tables');

check('benchmarkEngine.js contains no SQL table/migration references',
  !/CREATE TABLE|project_benchmarks|benchmark_snapshots|benchmark_percentiles/i.test(text));

console.log('\nbenchmarkArchitectureGuard - behavioral proof: pure function, target excluded from its own cohort, no persistence');
{
  const target = buildHistoricalProjectFacts({
    storeCode: 'GUARD-TARGET', country: 'Kazakhstan', projectType: 'New Opening', storeConcept: 'Standard', locationType: 'Mall',
    storeSizeSqm: 1000, actualCost: 400000, currencyCode: 'KZT',
  });
  const peers = [1, 2, 3].map(i => buildHistoricalProjectFacts({
    storeCode: `GUARD-PEER-${i}`, country: 'Kazakhstan', projectType: 'New Opening', storeConcept: 'Standard', locationType: 'Mall',
    storeSizeSqm: 1000, actualCost: 410000 + i, currencyCode: 'KZT',
  }));
  const dataset = [target, ...peers]; // deliberately include the target itself in the pool

  const a = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  const b = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  check('calling buildProjectBenchmark twice with the same input never accumulates/mutates shared state', JSON.stringify(a) === JSON.stringify(b));
  check('the target itself is never counted in its own cohort even when present in the supplied dataset',
    a.cohort.sampleSize === 3 && !a.cohort.projectIdentities.some(p => p.storeCode === 'GUARD-TARGET'));

  const results = buildProjectBenchmarks(target, dataset);
  check('buildProjectBenchmarks returns all 5 metrics without mutating the input dataset array',
    dataset.length === 4 && Object.keys(results).length === 5);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
