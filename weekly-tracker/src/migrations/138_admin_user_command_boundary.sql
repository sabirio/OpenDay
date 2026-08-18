-- 138_admin_user_command_boundary.sql
-- User role and contractor-project assignment changes are audited server
-- commands. Internal project responsibility remains Project Team-owned.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_user_change_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  company_id text,
  previous_name text,
  new_name text,
  previous_role text NOT NULL,
  new_role text NOT NULL,
  previous_assigned_projects integer[] NOT NULL,
  new_assigned_projects integer[] NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_user_command_requests(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(actor_id, client_request_id)
);

CREATE OR REPLACE FUNCTION private.prevent_admin_user_change_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'ADMIN_USER_CHANGE_EVENT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS admin_user_change_events_immutable ON public.admin_user_change_events;
CREATE TRIGGER admin_user_change_events_immutable
  BEFORE UPDATE OR DELETE ON public.admin_user_change_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_admin_user_change_event_mutation();

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_uid IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_USERS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'name', profile.name,
      'email', profile.email,
      'role', profile.role,
      'companyId', profile.company_id,
      'assignedProjects', CASE WHEN lower(profile.role) = 'contractor'
        THEN to_jsonb(COALESCE(profile.assigned_projects, '{}'::integer[]))
        ELSE '[]'::jsonb END,
      'assignmentMode', CASE WHEN lower(profile.role) = 'contractor'
        THEN 'CONTRACTOR_COMPATIBILITY' ELSE 'PROJECT_TEAM' END
    ) ORDER BY profile.role, profile.name, profile.email)
    FROM public.profiles profile
    WHERE public.can_admin_company(profile.company_id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_user(
  p_user_id uuid,
  p_name text,
  p_role text,
  p_assigned_project_ids integer[],
  p_client_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_target public.profiles%ROWTYPE;
  v_assignments integer[];
  v_request public.admin_user_command_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT lower(role) INTO v_actor_role FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_uid IS NULL OR v_actor_role <> 'admin' OR v_target.id IS NULL
    OR public.can_admin_company(v_target.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'ADMIN_USERS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL OR p_role NOT IN ('Admin', 'PM', 'Consultant', 'Contractor', 'Approver', 'Executive')
    OR char_length(btrim(COALESCE(p_name, ''))) > 200 THEN
    RAISE EXCEPTION 'INVALID_ADMIN_USER_COMMAND' USING ERRCODE = '22023';
  END IF;
  v_assignments := CASE WHEN p_role = 'Contractor'
    THEN COALESCE(p_assigned_project_ids, '{}'::integer[]) ELSE '{}'::integer[] END;
  IF EXISTS(
    SELECT 1 FROM unnest(v_assignments) project_id
    LEFT JOIN public.projects project ON project.id = project_id::bigint
    WHERE project.id IS NULL OR public.can_admin_company(project.company_id) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'CONTRACTOR_PROJECT_ASSIGNMENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.admin_user_command_requests(actor_id, client_request_id)
  VALUES(v_uid, p_client_request_id)
  ON CONFLICT(actor_id, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.admin_user_command_requests
  WHERE actor_id = v_uid AND client_request_id = p_client_request_id
  FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;
  UPDATE public.profiles
  SET name = NULLIF(btrim(COALESCE(p_name, '')), ''), role = p_role, assigned_projects = v_assignments
  WHERE id = p_user_id;
  INSERT INTO public.admin_user_change_events(
    target_user_id, company_id, previous_name, new_name, previous_role, new_role,
    previous_assigned_projects, new_assigned_projects, changed_by
  ) VALUES(
    p_user_id, v_target.company_id, v_target.name, NULLIF(btrim(COALESCE(p_name, '')), ''),
    v_target.role, p_role, COALESCE(v_target.assigned_projects, '{}'::integer[]), v_assignments, v_uid
  );
  v_result := jsonb_build_object(
    'userId', p_user_id,
    'name', NULLIF(btrim(COALESCE(p_name, '')), ''),
    'role', p_role,
    'assignedProjects', to_jsonb(v_assignments),
    'assignmentMode', CASE WHEN p_role = 'Contractor' THEN 'CONTRACTOR_COMPATIBILITY' ELSE 'PROJECT_TEAM' END
  );
  UPDATE public.admin_user_command_requests SET response = v_result, completed_at = now() WHERE id = v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

ALTER TABLE public.admin_user_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_command_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_user_change_events_read ON public.admin_user_change_events;
CREATE POLICY admin_user_change_events_read ON public.admin_user_change_events
  FOR SELECT TO authenticated USING(public.can_admin_company(company_id));
REVOKE ALL ON TABLE public.admin_user_change_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.admin_user_change_events TO authenticated;
REVOKE ALL ON TABLE public.admin_user_command_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_user_command_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_user_change_events_id_seq TO authenticated;

-- Browser clients may edit their display name only. Role and contractor
-- compatibility assignments are available exclusively through update_admin_user.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE(name) ON public.profiles TO authenticated;

REVOKE ALL ON FUNCTION private.prevent_admin_user_change_event_mutation(),
  public.list_admin_users(), public.update_admin_user(uuid,text,text,integer[],uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_admin_users(),
  public.update_admin_user(uuid,text,text,integer[],uuid)
  TO authenticated;

COMMIT;
