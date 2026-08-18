-- 144_project_procurement_strategy.sql
-- Project-level sourcing decisions without mutating the canonical Work Ontology.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_procurement_strategies (
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT,
  section_code text NOT NULL CHECK (section_code IN (
    'CONSTRUCTION','SECURITY','IT_LOW_CURRENT','FURNITURE_JOINERY','SIGNAGE_GRAPHICS','AUDIOVISUAL'
  )),
  procurement_method text NOT NULL CHECK (procurement_method IN (
    'NOT_SELECTED','COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','REQUEST_FOR_QUOTATION',
    'DIRECT_AWARD','CLIENT_NOMINATED_CONTRACTOR','NOT_APPLICABLE'
  )),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, section_code)
);

CREATE TABLE IF NOT EXISTS public.project_procurement_strategy_events (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  section_code text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, section_code, revision)
);

CREATE INDEX IF NOT EXISTS project_procurement_strategy_events_project_idx
  ON public.project_procurement_strategy_events(project_id, occurred_at DESC);

DROP TRIGGER IF EXISTS project_procurement_strategy_events_immutable ON public.project_procurement_strategy_events;
CREATE TRIGGER project_procurement_strategy_events_immutable
  BEFORE UPDATE OR DELETE ON public.project_procurement_strategy_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_commercial_event_mutation();

ALTER TABLE public.project_procurement_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_procurement_strategy_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_procurement_strategies_internal_select ON public.project_procurement_strategies;
CREATE POLICY project_procurement_strategies_internal_select ON public.project_procurement_strategies
  FOR SELECT TO authenticated USING (
    lower((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))) IN ('pm','admin')
    AND (SELECT public.can_access_project(project_id))
  );
DROP POLICY IF EXISTS project_procurement_strategy_events_internal_select ON public.project_procurement_strategy_events;
CREATE POLICY project_procurement_strategy_events_internal_select ON public.project_procurement_strategy_events
  FOR SELECT TO authenticated USING (
    lower((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))) IN ('pm','admin')
    AND (SELECT public.can_access_project(project_id))
  );

REVOKE ALL ON TABLE public.project_procurement_strategies, public.project_procurement_strategy_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_procurement_strategies, public.project_procurement_strategy_events TO authenticated;
REVOKE ALL ON SEQUENCE public.project_procurement_strategy_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_project_procurement_strategy(p_project_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_role text; v_project public.projects%ROWTYPE;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_uid IS NULL OR v_role NOT IN ('pm','admin') OR public.can_access_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PROCUREMENT_STRATEGY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL OR v_project.work_ontology_version_id IS NULL THEN
    RAISE EXCEPTION 'PROCUREMENT_STRATEGY_REQUIRES_PROJECT_ONTOLOGY' USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'ontologyVersionId', v_project.work_ontology_version_id,
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sectionCode', strategy.section_code,
        'procurementMethod', strategy.procurement_method,
        'revision', strategy.revision,
        'updatedAt', strategy.updated_at
      ) ORDER BY CASE strategy.section_code
        WHEN 'CONSTRUCTION' THEN 10 WHEN 'SECURITY' THEN 20 WHEN 'IT_LOW_CURRENT' THEN 30
        WHEN 'FURNITURE_JOINERY' THEN 40 WHEN 'SIGNAGE_GRAPHICS' THEN 50 ELSE 60 END)
      FROM public.project_procurement_strategies strategy WHERE strategy.project_id = p_project_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_project_procurement_strategy(
  p_project_id bigint, p_sections jsonb, p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_role text; v_project public.projects%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE; v_row jsonb; v_existing public.project_procurement_strategies%ROWTYPE;
  v_section_code text; v_method text; v_expected integer; v_revision integer; v_result jsonb;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_uid IS NULL OR v_role NOT IN ('pm','admin') OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PROCUREMENT_STRATEGY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL OR v_project.work_ontology_version_id IS NULL THEN
    RAISE EXCEPTION 'PROCUREMENT_STRATEGY_REQUIRES_PROJECT_ONTOLOGY' USING ERRCODE = '55000';
  END IF;
  IF p_client_request_id IS NULL OR p_sections IS NULL OR jsonb_typeof(p_sections) <> 'array' OR jsonb_array_length(p_sections) <> 6
    OR (SELECT count(DISTINCT value->>'sectionCode') FROM jsonb_array_elements(p_sections) value) <> 6
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_sections) value WHERE
      COALESCE(value->>'sectionCode','') NOT IN ('CONSTRUCTION','SECURITY','IT_LOW_CURRENT','FURNITURE_JOINERY','SIGNAGE_GRAPHICS','AUDIOVISUAL')
      OR COALESCE(value->>'procurementMethod','') NOT IN ('NOT_SELECTED','COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','REQUEST_FOR_QUOTATION','DIRECT_AWARD','CLIENT_NOMINATED_CONTRACTOR','NOT_APPLICABLE')
      OR COALESCE(value->>'expectedRevision','') !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'INVALID_PROCUREMENT_STRATEGY_COMMAND' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
    VALUES(v_uid, 'commercial.procurement_strategy.save', p_client_request_id, p_project_id)
    ON CONFLICT(actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id = v_uid
    AND operation = 'commercial.procurement_strategy.save' AND client_request_id = p_client_request_id;
  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;

  PERFORM pg_advisory_xact_lock(p_project_id);
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_sections) value LOOP
    v_section_code := v_row->>'sectionCode';
    v_method := v_row->>'procurementMethod';
    v_expected := (v_row->>'expectedRevision')::integer;
    SELECT * INTO v_existing FROM public.project_procurement_strategies
      WHERE project_id = p_project_id AND section_code = v_section_code FOR UPDATE;
    IF v_existing.project_id IS NULL THEN
      IF v_expected <> 0 THEN RAISE EXCEPTION 'PROCUREMENT_STRATEGY_REVISION_CONFLICT' USING ERRCODE = '40001'; END IF;
      v_revision := 1;
      INSERT INTO public.project_procurement_strategies(
        project_id, ontology_version_id, section_code, procurement_method, revision, created_by, updated_by
      ) VALUES(p_project_id, v_project.work_ontology_version_id, v_section_code, v_method, v_revision, v_uid, v_uid);
    ELSE
      IF v_existing.ontology_version_id <> v_project.work_ontology_version_id OR v_existing.revision <> v_expected THEN
        RAISE EXCEPTION 'PROCUREMENT_STRATEGY_REVISION_CONFLICT' USING ERRCODE = '40001';
      END IF;
      v_revision := v_existing.revision + 1;
      UPDATE public.project_procurement_strategies SET procurement_method = v_method, revision = v_revision,
        updated_by = v_uid, updated_at = now() WHERE project_id = p_project_id AND section_code = v_section_code;
    END IF;
    INSERT INTO public.project_procurement_strategy_events(project_id, section_code, revision, snapshot, actor_id)
      VALUES(p_project_id, v_section_code, v_revision, jsonb_build_object(
        'projectId', p_project_id, 'sectionCode', v_section_code, 'procurementMethod', v_method,
        'ontologyVersionId', v_project.work_ontology_version_id, 'revision', v_revision
      ), v_uid);
    v_existing := NULL;
  END LOOP;

  v_result := public.get_project_procurement_strategy(p_project_id);
  UPDATE public.write_command_requests SET response = v_result, completed_at = now() WHERE id = v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_procurement_strategy(bigint),
  public.save_project_procurement_strategy(bigint,jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_procurement_strategy(bigint),
  public.save_project_procurement_strategy(bigint,jsonb,uuid) TO authenticated;

COMMIT;
