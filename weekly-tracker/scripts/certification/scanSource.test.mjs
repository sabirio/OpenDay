// scanSource.test.mjs — targeted tests for the cross-platform source
// scanner that replaced the Unix-only `grep -rl ... || true` call in
// certifyRls.mjs. Builds a throwaway fixture directory tree under the OS
// temp dir, scans it, and asserts exactly which files should and should
// not be found — no real src/ dependency, no shell, no grep.
// Run: node scanSource.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { findFilesContaining, DEFAULT_EXTENSIONS, DEFAULT_EXCLUDE_DIRS } from './scanSource.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
};

const root = mkdtempSync(path.join(tmpdir(), 'scan-source-test-'));

function write(relPath, content) {
  const full = path.join(root, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

// Fixture tree
write('src/lib/supabase.js', "export const x = 1; // no secrets here");
write('src/services/adminService.js', "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;"); // real offender
write('src/components/Widget.jsx', "const service_role = 'oops';"); // real offender, .jsx
write('src/types/index.ts', "// service_role appears in a .ts comment too"); // real offender, .ts
write('src/tests/someTest.test.js', "// service_role mentioned in a test on purpose"); // excluded dir (tests), scannable extension
write('src/core/canonical/__tests__/fixture.js', "// service_role in a __tests__ fixture"); // excluded dir (__tests__)
write('src/migrations/001_init.sql', "-- service_role granted here"); // excluded dir + wrong extension anyway
write('node_modules/some-pkg/index.js', "service_role leaked in a dependency"); // excluded dir
write('dist/bundle.js', "service_role"); // excluded dir
write('src/utils/plain.md', "service_role mentioned in a markdown file"); // wrong extension, not scanned
write('src/utils/clean.js', "export function add(a, b) { return a + b; }"); // clean file, extension matches

console.log('\n1) findFilesContaining finds real offenders and ignores excluded dirs/extensions');
{
  const matches = findFilesContaining(root, /service_role/i);
  const matchSet = new Set(matches);

  check('finds the offending .js service file', matchSet.has('src/services/adminService.js'));
  check('finds the offending .jsx component', matchSet.has('src/components/Widget.jsx'));
  check('finds the offending .ts file', matchSet.has('src/types/index.ts'));
  check('does NOT include the tests/ directory', ![...matchSet].some(f => f.startsWith('src/tests/')));
  check('does NOT include a __tests__ directory', ![...matchSet].some(f => f.includes('__tests__')));
  check('does NOT include the migrations/ directory', ![...matchSet].some(f => f.startsWith('src/migrations/')));
  check('does NOT include node_modules', ![...matchSet].some(f => f.startsWith('node_modules/')));
  check('does NOT include dist', ![...matchSet].some(f => f.startsWith('dist/')));
  check('does NOT include a .md file (extension not scanned)', ![...matchSet].some(f => f.endsWith('.md')));
  check('does NOT include the clean file', !matchSet.has('src/utils/clean.js'));
  check('exactly 3 matches total (the 3 real offenders)', matches.length === 3);
}

console.log('\n2) empty result on a clean tree');
{
  const cleanRoot = mkdtempSync(path.join(tmpdir(), 'scan-source-clean-'));
  writeFileSync(path.join(cleanRoot, 'clean.js'), 'export const ok = true;');
  const matches = findFilesContaining(cleanRoot, /service_role/i);
  check('0 matches on a tree with no occurrences', matches.length === 0);
  rmSync(cleanRoot, { recursive: true, force: true });
}

console.log('\n3) custom extensions/excludeDirs options are honored');
{
  const matches = findFilesContaining(root, /service_role/i, { extensions: ['.md'] });
  check('with extensions:[".md"], the .md file IS found (options override defaults)', matches.includes('src/utils/plain.md'));
  check('with extensions:[".md"], the .js offenders are NOT found', !matches.some(f => f.endsWith('.js')));

  const withoutTestsExcluded = findFilesContaining(root, /service_role/i, {
    extensions: DEFAULT_EXTENSIONS,
    excludeDirs: new Set([...DEFAULT_EXCLUDE_DIRS].filter(d => d !== 'tests')),
  });
  check('excluding "tests" from excludeDirs surfaces the tests/ file too', withoutTestsExcluded.some(f => f.startsWith('src/tests/')));
}

console.log('\n4) does not crash on an empty/nonexistent directory');
{
  const matches = findFilesContaining(path.join(root, 'does-not-exist'), /service_role/i);
  check('nonexistent root -> empty result, no throw', matches.length === 0);
}

rmSync(root, { recursive: true, force: true });

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
