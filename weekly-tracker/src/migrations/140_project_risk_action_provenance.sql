-- 140_project_risk_action_provenance.sql
-- Stable, relational provenance for Report / Site Visit / Snag / Variation ->
-- Risk -> Action, with optional Action -> Variation linkage.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.snags'::regclass AND conname='snags_identity_project_key') THEN
    ALTER TABLE public.snags ADD CONSTRAINT snags_identity_project_key UNIQUE(id,project_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_source_references(
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK(source_kind IN('CONTRACTOR_REPORT','SITE_VISIT','SNAG','VARIATION','MANUAL')),
  contractor_report_id bigint,
  site_visit_id bigint,
  snag_id uuid,
  variation_id uuid,
  manual_reference text,
  description text NOT NULL DEFAULT '' CHECK(char_length(description)<=2000),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  FOREIGN KEY(contractor_report_id,project_id) REFERENCES public.contractor_reports(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY(site_visit_id,project_id) REFERENCES public.site_visits(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY(snag_id,project_id) REFERENCES public.snags(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY(variation_id,project_id) REFERENCES public.project_variations(id,project_id) ON DELETE RESTRICT,
  CHECK(
    (source_kind='CONTRACTOR_REPORT' AND contractor_report_id IS NOT NULL AND num_nonnulls(site_visit_id,snag_id,variation_id,manual_reference)=0) OR
    (source_kind='SITE_VISIT' AND site_visit_id IS NOT NULL AND num_nonnulls(contractor_report_id,snag_id,variation_id,manual_reference)=0) OR
    (source_kind='SNAG' AND snag_id IS NOT NULL AND num_nonnulls(contractor_report_id,site_visit_id,variation_id,manual_reference)=0) OR
    (source_kind='VARIATION' AND variation_id IS NOT NULL AND num_nonnulls(contractor_report_id,site_visit_id,snag_id,manual_reference)=0) OR
    (source_kind='MANUAL' AND btrim(COALESCE(manual_reference,''))<>'' AND num_nonnulls(contractor_report_id,site_visit_id,snag_id,variation_id)=0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS project_source_contractor_report_idx ON public.project_source_references(project_id,contractor_report_id) WHERE contractor_report_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_source_site_visit_idx ON public.project_source_references(project_id,site_visit_id) WHERE site_visit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_source_snag_idx ON public.project_source_references(project_id,snag_id) WHERE snag_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_source_variation_idx ON public.project_source_references(project_id,variation_id) WHERE variation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_risk_cases(
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  source_reference_id uuid NOT NULL,
  title text NOT NULL CHECK(btrim(title)<>'' AND char_length(title)<=240),
  description text NOT NULL DEFAULT '' CHECK(char_length(description)<=5000),
  severity text NOT NULL CHECK(severity IN('LOW','MEDIUM','HIGH','CRITICAL')),
  likelihood text NOT NULL CHECK(likelihood IN('RARE','POSSIBLE','LIKELY','CERTAIN')),
  status text NOT NULL CHECK(status IN('OPEN','MITIGATED','CLOSED')),
  owner_membership_id uuid NOT NULL,
  due_date date,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  FOREIGN KEY(source_reference_id,project_id) REFERENCES public.project_source_references(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_membership_id,project_id) REFERENCES public.project_team_memberships(id,project_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS project_risk_cases_register_idx ON public.project_risk_cases(project_id,status,severity,due_date);

CREATE TABLE IF NOT EXISTS public.project_actions(
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  risk_case_id uuid NOT NULL,
  title text NOT NULL CHECK(btrim(title)<>'' AND char_length(title)<=240),
  description text NOT NULL DEFAULT '' CHECK(char_length(description)<=5000),
  owner_membership_id uuid NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL CHECK(status IN('OPEN','IN_PROGRESS','DONE','CANCELLED')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  FOREIGN KEY(risk_case_id,project_id) REFERENCES public.project_risk_cases(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_membership_id,project_id) REFERENCES public.project_team_memberships(id,project_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS project_actions_register_idx ON public.project_actions(project_id,status,due_date);

CREATE TABLE IF NOT EXISTS public.project_risk_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  risk_case_id uuid NOT NULL,
  project_id bigint NOT NULL,
  event_type text NOT NULL CHECK(event_type IN('CREATED','MITIGATED','REOPENED','CLOSED')),
  from_status text,
  to_status text NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,client_request_id),
  FOREIGN KEY(risk_case_id,project_id) REFERENCES public.project_risk_cases(id,project_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.project_action_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_id uuid NOT NULL,
  project_id bigint NOT NULL,
  event_type text NOT NULL CHECK(event_type IN('CREATED','STARTED','COMPLETED','REOPENED','CANCELLED')),
  from_status text,
  to_status text NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,client_request_id),
  FOREIGN KEY(action_id,project_id) REFERENCES public.project_actions(id,project_id) ON DELETE RESTRICT
);

ALTER TABLE public.project_variations
  ADD COLUMN IF NOT EXISTS source_reference_id uuid,
  ADD COLUMN IF NOT EXISTS source_action_id uuid;
ALTER TABLE public.project_variations
  DROP CONSTRAINT IF EXISTS project_variations_source_reference_fk,
  DROP CONSTRAINT IF EXISTS project_variations_source_action_fk;
ALTER TABLE public.project_variations
  ADD CONSTRAINT project_variations_source_reference_fk FOREIGN KEY(source_reference_id,project_id)
    REFERENCES public.project_source_references(id,project_id) ON DELETE RESTRICT,
  ADD CONSTRAINT project_variations_source_action_fk FOREIGN KEY(source_action_id,project_id)
    REFERENCES public.project_actions(id,project_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION private.prevent_project_provenance_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'PROJECT_PROVENANCE_EVENT_IMMUTABLE' USING ERRCODE='55000'; END;
$$;
DROP TRIGGER IF EXISTS project_source_references_immutable ON public.project_source_references;
CREATE TRIGGER project_source_references_immutable BEFORE UPDATE OR DELETE ON public.project_source_references
FOR EACH ROW EXECUTE FUNCTION private.prevent_project_provenance_event_mutation();
DROP TRIGGER IF EXISTS project_risk_events_immutable ON public.project_risk_events;
CREATE TRIGGER project_risk_events_immutable BEFORE UPDATE OR DELETE ON public.project_risk_events
FOR EACH ROW EXECUTE FUNCTION private.prevent_project_provenance_event_mutation();
DROP TRIGGER IF EXISTS project_action_events_immutable ON public.project_action_events;
CREATE TRIGGER project_action_events_immutable BEFORE UPDATE OR DELETE ON public.project_action_events
FOR EACH ROW EXECUTE FUNCTION private.prevent_project_provenance_event_mutation();

CREATE OR REPLACE FUNCTION private.assert_active_project_membership(p_project_id bigint,p_membership_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.project_team_memberships membership
    WHERE membership.id=p_membership_id AND membership.project_id=p_project_id
      AND membership.starts_on<=CURRENT_DATE AND (membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)) THEN
    RAISE EXCEPTION 'ACTIVE_PROJECT_TEAM_OWNER_REQUIRED' USING ERRCODE='22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_project_source_reference(
  p_project_id bigint,p_reference_id uuid,p_source_kind text,p_source_id text,
  p_manual_reference text,p_description text,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL OR public.can_write_project(p_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'PROJECT_SOURCE_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_reference_id IS NULL OR p_client_request_id IS NULL OR p_source_kind NOT IN('CONTRACTOR_REPORT','SITE_VISIT','SNAG','VARIATION','MANUAL') THEN RAISE EXCEPTION 'INVALID_PROJECT_SOURCE' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'project_source.register',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='project_source.register'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  INSERT INTO public.project_source_references(id,project_id,source_kind,contractor_report_id,site_visit_id,snag_id,variation_id,manual_reference,description,created_by)
  VALUES(p_reference_id,p_project_id,p_source_kind,
    CASE WHEN p_source_kind='CONTRACTOR_REPORT'THEN p_source_id::bigint END,
    CASE WHEN p_source_kind='SITE_VISIT'THEN p_source_id::bigint END,
    CASE WHEN p_source_kind='SNAG'THEN p_source_id::uuid END,
    CASE WHEN p_source_kind='VARIATION'THEN p_source_id::uuid END,
    CASE WHEN p_source_kind='MANUAL'THEN NULLIF(btrim(COALESCE(p_manual_reference,'')),'')END,
    btrim(COALESCE(p_description,'')),v_uid);
  v_result:=jsonb_build_object('sourceReferenceId',p_reference_id,'projectId',p_project_id,'sourceKind',p_source_kind);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.create_project_risk(
  p_project_id bigint,p_risk_id uuid,p_source_reference_id uuid,p_title text,p_description text,
  p_severity text,p_likelihood text,p_owner_membership_id uuid,p_due_date date,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_request public.write_command_requests%ROWTYPE;v_result jsonb;v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL OR public.can_write_project(p_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'PROJECT_RISK_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_risk_id IS NULL OR p_client_request_id IS NULL OR btrim(COALESCE(p_title,''))='' OR p_severity NOT IN('LOW','MEDIUM','HIGH','CRITICAL') OR p_likelihood NOT IN('RARE','POSSIBLE','LIKELY','CERTAIN') THEN RAISE EXCEPTION 'INVALID_PROJECT_RISK' USING ERRCODE='22023';END IF;
  PERFORM private.assert_active_project_membership(p_project_id,p_owner_membership_id);
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'project_risk.create',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='project_risk.create'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  INSERT INTO public.project_risk_cases(id,project_id,source_reference_id,title,description,severity,likelihood,status,owner_membership_id,due_date,created_by)
  VALUES(p_risk_id,p_project_id,p_source_reference_id,btrim(p_title),btrim(COALESCE(p_description,'')),p_severity,p_likelihood,'OPEN',p_owner_membership_id,p_due_date,v_uid);
  v_snapshot:=jsonb_build_object('title',btrim(p_title),'severity',p_severity,'likelihood',p_likelihood,'ownerMembershipId',p_owner_membership_id,'dueDate',p_due_date);
  INSERT INTO public.project_risk_events(risk_case_id,project_id,event_type,to_status,revision,snapshot,actor_id,client_request_id)
  VALUES(p_risk_id,p_project_id,'CREATED','OPEN',1,v_snapshot,v_uid,p_client_request_id);
  v_result:=jsonb_build_object('riskId',p_risk_id,'status','OPEN','revision',1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.transition_project_risk(p_risk_id uuid,p_action text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v public.project_risk_cases%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_to text;v_event text;v_result jsonb;
BEGIN
  SELECT *INTO v FROM public.project_risk_cases WHERE id=p_risk_id FOR UPDATE;
  IF v_uid IS NULL OR v.id IS NULL OR public.can_write_project(v.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'PROJECT_RISK_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_PROJECT_RISK_TRANSITION' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'project_risk.transition',p_client_request_id,v.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='project_risk.transition'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF p_expected_revision<>v.revision THEN RAISE EXCEPTION 'PROJECT_RISK_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  IF p_action='MITIGATE'AND v.status='OPEN'THEN v_to:='MITIGATED';v_event:='MITIGATED';
  ELSIF p_action='REOPEN'AND v.status IN('MITIGATED','CLOSED')THEN v_to:='OPEN';v_event:='REOPENED';
  ELSIF p_action='CLOSE'AND v.status='MITIGATED'THEN v_to:='CLOSED';v_event:='CLOSED';
  ELSE RAISE EXCEPTION 'INVALID_PROJECT_RISK_TRANSITION' USING ERRCODE='22023';END IF;
  UPDATE public.project_risk_cases SET status=v_to,revision=revision+1,updated_at=now()WHERE id=v.id;
  INSERT INTO public.project_risk_events(risk_case_id,project_id,event_type,from_status,to_status,revision,snapshot,actor_id,client_request_id)
  VALUES(v.id,v.project_id,v_event,v.status,v_to,v.revision+1,jsonb_build_object('status',v_to),v_uid,p_client_request_id);
  v_result:=jsonb_build_object('riskId',v.id,'status',v_to,'revision',v.revision+1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.create_project_action(
  p_project_id bigint,p_action_id uuid,p_risk_id uuid,p_title text,p_description text,
  p_owner_membership_id uuid,p_due_date date,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_request public.write_command_requests%ROWTYPE;v_result jsonb;v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL OR public.can_write_project(p_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'PROJECT_ACTION_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_action_id IS NULL OR p_client_request_id IS NULL OR btrim(COALESCE(p_title,''))='' OR p_due_date IS NULL THEN RAISE EXCEPTION 'INVALID_PROJECT_ACTION' USING ERRCODE='22023';END IF;
  PERFORM private.assert_active_project_membership(p_project_id,p_owner_membership_id);
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'project_action.create',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='project_action.create'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  INSERT INTO public.project_actions(id,project_id,risk_case_id,title,description,owner_membership_id,due_date,status,created_by)
  VALUES(p_action_id,p_project_id,p_risk_id,btrim(p_title),btrim(COALESCE(p_description,'')),p_owner_membership_id,p_due_date,'OPEN',v_uid);
  v_snapshot:=jsonb_build_object('title',btrim(p_title),'ownerMembershipId',p_owner_membership_id,'dueDate',p_due_date);
  INSERT INTO public.project_action_events(action_id,project_id,event_type,to_status,revision,snapshot,actor_id,client_request_id)
  VALUES(p_action_id,p_project_id,'CREATED','OPEN',1,v_snapshot,v_uid,p_client_request_id);
  v_result:=jsonb_build_object('actionId',p_action_id,'status','OPEN','revision',1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.transition_project_action(p_action_id uuid,p_action text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v public.project_actions%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_to text;v_event text;v_result jsonb;
BEGIN
  SELECT *INTO v FROM public.project_actions WHERE id=p_action_id FOR UPDATE;
  IF v_uid IS NULL OR v.id IS NULL OR public.can_write_project(v.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'PROJECT_ACTION_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_PROJECT_ACTION_TRANSITION' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'project_action.transition',p_client_request_id,v.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='project_action.transition'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF p_expected_revision<>v.revision THEN RAISE EXCEPTION 'PROJECT_ACTION_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  IF p_action='START'AND v.status='OPEN'THEN v_to:='IN_PROGRESS';v_event:='STARTED';
  ELSIF p_action='COMPLETE'AND v.status IN('OPEN','IN_PROGRESS')THEN v_to:='DONE';v_event:='COMPLETED';
  ELSIF p_action='REOPEN'AND v.status IN('DONE','CANCELLED')THEN v_to:='OPEN';v_event:='REOPENED';
  ELSIF p_action='CANCEL'AND v.status IN('OPEN','IN_PROGRESS')THEN v_to:='CANCELLED';v_event:='CANCELLED';
  ELSE RAISE EXCEPTION 'INVALID_PROJECT_ACTION_TRANSITION' USING ERRCODE='22023';END IF;
  UPDATE public.project_actions SET status=v_to,revision=revision+1,updated_at=now()WHERE id=v.id;
  INSERT INTO public.project_action_events(action_id,project_id,event_type,from_status,to_status,revision,snapshot,actor_id,client_request_id)
  VALUES(v.id,v.project_id,v_event,v.status,v_to,v.revision+1,jsonb_build_object('status',v_to),v_uid,p_client_request_id);
  v_result:=jsonb_build_object('actionId',v.id,'status',v_to,'revision',v.revision+1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.transition_project_action(uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.link_project_variation_provenance(p_variation_id uuid,p_action_id uuid,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v public.project_variations%ROWTYPE;a public.project_actions%ROWTYPE;r public.project_risk_cases%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  SELECT *INTO v FROM public.project_variations WHERE id=p_variation_id FOR UPDATE;SELECT *INTO a FROM public.project_actions WHERE id=p_action_id;SELECT *INTO r FROM public.project_risk_cases WHERE id=a.risk_case_id;
  IF v_uid IS NULL OR v.id IS NULL OR a.id IS NULL OR v.project_id<>a.project_id OR public.can_write_project(v.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'VARIATION_PROVENANCE_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_client_request_id IS NULL OR v.status NOT IN('DRAFT','REVISION_REQUIRED') THEN RAISE EXCEPTION 'VARIATION_PROVENANCE_NOT_EDITABLE' USING ERRCODE='55000';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'variation.link_provenance',p_client_request_id,v.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='variation.link_provenance'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  UPDATE public.project_variations SET source_action_id=a.id,source_reference_id=r.source_reference_id,updated_at=now()WHERE id=v.id;
  v_result:=jsonb_build_object('variationId',v.id,'actionId',a.id,'sourceReferenceId',r.source_reference_id);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.link_project_variation_provenance(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.assert_project_risk_register_access(p_project_id bigint)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR public.can_access_project(p_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'PROJECT_RISK_REGISTER_FORBIDDEN' USING ERRCODE='42501';END IF;END;$$;
CREATE OR REPLACE FUNCTION public.get_project_risk_register(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_project_risk_register_access(p_project_id);
  SELECT jsonb_build_object('projectId',p_project_id,'risks',COALESCE(jsonb_agg(jsonb_build_object(
    'riskId',risk.id,'sourceReferenceId',risk.source_reference_id,'sourceKind',source.source_kind,
    'title',risk.title,'description',risk.description,'severity',risk.severity,'likelihood',risk.likelihood,
    'status',risk.status,'ownerMembershipId',risk.owner_membership_id,'dueDate',risk.due_date,'revision',risk.revision,
    'actions',COALESCE((SELECT jsonb_agg(jsonb_build_object('actionId',action.id,'title',action.title,'description',action.description,'ownerMembershipId',action.owner_membership_id,'dueDate',action.due_date,'status',action.status,'revision',action.revision)ORDER BY action.due_date,action.id)FROM public.project_actions action WHERE action.risk_case_id=risk.id),'[]'::jsonb)
  )ORDER BY risk.status,risk.severity DESC,risk.due_date,risk.id),'[]'::jsonb)) INTO v_result
  FROM public.project_risk_cases risk JOIN public.project_source_references source ON source.id=risk.source_reference_id WHERE risk.project_id=p_project_id;
  RETURN v_result;
END;$$;

REVOKE ALL ON FUNCTION public.get_project_risk_register(bigint) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.project_source_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_risk_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_action_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_source_references_read ON public.project_source_references;CREATE POLICY project_source_references_read ON public.project_source_references FOR SELECT TO authenticated USING(public.can_access_project(project_id));
DROP POLICY IF EXISTS project_risk_cases_read ON public.project_risk_cases;CREATE POLICY project_risk_cases_read ON public.project_risk_cases FOR SELECT TO authenticated USING(public.can_access_project(project_id));
DROP POLICY IF EXISTS project_actions_read ON public.project_actions;CREATE POLICY project_actions_read ON public.project_actions FOR SELECT TO authenticated USING(public.can_access_project(project_id));
DROP POLICY IF EXISTS project_risk_events_read ON public.project_risk_events;CREATE POLICY project_risk_events_read ON public.project_risk_events FOR SELECT TO authenticated USING(public.can_access_project(project_id));
DROP POLICY IF EXISTS project_action_events_read ON public.project_action_events;CREATE POLICY project_action_events_read ON public.project_action_events FOR SELECT TO authenticated USING(public.can_access_project(project_id));

REVOKE ALL ON TABLE public.project_source_references,public.project_risk_cases,public.project_actions,public.project_risk_events,public.project_action_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_source_references,public.project_risk_cases,public.project_actions,public.project_risk_events,public.project_action_events TO authenticated;
REVOKE ALL ON FUNCTION private.prevent_project_provenance_event_mutation(),private.assert_active_project_membership(bigint,uuid),private.assert_project_risk_register_access(bigint),
  public.register_project_source_reference(bigint,uuid,text,text,text,text,uuid),
  public.create_project_risk(bigint,uuid,uuid,text,text,text,text,uuid,date,uuid),public.transition_project_risk(uuid,text,integer,uuid),
  public.create_project_action(bigint,uuid,uuid,text,text,uuid,date,uuid),public.transition_project_action(uuid,text,integer,uuid),
  public.link_project_variation_provenance(uuid,uuid,uuid),public.get_project_risk_register(bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_project_source_reference(bigint,uuid,text,text,text,text,uuid),
  public.create_project_risk(bigint,uuid,uuid,text,text,text,text,uuid,date,uuid),public.transition_project_risk(uuid,text,integer,uuid),
  public.create_project_action(bigint,uuid,uuid,text,text,uuid,date,uuid),public.transition_project_action(uuid,text,integer,uuid),
  public.link_project_variation_provenance(uuid,uuid,uuid),public.get_project_risk_register(bigint)
  TO authenticated;

COMMIT;
