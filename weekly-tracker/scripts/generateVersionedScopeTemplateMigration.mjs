import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  materializeRetailFitoutV2TemplateData,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_FAMILY_ID,
  RETAIL_FITOUT_V2_TEMPLATE_ID,
  RETAIL_FITOUT_V2_WP_ID_SHA256,
} from '../src/domains/construction/templates/versionedScopeTemplate.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'src', 'migrations', '041_versioned_scope_templates.sql');
const data = JSON.stringify(materializeRetailFitoutV2TemplateData(), null, 2);

if (data.includes('$scope_template$')) {
  throw new Error('Generated template JSON contains the SQL dollar-quote delimiter.');
}

const sql = `-- 041_versioned_scope_templates.sql
-- Versioned/pinned V2 scope-template foundation.
--
-- Additive only:
-- - retains every legacy template/project column and row;
-- - adds company/global family routing to public.templates;
-- - freezes referenced template semantics at the database boundary;
-- - narrows template RLS to global + caller-company reads and admin writes;
-- - seeds the exact certified Retail Fit-Out V2 definition as global version 1.
--
-- Generated deterministically by:
--   node scripts/generateVersionedScopeTemplateMigration.mjs
-- Certified V2 WP-id SHA-256:
--   ${RETAIL_FITOUT_V2_WP_ID_SHA256}

BEGIN;

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS company_id text;

COMMENT ON COLUMN public.templates.family IS
  'Stable routing family; family_id remains the immutable version-lineage UUID.';
COMMENT ON COLUMN public.templates.company_id IS
  'NULL is a global OpenDay template; non-NULL is private to that company.';

CREATE INDEX IF NOT EXISTS templates_company_family_lookup
  ON public.templates (company_id, family, is_active, version DESC);

CREATE UNIQUE INDEX IF NOT EXISTS templates_owner_family_version_uniq
  ON public.templates (company_id, family, version) NULLS NOT DISTINCT
  WHERE family IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS templates_one_active_per_owner_family
  ON public.templates (company_id, family) NULLS NOT DISTINCT
  WHERE family IS NOT NULL AND is_active;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_template_id_fkey'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_template_id_fkey
      FOREIGN KEY (template_id)
      REFERENCES public.templates(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'templates_versioned_scope_data_check'
      AND conrelid = 'public.templates'::regclass
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_versioned_scope_data_check
      CHECK (
        family IS DISTINCT FROM '${RETAIL_FITOUT_V2_FAMILY}'
        OR (
          jsonb_typeof(data) = 'object'
          AND data->>'schemaVersion' = '1'
          AND data->>'model' = 'zoned'
          AND data->>'templateType' = '${RETAIL_FITOUT_V2_FAMILY}'
          AND jsonb_typeof(data->'zones') = 'array'
          AND jsonb_typeof(data->'dependencies') = 'array'
        )
      )
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.templates
  VALIDATE CONSTRAINT templates_versioned_scope_data_check;

CREATE OR REPLACE FUNCTION public.prevent_referenced_template_semantic_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.projects
    WHERE template_id = OLD.id
  ) AND (
    NEW.data IS DISTINCT FROM OLD.data
    OR NEW.family IS DISTINCT FROM OLD.family
    OR NEW.family_id IS DISTINCT FROM OLD.family_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.version IS DISTINCT FROM OLD.version
  ) THEN
    RAISE EXCEPTION 'REFERENCED_TEMPLATE_IMMUTABLE'
      USING ERRCODE = '23514',
            DETAIL = 'Create a new template version and select it as the default; existing projects remain pinned.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS templates_referenced_semantics_immutable ON public.templates;
CREATE TRIGGER templates_referenced_semantics_immutable
  BEFORE UPDATE ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_referenced_template_semantic_change();

DROP POLICY IF EXISTS "templates_select" ON public.templates;
DROP POLICY IF EXISTS "templates_insert" ON public.templates;
DROP POLICY IF EXISTS "templates_update" ON public.templates;
DROP POLICY IF EXISTS "templates_delete" ON public.templates;

CREATE POLICY "templates_select"
  ON public.templates
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_global_admin()
      OR company_id IS NULL
      OR company_id = public.current_company_id()
    )
  );

CREATE POLICY "templates_insert"
  ON public.templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR (
      public.get_my_role() = 'admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  );

CREATE POLICY "templates_update"
  ON public.templates
  FOR UPDATE
  TO authenticated
  USING (
    public.is_global_admin()
    OR (
      public.get_my_role() = 'admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    public.is_global_admin()
    OR (
      public.get_my_role() = 'admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  );

CREATE POLICY "templates_delete"
  ON public.templates
  FOR DELETE
  TO authenticated
  USING (
    public.is_global_admin()
    OR (
      public.get_my_role() = 'admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  );

INSERT INTO public.templates (
  id,
  name,
  data,
  is_active,
  family_id,
  family,
  company_id,
  version
) VALUES (
  '${RETAIL_FITOUT_V2_TEMPLATE_ID}',
  'Retail Fit-Out (Zoned)',
  $scope_template$
${data}
$scope_template$::jsonb,
  true,
  '${RETAIL_FITOUT_V2_FAMILY_ID}',
  '${RETAIL_FITOUT_V2_FAMILY}',
  NULL,
  1
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
`;

writeFileSync(output, sql, 'utf8');
console.log(`Generated ${output}`);
