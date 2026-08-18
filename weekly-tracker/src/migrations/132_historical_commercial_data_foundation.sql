-- 132_historical_commercial_data_foundation.sql
-- Roadmap phase 17: analytics-ready immutable commercial facts without a Historical UI.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_tender_historical_bid_line_facts(
  id bigserial PRIMARY KEY,
  bid_submission_id bigint NOT NULL REFERENCES public.project_tender_bid_submissions(id)ON DELETE RESTRICT,
  bid_round_id bigint NOT NULL REFERENCES public.project_tender_bid_rounds(id)ON DELETE RESTRICT,
  round_number integer NOT NULL CHECK(round_number>0),
  tender_id uuid NOT NULL,project_id bigint NOT NULL,ontology_version_id uuid NOT NULL,
  cost_package_id uuid,work_group_id uuid NOT NULL,line_id uuid NOT NULL,
  procurement_method text NOT NULL,boq_mode text NOT NULL,
  line_origin text NOT NULL,line_action text NOT NULL,description text NOT NULL,unit text NOT NULL,
  consultant_quantity numeric(20,6),contractor_quantity numeric(20,6),
  labour_rate numeric(20,6),material_rate numeric(20,6),unit_rate numeric(20,6),line_total numeric(24,2),currency_code text NOT NULL,
  participant_id uuid NOT NULL,contractor_user_id uuid,contractor_name text NOT NULL,
  consultant_user_id uuid,cost_package_owner_user_id uuid,submitted_at timestamptz NOT NULL,
  UNIQUE(bid_submission_id,line_id)
);

CREATE TABLE IF NOT EXISTS public.project_tender_historical_category_spreads(
  id bigserial PRIMARY KEY,bid_round_id bigint NOT NULL REFERENCES public.project_tender_bid_rounds(id)ON DELETE RESTRICT,
  tender_id uuid NOT NULL,project_id bigint NOT NULL,ontology_version_id uuid NOT NULL,
  cost_package_id uuid,work_group_id uuid NOT NULL,work_group_code text NOT NULL,work_group_name text NOT NULL,
  procurement_method text NOT NULL,currency_code text NOT NULL,bidder_count integer NOT NULL CHECK(bidder_count>0),
  minimum_bid numeric(24,2)NOT NULL,maximum_bid numeric(24,2)NOT NULL,average_bid numeric(24,2)NOT NULL,
  price_spread numeric(24,2)NOT NULL,price_spread_pct numeric(18,6),captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bid_round_id,work_group_id)
);

CREATE TABLE IF NOT EXISTS public.project_cost_package_historical_financial_events(
  id bigserial PRIMARY KEY,project_id bigint NOT NULL,cost_package_id uuid NOT NULL,ontology_version_id uuid NOT NULL,
  event_kind text NOT NULL CHECK(event_kind IN('COMMITMENT_CREATED','ADDITIONAL_WORK_APPROVED','FORECAST_CREATED')),
  source_id uuid NOT NULL,source_kind text NOT NULL,value numeric(24,2)NOT NULL,currency_code text NOT NULL,
  procurement_method text NOT NULL,cost_package_owner_user_id uuid,contractor_user_id uuid,contractor_name text,
  actor_id uuid,metadata jsonb NOT NULL DEFAULT'{}'::jsonb,recorded_at timestamptz NOT NULL,
  UNIQUE(event_kind,source_id)
);

CREATE OR REPLACE FUNCTION private.prevent_historical_commercial_fact_mutation()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION'HISTORICAL_COMMERCIAL_FACT_IMMUTABLE'USING ERRCODE='55000';END;$$;
CREATE TRIGGER historical_bid_line_facts_immutable BEFORE UPDATE OR DELETE ON public.project_tender_historical_bid_line_facts FOR EACH ROW EXECUTE FUNCTION private.prevent_historical_commercial_fact_mutation();
CREATE TRIGGER historical_category_spreads_immutable BEFORE UPDATE OR DELETE ON public.project_tender_historical_category_spreads FOR EACH ROW EXECUTE FUNCTION private.prevent_historical_commercial_fact_mutation();
CREATE TRIGGER historical_financial_events_immutable BEFORE UPDATE OR DELETE ON public.project_cost_package_historical_financial_events FOR EACH ROW EXECUTE FUNCTION private.prevent_historical_commercial_fact_mutation();
REVOKE ALL ON FUNCTION private.prevent_historical_commercial_fact_mutation()FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.cost_package_responsible_user(p_project_id bigint,p_cost_package_id uuid,p_responsibility text,p_at timestamptz)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT membership.user_id FROM public.project_cost_package_responsibilities responsibility
  JOIN public.project_team_memberships membership ON membership.id=responsibility.membership_id
  WHERE responsibility.project_id=p_project_id AND responsibility.cost_package_id=p_cost_package_id
    AND responsibility.responsibility_type=p_responsibility
    AND membership.starts_on<=p_at::date AND(membership.ends_on IS NULL OR membership.ends_on>=p_at::date)
  ORDER BY membership.starts_on DESC,membership.id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.cost_package_responsible_user(bigint,uuid,text,timestamptz)FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.capture_historical_bid_line_fact()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_submission public.project_tender_bid_submissions%ROWTYPE;v_round public.project_tender_bid_rounds%ROWTYPE;v_tender public.project_tenders%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_work_group uuid;v_cost_package uuid;v_description text;v_unit text;v_consultant_quantity numeric;v_contractor_name text;
BEGIN
  SELECT*INTO v_submission FROM public.project_tender_bid_submissions WHERE id=NEW.bid_submission_id;
  SELECT*INTO v_round FROM public.project_tender_bid_rounds WHERE id=NEW.bid_round_id;SELECT*INTO v_tender FROM public.project_tenders WHERE id=NEW.tender_id;SELECT*INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_submission.tender_setup_version_id;
  SELECT COALESCE(NEW.work_group_id,source.work_group_id),COALESCE(NEW.description,source.description),COALESCE(NEW.unit,source.unit),source.consultant_quantity INTO v_work_group,v_description,v_unit,v_consultant_quantity FROM public.project_boq_items source WHERE source.boq_version_id=v_setup.issued_boq_version_id AND source.line_id=NEW.line_id;
  v_work_group:=COALESCE(v_work_group,NEW.work_group_id);v_description:=COALESCE(v_description,NEW.description,'Historical bid line');v_unit:=COALESCE(v_unit,NEW.unit,'L.S.');
  SELECT scope.cost_package_id INTO v_cost_package FROM public.project_cost_package_work_groups scope WHERE scope.project_id=v_submission.project_id AND scope.ontology_version_id=v_submission.ontology_version_id AND scope.work_group_id=v_work_group;
  SELECT participant.contractor_name INTO v_contractor_name FROM public.project_tender_participants participant WHERE participant.tender_setup_version_id=v_submission.tender_setup_version_id AND participant.participant_id=NEW.participant_id;
  INSERT INTO public.project_tender_historical_bid_line_facts(bid_submission_id,bid_round_id,round_number,tender_id,project_id,ontology_version_id,cost_package_id,work_group_id,line_id,procurement_method,boq_mode,line_origin,line_action,description,unit,consultant_quantity,contractor_quantity,labour_rate,material_rate,unit_rate,line_total,currency_code,participant_id,contractor_user_id,contractor_name,consultant_user_id,cost_package_owner_user_id,submitted_at)
  VALUES(v_submission.id,v_round.id,v_round.round_number,v_submission.tender_id,v_submission.project_id,v_submission.ontology_version_id,v_cost_package,v_work_group,NEW.line_id,v_tender.procurement_method,v_tender.boq_mode,NEW.line_origin,NEW.line_action,v_description,v_unit,v_consultant_quantity,NEW.quantity,NEW.labour_rate,NEW.material_rate,NEW.unit_rate,NEW.line_total,v_submission.currency_code,NEW.participant_id,v_submission.bidder_user_id,COALESCE(v_contractor_name,'Unknown contractor'),private.cost_package_responsible_user(v_submission.project_id,v_cost_package,'CONSULTANT',v_submission.submitted_at),private.cost_package_responsible_user(v_submission.project_id,v_cost_package,'OWNER',v_submission.submitted_at),v_submission.submitted_at)
  ON CONFLICT(bid_submission_id,line_id)DO NOTHING;RETURN NEW;
END;$$;
CREATE TRIGGER capture_historical_bid_line_fact AFTER INSERT ON public.project_tender_bid_submission_items FOR EACH ROW EXECUTE FUNCTION private.capture_historical_bid_line_fact();
REVOKE ALL ON FUNCTION private.capture_historical_bid_line_fact()FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO public.project_tender_historical_bid_line_facts(bid_submission_id,bid_round_id,round_number,tender_id,project_id,ontology_version_id,cost_package_id,work_group_id,line_id,procurement_method,boq_mode,line_origin,line_action,description,unit,consultant_quantity,contractor_quantity,labour_rate,material_rate,unit_rate,line_total,currency_code,participant_id,contractor_user_id,contractor_name,consultant_user_id,cost_package_owner_user_id,submitted_at)
SELECT submission.id,round.id,round.round_number,submission.tender_id,submission.project_id,submission.ontology_version_id,scope.cost_package_id,COALESCE(item.work_group_id,source.work_group_id),item.line_id,tender.procurement_method,tender.boq_mode,item.line_origin,item.line_action,COALESCE(item.description,source.description,'Historical bid line'),COALESCE(item.unit,source.unit,'L.S.'),source.consultant_quantity,item.quantity,item.labour_rate,item.material_rate,item.unit_rate,item.line_total,submission.currency_code,item.participant_id,submission.bidder_user_id,COALESCE(participant.contractor_name,'Unknown contractor'),private.cost_package_responsible_user(submission.project_id,scope.cost_package_id,'CONSULTANT',submission.submitted_at),private.cost_package_responsible_user(submission.project_id,scope.cost_package_id,'OWNER',submission.submitted_at),submission.submitted_at
FROM public.project_tender_bid_submission_items item JOIN public.project_tender_bid_submissions submission ON submission.id=item.bid_submission_id JOIN public.project_tender_bid_rounds round ON round.id=submission.bid_round_id JOIN public.project_tenders tender ON tender.id=submission.tender_id JOIN public.project_tender_setup_versions setup ON setup.id=submission.tender_setup_version_id LEFT JOIN public.project_boq_items source ON source.boq_version_id=setup.issued_boq_version_id AND source.line_id=item.line_id LEFT JOIN public.project_cost_package_work_groups scope ON scope.project_id=submission.project_id AND scope.work_group_id=COALESCE(item.work_group_id,source.work_group_id) LEFT JOIN public.project_tender_participants participant ON participant.tender_setup_version_id=submission.tender_setup_version_id AND participant.participant_id=item.participant_id
ON CONFLICT(bid_submission_id,line_id)DO NOTHING;

CREATE OR REPLACE FUNCTION private.capture_historical_category_spreads(p_round_id bigint)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.project_tender_historical_category_spreads(bid_round_id,tender_id,project_id,ontology_version_id,cost_package_id,work_group_id,work_group_code,work_group_name,procurement_method,currency_code,bidder_count,minimum_bid,maximum_bid,average_bid,price_spread,price_spread_pct,captured_at)
  WITH bidder_categories AS(
    SELECT fact.bid_round_id,fact.tender_id,fact.project_id,fact.ontology_version_id,fact.cost_package_id,fact.work_group_id,fact.bid_submission_id,fact.procurement_method,fact.currency_code,sum(fact.line_total)category_total
    FROM public.project_tender_historical_bid_line_facts fact WHERE fact.bid_round_id=p_round_id AND fact.line_action='INCLUDED'AND fact.line_total IS NOT NULL GROUP BY fact.bid_round_id,fact.tender_id,fact.project_id,fact.ontology_version_id,fact.cost_package_id,fact.work_group_id,fact.bid_submission_id,fact.procurement_method,fact.currency_code
  ),spread AS(
    SELECT bid_round_id,tender_id,project_id,ontology_version_id,cost_package_id,work_group_id,procurement_method,currency_code,count(*)bidder_count,min(category_total)minimum_bid,max(category_total)maximum_bid,avg(category_total)average_bid FROM bidder_categories GROUP BY bid_round_id,tender_id,project_id,ontology_version_id,cost_package_id,work_group_id,procurement_method,currency_code
  )
  SELECT spread.bid_round_id,spread.tender_id,spread.project_id,spread.ontology_version_id,spread.cost_package_id,spread.work_group_id,group_row.code,group_row.label,spread.procurement_method,spread.currency_code,spread.bidder_count,spread.minimum_bid,spread.maximum_bid,round(spread.average_bid,2),spread.maximum_bid-spread.minimum_bid,CASE WHEN spread.minimum_bid=0 THEN NULL ELSE round((spread.maximum_bid-spread.minimum_bid)/spread.minimum_bid*100,6)END,now()
  FROM spread JOIN public.work_ontology_work_groups group_row ON group_row.ontology_version_id=spread.ontology_version_id AND group_row.id=spread.work_group_id
  ON CONFLICT(bid_round_id,work_group_id)DO NOTHING;
END;$$;
CREATE OR REPLACE FUNCTION private.capture_historical_category_spreads_on_close()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN IF NEW.status='CLOSED'AND OLD.status IS DISTINCT FROM NEW.status THEN PERFORM private.capture_historical_category_spreads(NEW.id);END IF;RETURN NEW;END;$$;
CREATE TRIGGER capture_historical_category_spreads_on_close AFTER UPDATE OF status ON public.project_tender_bid_rounds FOR EACH ROW EXECUTE FUNCTION private.capture_historical_category_spreads_on_close();
SELECT private.capture_historical_category_spreads(id)FROM public.project_tender_bid_rounds WHERE status='CLOSED';
REVOKE ALL ON FUNCTION private.capture_historical_category_spreads(bigint),private.capture_historical_category_spreads_on_close()FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.capture_historical_financial_event()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_payload jsonb:=to_jsonb(NEW);v_project bigint;v_cost_package uuid;v_source_id uuid;v_kind text;v_source_kind text;v_value numeric;v_currency text;v_actor uuid;v_contractor_user uuid;v_contractor_name text;v_recorded timestamptz;v_procurement text;v_ontology uuid;v_owner uuid;
BEGIN
  IF TG_TABLE_NAME='project_commercial_commitments'THEN v_project:=(v_payload->>'project_id')::bigint;v_cost_package:=(v_payload->>'cost_package_id')::uuid;v_source_id:=(v_payload->>'id')::uuid;v_kind:='COMMITMENT_CREATED';v_source_kind:=v_payload->>'source_kind';v_value:=(v_payload->>'committed_value')::numeric;v_currency:=v_payload->>'currency_code';v_actor:=(v_payload->>'created_by')::uuid;v_contractor_name:=v_payload->>'counterparty_name';v_recorded:=(v_payload->>'created_at')::timestamptz;
  ELSIF TG_TABLE_NAME='project_cost_package_forecast_versions'THEN v_project:=(v_payload->>'project_id')::bigint;v_cost_package:=(v_payload->>'cost_package_id')::uuid;v_source_id:=(v_payload->>'id')::uuid;v_kind:='FORECAST_CREATED';v_source_kind:=v_payload->>'forecast_source';v_value:=(v_payload->>'forecast_value')::numeric;v_currency:=v_payload->>'currency_code';v_actor:=(v_payload->>'owner_user_id')::uuid;v_recorded:=(v_payload->>'created_at')::timestamptz;
  ELSE IF v_payload->>'status'<>'APPROVED'THEN RETURN NEW;END IF;v_project:=(v_payload->>'project_id')::bigint;v_cost_package:=(v_payload->>'cost_package_id')::uuid;v_source_id:=(v_payload->>'id')::uuid;v_kind:='ADDITIONAL_WORK_APPROVED';v_source_kind:=v_payload->>'reason_code';v_value:=(v_payload->>'approved_amount')::numeric;v_currency:=v_payload->>'currency_code';v_actor:=(v_payload->>'reviewed_by')::uuid;v_contractor_user:=(v_payload->>'contractor_user_id')::uuid;v_contractor_name:=v_payload->>'contractor_name';v_recorded:=COALESCE((v_payload->>'reviewed_at')::timestamptz,now());END IF;
  IF v_cost_package IS NULL THEN RETURN NEW;END IF;SELECT procurement_method,ontology_version_id INTO v_procurement,v_ontology FROM public.project_cost_packages WHERE id=v_cost_package;v_owner:=private.cost_package_responsible_user(v_project,v_cost_package,'OWNER',v_recorded);
  INSERT INTO public.project_cost_package_historical_financial_events(project_id,cost_package_id,ontology_version_id,event_kind,source_id,source_kind,value,currency_code,procurement_method,cost_package_owner_user_id,contractor_user_id,contractor_name,actor_id,metadata,recorded_at)VALUES(v_project,v_cost_package,v_ontology,v_kind,v_source_id,COALESCE(v_source_kind,'UNKNOWN'),v_value,v_currency,v_procurement,v_owner,v_contractor_user,v_contractor_name,v_actor,v_payload,v_recorded)ON CONFLICT(event_kind,source_id)DO NOTHING;RETURN NEW;
END;$$;
CREATE TRIGGER capture_commitment_history AFTER INSERT ON public.project_commercial_commitments FOR EACH ROW EXECUTE FUNCTION private.capture_historical_financial_event();
CREATE TRIGGER capture_cost_package_forecast_history AFTER INSERT ON public.project_cost_package_forecast_versions FOR EACH ROW EXECUTE FUNCTION private.capture_historical_financial_event();
CREATE TRIGGER capture_approved_additional_work_history_insert AFTER INSERT ON public.project_variations FOR EACH ROW EXECUTE FUNCTION private.capture_historical_financial_event();
CREATE TRIGGER capture_approved_additional_work_history_update AFTER UPDATE OF status,approved_amount ON public.project_variations FOR EACH ROW WHEN(NEW.status='APPROVED'AND OLD.status IS DISTINCT FROM NEW.status)EXECUTE FUNCTION private.capture_historical_financial_event();
REVOKE ALL ON FUNCTION private.capture_historical_financial_event()FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO public.project_cost_package_historical_financial_events(project_id,cost_package_id,ontology_version_id,event_kind,source_id,source_kind,value,currency_code,procurement_method,cost_package_owner_user_id,contractor_name,actor_id,metadata,recorded_at)
SELECT commitment.project_id,commitment.cost_package_id,commitment.ontology_version_id,'COMMITMENT_CREATED',commitment.id,commitment.source_kind,commitment.committed_value,commitment.currency_code,package.procurement_method,private.cost_package_responsible_user(commitment.project_id,commitment.cost_package_id,'OWNER',commitment.created_at),commitment.counterparty_name,commitment.created_by,to_jsonb(commitment),commitment.created_at FROM public.project_commercial_commitments commitment JOIN public.project_cost_packages package ON package.id=commitment.cost_package_id ON CONFLICT(event_kind,source_id)DO NOTHING;
INSERT INTO public.project_cost_package_historical_financial_events(project_id,cost_package_id,ontology_version_id,event_kind,source_id,source_kind,value,currency_code,procurement_method,cost_package_owner_user_id,actor_id,metadata,recorded_at)
SELECT forecast.project_id,forecast.cost_package_id,forecast.ontology_version_id,'FORECAST_CREATED',forecast.id,forecast.forecast_source,forecast.forecast_value,forecast.currency_code,package.procurement_method,private.cost_package_responsible_user(forecast.project_id,forecast.cost_package_id,'OWNER',forecast.created_at),forecast.owner_user_id,to_jsonb(forecast),forecast.created_at FROM public.project_cost_package_forecast_versions forecast JOIN public.project_cost_packages package ON package.id=forecast.cost_package_id ON CONFLICT(event_kind,source_id)DO NOTHING;
INSERT INTO public.project_cost_package_historical_financial_events(project_id,cost_package_id,ontology_version_id,event_kind,source_id,source_kind,value,currency_code,procurement_method,cost_package_owner_user_id,contractor_user_id,contractor_name,actor_id,metadata,recorded_at)
SELECT variation.project_id,variation.cost_package_id,variation.ontology_version_id,'ADDITIONAL_WORK_APPROVED',variation.id,variation.reason_code,variation.approved_amount,variation.currency_code,package.procurement_method,private.cost_package_responsible_user(variation.project_id,variation.cost_package_id,'OWNER',variation.reviewed_at),variation.contractor_user_id,variation.contractor_name,variation.reviewed_by,to_jsonb(variation),variation.reviewed_at FROM public.project_variations variation JOIN public.project_cost_packages package ON package.id=variation.cost_package_id WHERE variation.status='APPROVED'AND variation.cost_package_id IS NOT NULL ON CONFLICT(event_kind,source_id)DO NOTHING;

ALTER TABLE public.project_tender_historical_bid_line_facts ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_tender_historical_category_spreads ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_cost_package_historical_financial_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_bid_line_facts_read ON public.project_tender_historical_bid_line_facts FOR SELECT TO authenticated USING(public.has_project_capability(project_id,'TENDER_MANAGE',cost_package_id)OR public.has_project_capability(project_id,'BID_REVIEW',cost_package_id)OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)OR public.has_project_capability(project_id,'EXECUTIVE_SUMMARY',cost_package_id));
CREATE POLICY historical_category_spreads_read ON public.project_tender_historical_category_spreads FOR SELECT TO authenticated USING(public.has_project_capability(project_id,'TENDER_MANAGE',cost_package_id)OR public.has_project_capability(project_id,'BID_REVIEW',cost_package_id)OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)OR public.has_project_capability(project_id,'EXECUTIVE_SUMMARY',cost_package_id));
CREATE POLICY historical_financial_events_read ON public.project_cost_package_historical_financial_events FOR SELECT TO authenticated USING(public.has_project_capability(project_id,'TENDER_MANAGE',cost_package_id)OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)OR public.has_project_capability(project_id,'EXECUTIVE_SUMMARY',cost_package_id));
REVOKE ALL ON TABLE public.project_tender_historical_bid_line_facts,public.project_tender_historical_category_spreads,public.project_cost_package_historical_financial_events FROM PUBLIC,anon,authenticated,service_role;GRANT SELECT ON TABLE public.project_tender_historical_bid_line_facts,public.project_tender_historical_category_spreads,public.project_cost_package_historical_financial_events TO authenticated;
REVOKE ALL ON SEQUENCE public.project_tender_historical_bid_line_facts_id_seq FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.project_tender_historical_category_spreads_id_seq FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.project_cost_package_historical_financial_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.project_tender_invitation_events DROP CONSTRAINT project_tender_invitation_events_event_type_check;
ALTER TABLE public.project_tender_invitation_events ADD CONSTRAINT project_tender_invitation_events_event_type_check CHECK(event_type IN('INVITED','SENT','RESENT','OPENED','ACCEPTED','DECLINED','NO_RESPONSE','REVOKED'));
CREATE OR REPLACE FUNCTION private.audit_tender_invitation_lifecycle()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_event text;
BEGIN IF TG_OP='INSERT'THEN v_event:='INVITED';ELSIF NEW.status IS DISTINCT FROM OLD.status THEN v_event:=NEW.status;ELSIF OLD.email_opened_at IS NULL AND NEW.email_opened_at IS NOT NULL THEN v_event:='OPENED';ELSIF NEW.invited_at IS DISTINCT FROM OLD.invited_at THEN v_event:='RESENT';ELSIF OLD.email_sent_at IS NULL AND NEW.email_sent_at IS NOT NULL THEN v_event:='SENT';END IF;
  IF v_event IS NOT NULL THEN INSERT INTO public.project_tender_invitation_events(tender_id,participant_id,project_id,event_type,snapshot,actor_id)VALUES(NEW.tender_id,NEW.participant_id,NEW.project_id,v_event,jsonb_build_object('status',NEW.status,'invitedEmail',NEW.invited_email,'setupVersionId',NEW.tender_setup_version_id,'invitedAt',NEW.invited_at,'sentAt',NEW.email_sent_at,'openedAt',NEW.email_opened_at,'respondedAt',NEW.responded_at),auth.uid());END IF;RETURN NEW;
END;$$;

COMMIT;
