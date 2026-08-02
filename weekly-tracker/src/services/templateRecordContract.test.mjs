import { readFileSync } from 'node:fs';
import {
  TEMPLATE_SELECT,
  fromDBTemplate,
  getTemplateLoadErrorMessage,
  isTemplateSchemaContractError,
  selectActiveLegacyTemplate,
  settleOptionalTemplateRecord,
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

async function checkRejects(label, action, expectedError) {
  try {
    await action();
    check(label, false);
  } catch (error) {
    check(label, error === expectedError);
  }
}

const serviceSource = readFileSync(new URL('./templateService.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../data/templatesApi.js', import.meta.url), 'utf8');
const projectSource = readFileSync(new URL('./projectService.js', import.meta.url), 'utf8');
const reportSource = readFileSync(new URL('./contractorReportService.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../pages/TemplateEditor.jsx', import.meta.url), 'utf8');
const migration041 = readFileSync(new URL('../migrations/041_versioned_scope_templates.sql', import.meta.url), 'utf8');
const migration043 = readFileSync(new URL('../migrations/043_retail_fitout_master_catalog.sql', import.meta.url), 'utf8');

console.log('\ntemplateRecordContract - production-compatible PostgREST contract');
check('templates reads use the temporary rollout-compatible wildcard contract',
  TEMPLATE_SELECT === '*' && /Temporary rollout-compatible read contract/.test(
    readFileSync(new URL('./templateRecordContract.js', import.meta.url), 'utf8')));
check('production template readers never name family/company_id in a select expression',
  !/\.select\([^\n]*(?:family|company_id)/.test(`${serviceSource}\n${apiSource}`));
check('every production template read uses the centralized temporary contract',
  !/\.from\(['"]templates['"]\)[\s\S]{0,120}?\.select\(['"]\*['"]\)/.test(`${serviceSource}\n${apiSource}`)
  && (serviceSource.match(/\.select\(TEMPLATE_SELECT\)/g) ?? []).length === 5
  && (apiSource.match(/\.select\(TEMPLATE_SELECT\)/g) ?? []).length === 1);
check('production template readers never filter on the optional family column',
  !/\.(?:eq|is)\(['"]family['"]/.test(`${serviceSource}\n${apiSource}\n${projectSource}`));

const canonical = fromDBTemplate({
  id: 'canonical', name: 'Canonical display name', family: 'retail-fitout-v2',
  family_id: 'lineage-1', company_id: 'company-a', version: 2, is_active: true,
  data: { templateType: 'stale-non-routing-value', schemaVersion: 1 },
});
check('versioned company rows prefer explicit routing family and preserve lineage, owner, version and display name',
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

const unrelatedLegacyType = fromDBTemplate({
  id: 'legacy-standard', name: 'Legacy standard', family_id: 'lineage-standard',
  version: 1, is_active: true, data: { templateType: 'standard_with_demo', phases: [] },
});
check('unrecognized legacy templateType fails closed instead of becoming a routing family',
  unrelatedLegacyType.family === null && unrelatedLegacyType.familyId === 'lineage-standard');

const missingBoth = fromDBTemplate({
  id: 'legacy-no-routing', name: 'Legacy', family_id: 'lineage-only',
  version: 1, is_active: true, data: { phases: [] },
});
check('missing family and templateType fails closed without substituting family_id',
  missingBoth.family === null && missingBoth.familyId === 'lineage-only');

let malformedDataError = null;
try {
  fromDBTemplate({ id: 'malformed', family_id: 'lineage-malformed', data: 'not-an-object' });
} catch (error) {
  malformedDataError = error;
}
check('malformed template data fails closed instead of inventing a routing family',
  malformedDataError instanceof TypeError);

const activeLegacy = selectActiveLegacyTemplate([
  { id: 'v2', family: 'retail-fitout-v2', is_active: true, version: 2, data: {} },
  { id: 'legacy-new', is_active: true, version: 3, data: {} },
  { id: 'legacy-old', is_active: false, version: 2, data: {} },
]);
check('legacy active-template selection still excludes versioned routing families', activeLegacy?.id === 'legacy-new');

const contractError = { code: '42703', message: 'column templates.family does not exist' };
const companyContractError = { code: '42703', message: 'column templates.company_id does not exist' };
const schemaMessage = getTemplateLoadErrorMessage(contractError);
check('42703 is reported as scoped schema drift, never as database unreachable',
  /schema.*out of sync/i.test(schemaMessage) && !/connect|network|unreachable/i.test(schemaMessage));
check('project and report startup hydration use the non-fatal template boundary',
  projectSource.includes('fetchOptionalTemplateRecordsByIds')
  && reportSource.includes('fetchOptionalTemplateRecordsByIds'));

const optional = await settleOptionalTemplateRecords(['template-1'], async () => { throw contractError; });
check('a template-only 42703 settles to an empty hydration map without rejecting loaded parent data',
  optional.templatesById instanceof Map
  && optional.templatesById.size === 0
  && optional.error === contractError);

const optionalOne = await settleOptionalTemplateRecord('template-1', async () => { throw companyContractError; });
check('the rollout-compatible company_id 42703 settles one template to null',
  optionalOne.template === null && optionalOne.error === companyContractError);
check('only exact missing rollout columns are recognized as compatibility errors',
  isTemplateSchemaContractError(contractError)
  && isTemplateSchemaContractError(companyContractError)
  && !isTemplateSchemaContractError({ code: '42703', message: 'column projects.family does not exist' })
  && !isTemplateSchemaContractError({ code: '42703', message: 'column templates.unexpected does not exist' })
  && !isTemplateSchemaContractError({ code: '42703' }));

const nonCompatibilityErrors = [
  ['authentication failure', { status: 401, code: 'PGRST301', message: 'JWT expired' }],
  ['authorization/RLS failure', { status: 403, code: '42501', message: 'permission denied' }],
  ['network failure', new TypeError('Failed to fetch')],
  ['timeout', Object.assign(new Error('Timed out'), { name: 'AbortError' })],
  ['HTTP 5xx', { status: 503, code: 'PGRST000', message: 'Service unavailable' }],
  ['unrelated PostgreSQL error', { code: '23514', message: 'check constraint failed' }],
  ['unrelated 42703', { code: '42703', message: 'column projects.family does not exist' }],
  ['malformed record', malformedDataError],
];
for (const [label, error] of nonCompatibilityErrors) {
  await checkRejects(`${label} is never suppressed by optional template hydration`,
    () => settleOptionalTemplateRecords(['template-1'], async () => { throw error; }), error);
}

check('real project fetch rejection still reaches the global error screen',
  /projectService\.getAll\(\)[\s\S]*?\.catch\([\s\S]*?setProjectsState\('error'\)/.test(appSource)
  && /projectsState === 'error'[\s\S]*?<GlobalErrorScreen/.test(appSource));
check('real contractor-report fetch failures occur before optional template hydration and remain fatal',
  reportSource.indexOf('if (reportsRes.error) throw reportsRes.error')
    < reportSource.indexOf('fetchOptionalTemplateRecordsByIds((projectsRes.data')
  && reportSource.indexOf('if (error) throw error', reportSource.indexOf('fetchContractorReportsForProjectRaw'))
    < reportSource.indexOf('fetchOptionalTemplateRecordById(projectRow?.template_id)'));
check('Template Editor renders the scoped schema mismatch while retaining its existing draft',
  editorSource.includes('fetchActiveTemplateResult')
  && editorSource.includes('setLoadError(message)')
  && /loadError[\s\S]*role="alert"/.test(editorSource));
check('successful parent project and report data remain visible after compatible template degradation',
  projectSource.includes('scopeTemplate: project.templateId ? (templatesById.get(project.templateId) ?? null) : null')
  && reportSource.includes('reports:  reportsRes.data || []')
  && reportSource.includes('scopeTemplate: templatesById.get(project.template_id) ?? null'));

check('pre-041 copy-on-write never names additive columns and post-041 retains both when present',
  /if \(Object\.hasOwn\(current, 'family'\)\) versionedRow\.family = current\.family/.test(apiSource)
  && /if \(Object\.hasOwn\(current, 'company_id'\)\) versionedRow\.company_id = current\.company_id/.test(apiSource));
check('copy-on-write preserves family_id lineage and active-version behavior',
  /family_id: current\.family_id/.test(apiSource)
  && /\.eq\('family_id', current\.family_id\)/.test(apiSource)
  && /\.update\(\{ is_active: false \}\)/.test(apiSource)
  && /is_active: true/.test(apiSource));
check('migration 041 safely leaves interim pre-041 rows as legacy family-null records',
  /ADD COLUMN IF NOT EXISTS family text/.test(migration041)
  && !/UPDATE\s+public\.templates\s+SET\s+family\s*=/i.test(migration041)
  && /WHERE family IS NOT NULL/.test(migration041));

check('migration 041 remains the canonical owner of family and keeps family_id as lineage',
  /ADD COLUMN IF NOT EXISTS family text/.test(migration041)
  && /family_id remains the immutable version-lineage UUID/.test(migration041));
check('schemaVersion 2 catalog remains inactive',
  /is_active = false/.test(migration043)
  && !/UPDATE\s+public\.templates[\s\S]*is_active\s*=\s*true/i.test(migration043));
check('project template pinning remains unchanged', /template_id:\s*project\.templateId\s*\|\|\s*null/.test(projectSource));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
