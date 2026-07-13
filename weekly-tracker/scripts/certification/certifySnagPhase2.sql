\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','9458113d-bbf1-4b2a-a9ee-afcd79851b03',true);
DO $$ BEGIN IF (SELECT count(*) FROM public.list_snag_project_contractors(900001))<>1 THEN RAISE EXCEPTION 'PM contractor lookup mismatch'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','4e97a863-8920-4111-901f-4c4273bb1279',true);
DO $$ BEGIN PERFORM public.list_snag_project_contractors(900001); RAISE EXCEPTION 'contractor lookup accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','cda5fa97-f9d3-4683-b0e1-61672e514485',true);
DO $$ BEGIN PERFORM public.list_snag_project_contractors(900001); RAISE EXCEPTION 'cross-company lookup accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
ROLLBACK;
SELECT 'SNAG_PHASE2_RLS_PASS' AS result;
