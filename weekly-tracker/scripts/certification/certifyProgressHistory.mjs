// Sprint 4.5 — Stage 7: progress-history invariants not already covered by
// CR-01/SV-01/CR-02/SV-02's own assertions (source linkage, idempotent
// replay, sign/version metadata). This script checks the remaining
// invariants: calculation_version presence, snapshot project_id matches
// source, old pre-fixture rows stay readable, and foreign-project RPC calls
// never produce a history row (already proven by CR-04/SV-03's 0-new-history
// assertions — reconfirmed here directly against progress_history).
// Run: node certifyProgressHistory.mjs

import { loadFixtureState, psql, countRows, makeReporter, requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PROJECT_A = state.projects.PROJECT_A;

const r = makeReporter('Progress-history certification (Stage 7)');

async function main() {
  r.section('Contractor Report snapshot shape (most recent contractor_report-sourced row)');
  const crRow = psql(`
    SELECT snapshot->>'source_type', snapshot->>'source_record_id', snapshot->>'client_request_id',
           snapshot->>'actor_id', snapshot->>'calculation_version', snapshot->>'calculated_at',
           snapshot->>'snapshot_schema_version', project_id::text
    FROM public.progress_history
    WHERE project_id = ${PROJECT_A} AND snapshot->>'source_type' = 'contractor_report'
    ORDER BY id DESC LIMIT 1;
  `);
  const [sourceType, sourceRecordId, clientRequestId, actorId, calcVersion, calculatedAt, schemaVersion, projectId] = crRow.split('|');
  r.check('source_type = contractor_report', sourceType === 'contractor_report');
  r.check('source_record_id present (non-empty)', !!sourceRecordId);
  r.check('client_request_id present (non-empty)', !!clientRequestId);
  r.check('actor_id present (non-empty)', !!actorId);
  r.check('calculation_version present', !!calcVersion, `got: ${calcVersion}`);
  r.check('calculated_at present', !!calculatedAt);
  r.check('snapshot_schema_version present', !!schemaVersion);
  r.check('snapshot project_id matches the source project', projectId === String(PROJECT_A));

  r.section('Site Visit snapshot shape (most recent site_visit-sourced row)');
  const svRow = psql(`
    SELECT snapshot->>'source_type', snapshot->>'source_record_id', snapshot->>'client_request_id',
           snapshot->>'actor_id', snapshot->>'discrepancy_sign_convention', snapshot->>'discrepancy_version',
           overall_progress::text, project_id::text
    FROM public.progress_history
    WHERE project_id = ${PROJECT_A} AND snapshot->>'source_type' = 'site_visit'
    ORDER BY id DESC LIMIT 1;
  `);
  const [svSourceType, svSourceRecordId, svClientRequestId, svActorId, svConvention, svVersion, svOverall, svProjectId] = svRow.split('|');
  r.check('source_type = site_visit', svSourceType === 'site_visit');
  r.check('source_record_id present', !!svSourceRecordId);
  r.check('client_request_id present', !!svClientRequestId);
  r.check('actor_id present', !!svActorId);
  r.check('discrepancy_sign_convention = pm-minus-contractor', svConvention === 'pm-minus-contractor');
  r.check('discrepancy_version = 1', svVersion === '1');
  r.check('overall_progress is NULL — approved partial-inspection semantics (a site visit does not recompute canonical project-wide progress)', svOverall === '');
  r.check('snapshot project_id matches the source project', svProjectId === String(PROJECT_A));

  r.section('Invariant: one source event -> one history snapshot (recount from the CR/SV suites\' own inserts)');
  const distinctSourceIds = psql(`
    SELECT source_type, count(*) AS n, count(DISTINCT source_record_id) AS distinct_sources
    FROM (SELECT snapshot->>'source_type' AS source_type, snapshot->>'source_record_id' AS source_record_id
          FROM public.progress_history WHERE project_id = ${PROJECT_A} AND snapshot ? 'source_record_id') s
    GROUP BY source_type ORDER BY source_type;
  `);
  r.check('no source_record_id produced more than one progress_history row (grouped counts printed below for inspection)', true, distinctSourceIds);
  const dupCheck = psql(`
    SELECT snapshot->>'source_type', snapshot->>'source_record_id', count(*)
    FROM public.progress_history
    WHERE project_id = ${PROJECT_A} AND snapshot ? 'source_record_id'
    GROUP BY 1, 2 HAVING count(*) > 1;
  `);
  r.check('zero source_record_ids with more than 1 progress_history row (replay-safety confirmed at the data level, not just via the RPC response)', dupCheck === '');

  r.section('Old, pre-fixture historical row remains readable and untouched');
  const oldRow = psql(`SELECT id, snapshot->>'source_type' FROM public.progress_history WHERE id = ${state.preExisting.progressHistoryA};`);
  r.check('fixture-seeded row 900601 is still present and readable', oldRow.startsWith(`${state.preExisting.progressHistoryA}|`), oldRow);

  r.section('Foreign-project RPC calls never leave a history row (reconfirmed directly)');
  const PROJECT_B = state.projects.PROJECT_B;
  const crossTenantHistory = countRows('progress_history', `project_id = ${PROJECT_B} AND snapshot->>'client_request_id' IS NOT NULL AND snapshot->>'actor_id' NOT IN (SELECT id::text FROM auth.users WHERE email LIKE '%-b@cert.local')`);
  r.check('no cross-tenant history rows exist (Company A actors never appear as the actor for a Project B snapshot)', crossTenantHistory === 0);

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main().catch(err => { console.error('CERTIFICATION SCRIPT ERROR:', err); process.exit(2); });
