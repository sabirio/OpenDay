-- 072_tender_setup.sql
-- Roadmap Phase D.17: versioned PM/Admin tender setup.
-- Bidder authentication/access and bid rounds are deliberately deferred to D.18/D.19.

CREATE TABLE IF NOT EXISTS public.project_tenders (
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT,
  tender_number text NOT NULL CHECK (btrim(tender_number) <> ''),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, tender_number),
  UNIQUE (id, project_id, ontology_version_id)
);

CREATE TABLE IF NOT EXISTS public.project_tender_setup_versions (
  id bigserial PRIMARY KEY,
  tender_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  title text NOT NULL CHECK (btrim(title) <> ''),
  deadline_at timestamptz NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  tender_rules text NOT NULL CHECK (btrim(tender_rules) <> ''),
  issued_boq_id uuid NOT NULL,
  issued_boq_version_id bigint NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tender_id, revision_number),
  UNIQUE (id, tender_id, project_id, ontology_version_id),
  FOREIGN KEY (tender_id, project_id, ontology_version_id)
    REFERENCES public.project_tenders(id, project_id, ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (issued_boq_version_id, issued_boq_id, project_id, ontology_version_id)
    REFERENCES public.project_boq_versions(id, boq_id, project_id, ontology_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_tender_scope_work_groups (
  tender_setup_version_id bigint NOT NULL,
  tender_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  PRIMARY KEY (tender_setup_version_id, work_group_id),
  FOREIGN KEY (tender_setup_version_id, tender_id, project_id, ontology_version_id)
    REFERENCES public.project_tender_setup_versions(id, tender_id, project_id, ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_tender_participants (
  tender_setup_version_id bigint NOT NULL,
  tender_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  contractor_name text NOT NULL CHECK (btrim(contractor_name) <> ''),
  contact_email text NOT NULL CHECK (contact_email = lower(contact_email) AND contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  PRIMARY KEY (tender_setup_version_id, participant_id),
  UNIQUE (tender_setup_version_id, contact_email),
  FOREIGN KEY (tender_setup_version_id, tender_id, project_id, ontology_version_id)
    REFERENCES public.project_tender_setup_versions(id, tender_id, project_id, ontology_version_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS project_tenders_project_idx ON public.project_tenders(project_id, created_at);
CREATE INDEX IF NOT EXISTS project_tender_versions_tender_idx ON public.project_tender_setup_versions(tender_id, revision_number DESC);

CREATE OR REPLACE FUNCTION private.prevent_tender_setup_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'TENDER_SETUP_SNAPSHOT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS project_tender_setup_versions_immutable ON public.project_tender_setup_versions;
CREATE TRIGGER project_tender_setup_versions_immutable BEFORE UPDATE OR DELETE ON public.project_tender_setup_versions
  FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_setup_snapshot_mutation();
DROP TRIGGER IF EXISTS project_tender_scope_work_groups_immutable ON public.project_tender_scope_work_groups;
CREATE TRIGGER project_tender_scope_work_groups_immutable BEFORE UPDATE OR DELETE ON public.project_tender_scope_work_groups
  FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_setup_snapshot_mutation();
DROP TRIGGER IF EXISTS project_tender_participants_immutable ON public.project_tender_participants;
CREATE TRIGGER project_tender_participants_immutable BEFORE UPDATE OR DELETE ON public.project_tender_participants
  FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_setup_snapshot_mutation();
REVOKE ALL ON FUNCTION private.prevent_tender_setup_snapshot_mutation() FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.project_tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_setup_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_scope_work_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_tenders_pm_select" ON public.project_tenders;
CREATE POLICY "project_tenders_pm_select" ON public.project_tenders FOR SELECT TO authenticated
  USING (lower((SELECT role FROM public.profiles WHERE id = auth.uid())) IN ('pm', 'admin') AND public.can_write_project(project_id));
DROP POLICY IF EXISTS "project_tender_versions_pm_select" ON public.project_tender_setup_versions;
CREATE POLICY "project_tender_versions_pm_select" ON public.project_tender_setup_versions FOR SELECT TO authenticated
  USING (lower((SELECT role FROM public.profiles WHERE id = auth.uid())) IN ('pm', 'admin') AND public.can_write_project(project_id));
DROP POLICY IF EXISTS "project_tender_scope_pm_select" ON public.project_tender_scope_work_groups;
CREATE POLICY "project_tender_scope_pm_select" ON public.project_tender_scope_work_groups FOR SELECT TO authenticated
  USING (lower((SELECT role FROM public.profiles WHERE id = auth.uid())) IN ('pm', 'admin') AND public.can_write_project(project_id));
DROP POLICY IF EXISTS "project_tender_participants_pm_select" ON public.project_tender_participants;
CREATE POLICY "project_tender_participants_pm_select" ON public.project_tender_participants FOR SELECT TO authenticated
  USING (lower((SELECT role FROM public.profiles WHERE id = auth.uid())) IN ('pm', 'admin') AND public.can_write_project(project_id));

REVOKE ALL ON TABLE public.project_tenders, public.project_tender_setup_versions,
  public.project_tender_scope_work_groups, public.project_tender_participants
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_tenders, public.project_tender_setup_versions,
  public.project_tender_scope_work_groups, public.project_tender_participants TO authenticated;
REVOKE ALL ON SEQUENCE public.project_tender_setup_versions_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_project_tender_setup(
  p_project_id bigint, p_tender_id uuid, p_tender_number text, p_title text,
  p_deadline_at timestamptz, p_currency_code text, p_tender_rules text,
  p_issued_boq_version_id bigint, p_work_group_ids jsonb, p_participants jsonb,
  p_expected_latest_revision integer, p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_ontology_version_id uuid;
  v_existing public.project_tenders%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_current_revision integer;
  v_next_revision integer;
  v_version_id bigint;
  v_boq_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_tender_id IS NULL OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'TENDER_ID_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_tender_number, '')), '') IS NULL THEN RAISE EXCEPTION 'TENDER_NUMBER_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL THEN RAISE EXCEPTION 'TENDER_TITLE_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_deadline_at IS NULL THEN RAISE EXCEPTION 'TENDER_DEADLINE_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_currency_code, '') !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'INVALID_CURRENCY_CODE' USING ERRCODE = '22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_tender_rules, '')), '') IS NULL THEN RAISE EXCEPTION 'TENDER_RULES_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_expected_latest_revision IS NULL OR p_expected_latest_revision < 0 THEN RAISE EXCEPTION 'INVALID_EXPECTED_REVISION' USING ERRCODE = '22023'; END IF;
  IF p_work_group_ids IS NULL OR jsonb_typeof(p_work_group_ids) <> 'array' OR jsonb_array_length(p_work_group_ids) = 0 THEN
    RAISE EXCEPTION 'TENDER_SCOPE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_participants IS NULL OR jsonb_typeof(p_participants) <> 'array' OR jsonb_array_length(p_participants) = 0 THEN
    RAISE EXCEPTION 'TENDER_PARTICIPANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('pm', 'admin') OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized to manage tender setup' USING ERRCODE = '42501';
  END IF;
  SELECT work_ontology_version_id INTO v_ontology_version_id FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF v_ontology_version_id IS NULL THEN RAISE EXCEPTION 'TENDER_REQUIRES_WORK_ONTOLOGY' USING ERRCODE = '55000'; END IF;
  SELECT v.boq_id INTO v_boq_id FROM public.project_boq_versions v WHERE v.id=p_issued_boq_version_id AND v.project_id=p_project_id AND v.ontology_version_id=v_ontology_version_id;
  IF v_boq_id IS NULL THEN
    RAISE EXCEPTION 'TENDER_BOQ_VERSION_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_work_group_ids) value
    LEFT JOIN public.work_ontology_work_groups g ON g.ontology_version_id=v_ontology_version_id AND g.id=value::uuid WHERE g.id IS NULL) THEN
    RAISE EXCEPTION 'INVALID_TENDER_WORK_GROUP' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_work_group_ids) value GROUP BY value HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'DUPLICATE_TENDER_WORK_GROUP' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE jsonb_typeof(item) <> 'object'
    OR COALESCE(item->>'participantId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR btrim(COALESCE(item->>'contractorName',''))='' OR lower(btrim(COALESCE(item->>'contactEmail',''))) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
    RAISE EXCEPTION 'INVALID_TENDER_PARTICIPANT' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item GROUP BY lower(btrim(item->>'contactEmail')) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'DUPLICATE_TENDER_PARTICIPANT' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'tender.save_setup', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.save_setup' AND client_request_id=p_client_request_id;
  IF v_request.project_id <> p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505'; END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;

  SELECT * INTO v_existing FROM public.project_tenders WHERE id=p_tender_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.project_id <> p_project_id OR v_existing.ontology_version_id <> v_ontology_version_id OR v_existing.tender_number <> btrim(p_tender_number) THEN
      RAISE EXCEPTION 'TENDER_IDENTITY_CONFLICT' USING ERRCODE='23505';
    END IF;
  ELSE
    IF p_expected_latest_revision <> 0 THEN RAISE EXCEPTION 'TENDER_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
    INSERT INTO public.project_tenders(id, project_id, ontology_version_id, tender_number, created_by)
      VALUES (p_tender_id, p_project_id, v_ontology_version_id, btrim(p_tender_number), v_uid);
  END IF;
  SELECT COALESCE(max(revision_number),0) INTO v_current_revision FROM public.project_tender_setup_versions WHERE tender_id=p_tender_id;
  IF v_current_revision <> p_expected_latest_revision THEN RAISE EXCEPTION 'TENDER_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  v_next_revision := v_current_revision + 1;
  INSERT INTO public.project_tender_setup_versions(tender_id, project_id, ontology_version_id, revision_number, title, deadline_at, currency_code, tender_rules, issued_boq_id, issued_boq_version_id, created_by)
    VALUES (p_tender_id, p_project_id, v_ontology_version_id, v_next_revision, btrim(p_title), p_deadline_at, p_currency_code, btrim(p_tender_rules), v_boq_id, p_issued_boq_version_id, v_uid)
    RETURNING id INTO v_version_id;
  INSERT INTO public.project_tender_scope_work_groups(tender_setup_version_id,tender_id,project_id,ontology_version_id,work_group_id)
    SELECT v_version_id,p_tender_id,p_project_id,v_ontology_version_id,value::uuid FROM jsonb_array_elements_text(p_work_group_ids);
  INSERT INTO public.project_tender_participants(tender_setup_version_id,tender_id,project_id,ontology_version_id,participant_id,contractor_name,contact_email)
    SELECT v_version_id,p_tender_id,p_project_id,v_ontology_version_id,(item->>'participantId')::uuid,btrim(item->>'contractorName'),lower(btrim(item->>'contactEmail')) FROM jsonb_array_elements(p_participants) item;
  v_result := jsonb_build_object('tenderId',p_tender_id,'projectId',p_project_id,'setupVersionId',v_version_id,'revisionNumber',v_next_revision,'status','DRAFT');
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay',false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,bigint,jsonb,jsonb,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,bigint,jsonb,jsonb,integer,uuid)
  TO authenticated;
