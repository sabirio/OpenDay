#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RETAIL_FITOUT_WORK_ONTOLOGY_V1,
} from '../src/domains/workOntology/retailFitoutOntologyV1.js';
import {
  RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1,
} from '../src/domains/workOntology/retailFitoutExecutionClassificationV1.js';

export function materializeWorkOntologyMigrationPayload() {
  const ontology = RETAIL_FITOUT_WORK_ONTOLOGY_V1;
  const nextOrderByDiscipline = new Map();

  return {
    version: {
      id: ontology.id,
      company_id: ontology.companyId,
      schema_version: ontology.schemaVersion,
      version: ontology.version,
      label: ontology.label,
      status: 'PUBLISHED',
      is_active: true,
    },
    departments: ontology.departments.map(item => ({
      id: item.id,
      code: item.code,
      label: item.label,
      display_order: item.displayOrder,
    })),
    disciplines: ontology.disciplines.map(item => ({
      id: item.id,
      department_id: item.departmentId,
      code: item.code,
      label: item.label,
      display_order: item.displayOrder,
      scope_selectable: item.scopeSelectable,
      budget_selectable: item.budgetSelectable,
    })),
    work_groups: ontology.workGroups.map(item => {
      const displayOrder = (nextOrderByDiscipline.get(item.disciplineId) ?? 0) + 10;
      nextOrderByDiscipline.set(item.disciplineId, displayOrder);
      return {
        id: item.id,
        discipline_id: item.disciplineId,
        code: item.code,
        label: item.label,
        display_order: displayOrder,
      };
    }),
    boq_item_definitions: ontology.boqItemDefinitions.map(item => ({
      id: item.id,
      work_group_id: item.workGroupId,
      code: item.code,
      label: item.label,
      default_unit: item.defaultUnit,
    })),
    execution_classifications: RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1.map(item => ({
      execution_work_package_id: item.executionWorkPackageId,
      kind: item.kind.toUpperCase(),
      work_group_id: item.workGroupId ?? null,
      reason_code: item.reasonCode ?? null,
    })),
  };
}

export function renderWorkOntologyMigration() {
  const payload = JSON.stringify(materializeWorkOntologyMigrationPayload(), null, 2);
  return `-- 060_work_ontology_foundation.sql
-- Versioned Master Work Ontology persistence foundation.
-- Generated deterministically by:
--   node scripts/generateWorkOntologyMigration.mjs

BEGIN;

-- The local roadmap database may already contain the schema-v1 ontology.
-- Release the immutability guards only inside this transaction so the
-- canonical schema-v2 seed can upgrade that local foundation in place.
DO $$
BEGIN
  IF to_regclass('public.work_ontology_versions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_version_immutable ON public.work_ontology_versions';
  END IF;
  IF to_regclass('public.work_ontology_disciplines') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_disciplines_immutable ON public.work_ontology_disciplines';
  END IF;
  IF to_regclass('public.work_ontology_departments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_departments_immutable ON public.work_ontology_departments';
  END IF;
  IF to_regclass('public.work_ontology_work_groups') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_work_groups_immutable ON public.work_ontology_work_groups';
  END IF;
  IF to_regclass('public.work_ontology_boq_item_definitions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_boq_definitions_immutable ON public.work_ontology_boq_item_definitions';
  END IF;
  IF to_regclass('public.work_ontology_execution_classifications') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_execution_classifications_immutable ON public.work_ontology_execution_classifications';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.work_ontology_versions (
  id uuid PRIMARY KEY,
  company_id text,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  version integer NOT NULL CHECK (version > 0),
  label text NOT NULL CHECK (btrim(label) <> ''),
  status text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  retired_at timestamptz,
  CONSTRAINT work_ontology_versions_active_status_check
    CHECK (NOT is_active OR status = 'PUBLISHED')
);

CREATE UNIQUE INDEX IF NOT EXISTS work_ontology_versions_owner_version_uniq
  ON public.work_ontology_versions (company_id, version) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS work_ontology_versions_one_active_per_owner
  ON public.work_ontology_versions (company_id) NULLS NOT DISTINCT
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.work_ontology_departments (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  display_order integer NOT NULL,
  PRIMARY KEY (ontology_version_id, id),
  UNIQUE (ontology_version_id, code)
);

CREATE TABLE IF NOT EXISTS public.work_ontology_disciplines (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  department_id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  display_order integer NOT NULL,
  scope_selectable boolean NOT NULL DEFAULT true,
  budget_selectable boolean NOT NULL DEFAULT true,
  PRIMARY KEY (ontology_version_id, id),
  UNIQUE (ontology_version_id, code),
  FOREIGN KEY (ontology_version_id, department_id)
    REFERENCES public.work_ontology_departments(ontology_version_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE public.work_ontology_disciplines
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS budget_selectable boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.work_ontology_work_groups (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  discipline_id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  display_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (ontology_version_id, id),
  UNIQUE (ontology_version_id, code),
  FOREIGN KEY (ontology_version_id, discipline_id)
    REFERENCES public.work_ontology_disciplines(ontology_version_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE public.work_ontology_work_groups
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.work_ontology_boq_item_definitions (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  default_unit text NOT NULL CHECK (btrim(default_unit) <> ''),
  PRIMARY KEY (ontology_version_id, id),
  UNIQUE (ontology_version_id, code),
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.work_ontology_execution_classifications (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  execution_work_package_id text NOT NULL CHECK (btrim(execution_work_package_id) <> ''),
  kind text NOT NULL CHECK (kind IN ('MAPPED', 'DEFERRED', 'LIFECYCLE')),
  work_group_id uuid,
  reason_code text,
  PRIMARY KEY (ontology_version_id, execution_work_package_id),
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT work_ontology_execution_classification_shape_check CHECK (
    (kind = 'MAPPED' AND work_group_id IS NOT NULL AND reason_code IS NULL)
    OR
    (kind IN ('DEFERRED', 'LIFECYCLE') AND work_group_id IS NULL AND btrim(reason_code) <> '')
  )
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS work_ontology_version_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_work_ontology_version_id_fkey'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_work_ontology_version_id_fkey
      FOREIGN KEY (work_ontology_version_id)
      REFERENCES public.work_ontology_versions(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

CREATE TEMP TABLE work_ontology_seed_payload ON COMMIT DROP AS
SELECT $work_ontology$
${payload}
$work_ontology$::jsonb AS data;

INSERT INTO public.work_ontology_versions (
  id, company_id, schema_version, version, label, status, is_active, published_at
)
SELECT
  (data->'version'->>'id')::uuid,
  data->'version'->>'company_id',
  (data->'version'->>'schema_version')::integer,
  (data->'version'->>'version')::integer,
  data->'version'->>'label',
  data->'version'->>'status',
  (data->'version'->>'is_active')::boolean,
  now()
FROM work_ontology_seed_payload
ON CONFLICT (id) DO UPDATE SET
  schema_version = EXCLUDED.schema_version,
  label = EXCLUDED.label,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  published_at = COALESCE(public.work_ontology_versions.published_at, EXCLUDED.published_at);

INSERT INTO public.work_ontology_departments (
  ontology_version_id, id, code, label, display_order
)
SELECT
  (data->'version'->>'id')::uuid,
  row.id, row.code, row.label, row.display_order
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'departments') AS row(
  id uuid, code text, label text, display_order integer
)
ON CONFLICT (ontology_version_id, id) DO UPDATE SET
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order;

INSERT INTO public.work_ontology_disciplines (
  ontology_version_id, id, department_id, code, label, display_order, scope_selectable, budget_selectable
)
SELECT
  (data->'version'->>'id')::uuid,
  row.id, row.department_id, row.code, row.label, row.display_order, row.scope_selectable, row.budget_selectable
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'disciplines') AS row(
  id uuid, department_id uuid, code text, label text, display_order integer, scope_selectable boolean, budget_selectable boolean
)
ON CONFLICT (ontology_version_id, id) DO UPDATE SET
  department_id = EXCLUDED.department_id,
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  scope_selectable = EXCLUDED.scope_selectable,
  budget_selectable = EXCLUDED.budget_selectable;

INSERT INTO public.work_ontology_work_groups (
  ontology_version_id, id, discipline_id, code, label, display_order, is_active
)
SELECT
  (data->'version'->>'id')::uuid,
  row.id, row.discipline_id, row.code, row.label, row.display_order, true
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'work_groups') AS row(
  id uuid, discipline_id uuid, code text, label text, display_order integer
)
ON CONFLICT (ontology_version_id, id) DO UPDATE SET
  discipline_id = EXCLUDED.discipline_id,
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  is_active = true;

UPDATE public.work_ontology_work_groups target
SET is_active = false
FROM work_ontology_seed_payload payload
WHERE target.ontology_version_id = (payload.data->'version'->>'id')::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(payload.data->'work_groups') AS desired(id uuid)
    WHERE desired.id = target.id
  );

INSERT INTO public.work_ontology_boq_item_definitions (
  ontology_version_id, id, work_group_id, code, label, default_unit
)
SELECT
  (data->'version'->>'id')::uuid,
  row.id, row.work_group_id, row.code, row.label, row.default_unit
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'boq_item_definitions') AS row(
  id uuid, work_group_id uuid, code text, label text, default_unit text
)
ON CONFLICT (ontology_version_id, id) DO UPDATE SET
  work_group_id = EXCLUDED.work_group_id,
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  default_unit = EXCLUDED.default_unit;

INSERT INTO public.work_ontology_execution_classifications (
  ontology_version_id, execution_work_package_id, kind, work_group_id, reason_code
)
SELECT
  (data->'version'->>'id')::uuid,
  row.execution_work_package_id, row.kind, row.work_group_id, row.reason_code
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'execution_classifications') AS row(
  execution_work_package_id text, kind text, work_group_id uuid, reason_code text
)
ON CONFLICT (ontology_version_id, execution_work_package_id) DO UPDATE SET
  kind = EXCLUDED.kind,
  work_group_id = EXCLUDED.work_group_id,
  reason_code = EXCLUDED.reason_code;

ALTER TABLE public.work_ontology_disciplines
  ALTER COLUMN department_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_ontology_disciplines_department_fkey'
      AND conrelid = 'public.work_ontology_disciplines'::regclass
  ) THEN
    ALTER TABLE public.work_ontology_disciplines
      ADD CONSTRAINT work_ontology_disciplines_department_fkey
      FOREIGN KEY (ontology_version_id, department_id)
      REFERENCES public.work_ontology_departments(ontology_version_id, id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.prevent_immutable_work_ontology_version_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  is_referenced boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE work_ontology_version_id = OLD.id
  ) INTO is_referenced;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' OR is_referenced THEN
      RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_IMMUTABLE'
        USING ERRCODE = '23514',
              DETAIL = 'Published or referenced ontology versions cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF (OLD.status <> 'DRAFT' OR is_referenced) AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.label IS DISTINCT FROM OLD.label
  ) THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_IMMUTABLE'
      USING ERRCODE = '23514',
            DETAIL = 'Create a new ontology version; existing projects remain pinned.';
  END IF;

  IF OLD.status <> 'DRAFT' AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_IMMUTABLE'
      USING ERRCODE = '23514',
            DETAIL = 'Published or retired ontology versions cannot return to draft.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_immutable_work_ontology_child_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_version_id uuid;
  target_status text;
  is_referenced boolean;
BEGIN
  target_version_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.ontology_version_id ELSE OLD.ontology_version_id END;
  SELECT status INTO target_status
  FROM public.work_ontology_versions
  WHERE id = target_version_id;
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE work_ontology_version_id = target_version_id
  ) INTO is_referenced;

  IF target_status <> 'DRAFT' OR is_referenced THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_CONTENT_IMMUTABLE'
      USING ERRCODE = '23514',
            DETAIL = 'Create a new ontology version; published or referenced content cannot change.';
  END IF;


  IF TG_OP = 'UPDATE' AND NEW.ontology_version_id IS DISTINCT FROM OLD.ontology_version_id THEN
    SELECT status INTO target_status
    FROM public.work_ontology_versions
    WHERE id = NEW.ontology_version_id;
    SELECT EXISTS (
      SELECT 1 FROM public.projects WHERE work_ontology_version_id = NEW.ontology_version_id
    ) INTO is_referenced;
    IF target_status <> 'DRAFT' OR is_referenced THEN
      RAISE EXCEPTION 'WORK_ONTOLOGY_CONTENT_IMMUTABLE'
        USING ERRCODE = '23514',
              DETAIL = 'Content cannot be moved into a published or referenced ontology version.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS work_ontology_version_immutable ON public.work_ontology_versions;
CREATE TRIGGER work_ontology_version_immutable
  BEFORE UPDATE OR DELETE ON public.work_ontology_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_version_change();

DROP TRIGGER IF EXISTS work_ontology_departments_immutable ON public.work_ontology_departments;
CREATE TRIGGER work_ontology_departments_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_departments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();
DROP TRIGGER IF EXISTS work_ontology_disciplines_immutable ON public.work_ontology_disciplines;
CREATE TRIGGER work_ontology_disciplines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_disciplines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();
DROP TRIGGER IF EXISTS work_ontology_work_groups_immutable ON public.work_ontology_work_groups;
CREATE TRIGGER work_ontology_work_groups_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_work_groups
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();
DROP TRIGGER IF EXISTS work_ontology_boq_definitions_immutable ON public.work_ontology_boq_item_definitions;
CREATE TRIGGER work_ontology_boq_definitions_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_boq_item_definitions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();
DROP TRIGGER IF EXISTS work_ontology_execution_classifications_immutable ON public.work_ontology_execution_classifications;
CREATE TRIGGER work_ontology_execution_classifications_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_execution_classifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();

ALTER TABLE public.work_ontology_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_disciplines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_work_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_boq_item_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_execution_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_ontology_versions_select" ON public.work_ontology_versions;
CREATE POLICY "work_ontology_versions_select" ON public.work_ontology_versions
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_global_admin()
      OR company_id IS NULL
      OR company_id = public.current_company_id()
    )
  );

DROP POLICY IF EXISTS "work_ontology_departments_select" ON public.work_ontology_departments;
CREATE POLICY "work_ontology_departments_select" ON public.work_ontology_departments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));
DROP POLICY IF EXISTS "work_ontology_disciplines_select" ON public.work_ontology_disciplines;
CREATE POLICY "work_ontology_disciplines_select" ON public.work_ontology_disciplines
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));
DROP POLICY IF EXISTS "work_ontology_work_groups_select" ON public.work_ontology_work_groups;
CREATE POLICY "work_ontology_work_groups_select" ON public.work_ontology_work_groups
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));
DROP POLICY IF EXISTS "work_ontology_boq_item_definitions_select" ON public.work_ontology_boq_item_definitions;
CREATE POLICY "work_ontology_boq_item_definitions_select" ON public.work_ontology_boq_item_definitions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));
DROP POLICY IF EXISTS "work_ontology_execution_classifications_select" ON public.work_ontology_execution_classifications;
CREATE POLICY "work_ontology_execution_classifications_select" ON public.work_ontology_execution_classifications
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));

REVOKE ALL ON TABLE public.work_ontology_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_departments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_disciplines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_work_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_boq_item_definitions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_execution_classifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.work_ontology_versions TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_departments TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_disciplines TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_work_groups TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_boq_item_definitions TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_execution_classifications TO authenticated;

REVOKE ALL ON FUNCTION public.prevent_immutable_work_ontology_version_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_immutable_work_ontology_child_change() FROM PUBLIC, anon, authenticated;

COMMIT;
`;
}

export function renderWorkOntologyRollbackVerification() {
  const migration = renderWorkOntologyMigration().replace(/COMMIT;\s*$/, '');
  return `${migration}
DO $verify_work_ontology$
DECLARE
  actual_count integer;
BEGIN
  SELECT count(*) INTO actual_count FROM public.work_ontology_departments;
  IF actual_count <> 6 THEN RAISE EXCEPTION 'Expected 6 departments, got %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.work_ontology_disciplines;
  IF actual_count <> 12 THEN RAISE EXCEPTION 'Expected 12 disciplines, got %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.work_ontology_work_groups;
  IF actual_count <> 141 THEN RAISE EXCEPTION 'Expected 141 work groups, got %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.work_ontology_boq_item_definitions;
  IF actual_count <> 3 THEN RAISE EXCEPTION 'Expected 3 BOQ definitions, got %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.work_ontology_execution_classifications;
  IF actual_count <> 221 THEN RAISE EXCEPTION 'Expected 221 classifications, got %', actual_count; END IF;
  IF has_table_privilege('anon', 'public.work_ontology_versions', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous role unexpectedly has ontology SELECT';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.work_ontology_versions', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated role is missing ontology SELECT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid IN (
      'public.work_ontology_versions'::regclass,
      'public.work_ontology_departments'::regclass,
      'public.work_ontology_disciplines'::regclass,
      'public.work_ontology_work_groups'::regclass,
      'public.work_ontology_boq_item_definitions'::regclass,
      'public.work_ontology_execution_classifications'::regclass
    ) AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'An ontology table is missing RLS';
  END IF;

  BEGIN
    UPDATE public.work_ontology_disciplines
    SET label = label || ' changed'
    WHERE ontology_version_id = '${RETAIL_FITOUT_WORK_ONTOLOGY_V1.id}';
    RAISE EXCEPTION 'Published ontology mutation unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM <> 'WORK_ONTOLOGY_CONTENT_IMMUTABLE' THEN RAISE; END IF;
  END;
END
$verify_work_ontology$;

ROLLBACK;
`;
}

const migrationUrl = new URL('../src/migrations/060_work_ontology_foundation.sql', import.meta.url);
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`))) {
  writeFileSync(migrationUrl, renderWorkOntologyMigration(), 'utf8');
  console.log(`Generated ${fileURLToPath(migrationUrl)}`);
}
