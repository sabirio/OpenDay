import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/139_schema_migration_ledger.sql', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

check('Ledger pins migration identity, order, filename, and SHA-256',
  /migration_id text PRIMARY KEY/.test(sql)
  && /sequence_number integer NOT NULL UNIQUE/.test(sql)
  && /sha256 text NOT NULL/.test(sql));
check('Ledger is immutable',
  /SCHEMA_MIGRATION_LEDGER_IMMUTABLE/.test(sql)
  && /BEFORE UPDATE OR DELETE/.test(sql));
check('Hash mismatch is rejected instead of overwritten',
  /SCHEMA_MIGRATION_HASH_MISMATCH/.test(sql)
  && !/ON CONFLICT[\s\S]*DO UPDATE/.test(sql));
check('Supported pre-ledger baseline is named explicitly',
  /supported-baseline-000-132/.test(sql)
  && /SUPPORTED_BASELINE_000_132@f14abab/.test(sql));
check('Browser roles cannot register migrations',
  /private\.register_schema_migration[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(sql));

console.log(`\nSchema Migration Ledger: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
