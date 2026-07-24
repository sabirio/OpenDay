-- 038_import_foundation_commit_layer.sql
-- Import Foundation v1 Phase 2: import audit table + the one trusted commit
-- path for historical project import. No raw client .insert() loop exists
-- anywhere — every committed project row goes through this RPC.
--
-- Canonical Import v1 actions remain CREATE / SKIP / BLOCK (frozen contract).
-- There is no UPDATE, MERGE, or UPSERT path anywhere in this migration: an
-- existing project is never written to by this function, only ever read
-- (to detect a stale CREATE) or left alone (SKIP/BLOCK rows are counted for
-- the audit summary but never touch public.projects).

CREATE TABLE public.import_jobs (
  id bigserial PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  company_id text NOT NULL,
  source_filename text,
  mapping_snapshot jsonb,
  total_rows integer NOT NULL DEFAULT 0,
  create_count integer NOT NULL DEFAULT 0,
  skip_count integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  committed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
  -- Bounded per-row outcome summary only (row action, store_code, outcome,
  -- reason, new project id where applicable) - never a duplicate copy of
  -- full canonical project data. See commit_project_import_batch below for
  -- the exact shape written here.
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (actor_id, client_request_id)
);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_jobs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.commit_project_import_batch(
  p_company_id text,
  p_rows jsonb,
  p_client_request_id uuid,
  p_source_filename text DEFAULT NULL,
  p_mapping_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_job public.import_jobs%ROWTYPE;
  v_row jsonb;
  v_action text;
  v_normalized jsonb;
  v_store_code text;
  v_row_errors jsonb;
  v_outcome text;
  v_reason text;
  v_new_project_id bigint;
  v_results jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_create integer := 0;
  v_skip integer := 0;
  v_blocked integer := 0;
  v_committed integer := 0;
  v_failed integer := 0;
  v_response jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'MALFORMED_PLAN' USING ERRCODE = '22023';
  END IF;

  -- Authorization: reuse the existing project-create rule (One Source of
  -- Truth - see can_create_project in 020_rls_company_role_hardening.sql)
  -- rather than inventing parallel import-specific permission semantics.
  -- Gates the WHOLE batch: an import is always scoped to one company, and a
  -- forged/unauthorized company_id must fail closed before any row is read.
  IF NOT public.can_create_project(p_company_id) THEN
    RAISE EXCEPTION 'IMPORT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Idempotency: same (actor, client_request_id) pattern already used by
  -- write_command_requests/snag_command_requests, on a purpose-built table
  -- instead of reusing either (write_command_requests is project_id-bound -
  -- unsuitable for a batch that creates many new projects at once).
  INSERT INTO public.import_jobs (actor_id, client_request_id, company_id, source_filename, mapping_snapshot, total_rows)
  VALUES (v_uid, p_client_request_id, p_company_id, p_source_filename, p_mapping_snapshot, jsonb_array_length(p_rows))
  ON CONFLICT (actor_id, client_request_id) DO NOTHING;

  SELECT * INTO v_job FROM public.import_jobs
  WHERE actor_id = v_uid AND client_request_id = p_client_request_id
  FOR UPDATE;

  IF v_job.company_id <> p_company_id THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF v_job.status = 'COMPLETED' THEN
    RETURN v_job.result || jsonb_build_object('idempotentReplay', true);
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_total := v_total + 1;
    v_action := v_row->>'action';
    v_normalized := COALESCE(v_row->'normalized', '{}'::jsonb);
    v_store_code := NULLIF(btrim(COALESCE(v_normalized->>'store_code', '')), '');
    v_row_errors := COALESCE(v_row->'errors', '[]'::jsonb);
    v_new_project_id := NULL;
    v_reason := NULL;

    IF v_action = 'SKIP' THEN
      v_skip := v_skip + 1;
      v_outcome := 'SKIPPED';
    ELSIF v_action = 'BLOCK' THEN
      v_blocked := v_blocked + 1;
      v_outcome := 'BLOCKED_IN_PLAN';
    ELSIF v_action <> 'CREATE' THEN
      -- No plan action exists other than CREATE/SKIP/BLOCK (frozen
      -- contract). Anything else is a malformed/forged row, never treated
      -- as an implicit CREATE.
      v_blocked := v_blocked + 1;
      v_outcome := 'REJECTED_INVALID_ACTION';
      v_reason := format('Unrecognized plan action "%s"', COALESCE(v_action, 'null'));
    ELSIF jsonb_array_length(v_row_errors) > 0 THEN
      -- Defensive consistency check: a genuine CREATE row from
      -- planProjectImport() never carries errors (action='BLOCK' whenever
      -- errors exist - see planProjectImport.js). A CREATE-labeled row that
      -- still carries errors is the literal "smuggle BLOCK as CREATE" case
      -- and is refused rather than trusted.
      v_blocked := v_blocked + 1;
      v_outcome := 'REJECTED_INVALID_ACTION';
      v_reason := 'CREATE row is internally inconsistent (carries validation errors)';
    ELSIF v_store_code IS NULL THEN
      v_blocked := v_blocked + 1;
      v_outcome := 'REJECTED_INVALID_ACTION';
      v_reason := 'CREATE row has no store_code';
    ELSIF EXISTS (
      SELECT 1 FROM public.projects
      WHERE company_id = p_company_id AND lower(btrim(store_code)) = lower(v_store_code)
    ) THEN
      -- Stale-plan protection (frozen design §14): Preview may have run
      -- long before Commit. Re-verify the identity is still free at write
      -- time; if another CREATE already landed, this row is a conflict, not
      -- an overwrite and not silently re-labeled SKIP.
      v_create := v_create + 1;
      v_outcome := 'CONFLICT';
      v_reason := 'A project with this store code already exists (plan was stale)';
    ELSE
      v_create := v_create + 1;
      BEGIN
        INSERT INTO public.projects (
          store_code, shopping_mall_name, street, city, country, location_type,
          store_size_sqm, sales_area_sqm, back_of_house_area_sqm,
          project_type, store_concept,
          construction_start_date, target_opening_date,
          actual_construction_start_date, actual_construction_completion_date, actual_opening_date,
          budget, actual_cost, currency_code,
          general_contractor, contractor_email,
          company_id, created_by
        ) VALUES (
          v_store_code, NULLIF(v_normalized->>'shopping_mall_name', ''), NULLIF(v_normalized->>'street', ''),
          NULLIF(v_normalized->>'city', ''), NULLIF(v_normalized->>'country', ''), NULLIF(v_normalized->>'location_type', ''),
          NULLIF(v_normalized->>'store_size_sqm', '')::numeric, NULLIF(v_normalized->>'sales_area_sqm', '')::numeric, NULLIF(v_normalized->>'back_of_house_area_sqm', '')::numeric,
          NULLIF(v_normalized->>'project_type', ''), NULLIF(v_normalized->>'store_concept', ''),
          NULLIF(v_normalized->>'construction_start_date', '')::date, NULLIF(v_normalized->>'target_opening_date', '')::date,
          NULLIF(v_normalized->>'actual_construction_start_date', '')::date, NULLIF(v_normalized->>'actual_construction_completion_date', '')::date, NULLIF(v_normalized->>'actual_opening_date', '')::date,
          NULLIF(v_normalized->>'budget', '')::numeric(14,2), NULLIF(v_normalized->>'actual_cost', '')::numeric(14,2), NULLIF(v_normalized->>'currency_code', ''),
          NULLIF(v_normalized->>'general_contractor', ''), NULLIF(v_normalized->>'contractor_email', ''),
          p_company_id, v_uid
        ) RETURNING id INTO v_new_project_id;
        v_committed := v_committed + 1;
        v_outcome := 'COMMITTED';
      EXCEPTION WHEN OTHERS THEN
        -- Per-row atomicity: one row's DB-level failure (RLS denial,
        -- constraint violation, bad cast) must not lose the rest of an
        -- otherwise-valid batch. Caught via an implicit savepoint here, so
        -- the failed INSERT rolls back alone and the loop continues.
        v_failed := v_failed + 1;
        v_outcome := 'FAILED';
        v_reason := SQLERRM;
      END;
    END IF;

    v_results := v_results || jsonb_build_object(
      'sourceRow', v_row->'sourceRow',
      'storeCode', v_store_code,
      'planAction', v_action,
      'outcome', v_outcome,
      'reason', v_reason,
      'projectId', v_new_project_id
    );
  END LOOP;

  v_response := jsonb_build_object(
    'importJobId', v_job.id,
    'summary', jsonb_build_object(
      'total', v_total, 'create', v_create, 'skip', v_skip, 'blocked', v_blocked,
      'committed', v_committed, 'failed', v_failed
    ),
    'rows', v_results,
    'idempotentReplay', false
  );

  UPDATE public.import_jobs SET
    create_count = v_create, skip_count = v_skip, blocked_count = v_blocked,
    committed_count = v_committed, failed_count = v_failed,
    status = 'COMPLETED', result = v_response, completed_at = now()
  WHERE id = v_job.id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_project_import_batch(text, jsonb, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_project_import_batch(text, jsonb, uuid, text, jsonb) TO authenticated;

-- Rollback:
--   REVOKE EXECUTE ON FUNCTION public.commit_project_import_batch(text,jsonb,uuid,text,jsonb) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.commit_project_import_batch(text,jsonb,uuid,text,jsonb);
--   DROP TABLE IF EXISTS public.import_jobs;
-- Safe before any real import has been committed - committed_count rows in
-- public.projects would remain (rollback here does not delete projects).
