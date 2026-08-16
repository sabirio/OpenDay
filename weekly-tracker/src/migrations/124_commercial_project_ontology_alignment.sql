-- 124_commercial_project_ontology_alignment.sql
-- Align commercial functions with the canonical projects.work_ontology_version_id column.
-- Earlier definitions referenced a retired column name and failed only at runtime.

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.save_project_cost_package(bigint,uuid,text,text,text,text,text,uuid[],text,integer,uuid)'::regprocedure
  ) INTO v_definition;
  EXECUTE replace(v_definition, 'v_project.ontology_version_id', 'v_project.work_ontology_version_id');

  SELECT pg_get_functiondef(
    'public.get_project_commercial_foundation(bigint)'::regprocedure
  ) INTO v_definition;
  EXECUTE replace(v_definition, 'v_project.ontology_version_id', 'v_project.work_ontology_version_id');

  SELECT pg_get_functiondef(
    'public.create_project_tender_package(bigint,uuid,text,uuid[],text,text,uuid)'::regprocedure
  ) INTO v_definition;
  EXECUTE replace(v_definition, 'project_row.ontology_version_id', 'project_row.work_ontology_version_id');
END;
$$;

COMMIT;
