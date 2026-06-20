#!/usr/bin/env node
// runAll.mjs — aggregate discovery runner.
// Run: node src/tests/runAll.mjs
//
// Discovers and runs two classes of test:
//   1. src/tests/runTests.js  — spawned as a child process (14 in-process checks)
//   2. Every *.test.mjs found recursively under src/ — each spawned as a child
//
// Source of truth for pass/fail: child exit code.
// "X passed, Y failed" lines are parsed best-effort for the summary table.
// Exits 0 when all suites pass, 1 if any suite fails.

import { spawnSync }   from 'node:child_process';
import * as fs         from 'node:fs';
import * as path       from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const srcRoot    = path.resolve(__dirname, '..');  // weekly-tracker/src/

// ── 1. Discover *.test.mjs recursively under src/ ─────────────────────────
function findTestMjs(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory())                 findTestMjs(full, acc);
    else if (ent.name.endsWith('.test.mjs')) acc.push(full);
  }
  return acc;
}

const mjsFiles = findTestMjs(srcRoot).sort();  // alphabetical for stable output

// ── 2. Suite list: runTests.js first, then discovered .mjs in order ───────
const runTestsPath = path.join(__dirname, 'runTests.js');

const suites = [
  { label: 'tests/runTests.js', file: runTestsPath },
  ...mjsFiles.map(f => ({
    label: path.relative(srcRoot, f).replace(/\\/g, '/'),
    file:  f,
  })),
];

// ── 3. Spawn each suite, capture output, record result ────────────────────
// Regex matches both output styles:
//   *.test.mjs : "── RESULT: 41 passed, 0 failed ──"
//   runTests.js: "  14 tests total — 14 passed, 0 failed"
const RESULT_RE = /(\d+) passed, (\d+) failed/;

const results = suites.map(({ label, file }) => {
  const res = spawnSync(process.execPath, [file], {
    encoding: 'utf8',
    stdio:    ['ignore', 'pipe', 'pipe'],
  });

  const out = (res.stdout ?? '') + (res.stderr ?? '');
  const m   = out.match(RESULT_RE);
  const ok  = res.status === 0 && !res.error;

  return {
    label,
    ok,
    passed: m ? parseInt(m[1], 10) : null,
    failed: m ? parseInt(m[2], 10) : null,
    output: out,
  };
});

// ── 4. Aggregate table ────────────────────────────────────────────────────
const W = 72;
console.log('\n' + '─'.repeat(W));
console.log('  runAll — aggregate test results');
console.log('─'.repeat(W));

for (const r of results) {
  const icon   = r.ok ? '✅' : '❌';
  const counts = r.passed !== null
    ? `  (${r.passed} passed, ${r.failed} failed)`
    : '';
  console.log(`${icon}  ${r.label}${counts}`);
  if (!r.ok) {
    // Indent failed suite output so the cause is immediately visible
    for (const line of r.output.trimEnd().split('\n')) {
      console.log('     ' + line);
    }
  }
}

// ── 5. Totals ─────────────────────────────────────────────────────────────
const nSuites  = results.length;
const nPassed  = results.filter(r => r.ok).length;
const nFailed  = nSuites - nPassed;
const nChecks  = results.reduce((s, r) => s + (r.passed ?? 0) + (r.failed ?? 0), 0);
const nChkFail = results.reduce((s, r) => s + (r.failed  ?? 0), 0);

console.log('─'.repeat(W));
console.log(`  ${nSuites} suites — ${nPassed} passed, ${nFailed} failed`);
if (nChecks > 0) console.log(`  ${nChecks - nChkFail}/${nChecks} individual checks`);
if (nFailed === 0) console.log('  🎉 All suites passing!');
console.log('─'.repeat(W) + '\n');

process.exit(nFailed > 0 ? 1 : 0);
