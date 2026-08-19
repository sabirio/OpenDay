-- 150_organization_authorization_cutover.sql
-- Phase 1B: make Organization membership the canonical tenant authorization
-- boundary while preserving legacy company_id inputs and existing role flows.

BEGIN;

ALTER TABLE public.organization_memberships
  ADD COLUMN is_primary boolean NOT NULL DEFAULT false;

UPDATE public.organization_memberships membership
SET is_primary = true, updated_at = now()
FROM public.profiles profile
JOIN public.organizations organization_row
  ON organization_row.legacy_company_id = profile.company_id
WHERE membership.user_id = profile.id
  AND membership.organization_id = organization_row.id
  AND profile.company_id IS NOT NULL;

CREATE UNIQUE INDEX organization_memberships_one_primary_per_user_idx
  ON public.organization_memberships(user_id)
  WHERE is_primary;

CREATE OR REPLACE FUNCTION private.sync_profile_primary_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_organization_id uuid;
  v_organization_role text;
  v_status text;
BEGIN
  v_organization_role := CASE
    WHEN lower(NEW.role) = 'admin' THEN 'ORG_ADMIN'
    ELSE 'MEMBER'
  END;
  v_status := CASE WHEN COALESCE(NEW.is_active,true) THEN 'ACTIVE' ELSE 'INACTIVE' END;

  IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id THEN
    UPDATE public.organization_memberships membership
    SET is_primary = false, status = 'INACTIVE', updated_at = now()
    FROM public.organizations organization_row
    WHERE membership.user_id = NEW.id
      AND membership.organization_id = organization_row.id
      AND organization_row.legacy_company_id = OLD.company_id
      AND membership.is_primary;
  END IF;

  IF NEW.company_id IS NULL THEN
    UPDATE public.organization_memberships
    SET is_primary = false, status = 'INACTIVE', updated_at = now()
    WHERE user_id = NEW.id AND is_primary;
    RETURN NEW;
  END IF;

  SELECT organization_row.id INTO v_organization_id
  FROM public.organizations organization_row
  WHERE organization_row.legacy_company_id = NEW.company_id;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_UNKNOWN_PROFILE_COMPANY'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.organization_memberships
  SET is_primary = false, updated_at = now()
  WHERE user_id = NEW.id
    AND organization_id <> v_organization_id
    AND is_primary;

  INSERT INTO public.organization_memberships(
    organization_id,user_id,organization_role,status,is_primary
  ) VALUES(
    v_organization_id,NEW.id,v_organization_role,v_status,true
  )
  ON CONFLICT(organization_id,user_id) DO UPDATE SET
    organization_role = EXCLUDED.organization_role,
    status = EXCLUDED.status,
    is_primary = true,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_primary_organization_sync ON public.profiles;
CREATE TRIGGER profiles_primary_organization_sync
AFTER INSERT OR UPDATE OF company_id,role,is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.sync_profile_primary_organization();

REVOKE ALL ON FUNCTION private.sync_profile_primary_organization()
  FROM PUBLIC,anon,authenticated,service_role;

-- A suspended organization is not operational even when a membership row is
-- still ACTIVE. Platform operators remain separate through their own helper.
CREATE OR REPLACE FUNCTION private.has_active_organization_membership(
  p_organization_id uuid,p_user_id uuid,p_required_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_organization_id IS NOT NULL AND p_user_id IS NOT NULL AND EXISTS(
    SELECT 1
    FROM public.organization_memberships membership
    JOIN public.organizations organization_row
      ON organization_row.id = membership.organization_id
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_user_id
      AND membership.status = 'ACTIVE'
      AND organization_row.status = 'ACTIVE'
      AND (p_required_role IS NULL OR membership.organization_role = p_required_role)
  );
$$;

REVOKE ALL ON FUNCTION private.has_active_organization_membership(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_active_organization_membership(uuid,uuid,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT private.is_platform_superadmin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT organization_row.legacy_company_id
  FROM public.organization_memberships membership
  JOIN public.organizations organization_row
    ON organization_row.id = membership.organization_id
  WHERE membership.user_id = auth.uid()
    AND membership.is_primary
    AND membership.status = 'ACTIVE'
    AND organization_row.status = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION public.can_admin_company(p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF private.is_platform_superadmin(auth.uid()) THEN RETURN true; END IF;
  IF p_company_id IS NULL THEN RETURN false; END IF;
  SELECT id INTO v_organization_id FROM public.organizations
  WHERE legacy_company_id = p_company_id;
  RETURN private.has_active_organization_membership(
    v_organization_id,auth.uid(),'ORG_ADMIN'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_create_project(p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF private.is_platform_superadmin(auth.uid()) THEN RETURN true; END IF;
  IF p_company_id IS NULL THEN RETURN false; END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN('admin','pm') THEN RETURN false; END IF;
  SELECT id INTO v_organization_id FROM public.organizations
  WHERE legacy_company_id = p_company_id;
  RETURN private.has_active_organization_membership(
    v_organization_id,auth.uid(),NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_own_project_row(
  p_project_id bigint,p_company_id text,p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_assignments integer[];
  v_is_organization_member boolean;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  IF private.is_platform_superadmin(auth.uid()) THEN RETURN true; END IF;
  SELECT lower(role),COALESCE(assigned_projects,'{}')
    INTO v_role,v_assignments FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_company_id IS NOT NULL AND p_organization_id IS NULL THEN RETURN false; END IF;
  IF p_organization_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.organizations organization_row
    WHERE organization_row.id = p_organization_id
      AND organization_row.legacy_company_id = p_company_id
  ) THEN RETURN false; END IF;

  v_is_organization_member := p_organization_id IS NULL OR
    private.has_active_organization_membership(
      p_organization_id,auth.uid(),NULL
    );

  IF p_organization_id IS NOT NULL AND
    private.has_active_organization_membership(
      p_organization_id,auth.uid(),'ORG_ADMIN'
    ) THEN
    -- Organization administration is a tenant role, independent from the
    -- user's operational profile role.
    RETURN true;
  END IF;
  IF v_role = 'admin' THEN
    RETURN private.has_active_organization_membership(
      p_organization_id,auth.uid(),'ORG_ADMIN'
    );
  END IF;
  IF v_role = 'contractor' THEN
    RETURN v_is_organization_member
      AND p_project_id = ANY(v_assignments::bigint[]);
  END IF;
  IF v_role NOT IN('admin','pm','consultant','approver','executive') THEN
    RETURN false;
  END IF;
  RETURN v_is_organization_member
    AND public.is_active_project_member(p_project_id,auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_own_project_row(
  p_project_id bigint,p_company_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.can_view_own_project_row(
    p_project_id,p_company_id,
    (SELECT organization_row.id FROM public.organizations organization_row
      WHERE organization_row.legacy_company_id = p_company_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN RETURN false; END IF;
  RETURN public.can_view_own_project_row(
    v_project.id,v_project.company_id,v_project.organization_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_project_capability(
  p_project_id bigint,p_capability_code text,p_cost_package_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_project_role text;
  v_project_organization_id uuid;
BEGIN
  IF v_uid IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  SELECT lower(profile.role),private.project_role_from_profile(profile.role)
    INTO v_role,v_project_role FROM public.profiles profile WHERE profile.id = v_uid;
  SELECT organization_id INTO v_project_organization_id
    FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF private.is_platform_superadmin(v_uid) THEN RETURN true; END IF;
  IF v_project_organization_id IS NOT NULL AND
    private.has_active_organization_membership(
      v_project_organization_id,v_uid,'ORG_ADMIN'
    ) THEN RETURN true; END IF;
  IF v_project_organization_id IS NOT NULL AND
    private.has_active_organization_membership(
      v_project_organization_id,v_uid,NULL
    ) IS NOT TRUE THEN RETURN false; END IF;
  IF v_project_role IS NULL THEN RETURN false; END IF;
  RETURN EXISTS(
    SELECT 1
    FROM public.project_team_memberships membership
    JOIN public.project_capability_catalog catalog
      ON catalog.code = p_capability_code
      AND v_project_role = ANY(catalog.allowed_project_roles)
    WHERE membership.project_id = p_project_id
      AND membership.user_id = v_uid
      AND membership.removed_at IS NULL
      AND membership.starts_on <= CURRENT_DATE
      AND (membership.ends_on IS NULL OR membership.ends_on >= CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(p_project_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_project_organization_id uuid;
  v_created_by uuid;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = auth.uid();
  SELECT organization_id,created_by INTO v_project_organization_id,v_created_by
    FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF private.is_platform_superadmin(auth.uid()) THEN RETURN true; END IF;
  IF v_project_organization_id IS NOT NULL AND
    private.has_active_organization_membership(
      v_project_organization_id,auth.uid(),'ORG_ADMIN'
    ) THEN RETURN true; END IF;
  IF v_role <> 'pm' THEN RETURN false; END IF;
  IF v_project_organization_id IS NOT NULL AND
    private.has_active_organization_membership(
      v_project_organization_id,auth.uid(),NULL
    ) IS NOT TRUE THEN RETURN false; END IF;
  IF public.is_active_project_member(p_project_id,auth.uid()) IS NOT TRUE THEN
    RETURN false;
  END IF;
  RETURN v_created_by = auth.uid()
    OR public.has_project_capability(p_project_id,'PROJECT_MANAGE',NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_admin_project(p_project_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  IF private.is_platform_superadmin(auth.uid()) THEN RETURN true; END IF;
  SELECT organization_id INTO v_organization_id
    FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR v_organization_id IS NULL THEN RETURN false; END IF;
  RETURN private.has_active_organization_membership(
    v_organization_id,auth.uid(),'ORG_ADMIN'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_schedule_submissions(p_project_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  IF private.is_platform_superadmin(auth.uid()) THEN RETURN true; END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN('admin','pm','contractor') THEN RETURN false; END IF;
  RETURN public.can_access_project(p_project_id);
END;
$$;

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
  FOR SELECT TO authenticated
  USING(public.can_view_own_project_row(id,company_id,organization_id));

DROP POLICY IF EXISTS templates_select ON public.templates;
CREATE POLICY templates_select ON public.templates
  FOR SELECT TO authenticated USING(
    auth.uid() IS NOT NULL AND(
      private.is_platform_superadmin((SELECT auth.uid()))
      OR organization_id IS NULL
      OR private.has_active_organization_membership(
        organization_id,(SELECT auth.uid()),NULL
      )
    )
  );
DROP POLICY IF EXISTS templates_insert ON public.templates;
CREATE POLICY templates_insert ON public.templates
  FOR INSERT TO authenticated WITH CHECK(
    private.is_platform_superadmin((SELECT auth.uid()))
    OR private.has_active_organization_membership(
      organization_id,(SELECT auth.uid()),'ORG_ADMIN'
    )
  );
DROP POLICY IF EXISTS templates_update ON public.templates;
CREATE POLICY templates_update ON public.templates
  FOR UPDATE TO authenticated USING(
    private.is_platform_superadmin((SELECT auth.uid()))
    OR private.has_active_organization_membership(
      organization_id,(SELECT auth.uid()),'ORG_ADMIN'
    )
  ) WITH CHECK(
    private.is_platform_superadmin((SELECT auth.uid()))
    OR private.has_active_organization_membership(
      organization_id,(SELECT auth.uid()),'ORG_ADMIN'
    )
  );
DROP POLICY IF EXISTS templates_delete ON public.templates;
CREATE POLICY templates_delete ON public.templates
  FOR DELETE TO authenticated USING(
    private.is_platform_superadmin((SELECT auth.uid()))
    OR private.has_active_organization_membership(
      organization_id,(SELECT auth.uid()),'ORG_ADMIN'
    )
  );

DROP POLICY IF EXISTS work_ontology_versions_select ON public.work_ontology_versions;
CREATE POLICY work_ontology_versions_select ON public.work_ontology_versions
  FOR SELECT TO authenticated USING(
    auth.uid() IS NOT NULL AND(
      private.is_platform_superadmin((SELECT auth.uid()))
      OR organization_id IS NULL
      OR private.has_active_organization_membership(
        organization_id,(SELECT auth.uid()),NULL
      )
    )
  );

REVOKE ALL ON FUNCTION
  public.is_global_admin(),
  public.current_company_id(),
  public.can_admin_company(text),
  public.can_create_project(text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
  public.can_view_own_project_row(bigint,text),
  public.can_view_own_project_row(bigint,text,uuid),
  public.can_access_project(bigint),
  public.has_project_capability(bigint,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
  public.can_write_project(bigint),
  public.can_admin_project(bigint),
  public.can_access_schedule_submissions(bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.is_global_admin(),
  public.current_company_id(),
  public.can_admin_company(text),
  public.can_create_project(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.can_view_own_project_row(bigint,text),
  public.can_view_own_project_row(bigint,text,uuid),
  public.can_access_project(bigint),
  public.has_project_capability(bigint,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.can_write_project(bigint),
  public.can_admin_project(bigint),
  public.can_access_schedule_submissions(bigint)
  TO authenticated;

DO $organization_authorization_assertions$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM public.profiles profile
    JOIN public.organizations organization_row
      ON organization_row.legacy_company_id = profile.company_id
    LEFT JOIN public.organization_memberships membership
      ON membership.organization_id = organization_row.id
      AND membership.user_id = profile.id
      AND membership.is_primary
    WHERE profile.company_id IS NOT NULL
      AND(
        membership.user_id IS NULL
        OR membership.status IS DISTINCT FROM CASE
          WHEN COALESCE(profile.is_active,true) THEN 'ACTIVE' ELSE 'INACTIVE' END
        OR membership.organization_role IS DISTINCT FROM CASE
          WHEN lower(profile.role) = 'admin' THEN 'ORG_ADMIN' ELSE 'MEMBER' END
      )
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_PRIMARY_MEMBERSHIP_MISMATCH';
  END IF;
  IF pg_get_expr(
      (SELECT polqual FROM pg_policy
       WHERE polrelid = 'public.projects'::regclass
         AND polname = 'projects_select'),
      'public.projects'::regclass
    ) NOT ILIKE '%organization_id%' THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_PROJECT_POLICY_NOT_CUT_OVER';
  END IF;
END
$organization_authorization_assertions$;

COMMIT;
