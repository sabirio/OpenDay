import { readFileSync } from 'node:fs';
import {
  TEMPLATE_SELECT,
  fromDBTemplate,
  getTemplateLoadErrorMessage,
  selectActiveLegacyTemplate,
  settleOptionalTemplateRecords,
} from './templateRecordContract.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  OK ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

const serviceSource = readFileSync(new URL('./templateService.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../data/templatesApi.js', import.meta.url), 'utf8');
const projectSource = readFileSync(new URL('./projectService.js', import.meta.url), 'utf8');
const reportSource = readFileSync(new URL('./contractorReportService.js', import.meta.url), 'utf8');
const migration041 = readFileSync(new URL('../migrations/041_versioned_scope_templates.sql', import.meta.url), 'utf8');
const migration043 = readFileSync(new URL('../migrations/043_retail_fitout_master_catalog.sql', import.meta.url), 'utf8');

console.log('\ntemplateRecordContract - production-compatible PostgREST contract');
check('templates reads use a schema-compatible wildcard contract', TEMPLATE_SELECT === '*');
check('production template readers never name family/company_id in a select expression',
  !/\.select\([^\n]*(?:family|company_id)/.test(`${serviceSource}\n${apiSource}`));
check('production template readers never filter on the optional family column',
  !/\.(?:eq|is)\(['"]family['"]/.test(`${serviceSource}\n${apiSource}\n${projectSource}`));

const canonical = fromDBTemplate({
  id: 'canonical', name: 'Canonical display name', family: 'retail-fitout-v2',
  family_id: 'lineage-1', company_id: 'company-a', version: 2, is_active: true,
  data: { templateType: 'retail-fitout-v2', schemaVersion: 1 },
});
check('canonical rows preserve routing family, lineage id, owner, version and display name',
  canonical.name === 'Canonical display name'
  && canonical.family === 'retail-fitout-v2'
  && canonical.familyId === 'lineage-1'
  && canonical.companyId === 'company-a'
  && canonical.version === 2);

const productionLegacy = fromDBTemplate({
  id: 'legacy', name: 'Legacy display name', family_id: 'lineage-legacy',
  version: 4, is_active: true, data: { phases: [] },
});
check('pre-041 rows map without inventing family/company columns',
  productionLegacy.family === null
  && productionLegacy.companyId === null
  && productionLegacy.familyId === 'lineage-legacy'
  && productionLegacy.name === 'Legacy display name');

const compatibleV2 = fromDBTemplate({
  id: 'v2', name: 'V2', family_id: 'lineage-v2', version: 1, is_active: true,
  data: { templateType: 'retail-fitout-v2', schemaVersion: 1 },
});
check('routing family can be derived from canonical template data during rollout',
  compatibleV2.family === 'retail-fitout-v2' && compatibleV2.familyId === 'lineage-v2');

const activeLegacy = selectActiveLegacyTemplate([
  { id: 'v2', family: 'retail-fitout-v2', is_active: true, version: 2, data: {} },
  { id: 'legacy-new', is_active: true, version: 3, data: {} },
  { id: 'legacy-old', is_active: false, version: 2, data: {} },
]);
check('legacy active-template selection still excludes versioned routing families', activeLegacy?.id === 'legacy-new');

const schemaMessage = getTemplateLoadErrorMessage({ code: '42703' });
check('42703 is reported as scoped schema drift, never as database unreachable',
  /schema.*out of sync/i.test(schemaMessage) && !/connect|network|unreachable/i.test(schemaMessage));
check('project and report startup hydration use the non-fatal template boundary',
  projectSource.includes('fetchOptionalTemplateRecordsByIds')
  && reportSource.includes('fetchOptionalTemplateRecordsByIds'));

const contractError = { code: '42703', message: 'column templates.family does not exist' };
const optional = await settleOptionalTemplateRecords(['template-1'], async () => { throw contractError; });
check('a template-only 42703 settles to an empty hydration map without rejecting loaded parent data',
  optional.templatesById instanceof Map
  && optional.templatesById.size === 0
  && optional.error === contractError);

check('migration 041 remains the canonical owner of family and keeps family_id as lineage',
  /ADD COLUMN IF NOT EXISTS family text/.test(migration041)
  && /family_id remains the immutable version-lineage UUID/.test(migration041));
check('schemaVersion 2 catalog remains inactive',
  /is_active = false/.test(migration043)
  && !/UPDATE\s+public\.templates[\s\S]*is_active\s*=\s*true/i.test(migration043));
check('project template pinning remains unchanged', /template_id:\s*project\.templateId\s*\|\|\s*null/.test(projectSource));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
