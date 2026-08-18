import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/108_variation_evidence_storage_acl.sql', import.meta.url), 'utf8');
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

console.log('\nVariation evidence Storage ACL migration');

check('authenticated users receive the SELECT privilege required by Storage RLS',
  /GRANT SELECT ON TABLE public\.project_variation_evidence_upload_intents\s+TO authenticated/i.test(migration));
check('all broader table privileges are removed before the narrow grant',
  /REVOKE ALL ON TABLE public\.project_variation_evidence_upload_intents\s+FROM PUBLIC, anon, authenticated, service_role/i.test(migration));
check('migration does not grant mutation privileges on upload intents',
  !/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)/i.test(migration));
check('migration is transactional', /BEGIN;/i.test(migration) && /COMMIT;/i.test(migration));

console.log(`\nVariation evidence Storage ACL migration: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
