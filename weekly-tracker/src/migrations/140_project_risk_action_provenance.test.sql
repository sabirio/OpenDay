BEGIN;

DO $$
DECLARE
  v_actor uuid;
  v_project_id bigint;
  v_membership_id uuid;
  v_source_id uuid:=gen_random_uuid();
  v_risk_id uuid:=gen_random_uuid();
  v_action_id uuid:=gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
  v_mutation_blocked boolean:=false;
BEGIN
  IF has_table_privilege('authenticated','public.project_risk_cases','INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.project_actions','INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Risk or Action tables remain browser-writable';
  END IF;
  IF to_regprocedure('public.register_project_source_reference(bigint,uuid,text,text,text,text,uuid)') IS NULL
    OR to_regprocedure('public.link_project_variation_provenance(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Provenance commands are missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'AND table_name='project_variations'AND column_name='source_action_id') THEN
    RAISE EXCEPTION 'Variation action provenance is missing';
  END IF;

  SELECT admin.id,membership.project_id,membership.id INTO v_actor,v_project_id,v_membership_id
  FROM public.project_team_memberships membership
  JOIN public.projects project ON project.id=membership.project_id
  JOIN public.profiles admin ON lower(admin.role)='admin' AND admin.company_id IS NOT DISTINCT FROM project.company_id
  WHERE membership.starts_on<=CURRENT_DATE AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)
    AND COALESCE(to_jsonb(membership)->>'removed_at','')=''
  ORDER BY membership.project_id LIMIT 1;
  IF v_actor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
    PERFORM public.register_project_source_reference(v_project_id,v_source_id,'MANUAL',NULL,'Certification source','Local transaction',gen_random_uuid());
    PERFORM public.create_project_risk(v_project_id,v_risk_id,v_source_id,'Certification risk','Rollback only','HIGH','LIKELY',v_membership_id,CURRENT_DATE+7,gen_random_uuid());
    PERFORM public.create_project_action(v_project_id,v_action_id,v_risk_id,'Certification action','Rollback only',v_membership_id,CURRENT_DATE+3,gen_random_uuid());
    v_result:=public.transition_project_action(v_action_id,'START',1,'11111111-1111-4111-8111-111111111111');
    v_replay:=public.transition_project_action(v_action_id,'START',1,'11111111-1111-4111-8111-111111111111');
    IF COALESCE((v_result->>'idempotentReplay')::boolean,true) OR NOT COALESCE((v_replay->>'idempotentReplay')::boolean,false) THEN
      RAISE EXCEPTION 'Action transition idempotency failed';
    END IF;
    PERFORM public.transition_project_risk(v_risk_id,'MITIGATE',1,gen_random_uuid());
    IF jsonb_array_length(public.get_project_risk_register(v_project_id)->'risks')=0 THEN
      RAISE EXCEPTION 'Risk register did not return the causal chain';
    END IF;
    BEGIN UPDATE public.project_action_events SET to_status='DONE' WHERE action_id=v_action_id;
    EXCEPTION WHEN SQLSTATE '55000' THEN v_mutation_blocked:=true;END;
    IF NOT v_mutation_blocked THEN RAISE EXCEPTION 'Action event mutation was accepted';END IF;
  END IF;
END;
$$;

ROLLBACK;
