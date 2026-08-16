-- 071_project_boq_excel_compatibility.sql
-- Roadmap Phase C.15: auditable Excel-import provenance for native BOQ revisions.
-- Workbook parsing and validation remain application concerns; PostgreSQL remains the source of truth.

CREATE OR REPLACE FUNCTION private.apply_project_boq_revision_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('openday.project_boq_revision_source', true) = 'IMPORT' THEN
    NEW.source_kind := 'IMPORT';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_boq_versions_apply_source ON public.project_boq_versions;
CREATE TRIGGER project_boq_versions_apply_source
  BEFORE INSERT ON public.project_boq_versions
  FOR EACH ROW EXECUTE FUNCTION private.apply_project_boq_revision_source();

REVOKE ALL ON FUNCTION private.apply_project_boq_revision_source()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.import_project_boq_revision(
  p_project_id bigint,
  p_boq_id uuid,
  p_title text,
  p_currency_code text,
  p_items jsonb,
  p_expected_latest_revision integer,
  p_revision_note text,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.set_config('openday.project_boq_revision_source', 'IMPORT', true);
  RETURN public.save_project_boq_revision(
    p_project_id,
    p_boq_id,
    p_title,
    p_currency_code,
    p_items,
    p_expected_latest_revision,
    p_revision_note,
    p_client_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_project_boq_revision(
  bigint, uuid, text, text, jsonb, integer, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_project_boq_revision(
  bigint, uuid, text, text, jsonb, integer, text, uuid
) TO authenticated;
