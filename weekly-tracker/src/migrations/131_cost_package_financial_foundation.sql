-- 131_cost_package_financial_foundation.sql
-- Roadmap phases 14-16: universal commitments, Cost Package forecasts and
-- Additional Works linked to their commercial package.

BEGIN;

ALTER TABLE public.project_variations
  ADD COLUMN IF NOT EXISTS cost_package_id uuid,
  ADD COLUMN IF NOT EXISTS contractor_user_id uuid REFERENCES auth.users(id)ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS contractor_name text;
ALTER TABLE public.project_variations
  DROP CONSTRAINT IF EXISTS project_variations_cost_package_fk;
ALTER TABLE public.project_variations
  ADD CONSTRAINT project_variations_cost_package_fk FOREIGN KEY(cost_package_id,project_id,ontology_version_id)REFERENCES public.project_cost_packages(id,project_id,ontology_version_id)ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION private.assign_variation_commercial_identity()RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  SELECT scope.cost_package_id INTO NEW.cost_package_id FROM public.project_cost_package_work_groups scope WHERE scope.project_id=NEW.project_id AND scope.ontology_version_id=NEW.ontology_version_id AND scope.work_group_id=NEW.work_group_id;
  NEW.contractor_user_id:=NEW.created_by;SELECT name INTO NEW.contractor_name FROM public.profiles WHERE id=NEW.created_by;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS project_variations_assign_commercial_identity ON public.project_variations;
CREATE TRIGGER project_variations_assign_commercial_identity BEFORE INSERT OR UPDATE OF work_group_id ON public.project_variations FOR EACH ROW EXECUTE FUNCTION private.assign_variation_commercial_identity();
REVOKE ALL ON FUNCTION private.assign_variation_commercial_identity()FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.project_commercial_commitments(
  id uuid PRIMARY KEY,project_id bigint NOT NULL,cost_package_id uuid NOT NULL,ontology_version_id uuid NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN('TENDER_AWARD','FRAMEWORK_CALLOFF','DIRECT_AWARD','EXISTING_CONTRACT','NOMINATED_SUPPLIER')),
  source_reference text NOT NULL CHECK(btrim(source_reference)<>''AND char_length(source_reference)<=500),
  counterparty_name text NOT NULL CHECK(btrim(counterparty_name)<>''AND char_length(counterparty_name)<=300),
  committed_value numeric(24,2)NOT NULL CHECK(committed_value>=0),currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
  committed_on date NOT NULL,effective_from date,effective_to date,note text NOT NULL DEFAULT''CHECK(char_length(note)<=3000),
  source_award_id uuid REFERENCES public.project_tender_awards(id)ON DELETE RESTRICT,created_by uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(cost_package_id,project_id,ontology_version_id)REFERENCES public.project_cost_packages(id,project_id,ontology_version_id)ON DELETE RESTRICT,
  CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from),
  CHECK((source_kind='TENDER_AWARD'AND source_award_id IS NOT NULL)OR(source_kind<>'TENDER_AWARD'AND source_award_id IS NULL)),
  UNIQUE(cost_package_id,source_kind,source_reference)
);
CREATE TABLE IF NOT EXISTS public.project_cost_package_forecast_versions(
  id uuid PRIMARY KEY,project_id bigint NOT NULL,cost_package_id uuid NOT NULL,ontology_version_id uuid NOT NULL,
  version_number integer NOT NULL CHECK(version_number>0),forecast_value numeric(24,2)NOT NULL CHECK(forecast_value>=0),
  forecast_source text NOT NULL CHECK(forecast_source IN('TENDER_AWARD','FRAMEWORK_QUOTE_CALLOFF','SUPPLIER_QUOTATION','EXISTING_CONTRACT','LANDLORD_CONTRIBUTION','MANUAL_ESTIMATE','BUDGET_FALLBACK')),
  currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),owner_user_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  note text NOT NULL DEFAULT''CHECK(char_length(note)<=3000),created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(cost_package_id,project_id,ontology_version_id)REFERENCES public.project_cost_packages(id,project_id,ontology_version_id)ON DELETE RESTRICT,
  UNIQUE(cost_package_id,version_number)
);

CREATE OR REPLACE FUNCTION private.prevent_cost_package_financial_snapshot_mutation()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION'COST_PACKAGE_FINANCIAL_SNAPSHOT_IMMUTABLE'USING ERRCODE='55000';END;$$;
DROP TRIGGER IF EXISTS project_commercial_commitments_immutable ON public.project_commercial_commitments;CREATE TRIGGER project_commercial_commitments_immutable BEFORE UPDATE OR DELETE ON public.project_commercial_commitments FOR EACH ROW EXECUTE FUNCTION private.prevent_cost_package_financial_snapshot_mutation();
DROP TRIGGER IF EXISTS project_cost_package_forecasts_immutable ON public.project_cost_package_forecast_versions;CREATE TRIGGER project_cost_package_forecasts_immutable BEFORE UPDATE OR DELETE ON public.project_cost_package_forecast_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_cost_package_financial_snapshot_mutation();
REVOKE ALL ON FUNCTION private.prevent_cost_package_financial_snapshot_mutation()FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.capture_tender_award_commitment()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_baseline public.project_commercial_baselines%ROWTYPE;v_award public.project_tender_awards%ROWTYPE;
BEGIN
  SELECT*INTO v_baseline FROM public.project_commercial_baselines WHERE id=NEW.baseline_id;SELECT*INTO v_award FROM public.project_tender_awards WHERE id=v_baseline.award_id;
  INSERT INTO public.project_commercial_commitments(id,project_id,cost_package_id,ontology_version_id,source_kind,source_reference,counterparty_name,committed_value,currency_code,committed_on,effective_from,effective_to,note,source_award_id,created_by)
    VALUES(gen_random_uuid(),NEW.project_id,NEW.cost_package_id,NEW.ontology_version_id,'TENDER_AWARD',v_award.id::text,v_award.contractor_name,NEW.baseline_value,v_baseline.currency_code,v_award.awarded_at::date,v_award.awarded_at::date,NULL,'Created from frozen Commercial Baseline',v_award.id,v_baseline.frozen_by)
  ON CONFLICT(cost_package_id,source_kind,source_reference)DO NOTHING;RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS project_commercial_baseline_capture_commitment ON public.project_commercial_baseline_cost_packages;
CREATE TRIGGER project_commercial_baseline_capture_commitment AFTER INSERT ON public.project_commercial_baseline_cost_packages FOR EACH ROW EXECUTE FUNCTION private.capture_tender_award_commitment();
REVOKE ALL ON FUNCTION private.capture_tender_award_commitment()FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO public.project_commercial_commitments(id,project_id,cost_package_id,ontology_version_id,source_kind,source_reference,counterparty_name,committed_value,currency_code,committed_on,effective_from,note,source_award_id,created_by)
SELECT gen_random_uuid(),link.project_id,link.cost_package_id,link.ontology_version_id,'TENDER_AWARD',award.id::text,award.contractor_name,link.baseline_value,baseline.currency_code,award.awarded_at::date,award.awarded_at::date,'Created from frozen Commercial Baseline',award.id,baseline.frozen_by
FROM public.project_commercial_baseline_cost_packages link JOIN public.project_commercial_baselines baseline ON baseline.id=link.baseline_id JOIN public.project_tender_awards award ON award.id=baseline.award_id
ON CONFLICT(cost_package_id,source_kind,source_reference)DO NOTHING;

ALTER TABLE public.project_commercial_commitments ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_cost_package_forecast_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_commercial_commitments_read ON public.project_commercial_commitments FOR SELECT TO authenticated USING(public.has_project_capability(project_id,'TENDER_MANAGE',cost_package_id)OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)OR public.has_project_capability(project_id,'EXECUTIVE_SUMMARY',cost_package_id));
CREATE POLICY project_cost_package_forecasts_read ON public.project_cost_package_forecast_versions FOR SELECT TO authenticated USING(public.has_project_capability(project_id,'TENDER_MANAGE',cost_package_id)OR public.has_project_capability(project_id,'COMMERCIAL_APPROVE',cost_package_id)OR public.has_project_capability(project_id,'EXECUTIVE_SUMMARY',cost_package_id));
REVOKE ALL ON TABLE public.project_commercial_commitments,public.project_cost_package_forecast_versions FROM PUBLIC,anon,authenticated,service_role;GRANT SELECT ON TABLE public.project_commercial_commitments,public.project_cost_package_forecast_versions TO authenticated;

CREATE OR REPLACE FUNCTION public.create_project_commercial_commitment(p_project_id bigint,p_cost_package_id uuid,p_commitment_id uuid,p_source_kind text,p_source_reference text,p_counterparty_name text,p_committed_value numeric,p_committed_on date,p_effective_from date,p_effective_to date,p_note text,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_package public.project_cost_packages%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION'Authentication required'USING ERRCODE='28000';END IF;SELECT*INTO v_package FROM public.project_cost_packages WHERE id=p_cost_package_id AND project_id=p_project_id;
  IF v_package.id IS NULL OR public.has_project_capability(p_project_id,'COMMERCIAL_APPROVE',p_cost_package_id)IS NOT TRUE THEN RAISE EXCEPTION'COMMERCIAL_COMMITMENT_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF p_commitment_id IS NULL OR p_client_request_id IS NULL OR p_source_kind NOT IN('FRAMEWORK_CALLOFF','DIRECT_AWARD','EXISTING_CONTRACT','NOMINATED_SUPPLIER')OR btrim(COALESCE(p_source_reference,''))=''OR btrim(COALESCE(p_counterparty_name,''))=''OR p_committed_value<0 OR p_committed_on IS NULL OR(p_effective_to IS NOT NULL AND p_effective_from IS NOT NULL AND p_effective_to<p_effective_from)THEN RAISE EXCEPTION'INVALID_COMMERCIAL_COMMITMENT'USING ERRCODE='22023';END IF;
  IF(p_source_kind='FRAMEWORK_CALLOFF'AND v_package.procurement_method<>'FRAMEWORK_AGREEMENT')OR(p_source_kind='DIRECT_AWARD'AND v_package.procurement_method<>'DIRECT_AWARD')OR(p_source_kind='EXISTING_CONTRACT'AND v_package.procurement_method<>'EXISTING_CONTRACT')OR(p_source_kind='NOMINATED_SUPPLIER'AND v_package.procurement_method<>'NOMINATED_SUPPLIER')THEN RAISE EXCEPTION'COMMITMENT_PROCUREMENT_METHOD_MISMATCH'USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'commercial.commitment.create',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;SELECT*INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='commercial.commitment.create'AND client_request_id=p_client_request_id;IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  INSERT INTO public.project_commercial_commitments(id,project_id,cost_package_id,ontology_version_id,source_kind,source_reference,counterparty_name,committed_value,currency_code,committed_on,effective_from,effective_to,note,created_by)VALUES(p_commitment_id,p_project_id,p_cost_package_id,v_package.ontology_version_id,p_source_kind,btrim(p_source_reference),btrim(p_counterparty_name),p_committed_value,v_package.currency_code,p_committed_on,p_effective_from,p_effective_to,btrim(COALESCE(p_note,'')),v_uid);
  v_result:=jsonb_build_object('commitmentId',p_commitment_id,'costPackageId',p_cost_package_id,'sourceKind',p_source_kind,'committedValue',p_committed_value,'currencyCode',v_package.currency_code);UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.create_cost_package_forecast(p_project_id bigint,p_cost_package_id uuid,p_forecast_id uuid,p_forecast_value numeric,p_forecast_source text,p_note text,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_package public.project_cost_packages%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_version integer;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION'Authentication required'USING ERRCODE='28000';END IF;SELECT*INTO v_package FROM public.project_cost_packages WHERE id=p_cost_package_id AND project_id=p_project_id;
  IF v_package.id IS NULL OR(public.has_project_capability(p_project_id,'TENDER_MANAGE',p_cost_package_id)IS NOT TRUE AND public.has_project_capability(p_project_id,'COMMERCIAL_APPROVE',p_cost_package_id)IS NOT TRUE)THEN RAISE EXCEPTION'COST_PACKAGE_FORECAST_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF p_forecast_id IS NULL OR p_client_request_id IS NULL OR p_forecast_value<0 OR p_forecast_source NOT IN('TENDER_AWARD','FRAMEWORK_QUOTE_CALLOFF','SUPPLIER_QUOTATION','EXISTING_CONTRACT','LANDLORD_CONTRIBUTION','MANUAL_ESTIMATE','BUDGET_FALLBACK')OR char_length(COALESCE(p_note,''))>3000 THEN RAISE EXCEPTION'INVALID_COST_PACKAGE_FORECAST'USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'commercial.cost_package_forecast.create',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;SELECT*INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='commercial.cost_package_forecast.create'AND client_request_id=p_client_request_id;IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cost_package_id::text,0));SELECT COALESCE(max(version_number),0)+1 INTO v_version FROM public.project_cost_package_forecast_versions WHERE cost_package_id=p_cost_package_id;
  INSERT INTO public.project_cost_package_forecast_versions(id,project_id,cost_package_id,ontology_version_id,version_number,forecast_value,forecast_source,currency_code,owner_user_id,note)VALUES(p_forecast_id,p_project_id,p_cost_package_id,v_package.ontology_version_id,v_version,p_forecast_value,p_forecast_source,v_package.currency_code,v_uid,btrim(COALESCE(p_note,'')));
  v_result:=jsonb_build_object('forecastId',p_forecast_id,'costPackageId',p_cost_package_id,'versionNumber',v_version,'forecastValue',p_forecast_value,'forecastSource',p_forecast_source,'ownerUserId',v_uid,'currencyCode',v_package.currency_code);UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.get_project_cost_package_financial_overview(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project public.projects%ROWTYPE;v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION'Authentication required'USING ERRCODE='28000';END IF;SELECT*INTO v_project FROM public.projects WHERE id=p_project_id;
  IF v_project.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.project_cost_packages package WHERE package.project_id=p_project_id AND(public.has_project_capability(p_project_id,'TENDER_MANAGE',package.id)OR public.has_project_capability(p_project_id,'COMMERCIAL_APPROVE',package.id)OR public.has_project_capability(p_project_id,'EXECUTIVE_SUMMARY',package.id)))THEN RAISE EXCEPTION'FINANCIAL_OVERVIEW_FORBIDDEN'USING ERRCODE='42501';END IF;
  WITH package_values AS(
    SELECT package.id cost_package_id,package.code,package.name,package.procurement_method,package.currency_code,
      (SELECT sum(item.amount)FROM public.approved_budget_baselines baseline JOIN public.approved_budget_baseline_items item ON item.baseline_id=baseline.id JOIN public.project_cost_package_work_groups scope ON scope.cost_package_id=package.id AND scope.work_group_id=item.work_group_id WHERE baseline.project_id=p_project_id)budget_value,
      COALESCE((SELECT sum(commitment.committed_value)FROM public.project_commercial_commitments commitment WHERE commitment.cost_package_id=package.id),0)base_commitment,
      COALESCE((SELECT sum(variation.approved_amount)FROM public.project_variations variation WHERE variation.cost_package_id=package.id AND variation.status='APPROVED'),0)additional_works,
      COALESCE((SELECT sum(variation.proposed_amount)FROM public.project_variations variation WHERE variation.cost_package_id=package.id AND variation.status IN('SUBMITTED','UNDER_REVIEW','REVISION_REQUIRED')),0)pending_exposure,
      (SELECT row_to_json(forecast)FROM(SELECT version.forecast_value,version.forecast_source,version.owner_user_id,version.created_at,version.version_number FROM public.project_cost_package_forecast_versions version WHERE version.cost_package_id=package.id ORDER BY version.version_number DESC LIMIT 1)forecast)latest_forecast,
      (SELECT commitment.source_kind FROM public.project_commercial_commitments commitment WHERE commitment.cost_package_id=package.id ORDER BY commitment.created_at DESC LIMIT 1)latest_commitment_source,
      (SELECT commitment.created_by FROM public.project_commercial_commitments commitment WHERE commitment.cost_package_id=package.id ORDER BY commitment.created_at DESC LIMIT 1)latest_commitment_owner,
      (SELECT commitment.created_at FROM public.project_commercial_commitments commitment WHERE commitment.cost_package_id=package.id ORDER BY commitment.created_at DESC LIMIT 1)latest_commitment_at
    FROM public.project_cost_packages package WHERE package.project_id=p_project_id AND package.status<>'ARCHIVED'AND(public.has_project_capability(p_project_id,'TENDER_MANAGE',package.id)OR public.has_project_capability(p_project_id,'COMMERCIAL_APPROVE',package.id)OR public.has_project_capability(p_project_id,'EXECUTIVE_SUMMARY',package.id))
  ),calculated AS(
    SELECT*,base_commitment+additional_works committed_value,
      COALESCE((latest_forecast->>'forecast_value')::numeric,CASE WHEN base_commitment+additional_works>0 THEN base_commitment+additional_works ELSE budget_value END)forecast_value,
      COALESCE(latest_forecast->>'forecast_source',CASE WHEN base_commitment>0 THEN latest_commitment_source ELSE'BUDGET_FALLBACK'END)forecast_source,
      COALESCE((latest_forecast->>'owner_user_id')::uuid,latest_commitment_owner)forecast_owner,
      COALESCE((latest_forecast->>'created_at')::timestamptz,latest_commitment_at)last_updated,
      COALESCE((latest_forecast->>'version_number')::integer,0)forecast_version
    FROM package_values
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('costPackageId',cost_package_id,'costPackageCode',code,'costPackageName',name,'procurementMethod',procurement_method,'currencyCode',currency_code,'budgetValue',budget_value,'baseCommitment',base_commitment,'committedValue',committed_value,'additionalWorks',additional_works,'pendingExposure',pending_exposure,'forecastValue',forecast_value,'forecastSource',forecast_source,'forecastOwnerUserId',forecast_owner,'forecastOwnerName',(SELECT name FROM public.profiles WHERE id=forecast_owner),'lastUpdated',last_updated,'forecastVersion',forecast_version,'variance',CASE WHEN budget_value IS NULL OR forecast_value IS NULL THEN NULL ELSE forecast_value-budget_value END)ORDER BY code),'[]'::jsonb)INTO v_rows FROM calculated;
  RETURN jsonb_build_object('projectId',p_project_id,'currencyCode',v_project.currency_code,'calculationContract','COST_PACKAGE_FINANCIAL_V1','costPackages',v_rows,'unmappedAdditionalWorksCount',(SELECT count(*)FROM public.project_variations WHERE project_id=p_project_id AND cost_package_id IS NULL));
END;$$;

REVOKE ALL ON FUNCTION public.create_project_commercial_commitment(bigint,uuid,uuid,text,text,text,numeric,date,date,date,text,uuid),public.create_cost_package_forecast(bigint,uuid,uuid,numeric,text,text,uuid),public.get_project_cost_package_financial_overview(bigint)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_project_commercial_commitment(bigint,uuid,uuid,text,text,text,numeric,date,date,date,text,uuid),public.create_cost_package_forecast(bigint,uuid,uuid,numeric,text,text,uuid),public.get_project_cost_package_financial_overview(bigint)TO authenticated;

COMMIT;
