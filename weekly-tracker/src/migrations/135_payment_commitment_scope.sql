-- 135_payment_commitment_scope.sql
-- A Payment Schedule belongs to one explicit commercial Commitment and Cost
-- Package. Project-wide "latest award" inference is no longer permitted.

BEGIN;

-- Remove the dependent foreign key before rebuilding its referenced unique
-- key. This order makes the migration safely repeatable during upgrade
-- certification.
ALTER TABLE public.project_payment_schedules
  DROP CONSTRAINT IF EXISTS project_payment_schedules_commitment_fk;
ALTER TABLE public.project_commercial_commitments
  DROP CONSTRAINT IF EXISTS project_commercial_commitments_identity_key;
ALTER TABLE public.project_commercial_commitments
  ADD CONSTRAINT project_commercial_commitments_identity_key
  UNIQUE(id, project_id, cost_package_id);

ALTER TABLE public.project_payment_schedules
  ADD COLUMN IF NOT EXISTS commitment_id uuid,
  ADD COLUMN IF NOT EXISTS cost_package_id uuid;

-- A historical single-award schedule can be aligned automatically only when
-- that award produced exactly one Commitment. Ambiguous history is retained
-- as legacy data and is surfaced by the read model instead of guessed.
UPDATE public.project_payment_schedules schedule
SET commitment_id = candidate.id,
    cost_package_id = candidate.cost_package_id
FROM public.project_commercial_commitments candidate
WHERE schedule.commitment_id IS NULL
  AND schedule.award_id = candidate.source_award_id
  AND 1 = (
    SELECT count(*)
    FROM public.project_commercial_commitments match
    WHERE match.source_award_id = schedule.award_id
  );

ALTER TABLE public.project_payment_schedules
  ALTER COLUMN award_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS project_payment_schedules_project_id_version_number_key;
ALTER TABLE public.project_payment_schedules
  ADD CONSTRAINT project_payment_schedules_commitment_fk
  FOREIGN KEY(commitment_id, project_id, cost_package_id)
  REFERENCES public.project_commercial_commitments(id, project_id, cost_package_id)
  ON DELETE RESTRICT;

DROP INDEX IF EXISTS public.project_payment_schedule_one_draft_idx;
DROP INDEX IF EXISTS public.project_payment_schedule_one_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS project_payment_schedule_commitment_version_idx
  ON public.project_payment_schedules(commitment_id, version_number)
  WHERE commitment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_payment_schedule_one_draft_per_commitment_idx
  ON public.project_payment_schedules(commitment_id)
  WHERE status = 'DRAFT' AND commitment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_payment_schedule_one_active_per_commitment_idx
  ON public.project_payment_schedules(commitment_id)
  WHERE status = 'ACTIVE' AND commitment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_payment_schedules_cost_package_idx
  ON public.project_payment_schedules(project_id, cost_package_id);

DROP FUNCTION IF EXISTS public.get_project_payment_schedule(bigint);
DROP FUNCTION IF EXISTS public.get_project_payment_schedule(bigint,uuid);
CREATE FUNCTION public.get_project_payment_schedule(p_project_id bigint, p_commitment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_commitment public.project_commercial_commitments%ROWTYPE;
  v_schedule public.project_payment_schedules%ROWTYPE;
  v_commitments jsonb;
BEGIN
  SELECT upper(profile.role) INTO v_role FROM public.profiles profile WHERE profile.id = v_uid;
  IF v_uid IS NULL OR public.can_access_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_SCHEDULE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'commitmentId', commitment.id,
    'costPackageId', commitment.cost_package_id,
    'costPackageCode', package.code,
    'costPackageName', package.name,
    'sourceKind', commitment.source_kind,
    'sourceReference', commitment.source_reference,
    'counterpartyName', commitment.counterparty_name,
    'currencyCode', commitment.currency_code,
    'contractValue', commitment.committed_value
  ) ORDER BY package.code, commitment.created_at, commitment.id), '[]'::jsonb)
  INTO v_commitments
  FROM public.project_commercial_commitments commitment
  JOIN public.project_cost_packages package ON package.id = commitment.cost_package_id
  WHERE commitment.project_id = p_project_id;

  IF p_commitment_id IS NOT NULL THEN
    SELECT * INTO v_commitment
    FROM public.project_commercial_commitments
    WHERE id = p_commitment_id AND project_id = p_project_id;
  ELSE
    SELECT commitment.* INTO v_commitment
    FROM public.project_commercial_commitments commitment
    JOIN public.project_cost_packages package ON package.id = commitment.cost_package_id
    WHERE commitment.project_id = p_project_id
    ORDER BY package.code, commitment.created_at, commitment.id
    LIMIT 1;
  END IF;

  IF p_commitment_id IS NOT NULL AND v_commitment.id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_commitment.id IS NOT NULL THEN
    SELECT * INTO v_schedule
    FROM public.project_payment_schedules
    WHERE project_id = p_project_id AND commitment_id = v_commitment.id
    ORDER BY (status = 'DRAFT') DESC, version_number DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'role', v_role,
    'canManage', v_role IN ('PM', 'ADMIN') AND public.can_write_project(p_project_id),
    'hasCommitment', v_commitment.id IS NOT NULL,
    'commitments', v_commitments,
    'selectedCommitmentId', v_commitment.id,
    'commitment', CASE WHEN v_commitment.id IS NULL THEN NULL ELSE jsonb_build_object(
      'commitmentId', v_commitment.id,
      'costPackageId', v_commitment.cost_package_id,
      'sourceKind', v_commitment.source_kind,
      'sourceReference', v_commitment.source_reference,
      'counterpartyName', v_commitment.counterparty_name,
      'currencyCode', v_commitment.currency_code,
      'contractValue', v_commitment.committed_value
    ) END,
    'legacyUnmappedScheduleCount', (
      SELECT count(*) FROM public.project_payment_schedules
      WHERE project_id = p_project_id AND commitment_id IS NULL
    ),
    'schedule', CASE WHEN v_schedule.id IS NULL THEN NULL ELSE jsonb_build_object(
      'paymentScheduleId', v_schedule.id,
      'commitmentId', v_schedule.commitment_id,
      'costPackageId', v_schedule.cost_package_id,
      'versionNumber', v_schedule.version_number,
      'mode', v_schedule.mode,
      'status', v_schedule.status,
      'currencyCode', v_schedule.currency_code,
      'contractValue', v_schedule.contract_value,
      'scheduledPercentage', v_schedule.scheduled_percentage,
      'scheduledAmount', v_schedule.scheduled_amount,
      'unallocatedPercentage', 100 - v_schedule.scheduled_percentage,
      'milestones', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'milestoneId', milestone.id,
          'sequenceNumber', milestone.sequence_number,
          'title', milestone.title,
          'plannedDate', milestone.planned_date,
          'percentage', milestone.percentage,
          'plannedAmount', milestone.planned_amount,
          'condition', milestone.condition,
          'status', milestone.status
        ) ORDER BY milestone.sequence_number)
        FROM public.project_payment_milestones milestone
        WHERE milestone.payment_schedule_id = v_schedule.id
      ), '[]'::jsonb)
    ) END
  );
END;
$$;

DROP FUNCTION IF EXISTS public.save_project_payment_schedule(bigint,uuid,text,jsonb,uuid);
DROP FUNCTION IF EXISTS public.save_project_payment_schedule(bigint,uuid,uuid,text,jsonb,uuid);
CREATE FUNCTION public.save_project_payment_schedule(
  p_project_id bigint,
  p_commitment_id uuid,
  p_schedule_id uuid,
  p_mode text,
  p_milestones jsonb,
  p_client_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_commitment public.project_commercial_commitments%ROWTYPE;
  v_schedule public.project_payment_schedules%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_total_pct numeric;
  v_total_amount numeric;
  v_next_version integer;
  v_result jsonb;
  v_row jsonb;
  v_ids uuid[] := '{}';
BEGIN
  SELECT upper(profile.role) INTO v_role FROM public.profiles profile WHERE profile.id = v_uid;
  IF v_uid IS NULL OR v_role NOT IN ('PM', 'ADMIN') OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_SCHEDULE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_commitment FROM public.project_commercial_commitments
  WHERE id = p_commitment_id AND project_id = p_project_id;
  IF v_commitment.id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_SCHEDULE_REQUIRES_COMMITMENT' USING ERRCODE = '55000';
  END IF;
  IF p_schedule_id IS NULL OR p_client_request_id IS NULL
    OR p_mode NOT IN ('MILESTONE', 'MEASURED_BOQ')
    OR jsonb_typeof(p_milestones) <> 'array' OR jsonb_array_length(p_milestones) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_SCHEDULE_COMMAND' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES(v_uid, 'payment_schedule.save', p_client_request_id, p_project_id)
  ON CONFLICT(actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'payment_schedule.save' AND client_request_id = p_client_request_id;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_commitment_id::text, 0));
  SELECT * INTO v_schedule FROM public.project_payment_schedules
  WHERE commitment_id = p_commitment_id AND status = 'DRAFT' FOR UPDATE;
  IF v_schedule.id IS NOT NULL AND v_schedule.id <> p_schedule_id THEN
    RAISE EXCEPTION 'PAYMENT_SCHEDULE_DRAFT_ID_CONFLICT' USING ERRCODE = '23505';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_milestones) LOOP
    IF (v_row->>'milestoneId') IS NULL
      OR COALESCE((v_row->>'percentage')::numeric, 0) <= 0
      OR btrim(COALESCE(v_row->>'title', '')) = ''
      OR btrim(COALESCE(v_row->>'condition', '')) = ''
      OR (v_row->>'plannedDate') IS NULL
      OR (v_row->>'milestoneId')::uuid = ANY(v_ids) THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_MILESTONE' USING ERRCODE = '22023';
    END IF;
    v_ids := array_append(v_ids, (v_row->>'milestoneId')::uuid);
  END LOOP;
  SELECT sum((value->>'percentage')::numeric) INTO v_total_pct FROM jsonb_array_elements(p_milestones);
  IF v_total_pct > 100 THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_PERCENT_EXCEEDS_100' USING ERRCODE = '23514'; END IF;
  v_total_amount := round(v_commitment.committed_value * v_total_pct / 100, 2);

  IF v_schedule.id IS NULL THEN
    SELECT COALESCE(max(version_number), 0) + 1 INTO v_next_version
    FROM public.project_payment_schedules WHERE commitment_id = p_commitment_id;
    INSERT INTO public.project_payment_schedules(
      id, project_id, award_id, version_number, mode, status, currency_code,
      contract_value, scheduled_percentage, scheduled_amount, created_by,
      commitment_id, cost_package_id
    ) VALUES(
      p_schedule_id, p_project_id, v_commitment.source_award_id, v_next_version,
      p_mode, 'DRAFT', v_commitment.currency_code, v_commitment.committed_value,
      v_total_pct, v_total_amount, v_uid, v_commitment.id, v_commitment.cost_package_id
    );
  ELSE
    DELETE FROM public.project_payment_milestones WHERE payment_schedule_id = v_schedule.id;
    UPDATE public.project_payment_schedules
    SET mode = p_mode, scheduled_percentage = v_total_pct, scheduled_amount = v_total_amount
    WHERE id = v_schedule.id;
  END IF;

  INSERT INTO public.project_payment_milestones(
    id, payment_schedule_id, project_id, sequence_number, title, planned_date,
    percentage, planned_amount, condition
  )
  SELECT (value->>'milestoneId')::uuid, p_schedule_id, p_project_id, ordinality,
    btrim(value->>'title'), (value->>'plannedDate')::date,
    (value->>'percentage')::numeric,
    round(v_commitment.committed_value * (value->>'percentage')::numeric / 100, 2),
    btrim(value->>'condition')
  FROM jsonb_array_elements(p_milestones) WITH ORDINALITY AS item(value, ordinality);

  v_result := jsonb_build_object(
    'paymentScheduleId', p_schedule_id, 'commitmentId', p_commitment_id,
    'costPackageId', v_commitment.cost_package_id,
    'scheduledPercentage', v_total_pct, 'scheduledAmount', v_total_amount,
    'unallocatedPercentage', 100 - v_total_pct,
    'milestoneCount', jsonb_array_length(p_milestones)
  );
  UPDATE public.write_command_requests SET response = v_result, completed_at = now() WHERE id = v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_project_payment_schedule(p_schedule_id uuid, p_client_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_schedule public.project_payment_schedules%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_schedule FROM public.project_payment_schedules WHERE id = p_schedule_id FOR UPDATE;
  SELECT upper(profile.role) INTO v_role FROM public.profiles profile WHERE profile.id = v_uid;
  IF v_schedule.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_schedule.commitment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_LEGACY_COMMITMENT_UNRESOLVED' USING ERRCODE = '55000'; END IF;
  IF v_uid IS NULL OR v_role NOT IN ('PM', 'ADMIN') OR public.can_write_project(v_schedule.project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_SCHEDULE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_schedule.status <> 'DRAFT' OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_SCHEDULE_NOT_DRAFT' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES(v_uid, 'payment_schedule.activate', p_client_request_id, v_schedule.project_id)
  ON CONFLICT(actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'payment_schedule.activate' AND client_request_id = p_client_request_id;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;
  UPDATE public.project_payment_schedules SET status = 'SUPERSEDED'
  WHERE commitment_id = v_schedule.commitment_id AND status = 'ACTIVE';
  UPDATE public.project_payment_schedules SET status = 'ACTIVE', activated_by = v_uid, activated_at = now()
  WHERE id = v_schedule.id;
  v_result := jsonb_build_object(
    'paymentScheduleId', v_schedule.id, 'commitmentId', v_schedule.commitment_id,
    'status', 'ACTIVE', 'scheduledPercentage', v_schedule.scheduled_percentage,
    'unallocatedPercentage', 100 - v_schedule.scheduled_percentage
  );
  UPDATE public.write_command_requests SET response = v_result, completed_at = now() WHERE id = v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

-- Project Payment Closeout is the aggregate of every explicitly scoped
-- Commitment schedule, not an arbitrary active schedule.
CREATE OR REPLACE FUNCTION public.save_project_payment_closeout(
  p_project_id bigint,
  p_closeout_id uuid,
  p_future_obligations text,
  p_payment_explanation text,
  p_confirm boolean,
  p_client_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_request public.write_command_requests%ROWTYPE;
  v_schedule_count integer;
  v_currency_count integer;
  v_contract numeric;
  v_certified numeric;
  v_paid numeric;
  v_released numeric;
  v_held numeric;
  v_outstanding numeric;
  v_currency text;
  v_terms_count integer;
  v_retention_percentage numeric;
  v_retention_status text;
  v_retention_condition text;
  v_version integer;
  v_state text;
  v_result jsonb;
BEGIN
  SELECT upper(profile.role) INTO v_role FROM public.profiles profile WHERE profile.id = v_uid;
  IF v_uid IS NULL OR v_role NOT IN ('PM', 'ADMIN') OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_PAYMENT_CLOSEOUT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_closeout_id IS NULL OR p_client_request_id IS NULL
    OR btrim(COALESCE(p_future_obligations, '')) = '' OR char_length(p_future_obligations) > 3000
    OR btrim(COALESCE(p_payment_explanation, '')) = '' OR char_length(p_payment_explanation) > 3000 THEN
    RAISE EXCEPTION 'INVALID_PROJECT_PAYMENT_CLOSEOUT' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES(v_uid, 'project_closeout.payment.save', p_client_request_id, p_project_id)
  ON CONFLICT(actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'project_closeout.payment.save' AND client_request_id = p_client_request_id;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;
  IF EXISTS(SELECT 1 FROM public.project_payment_closeout_versions WHERE project_id = p_project_id AND status = 'CONFIRMED') THEN
    RAISE EXCEPTION 'PROJECT_PAYMENT_CLOSEOUT_ALREADY_CONFIRMED' USING ERRCODE = '55000';
  END IF;

  SELECT count(*), count(DISTINCT schedule.currency_code), COALESCE(sum(schedule.contract_value), 0), min(schedule.currency_code)
  INTO v_schedule_count, v_currency_count, v_contract, v_currency
  FROM public.project_payment_schedules schedule
  WHERE schedule.project_id = p_project_id AND schedule.status = 'ACTIVE' AND schedule.commitment_id IS NOT NULL;
  IF v_schedule_count = 0 THEN
    RAISE EXCEPTION 'PAYMENT_CLOSEOUT_REQUIRES_PAYMENT_SCHEDULE' USING ERRCODE = '55000';
  END IF;
  IF v_currency_count <> 1 THEN
    RAISE EXCEPTION 'PAYMENT_CLOSEOUT_CURRENCY_MISMATCH' USING ERRCODE = '22023';
  END IF;

  WITH latest_decisions AS (
    SELECT DISTINCT ON(decision.certification_case_id)
      decision.certification_case_id, decision.certified_amount
    FROM public.project_payment_certification_decisions decision
    JOIN public.project_payment_certification_cases certification ON certification.id = decision.certification_case_id
    JOIN public.project_payment_milestones milestone ON milestone.id = certification.milestone_id
    JOIN public.project_payment_schedules schedule ON schedule.id = milestone.payment_schedule_id
    WHERE decision.project_id = p_project_id
      AND decision.decision_type IN ('FULL', 'PARTIAL')
      AND schedule.commitment_id IS NOT NULL
    ORDER BY decision.certification_case_id, decision.decision_number DESC
  )
  SELECT COALESCE(sum(certified_amount), 0) INTO v_certified FROM latest_decisions;

  SELECT COALESCE(sum(event.amount), 0) INTO v_paid
  FROM public.project_payment_tracking_events event
  JOIN public.project_payment_certification_cases certification ON certification.id = event.certification_case_id
  JOIN public.project_payment_milestones milestone ON milestone.id = certification.milestone_id
  JOIN public.project_payment_schedules schedule ON schedule.id = milestone.payment_schedule_id
  WHERE event.project_id = p_project_id AND event.event_type = 'PAYMENT_RECEIVED'
    AND schedule.commitment_id IS NOT NULL;

  SELECT COALESCE(sum(release.released_amount), 0) INTO v_released
  FROM public.project_payment_retention_releases release
  JOIN public.project_payment_retention_terms terms ON terms.id = release.retention_terms_id
  JOIN public.project_payment_schedules schedule ON schedule.id = terms.payment_schedule_id
  WHERE release.project_id = p_project_id AND schedule.commitment_id IS NOT NULL;

  WITH latest_decisions AS (
    SELECT DISTINCT ON(decision.certification_case_id)
      decision.certification_case_id, decision.certified_amount, milestone.payment_schedule_id
    FROM public.project_payment_certification_decisions decision
    JOIN public.project_payment_certification_cases certification ON certification.id = decision.certification_case_id
    JOIN public.project_payment_milestones milestone ON milestone.id = certification.milestone_id
    JOIN public.project_payment_schedules schedule ON schedule.id = milestone.payment_schedule_id
    WHERE decision.project_id = p_project_id
      AND decision.decision_type IN ('FULL', 'PARTIAL')
      AND schedule.commitment_id IS NOT NULL
    ORDER BY decision.certification_case_id, decision.decision_number DESC
  )
  SELECT greatest(COALESCE(sum(round(latest.certified_amount * COALESCE(terms.retention_percentage, 0) / 100, 2)), 0) - v_released, 0)
  INTO v_held
  FROM latest_decisions latest
  LEFT JOIN public.project_payment_retention_terms terms ON terms.payment_schedule_id = latest.payment_schedule_id;

  SELECT count(terms.id),
    CASE WHEN count(terms.id) = 1 THEN min(terms.retention_percentage) END,
    CASE WHEN count(terms.id) = 1 THEN min(terms.status) WHEN count(terms.id) > 1 THEN 'MULTIPLE' END,
    CASE WHEN count(terms.id) = 1 THEN min(terms.release_condition)
         WHEN count(terms.id) > 1 THEN 'Multiple commitments; see package payment schedules.' ELSE '' END
  INTO v_terms_count, v_retention_percentage, v_retention_status, v_retention_condition
  FROM public.project_payment_schedules schedule
  LEFT JOIN public.project_payment_retention_terms terms ON terms.payment_schedule_id = schedule.id
  WHERE schedule.project_id = p_project_id AND schedule.status = 'ACTIVE' AND schedule.commitment_id IS NOT NULL;

  v_outstanding := greatest(v_certified - v_paid, 0);
  SELECT COALESCE(max(version_number), 0) + 1 INTO v_version
  FROM public.project_payment_closeout_versions WHERE project_id = p_project_id;
  v_state := CASE WHEN COALESCE(p_confirm, false) THEN 'CONFIRMED' ELSE 'DRAFT' END;
  INSERT INTO public.project_payment_closeout_versions(
    id, project_id, version_number, status, contract_value, certified_value,
    paid_value, retention_held, outstanding_value, currency_code,
    retention_percentage, retention_status, retention_release_condition,
    future_obligations, payment_explanation, created_by
  ) VALUES(
    p_closeout_id, p_project_id, v_version, v_state, v_contract, v_certified,
    v_paid, v_held, v_outstanding, v_currency, v_retention_percentage,
    v_retention_status, v_retention_condition, btrim(p_future_obligations),
    btrim(p_payment_explanation), v_uid
  );
  v_result := jsonb_build_object(
    'paymentCloseoutId', p_closeout_id, 'versionNumber', v_version, 'status', v_state,
    'commitmentCount', v_schedule_count, 'contractValue', v_contract,
    'certifiedValue', v_certified, 'paidValue', v_paid, 'retentionHeld', v_held,
    'outstandingValue', v_outstanding, 'currencyCode', v_currency
  );
  UPDATE public.write_command_requests SET response = v_result, completed_at = now() WHERE id = v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

DROP FUNCTION IF EXISTS public.get_project_payment_retention(bigint);
DROP FUNCTION IF EXISTS public.get_project_payment_retention(bigint,uuid);
CREATE FUNCTION public.get_project_payment_retention(p_project_id bigint, p_payment_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_schedule public.project_payment_schedules%ROWTYPE;
  v_terms public.project_payment_retention_terms%ROWTYPE;
  v_held numeric := 0;
  v_released numeric := 0;
  v_case_count integer := 0;
  v_unpaid_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR public.can_access_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_RETENTION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_payment_schedule_id IS NULL THEN
    RETURN jsonb_build_object('projectId', p_project_id, 'hasTerms', false, 'canConfigure', false);
  END IF;
  SELECT * INTO v_schedule FROM public.project_payment_schedules
  WHERE id = p_payment_schedule_id AND project_id = p_project_id;
  IF v_schedule.id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_SCHEDULE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_terms FROM public.project_payment_retention_terms
  WHERE payment_schedule_id = v_schedule.id;
  IF v_terms.id IS NULL THEN
    RETURN jsonb_build_object(
      'projectId', p_project_id,
      'paymentScheduleId', v_schedule.id,
      'commitmentId', v_schedule.commitment_id,
      'hasTerms', false,
      'canConfigure', v_schedule.status = 'ACTIVE' AND NOT EXISTS(
        SELECT 1 FROM public.project_payment_certification_cases certification
        JOIN public.project_payment_milestones milestone ON milestone.id = certification.milestone_id
        WHERE milestone.payment_schedule_id = v_schedule.id
      )
    );
  END IF;
  SELECT count(*), count(*) FILTER(WHERE certification.status <> 'PAID'),
    COALESCE(sum(round(decision.certified_amount * v_terms.retention_percentage / 100, 2)), 0)
  INTO v_case_count, v_unpaid_count, v_held
  FROM public.project_payment_certification_cases certification
  JOIN public.project_payment_milestones milestone ON milestone.id = certification.milestone_id
  JOIN LATERAL(
    SELECT certified_amount FROM public.project_payment_certification_decisions
    WHERE certification_case_id = certification.id AND decision_type IN ('FULL', 'PARTIAL')
    ORDER BY decision_number DESC LIMIT 1
  ) decision ON true
  WHERE milestone.payment_schedule_id = v_schedule.id;
  SELECT COALESCE(released_amount, 0) INTO v_released
  FROM public.project_payment_retention_releases WHERE retention_terms_id = v_terms.id;
  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'paymentScheduleId', v_schedule.id,
    'commitmentId', v_schedule.commitment_id,
    'hasTerms', true,
    'retentionTermsId', v_terms.id,
    'status', v_terms.status,
    'retentionPercentage', v_terms.retention_percentage,
    'releaseCondition', v_terms.release_condition,
    'heldAmount', v_held,
    'releasedAmount', v_released,
    'outstandingRetention', v_held - v_released,
    'currencyCode', v_schedule.currency_code,
    'canRelease', v_terms.status = 'ACTIVE' AND v_case_count > 0 AND v_unpaid_count = 0 AND v_held > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_payment_schedule(bigint,uuid),
  public.save_project_payment_schedule(bigint,uuid,uuid,text,jsonb,uuid),
  public.activate_project_payment_schedule(uuid,uuid),
  public.get_project_payment_retention(bigint,uuid),
  public.save_project_payment_closeout(bigint,uuid,text,text,boolean,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_payment_schedule(bigint,uuid),
  public.save_project_payment_schedule(bigint,uuid,uuid,text,jsonb,uuid),
  public.activate_project_payment_schedule(uuid,uuid),
  public.get_project_payment_retention(bigint,uuid),
  public.save_project_payment_closeout(bigint,uuid,text,text,boolean,uuid)
  TO authenticated;

COMMIT;
