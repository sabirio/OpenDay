-- 152_plans_and_organization_entitlements.sql
-- Phase 4: Plans are reusable defaults; Organization entitlement records
-- preserve explicit commercial source, config and validity independently.

BEGIN;

CREATE TABLE public.subscription_plans(
  id text PRIMARY KEY CHECK(id ~ '^[a-z][a-z0-9_]*$'),
  name text NOT NULL CHECK(btrim(name) <> ''),
  description text NOT NULL CHECK(btrim(description) <> ''),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','RETIRED')),
  sort_order integer NOT NULL CHECK(sort_order > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sort_order)
);

CREATE TABLE public.plan_capabilities(
  plan_id text NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  capability_id text NOT NULL REFERENCES public.product_capability_catalog(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  default_config jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK(jsonb_typeof(default_config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(plan_id,capability_id)
);

CREATE INDEX plan_capabilities_capability_idx
  ON public.plan_capabilities(capability_id,plan_id)
  WHERE enabled;

CREATE TABLE public.organization_subscriptions(
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  plan_id text NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN('ACTIVE','TRIAL','SUSPENDED','CANCELLED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX organization_subscriptions_plan_status_idx
  ON public.organization_subscriptions(plan_id,status,organization_id);

CREATE TABLE public.organization_entitlements(
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  capability_id text NOT NULL REFERENCES public.product_capability_catalog(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK(source IN(
    'plan','manual_override','trial','enterprise_contract'
  )),
  source_priority smallint GENERATED ALWAYS AS(
    CASE source
      WHEN 'manual_override' THEN 400
      WHEN 'enterprise_contract' THEN 300
      WHEN 'trial' THEN 200
      WHEN 'plan' THEN 100
    END
  ) STORED,
  enabled boolean NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(config) = 'object'),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,capability_id,source),
  CHECK(expires_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX organization_entitlements_resolution_idx
  ON public.organization_entitlements(
    organization_id,capability_id,source_priority DESC,expires_at
  );
CREATE INDEX organization_entitlements_capability_idx
  ON public.organization_entitlements(capability_id,organization_id);

CREATE OR REPLACE FUNCTION private.prevent_subscription_plan_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'SUBSCRIPTION_PLAN_ID_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscription_plan_identity_immutable
BEFORE UPDATE OF id ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION private.prevent_subscription_plan_identity_change();

CREATE OR REPLACE FUNCTION private.assert_plan_capability_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM public.plan_capabilities plan_capability
    JOIN public.product_capability_dependencies dependency
      ON dependency.capability_id = plan_capability.capability_id
    WHERE plan_capability.enabled
      AND NOT EXISTS(
        SELECT 1 FROM public.plan_capabilities required
        WHERE required.plan_id = plan_capability.plan_id
          AND required.capability_id = dependency.required_capability_id
          AND required.enabled
      )
  ) THEN
    RAISE EXCEPTION 'PLAN_CAPABILITY_DEPENDENCY_MISSING' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER plan_capability_dependencies_valid
AFTER INSERT OR UPDATE OR DELETE ON public.plan_capabilities
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.assert_plan_capability_dependencies();

INSERT INTO public.subscription_plans(id,name,description,sort_order) VALUES
  ('owner','Owner','Portfolio, budgeting, tendering and construction control defaults',10),
  ('design','Design','Business development, design delivery and margin defaults',20),
  ('contractor','Contractor','Bid, delivery, procurement and commercial defaults',30),
  ('enterprise','Enterprise / Custom','All catalog capabilities as configurable defaults',40);

INSERT INTO public.plan_capabilities(plan_id,capability_id,default_config)
SELECT 'owner',capability_id,
  CASE capability_id
    WHEN 'core.projects' THEN '{"limits":{"maxActiveProjects":25}}'::jsonb
    WHEN 'tendering.main' THEN '{"limits":{"maxActiveTenders":10}}'::jsonb
    ELSE '{}'::jsonb
  END
FROM unnest(ARRAY[
  'core.projects','core.team','core.documents','core.notifications',
  'portfolio.overview','budgeting.departmental','financials.cost','tendering.main',
  'construction.control','weekly.reports','site.visits','snags.management',
  'schedule.management','commercial.cost','variations.management',
  'payments.management','procurement.management'
]) capability_id;

INSERT INTO public.plan_capabilities(plan_id,capability_id,default_config)
SELECT 'design',capability_id,
  CASE capability_id
    WHEN 'core.projects' THEN '{"limits":{"maxActiveProjects":25}}'::jsonb
    ELSE '{}'::jsonb
  END
FROM unnest(ARRAY[
  'core.projects','core.team','core.documents','core.notifications',
  'opportunities.pipeline','estimating.delivery','pricing.commercial',
  'proposals.issue','proposals.revisions','design.delivery',
  'schedule.management','deliverables.management','commercial.cost',
  'commercial.revenue','commercial.margin','commercial.forecast',
  'variations.management','payments.management'
]) capability_id;

INSERT INTO public.plan_capabilities(plan_id,capability_id,default_config)
SELECT 'contractor',capability_id,
  CASE capability_id
    WHEN 'core.projects' THEN '{"limits":{"maxActiveProjects":50}}'::jsonb
    WHEN 'tendering.main' THEN '{"limits":{"maxActiveTenders":25}}'::jsonb
    ELSE '{}'::jsonb
  END
FROM unnest(ARRAY[
  'core.projects','core.team','core.documents','core.notifications',
  'opportunities.pipeline','estimating.delivery','pricing.commercial',
  'proposals.issue','proposals.revisions','tendering.main',
  'construction.control','weekly.reports','snags.management',
  'construction.delivery','schedule.management','deliverables.management',
  'commercial.cost','commercial.revenue','commercial.margin',
  'commercial.forecast','variations.management','payments.management',
  'procurement.management','subcontractor.tendering','supplier.management'
]) capability_id;

INSERT INTO public.plan_capabilities(plan_id,capability_id,default_config)
SELECT 'enterprise',capability.id,
  CASE capability.id
    WHEN 'ai.intelligence' THEN '{"limits":{"monthlyActions":500}}'::jsonb
    ELSE '{}'::jsonb
  END
FROM public.product_capability_catalog capability
WHERE capability.status = 'ACTIVE';

SET CONSTRAINTS plan_capability_dependencies_valid IMMEDIATE;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_plans_read
  ON public.subscription_plans FOR SELECT TO authenticated USING(true);
CREATE POLICY plan_capabilities_read
  ON public.plan_capabilities FOR SELECT TO authenticated USING(true);
CREATE POLICY organization_subscriptions_scoped_read
  ON public.organization_subscriptions FOR SELECT TO authenticated USING(
    private.is_platform_superadmin((SELECT auth.uid()))
    OR private.has_active_organization_membership(
      organization_id,(SELECT auth.uid()),NULL
    )
  );
CREATE POLICY organization_entitlements_scoped_read
  ON public.organization_entitlements FOR SELECT TO authenticated USING(
    private.is_platform_superadmin((SELECT auth.uid()))
    OR private.has_active_organization_membership(
      organization_id,(SELECT auth.uid()),NULL
    )
  );

REVOKE ALL ON TABLE
  public.subscription_plans,
  public.plan_capabilities,
  public.organization_subscriptions,
  public.organization_entitlements
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE
  public.subscription_plans,
  public.plan_capabilities,
  public.organization_subscriptions,
  public.organization_entitlements
  TO authenticated;

REVOKE ALL ON FUNCTION
  private.prevent_subscription_plan_identity_change(),
  private.assert_plan_capability_dependencies()
  FROM PUBLIC,anon,authenticated,service_role;

DO $plans_entitlements_assertions$
BEGIN
  IF (SELECT count(*) FROM public.subscription_plans) <> 4
    OR (SELECT count(*) FROM public.plan_capabilities
        WHERE plan_id = 'enterprise' AND enabled) <> 33 THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_SEED_MISMATCH';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM public.plan_capabilities plan_capability
    JOIN public.product_capability_dependencies dependency
      ON dependency.capability_id = plan_capability.capability_id
    WHERE plan_capability.enabled
      AND NOT EXISTS(
        SELECT 1 FROM public.plan_capabilities required
        WHERE required.plan_id = plan_capability.plan_id
          AND required.capability_id = dependency.required_capability_id
          AND required.enabled
      )
  ) THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_DEFAULT_DEPENDENCY_MISSING';
  END IF;
  IF EXISTS(SELECT 1 FROM public.organization_subscriptions)
    OR EXISTS(SELECT 1 FROM public.organization_entitlements) THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_EXISTING_ORGS_ASSIGNED_WITHOUT_DECISION';
  END IF;
END
$plans_entitlements_assertions$;

COMMIT;
