-- 151_product_capability_catalog.sql
-- Phase 3: canonical commercial product capabilities and dependency graph.
-- This catalog is deliberately separate from project_capability_catalog,
-- which remains per-user authorization inside a project.

BEGIN;

CREATE TABLE public.product_capability_groups(
  code text PRIMARY KEY CHECK(code ~ '^[A-Z][A-Z0-9_]*$'),
  label text NOT NULL CHECK(btrim(label) <> ''),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','RETIRED')),
  sort_order integer NOT NULL CHECK(sort_order > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sort_order)
);

CREATE TABLE public.product_capability_catalog(
  id text PRIMARY KEY CHECK(id ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'),
  group_code text NOT NULL REFERENCES public.product_capability_groups(code) ON DELETE RESTRICT,
  label text NOT NULL CHECK(btrim(label) <> ''),
  description text NOT NULL CHECK(btrim(description) <> ''),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','RETIRED')),
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(config_schema) = 'object'),
  sort_order integer NOT NULL CHECK(sort_order > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_code,sort_order)
);

CREATE INDEX product_capability_catalog_active_group_idx
  ON public.product_capability_catalog(group_code,sort_order,id)
  WHERE status = 'ACTIVE';

CREATE TABLE public.product_capability_dependencies(
  capability_id text NOT NULL REFERENCES public.product_capability_catalog(id) ON DELETE RESTRICT,
  required_capability_id text NOT NULL REFERENCES public.product_capability_catalog(id) ON DELETE RESTRICT,
  dependency_type text NOT NULL DEFAULT 'REQUIRED' CHECK(dependency_type = 'REQUIRED'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(capability_id,required_capability_id),
  CHECK(capability_id <> required_capability_id)
);

CREATE INDEX product_capability_dependencies_required_idx
  ON public.product_capability_dependencies(required_capability_id,capability_id);

CREATE OR REPLACE FUNCTION private.prevent_product_capability_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_ID_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_capability_identity_immutable
BEFORE UPDATE OF id ON public.product_capability_catalog
FOR EACH ROW EXECUTE FUNCTION private.prevent_product_capability_identity_change();

CREATE OR REPLACE FUNCTION private.assert_product_capability_graph_acyclic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS(
    WITH RECURSIVE dependency_path(root_id,current_id,path,cycle) AS(
      SELECT dependency.capability_id,dependency.required_capability_id,
        ARRAY[dependency.capability_id,dependency.required_capability_id]::text[],
        dependency.capability_id = dependency.required_capability_id
      FROM public.product_capability_dependencies dependency
      UNION ALL
      SELECT dependency_path.root_id,dependency.required_capability_id,
        dependency_path.path||dependency.required_capability_id,
        dependency.required_capability_id = ANY(dependency_path.path)
      FROM dependency_path
      JOIN public.product_capability_dependencies dependency
        ON dependency.capability_id = dependency_path.current_id
      WHERE NOT dependency_path.cycle
    )
    SELECT 1 FROM dependency_path WHERE cycle
  ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_DEPENDENCY_CYCLE' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER product_capability_dependency_graph_acyclic
AFTER INSERT OR UPDATE ON public.product_capability_dependencies
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.assert_product_capability_graph_acyclic();

INSERT INTO public.product_capability_groups(code,label,sort_order) VALUES
  ('CORE','Core',10),
  ('PORTFOLIO_OWNER','Portfolio / Owner',20),
  ('BUSINESS_DEVELOPMENT','Business Development',30),
  ('DELIVERY','Delivery',40),
  ('COMMERCIAL','Commercial',50),
  ('PROCUREMENT','Procurement',60),
  ('ADD_ONS','Add-ons',70);

INSERT INTO public.product_capability_catalog(
  id,group_code,label,description,config_schema,sort_order
) VALUES
  ('core.projects','CORE','Projects','Create and operate project records','{"limits":{"maxActiveProjects":"nonNegativeInteger"}}',10),
  ('core.team','CORE','Team','Manage organization and project colleagues','{}',20),
  ('core.documents','CORE','Documents','Manage project documents and controlled files','{}',30),
  ('core.notifications','CORE','Notifications','Receive and manage operational notifications','{}',40),

  ('portfolio.overview','PORTFOLIO_OWNER','Portfolio','View multi-project portfolio status and priorities','{}',10),
  ('budgeting.departmental','PORTFOLIO_OWNER','Budgeting','Prepare, review and approve departmental budgets','{}',20),
  ('financials.cost','PORTFOLIO_OWNER','Cost Financials','Manage project cost baselines and commitments','{}',30),
  ('tendering.main','PORTFOLIO_OWNER','Tendering','Prepare tender packages and run bidder rounds','{"limits":{"maxActiveTenders":"nonNegativeInteger"}}',40),
  ('construction.control','PORTFOLIO_OWNER','Construction Control','Control construction delivery and progress','{}',50),
  ('weekly.reports','PORTFOLIO_OWNER','Weekly Reports','Prepare and review weekly progress reports','{}',60),
  ('site.visits','PORTFOLIO_OWNER','Site Visits','Record consultant and project-manager site visits','{}',70),
  ('snags.management','PORTFOLIO_OWNER','Snags','Capture, issue and close construction observations','{}',80),

  ('opportunities.pipeline','BUSINESS_DEVELOPMENT','Opportunities','Track pre-award commercial opportunities','{}',10),
  ('estimating.delivery','BUSINESS_DEVELOPMENT','Estimating','Estimate internal and external delivery cost','{}',20),
  ('pricing.commercial','BUSINESS_DEVELOPMENT','Pricing','Build selling price from cost and commercial rules','{}',30),
  ('proposals.issue','BUSINESS_DEVELOPMENT','Proposals','Create and issue customer-facing proposals','{}',40),
  ('proposals.revisions','BUSINESS_DEVELOPMENT','Proposal Revisions','Manage immutable commercial proposal revisions','{}',50),

  ('design.delivery','DELIVERY','Design Delivery','Manage design-stage delivery workflows','{}',10),
  ('construction.delivery','DELIVERY','Construction Delivery','Manage contractor construction delivery workflows','{}',20),
  ('schedule.management','DELIVERY','Schedule','Plan, submit and control project schedules','{}',30),
  ('deliverables.management','DELIVERY','Deliverables','Track controlled project deliverables','{}',40),

  ('commercial.cost','COMMERCIAL','Commercial Cost','Track commercial cost, commitments and forecasts','{}',10),
  ('commercial.revenue','COMMERCIAL','Commercial Revenue','Track contract and forecast revenue','{}',20),
  ('commercial.margin','COMMERCIAL','Commercial Margin','Calculate profit and forecast margin','{}',30),
  ('commercial.forecast','COMMERCIAL','Commercial Forecast','Maintain forecast-at-completion commercial views','{}',40),
  ('variations.management','COMMERCIAL','Variations','Manage additional works and commercial changes','{}',50),
  ('payments.management','COMMERCIAL','Payments','Plan, certify and track external payment events','{}',60),

  ('procurement.management','PROCUREMENT','Procurement','Plan and manage package procurement','{}',10),
  ('subcontractor.tendering','PROCUREMENT','Subcontractor Tendering','Run tenders for subcontractor packages','{}',20),
  ('supplier.management','PROCUREMENT','Supplier Management','Manage supplier participation and records','{}',30),

  ('benchmarking.cost','ADD_ONS','Benchmarking','Compare verified cost and delivery benchmarks','{}',10),
  ('ai.intelligence','ADD_ONS','AI Intelligence','Use governed AI-assisted analysis','{"limits":{"monthlyActions":"nonNegativeInteger"}}',20),
  ('analytics.advanced','ADD_ONS','Advanced Analytics','Use advanced cross-project analytics','{}',30);

INSERT INTO public.product_capability_dependencies(
  capability_id,required_capability_id
) VALUES
  ('core.team','core.projects'),
  ('portfolio.overview','core.projects'),
  ('budgeting.departmental','core.projects'),
  ('financials.cost','core.projects'),
  ('tendering.main','core.projects'),
  ('construction.control','core.projects'),
  ('weekly.reports','construction.control'),
  ('site.visits','construction.control'),
  ('snags.management','construction.control'),
  ('estimating.delivery','opportunities.pipeline'),
  ('pricing.commercial','estimating.delivery'),
  ('proposals.issue','pricing.commercial'),
  ('proposals.issue','core.documents'),
  ('proposals.revisions','proposals.issue'),
  ('design.delivery','core.projects'),
  ('construction.delivery','core.projects'),
  ('schedule.management','core.projects'),
  ('deliverables.management','core.projects'),
  ('commercial.cost','core.projects'),
  ('commercial.revenue','core.projects'),
  ('commercial.margin','commercial.cost'),
  ('commercial.margin','commercial.revenue'),
  ('commercial.forecast','commercial.cost'),
  ('variations.management','core.projects'),
  ('payments.management','commercial.cost'),
  ('procurement.management','core.projects'),
  ('subcontractor.tendering','procurement.management'),
  ('supplier.management','procurement.management'),
  ('benchmarking.cost','financials.cost'),
  ('ai.intelligence','core.projects'),
  ('analytics.advanced','portfolio.overview');

SET CONSTRAINTS product_capability_dependency_graph_acyclic IMMEDIATE;

ALTER TABLE public.product_capability_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_capability_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_capability_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_capability_groups_read
  ON public.product_capability_groups FOR SELECT TO authenticated USING(true);
CREATE POLICY product_capability_catalog_read
  ON public.product_capability_catalog FOR SELECT TO authenticated USING(true);
CREATE POLICY product_capability_dependencies_read
  ON public.product_capability_dependencies FOR SELECT TO authenticated USING(true);

REVOKE ALL ON TABLE
  public.product_capability_groups,
  public.product_capability_catalog,
  public.product_capability_dependencies
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE
  public.product_capability_groups,
  public.product_capability_catalog,
  public.product_capability_dependencies
  TO authenticated;

REVOKE ALL ON FUNCTION
  private.prevent_product_capability_identity_change(),
  private.assert_product_capability_graph_acyclic()
  FROM PUBLIC,anon,authenticated,service_role;

DO $product_capability_catalog_assertions$
BEGIN
  IF (SELECT count(*) FROM public.product_capability_groups) <> 7
    OR (SELECT count(*) FROM public.product_capability_catalog) <> 33
    OR (SELECT count(*) FROM public.product_capability_dependencies) <> 31 THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_SEED_COUNT_MISMATCH';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.product_capability_catalog capability
    WHERE capability.id = ANY(ARRAY[
      'PROJECT_MANAGE','TEAM_MANAGE','TENDER_MANAGE','BOQ_PREPARE',
      'BID_REVIEW','COMMERCIAL_APPROVE','EXECUTIVE_SUMMARY'
    ])
  ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_PROJECT_PERMISSION_REUSED';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM public.product_capability_dependencies dependency
    LEFT JOIN public.product_capability_catalog capability
      ON capability.id = dependency.capability_id
    LEFT JOIN public.product_capability_catalog required
      ON required.id = dependency.required_capability_id
    WHERE capability.id IS NULL OR required.id IS NULL
  ) THEN
    RAISE EXCEPTION 'PRODUCT_CAPABILITY_UNKNOWN_DEPENDENCY';
  END IF;
END
$product_capability_catalog_assertions$;

COMMIT;
