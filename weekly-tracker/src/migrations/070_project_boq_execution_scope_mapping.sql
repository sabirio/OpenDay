-- 070_project_boq_execution_scope_mapping.sql
-- Roadmap Phase C.14: deterministic BOQ revision -> Execution Scope mapping.
-- Detailed BOQ lines collapse to distinct canonical Work Groups; no Gantt
-- activities, dates, durations, dependencies or tender-award state are made.

ALTER TABLE public.project_execution_scope_versions
  DROP CONSTRAINT IF EXISTS project_execution_scope_versions_source_kind_check;
ALTER TABLE public.project_execution_scope_versions
  ADD COLUMN IF NOT EXISTS source_boq_version_id bigint;
ALTER TABLE public.project_execution_scope_versions
  ADD CONSTRAINT project_execution_scope_versions_source_kind_check
  CHECK (source_kind IN ('PM_DISCIPLINE_SCOPE', 'BOQ_REVISION'));
ALTER TABLE public.project_execution_scope_versions
  ADD CONSTRAINT project_execution_scope_versions_source_boq_version_fk
  FOREIGN KEY (source_boq_version_id)
  REFERENCES public.project_boq_versions(id) ON DELETE RESTRICT;
ALTER TABLE public.project_execution_scope_versions
  ADD CONSTRAINT project_execution_scope_versions_source_shape_check
  CHECK (
    (source_kind = 'PM_DISCIPLINE_SCOPE' AND source_boq_version_id IS NULL)
    OR (source_kind = 'BOQ_REVISION' AND source_boq_version_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS project_execution_scope_versions_boq_source_uniq
  ON public.project_execution_scope_versions(project_id, source_boq_version_id)
  WHERE source_boq_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.materialize_project_execution_scope_from_boq(
  p_project_id bigint,
  p_boq_version_id bigint,
  p_expected_latest_scope_revision integer,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_project public.projects%ROWTYPE;
  v_boq_version public.project_boq_versions%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_existing_scope public.project_execution_scope_versions%ROWTYPE;
  v_current_revision integer;
  v_next_revision integer;
  v_scope_version_id bigint;
  v_project_discipline_ids uuid[];
  v_selected_discipline_ids uuid[];
  v_boq_line_count integer;
  v_work_group_count integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_boq_version_id IS NULL OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'boq_version_id and client_request_id are required' USING ERRCODE = '22023';
  END IF;
  IF p_expected_latest_scope_revision IS NULL OR p_expected_latest_scope_revision < 0 THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_SCOPE_REVISION' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'boq.materialize_execution_scope', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests request
  WHERE request.actor_id = v_uid
    AND request.operation = 'boq.materialize_execution_scope'
    AND request.client_request_id = p_client_request_id;

  IF v_request.project_id IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    IF (v_request.response->>'sourceBoqVersionId')::bigint IS DISTINCT FROM p_boq_version_id THEN
      RAISE EXCEPTION 'Idempotency key belongs to another BOQ version' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  SELECT * INTO v_project
  FROM public.projects project
  WHERE project.id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;
  IF v_project.work_ontology_version_id IS NULL THEN
    RAISE EXCEPTION 'PROJECT_EXECUTION_SCOPE_REQUIRES_WORK_ONTOLOGY' USING ERRCODE = '55000';
  END IF;

  SELECT lower(profile.role) INTO v_role
  FROM public.profiles profile WHERE profile.id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('pm', 'admin')
     OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized to materialize Execution Scope' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_boq_version
  FROM public.project_boq_versions version
  WHERE version.id = p_boq_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOQ version % not found', p_boq_version_id USING ERRCODE = 'P0002';
  END IF;
  IF v_boq_version.project_id IS DISTINCT FROM p_project_id
     OR v_boq_version.ontology_version_id IS DISTINCT FROM v_project.work_ontology_version_id THEN
    RAISE EXCEPTION 'BOQ_EXECUTION_SCOPE_SOURCE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT array_agg(value::uuid ORDER BY value::uuid)
    INTO v_project_discipline_ids
  FROM jsonb_array_elements_text(v_project.scope->'disciplineIds') value;

  IF EXISTS (
    SELECT 1
    FROM public.project_boq_items item
    JOIN public.work_ontology_work_groups work_group
      ON work_group.ontology_version_id = item.ontology_version_id
     AND work_group.id = item.work_group_id
    WHERE item.boq_version_id = p_boq_version_id
      AND NOT (work_group.discipline_id = ANY(v_project_discipline_ids))
  ) THEN
    RAISE EXCEPTION 'BOQ_WORK_GROUP_OUTSIDE_PROJECT_DISCIPLINE_SCOPE' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(DISTINCT item.work_group_id)
    INTO v_boq_line_count, v_work_group_count
  FROM public.project_boq_items item
  WHERE item.boq_version_id = p_boq_version_id;
  IF v_boq_line_count = 0 OR v_work_group_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_BOQ_EXECUTION_SCOPE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing_scope
  FROM public.project_execution_scope_versions scope
  WHERE scope.project_id = p_project_id
    AND scope.source_boq_version_id = p_boq_version_id;
  IF FOUND THEN
    v_result := jsonb_build_object(
      'projectId', p_project_id,
      'executionScopeVersionId', v_existing_scope.id,
      'revisionNumber', v_existing_scope.revision_number,
      'sourceKind', v_existing_scope.source_kind,
      'sourceBoqVersionId', p_boq_version_id,
      'boqLineCount', v_boq_line_count,
      'workGroupCount', v_work_group_count,
      'collapsedLineCount', v_boq_line_count - v_work_group_count,
      'alreadyMaterialized', true
    );
    UPDATE public.write_command_requests
    SET response = v_result, completed_at = now() WHERE id = v_request.id;
    RETURN v_result || jsonb_build_object('idempotentReplay', false);
  END IF;

  SELECT COALESCE(max(scope.revision_number), 0)
    INTO v_current_revision
  FROM public.project_execution_scope_versions scope
  WHERE scope.project_id = p_project_id;
  IF v_current_revision IS DISTINCT FROM p_expected_latest_scope_revision THEN
    RAISE EXCEPTION 'EXECUTION_SCOPE_REVISION_CONFLICT: expected %, current %',
      p_expected_latest_scope_revision, v_current_revision USING ERRCODE = '40001';
  END IF;

  SELECT array_agg(selected.discipline_id ORDER BY selected.discipline_display_order, selected.discipline_id)
    INTO v_selected_discipline_ids
  FROM (
    SELECT DISTINCT discipline.id AS discipline_id, discipline.display_order AS discipline_display_order
    FROM public.project_boq_items item
    JOIN public.work_ontology_work_groups work_group
      ON work_group.ontology_version_id = item.ontology_version_id
     AND work_group.id = item.work_group_id
    JOIN public.work_ontology_disciplines discipline
      ON discipline.ontology_version_id = work_group.ontology_version_id
     AND discipline.id = work_group.discipline_id
    WHERE item.boq_version_id = p_boq_version_id
  ) selected;

  v_next_revision := v_current_revision + 1;
  INSERT INTO public.project_execution_scope_versions(
    project_id, ontology_version_id, revision_number, source_kind,
    source_fingerprint, selected_discipline_ids, source_boq_version_id, created_by
  ) VALUES (
    p_project_id, v_boq_version.ontology_version_id, v_next_revision, 'BOQ_REVISION',
    'BOQ_REVISION:' || p_boq_version_id::text,
    v_selected_discipline_ids, p_boq_version_id, v_uid
  ) RETURNING id INTO v_scope_version_id;

  INSERT INTO public.project_execution_scope_items(
    execution_scope_version_id, ontology_version_id, discipline_id, work_group_id
  )
  SELECT DISTINCT
    v_scope_version_id, item.ontology_version_id, work_group.discipline_id, item.work_group_id
  FROM public.project_boq_items item
  JOIN public.work_ontology_work_groups work_group
    ON work_group.ontology_version_id = item.ontology_version_id
   AND work_group.id = item.work_group_id
  WHERE item.boq_version_id = p_boq_version_id
  ORDER BY work_group.discipline_id, item.work_group_id;

  v_result := jsonb_build_object(
    'projectId', p_project_id,
    'executionScopeVersionId', v_scope_version_id,
    'revisionNumber', v_next_revision,
    'sourceKind', 'BOQ_REVISION',
    'sourceBoqVersionId', p_boq_version_id,
    'boqLineCount', v_boq_line_count,
    'workGroupCount', v_work_group_count,
    'collapsedLineCount', v_boq_line_count - v_work_group_count,
    'alreadyMaterialized', false
  );
  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now() WHERE id = v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_project_execution_scope_from_boq(
  bigint, bigint, integer, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.materialize_project_execution_scope_from_boq(
  bigint, bigint, integer, uuid
) TO authenticated;
