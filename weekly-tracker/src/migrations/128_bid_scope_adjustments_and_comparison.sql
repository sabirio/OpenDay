-- 128_bid_scope_adjustments_and_comparison.sql
-- Roadmap phases 10-11: immutable bid snapshots preserve contractor-added and
-- contractor-excluded lines. Comparison consumes the snapshot metadata rather
-- than assuming that every submitted line still exists in the issued BOQ.

BEGIN;

ALTER TABLE public.project_tender_bid_draft_items
  ADD COLUMN IF NOT EXISTS work_group_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS line_origin text NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN IF NOT EXISTS line_action text NOT NULL DEFAULT 'INCLUDED';

ALTER TABLE public.project_tender_bid_submission_items
  ADD COLUMN IF NOT EXISTS work_group_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS line_origin text NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN IF NOT EXISTS line_action text NOT NULL DEFAULT 'INCLUDED';

ALTER TABLE public.project_tender_bid_draft_items
  DROP CONSTRAINT IF EXISTS project_tender_bid_draft_items_line_origin_check,
  DROP CONSTRAINT IF EXISTS project_tender_bid_draft_items_line_action_check;
ALTER TABLE public.project_tender_bid_draft_items
  ADD CONSTRAINT project_tender_bid_draft_items_line_origin_check CHECK (line_origin IN ('ISSUED','CONTRACTOR_ADDED')),
  ADD CONSTRAINT project_tender_bid_draft_items_line_action_check CHECK (line_action IN ('INCLUDED','EXCLUDED'));

ALTER TABLE public.project_tender_bid_submission_items
  DROP CONSTRAINT IF EXISTS project_tender_bid_submission_items_line_origin_check,
  DROP CONSTRAINT IF EXISTS project_tender_bid_submission_items_line_action_check;
ALTER TABLE public.project_tender_bid_submission_items
  ADD CONSTRAINT project_tender_bid_submission_items_line_origin_check CHECK (line_origin IN ('ISSUED','CONTRACTOR_ADDED')),
  ADD CONSTRAINT project_tender_bid_submission_items_line_action_check CHECK (line_action IN ('INCLUDED','EXCLUDED'));

-- Historical submission rows are deliberately not backfilled or rewritten.
-- Their issued-line metadata remains available through the frozen BOQ snapshot.

CREATE OR REPLACE FUNCTION public.get_my_tender_bid_round_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;v_round public.project_tender_bid_rounds%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_draft public.project_tender_bid_drafts%ROWTYPE;v_previous_submission_id bigint;v_submission_id bigint;v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id AND status='OPEN' ORDER BY round_number DESC LIMIT 1;
  IF v_round.id IS NULL THEN RETURN NULL;END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=p_tender_id AND bidder_user_id=v_uid AND status='ACCEPTED' AND tender_setup_version_id=v_round.tender_setup_version_id;
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_round.tender_setup_version_id;
  SELECT * INTO v_draft FROM public.project_tender_bid_drafts WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id;
  SELECT id INTO v_submission_id FROM public.project_tender_bid_submissions WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id;
  SELECT submission.id INTO v_previous_submission_id FROM public.project_tender_bid_submissions submission JOIN public.project_tender_bid_rounds prior ON prior.id=submission.bid_round_id WHERE submission.tender_id=p_tender_id AND submission.participant_id=v_access.participant_id AND prior.round_number<v_round.round_number ORDER BY prior.round_number DESC LIMIT 1;

  IF v_draft.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'lineId',item.line_id,'workGroupId',COALESCE(item.work_group_id,source.work_group_id),'description',COALESCE(item.description,source.description),'unit',COALESCE(item.unit,source.unit),
      'lineOrigin',item.line_origin,'lineAction',item.line_action,'contractorQuantity',item.quantity,
      'consultantQuantity',source.consultant_quantity,'labourRate',item.labour_rate,'materialRate',item.material_rate,
      'previousContractorQuantity',previous.quantity,'previousLabourRate',previous.labour_rate,'previousMaterialRate',previous.material_rate,
      'bidderNote',item.bidder_note,'sortOrder',COALESCE(item.sort_order,source.sort_order)
    )ORDER BY COALESCE(item.sort_order,source.sort_order),item.line_id),'[]'::jsonb) INTO v_items
    FROM public.project_tender_bid_draft_items item
    LEFT JOIN public.project_boq_items source ON source.boq_version_id=v_setup.issued_boq_version_id AND source.line_id=item.line_id
    LEFT JOIN public.project_tender_bid_submission_items previous ON previous.bid_submission_id=v_previous_submission_id AND previous.line_id=item.line_id
    WHERE item.bid_draft_id=v_draft.id;
  ELSE
    WITH inherited AS (
      SELECT source.line_id,source.work_group_id,source.description,source.unit,'ISSUED'::text line_origin,
        COALESCE(previous.line_action,'INCLUDED') line_action,
        CASE WHEN previous.id_marker IS NOT NULL THEN previous.quantity ELSE source.quantity END quantity,
        source.consultant_quantity,previous.labour_rate,previous.material_rate,previous.quantity previous_quantity,
        previous.labour_rate previous_labour_rate,previous.material_rate previous_material_rate,
        previous.bidder_note,source.sort_order
      FROM public.project_boq_items source
      JOIN public.project_tender_scope_work_groups scope ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=source.work_group_id
      LEFT JOIN (SELECT item.*,1 id_marker FROM public.project_tender_bid_submission_items item WHERE item.bid_submission_id=v_previous_submission_id) previous ON previous.line_id=source.line_id
      WHERE source.boq_version_id=v_setup.issued_boq_version_id
      UNION ALL
      SELECT added.line_id,added.work_group_id,added.description,added.unit,added.line_origin,added.line_action,
        added.quantity,NULL::numeric,added.labour_rate,added.material_rate,added.quantity,
        added.labour_rate,added.material_rate,added.bidder_note,added.sort_order
      FROM public.project_tender_bid_submission_items added
      WHERE added.bid_submission_id=v_previous_submission_id AND added.line_origin='CONTRACTOR_ADDED'
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'lineId',line_id,'workGroupId',work_group_id,'description',description,'unit',unit,
      'lineOrigin',line_origin,'lineAction',line_action,'contractorQuantity',quantity,
      'consultantQuantity',consultant_quantity,'labourRate',labour_rate,'materialRate',material_rate,
      'previousContractorQuantity',previous_quantity,'previousLabourRate',previous_labour_rate,'previousMaterialRate',previous_material_rate,
      'bidderNote',bidder_note,'sortOrder',sort_order
    )ORDER BY sort_order,line_id),'[]'::jsonb) INTO v_items FROM inherited;
  END IF;
  RETURN jsonb_build_object('bidRoundId',v_round.id,'roundNumber',v_round.round_number,'deadlineAt',v_round.deadline_at,'draftRevision',COALESCE(v_draft.revision,0),'submitted',v_submission_id IS NOT NULL,'currencyCode',v_setup.currency_code,'items',v_items);
END;$$;

CREATE OR REPLACE FUNCTION public.save_my_tender_bid_draft(p_bid_round_id bigint,p_items jsonb,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_round public.project_tender_bid_rounds%ROWTYPE;v_access public.project_tender_bidder_access%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_draft public.project_tender_bid_drafts%ROWTYPE;v_next integer;v_request public.write_command_requests%ROWTYPE;v_result jsonb;v_source_count integer;v_saved_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'EMPTY_BID_DRAFT' USING ERRCODE='22023';END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_BID_DRAFT_COMMAND' USING ERRCODE='22023';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE id=p_bid_round_id FOR UPDATE;
  IF v_round.id IS NULL OR v_round.status<>'OPEN' OR v_round.deadline_at<=now() THEN RAISE EXCEPTION 'BID_ROUND_NOT_OPEN' USING ERRCODE='55000';END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=v_round.tender_id AND bidder_user_id=v_uid AND status='ACCEPTED' AND tender_setup_version_id=v_round.tender_setup_version_id;
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_bid_submissions WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id) THEN RAISE EXCEPTION 'BID_ALREADY_SUBMITTED' USING ERRCODE='55000';END IF;
  IF jsonb_array_length(p_items)>1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item WHERE COALESCE(item->>'lineId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR COALESCE(item->>'lineOrigin','ISSUED') NOT IN('ISSUED','CONTRACTOR_ADDED') OR COALESCE(item->>'lineAction','INCLUDED') NOT IN('INCLUDED','EXCLUDED') OR (NULLIF(item->>'quantity','') IS NOT NULL AND (item->>'quantity'!~'^[0-9]+(?:\.[0-9]+)?$' OR (item->>'quantity')::numeric<=0)) OR (NULLIF(item->>'labourRate','') IS NOT NULL AND (item->>'labourRate'!~'^[0-9]+(?:\.[0-9]+)?$' OR (item->>'labourRate')::numeric<0)) OR (NULLIF(item->>'materialRate','') IS NOT NULL AND (item->>'materialRate'!~'^[0-9]+(?:\.[0-9]+)?$' OR (item->>'materialRate')::numeric<0)) OR length(COALESCE(item->>'bidderNote',''))>4000) THEN RAISE EXCEPTION 'INVALID_BID_DRAFT_ITEM' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item GROUP BY item->>'lineId' HAVING count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_BID_LINE' USING ERRCODE='22023';END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_round.tender_setup_version_id;
  SELECT count(*) INTO v_source_count FROM public.project_boq_items source JOIN public.project_tender_scope_work_groups scope ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=source.work_group_id WHERE source.boq_version_id=v_setup.issued_boq_version_id;
  IF (SELECT count(*) FROM jsonb_array_elements(p_items)item WHERE COALESCE(item->>'lineOrigin','ISSUED')='ISSUED')<>v_source_count
    OR EXISTS(SELECT 1 FROM public.project_boq_items source JOIN public.project_tender_scope_work_groups scope ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=source.work_group_id WHERE source.boq_version_id=v_setup.issued_boq_version_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item WHERE COALESCE(item->>'lineOrigin','ISSUED')='ISSUED' AND (item->>'lineId')::uuid=source.line_id))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item LEFT JOIN public.project_boq_items source ON source.boq_version_id=v_setup.issued_boq_version_id AND source.line_id=(item->>'lineId')::uuid WHERE COALESCE(item->>'lineOrigin','ISSUED')='ISSUED' AND source.line_id IS NULL)
  THEN RAISE EXCEPTION 'BID_SCOPE_MISMATCH' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)item WHERE item->>'lineOrigin'='CONTRACTOR_ADDED' AND (length(btrim(COALESCE(item->>'description','')))<2 OR length(item->>'description')>500 OR length(btrim(COALESCE(item->>'unit','')))<1 OR length(item->>'unit')>50 OR COALESCE(item->>'workGroupId','')!~*'^[0-9a-f-]{36}$' OR NOT EXISTS(SELECT 1 FROM public.project_tender_scope_work_groups scope WHERE scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=(item->>'workGroupId')::uuid))) THEN RAISE EXCEPTION 'INVALID_CONTRACTOR_ADDED_LINE' USING ERRCODE='22023';END IF;

  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.save_bid_draft',p_client_request_id,v_round.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.save_bid_draft' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_round.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT * INTO v_draft FROM public.project_tender_bid_drafts WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id FOR UPDATE;
  IF COALESCE(v_draft.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'BID_DRAFT_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  v_next:=p_expected_revision+1;
  IF v_draft.id IS NULL THEN INSERT INTO public.project_tender_bid_drafts(bid_round_id,tender_id,tender_setup_version_id,project_id,ontology_version_id,participant_id,bidder_user_id,revision)VALUES(v_round.id,v_round.tender_id,v_round.tender_setup_version_id,v_round.project_id,v_round.ontology_version_id,v_access.participant_id,v_uid,v_next)RETURNING * INTO v_draft;
  ELSE UPDATE public.project_tender_bid_drafts SET revision=v_next,updated_at=now() WHERE id=v_draft.id RETURNING * INTO v_draft;DELETE FROM public.project_tender_bid_draft_items WHERE bid_draft_id=v_draft.id;END IF;

  INSERT INTO public.project_tender_bid_draft_items(bid_draft_id,bid_round_id,tender_id,participant_id,line_id,work_group_id,description,unit,sort_order,line_origin,line_action,quantity,unit_rate,labour_rate,material_rate,bidder_note)
  SELECT v_draft.id,v_round.id,v_round.tender_id,v_access.participant_id,(item->>'lineId')::uuid,
    CASE WHEN COALESCE(item->>'lineOrigin','ISSUED')='ISSUED' THEN source.work_group_id ELSE (item->>'workGroupId')::uuid END,
    CASE WHEN COALESCE(item->>'lineOrigin','ISSUED')='ISSUED' THEN source.description ELSE btrim(item->>'description') END,
    CASE WHEN COALESCE(item->>'lineOrigin','ISSUED')='ISSUED' THEN source.unit ELSE btrim(item->>'unit') END,
    CASE WHEN COALESCE(item->>'lineOrigin','ISSUED')='ISSUED' THEN source.sort_order ELSE 100000+ordinal::integer END,
    COALESCE(item->>'lineOrigin','ISSUED'),COALESCE(item->>'lineAction','INCLUDED'),CASE WHEN COALESCE(item->>'lineAction','INCLUDED')='EXCLUDED' THEN NULL ELSE NULLIF(item->>'quantity','')::numeric END,
    CASE WHEN COALESCE(item->>'lineAction','INCLUDED')='EXCLUDED' OR (NULLIF(item->>'labourRate','') IS NULL AND NULLIF(item->>'materialRate','') IS NULL) THEN NULL ELSE COALESCE(NULLIF(item->>'labourRate','')::numeric,0)+COALESCE(NULLIF(item->>'materialRate','')::numeric,0) END,
    CASE WHEN COALESCE(item->>'lineAction','INCLUDED')='EXCLUDED' THEN NULL ELSE NULLIF(item->>'labourRate','')::numeric END,CASE WHEN COALESCE(item->>'lineAction','INCLUDED')='EXCLUDED' THEN NULL ELSE NULLIF(item->>'materialRate','')::numeric END,NULLIF(btrim(COALESCE(item->>'bidderNote','')),'')
  FROM jsonb_array_elements(p_items)WITH ORDINALITY payload(item,ordinal)
  LEFT JOIN public.project_boq_items source ON source.boq_version_id=v_setup.issued_boq_version_id AND source.line_id=(item->>'lineId')::uuid;
  GET DIAGNOSTICS v_saved_count=ROW_COUNT;
  v_result:=jsonb_build_object('bidRoundId',v_round.id,'draftRevision',v_next,'lineCount',v_saved_count,'issuedLineCount',v_source_count,'contractorAddedLineCount',v_saved_count-v_source_count);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.submit_my_tender_bid(p_bid_round_id bigint,p_expected_draft_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_round public.project_tender_bid_rounds%ROWTYPE;v_access public.project_tender_bidder_access%ROWTYPE;v_draft public.project_tender_bid_drafts%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_submission_id bigint;v_count integer;v_priced integer;v_total numeric(24,2);v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE id=p_bid_round_id FOR UPDATE;
  IF v_round.id IS NULL OR v_round.status<>'OPEN' OR v_round.deadline_at<=now() THEN RAISE EXCEPTION 'BID_ROUND_NOT_OPEN' USING ERRCODE='55000';END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=v_round.tender_id AND bidder_user_id=v_uid AND status='ACCEPTED' AND tender_setup_version_id=v_round.tender_setup_version_id;
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  SELECT * INTO v_draft FROM public.project_tender_bid_drafts WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_draft.revision<>p_expected_draft_revision THEN RAISE EXCEPTION 'BID_DRAFT_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.submit_bid',p_client_request_id,v_round.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.submit_bid' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_round.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_bid_submissions WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id) THEN RAISE EXCEPTION 'BID_ALREADY_SUBMITTED' USING ERRCODE='55000';END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_round.tender_setup_version_id;
  SELECT count(*),count(*)FILTER(WHERE line_action='INCLUDED' AND unit_rate IS NOT NULL AND quantity IS NOT NULL),COALESCE(sum(line_total),0) INTO v_count,v_priced,v_total FROM public.project_tender_bid_draft_items WHERE bid_draft_id=v_draft.id;
  INSERT INTO public.project_tender_bid_submissions(bid_round_id,tender_id,tender_setup_version_id,project_id,ontology_version_id,participant_id,bidder_user_id,source_draft_revision,currency_code,priced_line_count,line_count,total) VALUES(v_round.id,v_round.tender_id,v_round.tender_setup_version_id,v_round.project_id,v_round.ontology_version_id,v_access.participant_id,v_uid,v_draft.revision,v_setup.currency_code,v_priced,v_count,v_total)RETURNING id INTO v_submission_id;
  INSERT INTO public.project_tender_bid_submission_items(bid_submission_id,bid_round_id,tender_id,participant_id,line_id,work_group_id,description,unit,sort_order,line_origin,line_action,quantity,unit_rate,labour_rate,material_rate,bidder_note)
    SELECT v_submission_id,v_round.id,v_round.tender_id,v_access.participant_id,line_id,work_group_id,description,unit,sort_order,line_origin,line_action,quantity,unit_rate,labour_rate,material_rate,bidder_note FROM public.project_tender_bid_draft_items WHERE bid_draft_id=v_draft.id;
  v_result:=jsonb_build_object('submissionId',v_submission_id,'bidRoundId',v_round.id,'roundNumber',v_round.round_number,'lineCount',v_count,'pricedLineCount',v_priced,'total',v_total,'currencyCode',v_setup.currency_code,'submittedAt',now());UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.get_tender_comparison_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project_id bigint;v_role text;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT project_id INTO v_project_id FROM public.project_tenders WHERE id=p_tender_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_COMPARISON_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT jsonb_build_object('tenderId',p_tender_id,'calculationContract','EXACT_DECIMAL_V2','comparisonLevel','CANONICAL_CATEGORY','rounds',COALESCE(jsonb_agg(jsonb_build_object(
    'bidRoundId',round.id,'roundNumber',round.round_number,'status',round.status,'deadlineAt',round.deadline_at,
    'participants',COALESCE((SELECT jsonb_agg(jsonb_build_object('participantId',participant.participant_id,'contractorName',participant.contractor_name,
      'submission',CASE WHEN submission.id IS NULL THEN NULL ELSE jsonb_build_object('submissionId',submission.id,'submittedAt',submission.submitted_at,'currencyCode',submission.currency_code,'total',submission.total,'lineCount',submission.line_count,'pricedLineCount',submission.priced_line_count,
        'missingLineCount',(SELECT count(*) FROM public.project_tender_bid_submission_items x WHERE x.bid_submission_id=submission.id AND x.line_action='INCLUDED' AND (x.quantity IS NULL OR x.unit_rate IS NULL)),
        'excludedLineCount',(SELECT count(*) FROM public.project_tender_bid_submission_items x WHERE x.bid_submission_id=submission.id AND x.line_action='EXCLUDED'),
        'contractorAddedLineCount',(SELECT count(*) FROM public.project_tender_bid_submission_items x WHERE x.bid_submission_id=submission.id AND x.line_origin='CONTRACTOR_ADDED'),
        'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'lineId',item.line_id,'disciplineId',discipline.id,'disciplineCode',discipline.code,'disciplineLabel',discipline.label,
          'workGroupId',work_group.id,'workGroupCode',work_group.code,'workGroupLabel',work_group.label,
          'description',COALESCE(item.description,source.description),'unit',COALESCE(item.unit,source.unit),'lineOrigin',item.line_origin,'lineAction',item.line_action,
          'contractorQuantity',item.quantity,'consultantQuantity',source.consultant_quantity,'quantity',item.quantity,
          'labourRate',item.labour_rate,'materialRate',item.material_rate,'unitRate',item.unit_rate,'lineTotal',item.line_total,
          'previousContractorQuantity',previous.quantity,'previousLabourRate',previous.labour_rate,'previousMaterialRate',previous.material_rate,
          'changeType',CASE WHEN item.line_origin='CONTRACTOR_ADDED' AND previous.line_id IS NULL THEN 'LINE_ADDED' WHEN item.line_action='EXCLUDED' AND COALESCE(previous.line_action,'INCLUDED')<>'EXCLUDED' THEN 'LINE_REMOVED' WHEN item.line_action='INCLUDED' AND previous.line_action='EXCLUDED' THEN 'LINE_RESTORED' WHEN prior_submission.id IS NULL THEN 'FIRST_ROUND' WHEN previous.quantity IS DISTINCT FROM item.quantity THEN 'QUANTITY_CHANGED' WHEN previous.labour_rate IS DISTINCT FROM item.labour_rate OR previous.material_rate IS DISTINCT FROM item.material_rate THEN 'RATE_CHANGED' ELSE 'UNCHANGED' END,
          'bidderNote',item.bidder_note,'sortOrder',COALESCE(item.sort_order,source.sort_order)
        )ORDER BY discipline.display_order,work_group.display_order,COALESCE(item.sort_order,source.sort_order),item.line_id)
        FROM public.project_tender_bid_submission_items item
        LEFT JOIN public.project_boq_items source ON source.boq_version_id=setup.issued_boq_version_id AND source.line_id=item.line_id
        JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=round.ontology_version_id AND work_group.id=COALESCE(item.work_group_id,source.work_group_id)
        JOIN public.work_ontology_disciplines discipline ON discipline.ontology_version_id=round.ontology_version_id AND discipline.id=work_group.discipline_id
        LEFT JOIN public.project_tender_bid_rounds prior_round ON prior_round.tender_id=round.tender_id AND prior_round.round_number=round.round_number-1
        LEFT JOIN public.project_tender_bid_submissions prior_submission ON prior_submission.bid_round_id=prior_round.id AND prior_submission.participant_id=participant.participant_id
        LEFT JOIN public.project_tender_bid_submission_items previous ON previous.bid_submission_id=prior_submission.id AND previous.line_id=item.line_id
        WHERE item.bid_submission_id=submission.id),'[]'::jsonb)) END
    )ORDER BY participant.contractor_name,participant.participant_id)
    FROM public.project_tender_participants participant
    LEFT JOIN public.project_tender_bid_submissions submission ON submission.bid_round_id=round.id AND submission.participant_id=participant.participant_id
    WHERE participant.tender_setup_version_id=round.tender_setup_version_id AND EXISTS(SELECT 1 FROM public.project_tender_bidder_access access WHERE access.tender_id=round.tender_id AND access.participant_id=participant.participant_id AND access.tender_setup_version_id=round.tender_setup_version_id AND access.status='ACCEPTED')),'[]'::jsonb)
  )ORDER BY round.round_number),'[]'::jsonb)) INTO v_result
  FROM public.project_tender_bid_rounds round JOIN public.project_tender_setup_versions setup ON setup.id=round.tender_setup_version_id WHERE round.tender_id=p_tender_id;
  RETURN v_result;
END;$$;

REVOKE ALL ON FUNCTION public.get_my_tender_bid_round_workspace(uuid),public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid),public.submit_my_tender_bid(bigint,integer,uuid),public.get_tender_comparison_workspace(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tender_bid_round_workspace(uuid),public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid),public.submit_my_tender_bid(bigint,integer,uuid),public.get_tender_comparison_workspace(uuid) TO authenticated;

COMMIT;
