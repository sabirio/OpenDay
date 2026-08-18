-- 130_award_boq_commercial_baseline.sql
-- Roadmap phase 13: selected immutable Bid -> Award BOQ -> frozen Commercial Baseline.

BEGIN;

ALTER TABLE public.project_tender_awarded_boq_items
  ADD COLUMN IF NOT EXISTS line_origin text NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN IF NOT EXISTS labour_rate numeric(20,6),
  ADD COLUMN IF NOT EXISTS material_rate numeric(20,6);
ALTER TABLE public.project_tender_awarded_boq_items
  DROP CONSTRAINT IF EXISTS project_tender_awarded_boq_items_line_origin_check,
  DROP CONSTRAINT IF EXISTS project_tender_awarded_boq_items_labour_rate_check,
  DROP CONSTRAINT IF EXISTS project_tender_awarded_boq_items_material_rate_check;
ALTER TABLE public.project_tender_awarded_boq_items
  ADD CONSTRAINT project_tender_awarded_boq_items_line_origin_check CHECK(line_origin IN('ISSUED','CONTRACTOR_ADDED')),
  ADD CONSTRAINT project_tender_awarded_boq_items_labour_rate_check CHECK(labour_rate IS NULL OR labour_rate>=0),
  ADD CONSTRAINT project_tender_awarded_boq_items_material_rate_check CHECK(material_rate IS NULL OR material_rate>=0);

CREATE TABLE IF NOT EXISTS public.project_commercial_baselines(
  id uuid PRIMARY KEY,
  award_id uuid NOT NULL UNIQUE REFERENCES public.project_tender_awards(id)ON DELETE RESTRICT,
  tender_id uuid NOT NULL UNIQUE,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
  baseline_value numeric(24,2)NOT NULL CHECK(baseline_value>=0),
  source_kind text NOT NULL CHECK(source_kind='TENDER_AWARD'),
  frozen_by uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id,ontology_version_id),
  FOREIGN KEY(award_id,tender_id,project_id,ontology_version_id)REFERENCES public.project_tender_awards(id,tender_id,project_id,ontology_version_id)ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.project_commercial_baseline_cost_packages(
  baseline_id uuid NOT NULL REFERENCES public.project_commercial_baselines(id)ON DELETE RESTRICT,
  cost_package_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  baseline_value numeric(24,2)NOT NULL CHECK(baseline_value>=0),
  work_group_count integer NOT NULL CHECK(work_group_count>0),
  PRIMARY KEY(baseline_id,cost_package_id),
  FOREIGN KEY(cost_package_id,project_id,ontology_version_id)REFERENCES public.project_cost_packages(id,project_id,ontology_version_id)ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.project_commercial_baseline_events(
  id bigserial PRIMARY KEY,baseline_id uuid NOT NULL REFERENCES public.project_commercial_baselines(id)ON DELETE RESTRICT,
  project_id bigint NOT NULL,event_type text NOT NULL CHECK(event_type='FROZEN'),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(baseline_id,event_type)
);

CREATE OR REPLACE FUNCTION private.prevent_commercial_baseline_mutation()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION'COMMERCIAL_BASELINE_IMMUTABLE'USING ERRCODE='55000';END;$$;
DROP TRIGGER IF EXISTS project_commercial_baselines_immutable ON public.project_commercial_baselines;
CREATE TRIGGER project_commercial_baselines_immutable BEFORE UPDATE OR DELETE ON public.project_commercial_baselines FOR EACH ROW EXECUTE FUNCTION private.prevent_commercial_baseline_mutation();
DROP TRIGGER IF EXISTS project_commercial_baseline_cost_packages_immutable ON public.project_commercial_baseline_cost_packages;
CREATE TRIGGER project_commercial_baseline_cost_packages_immutable BEFORE UPDATE OR DELETE ON public.project_commercial_baseline_cost_packages FOR EACH ROW EXECUTE FUNCTION private.prevent_commercial_baseline_mutation();
DROP TRIGGER IF EXISTS project_commercial_baseline_events_immutable ON public.project_commercial_baseline_events;
CREATE TRIGGER project_commercial_baseline_events_immutable BEFORE UPDATE OR DELETE ON public.project_commercial_baseline_events FOR EACH ROW EXECUTE FUNCTION private.prevent_commercial_baseline_mutation();
REVOKE ALL ON FUNCTION private.prevent_commercial_baseline_mutation()FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.project_commercial_baselines ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_commercial_baseline_cost_packages ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_commercial_baseline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_commercial_baselines_read ON public.project_commercial_baselines FOR SELECT TO authenticated USING(public.can_view_own_project_row(project_id,(SELECT project.company_id FROM public.projects project WHERE project.id=project_commercial_baselines.project_id)));
CREATE POLICY project_commercial_baseline_cost_packages_read ON public.project_commercial_baseline_cost_packages FOR SELECT TO authenticated USING(public.has_project_capability(project_id,'TENDER_MANAGE',cost_package_id)OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)OR public.has_project_capability(project_id,'EXECUTIVE_SUMMARY',cost_package_id));
CREATE POLICY project_commercial_baseline_events_read ON public.project_commercial_baseline_events FOR SELECT TO authenticated USING(public.can_view_own_project_row(project_id,(SELECT project.company_id FROM public.projects project WHERE project.id=project_commercial_baseline_events.project_id)));
REVOKE ALL ON TABLE public.project_commercial_baselines,public.project_commercial_baseline_cost_packages,public.project_commercial_baseline_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_commercial_baselines,public.project_commercial_baseline_cost_packages,public.project_commercial_baseline_events TO authenticated;
REVOKE ALL ON SEQUENCE public.project_commercial_baseline_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.can_approve_tender(p_tender_id uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.project_tenders tender WHERE tender.id=p_tender_id)
    AND EXISTS(SELECT 1 FROM public.project_tender_cost_packages link WHERE link.tender_id=p_tender_id)
    AND NOT EXISTS(SELECT 1 FROM public.project_tender_cost_packages link WHERE link.tender_id=p_tender_id AND public.has_project_capability(link.project_id,'COMMERCIAL_APPROVE',link.cost_package_id)IS NOT TRUE)
$$;
REVOKE ALL ON FUNCTION private.can_approve_tender(uuid)FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.award_project_tender(p_bid_submission_id bigint,p_award_note text,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_submission public.project_tender_bid_submissions%ROWTYPE;v_tender public.project_tenders%ROWTYPE;v_round public.project_tender_bid_rounds%ROWTYPE;v_review public.project_tender_bid_reviews%ROWTYPE;v_participant public.project_tender_participants%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_award_id uuid:=gen_random_uuid();v_baseline_id uuid:=gen_random_uuid();v_count integer;v_total numeric(24,2);v_group_count integer;v_mapped_group_count integer;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION'Authentication required'USING ERRCODE='28000';END IF;
  IF p_bid_submission_id IS NULL OR p_award_note IS NULL OR btrim(p_award_note)=''OR char_length(btrim(p_award_note))>4000 OR p_client_request_id IS NULL THEN RAISE EXCEPTION'INVALID_TENDER_AWARD_COMMAND'USING ERRCODE='22023';END IF;
  SELECT*INTO v_submission FROM public.project_tender_bid_submissions WHERE id=p_bid_submission_id;IF v_submission.id IS NULL THEN RAISE EXCEPTION'BID_SUBMISSION_NOT_FOUND'USING ERRCODE='P0002';END IF;
  IF private.can_approve_tender(v_submission.tender_id)IS NOT TRUE THEN RAISE EXCEPTION'TENDER_AWARD_FORBIDDEN'USING ERRCODE='42501';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.award',p_client_request_id,v_submission.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.award'AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_submission.project_id THEN RAISE EXCEPTION'Idempotency key belongs to another project'USING ERRCODE='23505';END IF;IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT*INTO v_tender FROM public.project_tenders WHERE id=v_submission.tender_id FOR UPDATE;IF v_tender.status='AWARDED'OR EXISTS(SELECT 1 FROM public.project_tender_awards WHERE tender_id=v_tender.id)THEN RAISE EXCEPTION'TENDER_ALREADY_AWARDED'USING ERRCODE='55000';END IF;
  SELECT*INTO v_round FROM public.project_tender_bid_rounds WHERE tender_id=v_tender.id ORDER BY round_number DESC LIMIT 1 FOR UPDATE;
  IF v_round.id IS NULL OR v_round.id<>v_submission.bid_round_id OR v_round.status<>'OPEN'THEN RAISE EXCEPTION'TENDER_AWARD_REQUIRES_LATEST_OPEN_ROUND'USING ERRCODE='55000';END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_bid_submission_items item WHERE item.bid_submission_id=v_submission.id AND item.line_action='INCLUDED'AND(item.quantity IS NULL OR item.unit_rate IS NULL))THEN RAISE EXCEPTION'TENDER_AWARD_REQUIRES_FULLY_PRICED_BID'USING ERRCODE='55000';END IF;
  SELECT*INTO v_review FROM public.project_tender_bid_reviews WHERE bid_submission_id=v_submission.id;IF v_review.status IS DISTINCT FROM'REVIEWED'THEN RAISE EXCEPTION'TENDER_AWARD_REQUIRES_REVIEWED_BID'USING ERRCODE='55000';END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_clarifications WHERE bid_submission_id=v_submission.id AND status NOT IN('RESOLVED','CLOSED'))THEN RAISE EXCEPTION'TENDER_AWARD_REQUIRES_CLOSED_CLARIFICATIONS'USING ERRCODE='55000';END IF;
  SELECT*INTO v_participant FROM public.project_tender_participants WHERE tender_setup_version_id=v_submission.tender_setup_version_id AND participant_id=v_submission.participant_id;
  IF NOT EXISTS(SELECT 1 FROM public.project_tender_bidder_access WHERE tender_id=v_submission.tender_id AND participant_id=v_submission.participant_id AND status='ACCEPTED')THEN RAISE EXCEPTION'TENDER_AWARD_REQUIRES_ACCEPTED_BIDDER'USING ERRCODE='55000';END IF;
  UPDATE public.project_tender_bid_rounds SET status='CLOSED',closed_at=now()WHERE id=v_round.id;
  INSERT INTO public.project_tender_awards(id,tender_id,bid_round_id,bid_submission_id,tender_setup_version_id,project_id,ontology_version_id,participant_id,bidder_user_id,contractor_name,currency_code,contract_value,award_note,awarded_by)VALUES(v_award_id,v_submission.tender_id,v_submission.bid_round_id,v_submission.id,v_submission.tender_setup_version_id,v_submission.project_id,v_submission.ontology_version_id,v_submission.participant_id,v_submission.bidder_user_id,v_participant.contractor_name,v_submission.currency_code,v_submission.total,btrim(p_award_note),v_uid);
  INSERT INTO public.project_tender_awarded_boq_items(award_id,line_id,work_group_id,item_kind,standard_definition_id,description,unit,quantity,unit_rate,labour_rate,material_rate,line_origin,bidder_note,sort_order)
    SELECT v_award_id,item.line_id,COALESCE(item.work_group_id,source.work_group_id),CASE WHEN item.line_origin='CONTRACTOR_ADDED'THEN'CUSTOM'ELSE COALESCE(source.item_kind,'CUSTOM')END,CASE WHEN item.line_origin='CONTRACTOR_ADDED'THEN NULL ELSE source.standard_definition_id END,COALESCE(item.description,source.description),COALESCE(item.unit,source.unit),item.quantity,item.unit_rate,item.labour_rate,item.material_rate,item.line_origin,item.bidder_note,COALESCE(item.sort_order,source.sort_order,0)
    FROM public.project_tender_bid_submission_items item JOIN public.project_tender_setup_versions setup ON setup.id=v_submission.tender_setup_version_id LEFT JOIN public.project_boq_items source ON source.boq_version_id=setup.issued_boq_version_id AND source.line_id=item.line_id WHERE item.bid_submission_id=v_submission.id AND item.line_action='INCLUDED';
  SELECT count(*),COALESCE(sum(line_total),0)INTO v_count,v_total FROM public.project_tender_awarded_boq_items WHERE award_id=v_award_id;IF v_count=0 OR v_total<>v_submission.total THEN RAISE EXCEPTION'TENDER_AWARD_SNAPSHOT_TOTAL_MISMATCH'USING ERRCODE='23514';END IF;
  INSERT INTO public.project_tender_awarded_work_groups(award_id,ontology_version_id,work_group_id,line_count,awarded_total)SELECT v_award_id,v_submission.ontology_version_id,work_group_id,count(*),sum(line_total)FROM public.project_tender_awarded_boq_items WHERE award_id=v_award_id GROUP BY work_group_id;
  SELECT count(*)INTO v_group_count FROM public.project_tender_awarded_work_groups WHERE award_id=v_award_id;
  SELECT count(*)INTO v_mapped_group_count FROM public.project_tender_awarded_work_groups awarded_group JOIN public.project_cost_package_work_groups package_scope ON package_scope.project_id=v_submission.project_id AND package_scope.work_group_id=awarded_group.work_group_id JOIN public.project_tender_cost_packages tender_package ON tender_package.tender_id=v_submission.tender_id AND tender_package.cost_package_id=package_scope.cost_package_id WHERE awarded_group.award_id=v_award_id;
  IF v_mapped_group_count<>v_group_count THEN RAISE EXCEPTION'AWARD_COST_PACKAGE_SCOPE_MISMATCH'USING ERRCODE='23514';END IF;
  INSERT INTO public.project_commercial_baselines(id,award_id,tender_id,project_id,ontology_version_id,currency_code,baseline_value,source_kind,frozen_by)VALUES(v_baseline_id,v_award_id,v_submission.tender_id,v_submission.project_id,v_submission.ontology_version_id,v_submission.currency_code,v_submission.total,'TENDER_AWARD',v_uid);
  INSERT INTO public.project_commercial_baseline_cost_packages(baseline_id,cost_package_id,project_id,ontology_version_id,baseline_value,work_group_count)
    SELECT v_baseline_id,package_scope.cost_package_id,v_submission.project_id,v_submission.ontology_version_id,sum(awarded_group.awarded_total),count(*)FROM public.project_tender_awarded_work_groups awarded_group JOIN public.project_cost_package_work_groups package_scope ON package_scope.project_id=v_submission.project_id AND package_scope.work_group_id=awarded_group.work_group_id JOIN public.project_tender_cost_packages tender_package ON tender_package.tender_id=v_submission.tender_id AND tender_package.cost_package_id=package_scope.cost_package_id WHERE awarded_group.award_id=v_award_id GROUP BY package_scope.cost_package_id;
  IF(SELECT sum(baseline_value)FROM public.project_commercial_baseline_cost_packages WHERE baseline_id=v_baseline_id)<>v_submission.total THEN RAISE EXCEPTION'COMMERCIAL_BASELINE_RECONCILIATION_FAILED'USING ERRCODE='23514';END IF;
  INSERT INTO public.project_commercial_baseline_events(baseline_id,project_id,event_type,snapshot,actor_id)VALUES(v_baseline_id,v_submission.project_id,'FROZEN',jsonb_build_object('awardId',v_award_id,'tenderId',v_submission.tender_id,'bidSubmissionId',v_submission.id,'currencyCode',v_submission.currency_code,'baselineValue',v_submission.total,'costPackageCount',(SELECT count(*)FROM public.project_commercial_baseline_cost_packages WHERE baseline_id=v_baseline_id)),v_uid);
  UPDATE public.project_tenders SET status='AWARDED'WHERE id=v_tender.id;
  v_result:=jsonb_build_object('awardId',v_award_id,'commercialBaselineId',v_baseline_id,'tenderId',v_tender.id,'bidSubmissionId',v_submission.id,'contractorName',v_participant.contractor_name,'currencyCode',v_submission.currency_code,'contractValue',v_submission.total,'lineCount',v_count,'workGroupCount',v_group_count,'costPackageCount',(SELECT count(*)FROM public.project_commercial_baseline_cost_packages WHERE baseline_id=v_baseline_id),'awardedAt',now());UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.get_tender_award_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_tender public.project_tenders%ROWTYPE;v_round public.project_tender_bid_rounds%ROWTYPE;v_award public.project_tender_awards%ROWTYPE;v_baseline public.project_commercial_baselines%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION'Authentication required'USING ERRCODE='28000';END IF;SELECT*INTO v_tender FROM public.project_tenders WHERE id=p_tender_id;IF v_tender.id IS NULL THEN RAISE EXCEPTION'TENDER_NOT_FOUND'USING ERRCODE='P0002';END IF;
  IF public.has_project_capability(v_tender.project_id,'TENDER_MANAGE',NULL)IS NOT TRUE AND private.can_approve_tender(p_tender_id)IS NOT TRUE THEN RAISE EXCEPTION'TENDER_AWARD_FORBIDDEN'USING ERRCODE='42501';END IF;
  SELECT*INTO v_round FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id ORDER BY round_number DESC LIMIT 1;SELECT*INTO v_award FROM public.project_tender_awards WHERE tender_id=p_tender_id;SELECT*INTO v_baseline FROM public.project_commercial_baselines WHERE tender_id=p_tender_id;
  SELECT jsonb_build_object('tenderId',p_tender_id,'tenderStatus',v_tender.status,'canApprove',private.can_approve_tender(p_tender_id),'latestRound',CASE WHEN v_round.id IS NULL THEN NULL ELSE jsonb_build_object('bidRoundId',v_round.id,'roundNumber',v_round.round_number,'status',v_round.status)END,
    'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('participantId',participant.participant_id,'contractorName',participant.contractor_name,'submissionId',submission.id,'submitted',submission.id IS NOT NULL,'currencyCode',submission.currency_code,'total',submission.total,'lineCount',submission.line_count,'pricedLineCount',submission.priced_line_count,
      'missingLineCount',CASE WHEN submission.id IS NULL THEN NULL ELSE(SELECT count(*)FROM public.project_tender_bid_submission_items item WHERE item.bid_submission_id=submission.id AND item.line_action='INCLUDED'AND(item.quantity IS NULL OR item.unit_rate IS NULL))END,
      'excludedLineCount',CASE WHEN submission.id IS NULL THEN NULL ELSE(SELECT count(*)FROM public.project_tender_bid_submission_items item WHERE item.bid_submission_id=submission.id AND item.line_action='EXCLUDED')END,
      'contractorAddedLineCount',CASE WHEN submission.id IS NULL THEN NULL ELSE(SELECT count(*)FROM public.project_tender_bid_submission_items item WHERE item.bid_submission_id=submission.id AND item.line_origin='CONTRACTOR_ADDED')END,
      'reviewStatus',COALESCE(review.status,'NOT_STARTED'),'openClarificationCount',COALESCE((SELECT count(*)FROM public.project_tender_clarifications clarification WHERE clarification.bid_submission_id=submission.id AND clarification.status NOT IN('RESOLVED','CLOSED')),0),
      'eligible',submission.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_tender_bid_submission_items item WHERE item.bid_submission_id=submission.id AND item.line_action='INCLUDED'AND(item.quantity IS NULL OR item.unit_rate IS NULL))AND review.status='REVIEWED'AND NOT EXISTS(SELECT 1 FROM public.project_tender_clarifications clarification WHERE clarification.bid_submission_id=submission.id AND clarification.status NOT IN('RESOLVED','CLOSED'))
    )ORDER BY participant.contractor_name,participant.participant_id)FROM public.project_tender_participants participant LEFT JOIN public.project_tender_bid_submissions submission ON submission.bid_round_id=v_round.id AND submission.participant_id=participant.participant_id LEFT JOIN public.project_tender_bid_reviews review ON review.bid_submission_id=submission.id WHERE participant.tender_setup_version_id=v_round.tender_setup_version_id AND EXISTS(SELECT 1 FROM public.project_tender_bidder_access access WHERE access.tender_id=p_tender_id AND access.participant_id=participant.participant_id AND access.status='ACCEPTED')),'[]'::jsonb),
    'award',CASE WHEN v_award.id IS NULL THEN NULL ELSE jsonb_build_object('awardId',v_award.id,'commercialBaselineId',v_baseline.id,'bidSubmissionId',v_award.bid_submission_id,'roundNumber',(SELECT round_number FROM public.project_tender_bid_rounds WHERE id=v_award.bid_round_id),'participantId',v_award.participant_id,'contractorName',v_award.contractor_name,'currencyCode',v_award.currency_code,'contractValue',v_award.contract_value,'awardNote',v_award.award_note,'awardedAt',v_award.awarded_at,'baselineFrozenAt',v_baseline.frozen_at,
      'lineCount',(SELECT count(*)FROM public.project_tender_awarded_boq_items item WHERE item.award_id=v_award.id),'workGroupCount',(SELECT count(*)FROM public.project_tender_awarded_work_groups work_group WHERE work_group.award_id=v_award.id),
      'costPackages',COALESCE((SELECT jsonb_agg(jsonb_build_object('costPackageId',link.cost_package_id,'costPackageCode',package.code,'costPackageName',package.name,'baselineValue',link.baseline_value,'workGroupCount',link.work_group_count)ORDER BY package.code)FROM public.project_commercial_baseline_cost_packages link JOIN public.project_cost_packages package ON package.id=link.cost_package_id WHERE link.baseline_id=v_baseline.id),'[]'::jsonb),
      'workGroups',COALESCE((SELECT jsonb_agg(jsonb_build_object('workGroupId',snapshot.work_group_id,'workGroupCode',work_group.code,'workGroupLabel',work_group.label,'lineCount',snapshot.line_count,'awardedTotal',snapshot.awarded_total)ORDER BY discipline.display_order,work_group.display_order)FROM public.project_tender_awarded_work_groups snapshot JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=snapshot.ontology_version_id AND work_group.id=snapshot.work_group_id JOIN public.work_ontology_disciplines discipline ON discipline.ontology_version_id=snapshot.ontology_version_id AND discipline.id=work_group.discipline_id WHERE snapshot.award_id=v_award.id),'[]'::jsonb))END)INTO v_result;RETURN v_result;
END;$$;

REVOKE ALL ON FUNCTION public.award_project_tender(bigint,text,uuid),public.get_tender_award_workspace(uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.award_project_tender(bigint,text,uuid),public.get_tender_award_workspace(uuid)TO authenticated;

COMMIT;
