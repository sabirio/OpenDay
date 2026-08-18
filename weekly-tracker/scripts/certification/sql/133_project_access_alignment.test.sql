BEGIN;

DO $$
DECLARE
  v_project_id bigint;
  v_internal_user uuid;
  v_membership_id uuid;
  v_contractor uuid;
  v_assigned_project bigint;
  v_unassigned_project bigint;
  v_admin uuid;
  v_candidates jsonb;
  v_guard_rejected boolean:=false;
BEGIN
  SELECT membership.project_id,membership.user_id,membership.id
    INTO v_project_id,v_internal_user,v_membership_id
  FROM public.project_team_memberships membership
  JOIN public.profiles profile ON profile.id=membership.user_id
  WHERE membership.project_role='EXECUTIVE' AND membership.ends_on IS NULL
    AND membership.starts_on<=CURRENT_DATE
  ORDER BY membership.project_id
  LIMIT 1;
  IF v_membership_id IS NULL THEN RAISE EXCEPTION 'CERTIFICATION_REQUIRES_EXECUTIVE_MEMBERSHIP';END IF;

  PERFORM set_config('request.jwt.claim.sub',v_internal_user::text,true);
  IF public.can_access_project(v_project_id)IS NOT TRUE THEN RAISE EXCEPTION 'EXECUTIVE_ACTIVE_MEMBER_DENIED';END IF;

  UPDATE public.profiles SET role='Consultant' WHERE id=v_internal_user;
  UPDATE public.project_team_memberships SET project_role='CONSULTANT' WHERE id=v_membership_id;
  IF public.can_access_project(v_project_id)IS NOT TRUE THEN RAISE EXCEPTION 'CONSULTANT_ACTIVE_MEMBER_DENIED';END IF;

  UPDATE public.profiles SET role='Approver' WHERE id=v_internal_user;
  UPDATE public.project_team_memberships SET project_role='APPROVER' WHERE id=v_membership_id;
  IF public.can_access_project(v_project_id)IS NOT TRUE THEN RAISE EXCEPTION 'APPROVER_ACTIVE_MEMBER_DENIED';END IF;

  UPDATE public.profiles SET role='Executive' WHERE id=v_internal_user;
  UPDATE public.project_team_memberships SET project_role='EXECUTIVE',starts_on=CURRENT_DATE-2,ends_on=CURRENT_DATE-1 WHERE id=v_membership_id;
  IF public.can_access_project(v_project_id)IS TRUE THEN RAISE EXCEPTION 'ENDED_MEMBER_ALLOWED';END IF;

  SELECT profile.id,assignment.project_id
    INTO v_contractor,v_assigned_project
  FROM public.profiles profile
  CROSS JOIN LATERAL unnest(COALESCE(profile.assigned_projects,'{}')) assignment(project_id)
  JOIN public.projects project ON project.id=assignment.project_id
  WHERE lower(profile.role)='contractor'
    AND (profile.company_id IS NULL OR project.company_id IS NULL OR profile.company_id=project.company_id)
  LIMIT 1;
  IF v_contractor IS NULL THEN RAISE EXCEPTION 'CERTIFICATION_REQUIRES_ASSIGNED_CONTRACTOR';END IF;
  PERFORM set_config('request.jwt.claim.sub',v_contractor::text,true);
  IF public.can_access_project(v_assigned_project)IS NOT TRUE THEN RAISE EXCEPTION 'ASSIGNED_CONTRACTOR_DENIED';END IF;
  SELECT project.id INTO v_unassigned_project FROM public.projects project
    WHERE project.id<>ALL(COALESCE((SELECT assigned_projects FROM public.profiles WHERE id=v_contractor),'{}')::bigint[])
      AND ((SELECT company_id FROM public.profiles WHERE id=v_contractor)IS NULL OR project.company_id IS NULL
        OR (SELECT company_id FROM public.profiles WHERE id=v_contractor)=project.company_id)
    LIMIT 1;
  IF v_unassigned_project IS NOT NULL AND public.can_access_project(v_unassigned_project)IS TRUE THEN
    RAISE EXCEPTION 'UNASSIGNED_CONTRACTOR_ALLOWED';
  END IF;

  BEGIN
    INSERT INTO public.project_team_memberships(
      id,project_id,user_id,project_role,responsibility_label,starts_on,notifications_enabled,created_by,updated_by
    ) VALUES(
      gen_random_uuid(),v_project_id,v_contractor,'FUNCTION_OWNER','Invalid contractor owner',CURRENT_DATE,true,v_contractor,v_contractor
    );
  EXCEPTION WHEN check_violation THEN v_guard_rejected:=true;
  END;
  IF v_guard_rejected IS NOT TRUE THEN RAISE EXCEPTION 'CONTRACTOR_FUNCTION_OWNER_ACCEPTED';END IF;

  SELECT profile.id INTO v_admin FROM public.profiles profile
  JOIN public.projects project ON project.id=v_project_id
  WHERE lower(profile.role)='admin' AND (profile.company_id IS NULL OR project.company_id IS NULL OR profile.company_id=project.company_id)
  ORDER BY profile.company_id NULLS LAST LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  SELECT public.list_budget_owner_candidates(v_project_id) INTO v_candidates;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_candidates) candidate
    WHERE NOT EXISTS(
      SELECT 1 FROM public.project_team_memberships membership
      WHERE membership.project_id=v_project_id AND membership.user_id=(candidate->>'userId')::uuid
        AND membership.starts_on<=CURRENT_DATE AND (membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)
        AND membership.project_role IN('PM','FUNCTION_OWNER','EXECUTIVE')
    )
  ) THEN RAISE EXCEPTION 'BUDGET_CANDIDATE_OUTSIDE_ACTIVE_TEAM';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_candidates) candidate WHERE lower(candidate->>'role')='viewer') THEN
    RAISE EXCEPTION 'LEGACY_VIEWER_ROLE_EXPOSED';
  END IF;
END;
$$;

ROLLBACK;
