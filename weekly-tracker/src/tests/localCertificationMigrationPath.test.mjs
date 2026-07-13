import { readFileSync } from 'node:fs';
import { assertLocalTarget } from '../../scripts/certification/localTargetGuard.mjs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}
function accepts(overrides = {}) {
  try {
    assertLocalTarget({ apiUrl: 'http://127.0.0.1:54321', dbUrl: 'postgresql://postgres@127.0.0.1:54322/postgres', enabled: '1', projectId: 'weekly-tracker', ...overrides });
    return true;
  } catch { return false; }
}

const deploy = readFileSync(new URL('../../scripts/certification/resetAndDeploy.mjs', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../../scripts/seed-test-users.mjs', import.meta.url), 'utf8');
const seedSql = readFileSync(new URL('../../scripts/certification/seed-test-data.sql', import.meta.url), 'utf8');
const playwright = readFileSync(new URL('../../playwright.config.js', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../scripts/certification/playwrightPreflight.mjs', import.meta.url), 'utf8');
const legacySeed = readFileSync(new URL('../../seed.mjs', import.meta.url), 'utf8');
const f03 = readFileSync(new URL('../../scripts/verify-f03-scope-narrowing.mjs', import.meta.url), 'utf8');
const backfill = readFileSync(new URL('../migrations/backfillProgressHistory.js', import.meta.url), 'utf8');
const storageDelete = readFileSync(new URL('../../scripts/storage/deleteOrphans.mjs', import.meta.url), 'utf8');
const contract = JSON.parse(readFileSync(new URL('../../../scripts/contracts/canonical-security-contract.json', import.meta.url), 'utf8'));

console.log('\nlocalCertificationMigrationPath - target and fixture safety');
check('IPv4 loopback accepted', accepts());
check('localhost accepted', accepts({ apiUrl: 'http://localhost:54321', dbUrl: 'postgresql://postgres@localhost:54322/postgres' }));
check('IPv6 loopback accepted', accepts({ apiUrl: 'http://[::1]:54321', dbUrl: 'postgresql://postgres@[::1]:54322/postgres' }));
check('remote HTTPS rejected', !accepts({ apiUrl: 'https://project.supabase.co' }));
check('Supabase cloud host rejected', !accepts({ apiUrl: 'http://project.supabase.co:54321' }));
check('private LAN host rejected', !accepts({ apiUrl: 'http://192.168.1.20:54321' }));
check('API credentials rejected', !accepts({ apiUrl: 'http://user:pass@127.0.0.1:54321' }));
check('remote database rejected', !accepts({ dbUrl: 'postgresql://postgres@db.example.com:5432/postgres' }));
check('wrong database name rejected', !accepts({ dbUrl: 'postgresql://postgres@127.0.0.1:54322/other' }));
check('missing database user rejected', !accepts({ dbUrl: 'postgresql://127.0.0.1:54322/postgres' }));
check('wrong local API port rejected', !accepts({ apiUrl: 'http://localhost:8000' }));
check('missing fixture opt-in rejected', !accepts({ enabled: undefined }));
check('wrong project identity rejected', !accepts({ projectId: 'production' }));
check('malformed URL rejected', !accepts({ apiUrl: 'not a url' }));
check('seeder does not load .env.local', !/loadDotEnv|\.env\.local/.test(seed));
check('guard runs before client construction', seed.indexOf('assertLocalTarget') < seed.indexOf('createClient(target'));
check('guard runs before PostgreSQL connection', seed.indexOf('assertLocalTarget') < seed.indexOf("execFileSync('psql'"));
check('public fixture data uses local psql', /execFileSync\('psql'/.test(seed));
check('public fixture SQL is transactional', /BEGIN;[\s\S]*COMMIT;/.test(seedSql));
check('fixture project ID is deterministic', /910001/.test(seedSql));
check('all fixture passwords satisfy auth minimum', [...seed.matchAll(/password: '([^']+)'/g)].every(([, value]) => value.length >= 6));
check('deploy reads canonical contract', /canonical-security-contract\.json/.test(deploy));
check('deploy guard runs before reset or psql', deploy.indexOf('assertLocalTarget') < deploy.indexOf("execSync('npx"));
check('canonical path ends at 029', contract.canonicalMigrationPath.included.at(-1) === '029_production_acl_followup.sql');
const migrationNumbers = contract.canonicalMigrationPath.included.map(name => Number(name.slice(0, 3)));
check('canonical path ordering is strictly increasing', migrationNumbers.every((value, index) => index === 0 || value > migrationNumbers[index - 1]));
check('Playwright guard runs before web server declaration', playwright.indexOf('assertLocalTarget') < playwright.indexOf('webServerCommand'));
check('Playwright requires fixture preflight before Vite', /playwrightPreflight\.mjs && npm\.cmd run dev/.test(playwright));
check('fixture preflight guards before Auth client construction', preflight.indexOf('assertLocalTarget') < preflight.indexOf('createClient(target'));
check('fixture preflight checks local Auth and database fixtures', /required local Auth fixtures/.test(preflight) && /deterministic local database fixtures/.test(preflight));
for (const [label, source] of [['legacy seed', legacySeed], ['F-03 verifier', f03], ['history backfill', backfill]]) {
  check(`${label} does not load .env.local`, !/loadDotEnv|loadEnv\(|readFileSync\([^)]*\.env\.local/.test(source));
  check(`${label} uses canonical local guard`, /assertLocalTarget/.test(source));
}
check('storage deletion requires explicit env before client construction', storageDelete.indexOf('requireEnv()') < storageDelete.indexOf('createClient(url'));
check('storage deletion is dry-run unless --execute is explicit', /args\.execute && toDelete\.length/.test(storageDelete));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
