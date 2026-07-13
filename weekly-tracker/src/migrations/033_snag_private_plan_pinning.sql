-- Phase 3: private immutable PDF plans and page-bound normalized snag pins.
ALTER TABLE public.snag_plan_versions
  ADD COLUMN original_filename text,
  ADD COLUMN byte_size bigint CHECK (byte_size > 0 AND byte_size <= 20971520),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN schema_version integer NOT NULL DEFAULT 2 CHECK (schema_version > 0);

ALTER TABLE public.snags ADD COLUMN plan_page_number integer;
ALTER TABLE public.snags ADD CONSTRAINT snags_plan_location_complete CHECK (
  (plan_version_id IS NULL AND plan_page_number IS NULL AND plan_x IS NULL AND plan_y IS NULL)
  OR (plan_version_id IS NOT NULL AND plan_page_number > 0 AND plan_x BETWEEN 0 AND 1 AND plan_y BETWEEN 0 AND 1)
);
CREATE UNIQUE INDEX snag_plan_versions_one_active_per_project
  ON public.snag_plan_versions(project_id) WHERE is_active AND archived_at IS NULL;
CREATE INDEX idx_snags_plan_page ON public.snags(plan_version_id,plan_page_number) WHERE plan_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_snag_plan_location() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_plan public.snag_plan_versions%ROWTYPE;
BEGIN
  IF NEW.plan_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_plan FROM public.snag_plan_versions WHERE id=NEW.plan_version_id;
  IF NOT FOUND OR v_plan.project_id<>NEW.project_id THEN RAISE EXCEPTION 'PLAN_PROJECT_MISMATCH' USING ERRCODE='23514'; END IF;
  IF NEW.plan_page_number IS NULL OR NEW.plan_page_number<1 OR NEW.plan_page_number>v_plan.page_count THEN RAISE EXCEPTION 'INVALID_PLAN_PAGE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER snags_validate_plan_location BEFORE INSERT OR UPDATE OF project_id,plan_version_id,plan_page_number,plan_x,plan_y
ON public.snags FOR EACH ROW EXECUTE FUNCTION public.validate_snag_plan_location();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('snag-plans','snag-plans',false,20971520,ARRAY['application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY snag_plans_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='snag-plans' AND public.can_access_project(((storage.foldername(name))[1])::bigint)
);
CREATE POLICY snag_plans_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='snag-plans'
  AND (storage.foldername(name))[2]=auth.uid()::text
  AND lower(storage.extension(name))='pdf'
  AND public.can_write_project(((storage.foldername(name))[1])::bigint)
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND lower(p.role) IN ('admin','pm'))
);
CREATE POLICY snag_plans_orphan_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='snag-plans'
  AND (storage.foldername(name))[2]=auth.uid()::text
  AND public.can_write_project(((storage.foldername(name))[1])::bigint)
  AND NOT EXISTS(SELECT 1 FROM public.snag_plan_versions pv WHERE pv.storage_path=name)
);

CREATE OR REPLACE FUNCTION public.create_snag_plan_upload_intent(p_project_id bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF v_role NOT IN ('admin','pm') OR NOT public.can_write_project(p_project_id) THEN RAISE EXCEPTION 'PLAN_MANAGEMENT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('bucket','snag-plans','path',p_project_id::text||'/'||v_uid::text||'/'||p_request_id::text||'.pdf','requestId',p_request_id);
END $$;

CREATE OR REPLACE FUNCTION public.register_snag_plan_version(p_project_id bigint,p_request_id uuid,p_name text,p_version text,p_original_filename text,p_page_count integer)
RETURNS public.snag_plan_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_path text;v_object storage.objects%ROWTYPE;v_plan public.snag_plan_versions%ROWTYPE;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN ('admin','pm') OR NOT public.can_write_project(p_project_id) THEN RAISE EXCEPTION 'PLAN_MANAGEMENT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF btrim(coalesce(p_name,''))='' OR btrim(coalesce(p_version,''))='' OR p_page_count<1 THEN RAISE EXCEPTION 'INVALID_PLAN_METADATA' USING ERRCODE='22023'; END IF;
  v_path:=p_project_id::text||'/'||v_uid::text||'/'||p_request_id::text||'.pdf';
  SELECT * INTO v_object FROM storage.objects WHERE bucket_id='snag-plans' AND name=v_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_UPLOAD_MISSING' USING ERRCODE='P0002'; END IF;
  IF coalesce(v_object.metadata->>'mimetype','')<>'application/pdf' OR coalesce((v_object.metadata->>'size')::bigint,0)<=0 OR (v_object.metadata->>'size')::bigint>20971520 THEN RAISE EXCEPTION 'INVALID_PLAN_FILE' USING ERRCODE='22023'; END IF;
  INSERT INTO public.snag_plan_versions(project_id,name,version,storage_path,mime_type,page_count,created_by,is_active,original_filename,byte_size)
  VALUES(p_project_id,btrim(p_name),btrim(p_version),v_path,'application/pdf',p_page_count,v_uid,false,p_original_filename,(v_object.metadata->>'size')::bigint)
  RETURNING * INTO v_plan;RETURN v_plan;
END $$;

CREATE OR REPLACE FUNCTION public.set_snag_plan_lifecycle(p_plan_id uuid,p_action text)
RETURNS public.snag_plan_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_plan public.snag_plan_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.snag_plan_versions WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN ('admin','pm') OR NOT public.can_write_project(v_plan.project_id) THEN RAISE EXCEPTION 'PLAN_MANAGEMENT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_action='ACTIVATE' THEN
    IF v_plan.archived_at IS NOT NULL THEN RAISE EXCEPTION 'PLAN_ARCHIVED' USING ERRCODE='22023'; END IF;
    UPDATE public.snag_plan_versions SET is_active=false WHERE project_id=v_plan.project_id AND id<>p_plan_id AND is_active;
    UPDATE public.snag_plan_versions SET is_active=true WHERE id=p_plan_id RETURNING * INTO v_plan;
  ELSIF p_action='ARCHIVE' THEN
    UPDATE public.snag_plan_versions SET is_active=false,archived_at=now() WHERE id=p_plan_id RETURNING * INTO v_plan;
  ELSE RAISE EXCEPTION 'INVALID_PLAN_ACTION' USING ERRCODE='22023'; END IF;
  RETURN v_plan;
END $$;

CREATE OR REPLACE FUNCTION public.execute_snag_plan_command(p_command jsonb,p_client_request_id uuid,p_expected_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_type text:=p_command->>'type';v_project_id bigint:=(p_command->>'projectId')::bigint;v_snag public.snags%ROWTYPE;v_plan public.snag_plan_versions%ROWTYPE;v_payload jsonb:=p_command->'payload';v_req public.snag_command_requests%ROWTYPE;v_event_id bigint;v_response jsonb;v_number integer;
BEGIN
  SELECT upper(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF v_role NOT IN ('ADMIN','PM') OR NOT public.can_write_project(v_project_id) THEN RAISE EXCEPTION 'COMMAND_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_plan FROM public.snag_plan_versions WHERE id=(v_payload->>'planVersionId')::uuid AND project_id=v_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_PROJECT_MISMATCH' USING ERRCODE='23514'; END IF;
  INSERT INTO public.snag_command_requests(actor_id,client_request_id,project_id,command_type,request_payload) VALUES(v_uid,p_client_request_id,v_project_id,v_type,p_command) ON CONFLICT DO NOTHING;
  SELECT * INTO v_req FROM public.snag_command_requests WHERE actor_id=v_uid AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_req.request_payload<>p_command THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF v_req.response IS NOT NULL THEN RETURN v_req.response||jsonb_build_object('idempotentReplay',true); END IF;
  IF v_type='createSnagFromPlan' THEN
    PERFORM pg_advisory_xact_lock(v_project_id);SELECT coalesce(max(snag_number),0)+1 INTO v_number FROM public.snags WHERE project_id=v_project_id;
    INSERT INTO public.snags(project_id,snag_number,title,description,category_code,discipline_code,priority,status,assignee_id,due_date,location_zone_id,location_level,location_room,location_text,plan_version_id,plan_page_number,plan_x,plan_y,created_by)
    VALUES(v_project_id,v_number,btrim(v_payload->>'title'),coalesce(v_payload->>'description',''),coalesce(v_payload->>'categoryCode','GENERAL'),coalesce(v_payload->>'disciplineCode','GENERAL'),coalesce(v_payload->>'priority','MEDIUM'),CASE WHEN nullif(v_payload->>'assigneeId','') IS NULL THEN 'OPEN' ELSE 'ASSIGNED' END,nullif(v_payload->>'assigneeId','')::uuid,nullif(v_payload->>'dueDate','')::date,nullif(v_payload->'location'->>'zoneId',''),nullif(v_payload->'location'->>'level',''),nullif(v_payload->'location'->>'room',''),nullif(v_payload->'location'->>'text',''),v_plan.id,(v_payload->>'pageNumber')::integer,(v_payload->>'x')::numeric,(v_payload->>'y')::numeric,v_uid) RETURNING * INTO v_snag;
    INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,new_state,source_command_id) VALUES(v_snag.id,v_project_id,v_uid,'SNAG_CREATED',to_jsonb(v_snag),p_client_request_id) RETURNING id INTO v_event_id;
  ELSIF v_type='updateSnagPlanLocation' THEN
    SELECT * INTO v_snag FROM public.snags WHERE id=(p_command->>'snagId')::uuid AND project_id=v_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF p_expected_version<>v_snag.version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
    IF v_snag.status IN ('CLOSED','CANCELLED') THEN RAISE EXCEPTION 'TERMINAL_STATE' USING ERRCODE='22023'; END IF;
    INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,previous_state,new_state,source_command_id)
    VALUES(v_snag.id,v_project_id,v_uid,'SNAG_LOCATION_CHANGED',to_jsonb(v_snag),to_jsonb(v_snag)||jsonb_build_object('plan_version_id',v_plan.id,'plan_page_number',(v_payload->>'pageNumber')::integer,'plan_x',(v_payload->>'x')::numeric,'plan_y',(v_payload->>'y')::numeric),p_client_request_id) RETURNING id INTO v_event_id;
    UPDATE public.snags SET plan_version_id=v_plan.id,plan_page_number=(v_payload->>'pageNumber')::integer,plan_x=(v_payload->>'x')::numeric,plan_y=(v_payload->>'y')::numeric,version=version+1,updated_at=now() WHERE id=v_snag.id RETURNING * INTO v_snag;
  ELSE RAISE EXCEPTION 'INVALID_PLAN_COMMAND' USING ERRCODE='22023'; END IF;
  v_response:=jsonb_build_object('snag',to_jsonb(v_snag),'eventId',v_event_id,'idempotentReplay',false);
  UPDATE public.snag_command_requests SET response=v_response,completed_at=now() WHERE actor_id=v_uid AND client_request_id=p_client_request_id;
  RETURN v_response;
END $$;

REVOKE ALL ON FUNCTION public.create_snag_plan_upload_intent(bigint,uuid),public.register_snag_plan_version(bigint,uuid,text,text,text,integer),public.set_snag_plan_lifecycle(uuid,text),public.execute_snag_plan_command(jsonb,uuid,integer),public.validate_snag_plan_location() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_snag_plan_upload_intent(bigint,uuid),public.register_snag_plan_version(bigint,uuid,text,text,text,integer),public.set_snag_plan_lifecycle(uuid,text),public.execute_snag_plan_command(jsonb,uuid,integer) TO authenticated;
