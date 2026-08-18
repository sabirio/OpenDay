import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/110_enforce_project_currency.sql', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.error(`  FAIL ${name}`); }
};

check('legacy projects with no currency are backfilled to KZT', /SET currency_code = 'KZT'[\s\S]*currency_code IS NULL/.test(sql));
check('project currency is mandatory after migration', /ALTER COLUMN currency_code SET NOT NULL/.test(sql));
check('project currency is limited to the creation choices', /CHECK \(currency_code IN \('KZT', 'USD', 'EUR'\)\)/.test(sql));

console.log(`\nProject currency migration: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
