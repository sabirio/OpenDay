BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF has_column_privilege('authenticated', 'public.projects', 'budget', 'INSERT')
    OR has_column_privilege('authenticated', 'public.projects', 'budget', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.projects', 'actual_cost', 'INSERT')
    OR has_column_privilege('authenticated', 'public.projects', 'actual_cost', 'UPDATE') THEN
    RAISE EXCEPTION 'legacy project financial columns remain browser-writable';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.projects', 'store_code', 'INSERT')
    OR NOT has_column_privilege('authenticated', 'public.projects', 'store_code', 'UPDATE') THEN
    RAISE EXCEPTION 'normal project master-data writes were removed';
  END IF;
  IF has_function_privilege('authenticated', 'public.create_project_cost_forecast(bigint,uuid,text,numeric,jsonb,text,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.get_project_cost_forecast(bigint)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.get_project_commercial_health(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy project-level financial RPC remains executable';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.create_cost_package_forecast(bigint,uuid,uuid,numeric,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'canonical Cost Package Forecast RPC is unavailable';
  END IF;
  SELECT pg_get_functiondef('public.save_project_cost_closeout(bigint,uuid,numeric,text,text,text,boolean,uuid)'::regprocedure)
    INTO v_definition;
  IF position('project_cost_package_forecast_total' IN v_definition) = 0
    OR position('project_cost_forecast_versions' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Cost Closeout still depends on project-level Forecast';
  END IF;
END;
$$;

ROLLBACK;
