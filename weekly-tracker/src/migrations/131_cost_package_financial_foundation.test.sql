\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);
DO $$
DECLARE
  v_project bigint := 900001;
  v_cp uuid := 'a1310000-0000-4000-a000-000000000001';
  v_commitment uuid := 'a1310000-0000-4000-a000-000000000002';
  v_forecast uuid := 'a1310000-0000-4000-a000-000000000003';
  v_variation uuid := 'a1310000-0000-4000-a000-000000000004';
  v_work_group uuid;
  v_discipline uuid;
  v_ontology uuid;
  v_currency text;
  v_overview jsonb;
  v_row jsonb;
BEGIN
  SELECT work_ontology_version_id,currency_code INTO v_ontology,v_currency FROM public.projects WHERE id=v_project;
  SELECT group_row.id,group_row.discipline_id INTO v_work_group,v_discipline FROM public.work_ontology_work_groups group_row WHERE group_row.ontology_version_id=v_ontology AND group_row.is_active ORDER BY group_row.code LIMIT 1;
  PERFORM public.save_project_cost_package(v_project,v_cp,'FIN-CP','Financial Foundation Test','DIRECT_AWARD',v_currency,'ACTIVE',ARRAY[v_work_group],NULL,0,gen_random_uuid());
  PERFORM public.create_project_commercial_commitment(v_project,v_cp,v_commitment,'DIRECT_AWARD','DA-TEST','Test Supplier',100.00,current_date,NULL,NULL,'Test commitment',gen_random_uuid());
  PERFORM public.create_cost_package_forecast(v_project,v_cp,v_forecast,135.00,'SUPPLIER_QUOTATION','Latest supplier quotation',gen_random_uuid());
  INSERT INTO public.project_variations(id,project_id,ontology_version_id,discipline_id,work_group_id,variation_number,title,proposed_amount,approved_amount,currency_code,description,reason_code,date_identified,status,revision,created_by,reviewed_by,reviewed_at)
    VALUES(v_variation,v_project,v_ontology,v_discipline,v_work_group,99131,'Approved Additional Work',25.00,20.00,v_currency,'Approved Additional Work used by the financial foundation test.','CLIENT_REQUEST',current_date,'APPROVED',1,'b0614918-634c-4a1a-b59a-09d0915f4dfa','82b25233-9e9d-4038-8713-4682aa63b2be',now());
  IF (SELECT cost_package_id FROM public.project_variations WHERE id=v_variation)<>v_cp THEN RAISE EXCEPTION'ADDITIONAL_WORK_COST_PACKAGE_NOT_ASSIGNED';END IF;
  v_overview:=public.get_project_cost_package_financial_overview(v_project);
  SELECT value INTO v_row FROM jsonb_array_elements(v_overview->'costPackages') value WHERE value->>'costPackageId'=v_cp::text;
  IF (v_row->>'baseCommitment')::numeric<>100 OR (v_row->>'additionalWorks')::numeric<>20 OR (v_row->>'committedValue')::numeric<>120 OR (v_row->>'forecastValue')::numeric<>135 OR v_row->>'forecastSource'<>'SUPPLIER_QUOTATION' THEN RAISE EXCEPTION'FINANCIAL_OVERVIEW_RECONCILIATION_FAILED: %',v_row;END IF;
  BEGIN UPDATE public.project_commercial_commitments SET committed_value=1 WHERE id=v_commitment;RAISE EXCEPTION'COMMITMENT_MUTATION_ALLOWED';EXCEPTION WHEN sqlstate'55000'THEN NULL;END;
  BEGIN DELETE FROM public.project_cost_package_forecast_versions WHERE id=v_forecast;RAISE EXCEPTION'FORECAST_MUTATION_ALLOWED';EXCEPTION WHEN sqlstate'55000'THEN NULL;END;
END;$$;
ROLLBACK;
