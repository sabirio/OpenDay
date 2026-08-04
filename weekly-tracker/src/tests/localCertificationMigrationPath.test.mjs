import { readdirSync, readFileSync } from 'node:fs';
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
const snagLocal = readFileSync(new URL('../../scripts/certification/applySnagListLocal.mjs', import.meta.url), 'utf8');
const contractorReportLegacyWpScopeLocal = readFileSync(new URL('../../scripts/certification/applyContractorReportLegacyWpScopeLocal.mjs', import.meta.url), 'utf8');
const importFoundationPhase2Local = readFileSync(new URL('../../scripts/certification/applyImportFoundationPhase2Local.mjs', import.meta.url), 'utf8');
const masterCatalogSchemaV2Local = readFileSync(new URL('../../scripts/certification/applyMasterCatalogSchemaV2Local.mjs', import.meta.url), 'utf8');
const masterCatalogSlice5DLocal = readFileSync(new URL('../../scripts/certification/applyMasterCatalogSlice5DLocal.mjs', import.meta.url), 'utf8');
const masterCatalogWeightCalibrationLocal = readFileSync(new URL('../../scripts/certification/applyMasterCatalogWeightCalibrationLocal.mjs', import.meta.url), 'utf8');
const masterCatalogDurationCalibrationLocal = readFileSync(new URL('../../scripts/certification/applyMasterCatalogDurationCalibrationLocal.mjs', import.meta.url), 'utf8');
const contractorScheduleDraftFoundationLocal = readFileSync(new URL('../../scripts/certification/applyContractorScheduleDraftFoundationLocal.mjs', import.meta.url), 'utf8');
const createContractorManagedProjectLocal = readFileSync(new URL('../../scripts/certification/applyCreateContractorManagedProjectLocal.mjs', import.meta.url), 'utf8');
const contractorManagedScopeSyncLocal = readFileSync(new URL('../../scripts/certification/applyContractorManagedScopeSyncLocal.mjs', import.meta.url), 'utf8');
const contractorScheduleAcl055 = readFileSync(new URL('../migrations/055_restrict_contractor_schedule_function_acl.sql', import.meta.url), 'utf8');
const fixtures = readFileSync(new URL('../../scripts/certification/fixtures.mjs', import.meta.url), 'utf8');
const fixturePassword = readFileSync(new URL('../../scripts/certification/fixturePassword.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const seed = readFileSync(new URL('../../scripts/seed-test-users.mjs', import.meta.url), 'utf8');
const seedSql = readFileSync(new URL('../../scripts/certification/seed-test-data.sql', import.meta.url), 'utf8');
const playwright = readFileSync(new URL('../../playwright.config.js', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../scripts/certification/playwrightPreflight.mjs', import.meta.url), 'utf8');
const legacySeed = readFileSync(new URL('../../seed.mjs', import.meta.url), 'utf8');
const f03 = readFileSync(new URL('../../scripts/verify-f03-scope-narrowing.mjs', import.meta.url), 'utf8');
const backfill = readFileSync(new URL('../migrations/backfillProgressHistory.js', import.meta.url), 'utf8');
const storageDelete = readFileSync(new URL('../../scripts/storage/deleteOrphans.mjs', import.meta.url), 'utf8');
const contract = JSON.parse(readFileSync(new URL('../../../scripts/contracts/canonical-security-contract.json', import.meta.url), 'utf8'));
const contractorWorkspaceFixture = readFileSync(new URL('../../scripts/certification/contractorWorkspaceFixtures.mjs', import.meta.url), 'utf8');
const migrationFiles = readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql'));

console.log('\nlocalCertificationMigrationPath - target and fixture safety');
check('IPv4 loopback accepted', accepts());
check('localhost accepted', accepts({ apiUrl: 'http://localhost:54321', dbUrl: 'postgresql://postgres@localhost:54322/postgres' }));
check('IPv6 loopback rejected by strict localhost guard', !accepts({ apiUrl: 'http://[::1]:54321', dbUrl: 'postgresql://postgres@[::1]:54322/postgres' }));
check('remote HTTPS rejected', !accepts({ apiUrl: 'https://project.supabase.co' }));
check('Supabase cloud host rejected', !accepts({ apiUrl: 'http://project.supabase.co:54321' }));
check('hosted Supabase database host rejected', !accepts({ dbUrl: 'postgresql://postgres@db.project.supabase.co:54322/postgres' }));
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
check('canonical path ends at 041', contract.canonicalMigrationPath.included.at(-1) === '041_versioned_scope_templates.sql');
const migrationNumbers = contract.canonicalMigrationPath.included.map(name => Number(name.slice(0, 3)));
check('canonical path ordering is strictly increasing', migrationNumbers.every((value, index) => index === 0 || value > migrationNumbers[index - 1]));
check('normal local dev script does not reset database', packageJson.scripts['local:dev'] === 'vite');
check('cert reset script is explicitly local destructive workflow', packageJson.scripts['cert:reset'] === 'npm run cert:reset:local' && /resetAndDeploy\.mjs/.test(packageJson.scripts['cert:reset:local']));
check('UI certification reset keeps every post-canonical extension explicit and ordered', packageJson.scripts['cert:reset:ui'] === 'npm run cert:reset:local && node scripts/certification/applySnagListLocal.mjs && node scripts/certification/applyContractorReportLegacyWpScopeLocal.mjs && node scripts/certification/applyImportFoundationPhase2Local.mjs && node scripts/seed-test-users.mjs');
check('Contractor Workspace seed keeps the Snag extension explicit, same precedent as cert:reset:ui', packageJson.scripts['cert:seed:contractor-workspace'] === 'npm run cert:reset:local && node scripts/certification/applySnagListLocal.mjs && node scripts/certification/applyContractorReportLegacyWpScopeLocal.mjs && node scripts/certification/contractorWorkspaceFixtures.mjs');
check('local Snag extension uses the canonical local guard before psql', snagLocal.indexOf('assertLocalTarget') < snagLocal.indexOf("execFileSync('psql'"));
check('local Snag extension pins and verifies the approved 030-035 batch', ['030_snag_list_foundation.sql', '031_snag_reassignment_semantics.sql', '032_snag_project_contractors_rpc.sql', '033_snag_private_plan_pinning.sql', '034_snag_secure_evidence_lifecycle.sql', '035_snag_canonical_field_capture.sql'].every(file => snagLocal.includes(file)) && /createHash\('sha256'\)/.test(snagLocal));
check('local Snag hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(snagLocal));
check('local Contractor Report legacy WP scope extension uses the canonical local guard before psql', contractorReportLegacyWpScopeLocal.indexOf('assertLocalTarget') < contractorReportLegacyWpScopeLocal.indexOf("execFileSync('psql'"));
check('local Contractor Report legacy WP scope extension pins and verifies the approved 036 migration', contractorReportLegacyWpScopeLocal.includes('036_contractor_report_legacy_wp_scope.sql') && /createHash\('sha256'\)/.test(contractorReportLegacyWpScopeLocal));
check('local Contractor Report legacy WP scope hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(contractorReportLegacyWpScopeLocal));
check('local Import Foundation v1 Phase 2 extension uses the canonical local guard before psql', importFoundationPhase2Local.indexOf('assertLocalTarget') < importFoundationPhase2Local.indexOf("execFileSync('psql'"));
check('local Import Foundation v1 Phase 2 extension pins and verifies the approved 037-040 batch', ['037_retail_historical_project_profile.sql', '038_import_foundation_commit_layer.sql', '039_import_foundation_integrity_hardening.sql', '040_import_planned_construction_end.sql'].every(file => importFoundationPhase2Local.includes(file)) && /createHash\('sha256'\)/.test(importFoundationPhase2Local));
check('local Import Foundation v1 Phase 2 hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(importFoundationPhase2Local));
check('local Master Catalog schema-v2 extension uses the canonical local guard before psql', masterCatalogSchemaV2Local.indexOf('assertLocalTarget') < masterCatalogSchemaV2Local.indexOf("execFileSync('psql'"));
check('local Master Catalog schema-v2 extension pins and verifies the approved 042 migration', masterCatalogSchemaV2Local.includes('042_master_catalog_schema_v2.sql') && /createHash\('sha256'\)/.test(masterCatalogSchemaV2Local));
check('local Master Catalog schema-v2 hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(masterCatalogSchemaV2Local));
check('local Master Catalog (Slice 5D) extension uses the canonical local guard before psql', masterCatalogSlice5DLocal.indexOf('assertLocalTarget') < masterCatalogSlice5DLocal.indexOf("execFileSync('psql'"));
check('local Master Catalog (Slice 5D) extension pins and verifies the approved 043 migration', masterCatalogSlice5DLocal.includes('043_retail_fitout_master_catalog.sql') && /createHash\('sha256'\)/.test(masterCatalogSlice5DLocal));
check('local Master Catalog (Slice 5D) hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(masterCatalogSlice5DLocal));
check('local Master Catalog weight extension uses the canonical local guard before psql', masterCatalogWeightCalibrationLocal.indexOf('assertLocalTarget') < masterCatalogWeightCalibrationLocal.indexOf("execFileSync('psql'"));
check('local Master Catalog weight extension pins and verifies the approved 044 migration', masterCatalogWeightCalibrationLocal.includes('044_master_catalog_weight_calibration.sql') && /createHash\('sha256'\)/.test(masterCatalogWeightCalibrationLocal));
check('local Master Catalog weight hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(masterCatalogWeightCalibrationLocal));
check('local Master Catalog duration extension uses the canonical local guard before psql', masterCatalogDurationCalibrationLocal.indexOf('assertLocalTarget') < masterCatalogDurationCalibrationLocal.indexOf("execFileSync('psql'"));
check('local Master Catalog duration extension pins and verifies the approved 045 migration', masterCatalogDurationCalibrationLocal.includes('045_master_catalog_duration_calibration.sql') && /createHash\('sha256'\)/.test(masterCatalogDurationCalibrationLocal));
check('local Master Catalog duration hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(masterCatalogDurationCalibrationLocal));
check('Master Catalog reset applies 042 -> 043 -> 044 -> 045 explicitly and in order',
  /applyMasterCatalogSchemaV2Local\.mjs.*applyMasterCatalogSlice5DLocal\.mjs.*applyMasterCatalogWeightCalibrationLocal\.mjs.*applyMasterCatalogDurationCalibrationLocal\.mjs/.test(packageJson.scripts['cert:reset:master-catalog']));
check('local Contractor Schedule Draft foundation extension uses the canonical local guard before psql', contractorScheduleDraftFoundationLocal.indexOf('assertLocalTarget') < contractorScheduleDraftFoundationLocal.indexOf("execFileSync('psql'"));
check('local Contractor Schedule Draft foundation extension pins and verifies the approved 046-051 batch', ['046_contractor_schedule_draft_foundation.sql', '047_contractor_schedule_human_date_semantics.sql', '048_contractor_schedule_ownership_enforcement.sql', '049_contractor_schedule_submission_lifecycle.sql', '050_contractor_schedule_draft_lifecycle_lock.sql', '051_contractor_schedule_lifecycle_lock_integrity.sql'].every(file => contractorScheduleDraftFoundationLocal.includes(file)) && /createHash\('sha256'\)/.test(contractorScheduleDraftFoundationLocal));
check('local Contractor Schedule Draft foundation hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(contractorScheduleDraftFoundationLocal));
check('Contractor Schedule reset keeps every prior extension explicit, same precedent as cert:reset:master-catalog, and does not depend on the dormant Master Catalog batch',
  packageJson.scripts['cert:reset:contractor-schedule'] === 'npm run cert:reset:local && node scripts/certification/applySnagListLocal.mjs && node scripts/certification/applyContractorReportLegacyWpScopeLocal.mjs && node scripts/certification/applyImportFoundationPhase2Local.mjs && node scripts/certification/applyContractorScheduleDraftFoundationLocal.mjs && node scripts/seed-test-users.mjs');
check('local Create Contractor-Managed Project extension uses the canonical local guard before psql', createContractorManagedProjectLocal.indexOf('assertLocalTarget') < createContractorManagedProjectLocal.indexOf("execFileSync('psql'"));
check('local Create Contractor-Managed Project extension pins and verifies the approved 052 migration', createContractorManagedProjectLocal.includes('052_create_contractor_managed_project.sql') && /createHash\('sha256'\)/.test(createContractorManagedProjectLocal));
check('local Create Contractor-Managed Project hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(createContractorManagedProjectLocal));
check('Create Contractor-Managed Project reset keeps every prior extension explicit, same precedent as cert:reset:contractor-schedule',
  packageJson.scripts['cert:reset:contractor-managed-project'] === 'npm run cert:reset:contractor-schedule && node scripts/certification/applyCreateContractorManagedProjectLocal.mjs');
check('local Contractor-Managed Scope Synchronization extension uses the canonical local guard before psql', contractorManagedScopeSyncLocal.indexOf('assertLocalTarget') < contractorManagedScopeSyncLocal.indexOf("execFileSync('psql'"));
check('local Contractor-Managed Scope Synchronization extension pins and verifies the approved 053 migration', contractorManagedScopeSyncLocal.includes('053_contractor_managed_project_scope_sync.sql') && /createHash\('sha256'\)/.test(contractorManagedScopeSyncLocal));
check('local Contractor-Managed Scope Synchronization extension pins and verifies the approved 054 null-artifact fix migration', contractorManagedScopeSyncLocal.includes('054_fix_contractor_managed_scope_null_artifact.sql'));
check('local Contractor-Managed Scope Synchronization extension pins and verifies the approved 055 ACL hardening migration, hash-pinned', contractorManagedScopeSyncLocal.includes('055_restrict_contractor_schedule_function_acl.sql') && /055_restrict_contractor_schedule_function_acl\.sql', '[a-f0-9]{64}'/.test(contractorManagedScopeSyncLocal));
check('055 follows 054 in the local extension order', contractorManagedScopeSyncLocal.indexOf('054_fix_contractor_managed_scope_null_artifact.sql') < contractorManagedScopeSyncLocal.indexOf('055_restrict_contractor_schedule_function_acl.sql'));
check('055 revokes anon EXECUTE from every Contractor-Managed user-facing RPC', [
  /REVOKE ALL ON FUNCTION public\.save_contractor_schedule_draft\(bigint, jsonb, uuid\)\s+FROM PUBLIC, anon;/,
  /REVOKE ALL ON FUNCTION public\.can_access_schedule_submissions\(bigint\)\s+FROM PUBLIC, anon;/,
  /REVOKE ALL ON FUNCTION public\.contractor_schedule_lifecycle_status\(bigint\)\s+FROM PUBLIC, anon;/,
  /REVOKE ALL ON FUNCTION public\.submit_contractor_schedule\(bigint, uuid, text\)\s+FROM PUBLIC, anon;/,
  /REVOKE ALL ON FUNCTION public\.request_schedule_changes\(bigint, text, uuid\)\s+FROM PUBLIC, anon;/,
  /REVOKE ALL ON FUNCTION public\.approve_schedule_submission\(bigint, text, uuid\)\s+FROM PUBLIC, anon;/,
  /REVOKE ALL ON FUNCTION public\.create_contractor_managed_project\(jsonb, text\[\], uuid\)\s+FROM PUBLIC, anon;/,
  /REVOKE ALL ON FUNCTION public\.update_contractor_managed_project_scope\(bigint, jsonb, text\[\], uuid\)\s+FROM PUBLIC, anon;/,
].every(pattern => pattern.test(contractorScheduleAcl055)));
check('055 blocks direct anon and authenticated execution of trigger-only functions', [
  /REVOKE ALL ON FUNCTION public\.prevent_schedule_version_task_mutation\(\)\s+FROM PUBLIC, anon, authenticated;/,
  /REVOKE ALL ON FUNCTION public\.prevent_scope_mutation_during_review\(\)\s+FROM PUBLIC, anon, authenticated;/,
].every(pattern => pattern.test(contractorScheduleAcl055)));
check('055 never grants EXECUTE to anon', !/TO anon;/.test(contractorScheduleAcl055));
check('local Contractor-Managed Scope Synchronization hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(contractorManagedScopeSyncLocal));
check('Contractor-Managed Scope Synchronization reset keeps every prior extension explicit, same precedent as cert:reset:contractor-managed-project',
  packageJson.scripts['cert:reset:contractor-managed-scope-sync'] === 'npm run cert:reset:contractor-managed-project && node scripts/certification/applyContractorManagedScopeSyncLocal.mjs');

// Structural migration-completeness guard: the fresh-install path is a
// multi-part composition (canonical contract's 000-029 and 041 + applySnagListLocal.mjs's
// separately-approved 030-035 batch + applyContractorReportLegacyWpScopeLocal.mjs's
// separately-approved 036 migration) rather than one single list. This proves
// their UNION still covers every migration file that belongs on the
// fresh-install path (all files except the contract's own documented
// excludedHistorical/excludedSkipOnFresh sets) — so a future migration
// (037+) added to src/migrations/ without being added to ANY of these lists
// fails this check immediately, instead of only being discovered by a
// silently incomplete local reset (as 030-035 was before that fix).
const excludedHistorical = new Set(contract.canonicalMigrationPath.excludedHistorical.files);
const excludedSkipOnFresh = new Set(contract.canonicalMigrationPath.excludedSkipOnFresh.files);
const expectedFreshInstallSet = migrationFiles.filter(f => !excludedHistorical.has(f) && !excludedSkipOnFresh.has(f));
const snagBatchFiles = [...snagLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const contractorReportLegacyWpScopeBatchFiles = [...contractorReportLegacyWpScopeLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const importFoundationPhase2BatchFiles = [...importFoundationPhase2Local.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const masterCatalogSchemaV2BatchFiles = [...masterCatalogSchemaV2Local.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const masterCatalogSlice5DBatchFiles = [...masterCatalogSlice5DLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const masterCatalogWeightCalibrationBatchFiles = [...masterCatalogWeightCalibrationLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const masterCatalogDurationCalibrationBatchFiles = [...masterCatalogDurationCalibrationLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const contractorScheduleDraftFoundationBatchFiles = [...contractorScheduleDraftFoundationLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const createContractorManagedProjectBatchFiles = [...createContractorManagedProjectLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const contractorManagedScopeSyncBatchFiles = [...contractorManagedScopeSyncLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const coveredSet = new Set([...contract.canonicalMigrationPath.included, ...snagBatchFiles, ...contractorReportLegacyWpScopeBatchFiles, ...importFoundationPhase2BatchFiles, ...masterCatalogSchemaV2BatchFiles, ...masterCatalogSlice5DBatchFiles, ...masterCatalogWeightCalibrationBatchFiles, ...masterCatalogDurationCalibrationBatchFiles, ...contractorScheduleDraftFoundationBatchFiles, ...createContractorManagedProjectBatchFiles, ...contractorManagedScopeSyncBatchFiles]);
check('fresh-install migration set is exactly covered through approved Contractor Schedule ACL hardening migration 055, no gaps',
  expectedFreshInstallSet.every(f => coveredSet.has(f)));
check('fresh-install coverage contains no unexpected extras beyond the expected set',
  [...coveredSet].every(f => expectedFreshInstallSet.includes(f)));
check('at least one migration beyond 029 is covered (guards against this check being vacuously true)', snagBatchFiles.length >= 6);
check('migration 036 is covered by the Contractor Report legacy WP scope batch (guards against this check being vacuously true)', contractorReportLegacyWpScopeBatchFiles.length >= 1);
check('migrations 037-040 are covered by the Import Foundation v1 Phase 2 batch (guards against this check being vacuously true)', importFoundationPhase2BatchFiles.length >= 4);
check('migration 042 is covered by the Master Catalog schema-v2 batch (guards against this check being vacuously true)', masterCatalogSchemaV2BatchFiles.length >= 1);
check('migration 043 is covered by the Master Catalog Slice 5D batch (guards against this check being vacuously true)', masterCatalogSlice5DBatchFiles.length >= 1);
check('migration 044 is covered by the Master Catalog weight batch (guards against this check being vacuously true)', masterCatalogWeightCalibrationBatchFiles.length >= 1);
check('migration 045 is covered by the Master Catalog duration batch (guards against this check being vacuously true)', masterCatalogDurationCalibrationBatchFiles.length >= 1);
check('migrations 046-051 are covered by the Contractor Schedule Draft foundation batch (guards against this check being vacuously true)', contractorScheduleDraftFoundationBatchFiles.length >= 6);
check('migration 052 is covered by the Create Contractor-Managed Project batch (guards against this check being vacuously true)', createContractorManagedProjectBatchFiles.length >= 1);
check('migrations 053-055 are covered by the Contractor-Managed Scope Synchronization batch (guards against this check being vacuously true)', contractorManagedScopeSyncBatchFiles.length >= 3);

// Fixture DATA must never apply/repair schema — that is the reset+extension
// pipeline's job (resetAndDeploy.mjs + applySnagListLocal.mjs), chained by
// cert:seed:contractor-workspace above. The fixture may only validate.
check('Contractor Workspace fixture does not apply migration files (no psql -f / migrationsDir usage)',
  !/-f['",\s]/.test(contractorWorkspaceFixture) && !/migrationsDir/.test(contractorWorkspaceFixture));
check('Contractor Workspace fixture validates required schema and fails clearly instead of repairing it',
  /to_regclass\('public\.snags'\)/.test(contractorWorkspaceFixture) && /FAIL: Contractor Workspace fixture requires the current local schema/.test(contractorWorkspaceFixture));
check('fixture password supports LOCAL_FIXTURE_PASSWORD with safe local fallback', /LOCAL_FIXTURE_PASSWORD/.test(fixturePassword) && /DEFAULT_LOCAL_FIXTURE_PASSWORD/.test(fixturePassword));
check('cert fixtures synchronize password for existing Auth users', /updateUserById\(existing\.id/.test(fixtures) && /password:\s*PASSWORD/.test(fixtures));
check('cert fixtures keep deterministic profile names on repeated resets (handle_new_user() trigger sets an email-prefix name first)', /name = EXCLUDED\.name/.test(fixtures));
check('Contractor Workspace fixture keeps deterministic profile names on repeated resets, same fix as the base fixtures', /name = EXCLUDED\.name/.test(contractorWorkspaceFixture));
check('cert fixture password regression script exists', /verifyFixturePasswordPersistence\.mjs/.test(packageJson.scripts['cert:verify-fixture-password']));
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
