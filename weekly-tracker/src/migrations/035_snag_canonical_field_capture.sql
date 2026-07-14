-- Phase 5: canonical field capture, independent publication state, trades and stakeholders.

CREATE TABLE public.project_snag_sequences (
  project_id bigint PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
INSERT INTO public.project_snag_sequences(project_id,last_number)
SELECT project_id,max(snag_number) FROM public.snags GROUP BY project_id ON CONFLICT DO NOTHING;

CREATE TABLE public.project_snag_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code text NOT NULL, name text NOT NULL CHECK (btrim(name)<>''), color text NOT NULL DEFAULT '#2563EB' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,code), UNIQUE(project_id,name)
);
CREATE TABLE public.project_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_name text NOT NULL CHECK (btrim(company_name)<>''), project_role text NOT NULL DEFAULT '', contact_name text,
  email text, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.snag_trade_stakeholders (
  trade_id uuid NOT NULL REFERENCES public.project_snag_trades(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.project_stakeholders(id) ON DELETE CASCADE,
  is_preferred boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(trade_id,stakeholder_id)
);
CREATE UNIQUE INDEX snag_trade_one_preferred ON public.snag_trade_stakeholders(trade_id) WHERE is_preferred;

ALTER TABLE public.snags
  ADD COLUMN publication_state text NOT NULL DEFAULT 'PUBLISHED' CHECK (publication_state IN ('CAPTURED','PUBLISHED','ARCHIVED')),
  ADD COLUMN trade_id uuid REFERENCES public.project_snag_trades(id) ON DELETE RESTRICT,
  ADD COLUMN stakeholder_id uuid REFERENCES public.project_stakeholders(id) ON DELETE RESTRICT,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by uuid REFERENCES auth.users(id),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES auth.users(id),
  ADD COLUMN archive_reason text;
UPDATE public.snags SET published_at=created_at,published_by=created_by WHERE publication_state='PUBLISHED';
ALTER TABLE public.snags ADD CONSTRAINT snags_publication_timestamps CHECK (
  (publication_state='CAPTURED' AND published_at IS NULL AND archived_at IS NULL)
  OR (publication_state='PUBLISHED' AND published_at IS NOT NULL AND archived_at IS NULL)
  OR (publication_state='ARCHIVED' AND archived_at IS NOT NULL)
);
CREATE OR REPLACE FUNCTION public.normalize_snag_publication_timestamps() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.publication_state='PUBLISHED' THEN NEW.published_at:=coalesce(NEW.published_at,NEW.created_at,now());NEW.published_by:=coalesce(NEW.published_by,NEW.created_by);
  ELSIF NEW.publication_state='CAPTURED' THEN NEW.published_at:=NULL;NEW.published_by:=NULL;NEW.archived_at:=NULL;NEW.archived_by:=NULL;END IF;RETURN NEW;
END $$;
CREATE TRIGGER snags_normalize_publication BEFORE INSERT OR UPDATE OF publication_state ON public.snags FOR EACH ROW EXECUTE FUNCTION public.normalize_snag_publication_timestamps();
CREATE INDEX idx_snags_project_publication ON public.snags(project_id,publication_state,updated_at DESC);

CREATE TABLE public.snag_comments (
  id bigserial PRIMARY KEY, snag_id uuid NOT NULL REFERENCES public.snags(id) ON DELETE RESTRICT,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, body text NOT NULL CHECK (btrim(body)<>''),
  actor_id uuid NOT NULL REFERENCES auth.users(id), source_command_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_id,source_command_id)
);

ALTER TABLE public.project_snag_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_snag_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_trade_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY snag_trades_select ON public.project_snag_trades FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY project_stakeholders_select ON public.project_stakeholders FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY snag_trade_stakeholders_select ON public.snag_trade_stakeholders FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.project_snag_trades t WHERE t.id=trade_id AND public.can_access_project(t.project_id))
);
CREATE POLICY snag_comments_select ON public.snag_comments FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.snags s WHERE s.id=snag_id AND s.project_id=project_id AND public.can_access_project(project_id)
    AND (lower((SELECT role FROM public.profiles WHERE id=auth.uid()))<>'contractor' OR (s.publication_state='PUBLISHED' AND s.assignee_id=auth.uid())))
);

DROP POLICY snags_select ON public.snags;
CREATE POLICY snags_select ON public.snags FOR SELECT TO authenticated USING (
  public.can_access_project(project_id) AND (
    lower((SELECT role FROM public.profiles WHERE id=auth.uid()))<>'contractor'
    OR (publication_state='PUBLISHED' AND assignee_id=auth.uid())
  )
);
DROP POLICY snag_events_select ON public.snag_events;
CREATE POLICY snag_events_select ON public.snag_events FOR SELECT TO authenticated USING (
  public.can_access_project(project_id) AND EXISTS(SELECT 1 FROM public.snags s WHERE s.id=snag_id AND
    (lower((SELECT role FROM public.profiles WHERE id=auth.uid()))<>'contractor' OR (s.publication_state='PUBLISHED' AND s.assignee_id=auth.uid())))
);
DROP POLICY snag_evidence_select ON public.snag_evidence;
CREATE POLICY snag_evidence_select ON public.snag_evidence FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.snags s WHERE s.id=snag_id AND public.can_access_project(s.project_id) AND
    (lower((SELECT role FROM public.profiles WHERE id=auth.uid()))<>'contractor' OR (s.publication_state='PUBLISHED' AND s.assignee_id=auth.uid())))
);

REVOKE ALL ON public.project_snag_sequences,public.project_snag_trades,public.project_stakeholders,public.snag_trade_stakeholders,public.snag_comments FROM anon,authenticated;
GRANT SELECT ON public.project_snag_trades,public.project_stakeholders,public.snag_trade_stakeholders,public.snag_comments TO authenticated;
REVOKE ALL ON SEQUENCE public.snag_comments_id_seq FROM anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.snag_comments_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.next_snag_number(p_project_id bigint) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_number integer;
BEGIN
  INSERT INTO public.project_snag_sequences(project_id,last_number) VALUES(p_project_id,1)
  ON CONFLICT(project_id) DO UPDATE SET last_number=project_snag_sequences.last_number+1
  RETURNING last_number INTO v_number; RETURN v_number;
END $$;

CREATE OR REPLACE FUNCTION public.capture_snag_observation(p_project_id bigint,p_plan_id uuid,p_page integer,p_x numeric,p_y numeric,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_req public.snag_command_requests%ROWTYPE;v_plan public.snag_plan_versions%ROWTYPE;v_snag public.snags%ROWTYPE;v_number integer;v_event bigint;v_response jsonb;v_command jsonb;v_inserted integer;
BEGIN
  SELECT upper(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF v_role NOT IN ('ADMIN','PM') OR NOT public.can_write_project(p_project_id) THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_x NOT BETWEEN 0 AND 1 OR p_y NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'INVALID_PLAN_COORDINATES' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_plan FROM public.snag_plan_versions WHERE id=p_plan_id AND project_id=p_project_id AND p_page BETWEEN 1 AND page_count;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_PROJECT_MISMATCH' USING ERRCODE='23514'; END IF;
  p_x:=round(p_x,6);p_y:=round(p_y,6);
  v_command:=jsonb_build_object('type','captureObservation','projectId',p_project_id,'planId',p_plan_id,'page',p_page,'x',p_x,'y',p_y);
  INSERT INTO public.snag_command_requests(actor_id,client_request_id,project_id,command_type,request_payload)
  VALUES(v_uid,p_client_request_id,p_project_id,'captureObservation',v_command) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  SELECT * INTO v_req FROM public.snag_command_requests WHERE actor_id=v_uid AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_req.response IS NOT NULL THEN RETURN v_req.response||jsonb_build_object('idempotentReplay',true); END IF;
  IF v_inserted=0 AND v_req.request_payload IS DISTINCT FROM v_command THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  v_number:=public.next_snag_number(p_project_id);
  INSERT INTO public.snags(project_id,snag_number,title,category_code,discipline_code,priority,status,location_text,plan_version_id,plan_page_number,plan_x,plan_y,created_by,publication_state)
  VALUES(p_project_id,v_number,'Observation #'||v_number,'GENERAL','GENERAL','MEDIUM','OPEN','Plan page '||p_page,p_plan_id,p_page,p_x,p_y,v_uid,'CAPTURED') RETURNING * INTO v_snag;
  INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,new_state,source_command_id)
  VALUES(v_snag.id,p_project_id,v_uid,'SNAG_CAPTURED',to_jsonb(v_snag),p_client_request_id) RETURNING id INTO v_event;
  v_response:=jsonb_build_object('snag',to_jsonb(v_snag),'eventId',v_event,'idempotentReplay',false);
  UPDATE public.snag_command_requests SET response=v_response,completed_at=now() WHERE actor_id=v_uid AND client_request_id=p_client_request_id;
  RETURN v_response;
END $$;

CREATE OR REPLACE FUNCTION public.execute_snag_product_command(p_command jsonb,p_client_request_id uuid,p_expected_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_type text:=p_command->>'type';v_project bigint:=(p_command->>'projectId')::bigint;v_id uuid:=nullif(p_command->>'snagId','')::uuid;v_payload jsonb:=coalesce(p_command->'payload','{}');v_req public.snag_command_requests%ROWTYPE;v_snag public.snags%ROWTYPE;v_copy public.snags%ROWTYPE;v_trade public.project_snag_trades%ROWTYPE;v_stake public.project_stakeholders%ROWTYPE;v_event bigint;v_response jsonb;v_number integer;v_assignee uuid;
BEGIN
  SELECT upper(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF v_role NOT IN ('ADMIN','PM') OR NOT public.can_write_project(v_project) THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO public.snag_command_requests(actor_id,client_request_id,project_id,command_type,request_payload) VALUES(v_uid,p_client_request_id,v_project,v_type,p_command) ON CONFLICT DO NOTHING;
  SELECT * INTO v_req FROM public.snag_command_requests WHERE actor_id=v_uid AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_req.request_payload<>p_command THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF v_req.response IS NOT NULL THEN RETURN v_req.response||jsonb_build_object('idempotentReplay',true); END IF;
  SELECT * INTO v_snag FROM public.snags WHERE id=v_id AND project_id=v_project FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF p_expected_version IS DISTINCT FROM v_snag.version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_type='completeCapture' AND v_snag.publication_state='CAPTURED' THEN
    IF v_payload?'tradeId' THEN SELECT * INTO v_trade FROM public.project_snag_trades WHERE id=(v_payload->>'tradeId')::uuid AND project_id=v_project AND is_active; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TRADE' USING ERRCODE='22023'; END IF; END IF;
    IF v_payload?'stakeholderId' THEN SELECT * INTO v_stake FROM public.project_stakeholders WHERE id=(v_payload->>'stakeholderId')::uuid AND project_id=v_project AND is_active; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STAKEHOLDER' USING ERRCODE='22023'; END IF; END IF;
    UPDATE public.snags SET title=coalesce(nullif(btrim(v_payload->>'title'),''),title),description=coalesce(v_payload->>'description',description),trade_id=v_trade.id,stakeholder_id=v_stake.id,assignee_id=v_stake.user_id,
      discipline_code=coalesce(v_trade.code,discipline_code),priority=coalesce(v_payload->>'priority',priority),due_date=nullif(v_payload->>'dueDate','')::date,version=version+1,updated_at=now() WHERE id=v_id RETURNING * INTO v_snag;
    INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,new_state,source_command_id) VALUES(v_id,v_project,v_uid,'SNAG_CAPTURE_COMPLETED',to_jsonb(v_snag),p_client_request_id) RETURNING id INTO v_event;
  ELSIF v_type='publishObservation' AND v_snag.publication_state='CAPTURED' THEN
    IF v_snag.trade_id IS NULL OR v_snag.stakeholder_id IS NULL OR (btrim(v_snag.description)='' AND NOT EXISTS(SELECT 1 FROM public.snag_evidence e WHERE e.snag_id=v_id)) THEN RAISE EXCEPTION 'OBSERVATION_NEEDS_DETAILS' USING ERRCODE='22023'; END IF;
    SELECT user_id INTO v_assignee FROM public.project_stakeholders WHERE id=v_snag.stakeholder_id;
    UPDATE public.snags SET publication_state='PUBLISHED',published_at=now(),published_by=v_uid,assignee_id=v_assignee,status=CASE WHEN v_assignee IS NULL THEN 'OPEN' ELSE 'ASSIGNED' END,version=version+1,updated_at=now() WHERE id=v_id RETURNING * INTO v_snag;
    INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,new_state,source_command_id) VALUES(v_id,v_project,v_uid,'SNAG_PUBLISHED',to_jsonb(v_snag),p_client_request_id) RETURNING id INTO v_event;
  ELSIF v_type='archiveObservation' AND v_snag.publication_state<>'ARCHIVED' THEN
    IF btrim(coalesce(v_payload->>'reason',''))='' THEN RAISE EXCEPTION 'ARCHIVE_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
    UPDATE public.snags SET publication_state='ARCHIVED',archived_at=now(),archived_by=v_uid,archive_reason=btrim(v_payload->>'reason'),version=version+1,updated_at=now() WHERE id=v_id RETURNING * INTO v_snag;
    INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,new_state,reason,source_command_id) VALUES(v_id,v_project,v_uid,'SNAG_ARCHIVED',to_jsonb(v_snag),v_payload->>'reason',p_client_request_id) RETURNING id INTO v_event;
  ELSIF v_type='duplicateObservation' THEN
    v_number:=public.next_snag_number(v_project);
    INSERT INTO public.snags(project_id,snag_number,title,description,category_code,discipline_code,priority,status,due_date,location_zone_id,location_level,location_room,location_text,plan_version_id,plan_page_number,plan_x,plan_y,created_by,publication_state,trade_id,stakeholder_id)
    VALUES(v_project,v_number,v_snag.title,v_snag.description,v_snag.category_code,v_snag.discipline_code,v_snag.priority,'OPEN',v_snag.due_date,v_snag.location_zone_id,v_snag.location_level,v_snag.location_room,v_snag.location_text,v_snag.plan_version_id,v_snag.plan_page_number,v_snag.plan_x,v_snag.plan_y,v_uid,'CAPTURED',v_snag.trade_id,v_snag.stakeholder_id) RETURNING * INTO v_copy;
    INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,new_state,source_command_id) VALUES(v_copy.id,v_project,v_uid,'SNAG_DUPLICATED',jsonb_build_object('sourceSnagId',v_id,'snag',to_jsonb(v_copy)),p_client_request_id) RETURNING id INTO v_event;v_snag:=v_copy;
  ELSE RAISE EXCEPTION 'INVALID_PRODUCT_COMMAND' USING ERRCODE='22023'; END IF;
  v_response:=jsonb_build_object('snag',to_jsonb(v_snag),'eventId',v_event,'idempotentReplay',false);
  UPDATE public.snag_command_requests SET response=v_response,completed_at=now() WHERE actor_id=v_uid AND client_request_id=p_client_request_id;RETURN v_response;
END $$;

CREATE OR REPLACE FUNCTION public.publish_snag_observations(p_project_id bigint,p_snag_ids uuid[],p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_req public.snag_command_requests%ROWTYPE;v_command jsonb;v_row public.snags%ROWTYPE;v_valid uuid[]:='{}';v_invalid uuid[]:='{}';v_event uuid;
BEGIN
  SELECT upper(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN ('ADMIN','PM') OR NOT public.can_write_project(p_project_id) THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_command:=jsonb_build_object('type','batchPublish','projectId',p_project_id,'snagIds',to_jsonb(p_snag_ids));
  INSERT INTO public.snag_command_requests(actor_id,client_request_id,project_id,command_type,request_payload) VALUES(v_uid,p_client_request_id,p_project_id,'batchPublish',v_command) ON CONFLICT DO NOTHING;
  SELECT * INTO v_req FROM public.snag_command_requests WHERE actor_id=v_uid AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_req.request_payload<>v_command THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF v_req.response IS NOT NULL THEN RETURN v_req.response||jsonb_build_object('idempotentReplay',true); END IF;
  FOR v_row IN SELECT * FROM public.snags WHERE project_id=p_project_id AND id=ANY(p_snag_ids) ORDER BY snag_number FOR UPDATE LOOP
    IF v_row.publication_state='CAPTURED' AND v_row.trade_id IS NOT NULL AND v_row.stakeholder_id IS NOT NULL AND (btrim(v_row.description)<>'' OR EXISTS(SELECT 1 FROM public.snag_evidence e WHERE e.snag_id=v_row.id)) THEN
      UPDATE public.snags s SET publication_state='PUBLISHED',published_at=now(),published_by=v_uid,assignee_id=ps.user_id,status=CASE WHEN ps.user_id IS NULL THEN 'OPEN' ELSE 'ASSIGNED' END,version=s.version+1,updated_at=now() FROM public.project_stakeholders ps WHERE s.id=v_row.id AND ps.id=s.stakeholder_id;
      v_event:=gen_random_uuid();INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,new_state,source_command_id) SELECT id,project_id,v_uid,'SNAG_PUBLISHED',to_jsonb(s),v_event FROM public.snags s WHERE id=v_row.id;v_valid:=array_append(v_valid,v_row.id);
    ELSE v_invalid:=array_append(v_invalid,v_row.id); END IF;
  END LOOP;
  UPDATE public.snag_command_requests SET response=jsonb_build_object('published',v_valid,'needsDetails',v_invalid,'idempotentReplay',false),completed_at=now() WHERE actor_id=v_uid AND client_request_id=p_client_request_id;
  RETURN jsonb_build_object('published',v_valid,'needsDetails',v_invalid,'idempotentReplay',false);
END $$;

CREATE OR REPLACE FUNCTION public.add_snag_comment(p_project_id bigint,p_snag_id uuid,p_body text,p_client_request_id uuid)
RETURNS public.snag_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_snag public.snags%ROWTYPE;v_comment public.snag_comments%ROWTYPE;
BEGIN
  SELECT upper(role) INTO v_role FROM public.profiles WHERE id=v_uid;SELECT * INTO v_snag FROM public.snags WHERE id=p_snag_id AND project_id=p_project_id;
  IF NOT FOUND OR NOT public.can_access_project(p_project_id) THEN RAISE EXCEPTION 'PROJECT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF v_role='CONTRACTOR' AND (v_snag.publication_state<>'PUBLISHED' OR v_snag.assignee_id<>v_uid) THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_role='VIEWER' OR btrim(coalesce(p_body,''))='' THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO public.snag_comments(snag_id,project_id,body,actor_id,source_command_id) VALUES(p_snag_id,p_project_id,btrim(p_body),v_uid,p_client_request_id) ON CONFLICT(actor_id,source_command_id) DO UPDATE SET body=snag_comments.body RETURNING * INTO v_comment;
  INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,new_state,source_command_id) VALUES(p_snag_id,p_project_id,v_uid,'SNAG_COMMENT_ADDED',jsonb_build_object('commentId',v_comment.id),gen_random_uuid());RETURN v_comment;
END $$;

CREATE OR REPLACE FUNCTION public.configure_snag_catalog(p_project_id bigint,p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_trade public.project_snag_trades%ROWTYPE;v_stake public.project_stakeholders%ROWTYPE;
BEGIN
  SELECT upper(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN ('ADMIN','PM') OR NOT public.can_write_project(p_project_id) THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_action='CREATE_TRADE' THEN
    INSERT INTO public.project_snag_trades(project_id,code,name,color,created_by) VALUES(p_project_id,upper(regexp_replace(btrim(p_payload->>'name'),'[^a-zA-Z0-9]+','_','g')),btrim(p_payload->>'name'),coalesce(p_payload->>'color','#2563EB'),v_uid) RETURNING * INTO v_trade;RETURN to_jsonb(v_trade);
  ELSIF p_action='CREATE_STAKEHOLDER' THEN
    INSERT INTO public.project_stakeholders(project_id,company_name,project_role,contact_name,email,user_id,created_by) VALUES(p_project_id,btrim(p_payload->>'companyName'),coalesce(p_payload->>'projectRole',''),nullif(btrim(p_payload->>'contactName'),''),nullif(lower(btrim(p_payload->>'email')),''),nullif(p_payload->>'userId','')::uuid,v_uid) RETURNING * INTO v_stake;RETURN to_jsonb(v_stake);
  ELSIF p_action='MAP_STAKEHOLDER' THEN
    SELECT * INTO v_trade FROM public.project_snag_trades WHERE id=(p_payload->>'tradeId')::uuid AND project_id=p_project_id;
    SELECT * INTO v_stake FROM public.project_stakeholders WHERE id=(p_payload->>'stakeholderId')::uuid AND project_id=p_project_id;
    IF v_trade.id IS NULL OR v_stake.id IS NULL THEN RAISE EXCEPTION 'CATALOG_PROJECT_MISMATCH' USING ERRCODE='23514'; END IF;
    IF coalesce((p_payload->>'preferred')::boolean,false) THEN UPDATE public.snag_trade_stakeholders SET is_preferred=false WHERE trade_id=v_trade.id; END IF;
    INSERT INTO public.snag_trade_stakeholders(trade_id,stakeholder_id,is_preferred) VALUES(v_trade.id,v_stake.id,coalesce((p_payload->>'preferred')::boolean,false)) ON CONFLICT(trade_id,stakeholder_id) DO UPDATE SET is_preferred=excluded.is_preferred;RETURN jsonb_build_object('tradeId',v_trade.id,'stakeholderId',v_stake.id);
  ELSE RAISE EXCEPTION 'INVALID_CATALOG_ACTION' USING ERRCODE='22023'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.normalize_snag_publication_timestamps(),public.next_snag_number(bigint),public.capture_snag_observation(bigint,uuid,integer,numeric,numeric,uuid),public.execute_snag_product_command(jsonb,uuid,integer),public.publish_snag_observations(bigint,uuid[],uuid),public.add_snag_comment(bigint,uuid,text,uuid),public.configure_snag_catalog(bigint,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_snag_observation(bigint,uuid,integer,numeric,numeric,uuid),public.execute_snag_product_command(jsonb,uuid,integer),public.publish_snag_observations(bigint,uuid[],uuid),public.add_snag_comment(bigint,uuid,text,uuid),public.configure_snag_catalog(bigint,text,jsonb) TO authenticated;
