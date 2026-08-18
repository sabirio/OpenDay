-- 133_project_access_alignment.sql
-- Align generic project visibility with the canonical Project Team model.
-- Management authority remains capability-based; Contractor access remains
-- assignment-based. Budget owners must be active members of this project.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_own_project_row(p_project_id bigint,p_company_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;v_company text;v_assignments integer[];
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false;END IF;
  SELECT lower(profile.role),profile.company_id,COALESCE(profile.assigned_projects,'{}')
    INTO v_role,v_company,v_assignments FROM public.profiles profile WHERE profile.id=auth.uid();
  IF NOT FOUND THEN RETURN false;END IF;
  IF v_role='admin' THEN RETURN v_company IS NULL OR p_company_id IS NULL OR v_company=p_company_id;END IF;
  IF v_role='contractor' THEN
    RETURN p_project_id=ANY(v_assignments::bigint[]) AND (v_company IS NULL OR p_company_id IS NULL OR v_company=p_company_id);
  END IF;
  IF v_role NOT IN('pm','consultant','approver','executive') THEN RETURN false;END IF;
  RETURN (v_company IS NULL OR p_company_id IS NULL OR v_company=p_company_id)
    AND public.is_active_project_member(p_project_id,auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;v_company text;v_project_company text;v_assignments integer[];
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false;END IF;
  SELECT lower(profile.role),profile.company_id,COALESCE(profile.assigned_projects,'{}')
    INTO v_role,v_company,v_assignments FROM public.profiles profile WHERE profile.id=auth.uid();
  IF NOT FOUND THEN RETURN false;END IF;
  SELECT project.company_id INTO v_project_company FROM public.projects project WHERE project.id=p_project_id;
  IF NOT FOUND THEN RETURN false;END IF;
  IF v_role='admin' THEN RETURN v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company;END IF;
  IF v_role='contractor' THEN
    RETURN p_project_id=ANY(v_assignments::bigint[]) AND (v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company);
  END IF;
  IF v_role NOT IN('pm','consultant','approver','executive') THEN RETURN false;END IF;
  RETURN (v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company)
    AND public.is_active_project_member(p_project_id,auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_project_team_profile_role()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_organization_role text;
BEGIN
  SELECT lower(profile.role) INTO v_organization_role FROM public.profiles profile WHERE profile.id=NEW.user_id;
  IF v_organization_role IS NULL THEN RAISE EXCEPTION 'PROJECT_TEAM_PROFILE_NOT_FOUND' USING ERRCODE='23503';END IF;
  IF (NEW.project_role='FUNCTION_OWNER' AND v_organization_role NOT IN('pm','consultant','approver','executive'))
    OR (NEW.project_role<>'FUNCTION_OWNER' AND v_organization_role<>lower(NEW.project_role)) THEN
    RAISE EXCEPTION 'PROJECT_TEAM_PROFILE_ROLE_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS project_team_profile_role_guard ON public.project_team_memberships;
CREATE TRIGGER project_team_profile_role_guard BEFORE INSERT OR UPDATE OF user_id,project_role ON public.project_team_memberships
FOR EACH ROW EXECUTE FUNCTION private.enforce_project_team_profile_role();

CREATE OR REPLACE FUNCTION public.list_budget_owner_candidates(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF v_uid IS NULL OR v_project.id IS NULL OR lower((SELECT role FROM public.profiles WHERE id=v_uid))NOT IN('pm','admin')
    OR public.can_write_project(p_project_id)IS NOT TRUE THEN
    RAISE EXCEPTION 'BUDGET_OWNERSHIP_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'userId',profile.id,'name',profile.name,'email',profile.email,'role',profile.role,
      'projectRole',membership.project_role,'responsibilityLabel',membership.responsibility_label
    ) ORDER BY profile.name,profile.email)
    FROM public.project_team_memberships membership
    JOIN public.profiles profile ON profile.id=membership.user_id
    WHERE membership.project_id=p_project_id
      AND membership.starts_on<=CURRENT_DATE AND (membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)
      AND membership.project_role IN('PM','FUNCTION_OWNER','EXECUTIVE')
      AND (profile.company_id IS NULL OR v_project.company_id IS NULL OR profile.company_id=v_project.company_id)
  ),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_budget_discipline_owner(
  p_budget_cycle_id uuid,p_discipline_id uuid,p_department_name text,p_owner_user_id uuid,
  p_expected_revision integer,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_cycle public.project_budget_cycles%ROWTYPE;v_project public.projects%ROWTYPE;
  v_existing public.project_budget_ownerships%ROWTYPE;v_owner public.profiles%ROWTYPE;v_request public.write_command_requests%ROWTYPE;
  v_revision integer;v_result jsonb;v_discipline_label text;v_department_label text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_budget_cycle_id IS NULL OR p_discipline_id IS NULL OR p_owner_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision<0 OR btrim(COALESCE(p_department_name,''))=''
    OR char_length(btrim(p_department_name))>160 THEN
    RAISE EXCEPTION 'INVALID_BUDGET_OWNERSHIP_COMMAND' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'BUDGET_CYCLE_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF lower((SELECT role FROM public.profiles WHERE id=v_uid))NOT IN('pm','admin')
    OR public.can_write_project(v_cycle.project_id)IS NOT TRUE THEN
    RAISE EXCEPTION 'BUDGET_OWNERSHIP_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=v_cycle.project_id FOR UPDATE;
  SELECT * INTO v_owner FROM public.profiles WHERE id=p_owner_user_id;
  IF v_owner.id IS NULL
    OR (v_project.company_id IS NOT NULL AND v_owner.company_id IS NOT NULL AND v_owner.company_id<>v_project.company_id)
    OR NOT EXISTS(
      SELECT 1 FROM public.project_team_memberships membership
      WHERE membership.project_id=v_cycle.project_id AND membership.user_id=p_owner_user_id
        AND membership.starts_on<=CURRENT_DATE AND (membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)
        AND membership.project_role IN('PM','FUNCTION_OWNER','EXECUTIVE')
    ) THEN
    RAISE EXCEPTION 'INVALID_BUDGET_OWNER' USING ERRCODE='22023';
  END IF;
  SELECT discipline.label,department.label INTO v_discipline_label,v_department_label
    FROM public.work_ontology_disciplines discipline
    JOIN public.work_ontology_departments department ON department.ontology_version_id=discipline.ontology_version_id AND department.id=discipline.department_id
    WHERE discipline.ontology_version_id=v_cycle.ontology_version_id AND discipline.id=p_discipline_id;
  IF v_discipline_label IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.project_budget_contributions WHERE budget_cycle_id=p_budget_cycle_id AND discipline_id=p_discipline_id
  ) THEN RAISE EXCEPTION 'BUDGET_DISCIPLINE_NOT_IN_CYCLE' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
    VALUES(v_uid,'budget.assign_owner',p_client_request_id,v_cycle.project_id)
    ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
    WHERE actor_id=v_uid AND operation='budget.assign_owner'AND client_request_id=p_client_request_id;
  IF v_request.project_id IS DISTINCT FROM v_cycle.project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    IF (v_request.response->>'budgetCycleId')::uuid IS DISTINCT FROM p_budget_cycle_id
      OR(v_request.response->>'disciplineId')::uuid IS DISTINCT FROM p_discipline_id THEN
      RAISE EXCEPTION 'Idempotency key belongs to another ownership' USING ERRCODE='23505';
    END IF;
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);
  END IF;
  SELECT * INTO v_existing FROM public.project_budget_ownerships
    WHERE budget_cycle_id=p_budget_cycle_id AND discipline_id=p_discipline_id FOR UPDATE;
  IF COALESCE(v_existing.revision,0)<>p_expected_revision THEN
    RAISE EXCEPTION 'BUDGET_OWNERSHIP_REVISION_CONFLICT' USING ERRCODE='40001';
  END IF;
  v_revision:=p_expected_revision+1;
  INSERT INTO public.project_budget_ownerships(
    budget_cycle_id,project_id,ontology_version_id,discipline_id,department_name,owner_user_id,revision,assigned_by,assigned_at
  ) VALUES(
    p_budget_cycle_id,v_cycle.project_id,v_cycle.ontology_version_id,p_discipline_id,v_department_label,p_owner_user_id,v_revision,v_uid,now()
  ) ON CONFLICT(budget_cycle_id,discipline_id)DO UPDATE SET
    department_name=EXCLUDED.department_name,owner_user_id=EXCLUDED.owner_user_id,revision=EXCLUDED.revision,
    assigned_by=EXCLUDED.assigned_by,assigned_at=EXCLUDED.assigned_at;
  INSERT INTO public.project_budget_ownership_events(
    budget_cycle_id,project_id,discipline_id,event_type,department_name,owner_user_id,previous_owner_user_id,ownership_revision,actor_id
  ) VALUES(
    p_budget_cycle_id,v_cycle.project_id,p_discipline_id,CASE WHEN v_existing.revision IS NULL THEN'ASSIGNED'ELSE'REASSIGNED'END,
    v_department_label,p_owner_user_id,v_existing.owner_user_id,v_revision,v_uid
  );
  IF v_existing.owner_user_id IS NOT NULL AND v_existing.owner_user_id<>p_owner_user_id THEN
    INSERT INTO public.project_budget_notifications(id,recipient_user_id,project_id,budget_cycle_id,discipline_id,event_type,message)
      VALUES(gen_random_uuid(),v_existing.owner_user_id,v_cycle.project_id,p_budget_cycle_id,p_discipline_id,
        'BUDGET_OWNERSHIP_REMOVED','Budget ownership removed: '||v_discipline_label);
  END IF;
  INSERT INTO public.project_budget_notifications(id,recipient_user_id,project_id,budget_cycle_id,discipline_id,event_type,message)
    VALUES(gen_random_uuid(),p_owner_user_id,v_cycle.project_id,p_budget_cycle_id,p_discipline_id,
      CASE WHEN v_existing.revision IS NULL THEN'BUDGET_OWNERSHIP_ASSIGNED'ELSE'BUDGET_OWNERSHIP_REASSIGNED'END,
      'Budget input assigned: '||v_discipline_label||' · '||btrim(p_department_name));
  v_result:=jsonb_build_object('budgetCycleId',p_budget_cycle_id,'disciplineId',p_discipline_id,
    'departmentName',v_department_label,'ownerUserId',p_owner_user_id,'revision',v_revision);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_project_team_profile_role() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.can_view_own_project_row(bigint,text),public.can_access_project(bigint),
  public.list_budget_owner_candidates(bigint),
  public.assign_budget_discipline_owner(uuid,uuid,text,uuid,integer,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_view_own_project_row(bigint,text),public.can_access_project(bigint),
  public.list_budget_owner_candidates(bigint),
  public.assign_budget_discipline_owner(uuid,uuid,text,uuid,integer,uuid)
  TO authenticated;

COMMIT;
