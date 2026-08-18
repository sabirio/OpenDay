-- 078_tender_award.sql
-- Roadmap Phase D.23: one atomic immutable Awarded Contract + Awarded BOQ snapshot.
-- Awarded BOQ -> Execution Scope remains the separate D.24 step.

ALTER TABLE public.project_tenders DROP CONSTRAINT IF EXISTS project_tenders_status_check;
ALTER TABLE public.project_tenders ADD CONSTRAINT project_tenders_status_check CHECK (status IN ('DRAFT','AWARDED'));

CREATE TABLE IF NOT EXISTS public.project_tender_awards (
  id uuid PRIMARY KEY,
  tender_id uuid NOT NULL UNIQUE,
  bid_round_id bigint NOT NULL,
  bid_submission_id bigint NOT NULL UNIQUE,
  tender_setup_version_id bigint NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  bidder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contractor_name text NOT NULL CHECK (btrim(contractor_name)<>''),
  currency_code text NOT NULL CHECK (currency_code~'^[A-Z]{3}$'),
  contract_value numeric(24,2) NOT NULL CHECK (contract_value>=0),
  award_note text NOT NULL CHECK (btrim(award_note)<>'' AND char_length(award_note)<=4000),
  awarded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,tender_id,project_id,ontology_version_id),
  FOREIGN KEY (bid_submission_id,bid_round_id,tender_id,participant_id)
    REFERENCES public.project_tender_bid_submissions(id,bid_round_id,tender_id,participant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tender_setup_version_id,tender_id,project_id,ontology_version_id)
    REFERENCES public.project_tender_setup_versions(id,tender_id,project_id,ontology_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_tender_awarded_boq_items (
  award_id uuid NOT NULL REFERENCES public.project_tender_awards(id) ON DELETE RESTRICT,
  line_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('STANDARD','CUSTOM')),
  standard_definition_id uuid,
  description text NOT NULL CHECK (btrim(description)<>''),
  unit text NOT NULL CHECK (btrim(unit)<>''),
  quantity numeric(20,6) NOT NULL CHECK (quantity>0),
  unit_rate numeric(20,6) NOT NULL CHECK (unit_rate>=0),
  line_total numeric(24,2) GENERATED ALWAYS AS (round(quantity*unit_rate,2)) STORED,
  bidder_note text,
  sort_order integer NOT NULL CHECK (sort_order>=0),
  PRIMARY KEY (award_id,line_id),
  CHECK ((item_kind='STANDARD' AND standard_definition_id IS NOT NULL) OR (item_kind='CUSTOM' AND standard_definition_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.project_tender_awarded_work_groups (
  award_id uuid NOT NULL REFERENCES public.project_tender_awards(id) ON DELETE RESTRICT,
  ontology_version_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  line_count integer NOT NULL CHECK (line_count>0),
  awarded_total numeric(24,2) NOT NULL CHECK (awarded_total>=0),
  PRIMARY KEY (award_id,work_group_id),
  FOREIGN KEY (ontology_version_id,work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id,id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION private.prevent_tender_award_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'TENDER_AWARD_SNAPSHOT_IMMUTABLE' USING ERRCODE='55000';END;$$;
DROP TRIGGER IF EXISTS project_tender_awards_immutable ON public.project_tender_awards;
CREATE TRIGGER project_tender_awards_immutable BEFORE UPDATE OR DELETE ON public.project_tender_awards FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_award_snapshot_mutation();
DROP TRIGGER IF EXISTS project_tender_awarded_boq_items_immutable ON public.project_tender_awarded_boq_items;
CREATE TRIGGER project_tender_awarded_boq_items_immutable BEFORE UPDATE OR DELETE ON public.project_tender_awarded_boq_items FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_award_snapshot_mutation();
DROP TRIGGER IF EXISTS project_tender_awarded_work_groups_immutable ON public.project_tender_awarded_work_groups;
CREATE TRIGGER project_tender_awarded_work_groups_immutable BEFORE UPDATE OR DELETE ON public.project_tender_awarded_work_groups FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_award_snapshot_mutation();
REVOKE ALL ON FUNCTION private.prevent_tender_award_snapshot_mutation() FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.project_tender_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_awarded_boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_awarded_work_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_tender_awards,public.project_tender_awarded_boq_items,public.project_tender_awarded_work_groups FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.prevent_awarded_tender_new_commercial_state()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.project_tenders tender WHERE tender.id=NEW.tender_id AND tender.status='AWARDED') THEN
    RAISE EXCEPTION 'TENDER_ALREADY_AWARDED' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS project_tender_setup_versions_block_after_award ON public.project_tender_setup_versions;
CREATE TRIGGER project_tender_setup_versions_block_after_award BEFORE INSERT ON public.project_tender_setup_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_awarded_tender_new_commercial_state();
DROP TRIGGER IF EXISTS project_tender_bid_rounds_block_after_award ON public.project_tender_bid_rounds;
CREATE TRIGGER project_tender_bid_rounds_block_after_award BEFORE INSERT ON public.project_tender_bid_rounds FOR EACH ROW EXECUTE FUNCTION private.prevent_awarded_tender_new_commercial_state();
REVOKE ALL ON FUNCTION private.prevent_awarded_tender_new_commercial_state() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_tender_award_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_tender public.project_tenders%ROWTYPE;v_round public.project_tender_bid_rounds%ROWTYPE;v_award public.project_tender_awards%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_tender FROM public.project_tenders WHERE id=p_tender_id;
  IF v_tender.id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_tender.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_AWARD_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id ORDER BY round_number DESC LIMIT 1;
  SELECT * INTO v_award FROM public.project_tender_awards WHERE tender_id=p_tender_id;
  SELECT jsonb_build_object(
    'tenderId',p_tender_id,'tenderStatus',v_tender.status,
    'latestRound',CASE WHEN v_round.id IS NULL THEN NULL ELSE jsonb_build_object('bidRoundId',v_round.id,'roundNumber',v_round.round_number,'status',v_round.status)END,
    'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'participantId',participant.participant_id,'contractorName',participant.contractor_name,
      'submissionId',submission.id,'submitted',submission.id IS NOT NULL,'currencyCode',submission.currency_code,
      'total',submission.total,'lineCount',submission.line_count,'pricedLineCount',submission.priced_line_count,
      'missingLineCount',CASE WHEN submission.id IS NULL THEN NULL ELSE submission.line_count-submission.priced_line_count END,
      'reviewStatus',COALESCE(review.status,'NOT_STARTED'),
      'openClarificationCount',COALESCE((SELECT count(*) FROM public.project_tender_clarifications clarification WHERE clarification.bid_submission_id=submission.id AND clarification.status NOT IN('RESOLVED','CLOSED')),0),
      'eligible',submission.id IS NOT NULL AND submission.priced_line_count=submission.line_count AND review.status='REVIEWED'
        AND NOT EXISTS(SELECT 1 FROM public.project_tender_clarifications clarification WHERE clarification.bid_submission_id=submission.id AND clarification.status NOT IN('RESOLVED','CLOSED'))
    )ORDER BY participant.contractor_name,participant.participant_id)
    FROM public.project_tender_participants participant
    LEFT JOIN public.project_tender_bid_submissions submission ON submission.bid_round_id=v_round.id AND submission.participant_id=participant.participant_id
    LEFT JOIN public.project_tender_bid_reviews review ON review.bid_submission_id=submission.id
    WHERE participant.tender_setup_version_id=v_round.tender_setup_version_id),'[]'::jsonb),
    'award',CASE WHEN v_award.id IS NULL THEN NULL ELSE jsonb_build_object(
      'awardId',v_award.id,'bidSubmissionId',v_award.bid_submission_id,'roundNumber',v_round.round_number,
      'participantId',v_award.participant_id,'contractorName',v_award.contractor_name,
      'currencyCode',v_award.currency_code,'contractValue',v_award.contract_value,
      'awardNote',v_award.award_note,'awardedAt',v_award.awarded_at,
      'lineCount',(SELECT count(*) FROM public.project_tender_awarded_boq_items item WHERE item.award_id=v_award.id),
      'workGroupCount',(SELECT count(*) FROM public.project_tender_awarded_work_groups work_group WHERE work_group.award_id=v_award.id),
      'workGroups',COALESCE((SELECT jsonb_agg(jsonb_build_object('workGroupId',snapshot.work_group_id,'workGroupCode',work_group.code,'workGroupLabel',work_group.label,'lineCount',snapshot.line_count,'awardedTotal',snapshot.awarded_total)ORDER BY discipline.display_order,work_group.display_order)
        FROM public.project_tender_awarded_work_groups snapshot
        JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=snapshot.ontology_version_id AND work_group.id=snapshot.work_group_id
        JOIN public.work_ontology_disciplines discipline ON discipline.ontology_version_id=snapshot.ontology_version_id AND discipline.id=work_group.discipline_id
        WHERE snapshot.award_id=v_award.id),'[]'::jsonb)
    )END
  ) INTO v_result;
  RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.award_project_tender(p_bid_submission_id bigint,p_award_note text,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_submission public.project_tender_bid_submissions%ROWTYPE;v_tender public.project_tenders%ROWTYPE;v_round public.project_tender_bid_rounds%ROWTYPE;v_review public.project_tender_bid_reviews%ROWTYPE;v_participant public.project_tender_participants%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_award_id uuid:=gen_random_uuid();v_count integer;v_total numeric(24,2);v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_bid_submission_id IS NULL OR p_award_note IS NULL OR btrim(p_award_note)='' OR char_length(btrim(p_award_note))>4000 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_TENDER_AWARD_COMMAND' USING ERRCODE='22023';END IF;
  SELECT * INTO v_submission FROM public.project_tender_bid_submissions WHERE id=p_bid_submission_id;
  IF v_submission.id IS NULL THEN RAISE EXCEPTION 'BID_SUBMISSION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_submission.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_AWARD_FORBIDDEN' USING ERRCODE='42501';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.award',p_client_request_id,v_submission.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.award' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_submission.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT * INTO v_tender FROM public.project_tenders WHERE id=v_submission.tender_id FOR UPDATE;
  IF v_tender.status='AWARDED' OR EXISTS(SELECT 1 FROM public.project_tender_awards WHERE tender_id=v_tender.id) THEN RAISE EXCEPTION 'TENDER_ALREADY_AWARDED' USING ERRCODE='55000';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE tender_id=v_tender.id ORDER BY round_number DESC LIMIT 1 FOR UPDATE;
  IF v_round.id IS NULL OR v_round.id<>v_submission.bid_round_id OR v_round.status<>'OPEN' THEN RAISE EXCEPTION 'TENDER_AWARD_REQUIRES_LATEST_OPEN_ROUND' USING ERRCODE='55000';END IF;
  IF v_submission.priced_line_count<>v_submission.line_count THEN RAISE EXCEPTION 'TENDER_AWARD_REQUIRES_FULLY_PRICED_BID' USING ERRCODE='55000';END IF;
  SELECT * INTO v_review FROM public.project_tender_bid_reviews WHERE bid_submission_id=v_submission.id;
  IF v_review.status IS DISTINCT FROM 'REVIEWED' THEN RAISE EXCEPTION 'TENDER_AWARD_REQUIRES_REVIEWED_BID' USING ERRCODE='55000';END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_clarifications WHERE bid_submission_id=v_submission.id AND status NOT IN('RESOLVED','CLOSED')) THEN RAISE EXCEPTION 'TENDER_AWARD_REQUIRES_CLOSED_CLARIFICATIONS' USING ERRCODE='55000';END IF;
  SELECT * INTO v_participant FROM public.project_tender_participants WHERE tender_setup_version_id=v_submission.tender_setup_version_id AND participant_id=v_submission.participant_id;
  IF NOT EXISTS(SELECT 1 FROM public.project_tender_bidder_access WHERE tender_id=v_submission.tender_id AND participant_id=v_submission.participant_id AND status='ACTIVE') THEN RAISE EXCEPTION 'TENDER_AWARD_REQUIRES_ACTIVE_BIDDER' USING ERRCODE='55000';END IF;
  UPDATE public.project_tender_bid_rounds SET status='CLOSED',closed_at=now() WHERE id=v_round.id;
  INSERT INTO public.project_tender_awards(id,tender_id,bid_round_id,bid_submission_id,tender_setup_version_id,project_id,ontology_version_id,participant_id,bidder_user_id,contractor_name,currency_code,contract_value,award_note,awarded_by)
    VALUES(v_award_id,v_submission.tender_id,v_submission.bid_round_id,v_submission.id,v_submission.tender_setup_version_id,v_submission.project_id,v_submission.ontology_version_id,v_submission.participant_id,v_submission.bidder_user_id,v_participant.contractor_name,v_submission.currency_code,v_submission.total,btrim(p_award_note),v_uid);
  INSERT INTO public.project_tender_awarded_boq_items(award_id,line_id,work_group_id,item_kind,standard_definition_id,description,unit,quantity,unit_rate,bidder_note,sort_order)
    SELECT v_award_id,submission_item.line_id,source.work_group_id,source.item_kind,source.standard_definition_id,source.description,source.unit,submission_item.quantity,submission_item.unit_rate,submission_item.bidder_note,source.sort_order
    FROM public.project_tender_bid_submission_items submission_item
    JOIN public.project_tender_setup_versions setup ON setup.id=v_submission.tender_setup_version_id
    JOIN public.project_boq_items source ON source.boq_version_id=setup.issued_boq_version_id AND source.line_id=submission_item.line_id
    WHERE submission_item.bid_submission_id=v_submission.id;
  SELECT count(*),COALESCE(sum(line_total),0) INTO v_count,v_total FROM public.project_tender_awarded_boq_items WHERE award_id=v_award_id;
  IF v_count<>v_submission.line_count OR v_total<>v_submission.total THEN RAISE EXCEPTION 'TENDER_AWARD_SNAPSHOT_TOTAL_MISMATCH' USING ERRCODE='23514';END IF;
  INSERT INTO public.project_tender_awarded_work_groups(award_id,ontology_version_id,work_group_id,line_count,awarded_total)
    SELECT v_award_id,v_submission.ontology_version_id,work_group_id,count(*),sum(line_total) FROM public.project_tender_awarded_boq_items WHERE award_id=v_award_id GROUP BY work_group_id;
  UPDATE public.project_tenders SET status='AWARDED' WHERE id=v_tender.id;
  v_result:=jsonb_build_object('awardId',v_award_id,'tenderId',v_tender.id,'bidSubmissionId',v_submission.id,'contractorName',v_participant.contractor_name,'currencyCode',v_submission.currency_code,'contractValue',v_submission.total,'lineCount',v_count,'workGroupCount',(SELECT count(*) FROM public.project_tender_awarded_work_groups WHERE award_id=v_award_id),'awardedAt',now());
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.get_tender_award_workspace(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.award_project_tender(bigint,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tender_award_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_project_tender(bigint,text,uuid) TO authenticated;
