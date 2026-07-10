-- 025_atomic_write_commands.sql
-- Sprint 4: request-level idempotency and atomic Tier-1 write commands.
-- Append-only: historical migrations are intentionally unchanged.

CREATE TABLE IF NOT EXISTS public.write_command_requests (
  id bigserial PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  client_request_id uuid NOT NULL,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_record_id bigint,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (actor_id, operation, client_request_id)
);

ALTER TABLE public.write_command_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.write_command_requests FROM anon, authenticated;

ALTER TABLE public.site_visit_wps
  ADD COLUMN IF NOT EXISTS gc_progress numeric,
  ADD COLUMN IF NOT EXISTS discrepancy_sign_convention text,
  ADD COLUMN IF NOT EXISTS discrepancy_version integer;

ALTER TABLE public.site_visit_discrepancies
  ADD COLUMN IF NOT EXISTS signed_delta numeric,
  ADD COLUMN IF NOT EXISTS discrepancy_sign_convention text,
  ADD COLUMN IF NOT EXISTS discrepancy_version integer;

CREATE UNIQUE INDEX IF NOT EXISTS site_visit_wps_visit_wp_uniq
  ON public.site_visit_wps(site_visit_id, wp_id)
  WHERE discrepancy_version = 1;

CREATE UNIQUE INDEX IF NOT EXISTS site_visit_discrepancies_visit_wp_uniq
  ON public.site_visit_discrepancies(site_visit_id, wp_id)
  WHERE discrepancy_version = 1;

CREATE OR REPLACE FUNCTION public.submit_contractor_report_atomic(
  p_project_id bigint,
  p_report_date date,
  p_wp_progress jsonb,
  p_meta jsonb,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request public.write_command_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'contractor_report.submit', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'contractor_report.submit'
    AND client_request_id = p_client_request_id;

  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  v_result := public.submit_contractor_report(p_project_id, p_report_date, p_wp_progress, p_meta);

  UPDATE public.write_command_requests
  SET response = v_result, source_record_id = (v_result->'report'->>'id')::bigint,
      completed_at = now()
  WHERE id = v_request.id;

  UPDATE public.progress_history
  SET snapshot = COALESCE(snapshot, '{}'::jsonb) || jsonb_build_object(
    'snapshot_schema_version', 1,
    'calculation_version', COALESCE(p_meta->>'calculationVersion', 'openday-canonical-core/1'),
    'source_type', 'contractor_report',
    'source_record_id', (v_result->'report'->>'id')::bigint,
    'client_request_id', p_client_request_id,
    'actor_id', v_uid,
    'calculated_at', COALESCE(p_meta->>'calculatedAt', now()::text)
  )
  WHERE project_id = p_project_id
    AND snapshot->>'contractor_report_id' = v_result->'report'->>'id';

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_site_visit_atomic(
  p_project_id bigint,
  p_contractor_report_id bigint,
  p_visit_date date,
  p_observations jsonb,
  p_meta jsonb,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_request public.write_command_requests%ROWTYPE;
  v_visit public.site_visits%ROWTYPE;
  v_response jsonb;
  v_photo_urls text[] := '{}'::text[];
  v_observation_count integer;
  v_discrepancies jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023'; END IF;
  IF p_observations IS NULL OR jsonb_typeof(p_observations) <> 'array' OR jsonb_array_length(p_observations) = 0 THEN
    RAISE EXCEPTION 'observations must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role NOT IN ('admin', 'pm') OR NOT public.can_write_project(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized to submit site visit for project %', p_project_id USING ERRCODE = '42501';
  END IF;

  IF p_contractor_report_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contractor_reports
    WHERE id = p_contractor_report_id AND project_id = p_project_id
  ) THEN RAISE EXCEPTION 'Contractor report does not belong to project' USING ERRCODE = '23503'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_observations) AS x("wpId" text)
    GROUP BY "wpId" HAVING COUNT(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate WP observations' USING ERRCODE = '22023'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_observations)
      AS x("wpId" text, observed_progress numeric, gc_progress numeric)
    WHERE "wpId" IS NULL OR observed_progress < 0 OR observed_progress > 100
       OR gc_progress < 0 OR gc_progress > 100
       OR NOT EXISTS (SELECT 1 FROM public.project_gantt_tasks t WHERE t.project_id = p_project_id AND t.wp_id = x."wpId" AND NOT COALESCE(t.is_archived, false))
  ) THEN RAISE EXCEPTION 'Invalid or out-of-scope WP observation' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'site_visit.submit', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
   WHERE actor_id = v_uid AND operation = 'site_visit.submit' AND client_request_id = p_client_request_id;
  IF v_request.project_id <> p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505'; END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;

  SELECT COALESCE(array_agg(value), '{}'::text[]) INTO v_photo_urls
  FROM jsonb_array_elements_text(COALESCE(p_meta->'photoUrls', '[]'::jsonb)) AS value;

  INSERT INTO public.site_visits(project_id, contractor_report_id, visited_by, visit_date, overall_note, pm_schedule_assessment, photo_urls)
  VALUES (p_project_id, p_contractor_report_id, v_uid, p_visit_date,
          NULLIF(p_meta->>'overallNote', ''), NULLIF(p_meta->>'pmScheduleAssessment', ''), v_photo_urls)
  RETURNING * INTO v_visit;

  WITH rows AS (
    SELECT * FROM jsonb_to_recordset(p_observations) AS x(
      "wpId" text, observed_progress numeric, observed_status text, pm_note text,
      gc_progress numeric, gc_status text, signed_delta numeric, absolute_delta numeric, discrepancy_status text)
  ), inserted AS (
    INSERT INTO public.site_visit_wps(site_visit_id, project_id, wp_id, observed_progress, observed_status, pm_note,
      discrepancy_status, discrepancy_delta, gc_status, gc_progress, discrepancy_sign_convention, discrepancy_version)
    SELECT v_visit.id, p_project_id, "wpId", observed_progress, COALESCE(observed_status, 'not_started'), NULLIF(pm_note, ''),
      COALESCE(discrepancy_status, 'ok'), COALESCE(signed_delta, 0), COALESCE(gc_status, 'not_started'), gc_progress,
      'pm-minus-contractor', 1 FROM rows RETURNING *
  ) SELECT COUNT(*) INTO v_observation_count FROM inserted;

  WITH rows AS (
    SELECT * FROM jsonb_to_recordset(p_observations) AS x(
      "wpId" text, observed_progress numeric, gc_progress numeric, signed_delta numeric, absolute_delta numeric, discrepancy_status text)
    WHERE COALESCE(absolute_delta, 0) > 0
  ), inserted AS (
    INSERT INTO public.site_visit_discrepancies(site_visit_id, project_id, wp_id, contractor_progress, site_visit_progress,
      delta, signed_delta, status, discrepancy_sign_convention, discrepancy_version)
    SELECT v_visit.id, p_project_id, "wpId", gc_progress, observed_progress, absolute_delta, signed_delta,
      discrepancy_status, 'pm-minus-contractor', 1 FROM rows RETURNING *
  ) SELECT COALESCE(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb) INTO v_discrepancies FROM inserted;

  UPDATE public.project_gantt_tasks t SET
    site_visit_progress = x.observed_progress,
    discrepancy_status = x.discrepancy_status,
    discrepancy_delta = x.absolute_delta,
    updated_at = now()
  FROM jsonb_to_recordset(p_observations) AS x("wpId" text, observed_progress numeric, absolute_delta numeric, discrepancy_status text)
  WHERE t.project_id = p_project_id AND t.wp_id = x."wpId";

  INSERT INTO public.progress_history(project_id, week_number, overall_progress, spi, recorded_at, snapshot)
  VALUES (p_project_id, EXTRACT(WEEK FROM p_visit_date)::integer, NULL, NULL, p_visit_date::timestamptz,
    jsonb_build_object('snapshot_schema_version', 1, 'source_type', 'site_visit', 'source_record_id', v_visit.id,
      'site_visit_id', v_visit.id, 'contractor_report_id', p_contractor_report_id, 'client_request_id', p_client_request_id,
      'actor_id', v_uid, 'calculation_version', COALESCE(p_meta->>'calculationVersion', 'openday-canonical-core/1'),
      'discrepancy_sign_convention', 'pm-minus-contractor', 'discrepancy_version', 1,
      'observations', p_observations, 'calculated_at', COALESCE(p_meta->>'calculatedAt', now()::text)));

  v_response := jsonb_build_object('siteVisit', to_jsonb(v_visit), 'discrepancies', v_discrepancies,
    'observationCount', v_observation_count, 'idempotentReplay', false);
  UPDATE public.write_command_requests SET response = v_response, source_record_id = v_visit.id, completed_at = now() WHERE id = v_request.id;
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid) TO authenticated;

-- Rollback is feasible before clients depend on metadata:
-- DROP both *_atomic functions and write_command_requests. Dropping newly
-- added discrepancy columns/indexes loses only Sprint-4 metadata and must be
-- treated as a data-loss rollback once production records exist.
