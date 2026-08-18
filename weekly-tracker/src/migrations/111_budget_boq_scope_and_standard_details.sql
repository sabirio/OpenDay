-- 111_budget_boq_scope_and_standard_details.sql
-- Budget -> BOQ scope bridge and a compact standard detail catalog.

-- Published ontology content is normally immutable. This controlled catalogue
-- completion runs once and restores the guard immediately afterwards.
ALTER TABLE public.work_ontology_boq_item_definitions
  DISABLE TRIGGER work_ontology_boq_definitions_immutable;

WITH target_groups AS (
  SELECT g.ontology_version_id,g.id AS work_group_id,g.code,g.label,d.code AS discipline_code
  FROM public.work_ontology_work_groups g
  JOIN public.work_ontology_disciplines d
    ON d.ontology_version_id=g.ontology_version_id AND d.id=g.discipline_id
  WHERE g.is_active
    AND (EXISTS(SELECT 1 FROM public.projects p WHERE p.work_ontology_version_id=g.ontology_version_id)
      OR EXISTS(SELECT 1 FROM public.work_ontology_versions v WHERE v.id=g.ontology_version_id AND v.status='PUBLISHED' AND v.is_active))
    AND NOT EXISTS(SELECT 1 FROM public.work_ontology_boq_item_definitions x WHERE x.ontology_version_id=g.ontology_version_id AND x.work_group_id=g.id)
), generated AS (
  SELECT target.*,
    slot,
    md5(target.ontology_version_id::text||':'||target.work_group_id::text||':'||slot::text) AS hash,
    CASE
      WHEN target.discipline_code='M100' THEN (ARRAY['Preparation & submission','Fees & third-party charges','Coordination & follow-up','Approval & closeout'])[slot]
      WHEN lower(target.label)~'(testing|commission|program|closeout)' THEN (ARRAY['Pre-inspection & preparation','Functional testing','Adjustments & integrated testing','Records & handover'])[slot]
      WHEN lower(target.label)~'(demolition|waste|cleaning|handling)' THEN (ARRAY['Mobilisation & preparation','Execution of works','Handling & transport','Disposal & closeout'])[slot]
      WHEN lower(target.label)~'(cable|wiring|pipe|drain|duct|containment|tray|conduit)' THEN (ARRAY['Main materials','Fittings & accessories','Installation & connections','Testing & identification'])[slot]
      WHEN lower(target.label)~'(equipment|unit|panel|fan|pump|screen|camera|door|furniture|sign|light|socket|detector)' THEN (ARRAY['Equipment supply','Supports & accessories','Installation & connections','Testing & commissioning'])[slot]
      ELSE (ARRAY['Shop drawings & submittals','Materials & components','Installation & execution','Inspection, protection & handover'])[slot]
    END AS detail_label
  FROM target_groups target CROSS JOIN generate_series(1,4) slot
)
INSERT INTO public.work_ontology_boq_item_definitions(ontology_version_id,id,work_group_id,code,label,default_unit)
SELECT ontology_version_id,
  (substr(hash,1,8)||'-'||substr(hash,9,4)||'-5'||substr(hash,14,3)||'-a'||substr(hash,18,3)||'-'||substr(hash,21,12))::uuid,
  work_group_id,code||'.'||lpad(slot::text,3,'0'),detail_label,'L.S.'
FROM generated
ON CONFLICT DO NOTHING;

ALTER TABLE public.work_ontology_boq_item_definitions
  ENABLE TRIGGER work_ontology_boq_definitions_immutable;

CREATE TABLE IF NOT EXISTS public.project_boq_unbudgeted_work_groups(
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT,
  work_group_id uuid NOT NULL,
  reason_code text NOT NULL CHECK(reason_code IN('BUDGET_OMISSION','DESIGN_CHANGE','CLIENT_REQUIREMENT','SITE_CONDITION','REGULATORY_REQUIREMENT','OTHER')),
  explanation text NOT NULL CHECK(btrim(explanation)<>'' AND char_length(explanation)<=2000),
  activated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  activated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,work_group_id),
  FOREIGN KEY(ontology_version_id,work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id,id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION private.prevent_project_boq_scope_activation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'PROJECT_BOQ_SCOPE_ACTIVATION_IMMUTABLE' USING ERRCODE='55000'; END;$$;
DROP TRIGGER IF EXISTS project_boq_scope_activation_immutable ON public.project_boq_unbudgeted_work_groups;
CREATE TRIGGER project_boq_scope_activation_immutable BEFORE UPDATE OR DELETE ON public.project_boq_unbudgeted_work_groups
FOR EACH ROW EXECUTE FUNCTION private.prevent_project_boq_scope_activation_mutation();

ALTER TABLE public.project_boq_unbudgeted_work_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_boq_unbudgeted_work_groups_select ON public.project_boq_unbudgeted_work_groups;
CREATE POLICY project_boq_unbudgeted_work_groups_select ON public.project_boq_unbudgeted_work_groups
FOR SELECT TO authenticated USING(public.can_access_project(project_id));
REVOKE ALL ON TABLE public.project_boq_unbudgeted_work_groups FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_boq_unbudgeted_work_groups TO authenticated;
REVOKE ALL ON FUNCTION private.prevent_project_boq_scope_activation_mutation() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.activate_project_boq_unbudgeted_work_group(
  p_project_id bigint,p_work_group_id uuid,p_reason_code text,p_explanation text,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_ontology uuid;v_request public.write_command_requests%ROWTYPE;v_result jsonb;v_activated_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_work_group_id IS NULL OR p_client_request_id IS NULL
    OR p_reason_code NOT IN('BUDGET_OMISSION','DESIGN_CHANGE','CLIENT_REQUIREMENT','SITE_CONDITION','REGULATORY_REQUIREMENT','OTHER')
    OR btrim(COALESCE(p_explanation,''))='' OR char_length(p_explanation)>2000
  THEN RAISE EXCEPTION 'INVALID_UNBUDGETED_BOQ_SCOPE_COMMAND' USING ERRCODE='22023';END IF;
  IF lower((SELECT role FROM public.profiles WHERE id=v_uid)) NOT IN('pm','admin') OR public.can_write_project(p_project_id) IS NOT TRUE
  THEN RAISE EXCEPTION 'BOQ_SCOPE_MANAGEMENT_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT work_ontology_version_id INTO v_ontology FROM public.projects WHERE id=p_project_id FOR SHARE;
  IF v_ontology IS NULL THEN RAISE EXCEPTION 'PROJECT_BOQ_REQUIRES_WORK_ONTOLOGY' USING ERRCODE='55000';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_budget_contributions c WHERE c.project_id=p_project_id AND c.work_group_id=p_work_group_id AND c.ontology_version_id=v_ontology AND c.amount IS NULL)
  THEN RAISE EXCEPTION 'BOQ_UNBUDGETED_ACTIVATION_REQUIRES_NOT_APPLICABLE_WORK_GROUP' USING ERRCODE='55000';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
  VALUES(v_uid,'boq.activate_unbudgeted_work_group',p_client_request_id,p_project_id) ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='boq.activate_unbudgeted_work_group' AND client_request_id=p_client_request_id;
  IF v_request.project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN
    IF (v_request.response->>'workGroupId')::uuid IS DISTINCT FROM p_work_group_id THEN RAISE EXCEPTION 'Idempotency key belongs to another Work Group' USING ERRCODE='23505';END IF;
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);
  END IF;
  INSERT INTO public.project_boq_unbudgeted_work_groups(project_id,ontology_version_id,work_group_id,reason_code,explanation,activated_by)
  VALUES(p_project_id,v_ontology,p_work_group_id,p_reason_code,btrim(p_explanation),v_uid)
  ON CONFLICT(project_id,work_group_id)DO NOTHING RETURNING activated_at INTO v_activated_at;
  IF v_activated_at IS NULL THEN SELECT activated_at INTO v_activated_at FROM public.project_boq_unbudgeted_work_groups WHERE project_id=p_project_id AND work_group_id=p_work_group_id;END IF;
  v_result:=jsonb_build_object('projectId',p_project_id,'workGroupId',p_work_group_id,'reasonCode',p_reason_code,'activatedAt',v_activated_at);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;
REVOKE ALL ON FUNCTION public.activate_project_boq_unbudgeted_work_group(bigint,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.activate_project_boq_unbudgeted_work_group(bigint,uuid,text,text,uuid) TO authenticated;
