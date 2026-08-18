BEGIN;

DO $$
DECLARE
  v_save_definition text;
  v_activate_definition text;
  v_closeout_definition text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_payment_schedules'
      AND column_name = 'commitment_id'
  ) OR NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_payment_schedules'
      AND column_name = 'cost_package_id'
  ) THEN
    RAISE EXCEPTION 'Payment Schedule commercial identity columns are missing';
  END IF;
  IF to_regprocedure('public.get_project_payment_schedule(bigint)') IS NOT NULL
    OR to_regprocedure('public.save_project_payment_schedule(bigint,uuid,text,jsonb,uuid)') IS NOT NULL
    OR to_regprocedure('public.get_project_payment_retention(bigint)') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy project-wide Payment RPC signature remains';
  END IF;
  IF to_regprocedure('public.get_project_payment_schedule(bigint,uuid)') IS NULL
    OR to_regprocedure('public.save_project_payment_schedule(bigint,uuid,uuid,text,jsonb,uuid)') IS NULL
    OR to_regprocedure('public.get_project_payment_retention(bigint,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Commitment-scoped Payment RPC is missing';
  END IF;
  SELECT pg_get_functiondef('public.save_project_payment_schedule(bigint,uuid,uuid,text,jsonb,uuid)'::regprocedure)
    INTO v_save_definition;
  SELECT pg_get_functiondef('public.activate_project_payment_schedule(uuid,uuid)'::regprocedure)
    INTO v_activate_definition;
  SELECT pg_get_functiondef('public.save_project_payment_closeout(bigint,uuid,text,text,boolean,uuid)'::regprocedure)
    INTO v_closeout_definition;
  IF position('project_tender_awards' IN v_save_definition) > 0
    OR position('p_commitment_id' IN v_save_definition) = 0 THEN
    RAISE EXCEPTION 'Payment Schedule save still infers a Tender Award';
  END IF;
  IF position('commitment_id = v_schedule.commitment_id' IN v_activate_definition) = 0 THEN
    RAISE EXCEPTION 'Payment activation is not Commitment-scoped';
  END IF;
  IF position('sum(schedule.contract_value)' IN v_closeout_definition) = 0
    OR position('PAYMENT_CLOSEOUT_CURRENCY_MISMATCH' IN v_closeout_definition) = 0 THEN
    RAISE EXCEPTION 'Payment Closeout is not a safe multi-Commitment aggregate';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_project_payment_schedule(bigint,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.save_project_payment_schedule(bigint,uuid,uuid,text,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Commitment-scoped Payment RPC ACL is missing';
  END IF;
END;
$$;

ROLLBACK;
