import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_FAMILY_ID,
  RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID,
  RETAIL_FITOUT_MASTER_CATALOG_VERSION,
  RETAIL_FITOUT_MASTER_CATALOG_ELIGIBILITY_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_BASE_EFFORT_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_CATEGORY_FACTOR_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_GROUP_WEIGHT_SETTINGS_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_WEIGHT_METADATA_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256,
} from '../src/domains/construction/templates/versionedScopeTemplate.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'src', 'migrations', '044_master_catalog_weight_calibration.sql');
const weightedData = materializeRetailFitoutMasterCatalogTemplateData();
const preWeightData = structuredClone(weightedData);

for (const zone of preWeightData.zones) {
  delete zone.areaBasis;
  delete zone.anchorPct;
  delete zone.defaultWeight;
  for (const category of zone.categories) {
    delete category.categoryFactor;
    for (const wp of category.workPackages) {
      delete wp.constructionProgressEligible;
      delete wp.baseEffort;
    }
  }
}

const preWeightJson = JSON.stringify(preWeightData, null, 2);
const weightedJson = JSON.stringify(weightedData, null, 2);
for (const delimiter of ['$pre_weight$', '$weighted_catalog$']) {
  if (preWeightJson.includes(delimiter) || weightedJson.includes(delimiter)) {
    throw new Error(`Generated catalog JSON contains SQL delimiter ${delimiter}`);
  }
}

const sql = `-- 044_master_catalog_weight_calibration.sql
-- Slice 5E.2B — finalizes the exact inactive/unreferenced Slice 5D candidate
-- in place with the owner-approved Construction Progress weight metadata.
--
-- Generated deterministically by:
--   node scripts/generateMasterCatalogWeightMigration.mjs
-- Canonical source:
--   src/domains/construction/templates/retailFitoutMasterCatalog.js
--
-- Fail-closed guards:
-- - exact global retail-fitout-v2 candidate id/family/family_id/version;
-- - data.schemaVersion = 2 and is_active = false;
-- - zero public.projects references;
-- - data equals the exact mechanically stripped pre-weight source form,
--   proving the frozen 3/26/221 structure, 78 default scope, Slice 5D
--   fingerprints, and absence of prior weight metadata.
--
-- Only public.templates.data for this one row is updated. No v1/project/RLS/
-- grant/policy/schema/default/activation change is performed. Reapplication
-- fails explicitly because the row is no longer in the pre-weight state.
--
-- Weight fingerprints:
--   eligibility:          ${RETAIL_FITOUT_MASTER_CATALOG_ELIGIBILITY_SHA256}
--   eligible baseEffort:  ${RETAIL_FITOUT_MASTER_CATALOG_BASE_EFFORT_SHA256}
--   category factors:     ${RETAIL_FITOUT_MASTER_CATALOG_CATEGORY_FACTOR_SHA256}
--   group settings:       ${RETAIL_FITOUT_MASTER_CATALOG_GROUP_WEIGHT_SETTINGS_SHA256}
--   full weight metadata: ${RETAIL_FITOUT_MASTER_CATALOG_WEIGHT_METADATA_SHA256}
--   operational template: ${RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256}

BEGIN;

DO $migration$
DECLARE
  candidate_count integer;
  project_reference_count integer;
  affected_rows integer;
  current_data jsonb;
BEGIN
  SELECT count(*)
    INTO candidate_count
    FROM public.templates
   WHERE id = '${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}'
     AND family = '${RETAIL_FITOUT_V2_FAMILY}'
     AND family_id = '${RETAIL_FITOUT_V2_FAMILY_ID}'
     AND company_id IS NULL
     AND version = ${RETAIL_FITOUT_MASTER_CATALOG_VERSION}
     AND data->>'schemaVersion' = '2'
     AND is_active = false;

  IF candidate_count <> 1 THEN
    RAISE EXCEPTION 'MASTER_CATALOG_WEIGHT_CANDIDATE_IDENTITY_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  SELECT data
    INTO current_data
    FROM public.templates
   WHERE id = '${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}'
   FOR UPDATE;

  SELECT count(*)
    INTO project_reference_count
    FROM public.projects
   WHERE template_id = '${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';

  IF project_reference_count <> 0 THEN
    RAISE EXCEPTION 'MASTER_CATALOG_WEIGHT_CANDIDATE_REFERENCED'
      USING ERRCODE = '23514';
  END IF;

  IF current_data IS DISTINCT FROM $pre_weight$
${preWeightJson}
$pre_weight$::jsonb THEN
    RAISE EXCEPTION 'MASTER_CATALOG_WEIGHT_PRECONDITION_MISMATCH'
      USING ERRCODE = '23514',
            DETAIL = 'Expected the exact frozen Slice 5D pre-weight candidate.';
  END IF;

  UPDATE public.templates
     SET data = $weighted_catalog$
${weightedJson}
$weighted_catalog$::jsonb
   WHERE id = '${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'MASTER_CATALOG_WEIGHT_UPDATE_COUNT_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
END
$migration$;

COMMIT;
`;

writeFileSync(output, sql, 'utf8');
console.log(`Generated ${output}`);
