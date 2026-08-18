import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../migrations/109_contractor_report_snapshot_digest_path.sql', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
};

console.log('\nContractor Report snapshot digest path migration');

check('patch targets only the Contractor Report scope snapshot trigger function',
  /ALTER FUNCTION public\.capture_contractor_report_scope_snapshot\(\)/i.test(source));
check('trusted pgcrypto extension schema is visible after public application objects',
  /SET search_path\s*=\s*public, extensions/i.test(source));
check('migration does not replace report persistence or mutate report rows',
  !/submit_contractor_report|INSERT\s+INTO|UPDATE\s+public\.contractor_reports/i.test(source));
check('migration is transactional', /BEGIN;/i.test(source) && /COMMIT;/i.test(source));

console.log(`\nContractor Report snapshot digest path migration: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
