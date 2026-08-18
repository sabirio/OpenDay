-- 118_cost_package_procurement_tender_package_foundation.sql
-- Commercial spine: Project -> Cost Package -> Procurement Method -> Tender Package.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_cost_packages (
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  procurement_method text NOT NULL CHECK (procurement_method IN (
    'COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','DIRECT_AWARD','NOMINATED_SUPPLIER',
    'EXISTING_CONTRACT','LANDLORD_PROVIDED','INTERNAL_NON_PROCURED'
  )),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','COMMITTED','CLOSED','ARCHIVED')),
  note text CHECK (note IS NULL OR char_length(note) <= 4000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, code),
  UNIQUE (id, project_id, ontology_version_id)
);

CREATE TABLE IF NOT EXISTS public.project_cost_package_work_groups (
  cost_package_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  PRIMARY KEY (cost_package_id, work_group_id),
  UNIQUE (project_id, work_group_id),
  FOREIGN KEY (cost_package_id, project_id, ontology_version_id)
    REFERENCES public.project_cost_packages(id, project_id, ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_cost_package_events (
  id bigserial PRIMARY KEY,
  cost_package_id uuid NOT NULL,
  project_id bigint NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  event_type text NOT NULL CHECK (event_type IN ('CREATED','UPDATED','STATUS_CHANGED','SCOPE_CHANGED')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cost_package_id, revision)
);

ALTER TABLE public.project_tenders
  ADD COLUMN IF NOT EXISTS procurement_method text NOT NULL DEFAULT 'COMPETITIVE_TENDER'
    CHECK (procurement_method IN (
      'COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','DIRECT_AWARD','NOMINATED_SUPPLIER',
      'EXISTING_CONTRACT','LANDLORD_PROVIDED','INTERNAL_NON_PROCURED'
    )),
  ADD COLUMN IF NOT EXISTS boq_mode text NOT NULL DEFAULT 'CONTRACTOR_MEASURED'
    CHECK (boq_mode IN ('CONTRACTOR_MEASURED','CONSULTANT_MEASURED')),
  ADD COLUMN IF NOT EXISTS commercial_revision integer NOT NULL DEFAULT 0 CHECK (commercial_revision >= 0);

CREATE TABLE IF NOT EXISTS public.project_tender_cost_packages (
  tender_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  cost_package_id uuid NOT NULL,
  PRIMARY KEY (tender_id, cost_package_id),
  FOREIGN KEY (tender_id, project_id, ontology_version_id)
    REFERENCES public.project_tenders(id, project_id, ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (cost_package_id, project_id, ontology_version_id)
    REFERENCES public.project_cost_packages(id, project_id, ontology_version_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS project_cost_packages_project_idx
  ON public.project_cost_packages(project_id, status, code);
CREATE INDEX IF NOT EXISTS project_cost_package_events_project_idx
  ON public.project_cost_package_events(project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS project_tender_cost_packages_project_idx
  ON public.project_tender_cost_packages(project_id, tender_id);

CREATE OR REPLACE FUNCTION private.prevent_commercial_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'COMMERCIAL_EVENT_IMMUTABLE' USING ERRCODE = '55000'; END;
$$;
DROP TRIGGER IF EXISTS project_cost_package_events_immutable ON public.project_cost_package_events;
CREATE TRIGGER project_cost_package_events_immutable
  BEFORE UPDATE OR DELETE ON public.project_cost_package_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_commercial_event_mutation();
REVOKE ALL ON FUNCTION private.prevent_commercial_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.project_cost_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_cost_package_work_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_cost_package_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_cost_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_cost_packages_internal_select ON public.project_cost_packages
  FOR SELECT TO authenticated USING (
    lower((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))) IN ('pm','admin')
    AND (SELECT public.can_access_project(project_id))
  );
CREATE POLICY project_cost_package_work_groups_internal_select ON public.project_cost_package_work_groups
  FOR SELECT TO authenticated USING (
    lower((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))) IN ('pm','admin')
    AND (SELECT public.can_access_project(project_id))
  );
CREATE POLICY project_cost_package_events_internal_select ON public.project_cost_package_events
  FOR SELECT TO authenticated USING (
    lower((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))) IN ('pm','admin')
    AND (SELECT public.can_access_project(project_id))
  );
CREATE POLICY project_tender_cost_packages_internal_select ON public.project_tender_cost_packages
  FOR SELECT TO authenticated USING (
    lower((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))) IN ('pm','admin')
    AND (SELECT public.can_access_project(project_id))
  );

REVOKE ALL ON TABLE public.project_cost_packages, public.project_cost_package_work_groups,
  public.project_cost_package_events, public.project_tender_cost_packages
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_cost_packages, public.project_cost_package_work_groups,
  public.project_cost_package_events, public.project_tender_cost_packages TO authenticated;
REVOKE ALL ON SEQUENCE public.project_cost_package_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_project_cost_package(
  p_project_id bigint, p_cost_package_id uuid, p_code text, p_name text,
  p_procurement_method text, p_currency_code text, p_status text,
  p_work_group_ids uuid[], p_note text, p_expected_revision integer,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_project public.projects%ROWTYPE;
  v_package public.project_cost_packages%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_next_revision integer;
  v_event_type text;
  v_scope_count integer;
  v_snapshot jsonb;
  v_result jsonb;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_uid IS NULL OR v_role NOT IN ('pm','admin') OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'COST_PACKAGE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL OR v_project.work_ontology_version_id IS NULL THEN
    RAISE EXCEPTION 'COST_PACKAGE_REQUIRES_PROJECT_ONTOLOGY' USING ERRCODE = '55000';
  END IF;
  IF p_cost_package_id IS NULL OR p_client_request_id IS NULL
    OR btrim(COALESCE(p_code,'')) = '' OR btrim(COALESCE(p_name,'')) = ''
    OR p_procurement_method NOT IN ('COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','DIRECT_AWARD','NOMINATED_SUPPLIER','EXISTING_CONTRACT','LANDLORD_PROVIDED','INTERNAL_NON_PROCURED')
    OR COALESCE(p_currency_code,'') !~ '^[A-Z]{3}$'
    OR p_status NOT IN ('DRAFT','ACTIVE','COMMITTED','CLOSED','ARCHIVED')
    OR COALESCE(cardinality(p_work_group_ids),0) = 0
    OR COALESCE(p_expected_revision,-1) < 0
    OR char_length(COALESCE(p_note,'')) > 4000 THEN
    RAISE EXCEPTION 'INVALID_COST_PACKAGE_COMMAND' USING ERRCODE = '22023';
  END IF;
  IF p_currency_code <> COALESCE(v_project.currency_code, p_currency_code) THEN
    RAISE EXCEPTION 'COST_PACKAGE_CURRENCY_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT value) FROM unnest(p_work_group_ids) value) <> cardinality(p_work_group_ids) THEN
    RAISE EXCEPTION 'DUPLICATE_COST_PACKAGE_WORK_GROUP' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_scope_count FROM public.work_ontology_work_groups group_row
    WHERE group_row.ontology_version_id = v_project.work_ontology_version_id
      AND group_row.id = ANY(p_work_group_ids);
  IF v_scope_count <> cardinality(p_work_group_ids) THEN
    RAISE EXCEPTION 'INVALID_COST_PACKAGE_WORK_GROUP_SCOPE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
    VALUES(v_uid, 'commercial.cost_package.save', p_client_request_id, p_project_id)
    ON CONFLICT(actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
    WHERE actor_id = v_uid AND operation = 'commercial.cost_package.save'
      AND client_request_id = p_client_request_id;
  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  PERFORM pg_advisory_xact_lock(p_project_id);
  SELECT * INTO v_package FROM public.project_cost_packages WHERE id = p_cost_package_id FOR UPDATE;
  IF v_package.id IS NULL THEN
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION 'COST_PACKAGE_REVISION_CONFLICT' USING ERRCODE = '40001'; END IF;
    v_next_revision := 1; v_event_type := 'CREATED';
    INSERT INTO public.project_cost_packages(
      id,project_id,ontology_version_id,code,name,procurement_method,currency_code,status,note,
      revision,created_by,updated_by
    ) VALUES(
      p_cost_package_id,p_project_id,v_project.work_ontology_version_id,upper(btrim(p_code)),btrim(p_name),
      p_procurement_method,p_currency_code,p_status,NULLIF(btrim(COALESCE(p_note,'')),''),
      v_next_revision,v_uid,v_uid
    ) RETURNING * INTO v_package;
  ELSE
    IF v_package.project_id <> p_project_id OR v_package.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'COST_PACKAGE_REVISION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF v_package.status IN ('COMMITTED','CLOSED','ARCHIVED') THEN
      RAISE EXCEPTION 'COST_PACKAGE_LOCKED' USING ERRCODE = '55000';
    END IF;
    v_next_revision := v_package.revision + 1;
    v_event_type := CASE WHEN v_package.status IS DISTINCT FROM p_status THEN 'STATUS_CHANGED' ELSE 'UPDATED' END;
    DELETE FROM public.project_cost_package_work_groups WHERE cost_package_id = p_cost_package_id;
    UPDATE public.project_cost_packages SET
      code=upper(btrim(p_code)),name=btrim(p_name),procurement_method=p_procurement_method,
      currency_code=p_currency_code,status=p_status,note=NULLIF(btrim(COALESCE(p_note,'')),''),
      revision=v_next_revision,updated_by=v_uid,updated_at=now()
    WHERE id=p_cost_package_id RETURNING * INTO v_package;
  END IF;

  INSERT INTO public.project_cost_package_work_groups(cost_package_id,project_id,ontology_version_id,work_group_id)
    SELECT p_cost_package_id,p_project_id,v_project.work_ontology_version_id,value FROM unnest(p_work_group_ids) value;
  SELECT jsonb_build_object(
    'costPackageId',v_package.id,'projectId',v_package.project_id,'code',v_package.code,
    'name',v_package.name,'procurementMethod',v_package.procurement_method,
    'currencyCode',v_package.currency_code,'status',v_package.status,'note',v_package.note,
    'revision',v_package.revision,'workGroupIds',to_jsonb(p_work_group_ids)
  ) INTO v_snapshot;
  INSERT INTO public.project_cost_package_events(cost_package_id,project_id,revision,event_type,snapshot,actor_id)
    VALUES(v_package.id,p_project_id,v_package.revision,v_event_type,v_snapshot,v_uid);
  v_result := v_snapshot;
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_tender_package_commercial_identity(
  p_tender_id uuid, p_cost_package_ids uuid[], p_procurement_method text,
  p_boq_mode text, p_expected_revision integer, p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_role text; v_tender public.project_tenders%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE; v_count integer; v_next integer; v_result jsonb;
BEGIN
  SELECT * INTO v_tender FROM public.project_tenders WHERE id=p_tender_id FOR UPDATE;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_uid IS NULL OR v_tender.id IS NULL OR v_role NOT IN ('pm','admin')
    OR public.can_write_project(v_tender.project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'TENDER_PACKAGE_IDENTITY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF v_tender.status='AWARDED' OR EXISTS(SELECT 1 FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id) THEN
    RAISE EXCEPTION 'TENDER_PACKAGE_IDENTITY_LOCKED' USING ERRCODE='55000';
  END IF;
  IF COALESCE(cardinality(p_cost_package_ids),0)=0 OR p_procurement_method NOT IN (
    'COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','DIRECT_AWARD','NOMINATED_SUPPLIER','EXISTING_CONTRACT','LANDLORD_PROVIDED','INTERNAL_NON_PROCURED'
  ) OR p_boq_mode NOT IN ('CONTRACTOR_MEASURED','CONSULTANT_MEASURED')
    OR COALESCE(p_expected_revision,-1)<>v_tender.commercial_revision OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_TENDER_PACKAGE_IDENTITY' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_count FROM public.project_cost_packages package_row
    WHERE package_row.project_id=v_tender.project_id AND package_row.ontology_version_id=v_tender.ontology_version_id
      AND package_row.id=ANY(p_cost_package_ids) AND package_row.status<>'ARCHIVED';
  IF v_count<>cardinality(p_cost_package_ids) OR (SELECT count(DISTINCT value) FROM unnest(p_cost_package_ids)value)<>cardinality(p_cost_package_ids) THEN
    RAISE EXCEPTION 'INVALID_TENDER_COST_PACKAGE_SCOPE' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
    VALUES(v_uid,'commercial.tender_package.identity.save',p_client_request_id,v_tender.project_id)
    ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid
    AND operation='commercial.tender_package.identity.save' AND client_request_id=p_client_request_id;
  IF v_request.project_id <> v_tender.project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';
  END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true); END IF;
  DELETE FROM public.project_tender_cost_packages WHERE tender_id=p_tender_id;
  INSERT INTO public.project_tender_cost_packages(tender_id,project_id,ontology_version_id,cost_package_id)
    SELECT p_tender_id,v_tender.project_id,v_tender.ontology_version_id,value FROM unnest(p_cost_package_ids)value;
  v_next:=v_tender.commercial_revision+1;
  UPDATE public.project_tenders SET procurement_method=p_procurement_method,boq_mode=p_boq_mode,
    commercial_revision=v_next WHERE id=p_tender_id;
  v_result:=jsonb_build_object('tenderId',p_tender_id,'costPackageIds',to_jsonb(p_cost_package_ids),
    'procurementMethod',p_procurement_method,'boqMode',p_boq_mode,'commercialRevision',v_next);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_commercial_foundation(p_project_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_project public.projects%ROWTYPE;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_uid IS NULL OR v_role NOT IN('pm','admin') OR public.can_access_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'COMMERCIAL_FOUNDATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  RETURN jsonb_build_object(
    'projectId',p_project_id,'currencyCode',v_project.currency_code,'ontologyVersionId',v_project.work_ontology_version_id,
    'costPackages',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'costPackageId',package_row.id,'code',package_row.code,'name',package_row.name,
      'procurementMethod',package_row.procurement_method,'currencyCode',package_row.currency_code,
      'status',package_row.status,'note',package_row.note,'revision',package_row.revision,
      'workGroupIds',COALESCE((SELECT jsonb_agg(scope.work_group_id ORDER BY group_row.code)
        FROM public.project_cost_package_work_groups scope
        JOIN public.work_ontology_work_groups group_row ON group_row.ontology_version_id=scope.ontology_version_id AND group_row.id=scope.work_group_id
        WHERE scope.cost_package_id=package_row.id),'[]'::jsonb)
    ) ORDER BY package_row.code) FROM public.project_cost_packages package_row WHERE package_row.project_id=p_project_id),'[]'::jsonb),
    'tenderPackages',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'tenderId',tender.id,'tenderNumber',tender.tender_number,'status',tender.status,
      'procurementMethod',tender.procurement_method,'boqMode',tender.boq_mode,
      'commercialRevision',tender.commercial_revision,
      'costPackageIds',COALESCE((SELECT jsonb_agg(link.cost_package_id ORDER BY package_row.code)
        FROM public.project_tender_cost_packages link JOIN public.project_cost_packages package_row ON package_row.id=link.cost_package_id
        WHERE link.tender_id=tender.id),'[]'::jsonb)
    ) ORDER BY tender.created_at) FROM public.project_tenders tender WHERE tender.project_id=p_project_id),'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_project_cost_package(bigint,uuid,text,text,text,text,text,uuid[],text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_tender_package_commercial_identity(uuid,uuid[],text,text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_commercial_foundation(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_project_cost_package(bigint,uuid,text,text,text,text,text,uuid[],text,integer,uuid),
  public.save_tender_package_commercial_identity(uuid,uuid[],text,text,integer,uuid),
  public.get_project_commercial_foundation(bigint) TO authenticated;

COMMIT;
