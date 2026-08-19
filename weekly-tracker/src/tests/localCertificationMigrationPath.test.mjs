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
const r1ReportingPersistenceLocal = readFileSync(new URL('../../scripts/certification/applyR1ReportingPersistenceLocal.mjs', import.meta.url), 'utf8');
const workOntologyFoundationLocal = readFileSync(new URL('../../scripts/certification/applyWorkOntologyFoundationLocal.mjs', import.meta.url), 'utf8');
const projectWorkOntologyScopeLocal = readFileSync(new URL('../../scripts/certification/applyProjectWorkOntologyScopeLocal.mjs', import.meta.url), 'utf8');
const workGroupReportingCompatibilityLocal = readFileSync(new URL('../../scripts/certification/applyWorkGroupReportingCompatibilityLocal.mjs', import.meta.url), 'utf8');
const projectExecutionScopeLocal = readFileSync(new URL('../../scripts/certification/applyProjectExecutionScopeLocal.mjs', import.meta.url), 'utf8');
const contractorScheduleSetupLocal = readFileSync(new URL('../../scripts/certification/applyContractorScheduleSetupLocal.mjs', import.meta.url), 'utf8');
const ganttBaselineScopeSnapshotLocal = readFileSync(new URL('../../scripts/certification/applyGanttBaselineScopeSnapshotLocal.mjs', import.meta.url), 'utf8');
const pmScheduleBaselineApprovalLocal = readFileSync(new URL('../../scripts/certification/applyPmScheduleBaselineApprovalLocal.mjs', import.meta.url), 'utf8');
const projectBoqFoundationLocal = readFileSync(new URL('../../scripts/certification/applyProjectBoqFoundationLocal.mjs', import.meta.url), 'utf8');
const projectBoqWorkGroupAggregationLocal = readFileSync(new URL('../../scripts/certification/applyProjectBoqWorkGroupAggregationLocal.mjs', import.meta.url), 'utf8');
const projectBoqStandardCustomItemsLocal = readFileSync(new URL('../../scripts/certification/applyProjectBoqStandardCustomItemsLocal.mjs', import.meta.url), 'utf8');
const projectBoqExecutionScopeMappingLocal = readFileSync(new URL('../../scripts/certification/applyProjectBoqExecutionScopeMappingLocal.mjs', import.meta.url), 'utf8');
const projectBoqExcelCompatibilityLocal = readFileSync(new URL('../../scripts/certification/applyProjectBoqExcelCompatibilityLocal.mjs', import.meta.url), 'utf8');
const tenderSetupLocal = readFileSync(new URL('../../scripts/certification/applyTenderSetupLocal.mjs', import.meta.url), 'utf8');
const tenderBidderAccessLocal = readFileSync(new URL('../../scripts/certification/applyTenderBidderAccessLocal.mjs', import.meta.url), 'utf8');
const tenderBidRoundsLocal = readFileSync(new URL('../../scripts/certification/applyTenderBidRoundsLocal.mjs', import.meta.url), 'utf8');
const tenderPmBidReviewLocal = readFileSync(new URL('../../scripts/certification/applyTenderPmBidReviewLocal.mjs', import.meta.url), 'utf8');
const tenderClarificationRegisterLocal = readFileSync(new URL('../../scripts/certification/applyTenderClarificationRegisterLocal.mjs', import.meta.url), 'utf8');
const tenderComparisonLocal = readFileSync(new URL('../../scripts/certification/applyTenderComparisonLocal.mjs', import.meta.url), 'utf8');
const tenderAwardLocal = readFileSync(new URL('../../scripts/certification/applyTenderAwardLocal.mjs', import.meta.url), 'utf8');
const awardedExecutionScopeLocal = readFileSync(new URL('../../scripts/certification/applyAwardedBoqExecutionScopeLocal.mjs', import.meta.url), 'utf8');
const departmentalBudgetLocal = readFileSync(new URL('../../scripts/certification/applyCollaborativeDepartmentalBudgetLocal.mjs', import.meta.url), 'utf8');
const budgetOwnershipLocal = readFileSync(new URL('../../scripts/certification/applyBudgetOwnershipNotificationsLocal.mjs', import.meta.url), 'utf8');
const budgetRoundsLocal = readFileSync(new URL('../../scripts/certification/applyBudgetRoundsLocal.mjs', import.meta.url), 'utf8');
const budgetApprovalLocal = readFileSync(new URL('../../scripts/certification/applyBudgetApprovalWorkflowLocal.mjs', import.meta.url), 'utf8');
const budgetVsTenderLocal = readFileSync(new URL('../../scripts/certification/applyBudgetVsTenderLocal.mjs', import.meta.url), 'utf8');
const budgetApprovalReportLocal = readFileSync(new URL('../../scripts/certification/applyBudgetApprovalReportLocal.mjs', import.meta.url), 'utf8');
const projectVariationsLocal = readFileSync(new URL('../../scripts/certification/applyProjectVariationsLocal.mjs', import.meta.url), 'utf8');
const biweeklyCommercialReviewLocal = readFileSync(new URL('../../scripts/certification/applyBiweeklyCommercialReviewLocal.mjs', import.meta.url), 'utf8');
const approvedVsPendingExposureLocal = readFileSync(new URL('../../scripts/certification/applyApprovedVsPendingExposureLocal.mjs', import.meta.url), 'utf8');
const forecastEngineLocal = readFileSync(new URL('../../scripts/certification/applyForecastEngineLocal.mjs', import.meta.url), 'utf8');
const commercialHealthLocal = readFileSync(new URL('../../scripts/certification/applyCommercialHealthLocal.mjs', import.meta.url), 'utf8');
const paymentScheduleLocal = readFileSync(new URL('../../scripts/certification/applyPaymentScheduleLocal.mjs', import.meta.url), 'utf8');
const paymentNotificationsLocal = readFileSync(new URL('../../scripts/certification/applyPaymentMilestoneNotificationsLocal.mjs', import.meta.url), 'utf8');
const paymentCertificationEvidenceLocal = readFileSync(new URL('../../scripts/certification/applyPaymentCertificationEvidenceLocal.mjs', import.meta.url), 'utf8');
const paymentCertificationDecisionsLocal = readFileSync(new URL('../../scripts/certification/applyPaymentCertificationDecisionsLocal.mjs', import.meta.url), 'utf8');
const paymentPaidTrackingLocal = readFileSync(new URL('../../scripts/certification/applyPaymentPaidTrackingLocal.mjs', import.meta.url), 'utf8');
const paymentRetentionLocal = readFileSync(new URL('../../scripts/certification/applyPaymentRetentionLocal.mjs', import.meta.url), 'utf8');
const projectCostCloseoutLocal = readFileSync(new URL('../../scripts/certification/applyProjectCostCloseoutLocal.mjs', import.meta.url), 'utf8');
const projectScheduleCloseoutLocal = readFileSync(new URL('../../scripts/certification/applyProjectScheduleCloseoutLocal.mjs', import.meta.url), 'utf8');
const projectScopeCloseoutLocal = readFileSync(new URL('../../scripts/certification/applyProjectScopeCloseoutLocal.mjs', import.meta.url), 'utf8');
const projectQualityCloseoutLocal = readFileSync(new URL('../../scripts/certification/applyProjectQualityCloseoutLocal.mjs', import.meta.url), 'utf8');
const roadmapCompletionLocal = readFileSync(new URL('../../scripts/certification/applyRoadmapCompletionLocal.mjs', import.meta.url), 'utf8');
const budgetBoqScopeLocal = readFileSync(new URL('../../scripts/certification/applyBudgetBoqScopeLocal.mjs', import.meta.url), 'utf8');
const budgetIndependentBoqLocal = readFileSync(new URL('../../scripts/certification/applyBudgetIndependentBoqLocal.mjs', import.meta.url), 'utf8');
const boqLabourMaterialPricingLocal = readFileSync(new URL('../../scripts/certification/applyBoqLabourMaterialPricingLocal.mjs', import.meta.url), 'utf8');
const boqContractorConsultantQuantitiesLocal = readFileSync(new URL('../../scripts/certification/applyBoqContractorConsultantQuantitiesLocal.mjs', import.meta.url), 'utf8');
const boqOptionalContractorQuantityLocal = readFileSync(new URL('../../scripts/certification/applyBoqOptionalContractorQuantityLocal.mjs', import.meta.url), 'utf8');
const tenderInvitationEmailLocal = readFileSync(new URL('../../scripts/certification/applyTenderInvitationEmailLocal.mjs', import.meta.url), 'utf8');
const tenderCommercialRoadmapLocal = readFileSync(new URL('../../scripts/certification/applyTenderCommercialRoadmapLocal.mjs', import.meta.url), 'utf8');
const projectAccessAlignmentLocal = readFileSync(new URL('../../scripts/certification/applyProjectAccessAlignmentLocal.mjs', import.meta.url), 'utf8');
const canonicalFinancialSourcesLocal = readFileSync(new URL('../../scripts/certification/applyCanonicalFinancialSourcesLocal.mjs', import.meta.url), 'utf8');
const paymentCommitmentScopeLocal = readFileSync(new URL('../../scripts/certification/applyPaymentCommitmentScopeLocal.mjs', import.meta.url), 'utf8');
const architectureIntegrityMigrations = readFileSync(new URL('../../scripts/certification/architectureIntegrityMigrations.mjs', import.meta.url), 'utf8');
const architectureIntegrityLocal = readFileSync(new URL('../../scripts/certification/applyArchitectureIntegrityCorrectionsLocal.mjs', import.meta.url), 'utf8');
const procurementStrategyLocal = readFileSync(new URL('../../scripts/certification/applyProcurementStrategyLocal.mjs', import.meta.url), 'utf8');
const projectTeamDepartmentsLocal = readFileSync(new URL('../../scripts/certification/applyProjectTeamDepartmentsLocal.mjs', import.meta.url), 'utf8');
const securityDefinerExecuteHardeningLocal = readFileSync(new URL('../../scripts/certification/applySecurityDefinerExecuteHardeningLocal.mjs', import.meta.url), 'utf8');
const securityAdvisorHardeningLocal = readFileSync(new URL('../../scripts/certification/applySecurityAdvisorHardeningLocal.mjs', import.meta.url), 'utf8');
const localDbTarget = readFileSync(new URL('../../scripts/certification/localDbTarget.mjs', import.meta.url), 'utf8');
const tenderCommercialE2ERunner = readFileSync(new URL('../../scripts/certification/runTenderCommercialE2E.mjs', import.meta.url), 'utf8');
const contractorScheduleAcl055 = readFileSync(new URL('../migrations/055_restrict_contractor_schedule_function_acl.sql', import.meta.url), 'utf8');
const rlsHelperAcl056 = readFileSync(new URL('../migrations/056_restrict_rls_helper_function_acl.sql', import.meta.url), 'utf8');
const part5Bridge057 = readFileSync(new URL('../migrations/057_part5_table_sequence_acl_bridge.sql', import.meta.url), 'utf8');
const atomicWriteReconciliation058 = readFileSync(new URL('../migrations/058_reconcile_atomic_write_security_and_contractor_rpc.sql', import.meta.url), 'utf8');
const fixtures = readFileSync(new URL('../../scripts/certification/fixtures.mjs', import.meta.url), 'utf8');
const fixturePassword = readFileSync(new URL('../../scripts/certification/fixturePassword.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const seed = readFileSync(new URL('../../scripts/seed-test-users.mjs', import.meta.url), 'utf8');
const seedSql = readFileSync(new URL('../../scripts/certification/seed-test-data.sql', import.meta.url), 'utf8');
const playwright = readFileSync(new URL('../../playwright.config.js', import.meta.url), 'utf8');
const p0RealFlow = readFileSync(new URL('../../tests/e2e/p0-real-flow.spec.js', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../scripts/certification/playwrightPreflight.mjs', import.meta.url), 'utf8');
const legacySeed = readFileSync(new URL('../../seed.mjs', import.meta.url), 'utf8');
const f03 = readFileSync(new URL('../../scripts/verify-f03-scope-narrowing.mjs', import.meta.url), 'utf8');
const backfill = readFileSync(new URL('../migrations/backfillProgressHistory.js', import.meta.url), 'utf8');
const storageDelete = readFileSync(new URL('../../scripts/storage/deleteOrphans.mjs', import.meta.url), 'utf8');
const contract = JSON.parse(readFileSync(new URL('../../../scripts/contracts/canonical-security-contract.json', import.meta.url), 'utf8'));
const contractorWorkspaceFixture = readFileSync(new URL('../../scripts/certification/contractorWorkspaceFixtures.mjs', import.meta.url), 'utf8');
const migrationFiles = readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql') && !f.endsWith('.test.sql'));

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
check('local Contractor-Managed Scope Synchronization extension pins and verifies the approved 056 RLS helper ACL migration, hash-pinned', contractorManagedScopeSyncLocal.includes('056_restrict_rls_helper_function_acl.sql') && /056_restrict_rls_helper_function_acl\.sql', '[a-f0-9]{64}'/.test(contractorManagedScopeSyncLocal));
check('056 follows 055 in the local extension order', contractorManagedScopeSyncLocal.indexOf('055_restrict_contractor_schedule_function_acl.sql') < contractorManagedScopeSyncLocal.indexOf('056_restrict_rls_helper_function_acl.sql'));
check('056 revokes anon, authenticated, AND service_role EXECUTE from all three RLS helper functions before re-granting authenticated (clears any pre-existing WITH GRANT OPTION - a plain GRANT does not narrow one - and keeps service_role explicit, not implicit/default-dependent, deterministic across live-Supabase, ACL-stripped-restore, and fresh-local-migration paths)', [
  /REVOKE ALL ON FUNCTION public\.can_admin_company\(text\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
  /REVOKE ALL ON FUNCTION public\.can_create_project\(text\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
  /REVOKE ALL ON FUNCTION public\.can_write_project\(bigint\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
].every(pattern => pattern.test(rlsHelperAcl056)));
check('056 grants EXECUTE to authenticated only for all three RLS helper functions', [
  /GRANT EXECUTE ON FUNCTION public\.can_admin_company\(text\)\s+TO authenticated;/,
  /GRANT EXECUTE ON FUNCTION public\.can_create_project\(text\)\s+TO authenticated;/,
  /GRANT EXECUTE ON FUNCTION public\.can_write_project\(bigint\)\s+TO authenticated;/,
].every(pattern => pattern.test(rlsHelperAcl056)));
check('056 never grants EXECUTE to anon, PUBLIC, or service_role', !/TO (anon|PUBLIC|service_role)[,;]/.test(rlsHelperAcl056.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')));
check('local Contractor-Managed Scope Synchronization extension pins and verifies the approved 057 Part-5 table/sequence ACL bridge migration, hash-pinned', contractorManagedScopeSyncLocal.includes('057_part5_table_sequence_acl_bridge.sql') && /057_part5_table_sequence_acl_bridge\.sql', '[a-f0-9]{64}'/.test(contractorManagedScopeSyncLocal));
check('057 follows 056 in the local extension order', contractorManagedScopeSyncLocal.indexOf('056_restrict_rls_helper_function_acl.sql') < contractorManagedScopeSyncLocal.indexOf('057_part5_table_sequence_acl_bridge.sql'));
check('local Contractor-Managed Scope Synchronization extension pins and verifies the approved 058 atomic-write reconciliation migration, hash-pinned', contractorManagedScopeSyncLocal.includes('058_reconcile_atomic_write_security_and_contractor_rpc.sql') && /058_reconcile_atomic_write_security_and_contractor_rpc\.sql', '[a-f0-9]{64}'/.test(contractorManagedScopeSyncLocal));
check('058 follows 057 in the local extension order', contractorManagedScopeSyncLocal.indexOf('057_part5_table_sequence_acl_bridge.sql') < contractorManagedScopeSyncLocal.indexOf('058_reconcile_atomic_write_security_and_contractor_rpc.sql'));
check('058 local-path source replaces only the canonical contractor RPC body, not the site-visit body',
  /CREATE OR REPLACE FUNCTION public\.submit_contractor_report_atomic/.test(atomicWriteReconciliation058) &&
  !/CREATE OR REPLACE FUNCTION public\.submit_site_visit_atomic/.test(atomicWriteReconciliation058));
check('057 revokes ALL on all 15 Part-5 tables from PUBLIC, anon, authenticated, and service_role before re-granting (deterministic regardless of pre-existing/default ACL state)', [
  'public.audit_log', 'public.contractor_report_wps', 'public.contractor_reports', 'public.pending_invites',
  'public.profiles', 'public.progress_history', 'public.project_gantt_tasks', 'public.projects', 'public.reports',
  'public.site_visit_discrepancies', 'public.site_visit_wps', 'public.site_visits', 'public.task_group_members',
  'public.task_groups', 'public.templates',
].every(tbl => new RegExp(`REVOKE ALL ON[\\s\\S]{0,600}\\b${tbl.replace('.', '\\.')}\\b[\\s\\S]{0,500}FROM PUBLIC, anon, authenticated, service_role;`).test(part5Bridge057)));
check('057 grants authenticated SELECT/INSERT/UPDATE/DELETE on the 14 non-audit_log tables (026\'s already-audited scope, unchanged)', [
  'public.contractor_report_wps', 'public.contractor_reports', 'public.pending_invites', 'public.profiles',
  'public.progress_history', 'public.project_gantt_tasks', 'public.projects', 'public.reports',
  'public.site_visit_discrepancies', 'public.site_visit_wps', 'public.site_visits', 'public.task_group_members',
  'public.task_groups', 'public.templates',
].every(tbl => new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON[\\s\\S]{0,600}\\b${tbl.replace('.', '\\.')}\\b[\\s\\S]{0,500}TO authenticated;`).test(part5Bridge057)));
check('057 grants authenticated SELECT-only on audit_log', /GRANT SELECT ON public\.audit_log TO authenticated;/.test(part5Bridge057));
check('057 grants service_role exactly the evidence-backed per-table privileges (projects: full CRUD; project_gantt_tasks: S/I/D; progress_history: I/D; reports: S-only; 5 tables: D-only) and nothing on the other 6', [
  { re: /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.projects TO service_role;/, expect: true },
  { re: /GRANT SELECT, INSERT, DELETE ON public\.project_gantt_tasks TO service_role;/, expect: true },
  { re: /GRANT INSERT, DELETE ON public\.progress_history TO service_role;/, expect: true },
  { re: /GRANT SELECT ON public\.reports TO service_role;/, expect: true },
].every(({ re, expect }) => re.test(part5Bridge057) === expect)
  && /GRANT DELETE ON[\s\S]{0,300}TO service_role;/.test(part5Bridge057)
  && (() => {
    const deleteOnlyGrant = part5Bridge057.match(/GRANT DELETE ON([\s\S]*?)TO service_role;/);
    if (!deleteOnlyGrant) return false;
    const grantedList = deleteOnlyGrant[1];
    return ['contractor_report_wps', 'contractor_reports', 'site_visit_discrepancies', 'site_visit_wps', 'site_visits']
      .every(tbl => grantedList.includes(tbl));
  })()
  && ['public.audit_log', 'public.profiles', 'public.pending_invites', 'public.task_groups', 'public.task_group_members', 'public.templates']
    .every(tbl => !new RegExp(`GRANT[\\s\\S]{0,300}\\b${tbl.replace('.', '\\.')}\\b[\\s\\S]{0,100}TO service_role;`).test(part5Bridge057)));
check('057 grants service_role column-level SELECT (id) only - not table-wide SELECT - on exactly the 6 tables whose only service-role DELETE/INSERT filters on id with no RETURNING (PostgreSQL DELETE requires SELECT on any column its condition reads; proven empirically, not assumed)', (() => {
  const columnGrant = part5Bridge057.match(/GRANT SELECT \(id\) ON([\s\S]*?)TO service_role;/);
  if (!columnGrant) return false;
  const grantedList = columnGrant[1];
  const expectedGranted = ['contractor_report_wps', 'contractor_reports', 'progress_history', 'site_visit_discrepancies', 'site_visit_wps', 'site_visits'];
  const expectedNotGranted = ['audit_log', 'profiles', 'pending_invites', 'task_groups', 'task_group_members', 'templates'];
  if (!expectedGranted.every(tbl => grantedList.includes(tbl))) return false;
  if (!expectedNotGranted.every(tbl => !grantedList.includes(tbl))) return false;
  const otherServiceRoleGrants = [...part5Bridge057.matchAll(/GRANT [^;]+;/g)]
    .map(m => m[0])
    .filter(stmt => stmt !== columnGrant[0] && /TO service_role;/.test(stmt) && /^GRANT SELECT\b/.test(stmt));
  return expectedGranted.every(tbl => otherServiceRoleGrants.every(stmt => !stmt.includes(tbl)));
})());
check('057 never grants TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN to anyone (zero observed need for any of the 15 tables)', !/GRANT[\s\S]*?(TRUNCATE|REFERENCES|TRIGGER|MAINTAIN)/.test(part5Bridge057.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')));
check('057 never grants anything to anon or PUBLIC', !/TO (anon|PUBLIC)[,;]/.test(part5Bridge057.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')));
check('057 revokes ALL on all 10 associated sequences from PUBLIC, anon, authenticated, and service_role before re-granting', [
  'public.audit_log_id_seq', 'public.contractor_report_wps_id_seq', 'public.contractor_reports_id_seq',
  'public.progress_history_id_seq', 'public.project_gantt_tasks_id_seq', 'public.projects_id_seq',
  'public.reports_id_seq', 'public.site_visit_discrepancies_id_seq', 'public.site_visit_wps_id_seq',
  'public.site_visits_id_seq',
].every(seq => new RegExp(`REVOKE ALL ON SEQUENCE[\\s\\S]{0,600}\\b${seq.replace('.', '\\.')}\\b[\\s\\S]{0,400}FROM PUBLIC, anon, authenticated, service_role;`).test(part5Bridge057)));
check('057 grants authenticated USAGE-only (never SELECT/UPDATE) on the 9 non-audit_log sequences, and nothing on audit_log_id_seq', (() => {
  const usageGrant = part5Bridge057.match(/GRANT USAGE ON SEQUENCE([\s\S]*?)TO authenticated;/);
  if (!usageGrant) return false;
  const grantedList = usageGrant[1];
  return !/audit_log_id_seq/.test(grantedList)
    && ['contractor_report_wps_id_seq', 'contractor_reports_id_seq', 'progress_history_id_seq', 'project_gantt_tasks_id_seq', 'projects_id_seq', 'reports_id_seq', 'site_visit_discrepancies_id_seq', 'site_visit_wps_id_seq', 'site_visits_id_seq']
      .every(seq => grantedList.includes(seq));
})());
check('057 grants service_role USAGE-only (never SELECT/UPDATE) on exactly the 3 sequences backing a table it actually INSERTs into without an explicit id, nothing on the other 7', (() => {
  const expectedGranted = ['progress_history_id_seq', 'project_gantt_tasks_id_seq', 'projects_id_seq'];
  const expectedNotGranted = ['audit_log_id_seq', 'contractor_report_wps_id_seq', 'contractor_reports_id_seq', 'reports_id_seq', 'site_visit_discrepancies_id_seq', 'site_visit_wps_id_seq', 'site_visits_id_seq'];
  const allGrantStatements = [...part5Bridge057.matchAll(/GRANT [^;]+;/g)].map(m => m[0]);
  const sequenceGrantsToServiceRole = allGrantStatements.filter(stmt => /ON SEQUENCE/.test(stmt) && /TO service_role;/.test(stmt));
  if (sequenceGrantsToServiceRole.length !== 1) return false;
  const grantedList = sequenceGrantsToServiceRole[0];
  return expectedGranted.every(seq => grantedList.includes(seq))
    && expectedNotGranted.every(seq => !grantedList.includes(seq))
    && /^GRANT USAGE ON SEQUENCE/.test(grantedList);
})());
check('local Contractor-Managed Scope Synchronization hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(contractorManagedScopeSyncLocal));
check('Contractor-Managed Scope Synchronization reset keeps every prior extension explicit, same precedent as cert:reset:contractor-managed-project',
  packageJson.scripts['cert:reset:contractor-managed-scope-sync'] === 'npm run cert:reset:contractor-managed-project && node scripts/certification/applyContractorManagedScopeSyncLocal.mjs');
check('local Work Ontology extension uses the guarded certification environment before psql',
  workOntologyFoundationLocal.indexOf("from './env.mjs'") < workOntologyFoundationLocal.indexOf("execFileSync('psql'"));
check('local Work Ontology extension pins and verifies migration 060',
  workOntologyFoundationLocal.includes('060_work_ontology_foundation.sql')
  && /const expected = '[a-f0-9]{64}'/.test(workOntologyFoundationLocal));
check('local Work Ontology hash verification is stable across Windows CRLF checkouts',
  /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(workOntologyFoundationLocal));
check('Work Ontology reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:work-ontology'] === 'npm run cert:reset:r1-reporting:local && node scripts/certification/applyWorkOntologyFoundationLocal.mjs');
check('local project Work Ontology extension pins and verifies migration 061',
  projectWorkOntologyScopeLocal.includes('061_project_work_ontology_scope.sql')
  && /const expected = '[a-f0-9]{64}'/.test(projectWorkOntologyScopeLocal));
check('project Work Ontology reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:project-work-ontology'] === 'npm run cert:reset:work-ontology && node scripts/certification/applyProjectWorkOntologyScopeLocal.mjs');
check('local Work Group reporting extension pins and verifies migration 062',
  workGroupReportingCompatibilityLocal.includes('062_work_group_reporting_compatibility.sql')
  && /const expected = '[a-f0-9]{64}'/.test(workGroupReportingCompatibilityLocal));
check('Work Group reporting reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:work-group-reporting'] === 'npm run cert:reset:project-work-ontology && node scripts/certification/applyWorkGroupReportingCompatibilityLocal.mjs');
check('local Project Execution Scope extension pins and verifies migration 063',
  projectExecutionScopeLocal.includes('063_project_execution_scope_foundation.sql')
  && /const expected = '[a-f0-9]{64}'/.test(projectExecutionScopeLocal));
check('Project Execution Scope reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:project-execution-scope'] === 'npm run cert:reset:work-group-reporting && node scripts/certification/applyProjectExecutionScopeLocal.mjs');
check('local Contractor Schedule Setup extension pins and verifies migration 064',
  contractorScheduleSetupLocal.includes('064_contractor_schedule_setup.sql')
  && /const expected = '[a-f0-9]{64}'/.test(contractorScheduleSetupLocal));
check('Contractor Schedule Setup reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:contractor-schedule-setup'] === 'npm run cert:reset:project-execution-scope && node scripts/certification/applyContractorScheduleSetupLocal.mjs');
check('local Gantt Baseline Scope Snapshot extension pins and verifies migration 065',
  ganttBaselineScopeSnapshotLocal.includes('065_gantt_baseline_scope_snapshot.sql')
  && /const expected = '[a-f0-9]{64}'/.test(ganttBaselineScopeSnapshotLocal));
check('Gantt Baseline Scope Snapshot reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:gantt-baseline-snapshot'] === 'npm run cert:reset:contractor-schedule-setup && node scripts/certification/applyGanttBaselineScopeSnapshotLocal.mjs');
check('local PM Schedule Baseline Approval extension pins and verifies migration 066',
  pmScheduleBaselineApprovalLocal.includes('066_pm_schedule_baseline_approval.sql')
  && /const expected = '[a-f0-9]{64}'/.test(pmScheduleBaselineApprovalLocal));
check('PM Schedule Baseline Approval reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:pm-baseline-approval'] === 'npm run cert:reset:gantt-baseline-snapshot && node scripts/certification/applyPmScheduleBaselineApprovalLocal.mjs');
check('local Project BOQ Foundation extension pins and verifies migration 067',
  projectBoqFoundationLocal.includes('067_project_boq_foundation.sql')
  && /const expected = '[a-f0-9]{64}'/.test(projectBoqFoundationLocal));
check('local Project BOQ Foundation hash verification is stable across Windows CRLF checkouts',
  /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(projectBoqFoundationLocal));
check('Project BOQ Foundation reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:project-boq-foundation'] === 'npm run cert:reset:pm-baseline-approval && node scripts/certification/applyProjectBoqFoundationLocal.mjs');
check('local Project BOQ Work Group Aggregation extension pins and verifies migration 068',
  projectBoqWorkGroupAggregationLocal.includes('068_project_boq_work_group_aggregation.sql')
  && /const expected = '[a-f0-9]{64}'/.test(projectBoqWorkGroupAggregationLocal));
check('local Project BOQ Work Group Aggregation hash verification is stable across Windows CRLF checkouts',
  /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(projectBoqWorkGroupAggregationLocal));
check('Project BOQ Work Group Aggregation reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:project-boq-work-group-aggregation'] === 'npm run cert:reset:project-boq-foundation && node scripts/certification/applyProjectBoqWorkGroupAggregationLocal.mjs');
check('local Project BOQ Standard/Custom Items extension pins and verifies migration 069',
  projectBoqStandardCustomItemsLocal.includes('069_project_boq_standard_custom_items.sql')
  && /const expected = '[a-f0-9]{64}'/.test(projectBoqStandardCustomItemsLocal));
check('local Project BOQ Standard/Custom Items hash verification is stable across Windows CRLF checkouts',
  /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(projectBoqStandardCustomItemsLocal));
check('Project BOQ Standard/Custom Items reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:project-boq-standard-custom-items'] === 'npm run cert:reset:project-boq-work-group-aggregation && node scripts/certification/applyProjectBoqStandardCustomItemsLocal.mjs');
check('local Project BOQ -> Execution Scope Mapping extension pins and verifies migration 070',
  projectBoqExecutionScopeMappingLocal.includes('070_project_boq_execution_scope_mapping.sql')
  && /const expected = '[a-f0-9]{64}'/.test(projectBoqExecutionScopeMappingLocal));
check('local Project BOQ -> Execution Scope Mapping hash verification is stable across Windows CRLF checkouts',
  /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(projectBoqExecutionScopeMappingLocal));
check('Project BOQ -> Execution Scope Mapping reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:project-boq-execution-scope-mapping'] === 'npm run cert:reset:project-boq-standard-custom-items && node scripts/certification/applyProjectBoqExecutionScopeMappingLocal.mjs');
check('local Project BOQ Excel Compatibility extension pins and verifies migration 071',
  projectBoqExcelCompatibilityLocal.includes('071_project_boq_excel_compatibility.sql')
  && /const expected = '[a-f0-9]{64}'/.test(projectBoqExcelCompatibilityLocal));
check('local Project BOQ Excel Compatibility hash verification is stable across Windows CRLF checkouts',
  /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(projectBoqExcelCompatibilityLocal));
check('Project BOQ Excel Compatibility reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:project-boq-excel-compatibility'] === 'npm run cert:reset:project-boq-execution-scope-mapping && node scripts/certification/applyProjectBoqExcelCompatibilityLocal.mjs');
check('local Tender Setup extension pins and verifies migration 072',
  tenderSetupLocal.includes('072_tender_setup.sql') && /const expected = '[a-f0-9]{64}'/.test(tenderSetupLocal));
check('local Tender Setup hash verification is stable across Windows CRLF checkouts',
  /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(tenderSetupLocal));
check('Tender Setup reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:tender-setup'] === 'npm run cert:reset:project-boq-excel-compatibility && node scripts/certification/applyTenderSetupLocal.mjs');
check('local Tender Bidder Access extension pins and verifies migration 073',
  tenderBidderAccessLocal.includes('073_tender_bidder_access.sql') && /const expected = '[a-f0-9]{64}'/.test(tenderBidderAccessLocal));
check('local Tender Bidder Access hash verification is stable across Windows CRLF checkouts',
  /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(tenderBidderAccessLocal));
check('Tender Bidder Access reset keeps the complete prior extension chain explicit',
  packageJson.scripts['cert:reset:tender-bidder-access'] === 'npm run cert:reset:tender-setup && node scripts/certification/applyTenderBidderAccessLocal.mjs');
check('local Tender Bid Rounds extension pins and verifies migration 074', tenderBidRoundsLocal.includes('074_tender_bid_rounds.sql') && /const expected = '[a-f0-9]{64}'/.test(tenderBidRoundsLocal));
check('local PM Bid Review extension pins and verifies migration 075', tenderPmBidReviewLocal.includes('075_tender_pm_bid_review.sql') && /const expected='[a-f0-9]{64}'/.test(tenderPmBidReviewLocal));
check('local Tender Clarification Register extension pins and verifies migration 076', tenderClarificationRegisterLocal.includes('076_tender_clarification_register.sql') && /const expected='[a-f0-9]{64}'/.test(tenderClarificationRegisterLocal));
check('local Tender Comparison extension pins and verifies migration 077', tenderComparisonLocal.includes('077_tender_comparison_read_model.sql') && /const expected='[a-f0-9]{64}'/.test(tenderComparisonLocal));
check('local Tender Award extension pins and verifies migration 078', tenderAwardLocal.includes('078_tender_award.sql') && /const expected='[a-f0-9]{64}'/.test(tenderAwardLocal));
check('local Awarded BOQ Execution Scope extension pins and verifies migration 079', awardedExecutionScopeLocal.includes('079_awarded_boq_execution_scope.sql') && /const expected='[a-f0-9]{64}'/.test(awardedExecutionScopeLocal));
check('local Departmental Budget extension pins and verifies migration 080', departmentalBudgetLocal.includes('080_collaborative_departmental_budget.sql') && /const expected\s*=\s*'[a-f0-9]{64}'/.test(departmentalBudgetLocal));
check('local Budget Ownership extension pins and verifies migration 081', budgetOwnershipLocal.includes('081_budget_ownership_notifications.sql') && /const expected\s*=\s*'[a-f0-9]{64}'/.test(budgetOwnershipLocal));
check('local Budget Rounds extension pins and verifies migration 082', budgetRoundsLocal.includes('082_budget_rounds.sql') && /const expected\s*=\s*'[a-f0-9]{64}'/.test(budgetRoundsLocal));
check('local Budget Approval extension pins and verifies migration 083', budgetApprovalLocal.includes('083_budget_approval_workflow.sql') && /const expected\s*=\s*'[a-f0-9]{64}'/.test(budgetApprovalLocal));
check('local Budget vs Tender extension pins and verifies migration 084', budgetVsTenderLocal.includes('084_budget_vs_tender.sql') && /const expected='[a-f0-9]{64}'/.test(budgetVsTenderLocal));
check('local Budget Approval Report extension pins and verifies migration 085', budgetApprovalReportLocal.includes('085_budget_approval_report.sql') && /const expected='[a-f0-9]{64}'/.test(budgetApprovalReportLocal));
check('local Project Variations extension pins and verifies migration 086', projectVariationsLocal.includes('086_project_variations.sql') && /const expected='[a-f0-9]{64}'/.test(projectVariationsLocal));
check('Project Variations reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:project-variations'] === 'npm run cert:reset:budget-approval-report && node scripts/certification/applyProjectVariationsLocal.mjs');
check('local Biweekly Commercial Review extension pins and verifies migration 087', biweeklyCommercialReviewLocal.includes('087_biweekly_commercial_review.sql') && /const expected='[a-f0-9]{64}'/.test(biweeklyCommercialReviewLocal));
check('Biweekly Commercial Review reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:biweekly-commercial-review'] === 'npm run cert:reset:project-variations && node scripts/certification/applyBiweeklyCommercialReviewLocal.mjs');
check('local Approved vs Pending Exposure extension pins and verifies migration 088', approvedVsPendingExposureLocal.includes('088_approved_vs_pending_exposure.sql') && /const expected='[a-f0-9]{64}'/.test(approvedVsPendingExposureLocal));
check('Approved vs Pending Exposure reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:approved-vs-pending-exposure'] === 'npm run cert:reset:biweekly-commercial-review && node scripts/certification/applyApprovedVsPendingExposureLocal.mjs');
check('local Forecast Engine extension pins and verifies migration 089', forecastEngineLocal.includes('089_forecast_engine.sql') && /const expected='[a-f0-9]{64}'/.test(forecastEngineLocal));
check('Forecast Engine reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:forecast-engine'] === 'npm run cert:reset:approved-vs-pending-exposure && node scripts/certification/applyForecastEngineLocal.mjs');
check('local Commercial Health extension pins and verifies migration 090', commercialHealthLocal.includes('090_commercial_health.sql') && /const expected='[a-f0-9]{64}'/.test(commercialHealthLocal));
check('Commercial Health reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:commercial-health'] === 'npm run cert:reset:forecast-engine && node scripts/certification/applyCommercialHealthLocal.mjs');
check('local Payment Schedule extension pins and verifies migration 091', paymentScheduleLocal.includes('091_payment_schedule.sql') && /const expected='[a-f0-9]{64}'/.test(paymentScheduleLocal));
check('Payment Schedule reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:payment-schedule'] === 'npm run cert:reset:commercial-health && node scripts/certification/applyPaymentScheduleLocal.mjs');
check('local Payment Notifications extension pins and verifies migration 092', paymentNotificationsLocal.includes('092_payment_milestone_notifications.sql') && /const expected='[a-f0-9]{64}'/.test(paymentNotificationsLocal));
check('local Payment Certification Evidence extension pins and verifies migration 093', paymentCertificationEvidenceLocal.includes('093_payment_certification_evidence.sql') && /const expected='[a-f0-9]{64}'/.test(paymentCertificationEvidenceLocal));
check('local Payment Certification Decisions extension pins and verifies migration 094', paymentCertificationDecisionsLocal.includes('094_payment_certification_decisions.sql') && /const expected='[a-f0-9]{64}'/.test(paymentCertificationDecisionsLocal));
check('local Payment Paid Tracking extension pins and verifies migration 095', paymentPaidTrackingLocal.includes('095_payment_paid_tracking.sql') && /const expected='[a-f0-9]{64}'/.test(paymentPaidTrackingLocal));
check('local Payment Retention extension pins and verifies migration 096', paymentRetentionLocal.includes('096_payment_retention.sql') && /const expected='[a-f0-9]{64}'/.test(paymentRetentionLocal));
check('local Project Cost Closeout extension pins and verifies migration 097', projectCostCloseoutLocal.includes('097_project_cost_closeout.sql') && /const expected='[a-f0-9]{64}'/.test(projectCostCloseoutLocal));
check('local Project Schedule Closeout extension pins and verifies migration 098', projectScheduleCloseoutLocal.includes('098_project_schedule_closeout.sql') && /const expected='[a-f0-9]{64}'/.test(projectScheduleCloseoutLocal));
check('local Project Scope Closeout extension pins and verifies migration 099', projectScopeCloseoutLocal.includes('099_project_scope_closeout.sql') && /const expected='[a-f0-9]{64}'/.test(projectScopeCloseoutLocal));
check('local Project Quality Closeout extension pins and verifies migration 100', projectQualityCloseoutLocal.includes('100_project_quality_closeout.sql') && /const expected='[a-f0-9]{64}'/.test(projectQualityCloseoutLocal));
check('local Roadmap Completion extension pins migrations 101-110', ['101_project_variation_closeout.sql','102_project_payment_closeout.sql','103_project_lessons_learned.sql','104_contractor_scorecard.sql','105_immutable_historical_project_record.sql','106_historical_project_intelligence.sql','107_verified_management_outputs.sql','108_variation_evidence_storage_acl.sql','109_contractor_report_snapshot_digest_path.sql','110_enforce_project_currency.sql'].every(file=>roadmapCompletionLocal.includes(file))&&/createHash\('sha256'\)/.test(roadmapCompletionLocal));
check('Roadmap Completion reset keeps the complete prior extension chain explicit',packageJson.scripts['cert:reset:roadmap-completion']==='npm run cert:reset:project-quality-closeout && node scripts/certification/applyRoadmapCompletionLocal.mjs');
check('Payment Notifications reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:payment-notifications'] === 'npm run cert:reset:payment-schedule && node scripts/certification/applyPaymentMilestoneNotificationsLocal.mjs');
check('local Tender Bid Rounds hash verification is stable across Windows CRLF checkouts', /replace\(\/\\r\\n\/g, ['"]\\n['"]\)/.test(tenderBidRoundsLocal));
check('Tender Bid Rounds reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:tender-bid-rounds'] === 'npm run cert:reset:tender-bidder-access && node scripts/certification/applyTenderBidRoundsLocal.mjs');
check('PM Bid Review reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:tender-pm-bid-review'] === 'npm run cert:reset:tender-bid-rounds && node scripts/certification/applyTenderPmBidReviewLocal.mjs');
check('Tender Clarification Register reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:tender-clarification-register'] === 'npm run cert:reset:tender-pm-bid-review && node scripts/certification/applyTenderClarificationRegisterLocal.mjs');
check('Tender Comparison reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:tender-comparison'] === 'npm run cert:reset:tender-clarification-register && node scripts/certification/applyTenderComparisonLocal.mjs');
check('Tender Award reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:tender-award'] === 'npm run cert:reset:tender-comparison && node scripts/certification/applyTenderAwardLocal.mjs');
check('Awarded Execution Scope reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:awarded-execution-scope'] === 'npm run cert:reset:tender-award && node scripts/certification/applyAwardedBoqExecutionScopeLocal.mjs');
check('Departmental Budget reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:departmental-budget'] === 'npm run cert:reset:awarded-execution-scope && node scripts/certification/applyCollaborativeDepartmentalBudgetLocal.mjs');
check('Budget Ownership reset keeps the complete prior extension chain explicit', packageJson.scripts['cert:reset:budget-ownership'] === 'npm run cert:reset:departmental-budget && node scripts/certification/applyBudgetOwnershipNotificationsLocal.mjs');

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
const r1ReportingPersistenceBatchFiles = [...r1ReportingPersistenceLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const workOntologyFoundationBatchFiles = [...workOntologyFoundationLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectWorkOntologyScopeBatchFiles = [...projectWorkOntologyScopeLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const workGroupReportingCompatibilityBatchFiles = [...workGroupReportingCompatibilityLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectExecutionScopeBatchFiles = [...projectExecutionScopeLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const contractorScheduleSetupBatchFiles = [...contractorScheduleSetupLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const ganttBaselineScopeSnapshotBatchFiles = [...ganttBaselineScopeSnapshotLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const pmScheduleBaselineApprovalBatchFiles = [...pmScheduleBaselineApprovalLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectBoqFoundationBatchFiles = [...projectBoqFoundationLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectBoqWorkGroupAggregationBatchFiles = [...projectBoqWorkGroupAggregationLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectBoqStandardCustomItemsBatchFiles = [...projectBoqStandardCustomItemsLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectBoqExecutionScopeMappingBatchFiles = [...projectBoqExecutionScopeMappingLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectBoqExcelCompatibilityBatchFiles = [...projectBoqExcelCompatibilityLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderSetupBatchFiles = [...tenderSetupLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderBidderAccessBatchFiles = [...tenderBidderAccessLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderBidRoundsBatchFiles = [...tenderBidRoundsLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderPmBidReviewBatchFiles = [...tenderPmBidReviewLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderClarificationRegisterBatchFiles = [...tenderClarificationRegisterLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderComparisonBatchFiles = [...tenderComparisonLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderAwardBatchFiles = [...tenderAwardLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const awardedExecutionScopeBatchFiles = [...awardedExecutionScopeLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const departmentalBudgetBatchFiles = [...departmentalBudgetLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const budgetOwnershipBatchFiles = [...budgetOwnershipLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const budgetRoundsBatchFiles = [...budgetRoundsLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const budgetApprovalBatchFiles = [...budgetApprovalLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const budgetVsTenderBatchFiles = [...budgetVsTenderLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const budgetApprovalReportBatchFiles = [...budgetApprovalReportLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectVariationsBatchFiles = [...projectVariationsLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const biweeklyCommercialReviewBatchFiles = [...biweeklyCommercialReviewLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const approvedVsPendingExposureBatchFiles = [...approvedVsPendingExposureLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const forecastEngineBatchFiles = [...forecastEngineLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const commercialHealthBatchFiles = [...commercialHealthLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const paymentScheduleBatchFiles = [...paymentScheduleLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const paymentNotificationsBatchFiles = [...paymentNotificationsLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const paymentCertificationEvidenceBatchFiles = [...paymentCertificationEvidenceLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const paymentCertificationDecisionsBatchFiles = [...paymentCertificationDecisionsLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const paymentPaidTrackingBatchFiles = [...paymentPaidTrackingLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const paymentRetentionBatchFiles = [...paymentRetentionLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectCostCloseoutBatchFiles = [...projectCostCloseoutLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectScheduleCloseoutBatchFiles = [...projectScheduleCloseoutLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectScopeCloseoutBatchFiles = [...projectScopeCloseoutLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectQualityCloseoutBatchFiles = [...projectQualityCloseoutLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const roadmapCompletionBatchFiles = [...roadmapCompletionLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const budgetBoqScopeBatchFiles = [...budgetBoqScopeLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const budgetIndependentBoqBatchFiles = [...budgetIndependentBoqLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const boqLabourMaterialPricingBatchFiles = [...boqLabourMaterialPricingLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const boqContractorConsultantQuantitiesBatchFiles = [...boqContractorConsultantQuantitiesLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const boqOptionalContractorQuantityBatchFiles = [...boqOptionalContractorQuantityLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderInvitationEmailBatchFiles = [...tenderInvitationEmailLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const tenderCommercialRoadmapBatchFiles = [...tenderCommercialRoadmapLocal.matchAll(/\['(\d{3}_[a-z0-9_]+\.sql)',/g)].map(m => m[1]);
const projectAccessAlignmentBatchFiles = [...projectAccessAlignmentLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const canonicalFinancialSourcesBatchFiles = [...canonicalFinancialSourcesLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const paymentCommitmentScopeBatchFiles = [...paymentCommitmentScopeLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const architectureIntegrityBatchFiles = [...architectureIntegrityMigrations.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const procurementStrategyBatchFiles = [...procurementStrategyLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const projectTeamDepartmentsBatchFiles = [...projectTeamDepartmentsLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const securityDefinerExecuteHardeningBatchFiles = [...securityDefinerExecuteHardeningLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const securityAdvisorHardeningBatchFiles = [...securityAdvisorHardeningLocal.matchAll(/['"](\d{3}_[a-z0-9_]+\.sql)['"]/g)].map(m => m[1]);
const coveredSet = new Set([...contract.canonicalMigrationPath.included, ...snagBatchFiles, ...contractorReportLegacyWpScopeBatchFiles, ...importFoundationPhase2BatchFiles, ...masterCatalogSchemaV2BatchFiles, ...masterCatalogSlice5DBatchFiles, ...masterCatalogWeightCalibrationBatchFiles, ...masterCatalogDurationCalibrationBatchFiles, ...contractorScheduleDraftFoundationBatchFiles, ...createContractorManagedProjectBatchFiles, ...contractorManagedScopeSyncBatchFiles, ...r1ReportingPersistenceBatchFiles, ...workOntologyFoundationBatchFiles, ...projectWorkOntologyScopeBatchFiles, ...workGroupReportingCompatibilityBatchFiles, ...projectExecutionScopeBatchFiles, ...contractorScheduleSetupBatchFiles, ...ganttBaselineScopeSnapshotBatchFiles, ...pmScheduleBaselineApprovalBatchFiles, ...projectBoqFoundationBatchFiles, ...projectBoqWorkGroupAggregationBatchFiles, ...projectBoqStandardCustomItemsBatchFiles, ...projectBoqExecutionScopeMappingBatchFiles, ...projectBoqExcelCompatibilityBatchFiles, ...tenderSetupBatchFiles, ...tenderBidderAccessBatchFiles, ...tenderBidRoundsBatchFiles, ...tenderPmBidReviewBatchFiles, ...tenderClarificationRegisterBatchFiles, ...tenderComparisonBatchFiles, ...tenderAwardBatchFiles, ...awardedExecutionScopeBatchFiles, ...departmentalBudgetBatchFiles, ...budgetOwnershipBatchFiles, ...budgetRoundsBatchFiles, ...budgetApprovalBatchFiles, ...budgetVsTenderBatchFiles, ...budgetApprovalReportBatchFiles, ...projectVariationsBatchFiles, ...biweeklyCommercialReviewBatchFiles, ...approvedVsPendingExposureBatchFiles, ...forecastEngineBatchFiles, ...commercialHealthBatchFiles, ...paymentScheduleBatchFiles, ...paymentNotificationsBatchFiles, ...paymentCertificationEvidenceBatchFiles, ...paymentCertificationDecisionsBatchFiles, ...paymentPaidTrackingBatchFiles, ...paymentRetentionBatchFiles, ...projectCostCloseoutBatchFiles, ...projectScheduleCloseoutBatchFiles, ...projectScopeCloseoutBatchFiles, ...projectQualityCloseoutBatchFiles, ...roadmapCompletionBatchFiles, ...budgetBoqScopeBatchFiles, ...budgetIndependentBoqBatchFiles, ...boqLabourMaterialPricingBatchFiles, ...boqContractorConsultantQuantitiesBatchFiles, ...boqOptionalContractorQuantityBatchFiles, ...tenderInvitationEmailBatchFiles, ...tenderCommercialRoadmapBatchFiles, ...projectAccessAlignmentBatchFiles, ...canonicalFinancialSourcesBatchFiles, ...paymentCommitmentScopeBatchFiles, ...architectureIntegrityBatchFiles, ...procurementStrategyBatchFiles]);
projectTeamDepartmentsBatchFiles.forEach(file => coveredSet.add(file));
securityDefinerExecuteHardeningBatchFiles.forEach(file => coveredSet.add(file));
securityAdvisorHardeningBatchFiles.forEach(file => coveredSet.add(file));
check('fresh-install migration set is exactly covered through security hardening migration 147, no gaps',
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
check('migrations 053-058 are covered by the Contractor-Managed Scope Synchronization batch (guards against this check being vacuously true)', contractorManagedScopeSyncBatchFiles.length >= 6);
check('migration 059 is covered by the R1 Reporting Persistence extension (guards against this check being vacuously true)', r1ReportingPersistenceBatchFiles.length === 1 && r1ReportingPersistenceBatchFiles[0] === '059_reporting_evidence_provenance.sql');
check('migration 060 is covered by the Work Ontology extension (guards against this check being vacuously true)', workOntologyFoundationBatchFiles.length === 1 && workOntologyFoundationBatchFiles[0] === '060_work_ontology_foundation.sql');
check('migration 061 is covered by the project Work Ontology extension (guards against this check being vacuously true)', projectWorkOntologyScopeBatchFiles.length === 1 && projectWorkOntologyScopeBatchFiles[0] === '061_project_work_ontology_scope.sql');
check('migration 062 is covered by the Work Group reporting extension (guards against this check being vacuously true)', workGroupReportingCompatibilityBatchFiles.length === 1 && workGroupReportingCompatibilityBatchFiles[0] === '062_work_group_reporting_compatibility.sql');
check('migration 063 is covered by the Project Execution Scope extension (guards against this check being vacuously true)', projectExecutionScopeBatchFiles.length === 1 && projectExecutionScopeBatchFiles[0] === '063_project_execution_scope_foundation.sql');
check('migration 064 is covered by the Contractor Schedule Setup extension (guards against this check being vacuously true)', contractorScheduleSetupBatchFiles.length === 1 && contractorScheduleSetupBatchFiles[0] === '064_contractor_schedule_setup.sql');
check('migration 065 is covered by the Gantt Baseline Scope Snapshot extension (guards against this check being vacuously true)', ganttBaselineScopeSnapshotBatchFiles.length === 1 && ganttBaselineScopeSnapshotBatchFiles[0] === '065_gantt_baseline_scope_snapshot.sql');
check('migration 066 is covered by the PM Schedule Baseline Approval extension (guards against this check being vacuously true)', pmScheduleBaselineApprovalBatchFiles.length === 1 && pmScheduleBaselineApprovalBatchFiles[0] === '066_pm_schedule_baseline_approval.sql');
check('migration 067 is covered by the Project BOQ Foundation extension (guards against this check being vacuously true)', projectBoqFoundationBatchFiles.length === 1 && projectBoqFoundationBatchFiles[0] === '067_project_boq_foundation.sql');
check('migration 068 is covered by the Project BOQ Work Group Aggregation extension (guards against this check being vacuously true)', projectBoqWorkGroupAggregationBatchFiles.length === 1 && projectBoqWorkGroupAggregationBatchFiles[0] === '068_project_boq_work_group_aggregation.sql');
check('migration 069 is covered by the Project BOQ Standard/Custom Items extension (guards against this check being vacuously true)', projectBoqStandardCustomItemsBatchFiles.length === 1 && projectBoqStandardCustomItemsBatchFiles[0] === '069_project_boq_standard_custom_items.sql');
check('migration 070 is covered by the Project BOQ -> Execution Scope Mapping extension (guards against this check being vacuously true)', projectBoqExecutionScopeMappingBatchFiles.length === 1 && projectBoqExecutionScopeMappingBatchFiles[0] === '070_project_boq_execution_scope_mapping.sql');
check('migration 071 is covered by the Project BOQ Excel Compatibility extension (guards against this check being vacuously true)', projectBoqExcelCompatibilityBatchFiles.length === 1 && projectBoqExcelCompatibilityBatchFiles[0] === '071_project_boq_excel_compatibility.sql');
check('migration 072 is covered by the Tender Setup extension (guards against this check being vacuously true)', tenderSetupBatchFiles.length === 1 && tenderSetupBatchFiles[0] === '072_tender_setup.sql');
check('migration 073 is covered by the Tender Bidder Access extension (guards against this check being vacuously true)', tenderBidderAccessBatchFiles.length === 1 && tenderBidderAccessBatchFiles[0] === '073_tender_bidder_access.sql');
check('migration 074 is covered by the Tender Bid Rounds extension (guards against this check being vacuously true)', tenderBidRoundsBatchFiles.length === 1 && tenderBidRoundsBatchFiles[0] === '074_tender_bid_rounds.sql');
check('migration 075 is covered by the PM Bid Review extension (guards against this check being vacuously true)', tenderPmBidReviewBatchFiles.length === 1 && tenderPmBidReviewBatchFiles[0] === '075_tender_pm_bid_review.sql');
check('migration 076 is covered by the Tender Clarification Register extension (guards against this check being vacuously true)', tenderClarificationRegisterBatchFiles.length === 1 && tenderClarificationRegisterBatchFiles[0] === '076_tender_clarification_register.sql');
check('migration 077 is covered by the Tender Comparison extension (guards against this check being vacuously true)', tenderComparisonBatchFiles.length === 1 && tenderComparisonBatchFiles[0] === '077_tender_comparison_read_model.sql');
check('migration 078 is covered by the Tender Award extension (guards against this check being vacuously true)', tenderAwardBatchFiles.length === 1 && tenderAwardBatchFiles[0] === '078_tender_award.sql');
check('migration 079 is covered by the Awarded BOQ Execution Scope extension (guards against this check being vacuously true)', awardedExecutionScopeBatchFiles.length === 1 && awardedExecutionScopeBatchFiles[0] === '079_awarded_boq_execution_scope.sql');
check('migration 080 is covered by the Departmental Budget extension (guards against this check being vacuously true)', departmentalBudgetBatchFiles.length === 1 && departmentalBudgetBatchFiles[0] === '080_collaborative_departmental_budget.sql');
check('migration 081 is covered by the Budget Ownership extension (guards against this check being vacuously true)', budgetOwnershipBatchFiles.length === 1 && budgetOwnershipBatchFiles[0] === '081_budget_ownership_notifications.sql');
check('migration 082 is covered by the Budget Rounds extension (guards against this check being vacuously true)', budgetRoundsBatchFiles.length === 1 && budgetRoundsBatchFiles[0] === '082_budget_rounds.sql');
check('migration 083 is covered by the Budget Approval extension (guards against this check being vacuously true)', budgetApprovalBatchFiles.length === 1 && budgetApprovalBatchFiles[0] === '083_budget_approval_workflow.sql');
check('migration 084 is covered by the Budget vs Tender extension (guards against this check being vacuously true)', budgetVsTenderBatchFiles.length === 1 && budgetVsTenderBatchFiles[0] === '084_budget_vs_tender.sql');
check('migration 085 is covered by the Budget Approval Report extension (guards against this check being vacuously true)', budgetApprovalReportBatchFiles.length === 1 && budgetApprovalReportBatchFiles[0] === '085_budget_approval_report.sql');
check('migration 086 is covered by the Project Variations extension (guards against this check being vacuously true)', projectVariationsBatchFiles.length === 1 && projectVariationsBatchFiles[0] === '086_project_variations.sql');
check('migration 087 is covered by the Biweekly Commercial Review extension (guards against this check being vacuously true)', biweeklyCommercialReviewBatchFiles.length === 1 && biweeklyCommercialReviewBatchFiles[0] === '087_biweekly_commercial_review.sql');
check('migration 088 is covered by the Approved vs Pending Exposure extension (guards against this check being vacuously true)', approvedVsPendingExposureBatchFiles.length === 1 && approvedVsPendingExposureBatchFiles[0] === '088_approved_vs_pending_exposure.sql');
check('migration 089 is covered by the Forecast Engine extension (guards against this check being vacuously true)', forecastEngineBatchFiles.length === 1 && forecastEngineBatchFiles[0] === '089_forecast_engine.sql');
check('migration 090 is covered by the Commercial Health extension (guards against this check being vacuously true)', commercialHealthBatchFiles.length === 1 && commercialHealthBatchFiles[0] === '090_commercial_health.sql');
check('migration 091 is covered by the Payment Schedule extension (guards against this check being vacuously true)', paymentScheduleBatchFiles.length === 1 && paymentScheduleBatchFiles[0] === '091_payment_schedule.sql');
check('migration 092 is covered by the Payment Notifications extension (guards against this check being vacuously true)', paymentNotificationsBatchFiles.length === 1 && paymentNotificationsBatchFiles[0] === '092_payment_milestone_notifications.sql');
check('migration 093 is covered by the Payment Certification Evidence extension (guards against this check being vacuously true)', paymentCertificationEvidenceBatchFiles.length === 1 && paymentCertificationEvidenceBatchFiles[0] === '093_payment_certification_evidence.sql');
check('migration 094 is covered by the Payment Certification Decisions extension (guards against this check being vacuously true)', paymentCertificationDecisionsBatchFiles.length === 1 && paymentCertificationDecisionsBatchFiles[0] === '094_payment_certification_decisions.sql');
check('migration 095 is covered by the Payment Paid Tracking extension (guards against this check being vacuously true)', paymentPaidTrackingBatchFiles.length === 1 && paymentPaidTrackingBatchFiles[0] === '095_payment_paid_tracking.sql');
check('migration 096 is covered by the Payment Retention extension (guards against this check being vacuously true)', paymentRetentionBatchFiles.length === 1 && paymentRetentionBatchFiles[0] === '096_payment_retention.sql');
check('migration 097 is covered by the Project Cost Closeout extension (guards against this check being vacuously true)', projectCostCloseoutBatchFiles.length === 1 && projectCostCloseoutBatchFiles[0] === '097_project_cost_closeout.sql');
check('migration 098 is covered by the Project Schedule Closeout extension (guards against this check being vacuously true)', projectScheduleCloseoutBatchFiles.length === 1 && projectScheduleCloseoutBatchFiles[0] === '098_project_schedule_closeout.sql');
check('migration 099 is covered by the Project Scope Closeout extension (guards against this check being vacuously true)', projectScopeCloseoutBatchFiles.length === 1 && projectScopeCloseoutBatchFiles[0] === '099_project_scope_closeout.sql');
check('migration 100 is covered by the Project Quality Closeout extension (guards against this check being vacuously true)', projectQualityCloseoutBatchFiles.length === 1 && projectQualityCloseoutBatchFiles[0] === '100_project_quality_closeout.sql');
check('migration 108 is covered by the Roadmap Completion extension (guards against this check being vacuously true)', roadmapCompletionBatchFiles.includes('108_variation_evidence_storage_acl.sql'));
check('migration 109 is covered by the Roadmap Completion extension (guards against this check being vacuously true)', roadmapCompletionBatchFiles.includes('109_contractor_report_snapshot_digest_path.sql'));
check('migration 110 is covered by the Roadmap Completion extension (guards against this check being vacuously true)', roadmapCompletionBatchFiles.includes('110_enforce_project_currency.sql'));
check('migration 111 is covered by the Budget -> BOQ extension', budgetBoqScopeBatchFiles.length === 1 && budgetBoqScopeBatchFiles[0] === '111_budget_boq_scope_and_standard_details.sql');
check('migration 112 is covered by the Budget-independent BOQ cleanup', budgetIndependentBoqBatchFiles.length === 1 && budgetIndependentBoqBatchFiles[0] === '112_budget_independent_boq.sql');
check('migration 113 is covered by BOQ Labour/Material pricing', boqLabourMaterialPricingBatchFiles.length === 1 && boqLabourMaterialPricingBatchFiles[0] === '113_boq_labour_material_pricing.sql');
check('migration 114 is covered by BOQ Contractor/Consultant quantities', boqContractorConsultantQuantitiesBatchFiles.length === 1 && boqContractorConsultantQuantitiesBatchFiles[0] === '114_boq_contractor_consultant_quantities.sql');
check('migration 115 is covered by optional Contractor quantity', boqOptionalContractorQuantityBatchFiles.length === 1 && boqOptionalContractorQuantityBatchFiles[0] === '115_boq_optional_contractor_quantity.sql');
check('migration 116 is covered by Tender invitation email', tenderInvitationEmailBatchFiles.length === 1 && tenderInvitationEmailBatchFiles[0] === '116_tender_invitation_email.sql');
check('migrations 117-132 are covered by the pinned Tender commercial roadmap extension', tenderCommercialRoadmapBatchFiles.length === 16 && tenderCommercialRoadmapBatchFiles[0].startsWith('117_') && tenderCommercialRoadmapBatchFiles.at(-1).startsWith('132_'));
check('migration 133 is covered by Project access alignment', projectAccessAlignmentBatchFiles.length === 1 && projectAccessAlignmentBatchFiles[0] === '133_project_access_alignment.sql');
check('migration 134 is covered by canonical financial sources', canonicalFinancialSourcesBatchFiles.length === 1 && canonicalFinancialSourcesBatchFiles[0] === '134_canonical_financial_sources.sql');
check('migration 135 is covered by Commitment-scoped Payments', paymentCommitmentScopeBatchFiles.length === 1 && paymentCommitmentScopeBatchFiles[0] === '135_payment_commitment_scope.sql');
check('migrations 133-143 are covered by the hash-pinned integrity upgrade', architectureIntegrityBatchFiles.length === 11 && architectureIntegrityBatchFiles[0].startsWith('133_') && architectureIntegrityBatchFiles.at(-1).startsWith('143_'));
check('migration 144 is covered by the hash-pinned Procurement Strategy upgrade', procurementStrategyBatchFiles.length === 1 && procurementStrategyBatchFiles[0] === '144_project_procurement_strategy.sql');
check('migration 145 is covered by the hash-pinned Project Team Department upgrade', projectTeamDepartmentsBatchFiles.length === 1 && projectTeamDepartmentsBatchFiles[0] === '145_project_team_department_assignment.sql');
check('migration 146 is covered by the hash-pinned Security Definer execute hardening upgrade', securityDefinerExecuteHardeningBatchFiles.length === 1 && securityDefinerExecuteHardeningBatchFiles[0] === '146_security_definer_execute_hardening.sql');
check('migration 147 is covered by the hash-pinned security advisor hardening upgrade', securityAdvisorHardeningBatchFiles.length === 1 && securityAdvisorHardeningBatchFiles[0] === '147_security_advisor_hardening.sql');
check('Security Definer execute hardening upgrade uses the local target guard before applying SQL', securityDefinerExecuteHardeningLocal.indexOf('assertLocalTarget') < securityDefinerExecuteHardeningLocal.indexOf("execFileSync('psql'"));
check('Security Definer execute hardening upgrade verifies SHA-256 before applying SQL', securityDefinerExecuteHardeningLocal.indexOf("createHash('sha256')") < securityDefinerExecuteHardeningLocal.indexOf("execFileSync('psql'"));
check('Security advisor hardening upgrade uses the local target guard before applying SQL', securityAdvisorHardeningLocal.indexOf('assertLocalTarget') < securityAdvisorHardeningLocal.indexOf("execFileSync('psql'"));
check('Security advisor hardening upgrade verifies SHA-256 before applying SQL', securityAdvisorHardeningLocal.indexOf("createHash('sha256')") < securityAdvisorHardeningLocal.indexOf("execFileSync('psql'"));
check('Project Team Department upgrade uses the local target guard before applying SQL', projectTeamDepartmentsLocal.indexOf('assertLocalTarget') < projectTeamDepartmentsLocal.indexOf("execFileSync('psql'"));
check('Project Team Department upgrade verifies SHA-256 before applying SQL', projectTeamDepartmentsLocal.indexOf("createHash('sha256')") < projectTeamDepartmentsLocal.indexOf("execFileSync('psql'"));
check('Procurement Strategy upgrade uses the local target guard before applying SQL', procurementStrategyLocal.indexOf('assertLocalTarget') < procurementStrategyLocal.indexOf("execFileSync('psql'"));
check('Procurement Strategy upgrade verifies SHA-256 before applying SQL', procurementStrategyLocal.indexOf("createHash('sha256')") < procurementStrategyLocal.indexOf("execFileSync('psql'"));
check('integrity upgrade uses the local target guard before applying SQL', architectureIntegrityLocal.indexOf('assertLocalTarget') < architectureIntegrityLocal.indexOf("execFileSync('psql'"));
check('integrity upgrade verifies SHA-256 before applying SQL', architectureIntegrityLocal.indexOf("createHash('sha256')") < architectureIntegrityLocal.indexOf("execFileSync('psql'"));
check('local DB deployment helper refuses invalid migration identities and verifies ledger SHA-256',
  /invalid migration identity/.test(localDbTarget) && /ledger hash mismatch/.test(localDbTarget));
check('integrity upgrade skips every already registered migration before applying SQL',
  /shouldApplyRegisteredMigration/.test(architectureIntegrityLocal)
    && architectureIntegrityLocal.indexOf('shouldApplyRegisteredMigration') < architectureIntegrityLocal.indexOf("execFileSync('psql'"));
check('Procurement Strategy upgrade skips a matching registered migration', /shouldApplyRegisteredMigration/.test(procurementStrategyLocal));
check('Project Team Department upgrade skips a matching registered migration', /shouldApplyRegisteredMigration/.test(projectTeamDepartmentsLocal));
check('Security Definer execute hardening upgrade skips a matching registered migration', /shouldApplyRegisteredMigration/.test(securityDefinerExecuteHardeningLocal));
check('Security advisor hardening upgrade skips a matching registered migration', /shouldApplyRegisteredMigration/.test(securityAdvisorHardeningLocal));
check('Tender Commercial E2E runner uses guarded local endpoints without downloading the Supabase CLI',
  /assertLocalTarget/.test(tenderCommercialE2ERunner)
    && !/supabase['"],\s*['"]status/.test(tenderCommercialE2ERunner)
    && !/SUPABASE_SERVICE_ROLE_KEY/.test(tenderCommercialE2ERunner));

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
check('P0 cleanup is guarded as local-only before direct PostgreSQL teardown',
  p0RealFlow.indexOf('assertLocalTarget') < p0RealFlow.indexOf('execFileSync(PSQL_BIN'));
check('P0 cleanup refuses to delete any project outside its exact generated fixture signature',
  p0RealFlow.includes("store_code LIKE 'P0E2E-%'")
    && p0RealFlow.includes("shopping_mall_name LIKE 'P0 E2E Mall %'")
    && p0RealFlow.includes("city = 'E2E City'")
    && p0RealFlow.includes("country = 'E2E Country'"));
check('P0 cleanup removes capability children before memberships and projects',
  p0RealFlow.indexOf('DELETE FROM public.project_team_membership_capabilities')
      < p0RealFlow.indexOf('DELETE FROM public.project_team_memberships')
    && p0RealFlow.indexOf('DELETE FROM public.project_team_memberships')
      < p0RealFlow.indexOf('DELETE FROM public.projects'));
check('P0 cleanup does not weaken or bypass the intentional API ACL for team capabilities',
  !p0RealFlow.includes(".from('project_team_membership_capabilities')"));
for (const [label, source] of [['legacy seed', legacySeed], ['F-03 verifier', f03], ['history backfill', backfill]]) {
  check(`${label} does not load .env.local`, !/loadDotEnv|loadEnv\(|readFileSync\([^)]*\.env\.local/.test(source));
  check(`${label} uses canonical local guard`, /assertLocalTarget/.test(source));
}
check('storage deletion requires explicit env before client construction', storageDelete.indexOf('requireEnv()') < storageDelete.indexOf('createClient(url'));
check('storage deletion is dry-run unless --execute is explicit', /args\.execute && toDelete\.length/.test(storageDelete));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
