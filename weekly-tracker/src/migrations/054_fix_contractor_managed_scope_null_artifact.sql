-- 054_fix_contractor_managed_scope_null_artifact.sql
-- Simplification Phase 3D.2.1 — fixes a genuine, blocking defect discovered
-- while building the Scope-sync command (053): create_contractor_managed_project()
-- (052) writes `p_project->'scope'` directly. When the client sends no Scope
-- value at all (the normal case for every schemaVersion-1/legacy-template
-- project — see buildNewProjectDraft()'s own `scope: null` for non-Master-
-- Catalog templates), the JS payload still contains an explicit `"scope":
-- null` key, and the `->` operator extracts that as the JSONB SCALAR `null`
-- (jsonb_typeof = 'null'), not a true SQL NULL. This is a real, different,
-- persisted value from Postgres's point of view.
--
-- 051's projects_scope_lifecycle_lock trigger fires on
-- `NEW.scope IS DISTINCT FROM OLD.scope`. A later plain metadata-only
-- update (projectService.update() -> toDB()) always resolves an absent/null
-- Scope to a genuine JS `null`, which PostgREST always writes as true SQL
-- NULL (there is no way to request "the JSONB null scalar" through a normal
-- REST PATCH body). A jsonb 'null' scalar IS DISTINCT FROM a true SQL NULL,
-- so the trigger fired a false-positive SCHEDULE_PENDING_REVIEW/
-- BASELINE_ALREADY_APPROVED rejection on an ordinary, semantically-no-op
-- metadata edit of a project whose Scope had never actually been touched —
-- discovered live via this phase's own Locked-Scope E2E test.
--
-- Two-part fix:
--   1. CREATE OR REPLACE the create command so it always normalizes a JSONB
--      null scalar to true SQL NULL before insert (NULLIF against
--      'null'::jsonb) — every future create is unaffected by this artifact.
--   2. One-time data correction: any already-created row whose scope column
--      holds the jsonb null scalar is normalized to true SQL NULL. This is a
--      pure representation fix (jsonb 'null' and "no scope" have always been
--      read identically by every JS consumer, fromDB()'s `row.scope || null`
--      collapses both to the same JS `null`) — no observable application
--      behavior changes for any row, only the trigger's own internal
--      equality check stops misfiring.
--
-- LOCAL_FEATURE_ONLY: same convention as 030-053 — not added to
-- canonical-security-contract.json's canonicalMigrationPath (frozen at 041).
--
-- Rollback:
--   Re-apply 052_create_contractor_managed_project.sql's function body
--   (CREATE OR REPLACE) to restore the prior (unfixed) contract. The data
--   correction in part 2 is not reversible (and does not need to be — it
--   only removes a representation artifact no code ever depended on).

UPDATE public.projects
SET scope = NULL
WHERE schedule_ownership_mode = 'CONTRACTOR_MANAGED'
  AND jsonb_typeof(scope) = 'null';

CREATE OR REPLACE FUNCTION public.create_contractor_managed_project(
  p_project jsonb,
  p_scope_wp_ids text[],
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_operation text := 'project.create_contractor_managed';
  v_existing_response jsonb;
  v_company_id text;
  v_store_code text;
  v_template_id uuid;
  v_template_data jsonb;
  v_valid_wp_ids text[];
  v_project_row public.projects%ROWTYPE;
  v_materialized_count integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_project IS NULL OR jsonb_typeof(p_project) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_project must be a JSON object' USING ERRCODE = '22023';
  END IF;

  -- Serialize any two calls sharing the same logical create attempt before
  -- doing anything else. Transaction-scoped (auto-released on commit or
  -- rollback) — same advisory-lock technique 051's race proofs established.
  PERFORM pg_advisory_xact_lock(hashtext(v_operation || ':' || v_uid::text || ':' || p_client_request_id::text));

  SELECT response INTO v_existing_response
  FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = v_operation AND client_request_id = p_client_request_id;

  IF v_existing_response IS NOT NULL THEN
    RETURN v_existing_response || jsonb_build_object('idempotentReplay', true);
  END IF;

  -- Company resolution mirrors projectService.create()'s existing
  -- getCurrentCompanyId() fallback; can_create_project() below is the SAME
  -- function the projects_insert RLS policy already enforces for ordinary
  -- inserts — no second authorization rule.
  v_company_id := NULLIF(p_project->>'companyId', '');
  IF v_company_id IS NULL THEN
    v_company_id := public.current_company_id();
  END IF;

  IF NOT public.can_create_project(v_company_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: caller cannot create a project for this company' USING ERRCODE = '42501';
  END IF;

  v_store_code := NULLIF(trim(p_project->>'storeCode'), '');
  IF v_store_code IS NULL THEN
    RAISE EXCEPTION 'STORE_CODE_REQUIRED: store code is required' USING ERRCODE = '22023';
  END IF;

  IF p_scope_wp_ids IS NULL OR array_length(p_scope_wp_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_SCOPE: at least one active Scope work package is required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_scope_wp_ids) AS wp_id WHERE wp_id IS NULL) THEN
    RAISE EXCEPTION 'INVALID_WORK_PACKAGE: a Scope work package id must not be null' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(DISTINCT wp_id) FROM unnest(p_scope_wp_ids) AS wp_id) <> array_length(p_scope_wp_ids, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_WORK_PACKAGE: each Scope work package may appear only once' USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent creates for the same natural key (company + store
  -- code) across different client request ids — a different invariant than
  -- the idempotency lock above.
  PERFORM pg_advisory_xact_lock(hashtext('project_code:' || COALESCE(v_company_id, '') || ':' || lower(v_store_code)));

  IF EXISTS (
    SELECT 1 FROM public.projects
    WHERE lower(store_code) = lower(v_store_code)
      AND company_id IS NOT DISTINCT FROM v_company_id
  ) THEN
    RAISE EXCEPTION 'PROJECT_CODE_CONFLICT: a project with this store code already exists' USING ERRCODE = '23505';
  END IF;

  -- Template resolution — company-specific active retail-fitout-v2 first,
  -- global (company_id IS NULL) fallback second. Mirrors
  -- selectDefaultScopeTemplate()'s exact precedence
  -- (versionedScopeTemplate.js) — no second resolution algorithm.
  SELECT id, data INTO v_template_id, v_template_data
  FROM public.templates
  WHERE family = 'retail-fitout-v2' AND is_active = true
    AND company_id IS NOT DISTINCT FROM v_company_id
  LIMIT 1;

  IF v_template_id IS NULL THEN
    SELECT id, data INTO v_template_id, v_template_data
    FROM public.templates
    WHERE family = 'retail-fitout-v2' AND is_active = true AND company_id IS NULL
    LIMIT 1;
  END IF;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_CONFIGURED: no active retail-fitout-v2 scope template is available' USING ERRCODE = 'P0002';
  END IF;

  -- Valid WP id universe for the resolved template, read directly from its
  -- own JSONB — never hardcoded.
  SELECT array_agg(DISTINCT wp->>'id')
    INTO v_valid_wp_ids
  FROM jsonb_array_elements(v_template_data->'zones') AS zone,
       jsonb_array_elements(zone->'categories') AS category,
       jsonb_array_elements(category->'workPackages') AS wp;

  IF EXISTS (
    SELECT 1 FROM unnest(p_scope_wp_ids) AS wp_id
    WHERE v_valid_wp_ids IS NULL OR NOT (wp_id = ANY(v_valid_wp_ids))
  ) THEN
    RAISE EXCEPTION 'WORK_PACKAGE_OUT_OF_TEMPLATE: every Scope work package must belong to the resolved template' USING ERRCODE = '22023';
  END IF;

  -- Project insert. schedule_ownership_mode is hardcoded — never read from
  -- p_project — so this command can never be used to create an
  -- AUTO_GENERATED (or any other) project.
  INSERT INTO public.projects (
    store_code, shopping_mall_name, city, street, state, country, sales_market,
    construction_start_date, construction_end_date, target_opening_date,
    project_manager, general_contractor, contractor_email,
    security_manager, it_manager, facility_manager, hr_manager, supply_manager,
    project_type, project_status, phases, company_id, created_by,
    template_type, store_size_sqm, scope, template_id,
    location_type, store_concept, sales_area_sqm, back_of_house_area_sqm,
    budget, currency_code,
    schedule_ownership_mode
  ) VALUES (
    v_store_code,
    NULLIF(p_project->>'shoppingMallName', ''),
    NULLIF(p_project->>'city', ''),
    NULLIF(p_project->>'street', ''),
    NULLIF(p_project->>'state', ''),
    NULLIF(p_project->>'country', ''),
    NULLIF(p_project->>'salesMarket', ''),
    NULLIF(p_project->>'constructionStartDate', '')::date,
    NULLIF(p_project->>'constructionEndDate', '')::date,
    NULLIF(p_project->>'targetOpeningDate', '')::date,
    NULLIF(p_project->>'projectManager', ''),
    NULLIF(p_project->>'generalContractor', ''),
    NULLIF(p_project->>'contractorEmail', ''),
    NULLIF(p_project->>'securityManager', ''),
    NULLIF(p_project->>'itManager', ''),
    NULLIF(p_project->>'facilityManager', ''),
    NULLIF(p_project->>'hrManager', ''),
    NULLIF(p_project->>'supplyManager', ''),
    COALESCE(NULLIF(p_project->>'projectType', ''), 'New Opening'),
    COALESCE(NULLIF(p_project->>'projectStatus', ''), 'Active'),
    '{}'::text[],
    v_company_id,
    v_uid,
    'retail-fitout-v2',
    NULLIF(p_project->>'storeSizeSqm', '')::numeric,
    NULLIF(p_project->'scope', 'null'::jsonb),
    v_template_id,
    NULLIF(p_project->>'locationType', ''),
    NULLIF(p_project->>'storeConcept', ''),
    NULLIF(p_project->>'salesAreaSqm', '')::numeric,
    NULLIF(p_project->>'backOfHouseAreaSqm', '')::numeric,
    NULLIF(p_project->>'budget', '')::numeric,
    NULLIF(p_project->>'currencyCode', ''),
    'CONTRACTOR_MANAGED'
  )
  RETURNING * INTO v_project_row;

  -- Materialize one unscheduled row per active Scope WP. A brand-new
  -- project has no existing rows, so this is always a pure insert — never
  -- the unarchive/archive re-scoping behavior
  -- materializeUnscheduledScheduleFromScope() performs for a Scope *edit*.
  WITH wp_meta AS (
    SELECT wp->>'id' AS wp_id, wp->>'label' AS wp_label, zone->>'id' AS phase_id, zone->>'label' AS phase_label
    FROM jsonb_array_elements(v_template_data->'zones') AS zone,
         jsonb_array_elements(zone->'categories') AS category,
         jsonb_array_elements(category->'workPackages') AS wp
  ), scoped AS (
    SELECT DISTINCT wp_id FROM unnest(p_scope_wp_ids) AS wp_id
  )
  INSERT INTO public.project_gantt_tasks (
    project_id, wp_id, wp_label, phase_id, phase_label,
    planned_start, planned_end, duration_days, status, is_archived, sort_order
  )
  SELECT v_project_row.id, m.wp_id, m.wp_label, m.phase_id, m.phase_label,
         NULL, NULL, NULL, 'not_started', false, (row_number() OVER (ORDER BY m.wp_id) - 1)::int
  FROM scoped s
  JOIN wp_meta m ON m.wp_id = s.wp_id;

  GET DIAGNOSTICS v_materialized_count = ROW_COUNT;

  v_result := to_jsonb(v_project_row) || jsonb_build_object('materializedCount', v_materialized_count);

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id, response, completed_at)
  VALUES (v_uid, v_operation, p_client_request_id, v_project_row.id, v_result, now());

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contractor_managed_project(jsonb, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contractor_managed_project(jsonb, text[], uuid) TO authenticated;
