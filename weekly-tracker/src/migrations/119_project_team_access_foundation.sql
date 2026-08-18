-- 119_project_team_access_foundation.sql
-- Time-bounded Project Team membership, responsibility scope and capabilities.

BEGIN;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'Executive';
UPDATE public.profiles SET role='Executive' WHERE lower(role)='viewer';

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.profiles(id,email,name,role,assigned_projects)
  VALUES(new.id,new.email,split_part(new.email,'@',1),'Executive','{}')
  ON CONFLICT(id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TABLE IF NOT EXISTS public.project_capability_catalog(
  code text PRIMARY KEY,
  label text NOT NULL,
  allowed_project_roles text[] NOT NULL,
  sort_order integer NOT NULL UNIQUE
);
INSERT INTO public.project_capability_catalog(code,label,allowed_project_roles,sort_order) VALUES
  ('PROJECT_MANAGE','Manage project','{PM}',10),
  ('TEAM_MANAGE','Manage project team','{PM}',20),
  ('BUDGET_EDIT','Edit package budget','{PM,FUNCTION_OWNER}',30),
  ('PROCUREMENT_MANAGE','Manage procurement method','{PM,FUNCTION_OWNER}',40),
  ('TENDER_MANAGE','Manage tender package','{PM,FUNCTION_OWNER}',50),
  ('BOQ_PREPARE','Prepare consultant BOQ','{PM,CONSULTANT,FUNCTION_OWNER}',60),
  ('BID_REVIEW','Review contractor bids','{PM,CONSULTANT,FUNCTION_OWNER}',70),
  ('COMMERCIAL_APPROVE','Approve commercial decisions','{PM,APPROVER}',80),
  ('FORECAST_MANAGE','Maintain forecast','{PM,FUNCTION_OWNER}',90),
  ('EXECUTIVE_SUMMARY','View decision-grade summary','{PM,APPROVER,EXECUTIVE}',100)
ON CONFLICT(code) DO UPDATE SET label=EXCLUDED.label,allowed_project_roles=EXCLUDED.allowed_project_roles,sort_order=EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.project_team_memberships(
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_role text NOT NULL CHECK(project_role IN('PM','CONSULTANT','FUNCTION_OWNER','APPROVER','EXECUTIVE')),
  responsibility_label text NOT NULL CHECK(btrim(responsibility_label)<>''),
  starts_on date NOT NULL,
  ends_on date CHECK(ends_on IS NULL OR ends_on>=starts_on),
  notifications_enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_team_one_current_membership_idx
  ON public.project_team_memberships(project_id,user_id) WHERE ends_on IS NULL;
CREATE INDEX IF NOT EXISTS project_team_active_project_idx
  ON public.project_team_memberships(project_id,project_role,starts_on,ends_on);

CREATE TABLE IF NOT EXISTS public.project_team_membership_capabilities(
  membership_id uuid NOT NULL,
  project_id bigint NOT NULL,
  capability_code text NOT NULL REFERENCES public.project_capability_catalog(code) ON DELETE RESTRICT,
  PRIMARY KEY(membership_id,capability_code),
  FOREIGN KEY(membership_id,project_id) REFERENCES public.project_team_memberships(id,project_id) ON DELETE RESTRICT
);

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.project_cost_packages'::regclass AND conname='project_cost_packages_id_project_unique') THEN
    ALTER TABLE public.project_cost_packages
      ADD CONSTRAINT project_cost_packages_id_project_unique UNIQUE(id,project_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_cost_package_responsibilities(
  membership_id uuid NOT NULL,
  project_id bigint NOT NULL,
  cost_package_id uuid NOT NULL,
  responsibility_type text NOT NULL CHECK(responsibility_type IN('OWNER','CONSULTANT','APPROVER','CONTRIBUTOR')),
  PRIMARY KEY(membership_id,cost_package_id,responsibility_type),
  FOREIGN KEY(membership_id,project_id) REFERENCES public.project_team_memberships(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY(cost_package_id,project_id) REFERENCES public.project_cost_packages(id,project_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_team_membership_events(
  id bigserial PRIMARY KEY,
  membership_id uuid NOT NULL,
  project_id bigint NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  event_type text NOT NULL CHECK(event_type IN('ASSIGNED','UPDATED','ENDED')),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(membership_id,revision)
);

CREATE OR REPLACE FUNCTION private.prevent_project_team_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'PROJECT_TEAM_EVENT_IMMUTABLE' USING ERRCODE='55000'; END;
$$;
DROP TRIGGER IF EXISTS project_team_membership_events_immutable ON public.project_team_membership_events;
CREATE TRIGGER project_team_membership_events_immutable BEFORE UPDATE OR DELETE ON public.project_team_membership_events
FOR EACH ROW EXECUTE FUNCTION private.prevent_project_team_event_mutation();

-- Preserve current effective PM/Viewer access as explicit dated memberships.
INSERT INTO public.project_team_memberships(id,project_id,user_id,project_role,responsibility_label,starts_on,notifications_enabled,created_by,updated_by)
SELECT gen_random_uuid(),project_row.id,profile_row.id,
  CASE WHEN lower(profile_row.role)='pm' THEN 'PM' ELSE 'EXECUTIVE' END,
  CASE WHEN lower(profile_row.role)='pm' THEN 'Project Management' ELSE 'Executive Oversight' END,
  CURRENT_DATE,true,profile_row.id,profile_row.id
FROM public.profiles profile_row
JOIN public.projects project_row ON (
  project_row.id=ANY(COALESCE(profile_row.assigned_projects,'{}')::bigint[])
  OR (COALESCE(cardinality(profile_row.assigned_projects),0)=0 AND (profile_row.company_id IS NULL OR project_row.company_id IS NULL OR profile_row.company_id=project_row.company_id))
)
WHERE lower(profile_row.role) IN('pm','executive')
ON CONFLICT(project_id,user_id) WHERE ends_on IS NULL DO NOTHING;

INSERT INTO public.project_team_membership_capabilities(membership_id,project_id,capability_code)
SELECT membership.id,membership.project_id,catalog.code
FROM public.project_team_memberships membership
JOIN public.project_capability_catalog catalog ON membership.project_role=ANY(catalog.allowed_project_roles)
ON CONFLICT DO NOTHING;

INSERT INTO public.project_team_membership_events(membership_id,project_id,revision,event_type,snapshot,actor_id)
SELECT membership.id,membership.project_id,membership.revision,'ASSIGNED',jsonb_build_object(
  'membershipId',membership.id,'projectId',membership.project_id,'userId',membership.user_id,
  'projectRole',membership.project_role,'responsibilityLabel',membership.responsibility_label,
  'startsOn',membership.starts_on,'endsOn',membership.ends_on,'notificationsEnabled',membership.notifications_enabled,
  'revision',membership.revision,'migration','119_project_team_access_foundation'
),membership.created_by
FROM public.project_team_memberships membership
WHERE NOT EXISTS(SELECT 1 FROM public.project_team_membership_events event WHERE event.membership_id=membership.id AND event.revision=membership.revision);

CREATE OR REPLACE FUNCTION public.is_active_project_member(p_project_id bigint,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.project_team_memberships membership
    WHERE membership.project_id=p_project_id AND membership.user_id=p_user_id
      AND membership.starts_on<=CURRENT_DATE AND (membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE));
$$;

CREATE OR REPLACE FUNCTION public.has_project_capability(p_project_id bigint,p_capability_code text,p_cost_package_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_company text;v_project_company text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT lower(role),company_id INTO v_role,v_company FROM public.profiles WHERE id=v_uid;
  SELECT company_id INTO v_project_company FROM public.projects WHERE id=p_project_id;
  IF v_role='admin' AND (v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company) THEN RETURN true; END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.project_team_memberships membership
    JOIN public.project_team_membership_capabilities capability ON capability.membership_id=membership.id AND capability.project_id=membership.project_id
    WHERE membership.project_id=p_project_id AND membership.user_id=v_uid
      AND membership.starts_on<=CURRENT_DATE AND (membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)
      AND capability.capability_code=p_capability_code
      AND (p_cost_package_id IS NULL OR membership.project_role='PM' OR EXISTS(SELECT 1 FROM public.project_cost_package_responsibilities scope
        WHERE scope.membership_id=membership.id AND scope.project_id=p_project_id AND scope.cost_package_id=p_cost_package_id))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_own_project_row(p_project_id bigint,p_company_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;v_company text;v_assignments integer[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT lower(role),company_id,COALESCE(assigned_projects,'{}') INTO v_role,v_company,v_assignments FROM public.profiles WHERE id=auth.uid();
  IF v_role='admin' THEN RETURN v_company IS NULL OR p_company_id IS NULL OR v_company=p_company_id; END IF;
  IF v_role='contractor' THEN RETURN p_project_id=ANY(v_assignments::bigint[]) AND (v_company IS NULL OR p_company_id IS NULL OR v_company=p_company_id); END IF;
  RETURN public.is_active_project_member(p_project_id,auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;v_company text;v_project_company text;v_assignments integer[];
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  SELECT lower(role),company_id,COALESCE(assigned_projects,'{}') INTO v_role,v_company,v_assignments FROM public.profiles WHERE id=auth.uid();
  SELECT company_id INTO v_project_company FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role='admin' THEN RETURN v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company; END IF;
  IF v_role='pm' THEN RETURN public.has_project_capability(p_project_id,'PROJECT_MANAGE',NULL); END IF;
  IF v_role='contractor' THEN RETURN p_project_id=ANY(v_assignments::bigint[]) AND (v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company); END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(p_project_id bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;v_company text;v_project_company text;v_created_by uuid;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  SELECT lower(role),company_id INTO v_role,v_company FROM public.profiles WHERE id=auth.uid();
  SELECT company_id,created_by INTO v_project_company,v_created_by FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role='admin' THEN RETURN v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company; END IF;
  RETURN v_role='pm' AND (v_created_by=auth.uid() OR public.has_project_capability(p_project_id,'PROJECT_MANAGE',NULL));
END;
$$;

DROP POLICY IF EXISTS project_cost_packages_internal_select ON public.project_cost_packages;
CREATE POLICY project_cost_packages_internal_select ON public.project_cost_packages FOR SELECT TO authenticated USING(
  public.has_project_capability(project_id,'TEAM_MANAGE',NULL)
  OR public.has_project_capability(project_id,'PROCUREMENT_MANAGE',id)
  OR public.has_project_capability(project_id,'BOQ_PREPARE',id)
  OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',id)
  OR public.has_project_capability(project_id,'EXECUTIVE_SUMMARY',id)
);
DROP POLICY IF EXISTS project_cost_package_work_groups_internal_select ON public.project_cost_package_work_groups;
CREATE POLICY project_cost_package_work_groups_internal_select ON public.project_cost_package_work_groups FOR SELECT TO authenticated USING(
  public.has_project_capability(project_id,'TEAM_MANAGE',NULL)
  OR public.has_project_capability(project_id,'PROCUREMENT_MANAGE',cost_package_id)
  OR public.has_project_capability(project_id,'BOQ_PREPARE',cost_package_id)
  OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)
  OR public.has_project_capability(project_id,'EXECUTIVE_SUMMARY',cost_package_id)
);
DROP POLICY IF EXISTS project_cost_package_events_internal_select ON public.project_cost_package_events;
CREATE POLICY project_cost_package_events_internal_select ON public.project_cost_package_events FOR SELECT TO authenticated USING(
  public.has_project_capability(project_id,'TEAM_MANAGE',NULL)
  OR public.has_project_capability(project_id,'PROCUREMENT_MANAGE',cost_package_id)
  OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)
);
DROP POLICY IF EXISTS project_tender_cost_packages_internal_select ON public.project_tender_cost_packages;
CREATE POLICY project_tender_cost_packages_internal_select ON public.project_tender_cost_packages FOR SELECT TO authenticated USING(
  public.has_project_capability(project_id,'TEAM_MANAGE',NULL)
  OR public.has_project_capability(project_id,'TENDER_MANAGE',cost_package_id)
  OR public.has_project_capability(project_id,'BOQ_PREPARE',cost_package_id)
  OR public.has_project_capability(project_id,'BID_REVIEW',cost_package_id)
  OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)
);

ALTER TABLE public.project_team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_team_membership_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_cost_package_responsibilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_team_membership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_capability_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_capability_catalog_read ON public.project_capability_catalog;
DROP POLICY IF EXISTS project_team_memberships_read ON public.project_team_memberships;
DROP POLICY IF EXISTS project_team_capabilities_read ON public.project_team_membership_capabilities;
DROP POLICY IF EXISTS project_cost_package_responsibilities_read ON public.project_cost_package_responsibilities;
DROP POLICY IF EXISTS project_team_events_read ON public.project_team_membership_events;
CREATE POLICY project_capability_catalog_read ON public.project_capability_catalog FOR SELECT TO authenticated USING(true);
CREATE POLICY project_team_memberships_read ON public.project_team_memberships FOR SELECT TO authenticated USING(
  user_id=auth.uid() OR public.has_project_capability(project_id,'TEAM_MANAGE',NULL));
CREATE POLICY project_team_capabilities_read ON public.project_team_membership_capabilities FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.project_team_memberships membership WHERE membership.id=membership_id AND (membership.user_id=auth.uid() OR public.has_project_capability(project_id,'TEAM_MANAGE',NULL))));
CREATE POLICY project_cost_package_responsibilities_read ON public.project_cost_package_responsibilities FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.project_team_memberships membership WHERE membership.id=membership_id AND (membership.user_id=auth.uid() OR public.has_project_capability(project_id,'TEAM_MANAGE',NULL))));
CREATE POLICY project_team_events_read ON public.project_team_membership_events FOR SELECT TO authenticated USING(public.has_project_capability(project_id,'TEAM_MANAGE',NULL));

REVOKE ALL ON TABLE public.project_capability_catalog,public.project_team_memberships,public.project_team_membership_capabilities,
  public.project_cost_package_responsibilities,public.project_team_membership_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_capability_catalog,public.project_team_memberships,public.project_team_membership_capabilities,
  public.project_cost_package_responsibilities,public.project_team_membership_events TO authenticated;
REVOKE ALL ON SEQUENCE public.project_team_membership_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_project_team_membership(
  p_project_id bigint,p_membership_id uuid,p_user_id uuid,p_project_role text,p_responsibility_label text,
  p_starts_on date,p_ends_on date,p_notifications_enabled boolean,p_capability_codes text[],p_cost_package_ids uuid[],
  p_responsibility_type text,p_expected_revision integer,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();membership public.project_team_memberships%ROWTYPE;request public.write_command_requests%ROWTYPE;
  next_revision integer;event_name text;valid_count integer;snapshot jsonb;result jsonb;
BEGIN
  IF u IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL) IS NOT TRUE THEN RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_membership_id IS NULL OR p_user_id IS NULL OR p_client_request_id IS NULL OR p_project_role NOT IN('PM','CONSULTANT','FUNCTION_OWNER','APPROVER','EXECUTIVE')
    OR btrim(COALESCE(p_responsibility_label,''))='' OR p_starts_on IS NULL OR (p_ends_on IS NOT NULL AND p_ends_on<p_starts_on)
    OR p_responsibility_type NOT IN('OWNER','CONSULTANT','APPROVER','CONTRIBUTOR') OR COALESCE(p_expected_revision,-1)<0 THEN
    RAISE EXCEPTION 'INVALID_PROJECT_TEAM_COMMAND' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles profile WHERE profile.id=p_user_id AND lower(profile.role)=lower(p_project_role) OR profile.id=p_user_id AND p_project_role='FUNCTION_OWNER') THEN
    RAISE EXCEPTION 'PROJECT_TEAM_PROFILE_ROLE_MISMATCH' USING ERRCODE='22023';END IF;
  SELECT count(*) INTO valid_count FROM public.project_capability_catalog catalog WHERE catalog.code=ANY(COALESCE(p_capability_codes,'{}')) AND p_project_role=ANY(catalog.allowed_project_roles);
  IF valid_count<>COALESCE(cardinality(p_capability_codes),0) OR valid_count<>(SELECT count(DISTINCT value) FROM unnest(COALESCE(p_capability_codes,'{}')) value) THEN
    RAISE EXCEPTION 'INVALID_PROJECT_TEAM_CAPABILITIES' USING ERRCODE='22023';END IF;
  IF (p_project_role='PM' AND NOT(COALESCE(p_capability_codes,'{}')@>ARRAY['PROJECT_MANAGE','TEAM_MANAGE']))
    OR (p_project_role='CONSULTANT' AND NOT(COALESCE(p_capability_codes,'{}')@>ARRAY['BOQ_PREPARE']))
    OR (p_project_role='APPROVER' AND NOT(COALESCE(p_capability_codes,'{}')@>ARRAY['COMMERCIAL_APPROVE']))
    OR (p_project_role='EXECUTIVE' AND NOT(COALESCE(p_capability_codes,'{}')@>ARRAY['EXECUTIVE_SUMMARY'])) THEN
    RAISE EXCEPTION 'PROJECT_TEAM_REQUIRED_CAPABILITY_MISSING' USING ERRCODE='22023';END IF;
  IF COALESCE(cardinality(p_cost_package_ids),0)<>(SELECT count(*) FROM public.project_cost_packages package WHERE package.project_id=p_project_id AND package.id=ANY(COALESCE(p_cost_package_ids,'{}'))) THEN
    RAISE EXCEPTION 'INVALID_PROJECT_TEAM_PACKAGE_SCOPE' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id) VALUES(u,'project_team.membership.save',p_client_request_id,p_project_id)
    ON CONFLICT(actor_id,operation,client_request_id) DO NOTHING;
  SELECT * INTO request FROM public.write_command_requests WHERE actor_id=u AND operation='project_team.membership.save' AND client_request_id=p_client_request_id;
  IF request.project_id<>p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF request.response IS NOT NULL THEN RETURN request.response||jsonb_build_object('idempotentReplay',true);END IF;
  PERFORM pg_advisory_xact_lock(p_project_id);
  SELECT * INTO membership FROM public.project_team_memberships WHERE id=p_membership_id FOR UPDATE;
  IF membership.id IS NULL THEN
    IF p_expected_revision<>0 THEN RAISE EXCEPTION 'PROJECT_TEAM_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
    next_revision:=1;event_name:=CASE WHEN p_ends_on IS NULL THEN 'ASSIGNED' ELSE 'ENDED' END;
    INSERT INTO public.project_team_memberships(id,project_id,user_id,project_role,responsibility_label,starts_on,ends_on,notifications_enabled,revision,created_by,updated_by)
    VALUES(p_membership_id,p_project_id,p_user_id,p_project_role,btrim(p_responsibility_label),p_starts_on,p_ends_on,COALESCE(p_notifications_enabled,true),1,u,u) RETURNING * INTO membership;
  ELSE
    IF membership.project_id<>p_project_id OR membership.revision<>p_expected_revision THEN RAISE EXCEPTION 'PROJECT_TEAM_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
    next_revision:=membership.revision+1;event_name:=CASE WHEN membership.ends_on IS NULL AND p_ends_on IS NOT NULL THEN 'ENDED' ELSE 'UPDATED' END;
    DELETE FROM public.project_team_membership_capabilities WHERE membership_id=p_membership_id;
    DELETE FROM public.project_cost_package_responsibilities WHERE membership_id=p_membership_id;
    UPDATE public.project_team_memberships SET user_id=p_user_id,project_role=p_project_role,responsibility_label=btrim(p_responsibility_label),starts_on=p_starts_on,
      ends_on=p_ends_on,notifications_enabled=COALESCE(p_notifications_enabled,true),revision=next_revision,updated_by=u,updated_at=now() WHERE id=p_membership_id RETURNING * INTO membership;
  END IF;
  INSERT INTO public.project_team_membership_capabilities(membership_id,project_id,capability_code)
    SELECT membership.id,p_project_id,value FROM unnest(COALESCE(p_capability_codes,'{}')) value;
  INSERT INTO public.project_cost_package_responsibilities(membership_id,project_id,cost_package_id,responsibility_type)
    SELECT membership.id,p_project_id,value,p_responsibility_type FROM unnest(COALESCE(p_cost_package_ids,'{}')) value;
  snapshot:=jsonb_build_object('membershipId',membership.id,'projectId',p_project_id,'userId',membership.user_id,'projectRole',membership.project_role,
    'responsibilityLabel',membership.responsibility_label,'startsOn',membership.starts_on,'endsOn',membership.ends_on,'notificationsEnabled',membership.notifications_enabled,
    'capabilityCodes',to_jsonb(COALESCE(p_capability_codes,'{}')),'costPackageIds',to_jsonb(COALESCE(p_cost_package_ids,'{}')),'responsibilityType',p_responsibility_type,'revision',membership.revision);
  INSERT INTO public.project_team_membership_events(membership_id,project_id,revision,event_type,snapshot,actor_id)
    VALUES(membership.id,p_project_id,membership.revision,event_name,snapshot,u);
  result:=snapshot;UPDATE public.write_command_requests SET response=result,completed_at=now() WHERE id=request.id;
  RETURN result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_team_foundation(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL) IS NOT TRUE THEN RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object(
    'projectId',p_project_id,
    'capabilityCatalog',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',code,'label',label,'allowedProjectRoles',to_jsonb(allowed_project_roles)) ORDER BY sort_order) FROM public.project_capability_catalog),'[]'::jsonb),
    'availableUsers',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',profile.id,'name',profile.name,'email',profile.email,'organizationRole',profile.role) ORDER BY profile.name,profile.email)
      FROM public.profiles profile JOIN public.projects project ON project.id=p_project_id
      WHERE lower(profile.role) IN('pm','consultant','approver','executive') AND (profile.company_id IS NULL OR project.company_id IS NULL OR profile.company_id=project.company_id)),'[]'::jsonb),
    'memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object('membershipId',membership.id,'userId',membership.user_id,'name',profile.name,'email',profile.email,
      'projectRole',membership.project_role,'responsibilityLabel',membership.responsibility_label,'startsOn',membership.starts_on,'endsOn',membership.ends_on,
      'notificationsEnabled',membership.notifications_enabled,'revision',membership.revision,
      'capabilityCodes',COALESCE((SELECT jsonb_agg(capability.capability_code ORDER BY catalog.sort_order) FROM public.project_team_membership_capabilities capability JOIN public.project_capability_catalog catalog ON catalog.code=capability.capability_code WHERE capability.membership_id=membership.id),'[]'::jsonb),
      'costPackageIds',COALESCE((SELECT jsonb_agg(scope.cost_package_id ORDER BY package.code) FROM public.project_cost_package_responsibilities scope JOIN public.project_cost_packages package ON package.id=scope.cost_package_id WHERE scope.membership_id=membership.id),'[]'::jsonb),
      'responsibilityType',(SELECT min(scope.responsibility_type) FROM public.project_cost_package_responsibilities scope WHERE scope.membership_id=membership.id)
    ) ORDER BY membership.ends_on NULLS FIRST,membership.starts_on,profile.name) FROM public.project_team_memberships membership JOIN public.profiles profile ON profile.id=membership.user_id WHERE membership.project_id=p_project_id),'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_project_team_event_mutation() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.is_active_project_member(bigint,uuid),public.has_project_capability(bigint,text,uuid),
  public.can_view_own_project_row(bigint,text),public.can_access_project(bigint),public.can_write_project(bigint),
  public.save_project_team_membership(bigint,uuid,uuid,text,text,date,date,boolean,text[],uuid[],text,integer,uuid),
  public.get_project_team_foundation(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.is_active_project_member(bigint,uuid),public.has_project_capability(bigint,text,uuid),
  public.can_view_own_project_row(bigint,text),public.can_access_project(bigint),public.can_write_project(bigint),
  public.save_project_team_membership(bigint,uuid,uuid,text,text,date,date,boolean,text[],uuid[],text,integer,uuid),
  public.get_project_team_foundation(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_project_team_foundation(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_team_foundation(bigint) TO authenticated;

COMMIT;
