-- 126_tender_setup_package_guard.sql
-- Tender Setup is a revision of an existing Tender Package and cannot create or widen it.

BEGIN;

ALTER FUNCTION public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid)
  RENAME TO save_project_tender_setup_legacy_create_tender;
REVOKE ALL ON FUNCTION public.save_project_tender_setup_legacy_create_tender(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_project_tender_setup(
  p_project_id bigint,p_tender_id uuid,p_tender_number text,p_title text,p_deadline_at timestamptz,
  p_currency_code text,p_tender_rules text,p_invitation_message text,p_issued_boq_version_id bigint,
  p_work_group_ids jsonb,p_participants jsonb,p_expected_latest_revision integer,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tender public.project_tenders%ROWTYPE;v_project public.projects%ROWTYPE;v_expected_scope integer;v_provided_scope integer;
BEGIN
  SELECT*INTO v_tender FROM public.project_tenders WHERE id=p_tender_id;
  SELECT*INTO v_project FROM public.projects WHERE id=p_project_id;
  IF v_tender.id IS NULL OR v_tender.project_id<>p_project_id OR v_tender.tender_number<>p_tender_number OR NOT EXISTS(SELECT 1 FROM public.project_tender_cost_packages link WHERE link.tender_id=p_tender_id)THEN
    RAISE EXCEPTION'TENDER_PACKAGE_REQUIRED_BEFORE_SETUP'USING ERRCODE='55000';
  END IF;
  IF p_currency_code<>v_project.currency_code THEN RAISE EXCEPTION'TENDER_SETUP_CURRENCY_MISMATCH'USING ERRCODE='22023';END IF;
  SELECT count(DISTINCT scope.work_group_id)INTO v_expected_scope FROM public.project_tender_cost_packages link JOIN public.project_cost_package_work_groups scope ON scope.cost_package_id=link.cost_package_id WHERE link.tender_id=p_tender_id;
  SELECT count(DISTINCT value::uuid)INTO v_provided_scope FROM jsonb_array_elements_text(p_work_group_ids)value;
  IF v_expected_scope<>v_provided_scope OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_work_group_ids)value WHERE NOT EXISTS(SELECT 1 FROM public.project_tender_cost_packages link JOIN public.project_cost_package_work_groups scope ON scope.cost_package_id=link.cost_package_id WHERE link.tender_id=p_tender_id AND scope.work_group_id=value::uuid))THEN
    RAISE EXCEPTION'TENDER_SETUP_SCOPE_MUST_MATCH_COST_PACKAGES'USING ERRCODE='22023';
  END IF;
  RETURN public.save_project_tender_setup_legacy_create_tender(p_project_id,p_tender_id,p_tender_number,p_title,p_deadline_at,p_currency_code,p_tender_rules,p_invitation_message,p_issued_boq_version_id,p_work_group_ids,p_participants,p_expected_latest_revision,p_client_request_id);
END;$$;

REVOKE ALL ON FUNCTION public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid)TO authenticated;

COMMIT;
