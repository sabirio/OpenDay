// importCommitArchitectureGuard.test.mjs — Import Foundation v1 Phase 2:
// proves the trusted commit_project_import_batch RPC has exactly one
// caller. If a second call site appeared, it would mean a client-side
// insert-loop bypass had been added somewhere, defeating the one trusted
// write path this migration/service pair establishes.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..');

function findJsFiles(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) findJsFiles(full, acc);
    else if (/\.(js|jsx|mjs)$/.test(ent.name) && !ent.name.endsWith('.test.mjs')) acc.push(full);
  }
  return acc;
}

const callers = findJsFiles(srcRoot)
  .filter(file => readFileSync(file, 'utf8').includes('commit_project_import_batch'))
  .map(file => path.relative(srcRoot, file).replace(/\\/g, '/'));

console.log('\nimportCommitArchitectureGuard - commit_project_import_batch has exactly one caller');
check('exactly one source file references the trusted commit RPC', callers.length === 1);
check('that one caller is services/importCommitService.js, not an ad-hoc bypass', callers[0] === 'services/importCommitService.js');

console.log('\nimportCommitArchitectureGuard - core/import/ still has zero write/RPC calls (Phase 1 purity unaffected by Phase 2)');
const coreImportFiles = findJsFiles(path.join(srcRoot, 'core', 'import'));
check('at least the Phase 1 modules exist', coreImportFiles.length >= 5);
for (const file of coreImportFiles) {
  const text = readFileSync(file, 'utf8');
  const name = path.relative(srcRoot, file).replace(/\\/g, '/');
  check(`${name} does not reference the commit RPC`, !text.includes('commit_project_import_batch'));
  check(`${name} does not import the Supabase client`, !/supabase/i.test(text));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
