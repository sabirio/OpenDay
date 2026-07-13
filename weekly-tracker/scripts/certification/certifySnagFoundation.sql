\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','7a172112-bdad-4772-a5fc-77fceeaec094',true);
CREATE TEMP TABLE snag_cert_context(snag_id uuid) ON COMMIT DROP;
INSERT INTO snag_cert_context SELECT (public.execute_snag_command(
  '{"type":"createSnag","projectId":900001,"payload":{"title":"Local certification snag","categoryCode":"GENERAL","disciplineCode":"GENERAL","priority":"HIGH","assigneeId":"4e97a863-8920-4111-901f-4c4273bb1279","dueDate":"2026-07-20","location":{"text":"Local test room"}}}'::jsonb,
  '10000000-0000-4000-8000-000000000001'::uuid,NULL)->'snag'->>'id')::uuid;

DO $$ BEGIN
  IF (SELECT count(*) FROM public.snags WHERE id=(SELECT snag_id FROM snag_cert_context)) <> 1 THEN RAISE EXCEPTION 'create state missing'; END IF;
  IF (SELECT count(*) FROM public.snag_events WHERE snag_id=(SELECT snag_id FROM snag_cert_context)) <> 1 THEN RAISE EXCEPTION 'create event missing'; END IF;
END $$;

SELECT public.execute_snag_command(
  '{"type":"createSnag","projectId":900001,"payload":{"title":"Local certification snag","categoryCode":"GENERAL","disciplineCode":"GENERAL","priority":"HIGH","assigneeId":"4e97a863-8920-4111-901f-4c4273bb1279","dueDate":"2026-07-20","location":{"text":"Local test room"}}}'::jsonb,
  '10000000-0000-4000-8000-000000000001'::uuid,NULL);
DO $$ BEGIN IF (SELECT count(*) FROM public.snag_events WHERE snag_id=(SELECT snag_id FROM snag_cert_context)) <> 1 THEN RAISE EXCEPTION 'replay duplicated event'; END IF; END $$;

DO $$ BEGIN
  PERFORM public.execute_snag_command('{"type":"createSnag","projectId":900001,"payload":{"title":"conflict","location":{"text":"x"}}}'::jsonb,'10000000-0000-4000-8000-000000000001'::uuid,NULL);
  RAISE EXCEPTION 'conflicting replay accepted';
EXCEPTION WHEN unique_violation THEN NULL; END $$;

SELECT set_config('request.jwt.claim.sub','4e97a863-8920-4111-901f-4c4273bb1279',true);
SELECT public.execute_snag_command(jsonb_build_object('type','startSnagWork','projectId',900001,'snagId',(SELECT snag_id::text FROM snag_cert_context),'payload','{}'::jsonb),
  '10000000-0000-4000-8000-000000000002'::uuid,1);
DO $$ BEGIN IF (SELECT status FROM public.snags WHERE id=(SELECT snag_id FROM snag_cert_context)) <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'contractor transition failed'; END IF; END $$;

SELECT public.execute_snag_command(jsonb_build_object('type','addSnagEvidence','projectId',900001,'snagId',(SELECT snag_id::text FROM snag_cert_context),'payload',jsonb_build_object('evidenceType','CORRECTION_PHOTO','storagePath','900001/snags/local-test.jpg')),
  '10000000-0000-4000-8000-000000000003'::uuid,2);
DO $$ BEGIN IF (SELECT count(*) FROM public.snag_evidence WHERE snag_id=(SELECT snag_id FROM snag_cert_context)) <> 1 THEN RAISE EXCEPTION 'evidence missing'; END IF; END $$;

SELECT set_config('request.jwt.claim.sub','e79da95b-23d1-470d-b44f-0e7ca6775c87',true);
DO $$ BEGIN
  PERFORM public.execute_snag_command(jsonb_build_object('type','markSnagReadyForReview','projectId',900001,'snagId',(SELECT snag_id::text FROM snag_cert_context),'payload','{}'::jsonb),'10000000-0000-4000-8000-000000000004'::uuid,3);
  RAISE EXCEPTION 'cross-contractor command accepted';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

SELECT set_config('request.jwt.claim.sub','8b576e3e-13c3-493a-a4a7-684b6c796d1d',true);
DO $$ BEGIN
  PERFORM public.execute_snag_command('{"type":"createSnag","projectId":900001,"payload":{"title":"viewer write","location":{"text":"x"}}}'::jsonb,'10000000-0000-4000-8000-000000000005'::uuid,NULL);
  RAISE EXCEPTION 'viewer create accepted';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

RESET ROLE;
DO $$ BEGIN
  UPDATE public.snag_events SET reason='mutated' WHERE snag_id=(SELECT snag_id FROM snag_cert_context);
  RAISE EXCEPTION 'history update accepted';
EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO public.snags(project_id,snag_number,title,category_code,discipline_code,priority,status,location_text,plan_x,plan_y,created_by)
  VALUES(900001,999999,'invalid coordinates','GENERAL','GENERAL','LOW','OPEN','x',2,0.5,'7a172112-bdad-4772-a5fc-77fceeaec094');
  RAISE EXCEPTION 'invalid coordinates accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;

ROLLBACK;
SELECT 'SNAG_LOCAL_CERTIFICATION_PASS' AS result;
