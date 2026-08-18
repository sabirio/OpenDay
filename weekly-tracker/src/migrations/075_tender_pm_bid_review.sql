-- 075_tender_pm_bid_review.sql
-- Roadmap Phase D.20: PM/Admin review of immutable bid submissions.
-- Clarifications, cross-bidder comparison and award remain D.21-D.23 concerns.

CREATE TABLE IF NOT EXISTS public.project_tender_bid_reviews (
  bid_submission_id bigint PRIMARY KEY,
  bid_round_id bigint NOT NULL,
  tender_id uuid NOT NULL,
  project_id bigint NOT NULL,
  participant_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('IN_REVIEW','REVIEWED')),
  revision integer NOT NULL CHECK (revision > 0),
  reviewed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bid_submission_id,bid_round_id,tender_id,participant_id),
  FOREIGN KEY (bid_submission_id,bid_round_id,tender_id,participant_id)
    REFERENCES public.project_tender_bid_submissions(id,bid_round_id,tender_id,participant_id) ON DELETE RESTRICT
);

ALTER TABLE public.project_tender_bid_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tender_bid_reviews_pm_select" ON public.project_tender_bid_reviews;
CREATE POLICY "tender_bid_reviews_pm_select" ON public.project_tender_bid_reviews FOR SELECT TO authenticated USING (
  lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin')
  AND public.can_write_project(project_id)
);
REVOKE ALL ON TABLE public.project_tender_bid_reviews FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_tender_bid_reviews TO authenticated;

CREATE OR REPLACE FUNCTION private.require_tender_bid_reviews_before_round_close()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.status='OPEN' AND NEW.status='CLOSED' AND EXISTS(
    SELECT 1
    FROM public.project_tender_bidder_access access
    LEFT JOIN public.project_tender_bid_submissions submission
      ON submission.bid_round_id=OLD.id AND submission.participant_id=access.participant_id
    LEFT JOIN public.project_tender_bid_reviews review
      ON review.bid_submission_id=submission.id
    WHERE access.tender_id=OLD.tender_id
      AND access.tender_setup_version_id=OLD.tender_setup_version_id
      AND access.status='ACCEPTED'
      AND (submission.id IS NULL OR review.status IS DISTINCT FROM 'REVIEWED')
  ) THEN
    RAISE EXCEPTION 'BID_ROUND_REVIEW_REQUIRED' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS project_tender_bid_rounds_require_review ON public.project_tender_bid_rounds;
CREATE TRIGGER project_tender_bid_rounds_require_review BEFORE UPDATE OF status ON public.project_tender_bid_rounds
  FOR EACH ROW EXECUTE FUNCTION private.require_tender_bid_reviews_before_round_close();
REVOKE ALL ON FUNCTION private.require_tender_bid_reviews_before_round_close() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_tender_bid_review_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project_id bigint;v_role text;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT project_id INTO v_project_id FROM public.project_tenders WHERE id=p_tender_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'TENDER_BID_REVIEW_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'tenderId',p_tender_id,
    'rounds',COALESCE(jsonb_agg(jsonb_build_object(
      'bidRoundId',round.id,'roundNumber',round.round_number,'status',round.status,
      'deadlineAt',round.deadline_at,'openedAt',round.opened_at,'closedAt',round.closed_at,
      'participants',COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'participantId',participant.participant_id,'contractorName',participant.contractor_name,
          'contactEmail',participant.contact_email,'accessStatus',COALESCE(access.status,'NOT_ISSUED'),
          'submission',CASE WHEN submission.id IS NULL THEN NULL ELSE jsonb_build_object(
            'submissionId',submission.id,'submittedAt',submission.submitted_at,
            'currencyCode',submission.currency_code,'total',submission.total,
            'lineCount',submission.line_count,'pricedLineCount',submission.priced_line_count,
            'missingLineCount',submission.line_count-submission.priced_line_count,
            'reviewStatus',COALESCE(review.status,'NOT_STARTED'),'reviewRevision',COALESCE(review.revision,0),
            'reviewedAt',review.reviewed_at,
            'items',COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'lineId',item.line_id,'workGroupId',source.work_group_id,
                'disciplineCode',discipline.code,'disciplineLabel',discipline.label,
                'workGroupCode',work_group.code,'workGroupLabel',work_group.label,
                'description',source.description,'unit',source.unit,'quantity',item.quantity,
                'unitRate',item.unit_rate,'lineTotal',item.line_total,'bidderNote',item.bidder_note,
                'previousUnitRate',previous_item.unit_rate,
                'changeType',CASE
                  WHEN prior_submission.id IS NULL THEN 'FIRST_ROUND'
                  WHEN previous_item.unit_rate IS NULL AND item.unit_rate IS NOT NULL THEN 'NEWLY_PRICED'
                  WHEN previous_item.unit_rate IS NOT NULL AND item.unit_rate IS NULL THEN 'PRICE_REMOVED'
                  WHEN previous_item.unit_rate IS DISTINCT FROM item.unit_rate THEN 'RATE_CHANGED'
                  ELSE 'UNCHANGED' END,
                'sortOrder',source.sort_order
              ) ORDER BY discipline.display_order,work_group.display_order,source.sort_order,source.line_id)
              FROM public.project_tender_bid_submission_items item
              JOIN public.project_boq_items source ON source.boq_version_id=setup.issued_boq_version_id AND source.line_id=item.line_id
              JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=round.ontology_version_id AND work_group.id=source.work_group_id
              JOIN public.work_ontology_disciplines discipline ON discipline.ontology_version_id=round.ontology_version_id AND discipline.id=work_group.discipline_id
              LEFT JOIN public.project_tender_bid_rounds prior_round ON prior_round.tender_id=round.tender_id AND prior_round.round_number=round.round_number-1
              LEFT JOIN public.project_tender_bid_submissions prior_submission ON prior_submission.bid_round_id=prior_round.id AND prior_submission.participant_id=participant.participant_id
              LEFT JOIN public.project_tender_bid_submission_items previous_item ON previous_item.bid_submission_id=prior_submission.id AND previous_item.line_id=item.line_id
              WHERE item.bid_submission_id=submission.id
            ),'[]'::jsonb)
          ) END
        ) ORDER BY participant.contractor_name,participant.participant_id)
        FROM public.project_tender_participants participant
        LEFT JOIN public.project_tender_bidder_access access ON access.tender_id=round.tender_id AND access.tender_setup_version_id=round.tender_setup_version_id AND access.participant_id=participant.participant_id
        LEFT JOIN public.project_tender_bid_submissions submission ON submission.bid_round_id=round.id AND submission.participant_id=participant.participant_id
        LEFT JOIN public.project_tender_bid_reviews review ON review.bid_submission_id=submission.id
        WHERE participant.tender_setup_version_id=round.tender_setup_version_id AND access.status='ACCEPTED'
      ),'[]'::jsonb)
    ) ORDER BY round.round_number),'[]'::jsonb)
  ) INTO v_result
  FROM public.project_tender_bid_rounds round
  JOIN public.project_tender_setup_versions setup ON setup.id=round.tender_setup_version_id
  WHERE round.tender_id=p_tender_id;
  RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.set_tender_bid_review_status(
  p_bid_submission_id bigint,p_status text,p_expected_revision integer,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_submission public.project_tender_bid_submissions%ROWTYPE;v_review public.project_tender_bid_reviews%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_next integer;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_bid_submission_id IS NULL OR p_status NOT IN('IN_REVIEW','REVIEWED') OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_TENDER_BID_REVIEW_COMMAND' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_submission FROM public.project_tender_bid_submissions WHERE id=p_bid_submission_id;
  IF v_submission.id IS NULL THEN RAISE EXCEPTION 'BID_SUBMISSION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_submission.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_BID_REVIEW_FORBIDDEN' USING ERRCODE='42501';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
    VALUES(v_uid,'tender.set_bid_review_status',p_client_request_id,v_submission.project_id)
    ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.set_bid_review_status' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_submission.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT * INTO v_review FROM public.project_tender_bid_reviews WHERE bid_submission_id=v_submission.id FOR UPDATE;
  IF COALESCE(v_review.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'TENDER_BID_REVIEW_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  v_next:=p_expected_revision+1;
  INSERT INTO public.project_tender_bid_reviews(bid_submission_id,bid_round_id,tender_id,project_id,participant_id,status,revision,reviewed_by,reviewed_at,updated_at)
    VALUES(v_submission.id,v_submission.bid_round_id,v_submission.tender_id,v_submission.project_id,v_submission.participant_id,p_status,v_next,v_uid,CASE WHEN p_status='REVIEWED' THEN now() ELSE NULL END,now())
    ON CONFLICT(bid_submission_id)DO UPDATE SET status=excluded.status,revision=excluded.revision,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,updated_at=excluded.updated_at;
  v_result:=jsonb_build_object('submissionId',v_submission.id,'status',p_status,'reviewRevision',v_next,'reviewedAt',CASE WHEN p_status='REVIEWED' THEN now() ELSE NULL END);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.get_tender_bid_review_workspace(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.set_tender_bid_review_status(bigint,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tender_bid_review_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tender_bid_review_status(bigint,text,integer,uuid) TO authenticated;
