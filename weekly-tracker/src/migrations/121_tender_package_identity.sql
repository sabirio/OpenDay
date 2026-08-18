-- 121_tender_package_identity.sql
-- Tender Package exists before Tender Setup/BOQ issue and owns Cost Package(s), method and BOQ mode.

BEGIN;

CREATE OR REPLACE FUNCTION public.has_project_capability(p_project_id bigint,p_capability_code text,p_cost_package_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_company text;v_project_company text;
BEGIN
  IF v_uid IS NULL THEN RETURN false;END IF;
  SELECT lower(role),company_id INTO v_role,v_company FROM public.profiles WHERE id=v_uid;
  SELECT company_id INTO v_project_company FROM public.projects WHERE id=p_project_id;
  IF v_role='admin' AND(v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company)THEN RETURN true;END IF;
  RETURN EXISTS(SELECT 1 FROM public.project_team_memberships membership
    JOIN public.project_team_membership_capabilities capability ON capability.membership_id=membership.id AND capability.project_id=membership.project_id
    WHERE membership.project_id=p_project_id AND membership.user_id=v_uid AND membership.starts_on<=CURRENT_DATE
      AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)AND capability.capability_code=p_capability_code
      AND(p_cost_package_id IS NULL OR membership.project_role='PM' OR EXISTS(SELECT 1 FROM public.project_cost_package_responsibilities scope
        WHERE scope.membership_id=membership.id AND scope.project_id=p_project_id AND scope.cost_package_id=p_cost_package_id)));
END;$$;

CREATE TABLE IF NOT EXISTS public.project_tender_package_events(
  id bigserial PRIMARY KEY,tender_id uuid NOT NULL,project_id bigint NOT NULL,commercial_revision integer NOT NULL CHECK(commercial_revision>=0),
  event_type text NOT NULL CHECK(event_type IN('CREATED','IDENTITY_UPDATED')),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tender_id,commercial_revision)
);
CREATE OR REPLACE FUNCTION private.prevent_tender_package_event_mutation()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION'TENDER_PACKAGE_EVENT_IMMUTABLE'USING ERRCODE='55000';END;$$;
DROP TRIGGER IF EXISTS project_tender_package_events_immutable ON public.project_tender_package_events;
CREATE TRIGGER project_tender_package_events_immutable BEFORE UPDATE OR DELETE ON public.project_tender_package_events FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_package_event_mutation();
ALTER TABLE public.project_tender_package_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_tender_package_events_read ON public.project_tender_package_events FOR SELECT TO authenticated USING(public.has_project_capability(project_id,'TENDER_MANAGE',NULL)OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',NULL));
REVOKE ALL ON TABLE public.project_tender_package_events FROM PUBLIC,anon,authenticated,service_role;GRANT SELECT ON TABLE public.project_tender_package_events TO authenticated;
REVOKE ALL ON SEQUENCE public.project_tender_package_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_project_tender_package(
  p_project_id bigint,p_tender_id uuid,p_tender_number text,p_cost_package_ids uuid[],p_procurement_method text,p_boq_mode text,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();project_row public.projects%ROWTYPE;request public.write_command_requests%ROWTYPE;valid_count integer;result jsonb;
BEGIN
  SELECT*INTO project_row FROM public.projects WHERE id=p_project_id;
  IF u IS NULL OR project_row.id IS NULL OR public.has_project_capability(p_project_id,'TENDER_MANAGE',NULL)IS NOT TRUE THEN RAISE EXCEPTION'TENDER_PACKAGE_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF p_tender_id IS NULL OR p_client_request_id IS NULL OR btrim(COALESCE(p_tender_number,''))=''OR COALESCE(cardinality(p_cost_package_ids),0)=0
    OR p_procurement_method NOT IN('COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','DIRECT_AWARD','NOMINATED_SUPPLIER','EXISTING_CONTRACT','LANDLORD_PROVIDED','INTERNAL_NON_PROCURED')
    OR p_boq_mode NOT IN('CONTRACTOR_MEASURED','CONSULTANT_MEASURED')THEN RAISE EXCEPTION'INVALID_TENDER_PACKAGE'USING ERRCODE='22023';END IF;
  SELECT count(*)INTO valid_count FROM public.project_cost_packages package WHERE package.project_id=p_project_id AND package.ontology_version_id=project_row.work_ontology_version_id
    AND package.id=ANY(p_cost_package_ids)AND package.status<>'ARCHIVED'AND public.has_project_capability(p_project_id,'TENDER_MANAGE',package.id);
  IF valid_count<>cardinality(p_cost_package_ids)OR valid_count<>(SELECT count(DISTINCT value)FROM unnest(p_cost_package_ids)value)THEN RAISE EXCEPTION'INVALID_TENDER_PACKAGE_SCOPE'USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(u,'commercial.tender_package.create',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO request FROM public.write_command_requests WHERE actor_id=u AND operation='commercial.tender_package.create'AND client_request_id=p_client_request_id;
  IF request.project_id<>p_project_id THEN RAISE EXCEPTION'Idempotency key belongs to another project'USING ERRCODE='23505';END IF;
  IF request.response IS NOT NULL THEN RETURN request.response||jsonb_build_object('idempotentReplay',true);END IF;
  INSERT INTO public.project_tenders(id,project_id,ontology_version_id,tender_number,status,created_by,procurement_method,boq_mode,commercial_revision)
    VALUES(p_tender_id,p_project_id,project_row.work_ontology_version_id,upper(btrim(p_tender_number)),'DRAFT',u,p_procurement_method,p_boq_mode,1);
  INSERT INTO public.project_tender_cost_packages(tender_id,project_id,ontology_version_id,cost_package_id)
    SELECT p_tender_id,p_project_id,project_row.work_ontology_version_id,value FROM unnest(p_cost_package_ids)value;
  result:=jsonb_build_object('tenderId',p_tender_id,'tenderNumber',upper(btrim(p_tender_number)),'projectId',p_project_id,'costPackageIds',to_jsonb(p_cost_package_ids),'procurementMethod',p_procurement_method,'boqMode',p_boq_mode,'commercialRevision',1);
  INSERT INTO public.project_tender_package_events(tender_id,project_id,commercial_revision,event_type,snapshot,actor_id)VALUES(p_tender_id,p_project_id,1,'CREATED',result,u);
  UPDATE public.write_command_requests SET response=result,completed_at=now()WHERE id=request.id;RETURN result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.save_tender_package_commercial_identity(
  p_tender_id uuid,p_cost_package_ids uuid[],p_procurement_method text,p_boq_mode text,p_expected_revision integer,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();tender public.project_tenders%ROWTYPE;request public.write_command_requests%ROWTYPE;valid_count integer;next_revision integer;result jsonb;
BEGIN
  SELECT*INTO tender FROM public.project_tenders WHERE id=p_tender_id FOR UPDATE;
  IF u IS NULL OR tender.id IS NULL OR public.has_project_capability(tender.project_id,'TENDER_MANAGE',NULL)IS NOT TRUE THEN RAISE EXCEPTION'TENDER_PACKAGE_IDENTITY_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF tender.status='AWARDED'OR EXISTS(SELECT 1 FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id)THEN RAISE EXCEPTION'TENDER_PACKAGE_IDENTITY_LOCKED'USING ERRCODE='55000';END IF;
  IF COALESCE(cardinality(p_cost_package_ids),0)=0 OR p_procurement_method NOT IN('COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','DIRECT_AWARD','NOMINATED_SUPPLIER','EXISTING_CONTRACT','LANDLORD_PROVIDED','INTERNAL_NON_PROCURED')
    OR p_boq_mode NOT IN('CONTRACTOR_MEASURED','CONSULTANT_MEASURED')OR COALESCE(p_expected_revision,-1)<>tender.commercial_revision OR p_client_request_id IS NULL THEN RAISE EXCEPTION'INVALID_TENDER_PACKAGE_IDENTITY'USING ERRCODE='22023';END IF;
  SELECT count(*)INTO valid_count FROM public.project_cost_packages package WHERE package.project_id=tender.project_id AND package.ontology_version_id=tender.ontology_version_id
    AND package.id=ANY(p_cost_package_ids)AND package.status<>'ARCHIVED'AND public.has_project_capability(tender.project_id,'TENDER_MANAGE',package.id);
  IF valid_count<>cardinality(p_cost_package_ids)OR valid_count<>(SELECT count(DISTINCT value)FROM unnest(p_cost_package_ids)value)THEN RAISE EXCEPTION'INVALID_TENDER_COST_PACKAGE_SCOPE'USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(u,'commercial.tender_package.identity.save',p_client_request_id,tender.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO request FROM public.write_command_requests WHERE actor_id=u AND operation='commercial.tender_package.identity.save'AND client_request_id=p_client_request_id;
  IF request.project_id<>tender.project_id THEN RAISE EXCEPTION'Idempotency key belongs to another project'USING ERRCODE='23505';END IF;
  IF request.response IS NOT NULL THEN RETURN request.response||jsonb_build_object('idempotentReplay',true);END IF;
  DELETE FROM public.project_tender_cost_packages WHERE tender_id=p_tender_id;
  INSERT INTO public.project_tender_cost_packages(tender_id,project_id,ontology_version_id,cost_package_id)SELECT p_tender_id,tender.project_id,tender.ontology_version_id,value FROM unnest(p_cost_package_ids)value;
  next_revision:=tender.commercial_revision+1;UPDATE public.project_tenders SET procurement_method=p_procurement_method,boq_mode=p_boq_mode,commercial_revision=next_revision WHERE id=p_tender_id;
  result:=jsonb_build_object('tenderId',p_tender_id,'tenderNumber',tender.tender_number,'projectId',tender.project_id,'costPackageIds',to_jsonb(p_cost_package_ids),'procurementMethod',p_procurement_method,'boqMode',p_boq_mode,'commercialRevision',next_revision);
  INSERT INTO public.project_tender_package_events(tender_id,project_id,commercial_revision,event_type,snapshot,actor_id)VALUES(p_tender_id,tender.project_id,next_revision,'IDENTITY_UPDATED',result,u);
  UPDATE public.write_command_requests SET response=result,completed_at=now()WHERE id=request.id;RETURN result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.get_my_tender_commercial_identity(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE u uuid:=auth.uid();tender public.project_tenders%ROWTYPE;
BEGIN
  IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.project_tender_bidder_access access WHERE access.tender_id=p_tender_id AND access.bidder_user_id=u AND access.status='ACTIVE')THEN RAISE EXCEPTION'TENDER_ACCESS_DENIED'USING ERRCODE='42501';END IF;
  SELECT*INTO tender FROM public.project_tenders WHERE id=p_tender_id;
  RETURN jsonb_build_object('tenderId',tender.id,'procurementMethod',tender.procurement_method,'boqMode',tender.boq_mode,'commercialRevision',tender.commercial_revision);
END;$$;

REVOKE ALL ON FUNCTION private.prevent_tender_package_event_mutation(),public.create_project_tender_package(bigint,uuid,text,uuid[],text,text,uuid),
  public.save_tender_package_commercial_identity(uuid,uuid[],text,text,integer,uuid),public.get_my_tender_commercial_identity(uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_project_tender_package(bigint,uuid,text,uuid[],text,text,uuid),public.save_tender_package_commercial_identity(uuid,uuid[],text,text,integer,uuid),public.get_my_tender_commercial_identity(uuid)TO authenticated;

REVOKE ALL ON FUNCTION public.has_project_capability(bigint,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.has_project_capability(bigint,text,uuid) TO authenticated;

COMMIT;
