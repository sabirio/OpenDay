-- 122_consultant_boq_workflow.sql
-- Optional Consultant Measured layer with immutable revisions, PM decision and frozen issued snapshot.

BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_tender_cost_package_method()RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.project_tenders tender JOIN public.project_cost_packages package ON package.id=NEW.cost_package_id AND package.project_id=NEW.project_id
    WHERE tender.id=NEW.tender_id AND tender.project_id=NEW.project_id AND tender.procurement_method=package.procurement_method)THEN
    RAISE EXCEPTION'TENDER_COST_PACKAGE_METHOD_MISMATCH'USING ERRCODE='23514';END IF;RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS tender_cost_package_method_guard ON public.project_tender_cost_packages;
CREATE TRIGGER tender_cost_package_method_guard BEFORE INSERT ON public.project_tender_cost_packages FOR EACH ROW EXECUTE FUNCTION private.enforce_tender_cost_package_method();

CREATE TABLE IF NOT EXISTS public.project_consultant_boqs(
  id uuid PRIMARY KEY,tender_id uuid NOT NULL UNIQUE,project_id bigint NOT NULL,ontology_version_id uuid NOT NULL,project_boq_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN('DRAFT','SUBMITTED','RETURNED','FROZEN')),latest_revision integer NOT NULL DEFAULT 0 CHECK(latest_revision>=0),
  frozen_version_id bigint,issued_project_boq_version_id bigint,created_by uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tender_id,project_id,ontology_version_id)REFERENCES public.project_tenders(id,project_id,ontology_version_id)ON DELETE RESTRICT,
  UNIQUE(id,project_id,ontology_version_id)
);
CREATE TABLE IF NOT EXISTS public.project_consultant_boq_versions(
  id bigserial PRIMARY KEY,consultant_boq_id uuid NOT NULL,project_id bigint NOT NULL,ontology_version_id uuid NOT NULL,revision_number integer NOT NULL CHECK(revision_number>0),
  revision_note text,created_by uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(consultant_boq_id,revision_number),UNIQUE(id,consultant_boq_id,project_id,ontology_version_id),
  FOREIGN KEY(consultant_boq_id,project_id,ontology_version_id)REFERENCES public.project_consultant_boqs(id,project_id,ontology_version_id)ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.project_consultant_boq_items(
  consultant_boq_version_id bigint NOT NULL,consultant_boq_id uuid NOT NULL,project_id bigint NOT NULL,ontology_version_id uuid NOT NULL,line_id uuid NOT NULL,work_group_id uuid NOT NULL,
  item_kind text NOT NULL CHECK(item_kind IN('STANDARD','CUSTOM')),standard_definition_id uuid,description text NOT NULL CHECK(btrim(description)<>''),specification text,unit text NOT NULL CHECK(btrim(unit)<>''),
  consultant_quantity numeric(20,6)CHECK(consultant_quantity IS NULL OR consultant_quantity>=0),reference text,sort_order integer NOT NULL CHECK(sort_order>=0),PRIMARY KEY(consultant_boq_version_id,line_id),
  FOREIGN KEY(consultant_boq_version_id,consultant_boq_id,project_id,ontology_version_id)REFERENCES public.project_consultant_boq_versions(id,consultant_boq_id,project_id,ontology_version_id)ON DELETE RESTRICT,
  FOREIGN KEY(ontology_version_id,work_group_id)REFERENCES public.work_ontology_work_groups(ontology_version_id,id)ON DELETE RESTRICT,
  FOREIGN KEY(ontology_version_id,standard_definition_id)REFERENCES public.work_ontology_boq_item_definitions(ontology_version_id,id)ON DELETE RESTRICT,
  CHECK((item_kind='STANDARD'AND standard_definition_id IS NOT NULL)OR(item_kind='CUSTOM'AND standard_definition_id IS NULL))
);
CREATE TABLE IF NOT EXISTS public.project_consultant_boq_events(
  id bigserial PRIMARY KEY,consultant_boq_id uuid NOT NULL,project_id bigint NOT NULL,event_type text NOT NULL CHECK(event_type IN('REVISION_SAVED','SUBMITTED','RETURNED','FROZEN')),
  revision_number integer NOT NULL CHECK(revision_number>0),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),actor_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_consultant_boqs ADD CONSTRAINT consultant_boq_frozen_version_fk FOREIGN KEY(frozen_version_id,id,project_id,ontology_version_id)
  REFERENCES public.project_consultant_boq_versions(id,consultant_boq_id,project_id,ontology_version_id)ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION private.prevent_consultant_boq_snapshot_mutation()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION'CONSULTANT_BOQ_SNAPSHOT_IMMUTABLE'USING ERRCODE='55000';END;$$;
CREATE TRIGGER consultant_boq_versions_immutable BEFORE UPDATE OR DELETE ON public.project_consultant_boq_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_consultant_boq_snapshot_mutation();
CREATE TRIGGER consultant_boq_items_immutable BEFORE UPDATE OR DELETE ON public.project_consultant_boq_items FOR EACH ROW EXECUTE FUNCTION private.prevent_consultant_boq_snapshot_mutation();
CREATE TRIGGER consultant_boq_events_immutable BEFORE UPDATE OR DELETE ON public.project_consultant_boq_events FOR EACH ROW EXECUTE FUNCTION private.prevent_consultant_boq_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.can_access_consultant_boq(p_tender_id uuid,p_capability text DEFAULT'BOQ_PREPARE')RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.project_tenders tender JOIN public.project_tender_cost_packages link ON link.tender_id=tender.id
    WHERE tender.id=p_tender_id AND public.has_project_capability(tender.project_id,p_capability,link.cost_package_id));
$$;

ALTER TABLE public.project_consultant_boqs ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_consultant_boq_versions ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_consultant_boq_items ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_consultant_boq_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultant_boq_read ON public.project_consultant_boqs FOR SELECT TO authenticated USING(public.can_access_consultant_boq(tender_id,'BOQ_PREPARE')OR public.has_project_capability(project_id,'TENDER_MANAGE',NULL));
CREATE POLICY consultant_boq_version_read ON public.project_consultant_boq_versions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.project_consultant_boqs boq WHERE boq.id=consultant_boq_id AND(public.can_access_consultant_boq(boq.tender_id,'BOQ_PREPARE')OR public.has_project_capability(project_id,'TENDER_MANAGE',NULL))));
CREATE POLICY consultant_boq_item_read ON public.project_consultant_boq_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.project_consultant_boqs boq WHERE boq.id=consultant_boq_id AND(public.can_access_consultant_boq(boq.tender_id,'BOQ_PREPARE')OR public.has_project_capability(project_id,'TENDER_MANAGE',NULL))));
CREATE POLICY consultant_boq_event_read ON public.project_consultant_boq_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.project_consultant_boqs boq WHERE boq.id=consultant_boq_id AND(public.can_access_consultant_boq(boq.tender_id,'BOQ_PREPARE')OR public.has_project_capability(project_id,'TENDER_MANAGE',NULL))));
REVOKE ALL ON TABLE public.project_consultant_boqs,public.project_consultant_boq_versions,public.project_consultant_boq_items,public.project_consultant_boq_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_consultant_boqs,public.project_consultant_boq_versions,public.project_consultant_boq_items,public.project_consultant_boq_events TO authenticated;
REVOKE ALL ON SEQUENCE public.project_consultant_boq_versions_id_seq,public.project_consultant_boq_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_consultant_boq_revision(p_tender_id uuid,p_consultant_boq_id uuid,p_project_boq_id uuid,p_items jsonb,p_expected_revision integer,p_revision_note text,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();tender public.project_tenders%ROWTYPE;boq public.project_consultant_boqs%ROWTYPE;request public.write_command_requests%ROWTYPE;next_revision integer;version_id bigint;expected_standard integer;provided_standard integer;result jsonb;
BEGIN
  SELECT*INTO tender FROM public.project_tenders WHERE id=p_tender_id;
  IF u IS NULL OR tender.id IS NULL OR tender.boq_mode<>'CONSULTANT_MEASURED'OR public.can_access_consultant_boq(p_tender_id,'BOQ_PREPARE')IS NOT TRUE THEN RAISE EXCEPTION'CONSULTANT_BOQ_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id)OR p_consultant_boq_id IS NULL OR p_project_boq_id IS NULL OR p_client_request_id IS NULL OR jsonb_typeof(COALESCE(p_items,'null'))<>'array'OR jsonb_array_length(p_items)=0 OR COALESCE(p_expected_revision,-1)<0 THEN RAISE EXCEPTION'INVALID_CONSULTANT_BOQ_COMMAND'USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item WHERE item->>'lineId'!~*'^[0-9a-f-]{36}$'OR item->>'workGroupId'!~*'^[0-9a-f-]{36}$'OR item->>'itemKind'NOT IN('STANDARD','CUSTOM')OR btrim(COALESCE(item->>'description',''))=''OR btrim(COALESCE(item->>'unit',''))=''OR(item->>'consultantQuantity'IS NOT NULL AND(item->>'consultantQuantity'!~'^[0-9]+(?:\.[0-9]+)?$'OR(item->>'consultantQuantity')::numeric<0)))THEN RAISE EXCEPTION'INVALID_CONSULTANT_BOQ_ITEM'USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item WHERE NOT EXISTS(SELECT 1 FROM public.project_tender_cost_packages link JOIN public.project_cost_package_work_groups scope ON scope.cost_package_id=link.cost_package_id WHERE link.tender_id=p_tender_id AND scope.work_group_id=(item->>'workGroupId')::uuid))THEN RAISE EXCEPTION'CONSULTANT_BOQ_WORK_GROUP_OUT_OF_SCOPE'USING ERRCODE='22023';END IF;
  SELECT count(*)INTO expected_standard FROM public.work_ontology_boq_item_definitions definition JOIN public.project_cost_package_work_groups scope ON scope.work_group_id=definition.work_group_id AND scope.ontology_version_id=definition.ontology_version_id JOIN public.project_tender_cost_packages link ON link.cost_package_id=scope.cost_package_id WHERE link.tender_id=p_tender_id;
  SELECT count(DISTINCT(item->>'standardDefinitionId'))INTO provided_standard FROM jsonb_array_elements(p_items)item WHERE item->>'itemKind'='STANDARD';
  IF expected_standard<>provided_standard OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item WHERE(item->>'itemKind'='STANDARD')<>(item->>'standardDefinitionId'IS NOT NULL))THEN RAISE EXCEPTION'CONSULTANT_BOQ_STANDARD_SCOPE_INCOMPLETE'USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(u,'consultant_boq.revision.save',p_client_request_id,tender.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO request FROM public.write_command_requests WHERE actor_id=u AND operation='consultant_boq.revision.save'AND client_request_id=p_client_request_id;
  IF request.project_id<>tender.project_id THEN RAISE EXCEPTION'Idempotency key belongs to another project'USING ERRCODE='23505';END IF;IF request.response IS NOT NULL THEN RETURN request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT*INTO boq FROM public.project_consultant_boqs WHERE tender_id=p_tender_id FOR UPDATE;
  IF boq.id IS NULL THEN IF p_expected_revision<>0 THEN RAISE EXCEPTION'CONSULTANT_BOQ_REVISION_CONFLICT'USING ERRCODE='40001';END IF;INSERT INTO public.project_consultant_boqs(id,tender_id,project_id,ontology_version_id,project_boq_id,status,created_by)VALUES(p_consultant_boq_id,p_tender_id,tender.project_id,tender.ontology_version_id,p_project_boq_id,'DRAFT',u)RETURNING*INTO boq;
  ELSIF boq.id<>p_consultant_boq_id OR boq.latest_revision<>p_expected_revision OR boq.status IN('SUBMITTED','FROZEN')THEN RAISE EXCEPTION'CONSULTANT_BOQ_REVISION_CONFLICT'USING ERRCODE='40001';END IF;
  next_revision:=boq.latest_revision+1;INSERT INTO public.project_consultant_boq_versions(consultant_boq_id,project_id,ontology_version_id,revision_number,revision_note,created_by)VALUES(boq.id,boq.project_id,boq.ontology_version_id,next_revision,NULLIF(btrim(COALESCE(p_revision_note,'')),''),u)RETURNING id INTO version_id;
  INSERT INTO public.project_consultant_boq_items(consultant_boq_version_id,consultant_boq_id,project_id,ontology_version_id,line_id,work_group_id,item_kind,standard_definition_id,description,specification,unit,consultant_quantity,reference,sort_order)
    SELECT version_id,boq.id,boq.project_id,boq.ontology_version_id,(item->>'lineId')::uuid,(item->>'workGroupId')::uuid,item->>'itemKind',NULLIF(item->>'standardDefinitionId','')::uuid,btrim(item->>'description'),NULLIF(btrim(COALESCE(item->>'specification','')),''),btrim(item->>'unit'),NULLIF(item->>'consultantQuantity','')::numeric,NULLIF(btrim(COALESCE(item->>'reference','')),''),ordinal-1 FROM jsonb_array_elements(p_items)WITH ORDINALITY source(item,ordinal);
  UPDATE public.project_consultant_boqs SET latest_revision=next_revision,status='DRAFT'WHERE id=boq.id;result:=jsonb_build_object('consultantBoqId',boq.id,'versionId',version_id,'revisionNumber',next_revision,'status','DRAFT');
  INSERT INTO public.project_consultant_boq_events(consultant_boq_id,project_id,event_type,revision_number,snapshot,actor_id)VALUES(boq.id,boq.project_id,'REVISION_SAVED',next_revision,result,u);UPDATE public.write_command_requests SET response=result,completed_at=now()WHERE id=request.id;RETURN result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.submit_consultant_boq(p_consultant_boq_id uuid,p_expected_revision integer,p_client_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();boq public.project_consultant_boqs%ROWTYPE;request public.write_command_requests%ROWTYPE;result jsonb;
BEGIN SELECT*INTO boq FROM public.project_consultant_boqs WHERE id=p_consultant_boq_id FOR UPDATE;IF u IS NULL OR boq.id IS NULL OR public.can_access_consultant_boq(boq.tender_id,'BOQ_PREPARE')IS NOT TRUE THEN RAISE EXCEPTION'CONSULTANT_BOQ_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF boq.status NOT IN('DRAFT','RETURNED')OR boq.latest_revision<>p_expected_revision OR p_client_request_id IS NULL OR EXISTS(SELECT 1 FROM public.project_consultant_boq_items item JOIN public.project_consultant_boq_versions version ON version.id=item.consultant_boq_version_id WHERE version.consultant_boq_id=boq.id AND version.revision_number=boq.latest_revision AND item.consultant_quantity IS NULL)THEN RAISE EXCEPTION'CONSULTANT_BOQ_NOT_READY'USING ERRCODE='55000';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(u,'consultant_boq.submit',p_client_request_id,boq.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;SELECT*INTO request FROM public.write_command_requests WHERE actor_id=u AND operation='consultant_boq.submit'AND client_request_id=p_client_request_id;IF request.response IS NOT NULL THEN RETURN request.response||jsonb_build_object('idempotentReplay',true);END IF;
  UPDATE public.project_consultant_boqs SET status='SUBMITTED'WHERE id=boq.id;result:=jsonb_build_object('consultantBoqId',boq.id,'revisionNumber',boq.latest_revision,'status','SUBMITTED');INSERT INTO public.project_consultant_boq_events(consultant_boq_id,project_id,event_type,revision_number,snapshot,actor_id)VALUES(boq.id,boq.project_id,'SUBMITTED',boq.latest_revision,result,u);UPDATE public.write_command_requests SET response=result,completed_at=now()WHERE id=request.id;RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.review_consultant_boq(p_consultant_boq_id uuid,p_decision text,p_note text,p_expected_revision integer,p_client_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();boq public.project_consultant_boqs%ROWTYPE;version_id bigint;request public.write_command_requests%ROWTYPE;items jsonb;project_revision integer;save_result jsonb;result jsonb;
BEGIN SELECT*INTO boq FROM public.project_consultant_boqs WHERE id=p_consultant_boq_id FOR UPDATE;IF u IS NULL OR boq.id IS NULL OR public.has_project_capability(boq.project_id,'TENDER_MANAGE',NULL)IS NOT TRUE THEN RAISE EXCEPTION'CONSULTANT_BOQ_REVIEW_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF boq.status<>'SUBMITTED'OR boq.latest_revision<>p_expected_revision OR p_decision NOT IN('RETURN','ACCEPT')OR(p_decision='RETURN'AND btrim(COALESCE(p_note,''))='')OR p_client_request_id IS NULL THEN RAISE EXCEPTION'INVALID_CONSULTANT_BOQ_REVIEW'USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(u,'consultant_boq.review',p_client_request_id,boq.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;SELECT*INTO request FROM public.write_command_requests WHERE actor_id=u AND operation='consultant_boq.review'AND client_request_id=p_client_request_id;IF request.response IS NOT NULL THEN RETURN request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT id INTO version_id FROM public.project_consultant_boq_versions WHERE consultant_boq_id=boq.id AND revision_number=boq.latest_revision;
  IF p_decision='RETURN'THEN UPDATE public.project_consultant_boqs SET status='RETURNED'WHERE id=boq.id;result:=jsonb_build_object('consultantBoqId',boq.id,'revisionNumber',boq.latest_revision,'status','RETURNED','note',btrim(p_note));
  ELSE SELECT COALESCE(max(revision_number),0)INTO project_revision FROM public.project_boq_versions WHERE boq_id=boq.project_boq_id;SELECT jsonb_agg(jsonb_build_object('lineId',line_id,'workGroupId',work_group_id,'itemKind',item_kind,'standardDefinitionId',standard_definition_id,'description',description,'unit',unit,'quantity',NULL,'consultantQuantity',consultant_quantity,'labourRate',NULL,'materialRate',NULL,'contractorNote',NULL,'reference',reference,'specification',specification,'sortOrder',sort_order)ORDER BY sort_order,line_id)INTO items FROM public.project_consultant_boq_items WHERE consultant_boq_version_id=version_id;
    save_result:=public.save_project_boq_revision(boq.project_id,boq.project_boq_id,'Frozen Consultant BOQ',(SELECT currency_code FROM public.projects WHERE id=boq.project_id),items,project_revision,'Frozen Consultant BOQ R'||boq.latest_revision,gen_random_uuid());UPDATE public.project_consultant_boqs SET status='FROZEN',frozen_version_id=version_id,issued_project_boq_version_id=(save_result->>'versionId')::bigint WHERE id=boq.id;result:=jsonb_build_object('consultantBoqId',boq.id,'revisionNumber',boq.latest_revision,'status','FROZEN','issuedProjectBoqVersionId',(save_result->>'versionId')::bigint);END IF;
  INSERT INTO public.project_consultant_boq_events(consultant_boq_id,project_id,event_type,revision_number,snapshot,actor_id)VALUES(boq.id,boq.project_id,CASE WHEN p_decision='RETURN'THEN'RETURNED'ELSE'FROZEN'END,boq.latest_revision,result,u);UPDATE public.write_command_requests SET response=result,completed_at=now()WHERE id=request.id;RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION private.enforce_consultant_boq_before_tender_issue()RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$DECLARE tender public.project_tenders%ROWTYPE;boq public.project_consultant_boqs%ROWTYPE;BEGIN SELECT*INTO tender FROM public.project_tenders WHERE id=NEW.tender_id;IF tender.boq_mode='CONSULTANT_MEASURED'THEN SELECT*INTO boq FROM public.project_consultant_boqs WHERE tender_id=NEW.tender_id;IF boq.status<>'FROZEN'OR boq.issued_project_boq_version_id IS DISTINCT FROM NEW.issued_boq_version_id THEN RAISE EXCEPTION'TENDER_REQUIRES_FROZEN_CONSULTANT_BOQ'USING ERRCODE='55000';END IF;END IF;RETURN NEW;END;$$;
CREATE TRIGGER tender_setup_consultant_boq_guard BEFORE INSERT ON public.project_tender_setup_versions FOR EACH ROW EXECUTE FUNCTION private.enforce_consultant_boq_before_tender_issue();

REVOKE ALL ON FUNCTION private.enforce_tender_cost_package_method(),private.prevent_consultant_boq_snapshot_mutation(),private.enforce_consultant_boq_before_tender_issue(),public.can_access_consultant_boq(uuid,text),public.save_consultant_boq_revision(uuid,uuid,uuid,jsonb,integer,text,uuid),public.submit_consultant_boq(uuid,integer,uuid),public.review_consultant_boq(uuid,text,text,integer,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_consultant_boq(uuid,text),public.save_consultant_boq_revision(uuid,uuid,uuid,jsonb,integer,text,uuid),public.submit_consultant_boq(uuid,integer,uuid),public.review_consultant_boq(uuid,text,text,integer,uuid)TO authenticated;
COMMIT;
