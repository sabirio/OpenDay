-- 134_canonical_financial_sources.sql
-- Architecture integrity correction: project master data owns currency, not
-- live Budget/Actual Cost. Forecasting is owned by Cost Packages.

BEGIN;

COMMENT ON COLUMN public.projects.budget IS
  'LEGACY HISTORICAL IMPORT ONLY. Live budget source: approved_budget_baselines.';
COMMENT ON COLUMN public.projects.actual_cost IS
  'LEGACY HISTORICAL IMPORT ONLY. Live final cost source: project_cost_closeout_versions.';

-- Keep legacy import RPCs/service-role migration tools working while removing
-- these two compatibility columns from the browser-facing table write surface.
REVOKE INSERT, UPDATE ON TABLE public.projects FROM authenticated;
DO $$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'projects'
    AND is_generated = 'NEVER'
    AND column_name NOT IN ('budget', 'actual_cost');

  IF v_columns IS NULL THEN
    RAISE EXCEPTION 'PROJECT_WRITABLE_COLUMN_SET_EMPTY';
  END IF;

  EXECUTE format('GRANT INSERT (%s) ON TABLE public.projects TO authenticated', v_columns);
  EXECUTE format('GRANT UPDATE (%s) ON TABLE public.projects TO authenticated', v_columns);
END;
$$;

-- One aggregate forecast is derived from the canonical latest version of each
-- active Cost Package. The aggregate is deliberately unavailable when even one
-- active package has no forecast, commitment or approved-budget fallback.
CREATE OR REPLACE FUNCTION private.project_cost_package_forecast_total(p_project_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH package_values AS (
    SELECT
      package.id,
      package.currency_code,
      (SELECT sum(item.amount)
         FROM public.approved_budget_baselines baseline
         JOIN public.approved_budget_baseline_items item
           ON item.baseline_id = baseline.id
         JOIN public.project_cost_package_work_groups scope
           ON scope.cost_package_id = package.id
          AND scope.work_group_id = item.work_group_id
        WHERE baseline.project_id = p_project_id) AS budget_value,
      COALESCE((SELECT sum(commitment.committed_value)
                  FROM public.project_commercial_commitments commitment
                 WHERE commitment.cost_package_id = package.id), 0)
      + COALESCE((SELECT sum(variation.approved_amount)
                    FROM public.project_variations variation
                   WHERE variation.cost_package_id = package.id
                     AND variation.status = 'APPROVED'), 0) AS committed_value,
      (SELECT version.forecast_value
         FROM public.project_cost_package_forecast_versions version
        WHERE version.cost_package_id = package.id
        ORDER BY version.version_number DESC
        LIMIT 1) AS latest_forecast
    FROM public.project_cost_packages package
    WHERE package.project_id = p_project_id
      AND package.status <> 'ARCHIVED'
  ), resolved AS (
    SELECT
      currency_code,
      COALESCE(
        latest_forecast,
        CASE WHEN committed_value > 0 THEN committed_value ELSE budget_value END
      ) AS forecast_value
    FROM package_values
  ), project_currency AS (
    SELECT currency_code FROM public.projects WHERE id = p_project_id
  )
  SELECT CASE
    WHEN count(*) = 0
      OR count(*) FILTER (WHERE resolved.forecast_value IS NULL) > 0
      OR count(*) FILTER (WHERE resolved.currency_code IS DISTINCT FROM project_currency.currency_code) > 0
      THEN NULL
    ELSE sum(resolved.forecast_value)
  END
  FROM resolved
  CROSS JOIN project_currency;
$$;

REVOKE ALL ON FUNCTION private.project_cost_package_forecast_total(bigint)
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the immutable closeout interface but replace its obsolete
-- project-level Forecast dependency with the Cost Package aggregate.
CREATE OR REPLACE FUNCTION public.save_project_cost_closeout(
  p_project_id bigint,
  p_closeout_id uuid,
  p_final_cost numeric,
  p_budget_explanation text,
  p_award_explanation text,
  p_forecast_explanation text,
  p_confirm boolean,
  p_client_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u uuid := auth.uid();
  v_role text;
  req public.write_command_requests%ROWTYPE;
  version_no integer;
  budget numeric;
  award numeric;
  variations numeric;
  forecast numeric;
  currency text;
  state text;
  result jsonb;
BEGIN
  SELECT upper(p.role) INTO v_role FROM public.profiles p WHERE p.id = u;
  IF u IS NULL OR v_role NOT IN ('PM', 'ADMIN') OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_COST_CLOSEOUT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_closeout_id IS NULL OR p_client_request_id IS NULL OR COALESCE(p_final_cost, -1) < 0
    OR btrim(COALESCE(p_budget_explanation, '')) = ''
    OR btrim(COALESCE(p_award_explanation, '')) = ''
    OR btrim(COALESCE(p_forecast_explanation, '')) = ''
    OR char_length(p_budget_explanation) > 3000
    OR char_length(p_award_explanation) > 3000
    OR char_length(p_forecast_explanation) > 3000 THEN
    RAISE EXCEPTION 'INVALID_PROJECT_COST_CLOSEOUT' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (u, 'project_closeout.cost.save', p_client_request_id, p_project_id)
  ON CONFLICT(actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO req FROM public.write_command_requests
   WHERE actor_id = u AND operation = 'project_closeout.cost.save' AND client_request_id = p_client_request_id;
  IF req.response IS NOT NULL THEN RETURN req.response || jsonb_build_object('idempotentReplay', true); END IF;
  IF EXISTS(SELECT 1 FROM public.project_cost_closeout_versions WHERE project_id = p_project_id AND status = 'CONFIRMED') THEN
    RAISE EXCEPTION 'PROJECT_COST_CLOSEOUT_ALREADY_CONFIRMED' USING ERRCODE = '55000';
  END IF;

  SELECT total_amount, currency_code INTO budget, currency
    FROM public.approved_budget_baselines WHERE project_id = p_project_id;
  SELECT contract_value, COALESCE(currency, currency_code) INTO award, currency
    FROM public.project_tender_awards WHERE project_id = p_project_id;
  IF budget IS NULL OR award IS NULL OR currency IS NULL THEN
    RAISE EXCEPTION 'COST_CLOSEOUT_REQUIRES_APPROVED_BUDGET_AND_AWARD' USING ERRCODE = '55000';
  END IF;
  SELECT COALESCE(sum(approved_amount), 0) INTO variations
    FROM public.project_variations WHERE project_id = p_project_id AND status = 'APPROVED';
  SELECT private.project_cost_package_forecast_total(p_project_id) INTO forecast;
  SELECT COALESCE(max(version_number), 0) + 1 INTO version_no
    FROM public.project_cost_closeout_versions WHERE project_id = p_project_id;
  state := CASE WHEN COALESCE(p_confirm, false) THEN 'CONFIRMED' ELSE 'DRAFT' END;

  INSERT INTO public.project_cost_closeout_versions
  VALUES (
    p_closeout_id, p_project_id, version_no, state, currency, budget, award, variations, forecast,
    p_final_cost, p_final_cost - budget, p_final_cost - award,
    CASE WHEN forecast IS NULL THEN NULL ELSE p_final_cost - forecast END,
    btrim(p_budget_explanation), btrim(p_award_explanation), btrim(p_forecast_explanation), u, now()
  );
  result := jsonb_build_object(
    'costCloseoutId', p_closeout_id, 'versionNumber', version_no, 'status', state,
    'currencyCode', currency, 'approvedBudget', budget, 'awardValue', award,
    'approvedVariations', variations, 'latestForecast', forecast, 'finalCost', p_final_cost,
    'varianceToBudget', p_final_cost - budget, 'varianceToAward', p_final_cost - award,
    'varianceToForecast', CASE WHEN forecast IS NULL THEN NULL ELSE p_final_cost - forecast END
  );
  UPDATE public.write_command_requests SET response = result, completed_at = now() WHERE id = req.id;
  RETURN result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_project_cost_closeout(bigint,uuid,numeric,text,text,text,boolean,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_project_cost_closeout(bigint,uuid,numeric,text,text,text,boolean,uuid)
  TO authenticated;

-- Legacy project-wide Forecast and Commercial Health RPCs remain in the
-- schema only so historical snapshots can still be read by trusted tooling.
REVOKE ALL ON FUNCTION public.get_project_cost_forecast(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_project_cost_forecast(bigint,uuid,text,numeric,jsonb,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_commercial_health(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_company_commercial_health_settings(bigint,numeric,numeric,numeric,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
