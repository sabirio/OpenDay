-- Phase 4: private, idempotent Snag evidence lifecycle and closeout read model.
ALTER TABLE public.snag_evidence
  ADD COLUMN project_id bigint REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN original_filename text,
  ADD COLUMN mime_type text,
  ADD COLUMN byte_size bigint CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 8388608),
  ADD COLUMN client_request_id uuid,
  ADD COLUMN capture_timestamp timestamptz,
  ADD COLUMN evidence_sequence integer CHECK (evidence_sequence IS NULL OR evidence_sequence > 0),
  ADD COLUMN checksum text,
  ADD COLUMN schema_version integer NOT NULL DEFAULT 2 CHECK (schema_version > 0);

UPDATE public.snag_evidence e SET project_id=s.project_id FROM public.snags s WHERE s.id=e.snag_id AND e.project_id IS NULL;
ALTER TABLE public.snag_evidence ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.snag_evidence ADD CONSTRAINT snag_evidence_type_v2 CHECK (
  original_filename IS NULL OR evidence_type IN ('CONDITION','CORRECTION','VERIFICATION','GENERAL')
);
CREATE UNIQUE INDEX snag_evidence_actor_request ON public.snag_evidence(created_by,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX snag_evidence_storage_identity ON public.snag_evidence(storage_path) WHERE original_filename IS NOT NULL;
CREATE INDEX idx_snag_evidence_project_snag_order ON public.snag_evidence(project_id,snag_id,created_at,id);

CREATE TABLE public.snag_evidence_upload_intents (
  id uuid PRIMARY KEY, project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snag_id uuid NOT NULL REFERENCES public.snags(id) ON DELETE CASCADE, actor_id uuid NOT NULL REFERENCES auth.users(id),
  client_request_id uuid NOT NULL, expected_snag_version integer NOT NULL CHECK (expected_snag_version > 0),
  evidence_type text NOT NULL CHECK (evidence_type IN ('CONDITION','CORRECTION','VERIFICATION','GENERAL')),
  storage_path text NOT NULL UNIQUE, original_filename text NOT NULL CHECK (btrim(original_filename)<>''),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608), note text NOT NULL DEFAULT '',
  capture_timestamp timestamptz, checksum text, request_fingerprint jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'), registered_at timestamptz,
  UNIQUE(actor_id,client_request_id)
);
CREATE INDEX idx_snag_evidence_intents_expiry ON public.snag_evidence_upload_intents(expires_at) WHERE registered_at IS NULL;
ALTER TABLE public.snag_evidence_upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.snag_evidence_upload_intents FROM anon,authenticated;
CREATE POLICY snag_evidence_intents_own_read ON public.snag_evidence_upload_intents FOR SELECT TO authenticated USING (actor_id=auth.uid());
GRANT SELECT ON public.snag_evidence_upload_intents TO authenticated;
GRANT SELECT,DELETE ON public.snag_evidence_upload_intents TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('snag-evidence','snag-evidence',false,8388608,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY snag_evidence_files_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='snag-evidence' AND (EXISTS(
    SELECT 1 FROM public.snag_evidence e JOIN public.snags s ON s.id=e.snag_id
    WHERE e.storage_path=name AND e.project_id=s.project_id AND public.can_access_project(s.project_id)
  ) OR EXISTS(SELECT 1 FROM public.snag_evidence_upload_intents i WHERE i.storage_path=name AND i.actor_id=auth.uid() AND i.registered_at IS NULL))
);
CREATE POLICY snag_evidence_files_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='snag-evidence' AND EXISTS(
    SELECT 1 FROM public.snag_evidence_upload_intents i JOIN public.snags s ON s.id=i.snag_id AND s.project_id=i.project_id
    WHERE i.storage_path=name AND i.actor_id=auth.uid() AND i.registered_at IS NULL AND i.expires_at>now()
      AND public.can_access_project(i.project_id)
  )
);
CREATE POLICY snag_evidence_orphan_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='snag-evidence' AND EXISTS(
    SELECT 1 FROM public.snag_evidence_upload_intents i WHERE i.storage_path=name AND i.actor_id=auth.uid()
      AND i.registered_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.snag_evidence e WHERE e.storage_path=name)
  )
);

CREATE OR REPLACE FUNCTION public.authorize_snag_evidence_upload(p_project_id bigint,p_snag_id uuid,p_request_id uuid,p_evidence_id uuid,p_expected_version integer,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_snag public.snags%ROWTYPE;v_type text:=upper(p_metadata->>'evidenceType');v_name text;v_mime text:=lower(p_metadata->>'mimeType');v_size bigint:=(p_metadata->>'byteSize')::bigint;v_path text;v_fingerprint jsonb;v_existing public.snag_evidence_upload_intents%ROWTYPE;v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT upper(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  v_name:=regexp_replace(regexp_replace(coalesce(p_metadata->>'filename','evidence'),'[^A-Za-z0-9._-]+','-','g'),'(^[.-]+|[.-]+$)','','g');
  IF v_name='' THEN v_name:='evidence'; END IF; v_name:=left(v_name,120);
  v_path:='projects/'||p_project_id||'/snags/'||p_snag_id||'/evidence/'||p_evidence_id||'/'||v_name;
  v_fingerprint:=jsonb_build_object('projectId',p_project_id,'snagId',p_snag_id,'evidenceId',p_evidence_id,'expectedVersion',p_expected_version,'evidenceType',v_type,'filename',v_name,'mimeType',v_mime,'byteSize',v_size,'note',left(coalesce(p_metadata->>'note',''),2000),'captureTimestamp',p_metadata->>'captureTimestamp','checksum',p_metadata->>'checksum');
  SELECT * INTO v_existing FROM public.snag_evidence_upload_intents WHERE actor_id=v_uid AND client_request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('bucket','snag-evidence','path',v_existing.storage_path,'evidenceId',v_existing.id,'requestId',v_existing.client_request_id,'expiresAt',v_existing.expires_at,'registered',v_existing.registered_at IS NOT NULL);
  END IF;
  SELECT * INTO v_snag FROM public.snags WHERE id=p_snag_id AND project_id=p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public.can_access_project(p_project_id) THEN RAISE EXCEPTION 'EVIDENCE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF v_snag.version<>p_expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_snag.status IN ('CLOSED','CANCELLED') THEN RAISE EXCEPTION 'EVIDENCE_TERMINAL_STATE' USING ERRCODE='22023'; END IF;
  IF v_role='CONTRACTOR' AND (v_snag.assignee_id<>v_uid OR v_type NOT IN ('CORRECTION','GENERAL')) THEN RAISE EXCEPTION 'EVIDENCE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF v_role IN ('ADMIN','PM') AND (v_type NOT IN ('CONDITION','VERIFICATION','GENERAL') OR NOT public.can_write_project(p_project_id)) THEN RAISE EXCEPTION 'EVIDENCE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF v_role NOT IN ('ADMIN','PM','CONTRACTOR') THEN RAISE EXCEPTION 'EVIDENCE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF v_type NOT IN ('CONDITION','CORRECTION','VERIFICATION','GENERAL') OR v_mime NOT IN ('image/jpeg','image/png','image/webp') OR v_size NOT BETWEEN 1 AND 8388608 THEN RAISE EXCEPTION 'INVALID_EVIDENCE_FILE' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_count FROM public.snag_evidence WHERE snag_id=p_snag_id AND original_filename IS NOT NULL;
  IF v_count>=20 THEN RAISE EXCEPTION 'EVIDENCE_LIMIT_REACHED' USING ERRCODE='22023'; END IF;
  v_name:=regexp_replace(regexp_replace(coalesce(p_metadata->>'filename','evidence'),'[^A-Za-z0-9._-]+','-','g'),'(^[.-]+|[.-]+$)','','g');
  IF v_name='' THEN v_name:='evidence'; END IF; v_name:=left(v_name,120);
  v_path:='projects/'||p_project_id||'/snags/'||p_snag_id||'/evidence/'||p_evidence_id||'/'||v_name;
  v_fingerprint:=jsonb_build_object('projectId',p_project_id,'snagId',p_snag_id,'evidenceId',p_evidence_id,'expectedVersion',p_expected_version,'evidenceType',v_type,'filename',v_name,'mimeType',v_mime,'byteSize',v_size,'note',left(coalesce(p_metadata->>'note',''),2000),'captureTimestamp',p_metadata->>'captureTimestamp','checksum',p_metadata->>'checksum');
  INSERT INTO public.snag_evidence_upload_intents(id,project_id,snag_id,actor_id,client_request_id,expected_snag_version,evidence_type,storage_path,original_filename,mime_type,byte_size,note,capture_timestamp,checksum,request_fingerprint)
  VALUES(p_evidence_id,p_project_id,p_snag_id,v_uid,p_request_id,p_expected_version,v_type,v_path,v_name,v_mime,v_size,left(coalesce(p_metadata->>'note',''),2000),nullif(p_metadata->>'captureTimestamp','')::timestamptz,nullif(p_metadata->>'checksum',''),v_fingerprint)
  ON CONFLICT(actor_id,client_request_id) DO NOTHING;
  SELECT * INTO v_existing FROM public.snag_evidence_upload_intents WHERE actor_id=v_uid AND client_request_id=p_request_id;
  IF v_existing.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('bucket','snag-evidence','path',v_existing.storage_path,'evidenceId',v_existing.id,'requestId',v_existing.client_request_id,'expiresAt',v_existing.expires_at,'registered',v_existing.registered_at IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.register_snag_evidence(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_intent public.snag_evidence_upload_intents%ROWTYPE;v_snag public.snags%ROWTYPE;v_object storage.objects%ROWTYPE;v_evidence public.snag_evidence%ROWTYPE;v_event_id bigint;v_response jsonb;
BEGIN
  SELECT * INTO v_intent FROM public.snag_evidence_upload_intents WHERE actor_id=v_uid AND client_request_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCE_INTENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_intent.registered_at IS NOT NULL THEN SELECT * INTO v_evidence FROM public.snag_evidence WHERE id=v_intent.id; RETURN jsonb_build_object('evidence',to_jsonb(v_evidence),'idempotentReplay',true); END IF;
  SELECT * INTO v_snag FROM public.snags WHERE id=v_intent.snag_id AND project_id=v_intent.project_id FOR UPDATE;
  IF v_snag.version<>v_intent.expected_snag_version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_snag.status IN ('CLOSED','CANCELLED') THEN RAISE EXCEPTION 'EVIDENCE_TERMINAL_STATE' USING ERRCODE='22023'; END IF;
  IF (SELECT upper(role) FROM public.profiles WHERE id=v_uid)='CONTRACTOR' AND v_snag.assignee_id<>v_uid THEN RAISE EXCEPTION 'EVIDENCE_ASSIGNMENT_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_object FROM storage.objects WHERE bucket_id='snag-evidence' AND name=v_intent.storage_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCE_UPLOAD_MISSING' USING ERRCODE='P0002'; END IF;
  IF coalesce(v_object.metadata->>'mimetype','')<>v_intent.mime_type OR coalesce((v_object.metadata->>'size')::bigint,0)<>v_intent.byte_size THEN RAISE EXCEPTION 'EVIDENCE_FILE_MISMATCH' USING ERRCODE='22023'; END IF;
  UPDATE public.snags SET version=version+1,updated_at=now() WHERE id=v_snag.id RETURNING * INTO v_snag;
  INSERT INTO public.snag_events(snag_id,project_id,actor_id,event_type,previous_state,new_state,source_command_id)
  VALUES(v_snag.id,v_snag.project_id,v_uid,'SNAG_EVIDENCE_ADDED',jsonb_build_object('status',v_snag.status),jsonb_build_object('status',v_snag.status,'evidenceId',v_intent.id,'evidenceType',v_intent.evidence_type,'filename',v_intent.original_filename),p_request_id) RETURNING id INTO v_event_id;
  INSERT INTO public.snag_evidence(id,project_id,snag_id,evidence_type,storage_path,original_filename,mime_type,byte_size,note,created_by,transition_event_id,client_request_id,capture_timestamp,checksum,evidence_sequence)
  VALUES(v_intent.id,v_intent.project_id,v_intent.snag_id,v_intent.evidence_type,v_intent.storage_path,v_intent.original_filename,v_intent.mime_type,v_intent.byte_size,v_intent.note,v_uid,v_event_id,v_intent.client_request_id,v_intent.capture_timestamp,v_intent.checksum,(SELECT coalesce(max(evidence_sequence),0)+1 FROM public.snag_evidence WHERE snag_id=v_intent.snag_id)) RETURNING * INTO v_evidence;
  UPDATE public.snag_evidence_upload_intents SET registered_at=now() WHERE id=v_intent.id;
  RETURN jsonb_build_object('evidence',to_jsonb(v_evidence),'snag',to_jsonb(v_snag),'eventId',v_event_id,'idempotentReplay',false);
END $$;

CREATE OR REPLACE FUNCTION public.get_snag_evidence_policy(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_project(p_project_id) THEN RAISE EXCEPTION 'EVIDENCE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  RETURN '{"schemaVersion":1,"allowedMimeTypes":["image/jpeg","image/png","image/webp"],"maxFileBytes":8388608,"maxFileMegabytes":8,"maxEvidenceCount":20,"evidenceTypes":["CONDITION","CORRECTION","VERIFICATION","GENERAL"],"correctionRequiredForReview":false,"verificationRequiredForClosure":false,"noteCanSatisfyRequirement":false,"requiredEvidenceCount":0}'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.get_snag_closeout(p_project_id bigint,p_snag_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_result jsonb; BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_project(p_project_id) THEN RAISE EXCEPTION 'EVIDENCE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('schemaVersion',1,'project',jsonb_build_object('id',p.id,'name',coalesce(p.store_code,'[missing]')),'snag',to_jsonb(s)-'project_id','plan',CASE WHEN pv.id IS NULL THEN NULL ELSE jsonb_build_object('id',pv.id,'name',pv.name,'revision',pv.version,'pageNumber',s.plan_page_number,'x',s.plan_x,'y',s.plan_y) END,'timeline',coalesce((SELECT jsonb_agg(to_jsonb(ev) ORDER BY ev.occurred_at,ev.id) FROM public.snag_events ev WHERE ev.snag_id=s.id),'[]'::jsonb),'evidence',coalesce((SELECT jsonb_agg(to_jsonb(e)-'storage_path' ORDER BY e.evidence_type,e.created_at,e.id) FROM public.snag_evidence e WHERE e.snag_id=s.id),'[]'::jsonb),'missing',jsonb_build_array()) INTO v_result
  FROM public.snags s JOIN public.projects p ON p.id=s.project_id LEFT JOIN public.snag_plan_versions pv ON pv.id=s.plan_version_id WHERE s.id=p_snag_id AND s.project_id=p_project_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='P0002'; END IF; RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_registered_snag_evidence_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SNAG_EVIDENCE_IMMUTABLE' USING ERRCODE='55000'; END IF;
  IF OLD.transition_event_id IS NULL AND NEW.transition_event_id IS NOT NULL AND (to_jsonb(NEW)-'transition_event_id')=(to_jsonb(OLD)-'transition_event_id') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'SNAG_EVIDENCE_IMMUTABLE' USING ERRCODE='55000'; END $$;
CREATE TRIGGER snag_evidence_immutable BEFORE UPDATE OR DELETE ON public.snag_evidence FOR EACH ROW EXECUTE FUNCTION public.prevent_registered_snag_evidence_mutation();

REVOKE ALL ON FUNCTION public.authorize_snag_evidence_upload(bigint,uuid,uuid,uuid,integer,jsonb),public.register_snag_evidence(uuid),public.get_snag_evidence_policy(bigint),public.get_snag_closeout(bigint,uuid),public.prevent_registered_snag_evidence_mutation() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.authorize_snag_evidence_upload(bigint,uuid,uuid,uuid,integer,jsonb),public.register_snag_evidence(uuid),public.get_snag_evidence_policy(bigint),public.get_snag_closeout(bigint,uuid) TO authenticated;
