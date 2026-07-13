-- 030_snag_list_foundation.sql
-- Headless Snag List aggregate, append-only history, evidence metadata and atomic commands.

CREATE TABLE public.snag_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''), version text NOT NULL CHECK (btrim(version) <> ''),
  storage_path text NOT NULL CHECK (btrim(storage_path) <> ''), mime_type text NOT NULL DEFAULT 'application/pdf',
  page_count integer CHECK (page_count > 0), created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), is_active boolean NOT NULL DEFAULT true,
  UNIQUE(project_id, version)
);

CREATE TABLE public.snags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snag_number integer NOT NULL CHECK (snag_number > 0), title text NOT NULL CHECK (btrim(title) <> ''), description text NOT NULL DEFAULT '',
  category_code text NOT NULL, discipline_code text NOT NULL, priority text NOT NULL CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','READY_FOR_REVIEW','CLOSED','CANCELLED')),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, due_date date,
  location_zone_id text, location_level text, location_room text, location_text text,
  plan_version_id uuid REFERENCES public.snag_plan_versions(id) ON DELETE RESTRICT,
  plan_x numeric, plan_y numeric, location_schema_version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz, cancelled_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version > 0), schema_version integer NOT NULL DEFAULT 1, workflow_version integer NOT NULL DEFAULT 1,
  UNIQUE(project_id, snag_number),
  CHECK (location_zone_id IS NOT NULL OR location_level IS NOT NULL OR location_room IS NOT NULL OR location_text IS NOT NULL),
  CHECK ((plan_x IS NULL AND plan_y IS NULL) OR (plan_version_id IS NOT NULL AND plan_x BETWEEN 0 AND 1 AND plan_y BETWEEN 0 AND 1)),
  CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL)),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
);

CREATE TABLE public.snag_events (
  id bigserial PRIMARY KEY, snag_id uuid NOT NULL REFERENCES public.snags(id) ON DELETE CASCADE,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, actor_id uuid NOT NULL REFERENCES auth.users(id),
  event_type text NOT NULL, previous_state jsonb, new_state jsonb, reason text, source_command_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(), schema_version integer NOT NULL DEFAULT 1,
  UNIQUE(actor_id, source_command_id)
);

CREATE TABLE public.snag_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snag_id uuid NOT NULL REFERENCES public.snags(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (btrim(evidence_type) <> ''), storage_path text NOT NULL CHECK (btrim(storage_path) <> ''),
  note text NOT NULL DEFAULT '', created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  transition_event_id bigint REFERENCES public.snag_events(id) ON DELETE SET NULL
);

CREATE TABLE public.snag_command_requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id), client_request_id uuid NOT NULL, project_id bigint NOT NULL REFERENCES public.projects(id),
  command_type text NOT NULL, request_payload jsonb NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  PRIMARY KEY(actor_id, client_request_id)
);

CREATE INDEX idx_snags_project_status ON public.snags(project_id,status);
CREATE INDEX idx_snags_assignee_status ON public.snags(assignee_id,status);
CREATE INDEX idx_snags_project_due ON public.snags(project_id,due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_snags_project_filters ON public.snags(project_id,category_code,discipline_code,priority);
CREATE INDEX idx_snag_events_snag_time ON public.snag_events(snag_id,occurred_at,id);
CREATE INDEX idx_snag_evidence_snag_time ON public.snag_evidence(snag_id,created_at);

ALTER TABLE public.snag_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_command_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY snag_plan_versions_select ON public.snag_plan_versions FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY snags_select ON public.snags FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY snag_events_select ON public.snag_events FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY snag_evidence_select ON public.snag_evidence FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.snags s WHERE s.id=snag_id AND public.can_access_project(s.project_id)));

REVOKE ALL ON public.snag_plan_versions, public.snags, public.snag_events, public.snag_evidence, public.snag_command_requests FROM anon, authenticated;
GRANT SELECT ON public.snag_plan_versions, public.snags, public.snag_events, public.snag_evidence TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_snag_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SNAG_EVENT_IMMUTABLE' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER snag_events_immutable BEFORE UPDATE OR DELETE ON public.snag_events FOR EACH ROW EXECUTE FUNCTION public.prevent_snag_event_mutation();

CREATE OR REPLACE FUNCTION public.execute_snag_command(p_command jsonb, p_client_request_id uuid, p_expected_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_role text; v_type text := p_command->>'type'; v_project_id bigint := (p_command->>'projectId')::bigint;
  v_snag_id uuid := NULLIF(p_command->>'snagId','')::uuid; v_payload jsonb := COALESCE(p_command->'payload','{}');
  v_req public.snag_command_requests%ROWTYPE; v_snag public.snags%ROWTYPE; v_before jsonb; v_event_type text; v_reason text;
  v_event_id bigint; v_evidence_id uuid; v_response jsonb; v_next_status text; v_number integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF p_client_request_id IS NULL OR v_type IS NULL OR v_project_id IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
  SELECT upper(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF NOT public.can_access_project(v_project_id) THEN RAISE EXCEPTION 'PROJECT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  INSERT INTO public.snag_command_requests(actor_id,client_request_id,project_id,command_type,request_payload)
  VALUES(v_uid,p_client_request_id,v_project_id,v_type,p_command)
  ON CONFLICT(actor_id,client_request_id) DO NOTHING;
  SELECT * INTO v_req FROM public.snag_command_requests WHERE actor_id=v_uid AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_req.project_id<>v_project_id OR v_req.command_type<>v_type OR v_req.request_payload<>p_command THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF v_req.response IS NOT NULL THEN RETURN v_req.response || jsonb_build_object('idempotentReplay',true); END IF;

  IF v_type='createSnag' THEN
    IF v_role NOT IN ('ADMIN','PM') OR NOT public.can_write_project(v_project_id) THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
    IF btrim(COALESCE(v_payload->>'title',''))='' THEN RAISE EXCEPTION 'TITLE_REQUIRED' USING ERRCODE='22023'; END IF;
    IF btrim(COALESCE(v_payload->'location'->>'text',v_payload->'location'->>'zoneId',v_payload->'location'->>'level',v_payload->'location'->>'room',''))='' THEN RAISE EXCEPTION 'LOCATION_REQUIRED' USING ERRCODE='22023'; END IF;
    PERFORM pg_advisory_xact_lock(v_project_id);
    SELECT COALESCE(MAX(snag_number),0)+1 INTO v_number FROM public.snags WHERE project_id=v_project_id;
    INSERT INTO public.snags(project_id,snag_number,title,description,category_code,discipline_code,priority,status,assignee_id,due_date,
      location_zone_id,location_level,location_room,location_text,plan_version_id,plan_x,plan_y,created_by)
    VALUES(v_project_id,v_number,btrim(v_payload->>'title'),COALESCE(v_payload->>'description',''),COALESCE(v_payload->>'categoryCode','GENERAL'),COALESCE(v_payload->>'disciplineCode','GENERAL'),COALESCE(v_payload->>'priority','MEDIUM'),
      CASE WHEN NULLIF(v_payload->>'assigneeId','') IS NULL THEN 'OPEN' ELSE 'ASSIGNED' END,NULLIF(v_payload->>'assigneeId','')::uuid,NULLIF(v_payload->>'dueDate','')::date,
      NULLIF(v_payload->'location'->>'zoneId',''),NULLIF(v_payload->'location'->>'level',''),NULLIF(v_payload->'location'->>'room',''),NULLIF(v_payload->'location'->>'text',''),
      NULLIF(v_payload->'location'->>'planVersionId','')::uuid,NULLIF(v_payload->'location'->>'x','')::numeric,NULLIF(v_payload->'location'->>'y','')::numeric,v_uid) RETURNING * INTO v_snag;
    v_event_type:='SNAG_CREATED'; v_before:=NULL;
  ELSE
    SELECT * INTO v_snag FROM public.snags WHERE id=v_snag_id AND project_id=v_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF p_expected_version IS NULL OR p_expected_version<>v_snag.version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
    v_before:=to_jsonb(v_snag); v_reason:=NULLIF(btrim(v_payload->>'reason'),'');
    IF v_type IN ('startSnagWork','markSnagReadyForReview','addSnagEvidence') THEN
      IF v_role<>'CONTRACTOR' OR v_snag.assignee_id<>v_uid THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
    ELSIF v_role NOT IN ('ADMIN','PM') OR NOT public.can_write_project(v_project_id) THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;

    IF v_type='assignSnag' AND v_snag.status IN ('OPEN','ASSIGNED','IN_PROGRESS','READY_FOR_REVIEW') THEN v_next_status:='ASSIGNED'; v_event_type:='SNAG_ASSIGNED'; v_snag.assignee_id:=NULLIF(v_payload->>'assigneeId','')::uuid;
    ELSIF v_type='unassignSnag' AND v_snag.status='ASSIGNED' THEN v_next_status:='OPEN'; v_event_type:='SNAG_UNASSIGNED'; v_snag.assignee_id:=NULL;
    ELSIF v_type='startSnagWork' AND v_snag.status='ASSIGNED' THEN v_next_status:='IN_PROGRESS'; v_event_type:='SNAG_STATUS_CHANGED';
    ELSIF v_type='markSnagReadyForReview' AND v_snag.status='IN_PROGRESS' THEN v_next_status:='READY_FOR_REVIEW'; v_event_type:='SNAG_STATUS_CHANGED';
    ELSIF v_type='approveAndCloseSnag' AND v_snag.status='READY_FOR_REVIEW' THEN v_next_status:='CLOSED'; v_event_type:='SNAG_CLOSED';
    ELSIF v_type='rejectSnag' AND v_snag.status='READY_FOR_REVIEW' AND v_reason IS NOT NULL THEN v_next_status:='IN_PROGRESS'; v_event_type:='SNAG_REJECTED';
    ELSIF v_type='reopenSnag' AND v_snag.status='CLOSED' AND v_reason IS NOT NULL THEN v_next_status:='IN_PROGRESS'; v_event_type:='SNAG_REOPENED';
    ELSIF v_type='cancelSnag' AND v_snag.status<>'CANCELLED' AND v_reason IS NOT NULL THEN v_next_status:='CANCELLED'; v_event_type:='SNAG_CANCELLED';
    ELSIF v_type='updateSnagDetails' AND v_snag.status NOT IN ('CLOSED','CANCELLED') THEN v_next_status:=v_snag.status; v_event_type:='SNAG_DETAILS_CHANGED';
      v_snag.title:=COALESCE(NULLIF(btrim(v_payload->>'title'),''),v_snag.title); v_snag.description:=COALESCE(v_payload->>'description',v_snag.description);
      v_snag.priority:=COALESCE(v_payload->>'priority',v_snag.priority); v_snag.due_date:=CASE WHEN v_payload ? 'dueDate' THEN NULLIF(v_payload->>'dueDate','')::date ELSE v_snag.due_date END;
    ELSIF v_type='updateSnagLocation' AND v_snag.status NOT IN ('CLOSED','CANCELLED') THEN v_next_status:=v_snag.status; v_event_type:='SNAG_LOCATION_CHANGED';
      v_snag.location_zone_id:=NULLIF(v_payload->'location'->>'zoneId',''); v_snag.location_level:=NULLIF(v_payload->'location'->>'level',''); v_snag.location_room:=NULLIF(v_payload->'location'->>'room',''); v_snag.location_text:=NULLIF(v_payload->'location'->>'text','');
      v_snag.plan_version_id:=NULLIF(v_payload->'location'->>'planVersionId','')::uuid; v_snag.plan_x:=NULLIF(v_payload->'location'->>'x','')::numeric; v_snag.plan_y:=NULLIF(v_payload->'location'->>'y','')::numeric;
    ELSIF v_type='addSnagEvidence' AND v_snag.status NOT IN ('CLOSED','CANCELLED') THEN v_next_status:=v_snag.status; v_event_type:='SNAG_EVIDENCE_ADDED';
      INSERT INTO public.snag_evidence(snag_id,evidence_type,storage_path,note,created_by) VALUES(v_snag.id,v_payload->>'evidenceType',v_payload->>'storagePath',COALESCE(v_payload->>'note',''),v_uid) RETURNING id INTO v_evidence_id;
    ELSE RAISE EXCEPTION 'INVALID_SNAG_TRANSITION' USING ERRCODE='22023'; END IF;
    UPDATE public.snags SET title=v_snag.title,description=v_snag.description,priority=v_snag.priority,due_date=v_snag.due_date,
      status=v_next_status,assignee_id=v_snag.assignee_id,location_zone_id=v_snag.location_zone_id,location_level=v_snag.location_level,location_room=v_snag.location_room,location_text=v_snag.location_text,
      plan_version_id=v_snag.plan_version_id,plan_x=v_snag.plan_x,plan_y=v_snag.plan_y,version=version+1,updated_at=now(),closed_at=CASE WHEN v_next_status='CLOSED' THEN now() ELSE NULL END,cancelled_at=CASE WHEN v_next_status='CANCELLED' THEN now() ELSE NULL END
    WHERE id=v_snag.id RETURNING * INTO v_snag;
  END IF;
  INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,previous_state,new_state,reason,source_command_id)
  VALUES(v_snag.id,v_project_id,v_uid,v_event_type,v_before,to_jsonb(v_snag),v_reason,p_client_request_id) RETURNING id INTO v_event_id;
  IF v_evidence_id IS NOT NULL THEN UPDATE public.snag_evidence SET transition_event_id=v_event_id WHERE id=v_evidence_id; END IF;
  v_response:=jsonb_build_object('snag',to_jsonb(v_snag),'eventId',v_event_id,'evidenceId',v_evidence_id,'idempotentReplay',false);
  UPDATE public.snag_command_requests SET response=v_response,completed_at=now() WHERE actor_id=v_uid AND client_request_id=p_client_request_id;
  RETURN v_response;
END $$;

REVOKE ALL ON FUNCTION public.execute_snag_command(jsonb,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_snag_command(jsonb,uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.prevent_snag_event_mutation() FROM PUBLIC, anon, authenticated;

-- Production has broad platform default ACLs; explicitly close them on every new object.
REVOKE ALL ON SEQUENCE public.snag_events_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.snag_events_id_seq TO service_role;
