// importArchitectureGuard.test.mjs - proves core/import/ stays pure: usable
// later from a UI, a CLI, or certification scripts without ever depending on
// Supabase, an authenticated session, React, routing, or the service layer.
// Mirrors the existing source-text-contract convention used elsewhere in
// this codebase (e.g. src/tests/snagMobileContracts.test.mjs) rather than
// inventing a new guard mechanism.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = readdirSync(dir)
  .filter(name => name.endsWith('.js') && !name.endsWith('.test.mjs'))
  .map(name => ({ name, text: readFileSync(path.join(dir, name), 'utf8') }));

console.log('\nimportArchitectureGuard - core/import/ contains only *.js pure modules (no page/component files)');
check('at least the five Phase 1 modules exist', sourceFiles.length >= 5);

const FORBIDDEN_PATTERNS = [
  { label: 'Supabase client', re: /supabase/i },
  { label: 'React', re: /\breact\b|from ['"]react/i },
  { label: 'react-router', re: /react-router/i },
  { label: 'the services/ layer', re: /from\s+['"][^'"]*\/services\// },
  { label: 'auth/session inspection', re: /auth\.uid\(\)|getCurrentUser|useAuth\(/ },
  { label: 'direct file-system writes', re: /writeFile|fs\.write|createWriteStream/ },
];

for (const file of sourceFiles) {
  for (const forbidden of FORBIDDEN_PATTERNS) {
    check(`${file.name} does not import/reference ${forbidden.label}`, !forbidden.re.test(file.text));
  }
}

console.log('\nimportArchitectureGuard - no module creates a project or mutates state');
for (const file of sourceFiles) {
  check(`${file.name} contains no project-creation or write call (.insert(/.update(/.from('projects'))`,
    !/\.insert\(|\.update\(|from\(['"]projects['"]\)/.test(file.text));
}

console.log('\nimportArchitectureGuard - parseImportFile is the only module allowed to touch file bytes via xlsx');
const xlsxImporters = sourceFiles.filter(file => /from\s+['"]xlsx['"]/.test(file.text)).map(file => file.name);
check('exactly one module imports the xlsx package', xlsxImporters.length === 1 && xlsxImporters[0] === 'parseImportFile.js');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
