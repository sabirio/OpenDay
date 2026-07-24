// importWorkflowArchitectureGuard.test.mjs - Import Foundation v1 Phase 3:
// proves the UI never reimplements the frozen Import Foundation's business
// logic (normalize/validate/plan/duplicate-detection/commit) and that
// importWorkflowModel.js stays free of Supabase so it remains unit-testable
// under plain Node. The repo-wide architectureGuard.test.mjs already
// enforces the general layer-import/calculation rules for every file under
// src/ (including these); this guard adds Import-UI-specific assertions the
// generic one can't express.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..', '..');

function findFiles(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) findFiles(full, acc);
    else if (/\.(js|jsx)$/.test(ent.name) && !ent.name.endsWith('.test.mjs')) acc.push(full);
  }
  return acc;
}

const uiFiles = [
  ...findFiles(path.join(srcRoot, 'pages', 'import')),
  ...findFiles(path.join(srcRoot, 'components', 'import')),
  ...findFiles(path.join(srcRoot, 'hooks', 'import')),
].map(file => ({ rel: path.relative(srcRoot, file).replace(/\\/g, '/'), text: readFileSync(file, 'utf8') }));

console.log('\nimportWorkflowArchitectureGuard - Import UI files exist');
check('at least the 4 step components + page + hook exist', uiFiles.length >= 6);

console.log('\nimportWorkflowArchitectureGuard - Import UI never reimplements frozen business logic');
const FORBIDDEN_LOGIC_PATTERNS = [
  { label: 'direct Supabase project writes', re: /\.from\(['"]projects['"]\)\s*\.\s*insert\(/ },
  { label: 'direct Supabase client import', re: /from\s+['"][^'"]*lib\/supabase/ },
  { label: 'a second RPC-calling client (bypassing services/importCommitService.js)', re: /supabase\.rpc\(/ },
  { label: 'hand-rolled CREATE/SKIP/BLOCK assignment', re: /action\s*=\s*['"](CREATE|SKIP|BLOCK)['"]/ },
];
for (const file of uiFiles) {
  for (const forbidden of FORBIDDEN_LOGIC_PATTERNS) {
    check(`${file.rel} does not contain ${forbidden.label}`, !forbidden.re.test(file.text));
  }
}

console.log('\nimportWorkflowArchitectureGuard - only importWorkflowIO.js touches services/Supabase for this feature');
const modelFile = readFileSync(path.join(srcRoot, 'core', 'importWorkflow', 'importWorkflowModel.js'), 'utf8');
check('importWorkflowModel.js has zero services/ imports (stays unit-testable under plain Node)', !/from\s+['"][^'"]*\/services\//.test(modelFile));
check('importWorkflowModel.js has zero lib/supabase imports', !/from\s+['"][^'"]*lib\/supabase/.test(modelFile));
const ioFile = readFileSync(path.join(srcRoot, 'core', 'importWorkflow', 'importWorkflowIO.js'), 'utf8');
check('importWorkflowIO.js is the one file that imports services/importCommitService.js', /from\s+['"]\.\.\/\.\.\/services\/importCommitService\.js['"]/.test(ioFile));

console.log('\nimportWorkflowArchitectureGuard - CREATE/SKIP/BLOCK plan rows are only ever forwarded, never filtered before commit');
const hookFile = readFileSync(path.join(srcRoot, 'hooks', 'import', 'useImportWorkflow.js'), 'utf8');
check('the hook submits plan.rows verbatim to commitPlan (no .filter( before the commit call)', /planRows:\s*plan\.rows,/.test(hookFile));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
