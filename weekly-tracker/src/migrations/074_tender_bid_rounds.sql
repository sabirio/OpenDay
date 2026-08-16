-- 074_tender_bid_rounds.sql
-- Roadmap Phase D.19: bidder-owned drafts, immutable submissions and inherited next rounds.
-- PM review/clarifications/comparison/award remain D.20+ concerns.

CREATE TABLE IF NOT EXISTS public.project_tender_bid_rounds (
  id bigserial PRIMARY KEY,
  tender_id uuid NOT NULL,
  tender_setup_version_id bigint NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  round_number integer NOT NULL CHECK (round_number > 0),
  status text NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  deadline_at timestamptz NOT NULL,
  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (tender_id, round_number),
  UNIQUE (id, tender_id, tender_setup_version_id, project_id, ontology_version_id),
  FOREIGN KEY (tender_setup_version_id, tender_id, project_id, ontology_version_id)
    REFERENCES public.project_tender_setup_versions(id, tender_id, project_id, ontology_version_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS project_tender_one_open_round_idx ON public.project_tender_bid_rounds(tender_id) WHERE status='OPEN';

CREATE TABLE IF NOT EXISTS public.project_tender_bid_drafts (
  id bigserial PRIMARY KEY,
  bid_round_id bigint NOT NULL,
  tender_id uuid NOT NULL,
  tender_setup_version_id bigint NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  bidder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bid_round_id, participant_id),
  UNIQUE (id, bid_round_id, tender_id, participant_id),
  FOREIGN KEY (bid_round_id, tender_id, tender_setup_version_id, project_id, ontology_version_id)
    REFERENCES public.project_tender_bid_rounds(id, tender_id, tender_setup_version_id, project_id, ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (tender_id, participant_id)
    REFERENCES public.project_tender_bidder_access(tender_id, participant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_tender_bid_draft_items (
  bid_draft_id bigint NOT NULL,
  bid_round_id bigint NOT NULL,
  tender_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  line_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  unit_rate numeric(20,6) CHECK (unit_rate IS NULL OR unit_rate >= 0),
  line_total numeric(24,2) GENERATED ALWAYS AS (round(quantity*unit_rate,2)) STORED,
  bidder_note text,
  PRIMARY KEY (bid_draft_id,line_id),
  FOREIGN KEY (bid_draft_id,bid_round_id,tender_id,participant_id)
    REFERENCES public.project_tender_bid_drafts(id,bid_round_id,tender_id,participant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.project_tender_bid_submissions (
  id bigserial PRIMARY KEY,
  bid_round_id bigint NOT NULL,
  tender_id uuid NOT NULL,
  tender_setup_version_id bigint NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  bidder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_draft_revision integer NOT NULL CHECK (source_draft_revision > 0),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  priced_line_count integer NOT NULL CHECK (priced_line_count >= 0),
  line_count integer NOT NULL CHECK (line_count > 0),
  total numeric(24,2) NOT NULL CHECK (total >= 0),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bid_round_id,participant_id),
  UNIQUE (id,bid_round_id,tender_id,participant_id),
  FOREIGN KEY (bid_round_id,tender_id,tender_setup_version_id,project_id,ontology_version_id)
    REFERENCES public.project_tender_bid_rounds(id,tender_id,tender_setup_version_id,project_id,ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (tender_id,participant_id)
    REFERENCES public.project_tender_bidder_access(tender_id,participant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_tender_bid_submission_items (
  bid_submission_id bigint NOT NULL,
  bid_round_id bigint NOT NULL,
  tender_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  line_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  unit_rate numeric(20,6) CHECK (unit_rate IS NULL OR unit_rate >= 0),
  line_total numeric(24,2) GENERATED ALWAYS AS (round(quantity*unit_rate,2)) STORED,
  bidder_note text,
  PRIMARY KEY (bid_submission_id,line_id),
  FOREIGN KEY (bid_submission_id,bid_round_id,tender_id,participant_id)
    REFERENCES public.project_tender_bid_submissions(id,bid_round_id,tender_id,participant_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION private.prevent_tender_bid_submission_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'TENDER_BID_SUBMISSION_IMMUTABLE' USING ERRCODE='55000';END;$$;
DROP TRIGGER IF EXISTS project_tender_bid_submissions_immutable ON public.project_tender_bid_submissions;
CREATE TRIGGER project_tender_bid_submissions_immutable BEFORE UPDATE OR DELETE ON public.project_tender_bid_submissions FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_bid_submission_mutation();
DROP TRIGGER IF EXISTS project_tender_bid_submission_items_immutable ON public.project_tender_bid_submission_items;
CREATE TRIGGER project_tender_bid_submission_items_immutable BEFORE UPDATE OR DELETE ON public.project_tender_bid_submission_items FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_bid_submission_mutation();
REVOKE ALL ON FUNCTION private.prevent_tender_bid_submission_mutation() FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.project_tender_bid_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_bid_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_bid_draft_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_bid_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_bid_submission_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tender_bid_rounds_select" ON public.project_tender_bid_rounds;
CREATE POLICY "tender_bid_rounds_select" ON public.project_tender_bid_rounds FOR SELECT TO authenticated USING (
  (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  OR EXISTS(SELECT 1 FROM public.project_tender_bidder_access access WHERE access.tender_id=tender_id AND access.bidder_user_id=auth.uid() AND access.status='ACTIVE' AND access.tender_setup_version_id=tender_setup_version_id)
);
DROP POLICY IF EXISTS "tender_bid_submissions_select" ON public.project_tender_bid_submissions;
CREATE POLICY "tender_bid_submissions_select" ON public.project_tender_bid_submissions FOR SELECT TO authenticated USING (
  (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  OR bidder_user_id=auth.uid()
);
DROP POLICY IF EXISTS "tender_bid_submission_items_select" ON public.project_tender_bid_submission_items;
CREATE POLICY "tender_bid_submission_items_select" ON public.project_tender_bid_submission_items FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.project_tender_bid_submissions submission WHERE submission.id=bid_submission_id AND (
    submission.bidder_user_id=auth.uid() OR (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(submission.project_id))))
);

REVOKE ALL ON TABLE public.project_tender_bid_rounds,public.project_tender_bid_drafts,public.project_tender_bid_draft_items,public.project_tender_bid_submissions,public.project_tender_bid_submission_items FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_tender_bid_rounds,public.project_tender_bid_submissions,public.project_tender_bid_submission_items TO authenticated;
REVOKE ALL ON SEQUENCE public.project_tender_bid_rounds_id_seq,public.project_tender_bid_drafts_id_seq,public.project_tender_bid_submissions_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.open_next_tender_bid_round(p_tender_id uuid,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_project_id bigint;v_ontology_id uuid;v_setup public.project_tender_setup_versions%ROWTYPE;v_current public.project_tender_bid_rounds%ROWTYPE;v_round_number integer;v_round_id bigint;v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_tender_id IS NULL OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'BID_ROUND_ID_REQUIRED' USING ERRCODE='22023';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  SELECT project_id,ontology_version_id INTO v_project_id,v_ontology_id FROM public.project_tenders WHERE id=p_tender_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'BID_ROUND_FORBIDDEN' USING ERRCODE='42501';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.open_bid_round',p_client_request_id,v_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.open_bid_round' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE tender_id=p_tender_id ORDER BY revision_number DESC LIMIT 1;
  IF v_setup.id IS NULL THEN RAISE EXCEPTION 'TENDER_SETUP_REQUIRED' USING ERRCODE='55000';END IF;
  IF v_setup.deadline_at<=now() THEN RAISE EXCEPTION 'TENDER_DEADLINE_PASSED' USING ERRCODE='22023';END IF;
  SELECT * INTO v_current FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id ORDER BY round_number DESC LIMIT 1 FOR UPDATE;
  IF v_current.id IS NOT NULL AND v_current.status='OPEN' THEN
    IF EXISTS(SELECT 1 FROM public.project_tender_bidder_access access WHERE access.tender_id=p_tender_id AND access.tender_setup_version_id=v_current.tender_setup_version_id AND access.status<>'REVOKED' AND NOT EXISTS(SELECT 1 FROM public.project_tender_bid_submissions submission WHERE submission.bid_round_id=v_current.id AND submission.participant_id=access.participant_id)) THEN
      RAISE EXCEPTION 'BID_ROUND_AWAITING_SUBMISSIONS' USING ERRCODE='55000';
    END IF;
    UPDATE public.project_tender_bid_rounds SET status='CLOSED',closed_at=now() WHERE id=v_current.id;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_tender_bidder_access WHERE tender_id=p_tender_id AND tender_setup_version_id=v_setup.id AND status<>'REVOKED') THEN
    RAISE EXCEPTION 'BID_ROUND_REQUIRES_INVITED_BIDDER' USING ERRCODE='55000';
  END IF;
  v_round_number:=COALESCE(v_current.round_number,0)+1;
  INSERT INTO public.project_tender_bid_rounds(tender_id,tender_setup_version_id,project_id,ontology_version_id,round_number,status,deadline_at,opened_by)
    VALUES(p_tender_id,v_setup.id,v_project_id,v_ontology_id,v_round_number,'OPEN',v_setup.deadline_at,v_uid)RETURNING id INTO v_round_id;
  v_result:=jsonb_build_object('tenderId',p_tender_id,'bidRoundId',v_round_id,'roundNumber',v_round_number,'status','OPEN','deadlineAt',v_setup.deadline_at);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.get_my_tender_bid_round_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;v_round public.project_tender_bid_rounds%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_draft public.project_tender_bid_drafts%ROWTYPE;v_previous_round_id bigint;v_submission_id bigint;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id AND status='OPEN' ORDER BY round_number DESC LIMIT 1;
  IF v_round.id IS NULL THEN RETURN NULL;END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=p_tender_id AND bidder_user_id=v_uid AND status='ACTIVE' AND tender_setup_version_id=v_round.tender_setup_version_id;
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_round.tender_setup_version_id;
  SELECT * INTO v_draft FROM public.project_tender_bid_drafts WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id;
  SELECT id INTO v_submission_id FROM public.project_tender_bid_submissions WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id;
  SELECT submission.bid_round_id INTO v_previous_round_id FROM public.project_tender_bid_submissions submission JOIN public.project_tender_bid_rounds prior ON prior.id=submission.bid_round_id WHERE submission.tender_id=p_tender_id AND submission.participant_id=v_access.participant_id AND prior.round_number<v_round.round_number ORDER BY prior.round_number DESC LIMIT 1;
  SELECT jsonb_build_object('bidRoundId',v_round.id,'roundNumber',v_round.round_number,'deadlineAt',v_round.deadline_at,'draftRevision',COALESCE(v_draft.revision,0),'submitted',v_submission_id IS NOT NULL,'currencyCode',v_setup.currency_code,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('lineId',source.line_id,'workGroupId',source.work_group_id,'description',source.description,'unit',source.unit,'quantity',source.quantity,
      'unitRate',CASE WHEN v_draft.id IS NOT NULL THEN draft_item.unit_rate ELSE previous_item.unit_rate END,'bidderNote',CASE WHEN v_draft.id IS NOT NULL THEN draft_item.bidder_note ELSE previous_item.bidder_note END,'previousUnitRate',previous_item.unit_rate,'sortOrder',source.sort_order)ORDER BY source.sort_order,source.line_id)
      FROM public.project_boq_items source
      JOIN public.project_tender_scope_work_groups scope ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=source.work_group_id
      LEFT JOIN public.project_tender_bid_draft_items draft_item ON draft_item.bid_draft_id=v_draft.id AND draft_item.line_id=source.line_id
      LEFT JOIN public.project_tender_bid_submissions previous_submission ON previous_submission.bid_round_id=v_previous_round_id AND previous_submission.participant_id=v_access.participant_id
      LEFT JOIN public.project_tender_bid_submission_items previous_item ON previous_item.bid_submission_id=previous_submission.id AND previous_item.line_id=source.line_id
      WHERE source.boq_version_id=v_setup.issued_boq_version_id),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.save_my_tender_bid_draft(p_bid_round_id bigint,p_items jsonb,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_round public.project_tender_bid_rounds%ROWTYPE;v_access public.project_tender_bidder_access%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_draft public.project_tender_bid_drafts%ROWTYPE;v_next integer;v_request public.write_command_requests%ROWTYPE;v_result jsonb;v_source_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'EMPTY_BID_DRAFT' USING ERRCODE='22023';END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_BID_DRAFT_COMMAND' USING ERRCODE='22023';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE id=p_bid_round_id FOR UPDATE;
  IF v_round.id IS NULL OR v_round.status<>'OPEN' OR v_round.deadline_at<=now() THEN RAISE EXCEPTION 'BID_ROUND_NOT_OPEN' USING ERRCODE='55000';END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=v_round.tender_id AND bidder_user_id=v_uid AND status='ACTIVE' AND tender_setup_version_id=v_round.tender_setup_version_id;
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_bid_submissions WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id) THEN RAISE EXCEPTION 'BID_ALREADY_SUBMITTED' USING ERRCODE='55000';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item WHERE COALESCE(item->>'lineId','')!~*'^[0-9a-f-]{36}$' OR (item->>'unitRate' IS NOT NULL AND (item->>'unitRate'!~'^[0-9]+(?:\.[0-9]+)?$' OR (item->>'unitRate')::numeric<0)))THEN RAISE EXCEPTION 'INVALID_BID_DRAFT_ITEM' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item GROUP BY item->>'lineId' HAVING count(*)>1)THEN RAISE EXCEPTION 'DUPLICATE_BID_LINE' USING ERRCODE='22023';END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_round.tender_setup_version_id;
  SELECT count(*) INTO v_source_count FROM public.project_boq_items source JOIN public.project_tender_scope_work_groups scope ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=source.work_group_id WHERE source.boq_version_id=v_setup.issued_boq_version_id;
  IF jsonb_array_length(p_items)<>v_source_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item LEFT JOIN public.project_boq_items source ON source.boq_version_id=v_setup.issued_boq_version_id AND source.line_id=(item->>'lineId')::uuid LEFT JOIN public.project_tender_scope_work_groups scope ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=source.work_group_id WHERE source.line_id IS NULL OR scope.work_group_id IS NULL)THEN RAISE EXCEPTION 'BID_SCOPE_MISMATCH' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.save_bid_draft',p_client_request_id,v_round.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.save_bid_draft' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_round.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT * INTO v_draft FROM public.project_tender_bid_drafts WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id FOR UPDATE;
  IF COALESCE(v_draft.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'BID_DRAFT_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  v_next:=p_expected_revision+1;
  IF v_draft.id IS NULL THEN INSERT INTO public.project_tender_bid_drafts(bid_round_id,tender_id,tender_setup_version_id,project_id,ontology_version_id,participant_id,bidder_user_id,revision)VALUES(v_round.id,v_round.tender_id,v_round.tender_setup_version_id,v_round.project_id,v_round.ontology_version_id,v_access.participant_id,v_uid,v_next)RETURNING * INTO v_draft;
  ELSE UPDATE public.project_tender_bid_drafts SET revision=v_next,updated_at=now()WHERE id=v_draft.id RETURNING * INTO v_draft;DELETE FROM public.project_tender_bid_draft_items WHERE bid_draft_id=v_draft.id;END IF;
  INSERT INTO public.project_tender_bid_draft_items(bid_draft_id,bid_round_id,tender_id,participant_id,line_id,quantity,unit_rate,bidder_note)
    SELECT v_draft.id,v_round.id,v_round.tender_id,v_access.participant_id,source.line_id,source.quantity,NULLIF(item->>'unitRate','')::numeric,NULLIF(btrim(COALESCE(item->>'bidderNote','')),'') FROM jsonb_array_elements(p_items)item JOIN public.project_boq_items source ON source.boq_version_id=v_setup.issued_boq_version_id AND source.line_id=(item->>'lineId')::uuid;
  v_result:=jsonb_build_object('bidRoundId',v_round.id,'draftRevision',v_next,'lineCount',v_source_count);UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.submit_my_tender_bid(p_bid_round_id bigint,p_expected_draft_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_round public.project_tender_bid_rounds%ROWTYPE;v_access public.project_tender_bidder_access%ROWTYPE;v_draft public.project_tender_bid_drafts%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_submission_id bigint;v_count integer;v_priced integer;v_total numeric(24,2);v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE id=p_bid_round_id FOR UPDATE;
  IF v_round.id IS NULL OR v_round.status<>'OPEN' OR v_round.deadline_at<=now()THEN RAISE EXCEPTION 'BID_ROUND_NOT_OPEN' USING ERRCODE='55000';END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=v_round.tender_id AND bidder_user_id=v_uid AND status='ACTIVE' AND tender_setup_version_id=v_round.tender_setup_version_id;
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  SELECT * INTO v_draft FROM public.project_tender_bid_drafts WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_draft.revision<>p_expected_draft_revision THEN RAISE EXCEPTION 'BID_DRAFT_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.submit_bid',p_client_request_id,v_round.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.submit_bid' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_round.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_bid_submissions WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id)THEN RAISE EXCEPTION 'BID_ALREADY_SUBMITTED' USING ERRCODE='55000';END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_round.tender_setup_version_id;
  SELECT count(*),count(*)FILTER(WHERE unit_rate IS NOT NULL),COALESCE(sum(line_total),0)INTO v_count,v_priced,v_total FROM public.project_tender_bid_draft_items WHERE bid_draft_id=v_draft.id;
  INSERT INTO public.project_tender_bid_submissions(bid_round_id,tender_id,tender_setup_version_id,project_id,ontology_version_id,participant_id,bidder_user_id,source_draft_revision,currency_code,priced_line_count,line_count,total)
    VALUES(v_round.id,v_round.tender_id,v_round.tender_setup_version_id,v_round.project_id,v_round.ontology_version_id,v_access.participant_id,v_uid,v_draft.revision,v_setup.currency_code,v_priced,v_count,v_total)RETURNING id INTO v_submission_id;
  INSERT INTO public.project_tender_bid_submission_items(bid_submission_id,bid_round_id,tender_id,participant_id,line_id,quantity,unit_rate,bidder_note)
    SELECT v_submission_id,v_round.id,v_round.tender_id,v_access.participant_id,line_id,quantity,unit_rate,bidder_note FROM public.project_tender_bid_draft_items WHERE bid_draft_id=v_draft.id;
  v_result:=jsonb_build_object('submissionId',v_submission_id,'bidRoundId',v_round.id,'roundNumber',v_round.round_number,'lineCount',v_count,'pricedLineCount',v_priced,'total',v_total,'currencyCode',v_setup.currency_code,'submittedAt',now());UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.open_next_tender_bid_round(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_my_tender_bid_round_workspace(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.submit_my_tender_bid(bigint,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.open_next_tender_bid_round(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tender_bid_round_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_tender_bid(bigint,integer,uuid) TO authenticated;
