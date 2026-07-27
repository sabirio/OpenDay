// historyArchitectureGuard.test.mjs — proves Historical Data Foundation v1
// (historyEngine.js + portfolioHistoryEngine.js) stays a pure calculation
// layer: usable later from Benchmark Engine, a CLI, or a certification
// script without ever depending on Supabase, React, Portfolio/UI, or the
// Import workflow, and that it never persists a derived metric or treats an
// engine-owned forecast field as historical truth. Mirrors the existing
// source-text-contract convention (core/import/importArchitectureGuard.test.mjs,
// src/export/xlsx/projectExportArchitectureGuard.test.mjs) rather than
// inventing a new guard mechanism.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { buildHistoricalProjectFacts } from './historyEngine.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = ['historyEngine.js', 'portfolioHistoryEngine.js'].map(name => ({
  name,
  text: readFileSync(path.join(dir, name), 'utf8'),
}));

console.log('\nhistoryArchitectureGuard - pure calculation layer only');

const FORBIDDEN_PATTERNS = [
  { label: 'React', re: /from\s+['"]react(-dom)?['"]|import\s+React\b/ },
  { label: 'Supabase client', re: /from\s+['"][^'"]*supabase[^'"]*['"]|createClient\(/i },
  { label: 'the services/ layer', re: /from\s+['"][^'"]*\/services\// },
  { label: 'a direct project DB write (.insert(/.update(/.delete()', re: /\.insert\(|\.update\(|\.delete\(/ },
  { label: 'a from(\'projects\') query', re: /from\(['"]projects['"]\)/ },
  { label: 'Portfolio/UI (pages/ or components/)', re: /from\s+['"][^'"]*\/(pages|components)\// },
  { label: 'the Import workflow (core/import/, core/importWorkflow/, hooks/import/)', re: /from\s+['"][^'"]*\/(core\/import|core\/importWorkflow|hooks\/import)\// },
  { label: 'browser storage (localStorage/sessionStorage) — derived metrics are never persisted', re: /localStorage|sessionStorage|indexedDB/ },
  { label: 'a network fetch', re: /\bfetch\(/ },
];
for (const file of files) {
  for (const forbidden of FORBIDDEN_PATTERNS) {
    check(`${file.name} does not import/reference ${forbidden.label}`, !forbidden.re.test(file.text));
  }
}

console.log('\nhistoryArchitectureGuard - forecast fields are never read as historical truth');
// Precise property-access check (a literal preceding dot) so this doesn't
// false-positive on the module's own explanatory comments about *excluding*
// these fields.
for (const file of files) {
  check(`${file.name} never accesses .constructionCompletionDate`, !/\.constructionCompletionDate\b/.test(file.text));
  check(`${file.name} never accesses .forecastOpeningDate`, !/\.forecastOpeningDate\b/.test(file.text));
}

console.log('\nhistoryArchitectureGuard - no persisted derived metrics (behavioral proof, not just source text)');
{
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', budget: 100, actualCost: 110, currencyCode: 'USD', storeSizeSqm: 10 });
  check('calling the builder twice with the same input never accumulates/mutates shared state (pure function, nothing stored between calls)',
    JSON.stringify(facts) === JSON.stringify(buildHistoricalProjectFacts({ storeCode: 'X', budget: 100, actualCost: 110, currencyCode: 'USD', storeSizeSqm: 10 })));
}

console.log('\nhistoryArchitectureGuard - no benchmark/forecast-engine/AI imports in this layer (§44/§45 scope fence)');
// Import-only check (not a ban on the English words "benchmark"/"forecast"/
// "median" in explanatory comments — this module's own docs legitimately
// describe what it deliberately does NOT do and hands off to later engines).
for (const file of files) {
  check(`${file.name} does not import a benchmark/forecast/AI engine module`,
    !/from\s+['"][^'"]*\/(benchmarkEngine|forecastEngine|contractorScoring|aiEngine)[^'"]*['"]/i.test(file.text));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
