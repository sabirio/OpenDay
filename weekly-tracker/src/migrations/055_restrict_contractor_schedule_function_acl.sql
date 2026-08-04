-- Restrict contractor schedule functions from the Supabase anon role.
--
-- Supabase public-schema default privileges grant EXECUTE directly to anon
-- when functions are created. Revoking from PUBLIC alone does not remove
-- that direct grant.
--
-- User-facing RPCs remain executable by authenticated users.
-- Trigger-only functions are not directly executable by anon or authenticated.

REVOKE ALL ON FUNCTION public.save_contractor_schedule_draft(bigint, jsonb, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_contractor_schedule_draft(bigint, jsonb, uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_schedule_submissions(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_schedule_submissions(bigint)
TO authenticated;

REVOKE ALL ON FUNCTION public.contractor_schedule_lifecycle_status(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_schedule_lifecycle_status(bigint)
TO authenticated;

REVOKE ALL ON FUNCTION public.submit_contractor_schedule(bigint, uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_contractor_schedule(bigint, uuid, text)
TO authenticated;

REVOKE ALL ON FUNCTION public.request_schedule_changes(bigint, text, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_schedule_changes(bigint, text, uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.approve_schedule_submission(bigint, text, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_schedule_submission(bigint, text, uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.create_contractor_managed_project(jsonb, text[], uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contractor_managed_project(jsonb, text[], uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.update_contractor_managed_project_scope(bigint, jsonb, text[], uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_contractor_managed_project_scope(bigint, jsonb, text[], uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.prevent_schedule_version_task_mutation()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.prevent_scope_mutation_during_review()
FROM PUBLIC, anon, authenticated;