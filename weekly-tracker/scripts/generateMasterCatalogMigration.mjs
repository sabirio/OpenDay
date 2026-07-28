import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_FAMILY_ID,
  RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID,
  RETAIL_FITOUT_MASTER_CATALOG_VERSION,
  RETAIL_FITOUT_MASTER_CATALOG_LABEL,
  RETAIL_FITOUT_MASTER_CATALOG_WP_ID_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DEFAULT_SCOPE_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_SEMANTIC_SHA256,
} from '../src/domains/construction/templates/versionedScopeTemplate.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'src', 'migrations', '043_retail_fitout_master_catalog.sql');
const data = JSON.stringify(materializeRetailFitoutMasterCatalogTemplateData(), null, 2);

if (data.includes('$master_catalog$')) {
  throw new Error('Generated catalog JSON contains the SQL dollar-quote delimiter.');
}

const sql = `-- 043_retail_fitout_master_catalog.sql
-- Slice 5D — materializes the APPROVED 221-WP Retail Fit-Out Master Catalog
-- as a new, inactive, non-default template VERSION (schemaVersion 2) in the
-- SAME retail-fitout-v2 family/lineage as the certified version-1 template —
-- not a new family.
--
-- Additive only:
-- - inserts exactly ONE new public.templates row (version ${RETAIL_FITOUT_MASTER_CATALOG_VERSION}, is_active = false);
-- - does NOT UPDATE the existing version-1 row (different id, untouched);
-- - does NOT UPDATE/INSERT any public.projects row, no backfill;
-- - does NOT change RLS/policies/grants/functions — 042 already widened the
--   templates_versioned_scope_data_check CHECK constraint to accept
--   schemaVersion 2 rows structurally; no further schema change is needed;
-- - is_active = false means this candidate is excluded from
--   templateService.fetchApplicableTemplateRecords() (.eq('is_active', true)
--   at the query level) and therefore invisible to normal Create-Project
--   default resolution — see Phase 18/19 certification evidence.
--
-- Deliberately NOT set anywhere in this catalog (Slice 5D scope boundary):
-- zone weightMode/fixedWeight, work-package durationPct, non-empty
-- dependencies, blocker/readiness metadata, schedule markers,
-- applicabilityTags. Their absence is a documented "not yet designed"
-- placeholder, not an implied zero/none business value — see
-- versionedScopeTemplate.js's materializeRetailFitoutMasterCatalogTemplateData()
-- header comment and config/TEMPLATE_MODEL.md.
--
-- Generated deterministically by:
--   node scripts/generateMasterCatalogMigration.mjs
-- Canonical source:
--   src/domains/construction/templates/retailFitoutMasterCatalog.js
-- Certification fingerprints (frozen, re-verified by masterCatalogContent.test.mjs):
--   WP-id (ordered, 221):      ${RETAIL_FITOUT_MASTER_CATALOG_WP_ID_SHA256}
--   Default scope (ordered, 78): ${RETAIL_FITOUT_MASTER_CATALOG_DEFAULT_SCOPE_SHA256}
--   Normalized semantic:       ${RETAIL_FITOUT_MASTER_CATALOG_SEMANTIC_SHA256}

BEGIN;

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
  '${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}',
  '${RETAIL_FITOUT_MASTER_CATALOG_LABEL}',
  $master_catalog$
${data}
$master_catalog$::jsonb,
  false,
  '${RETAIL_FITOUT_V2_FAMILY_ID}',
  '${RETAIL_FITOUT_V2_FAMILY}',
  NULL,
  ${RETAIL_FITOUT_MASTER_CATALOG_VERSION}
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
`;

writeFileSync(output, sql, 'utf8');
console.log(`Generated ${output}`);
