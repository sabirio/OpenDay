-- 077_tender_comparison_read_model.sql
-- Roadmap Phase D.22: PM-only deterministic comparison inputs over immutable submissions.
-- The application comparison engine performs exact-decimal metrics; this RPC performs no recommendation or award.

CREATE OR REPLACE FUNCTION public.get_tender_comparison_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project_id bigint;v_role text;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT project_id INTO v_project_id FROM public.project_tenders WHERE id=p_tender_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_COMPARISON_FORBIDDEN' USING ERRCODE='42501';END IF;

  SELECT jsonb_build_object('tenderId',p_tender_id,'calculationContract','EXACT_DECIMAL_V1','rounds',COALESCE(jsonb_agg(jsonb_build_object(
    'bidRoundId',round.id,'roundNumber',round.round_number,'status',round.status,'deadlineAt',round.deadline_at,
    'participants',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'participantId',participant.participant_id,'contractorName',participant.contractor_name,
      'submission',CASE WHEN submission.id IS NULL THEN NULL ELSE jsonb_build_object(
        'submissionId',submission.id,'submittedAt',submission.submitted_at,'currencyCode',submission.currency_code,
        'total',submission.total,'lineCount',submission.line_count,'pricedLineCount',submission.priced_line_count,
        'missingLineCount',submission.line_count-submission.priced_line_count,
        'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'lineId',submission_item.line_id,'disciplineId',discipline.id,'disciplineCode',discipline.code,'disciplineLabel',discipline.label,
          'workGroupId',work_group.id,'workGroupCode',work_group.code,'workGroupLabel',work_group.label,
          'description',source.description,'unit',source.unit,'quantity',submission_item.quantity,
          'unitRate',submission_item.unit_rate,'lineTotal',submission_item.line_total,
          'previousUnitRate',previous_item.unit_rate,
          'changeType',CASE WHEN prior_submission.id IS NULL THEN 'FIRST_ROUND'
            WHEN previous_item.unit_rate IS NULL AND submission_item.unit_rate IS NOT NULL THEN 'NEWLY_PRICED'
            WHEN previous_item.unit_rate IS NOT NULL AND submission_item.unit_rate IS NULL THEN 'PRICE_REMOVED'
            WHEN previous_item.unit_rate IS DISTINCT FROM submission_item.unit_rate THEN 'RATE_CHANGED' ELSE 'UNCHANGED' END,
          'sortOrder',source.sort_order
        )ORDER BY discipline.display_order,work_group.display_order,source.sort_order,source.line_id)
        FROM public.project_tender_bid_submission_items submission_item
        JOIN public.project_boq_items source ON source.boq_version_id=setup.issued_boq_version_id AND source.line_id=submission_item.line_id
        JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=round.ontology_version_id AND work_group.id=source.work_group_id
        JOIN public.work_ontology_disciplines discipline ON discipline.ontology_version_id=round.ontology_version_id AND discipline.id=work_group.discipline_id
        LEFT JOIN public.project_tender_bid_rounds prior_round ON prior_round.tender_id=round.tender_id AND prior_round.round_number=round.round_number-1
        LEFT JOIN public.project_tender_bid_submissions prior_submission ON prior_submission.bid_round_id=prior_round.id AND prior_submission.participant_id=participant.participant_id
        LEFT JOIN public.project_tender_bid_submission_items previous_item ON previous_item.bid_submission_id=prior_submission.id AND previous_item.line_id=submission_item.line_id
        WHERE submission_item.bid_submission_id=submission.id),'[]'::jsonb)
      )END
    )ORDER BY participant.contractor_name,participant.participant_id)
    FROM public.project_tender_participants participant
    LEFT JOIN public.project_tender_bid_submissions submission ON submission.bid_round_id=round.id AND submission.participant_id=participant.participant_id
    WHERE participant.tender_setup_version_id=round.tender_setup_version_id
      AND EXISTS(SELECT 1 FROM public.project_tender_bidder_access access WHERE access.tender_id=round.tender_id AND access.participant_id=participant.participant_id AND access.tender_setup_version_id=round.tender_setup_version_id AND access.status='ACCEPTED')),'[]'::jsonb)
  )ORDER BY round.round_number),'[]'::jsonb)) INTO v_result
  FROM public.project_tender_bid_rounds round
  JOIN public.project_tender_setup_versions setup ON setup.id=round.tender_setup_version_id
  WHERE round.tender_id=p_tender_id;
  RETURN v_result;
END;$$;

REVOKE ALL ON FUNCTION public.get_tender_comparison_workspace(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tender_comparison_workspace(uuid) TO authenticated;
