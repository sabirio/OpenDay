-- 040_import_planned_construction_end.sql
-- Project Exchange v1 completion patch: adds `construction_end_date`
-- (PLANNED construction end) to the one trusted commit path. Certification
-- found that projects.construction_end_date already exists (migration 037)
-- and is already read/written by live Add/Edit Project
-- (ProjectEditorModal.jsx -> projectService.js) and already part of the
-- canonical Project Exchange field catalog for Export/Blank Template
-- (core/import/projectImportFieldMap.js), but commit_project_import_batch
-- (038, replaced by 039) never persisted it on CREATE — the one remaining
-- round-trip gap: Export -> Excel -> Import into a fresh project silently
-- dropped Planned Construction End. This migration closes that gap and only
-- that gap: CREATE OR REPLACE on the exact 039 function body, with
-- construction_end_date added to the INSERT column/value list. No other
-- behavior changes; 037/038/039 are not edited (append-only).
--
-- Deliberately NOT added to the server-side integrity floor: like its
-- sibling planned date target_opening_date (also never floor-checked
-- against construction_start_date), construction_end_date is a planned
-- estimate subject to revision, not an observed historical fact — Phase 1's
-- validateProjectImportRow.js already warns (PLANNED_END_BEFORE_START, never
-- BLOCK) when it precedes construction_start_date, and that warning-level
-- rule intentionally stays client/core-side rather than being duplicated in
-- SQL (see docs/SourceOfTruth.md "Project Exchange v1"). This exactly
-- mirrors 039's own existing asymmetry: ACTUAL date orderings are hard
-- floor-checked (real observed facts can't be chronologically impossible);
-- PLANNED date orderings are not (they're estimates, not facts).

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
  -- Integrity-floor working variables (Risk A, from 039). Extracted fresh per
  -- row inside the row's own exception scope, so a malformed/forged value
  -- (e.g. a non-numeric area) fails that one row, not the whole batch.
  v_country text;
  v_city text;
  v_location_type text;
  v_project_type text;
  v_shopping_mall_name text;
  v_street text;
  v_currency_code text;
  v_store_size_sqm numeric;
  v_sales_area_sqm numeric;
  v_boh_area_sqm numeric;
  v_budget numeric;
  v_actual_cost numeric;
  v_actual_start date;
  v_actual_completion date;
  v_actual_opening date;
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
    ELSE
      -- Action='CREATE', internally consistent, has an identity. Everything
      -- from here on - the integrity floor, the concurrency-safe identity
      -- check, and the INSERT itself - runs in one exception scope so any
      -- failure (a deliberate integrity-floor rejection OR a genuine
      -- unexpected DB error, e.g. a non-numeric area value) becomes this
      -- row's own outcome without losing the rest of the batch (per-row
      -- atomicity, unchanged from 038).
      v_create := v_create + 1;
      BEGIN
        v_country := NULLIF(btrim(COALESCE(v_normalized->>'country', '')), '');
        v_city := NULLIF(btrim(COALESCE(v_normalized->>'city', '')), '');
        v_location_type := NULLIF(btrim(COALESCE(v_normalized->>'location_type', '')), '');
        v_project_type := NULLIF(btrim(COALESCE(v_normalized->>'project_type', '')), '');
        v_shopping_mall_name := NULLIF(btrim(COALESCE(v_normalized->>'shopping_mall_name', '')), '');
        v_street := NULLIF(btrim(COALESCE(v_normalized->>'street', '')), '');
        v_currency_code := NULLIF(btrim(COALESCE(v_normalized->>'currency_code', '')), '');
        v_store_size_sqm := NULLIF(v_normalized->>'store_size_sqm', '')::numeric;
        v_sales_area_sqm := NULLIF(v_normalized->>'sales_area_sqm', '')::numeric;
        v_boh_area_sqm := NULLIF(v_normalized->>'back_of_house_area_sqm', '')::numeric;
        v_budget := NULLIF(v_normalized->>'budget', '')::numeric;
        v_actual_cost := NULLIF(v_normalized->>'actual_cost', '')::numeric;
        v_actual_start := NULLIF(v_normalized->>'actual_construction_start_date', '')::date;
        v_actual_completion := NULLIF(v_normalized->>'actual_construction_completion_date', '')::date;
        v_actual_opening := NULLIF(v_normalized->>'actual_opening_date', '')::date;

        -- Required Import v1 identity facts (frozen design; §3 of the
        -- hardening spec). Never invented when missing - a forged row
        -- omitting one of these is refused, not defaulted.
        IF v_country IS NULL THEN RAISE EXCEPTION 'country is required' USING ERRCODE = '70001'; END IF;
        IF v_city IS NULL THEN RAISE EXCEPTION 'city is required' USING ERRCODE = '70001'; END IF;
        IF v_location_type IS NULL THEN RAISE EXCEPTION 'location_type is required' USING ERRCODE = '70001'; END IF;
        IF v_project_type IS NULL THEN RAISE EXCEPTION 'project_type is required' USING ERRCODE = '70001'; END IF;

        -- Location integrity (§4). Import v1 recognizes only Mall/Street -
        -- this is command-validation for the import path, not a universal
        -- database taxonomy: location_type itself stays plain TEXT with no
        -- CHECK constraint, so a future evidence-backed value can still be
        -- added to the recognized set without a migration.
        IF v_location_type NOT IN ('Mall', 'Street') THEN
          RAISE EXCEPTION 'unrecognized location_type "%"', v_location_type USING ERRCODE = '70001';
        END IF;
        IF v_location_type = 'Mall' AND v_shopping_mall_name IS NULL THEN
          RAISE EXCEPTION 'a Mall location requires a shopping mall name' USING ERRCODE = '70001';
        END IF;
        IF v_location_type = 'Street' AND v_shopping_mall_name IS NOT NULL THEN
          RAISE EXCEPTION 'a Street location must not have a shopping mall name' USING ERRCODE = '70001';
        END IF;
        IF v_location_type = 'Street' AND v_street IS NULL THEN
          RAISE EXCEPTION 'a Street location requires a street address' USING ERRCODE = '70001';
        END IF;

        -- Area integrity (§5). Only hard impossibilities - the area-sum
        -- tolerance WARNING stays exclusively a Phase 1 Preview concern and
        -- is deliberately NOT reimplemented here.
        IF v_store_size_sqm IS NOT NULL AND v_store_size_sqm < 0 THEN
          RAISE EXCEPTION 'total area cannot be negative' USING ERRCODE = '70001';
        END IF;
        IF v_sales_area_sqm IS NOT NULL AND v_sales_area_sqm < 0 THEN
          RAISE EXCEPTION 'sales area cannot be negative' USING ERRCODE = '70001';
        END IF;
        IF v_boh_area_sqm IS NOT NULL AND v_boh_area_sqm < 0 THEN
          RAISE EXCEPTION 'back of house area cannot be negative' USING ERRCODE = '70001';
        END IF;
        IF v_sales_area_sqm IS NOT NULL AND v_store_size_sqm IS NOT NULL AND v_sales_area_sqm > v_store_size_sqm THEN
          RAISE EXCEPTION 'sales area cannot exceed total area' USING ERRCODE = '70001';
        END IF;

        -- Date integrity (§6). Only the two hard-impossibility orderings on
        -- OBSERVED (actual) dates; "opening before construction completion"
        -- stays a Phase 1 WARNING only (real stores may open with punch-list
        -- work ongoing). PLANNED date orderings (construction_end_date vs
        -- construction_start_date, target_opening_date vs
        -- construction_start_date) are intentionally NOT floor-checked here
        -- either - see this migration's header comment.
        IF v_actual_completion IS NOT NULL AND v_actual_start IS NOT NULL AND v_actual_completion < v_actual_start THEN
          RAISE EXCEPTION 'actual construction completion cannot be before actual construction start' USING ERRCODE = '70001';
        END IF;
        IF v_actual_opening IS NOT NULL AND v_actual_start IS NOT NULL AND v_actual_opening < v_actual_start THEN
          RAISE EXCEPTION 'actual opening cannot be before actual construction start' USING ERRCODE = '70001';
        END IF;

        -- Financial integrity (§7). Structural currency-shape check only -
        -- proves the value COULD be a currency code, never that it IS a
        -- real ISO 4217 currency (that recognition stays Phase 1's job).
        IF v_budget IS NOT NULL AND v_budget < 0 THEN
          RAISE EXCEPTION 'budget cannot be negative' USING ERRCODE = '70001';
        END IF;
        IF v_actual_cost IS NOT NULL AND v_actual_cost < 0 THEN
          RAISE EXCEPTION 'actual cost cannot be negative' USING ERRCODE = '70001';
        END IF;
        IF (v_budget IS NOT NULL OR v_actual_cost IS NOT NULL) AND v_currency_code IS NULL THEN
          RAISE EXCEPTION 'currency is required when budget or actual cost is set' USING ERRCODE = '70001';
        END IF;
        IF v_currency_code IS NOT NULL AND v_currency_code !~ '^[A-Z]{3}$' THEN
          RAISE EXCEPTION 'currency code must be exactly 3 uppercase letters' USING ERRCODE = '70001';
        END IF;

        -- Concurrency-safe identity protection (Risk B / §9-11). Acquire a
        -- deterministic transaction-scoped advisory lock on this row's
        -- (company_id, store_code) identity BEFORE re-checking existence,
        -- so two concurrent commits for the same identity serialize instead
        -- of both observing "not yet created". hashtext() is deterministic
        -- (same identity -> same lock key) and unrelated identities hash to
        -- different key pairs, so they do not block each other. The lock is
        -- released automatically when this function's transaction ends.
        PERFORM pg_advisory_xact_lock(hashtext(p_company_id), hashtext(lower(v_store_code)));

        IF EXISTS (
          SELECT 1 FROM public.projects
          WHERE company_id = p_company_id AND lower(btrim(store_code)) = lower(v_store_code)
        ) THEN
          -- Stale-plan protection (frozen design, unchanged from 038):
          -- Preview may have run long before Commit, or a concurrent
          -- request may have just won the identity race under the lock
          -- above. Either way this row is a conflict, never an overwrite.
          v_outcome := 'CONFLICT';
          v_reason := 'A project with this store code already exists (plan was stale, or a concurrent request created it first)';
        ELSE
          INSERT INTO public.projects (
            store_code, shopping_mall_name, street, city, country, location_type,
            store_size_sqm, sales_area_sqm, back_of_house_area_sqm,
            project_type, store_concept,
            construction_start_date, construction_end_date, target_opening_date,
            actual_construction_start_date, actual_construction_completion_date, actual_opening_date,
            budget, actual_cost, currency_code,
            general_contractor, contractor_email,
            company_id, created_by
          ) VALUES (
            v_store_code, v_shopping_mall_name, v_street,
            v_city, v_country, v_location_type,
            v_store_size_sqm, v_sales_area_sqm, v_boh_area_sqm,
            v_project_type, NULLIF(v_normalized->>'store_concept', ''),
            NULLIF(v_normalized->>'construction_start_date', '')::date, NULLIF(v_normalized->>'construction_end_date', '')::date, NULLIF(v_normalized->>'target_opening_date', '')::date,
            v_actual_start, v_actual_completion, v_actual_opening,
            v_budget, v_actual_cost, v_currency_code,
            NULLIF(v_normalized->>'general_contractor', ''), NULLIF(v_normalized->>'contractor_email', ''),
            p_company_id, v_uid
          ) RETURNING id INTO v_new_project_id;
          v_committed := v_committed + 1;
          v_outcome := 'COMMITTED';
        END IF;
      EXCEPTION
        WHEN SQLSTATE '70001' THEN
          -- A deliberate integrity-floor rejection (Risk A) - distinct from
          -- an unexpected DB error, so the audit reason is a clean,
          -- human-readable rule name rather than a raw Postgres error.
          v_outcome := 'REJECTED_INTEGRITY_FLOOR';
          v_reason := SQLERRM;
        WHEN OTHERS THEN
          -- Per-row atomicity, unchanged from 038: one row's unexpected
          -- DB-level failure (bad cast, RLS denial, constraint violation)
          -- must not lose the rest of an otherwise-valid batch. Caught via
          -- an implicit savepoint here, so the failure rolls back alone and
          -- the loop continues.
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

-- Rollback: CREATE OR REPLACE FUNCTION public.commit_project_import_batch
-- with 039's original body (git show <039-commit>:.../039_import_foundation_integrity_hardening.sql).
-- import_jobs/committed rows are unaffected either way - this migration
-- only replaces the function body, no table/column change.
