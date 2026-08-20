-- 149_organization_tenant_foundation.sql
-- Additive Phase 1A tenant foundation. Existing company_id behavior remains
-- available while canonical Organizations, memberships and platform roles
-- become the forward migration target.

BEGIN;

DO $organization_tenant_preflight$
BEGIN
  IF EXISTS(
    SELECT 1 FROM (
      SELECT company_id FROM public.profiles
      UNION ALL SELECT company_id FROM public.projects
      UNION ALL SELECT company_id FROM public.templates
      UNION ALL SELECT company_id FROM public.work_ontology_versions
      UNION ALL SELECT company_id FROM public.import_jobs
      UNION ALL SELECT company_id FROM public.admin_user_change_events
    ) legacy_company
    WHERE company_id IS NOT NULL AND btrim(company_id) = ''
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_EMPTY_COMPANY_ID' USING ERRCODE = '23514';
  END IF;
END
$organization_tenant_preflight$;

CREATE TABLE public.organizations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(btrim(name) <> ''),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK(status IN ('ACTIVE','SUSPENDED')),
  legacy_company_id text NOT NULL UNIQUE
    CHECK(btrim(legacy_company_id) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_memberships(
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  organization_role text NOT NULL
    CHECK(organization_role IN ('ORG_ADMIN','MEMBER')),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK(status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,user_id)
);

CREATE INDEX organization_memberships_user_status_idx
  ON public.organization_memberships(user_id,status,organization_id);
CREATE INDEX organization_memberships_org_role_status_idx
  ON public.organization_memberships(organization_id,organization_role,status,user_id);

CREATE TABLE public.platform_user_roles(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  platform_role text NOT NULL CHECK(platform_role = 'PLATFORM_SUPERADMIN'),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK(status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,platform_role)
);

CREATE INDEX platform_user_roles_active_idx
  ON public.platform_user_roles(user_id,status)
  WHERE status = 'ACTIVE';

INSERT INTO public.organizations(name,legacy_company_id)
SELECT btrim(company_id),company_id
FROM (
  SELECT company_id FROM public.profiles
  UNION SELECT company_id FROM public.projects
  UNION SELECT company_id FROM public.templates
  UNION SELECT company_id FROM public.work_ontology_versions
  UNION SELECT company_id FROM public.import_jobs
  UNION SELECT company_id FROM public.admin_user_change_events
) legacy_company
WHERE company_id IS NOT NULL
ON CONFLICT(legacy_company_id) DO NOTHING;

INSERT INTO public.organization_memberships(
  organization_id,user_id,organization_role,status
)
SELECT organization_row.id,profile.id,
  CASE WHEN lower(profile.role) = 'admin' THEN 'ORG_ADMIN' ELSE 'MEMBER' END,
  CASE WHEN COALESCE(profile.is_active,true) THEN 'ACTIVE' ELSE 'INACTIVE' END
FROM public.profiles profile
JOIN public.organizations organization_row
  ON organization_row.legacy_company_id = profile.company_id
WHERE profile.company_id IS NOT NULL
ON CONFLICT(organization_id,user_id) DO UPDATE SET
  organization_role = EXCLUDED.organization_role,
  status = EXCLUDED.status,
  updated_at = now();

-- Preserve today's explicit global-admin population while separating the
-- future platform role from customer organization roles.
INSERT INTO public.platform_user_roles(user_id,platform_role,status)
SELECT profile.id,'PLATFORM_SUPERADMIN',
  CASE WHEN COALESCE(profile.is_active,true) THEN 'ACTIVE' ELSE 'INACTIVE' END
FROM public.profiles profile
WHERE lower(profile.role) = 'admin' AND profile.company_id IS NULL
ON CONFLICT(user_id,platform_role) DO UPDATE SET
  status = EXCLUDED.status,
  updated_at = now();

ALTER TABLE public.projects ADD COLUMN organization_id uuid;
ALTER TABLE public.templates ADD COLUMN organization_id uuid;
ALTER TABLE public.work_ontology_versions ADD COLUMN organization_id uuid;
ALTER TABLE public.import_jobs ADD COLUMN organization_id uuid;
ALTER TABLE public.admin_user_change_events ADD COLUMN organization_id uuid;

UPDATE public.projects target SET organization_id = organization_row.id
FROM public.organizations organization_row
WHERE organization_row.legacy_company_id = target.company_id;
UPDATE public.templates target SET organization_id = organization_row.id
FROM public.organizations organization_row
WHERE organization_row.legacy_company_id = target.company_id;
UPDATE public.work_ontology_versions target SET organization_id = organization_row.id
FROM public.organizations organization_row
WHERE organization_row.legacy_company_id = target.company_id;
UPDATE public.import_jobs target SET organization_id = organization_row.id
FROM public.organizations organization_row
WHERE organization_row.legacy_company_id = target.company_id;
UPDATE public.admin_user_change_events target SET organization_id = organization_row.id
FROM public.organizations organization_row
WHERE organization_row.legacy_company_id = target.company_id;

DO $organization_tenant_constraints$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'projects','templates','work_ontology_versions','import_jobs','admin_user_change_events'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT NOT VALID',
      v_table,v_table||'_organization_fkey'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK((company_id IS NULL) = (organization_id IS NULL)) NOT VALID',
      v_table,v_table||'_organization_company_parity_check'
    );
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I',v_table,v_table||'_organization_fkey');
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I',v_table,v_table||'_organization_company_parity_check');
  END LOOP;
END
$organization_tenant_constraints$;

ALTER TABLE public.import_jobs ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX projects_organization_idx ON public.projects(organization_id,id);
CREATE INDEX templates_organization_idx ON public.templates(organization_id,family,is_active,version);
CREATE INDEX work_ontology_versions_organization_idx
  ON public.work_ontology_versions(organization_id,status,version);
CREATE INDEX import_jobs_organization_idx ON public.import_jobs(organization_id,created_at,id);
CREATE INDEX admin_user_change_events_organization_idx
  ON public.admin_user_change_events(organization_id,changed_at,id);

CREATE OR REPLACE FUNCTION private.sync_legacy_company_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_organization_id uuid;
  v_company_id text;
BEGIN
  IF NEW.company_id IS NULL AND NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    SELECT organization_row.id INTO v_organization_id
    FROM public.organizations organization_row
    WHERE organization_row.legacy_company_id = NEW.company_id;
    IF v_organization_id IS NULL THEN
      RAISE EXCEPTION 'ORGANIZATION_TENANT_UNKNOWN_COMPANY_ID' USING ERRCODE = '23503';
    END IF;
    NEW.organization_id := v_organization_id;
    RETURN NEW;
  END IF;

  SELECT organization_row.legacy_company_id INTO v_company_id
  FROM public.organizations organization_row
  WHERE organization_row.id = NEW.organization_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_UNKNOWN_ORGANIZATION' USING ERRCODE = '23503';
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_company_id;
  ELSIF NEW.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_IDENTITY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $organization_tenant_triggers$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'projects','templates','work_ontology_versions','import_jobs','admin_user_change_events'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',v_table||'_organization_sync',v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF company_id,organization_id ON public.%I FOR EACH ROW EXECUTE FUNCTION private.sync_legacy_company_organization()',
      v_table||'_organization_sync',v_table
    );
  END LOOP;
END
$organization_tenant_triggers$;

CREATE OR REPLACE FUNCTION private.is_platform_superadmin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.platform_user_roles assignment
    WHERE assignment.user_id = p_user_id
      AND assignment.platform_role = 'PLATFORM_SUPERADMIN'
      AND assignment.status = 'ACTIVE'
  );
$$;

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
    SELECT 1 FROM public.organization_memberships membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_user_id
      AND membership.status = 'ACTIVE'
      AND (p_required_role IS NULL OR membership.organization_role = p_required_role)
  );
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_member_read ON public.organizations
  FOR SELECT TO authenticated USING(
    private.is_platform_superadmin((SELECT auth.uid()))
    OR private.has_active_organization_membership(id,(SELECT auth.uid()),NULL)
  );
CREATE POLICY organization_memberships_scoped_read ON public.organization_memberships
  FOR SELECT TO authenticated USING(
    user_id = (SELECT auth.uid())
    OR private.is_platform_superadmin((SELECT auth.uid()))
    OR private.has_active_organization_membership(
      organization_id,(SELECT auth.uid()),'ORG_ADMIN'
    )
  );
CREATE POLICY platform_user_roles_self_read ON public.platform_user_roles
  FOR SELECT TO authenticated USING(user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.organizations,public.organization_memberships,
  public.platform_user_roles FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.organizations,public.organization_memberships TO authenticated;

REVOKE ALL ON FUNCTION private.sync_legacy_company_organization()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.is_platform_superadmin(uuid),
  private.has_active_organization_membership(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
-- These helpers are referenced by RLS policies. They stay in the unexposed
-- private schema and receive only the execution privilege needed by the
-- authenticated policy evaluator; they are not public Data API RPCs.
GRANT EXECUTE ON FUNCTION private.is_platform_superadmin(uuid),
  private.has_active_organization_membership(uuid,uuid,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_organization_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  RETURN jsonb_build_object(
    'platformSuperadmin',private.is_platform_superadmin(v_user_id),
    'organizations',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'organizationId',organization_row.id,
        'name',organization_row.name,
        'status',organization_row.status,
        'organizationRole',membership.organization_role,
        'membershipStatus',membership.status,
        'legacyCompanyId',organization_row.legacy_company_id
      ) ORDER BY organization_row.name,organization_row.id)
      FROM public.organization_memberships membership
      JOIN public.organizations organization_row
        ON organization_row.id = membership.organization_id
      WHERE membership.user_id = v_user_id AND membership.status = 'ACTIVE'
    ),'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_organization_context()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_organization_context() TO authenticated;

DO $organization_tenant_assertions$
DECLARE
  v_table text;
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.profiles profile
    JOIN public.organizations organization_row
      ON organization_row.legacy_company_id = profile.company_id
    LEFT JOIN public.organization_memberships membership
      ON membership.organization_id = organization_row.id AND membership.user_id = profile.id
    WHERE profile.company_id IS NOT NULL AND membership.user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_MEMBERSHIP_BACKFILL_FAILED';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'projects','templates','work_ontology_versions','import_jobs','admin_user_change_events'
  ] LOOP
    IF EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table
        AND column_name = 'organization_id'
    ) IS NOT TRUE THEN
      RAISE EXCEPTION 'ORGANIZATION_TENANT_COLUMN_MISSING: %',v_table;
    END IF;
  END LOOP;

  IF has_table_privilege('anon','public.organizations','SELECT')
    OR has_table_privilege('anon','public.organization_memberships','SELECT')
    OR has_table_privilege('authenticated','public.organizations','INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.organization_memberships','INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.platform_user_roles','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_TABLE_ACL_FAILED';
  END IF;
END
$organization_tenant_assertions$;

COMMIT;
