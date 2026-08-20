-- Local database certification for 151_product_capability_catalog.sql.
BEGIN;

DO $product_capability_structure$
DECLARE
  v_table text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id = '151_product_capability_catalog'
      AND sequence_number = 151
      AND filename = '151_product_capability_catalog.sql'
      AND sha256 = '080a71b081d4050cab5a5a849ef1453e5edcd028b55967ea70583debc52ff0c8'
  ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_LEDGER_MISMATCH';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'product_capability_groups','product_capability_catalog',
    'product_capability_dependencies'
  ] LOOP
    IF to_regclass('public.'||v_table) IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_TABLE_MISSING: %',v_table;
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM pg_class
      WHERE oid = ('public.'||v_table)::regclass AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_RLS_DISABLED: %',v_table;
    END IF;
    IF has_table_privilege('anon','public.'||v_table,'SELECT')
      OR has_table_privilege('service_role','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.'||v_table,'INSERT,UPDATE,DELETE')
      OR NOT has_table_privilege('authenticated','public.'||v_table,'SELECT') THEN
      RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_TABLE_ACL_MISMATCH: %',v_table;
    END IF;
  END LOOP;

  IF has_function_privilege(
      'authenticated','private.prevent_product_capability_identity_change()','EXECUTE'
    ) OR has_function_privilege(
      'authenticated','private.assert_product_capability_graph_acyclic()','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_PRIVATE_FUNCTION_EXPOSED';
  END IF;
END
$product_capability_structure$;

DO $product_capability_content$
DECLARE
  v_project_permission_count integer;
BEGIN
  IF (SELECT count(*) FROM public.product_capability_groups) <> 7
    OR (SELECT count(*) FROM public.product_capability_catalog) <> 33
    OR (SELECT count(*) FROM public.product_capability_dependencies) <> 31 THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_SEED_COUNT_MISMATCH';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.product_capability_catalog
    WHERE id !~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
      OR jsonb_typeof(config_schema) <> 'object'
  ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_CANONICAL_ID_OR_CONFIG_INVALID';
  END IF;

  SELECT count(*) INTO v_project_permission_count
  FROM public.project_capability_catalog;
  IF v_project_permission_count <> 10
    OR EXISTS(
      SELECT 1 FROM public.product_capability_catalog product
      JOIN public.project_capability_catalog project_permission
        ON project_permission.code = product.id
    ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_PROJECT_PERMISSION_CATALOG_REUSED';
  END IF;

  IF NOT EXISTS(
      SELECT 1 FROM public.product_capability_catalog
      WHERE id = 'commercial.margin'
    ) OR NOT EXISTS(
      SELECT 1 FROM public.product_capability_dependencies
      WHERE capability_id = 'commercial.margin'
        AND required_capability_id = 'commercial.cost'
    ) OR NOT EXISTS(
      SELECT 1 FROM public.product_capability_dependencies
      WHERE capability_id = 'commercial.margin'
        AND required_capability_id = 'commercial.revenue'
    ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_MARGIN_DEPENDENCY_MISSING';
  END IF;

  IF EXISTS(
    WITH RECURSIVE dependency_path(root_id,current_id,path,cycle) AS(
      SELECT capability_id,required_capability_id,
        ARRAY[capability_id,required_capability_id]::text[],false
      FROM public.product_capability_dependencies
      UNION ALL
      SELECT dependency_path.root_id,dependency.required_capability_id,
        dependency_path.path||dependency.required_capability_id,
        dependency.required_capability_id = ANY(dependency_path.path)
      FROM dependency_path
      JOIN public.product_capability_dependencies dependency
        ON dependency.capability_id = dependency_path.current_id
      WHERE NOT dependency_path.cycle
    )
    SELECT 1 FROM dependency_path WHERE cycle
  ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_GRAPH_CONTAINS_CYCLE';
  END IF;
END
$product_capability_content$;

DO $product_capability_guards$
DECLARE
  v_identity_blocked boolean := false;
  v_cycle_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.product_capability_catalog
    SET id = 'core.projects.changed' WHERE id = 'core.projects';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_identity_blocked := true;
  END;
  IF NOT v_identity_blocked THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_ID_CHANGE_ALLOWED';
  END IF;

  BEGIN
    SET CONSTRAINTS product_capability_dependency_graph_acyclic DEFERRED;
    INSERT INTO public.product_capability_dependencies(
      capability_id,required_capability_id
    ) VALUES('core.projects','core.team');
    SET CONSTRAINTS product_capability_dependency_graph_acyclic IMMEDIATE;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_cycle_blocked := true;
  END;
  IF NOT v_cycle_blocked THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_CYCLE_ALLOWED';
  END IF;
END
$product_capability_guards$;

SET LOCAL ROLE authenticated;

DO $product_capability_authenticated_read$
BEGIN
  IF (SELECT count(*) FROM public.product_capability_groups) <> 7
    OR (SELECT count(*) FROM public.product_capability_catalog) <> 33
    OR (SELECT count(*) FROM public.product_capability_dependencies) <> 31 THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_151_AUTHENTICATED_READ_FAILED';
  END IF;
END
$product_capability_authenticated_read$;

RESET ROLE;
ROLLBACK;
