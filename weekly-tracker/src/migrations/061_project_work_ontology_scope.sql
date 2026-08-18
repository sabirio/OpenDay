-- 061_project_work_ontology_scope.sql
-- Pins new-project Discipline scope to one published Work Ontology version.
-- Existing projects remain nullable and are not backfilled.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_and_pin_project_work_ontology()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  requested_version_id uuid;
  requested_discipline_count integer;
  distinct_discipline_count integer;
  valid_discipline_count integer;
BEGIN
  IF NEW.scope ? 'workOntologyVersionId' THEN
    BEGIN
      requested_version_id := (NEW.scope->>'workOntologyVersionId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_DISCIPLINE_SCOPE: work ontology version id must be a UUID'
        USING ERRCODE = '22023';
    END;

    IF jsonb_typeof(NEW.scope->'disciplineIds') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'INVALID_DISCIPLINE_SCOPE: disciplineIds must be an array'
        USING ERRCODE = '22023';
    END IF;

    SELECT count(*), count(DISTINCT value)
      INTO requested_discipline_count, distinct_discipline_count
    FROM jsonb_array_elements_text(NEW.scope->'disciplineIds');

    IF requested_discipline_count = 0 OR requested_discipline_count <> distinct_discipline_count THEN
      RAISE EXCEPTION 'INVALID_DISCIPLINE_SCOPE: select one or more unique disciplines'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.work_ontology_versions version
      WHERE version.id = requested_version_id
        AND version.status = 'PUBLISHED'
        AND version.is_active = true
        AND (version.company_id IS NULL OR version.company_id IS NOT DISTINCT FROM NEW.company_id)
    ) THEN
      RAISE EXCEPTION 'WORK_ONTOLOGY_NOT_CONFIGURED: requested active ontology is unavailable for this company'
        USING ERRCODE = 'P0002';
    END IF;

    BEGIN
      SELECT count(*) INTO valid_discipline_count
      FROM public.work_ontology_disciplines discipline
      WHERE discipline.ontology_version_id = requested_version_id
        AND discipline.scope_selectable = true
        AND discipline.id IN (
          SELECT value::uuid
          FROM jsonb_array_elements_text(NEW.scope->'disciplineIds')
        );
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_DISCIPLINE_SCOPE: every discipline id must be a UUID'
        USING ERRCODE = '22023';
    END;

    IF valid_discipline_count <> requested_discipline_count THEN
      RAISE EXCEPTION 'INVALID_DISCIPLINE_SCOPE: every discipline must belong to the pinned ontology version'
        USING ERRCODE = '22023';
    END IF;

    IF TG_OP = 'UPDATE'
      AND OLD.work_ontology_version_id IS NOT NULL
      AND requested_version_id IS DISTINCT FROM OLD.work_ontology_version_id THEN
      RAISE EXCEPTION 'PROJECT_WORK_ONTOLOGY_VERSION_IMMUTABLE: existing projects remain pinned'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.work_ontology_version_id IS NOT NULL
      AND NEW.work_ontology_version_id IS DISTINCT FROM requested_version_id THEN
      RAISE EXCEPTION 'INVALID_DISCIPLINE_SCOPE: project version and Scope version do not match'
        USING ERRCODE = '22023';
    END IF;

    NEW.work_ontology_version_id := requested_version_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.work_ontology_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'PROJECT_WORK_ONTOLOGY_VERSION_IMMUTABLE: ontology metadata cannot be removed'
      USING ERRCODE = '23514';
  ELSIF NEW.work_ontology_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_DISCIPLINE_SCOPE: pinned projects require ontology metadata in Scope'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_validate_work_ontology_scope ON public.projects;
CREATE TRIGGER projects_validate_work_ontology_scope
  BEFORE INSERT OR UPDATE OF scope, work_ontology_version_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_and_pin_project_work_ontology();

REVOKE ALL ON FUNCTION public.validate_and_pin_project_work_ontology()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
