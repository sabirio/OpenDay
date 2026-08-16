-- 123_consultant_boq_read_model.sql
-- Server-owned Consultant BOQ read model. The UI receives presentation-ready hierarchy
-- and never reconstructs commercial scope, permissions or workflow state.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_consultant_boq(
  p_tender_id uuid,
  p_capability text DEFAULT 'BOQ_PREPARE'
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_tenders tender
    WHERE tender.id = p_tender_id
      AND EXISTS (
        SELECT 1 FROM public.project_tender_cost_packages link
        WHERE link.tender_id = tender.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_tender_cost_packages link
        WHERE link.tender_id = tender.id
          AND public.has_project_capability(tender.project_id, p_capability, link.cost_package_id) IS NOT TRUE
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.validate_consultant_boq_item_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tender_id uuid;
BEGIN
  SELECT boq.tender_id INTO v_tender_id
  FROM public.project_consultant_boqs boq
  WHERE boq.id = NEW.consultant_boq_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_tender_cost_packages link
    JOIN public.project_cost_package_work_groups scope
      ON scope.cost_package_id = link.cost_package_id
     AND scope.work_group_id = NEW.work_group_id
     AND scope.ontology_version_id = NEW.ontology_version_id
    WHERE link.tender_id = v_tender_id
  ) THEN
    RAISE EXCEPTION 'CONSULTANT_BOQ_WORK_GROUP_OUT_OF_SCOPE' USING ERRCODE='23514';
  END IF;

  IF NEW.item_kind = 'STANDARD' AND NOT EXISTS (
    SELECT 1
    FROM public.work_ontology_boq_item_definitions definition
    WHERE definition.ontology_version_id = NEW.ontology_version_id
      AND definition.id = NEW.standard_definition_id
      AND definition.work_group_id = NEW.work_group_id
  ) THEN
    RAISE EXCEPTION 'CONSULTANT_BOQ_STANDARD_ITEM_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consultant_boq_item_scope_guard ON public.project_consultant_boq_items;
CREATE TRIGGER consultant_boq_item_scope_guard
BEFORE INSERT ON public.project_consultant_boq_items
FOR EACH ROW EXECUTE FUNCTION private.validate_consultant_boq_item_scope();

CREATE OR REPLACE FUNCTION public.list_my_consultant_boq_assignments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CONSULTANT_BOQ_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tenderId', tender.id,
      'tenderNumber', tender.tender_number,
      'projectId', tender.project_id,
      'projectCode', project.store_code,
      'projectName', project.shopping_mall_name,
      'boqMode', tender.boq_mode,
      'tenderStatus', tender.status,
      'consultantStatus', COALESCE(boq.status, 'NOT_STARTED'),
      'revisionNumber', COALESCE(boq.latest_revision, 0),
      'canPrepare', public.can_access_consultant_boq(tender.id, 'BOQ_PREPARE'),
      'canReview', public.has_project_capability(tender.project_id, 'TENDER_MANAGE', NULL)
    ) ORDER BY project.store_code, tender.tender_number)
    FROM public.project_tenders tender
    JOIN public.projects project ON project.id = tender.project_id
    LEFT JOIN public.project_consultant_boqs boq ON boq.tender_id = tender.id
    WHERE tender.boq_mode = 'CONSULTANT_MEASURED'
      AND (
        public.can_access_consultant_boq(tender.id, 'BOQ_PREPARE')
        OR public.has_project_capability(tender.project_id, 'TENDER_MANAGE', NULL)
      )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_consultant_boq_workspace(p_tender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tender public.project_tenders%ROWTYPE;
  v_boq public.project_consultant_boqs%ROWTYPE;
  v_latest_version_id bigint;
  v_can_prepare boolean;
  v_can_review boolean;
  v_consultant_boq_id uuid;
  v_project_boq_id uuid;
  v_items jsonb;
BEGIN
  SELECT * INTO v_tender FROM public.project_tenders WHERE id = p_tender_id;
  v_can_prepare := public.can_access_consultant_boq(p_tender_id, 'BOQ_PREPARE');
  v_can_review := v_tender.id IS NOT NULL
    AND public.has_project_capability(v_tender.project_id, 'TENDER_MANAGE', NULL);

  IF v_uid IS NULL OR v_tender.id IS NULL OR v_tender.boq_mode <> 'CONSULTANT_MEASURED'
    OR (v_can_prepare IS NOT TRUE AND v_can_review IS NOT TRUE) THEN
    RAISE EXCEPTION 'CONSULTANT_BOQ_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_boq FROM public.project_consultant_boqs WHERE tender_id = p_tender_id;
  v_consultant_boq_id := COALESCE(v_boq.id, md5('consultant-boq:' || p_tender_id::text)::uuid);
  v_project_boq_id := COALESCE(v_boq.project_boq_id, md5('project-boq:' || p_tender_id::text)::uuid);

  IF v_boq.id IS NOT NULL AND v_boq.latest_revision > 0 THEN
    SELECT id INTO v_latest_version_id
    FROM public.project_consultant_boq_versions
    WHERE consultant_boq_id = v_boq.id AND revision_number = v_boq.latest_revision;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'lineId', item.line_id,
      'workGroupId', item.work_group_id,
      'itemKind', item.item_kind,
      'standardDefinitionId', item.standard_definition_id,
      'description', item.description,
      'specification', item.specification,
      'unit', item.unit,
      'consultantQuantity', item.consultant_quantity,
      'reference', item.reference,
      'sortOrder', item.sort_order,
      'workGroupCode', group_row.code,
      'workGroupLabel', group_row.label,
      'disciplineCode', discipline.code,
      'disciplineLabel', discipline.label,
      'disciplineOrder', discipline.display_order,
      'workGroupOrder', group_row.display_order
    ) ORDER BY discipline.display_order, group_row.display_order, item.sort_order, item.line_id), '[]'::jsonb)
    INTO v_items
    FROM public.project_consultant_boq_items item
    JOIN public.work_ontology_work_groups group_row
      ON group_row.ontology_version_id = item.ontology_version_id AND group_row.id = item.work_group_id
    JOIN public.work_ontology_disciplines discipline
      ON discipline.ontology_version_id = group_row.ontology_version_id AND discipline.id = group_row.discipline_id
    WHERE item.consultant_boq_version_id = v_latest_version_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'lineId', overlay(overlay(md5(p_tender_id::text || ':' || definition.id::text) placing '5' from 13 for 1) placing 'a' from 17 for 1)::uuid,
      'workGroupId', definition.work_group_id,
      'itemKind', 'STANDARD',
      'standardDefinitionId', definition.id,
      'description', definition.label,
      'specification', NULL,
      'unit', definition.default_unit,
      'consultantQuantity', NULL,
      'reference', definition.code,
      'sortOrder', 0,
      'workGroupCode', group_row.code,
      'workGroupLabel', group_row.label,
      'disciplineCode', discipline.code,
      'disciplineLabel', discipline.label,
      'disciplineOrder', discipline.display_order,
      'workGroupOrder', group_row.display_order
    ) ORDER BY discipline.display_order, group_row.display_order, definition.code), '[]'::jsonb)
    INTO v_items
    FROM public.work_ontology_boq_item_definitions definition
    JOIN public.work_ontology_work_groups group_row
      ON group_row.ontology_version_id = definition.ontology_version_id AND group_row.id = definition.work_group_id
    JOIN public.work_ontology_disciplines discipline
      ON discipline.ontology_version_id = group_row.ontology_version_id AND discipline.id = group_row.discipline_id
    WHERE definition.ontology_version_id = v_tender.ontology_version_id
      AND EXISTS (
        SELECT 1
        FROM public.project_tender_cost_packages link
        JOIN public.project_cost_package_work_groups scope
          ON scope.cost_package_id = link.cost_package_id
         AND scope.work_group_id = definition.work_group_id
         AND scope.ontology_version_id = definition.ontology_version_id
        WHERE link.tender_id = p_tender_id
      );
  END IF;

  RETURN jsonb_build_object(
    'tenderId', v_tender.id,
    'tenderNumber', v_tender.tender_number,
    'projectId', v_tender.project_id,
    'projectCode', (SELECT project.store_code FROM public.projects project WHERE project.id = v_tender.project_id),
    'projectName', (SELECT project.shopping_mall_name FROM public.projects project WHERE project.id = v_tender.project_id),
    'currencyCode', (SELECT project.currency_code FROM public.projects project WHERE project.id = v_tender.project_id),
    'boqMode', v_tender.boq_mode,
    'consultantBoqId', v_consultant_boq_id,
    'projectBoqId', v_project_boq_id,
    'status', COALESCE(v_boq.status, 'NOT_STARTED'),
    'revisionNumber', COALESCE(v_boq.latest_revision, 0),
    'issuedProjectBoqVersionId', v_boq.issued_project_boq_version_id,
    'canPrepare', v_can_prepare,
    'canReview', v_can_review,
    'items', v_items,
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'eventType', event.event_type,
        'revisionNumber', event.revision_number,
        'snapshot', event.snapshot,
        'occurredAt', event.occurred_at
      ) ORDER BY event.occurred_at DESC, event.id DESC)
      FROM public.project_consultant_boq_events event
      WHERE event.consultant_boq_id = v_boq.id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.validate_consultant_boq_item_scope(),
  public.list_my_consultant_boq_assignments(), public.get_consultant_boq_workspace(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_consultant_boq_assignments(),
  public.get_consultant_boq_workspace(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_consultant_boq(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_consultant_boq(uuid,text) TO authenticated;

COMMIT;
