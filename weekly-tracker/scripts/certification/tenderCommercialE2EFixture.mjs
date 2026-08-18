import { execFileSync } from 'node:child_process';
import { assertLocalTarget } from './localTargetGuard.mjs';

export const TENDER_COMMERCIAL_E2E = Object.freeze({
  projectId: 900001,
  tenderId: 'e2e00000-0000-4000-8000-000000000001',
  primaryParticipantId: 'e2e00000-0000-4000-8000-000000000002',
  competitorParticipantId: 'e2e00000-0000-4000-8000-000000000003',
  tenderNumber: 'E2E-COMMERCIAL-T01',
  title: 'E2E Commercial Spine Tender',
  primaryContractor: 'E2E Primary Contractor',
  competitorContractor: 'E2E Hidden Competitor',
  primaryEmail: 'gc@openday.fit',
  competitorEmail: 'admin@construction.com',
  boqRevisionNote: 'E2E tender commercial fixture',
});

function target() {
  return assertLocalTarget({
    apiUrl: process.env.VITE_SUPABASE_URL,
    dbUrl: process.env.CERT_DB_URL,
    enabled: process.env.LOCAL_FIXTURE_MODE,
    projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
  });
}

function execute(sql, { tuplesOnly = false } = {}) {
  const { dbUrl } = target();
  const args = [dbUrl, '-v', 'ON_ERROR_STOP=1'];
  if (tuplesOnly) args.push('-tAc');
  else args.push('-c');
  args.push(sql);
  return execFileSync('psql', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const q = value => `'${String(value).replaceAll("'", "''")}'`;

export function cleanupTenderCommercialE2EFixture() {
  const fixture = TENDER_COMMERCIAL_E2E;
  execute(`
    SET session_replication_role = replica;

    DELETE FROM public.write_command_requests
    WHERE response->>'tenderId' = ${q(fixture.tenderId)}
       OR response->>'bidRoundId' IN (
         SELECT round.id::text FROM public.project_tender_bid_rounds round
         WHERE round.tender_id = ${q(fixture.tenderId)}::uuid
       );

    DELETE FROM public.project_tender_historical_bid_line_facts WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_historical_category_spreads WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_clarification_events
    WHERE clarification_id IN (
      SELECT id FROM public.project_tender_clarifications WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_tender_clarifications WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_clarification_sets WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_bid_reviews
    WHERE bid_submission_id IN (
      SELECT id FROM public.project_tender_bid_submissions WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_tender_bid_submission_items WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_bid_submissions WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_bid_draft_items WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_bid_drafts WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_commercial_baseline_events
    WHERE baseline_id IN (
      SELECT id FROM public.project_commercial_baselines WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_commercial_baseline_cost_packages
    WHERE baseline_id IN (
      SELECT id FROM public.project_commercial_baselines WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_tender_awarded_boq_items
    WHERE award_id IN (
      SELECT id FROM public.project_tender_awards WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_tender_awarded_work_groups
    WHERE award_id IN (
      SELECT id FROM public.project_tender_awards WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_commercial_baselines WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_awards WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_invitation_events WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_bidder_access WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_bid_rounds WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_participants WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_scope_work_groups WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_setup_versions WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_cost_packages WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tender_package_events WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_consultant_boq_events
    WHERE consultant_boq_id IN (
      SELECT id FROM public.project_consultant_boqs WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_consultant_boq_items
    WHERE consultant_boq_id IN (
      SELECT id FROM public.project_consultant_boqs WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_consultant_boq_versions
    WHERE consultant_boq_id IN (
      SELECT id FROM public.project_consultant_boqs WHERE tender_id = ${q(fixture.tenderId)}::uuid
    );
    DELETE FROM public.project_consultant_boqs WHERE tender_id = ${q(fixture.tenderId)}::uuid;
    DELETE FROM public.project_tenders WHERE id = ${q(fixture.tenderId)}::uuid;

    DELETE FROM public.project_boq_items
    WHERE boq_version_id IN (
      SELECT id FROM public.project_boq_versions WHERE revision_note = ${q(fixture.boqRevisionNote)}
    );
    DELETE FROM public.project_boq_versions WHERE revision_note = ${q(fixture.boqRevisionNote)};

    SET session_replication_role = origin;
  `);
}

export function setupTenderCommercialE2EFixture() {
  cleanupTenderCommercialE2EFixture();
  const fixture = TENDER_COMMERCIAL_E2E;
  execute(`
    DO $fixture$
    DECLARE
      source_setup public.project_tender_setup_versions%ROWTYPE;
      admin_id uuid;
      competitor_id uuid;
      fixture_boq_version_id bigint;
      fixture_setup_id bigint;
    BEGIN
      SELECT setup.* INTO STRICT source_setup
      FROM public.project_tender_setup_versions setup
      JOIN public.project_tenders tender ON tender.id = setup.tender_id
      JOIN public.project_tender_bid_rounds round
        ON round.tender_setup_version_id = setup.id AND round.status = 'OPEN'
      WHERE tender.tender_number = 'CERT-A1-T01'
      ORDER BY setup.revision_number DESC
      LIMIT 1;

      SELECT id INTO STRICT admin_id FROM public.profiles WHERE email = 'admin@openday.fit';
      SELECT id INTO STRICT competitor_id FROM public.profiles WHERE email = ${q(fixture.competitorEmail)};

      INSERT INTO public.project_boq_versions(
        boq_id, project_id, ontology_version_id, revision_number,
        source_kind, revision_note, created_by
      )
      SELECT source_setup.issued_boq_id, source_setup.project_id, source_setup.ontology_version_id,
        COALESCE((SELECT max(revision_number) + 1 FROM public.project_boq_versions WHERE boq_id = source_setup.issued_boq_id), 1),
        'SYSTEM', ${q(fixture.boqRevisionNote)}, admin_id
      RETURNING id INTO fixture_boq_version_id;

      INSERT INTO public.project_boq_items(
        boq_version_id, line_id, boq_id, project_id, ontology_version_id,
        work_group_id, item_kind, standard_definition_id, description, unit,
        quantity, unit_rate, contractor_note, reference, specification, sort_order,
        labour_rate, material_rate, consultant_quantity
      )
      SELECT fixture_boq_version_id, item.line_id, item.boq_id, item.project_id, item.ontology_version_id,
        item.work_group_id, item.item_kind, item.standard_definition_id, item.description, item.unit,
        item.quantity, item.unit_rate, item.contractor_note, item.reference, item.specification, item.sort_order,
        item.labour_rate, item.material_rate, 10::numeric
      FROM public.project_boq_items item
      WHERE item.boq_version_id = source_setup.issued_boq_version_id;

      INSERT INTO public.project_tenders(
        id, project_id, ontology_version_id, tender_number, status, created_by,
        procurement_method, boq_mode, commercial_revision, created_at
      ) VALUES (
        ${q(fixture.tenderId)}::uuid, source_setup.project_id, source_setup.ontology_version_id,
        ${q(fixture.tenderNumber)}, 'DRAFT', admin_id,
        'COMPETITIVE_TENDER', 'CONTRACTOR_MEASURED', 1, timestamptz '2000-01-01 00:00:00+00'
      );

      INSERT INTO public.project_tender_setup_versions(
        tender_id, project_id, ontology_version_id, revision_number, title,
        deadline_at, currency_code, tender_rules, invitation_message,
        issued_boq_id, issued_boq_version_id, created_by
      ) VALUES (
        ${q(fixture.tenderId)}::uuid, source_setup.project_id, source_setup.ontology_version_id, 1,
        ${q(fixture.title)}, timestamptz '2099-12-31 12:00:00+00', source_setup.currency_code,
        'All rates must include labour and material. State every exclusion explicitly.',
        'Please review this E2E tender invitation and accept it before opening the commercial package.',
        source_setup.issued_boq_id, fixture_boq_version_id, admin_id
      ) RETURNING id INTO fixture_setup_id;

      INSERT INTO public.project_tender_scope_work_groups(
        tender_setup_version_id, tender_id, project_id, ontology_version_id, work_group_id
      )
      SELECT fixture_setup_id, ${q(fixture.tenderId)}::uuid, source_setup.project_id,
        source_setup.ontology_version_id, scope.work_group_id
      FROM public.project_tender_scope_work_groups scope
      WHERE scope.tender_setup_version_id = source_setup.id;

      INSERT INTO public.project_tender_participants(
        tender_setup_version_id, tender_id, project_id, ontology_version_id,
        participant_id, contractor_name, contact_email
      ) VALUES
        (fixture_setup_id, ${q(fixture.tenderId)}::uuid, source_setup.project_id, source_setup.ontology_version_id,
          ${q(fixture.primaryParticipantId)}::uuid, ${q(fixture.primaryContractor)}, ${q(fixture.primaryEmail)}),
        (fixture_setup_id, ${q(fixture.tenderId)}::uuid, source_setup.project_id, source_setup.ontology_version_id,
          ${q(fixture.competitorParticipantId)}::uuid, ${q(fixture.competitorContractor)}, ${q(fixture.competitorEmail)});

      INSERT INTO public.project_tender_bidder_access(
        tender_id, participant_id, tender_setup_version_id, project_id, ontology_version_id,
        invited_email, contractor_name, bidder_user_id, status, invited_by, email_sent_at
      ) VALUES
        (${q(fixture.tenderId)}::uuid, ${q(fixture.primaryParticipantId)}::uuid, fixture_setup_id,
          source_setup.project_id, source_setup.ontology_version_id, ${q(fixture.primaryEmail)},
          ${q(fixture.primaryContractor)}, NULL, 'INVITED', admin_id, now()),
        (${q(fixture.tenderId)}::uuid, ${q(fixture.competitorParticipantId)}::uuid, fixture_setup_id,
          source_setup.project_id, source_setup.ontology_version_id, ${q(fixture.competitorEmail)},
          ${q(fixture.competitorContractor)}, competitor_id, 'ACCEPTED', admin_id, now());

      INSERT INTO public.project_tender_bid_rounds(
        tender_id, tender_setup_version_id, project_id, ontology_version_id,
        round_number, status, deadline_at, opened_by
      ) VALUES (
        ${q(fixture.tenderId)}::uuid, fixture_setup_id, source_setup.project_id,
        source_setup.ontology_version_id, 1, 'OPEN', timestamptz '2099-12-31 12:00:00+00', admin_id
      );
    END;
    $fixture$;
  `);

  return readTenderCommercialE2EState();
}

export function setTenderCommercialE2EBoqMode(mode) {
  if (!['CONTRACTOR_MEASURED', 'CONSULTANT_MEASURED'].includes(mode)) {
    throw new Error(`Unsupported E2E BOQ mode: ${mode}`);
  }
  execute(`UPDATE public.project_tenders SET boq_mode = ${q(mode)} WHERE id = ${q(TENDER_COMMERCIAL_E2E.tenderId)}::uuid;`);
}

export function readTenderCommercialE2EState() {
  const fixture = TENDER_COMMERCIAL_E2E;
  const output = execute(`
    SELECT jsonb_build_object(
      'tenderCount', (SELECT count(*) FROM public.project_tenders WHERE id = ${q(fixture.tenderId)}::uuid),
      'boqMode', (SELECT boq_mode FROM public.project_tenders WHERE id = ${q(fixture.tenderId)}::uuid),
      'roundId', (SELECT id FROM public.project_tender_bid_rounds WHERE tender_id = ${q(fixture.tenderId)}::uuid),
      'invitationStatus', (SELECT status FROM public.project_tender_bidder_access WHERE tender_id = ${q(fixture.tenderId)}::uuid AND participant_id = ${q(fixture.primaryParticipantId)}::uuid),
      'invitationEvents', (SELECT COALESCE(jsonb_agg(event_type ORDER BY id), '[]'::jsonb) FROM public.project_tender_invitation_events WHERE tender_id = ${q(fixture.tenderId)}::uuid AND participant_id = ${q(fixture.primaryParticipantId)}::uuid),
      'draftRevision', (SELECT revision FROM public.project_tender_bid_drafts WHERE tender_id = ${q(fixture.tenderId)}::uuid AND participant_id = ${q(fixture.primaryParticipantId)}::uuid),
      'submissionCount', (SELECT count(*) FROM public.project_tender_bid_submissions WHERE tender_id = ${q(fixture.tenderId)}::uuid AND participant_id = ${q(fixture.primaryParticipantId)}::uuid),
      'submittedTotal', (SELECT total FROM public.project_tender_bid_submissions WHERE tender_id = ${q(fixture.tenderId)}::uuid AND participant_id = ${q(fixture.primaryParticipantId)}::uuid ORDER BY submitted_at DESC LIMIT 1)
    );
  `, { tuplesOnly: true });
  return JSON.parse(output);
}
