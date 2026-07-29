import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  RETAIL_FITOUT_MASTER_CATALOG_BASE_DURATION_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DURATION_AREA_BASIS_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DURATION_BANDS_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DURATION_METADATA_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DURATION_MODE_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_EXCLUDED_SET_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_FINAL_OPERATIONAL_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_MILESTONE_SET_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_REFERENCE_AREAS_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID,
  RETAIL_FITOUT_MASTER_CATALOG_VERSION,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_FAMILY_ID,
} from '../src/domains/construction/templates/versionedScopeTemplate.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'src', 'migrations', '045_master_catalog_duration_calibration.sql');
const durationData = materializeRetailFitoutMasterCatalogTemplateData();
const preDurationData = structuredClone(durationData);
delete preDurationData.durationModel;
for (const zone of preDurationData.zones) {
  for (const category of zone.categories) {
    for (const wp of category.workPackages) delete wp.duration;
  }
}

const preDurationJson = JSON.stringify(preDurationData, null, 2);
const durationJson = JSON.stringify(durationData, null, 2);
for (const delimiter of ['$pre_duration$', '$duration_catalog$']) {
  if (preDurationJson.includes(delimiter) || durationJson.includes(delimiter)) {
    throw new Error(`Generated catalog JSON contains SQL delimiter ${delimiter}`);
  }
}

const sql = `-- 045_master_catalog_duration_calibration.sql
-- Slice 5F.2B — finalizes the exact inactive/unreferenced weighted candidate
-- in place with the owner-approved schema-v2 Duration Model metadata.
--
-- Generated deterministically by:
--   node scripts/generateMasterCatalogDurationMigration.mjs
-- Canonical source:
--   src/domains/construction/templates/retailFitoutMasterCatalog.js
--
-- Fail-closed guards:
-- - exact global retail-fitout-v2 candidate id/family/family_id/version;
-- - data.schemaVersion = 2 and is_active = false;
-- - zero public.projects references;
-- - data equals the exact pre-duration weighted source form, proving frozen
--   structure, default scope, Weight metadata, and absence of prior duration.
--
-- Only public.templates.data for this one row is updated. No v1/project/RLS/
-- grant/policy/schema/default/activation change is performed. Reapplication
-- fails explicitly because the row is no longer in the pre-duration state.
--
-- Duration fingerprints:
--   mode:                 ${RETAIL_FITOUT_MASTER_CATALOG_DURATION_MODE_SHA256}
--   execution base days:  ${RETAIL_FITOUT_MASTER_CATALOG_BASE_DURATION_SHA256}
--   area basis:           ${RETAIL_FITOUT_MASTER_CATALOG_DURATION_AREA_BASIS_SHA256}
--   reference areas:      ${RETAIL_FITOUT_MASTER_CATALOG_REFERENCE_AREAS_SHA256}
--   bands:                ${RETAIL_FITOUT_MASTER_CATALOG_DURATION_BANDS_SHA256}
--   milestone set:        ${RETAIL_FITOUT_MASTER_CATALOG_MILESTONE_SET_SHA256}
--   excluded set:         ${RETAIL_FITOUT_MASTER_CATALOG_EXCLUDED_SET_SHA256}
--   complete Duration:    ${RETAIL_FITOUT_MASTER_CATALOG_DURATION_METADATA_SHA256}
--   final operational:    ${RETAIL_FITOUT_MASTER_CATALOG_FINAL_OPERATIONAL_SHA256}

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
    RAISE EXCEPTION 'MASTER_CATALOG_DURATION_CANDIDATE_IDENTITY_MISMATCH'
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
    RAISE EXCEPTION 'MASTER_CATALOG_DURATION_CANDIDATE_REFERENCED'
      USING ERRCODE = '23514';
  END IF;

  IF current_data IS DISTINCT FROM $pre_duration$
${preDurationJson}
$pre_duration$::jsonb THEN
    RAISE EXCEPTION 'MASTER_CATALOG_DURATION_PRECONDITION_MISMATCH'
      USING ERRCODE = '23514',
            DETAIL = 'Expected the exact frozen weighted pre-duration candidate.';
  END IF;

  UPDATE public.templates
     SET data = $duration_catalog$
${durationJson}
$duration_catalog$::jsonb
   WHERE id = '${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'MASTER_CATALOG_DURATION_UPDATE_COUNT_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
END
$migration$;

COMMIT;
`;

writeFileSync(output, sql, 'utf8');
console.log(`Generated ${output}`);
