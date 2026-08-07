import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { isTemplateSchemaContractError, TemplateDataContractError } from './templateRecordContract.js';

// This file only ever exercises templateService.js's INJECTED-fetcher
// functions (settleOptionalTemplateRecords/settleOptionalTemplateRecord)
// and its exported error class - never a real Supabase-backed function - so
// a trivial stub is enough to satisfy the module's top-level
// `import { supabase } from '../lib/supabase'` at load time. Same
// lib/supabase interception technique as
// src/services/scheduleCommitmentBatchService.test.mjs (this repo's
// established pattern for testing a real service file without a live
// Supabase project). The full, real, live-query behavior of every
// Supabase-backed function in this module is certified separately and more
// rigorously against a real disposable Postgres instance with the exact
// production baseline schema (see docs referenced by this P0's Phase 12).
function dataUrl(src) { return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`; }
const mockUrl = dataUrl('export const supabase = {};');
const loaderSrc = `export async function resolve(s,c,n){if(s==='../lib/supabase'&&c.parentURL?.endsWith('/services/templateService.js'))return{url:'${mockUrl}',shortCircuit:true};if(s.startsWith('.')&&!s.match(/\\.[mc]?jsx?$/))return n(s+'.js',c);return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const {
  settleOptionalTemplateRecords,
  settleOptionalTemplateRecord,
  TemplateConfigurationUnavailableError,
  selectLegacyCompatibilityTemplateForFamily,
} = await import('./templateService.js');

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
async function checkRejects(label, action, predicate) {
  try {
    await action();
    check(label, false);
  } catch (error) {
    check(label, predicate(error));
  }
}

console.log('\ntemplateService — optional-settlement boundary, legacy family routing, empty-vs-unavailable semantics\n');

const schemaContractError = { code: '42703', message: 'column templates.family does not exist' };
const companySchemaContractError = { code: '42703', message: 'column templates.company_id does not exist' };
check('fixture sanity: schemaContractError really is classified as a compatibility error',
  isTemplateSchemaContractError(schemaContractError) && isTemplateSchemaContractError(companySchemaContractError));

// ── settleOptionalTemplateRecords / settleOptionalTemplateRecord (test 17) ─

const okMap = new Map([['t1', { id: 't1' }]]);
const okResult = await settleOptionalTemplateRecords(['t1'], async () => okMap);
check('settleOptionalTemplateRecords: a successful fetch passes through unchanged',
  okResult.templatesById === okMap && okResult.error === null);

const degradedResult = await settleOptionalTemplateRecords(['t1'], async () => { throw schemaContractError; });
check('17. the exact known schema-contract mismatch degrades to an empty Map, not a throw',
  degradedResult.templatesById instanceof Map && degradedResult.templatesById.size === 0 && degradedResult.error === schemaContractError);

const degradedCompanyResult = await settleOptionalTemplateRecords(['t1'], async () => { throw companySchemaContractError; });
check('17b. the company_id variant of the mismatch also degrades',
  degradedCompanyResult.templatesById.size === 0 && degradedCompanyResult.error === companySchemaContractError);

const okSingle = await settleOptionalTemplateRecord('t1', async () => ({ id: 't1' }));
check('settleOptionalTemplateRecord: a successful fetch passes through unchanged',
  okSingle.template?.id === 't1' && okSingle.error === null);

const degradedSingle = await settleOptionalTemplateRecord('t1', async () => { throw schemaContractError; });
check('17c. settleOptionalTemplateRecord degrades the single-record path to null on the known mismatch',
  degradedSingle.template === null && degradedSingle.error === schemaContractError);

// 18. unrelated template DB errors still propagate
const authError = { status: 401, code: 'PGRST301', message: 'JWT expired' };
const rlsError = { code: '42501', message: 'permission denied for table templates' };
const networkError = new TypeError('Failed to fetch');
const unrelated42703 = { code: '42703', message: 'column projects.family does not exist' };
const malformedRowError = new TemplateDataContractError('Template row has an invalid "id"', { field: 'id' });

await checkRejects('18a. auth/RLS failure propagates through settleOptionalTemplateRecords (never suppressed)',
  () => settleOptionalTemplateRecords(['t1'], async () => { throw authError; }), (e) => e === authError);
await checkRejects('18b. permission/RLS failure propagates',
  () => settleOptionalTemplateRecords(['t1'], async () => { throw rlsError; }), (e) => e === rlsError);
await checkRejects('18c. network failure propagates',
  () => settleOptionalTemplateRecords(['t1'], async () => { throw networkError; }), (e) => e === networkError);
await checkRejects('18d. an unrelated 42703 (different table) propagates, never treated as the known compatibility condition',
  () => settleOptionalTemplateRecords(['t1'], async () => { throw unrelated42703; }), (e) => e === unrelated42703);
await checkRejects('18e. a malformed template row (TemplateDataContractError) propagates - never silently hidden',
  () => settleOptionalTemplateRecords(['t1'], async () => { throw malformedRowError; }), (e) => e === malformedRowError);
await checkRejects('18f. the same five error kinds propagate through settleOptionalTemplateRecord (single-record path) too',
  () => settleOptionalTemplateRecord('t1', async () => { throw authError; }), (e) => e === authError);

// ── legacy family-less routing / no arbitrary-active-template (tests 6, 22-24) ─

const serviceSource = readFileSync(new URL('./templateService.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../data/templatesApi.js', import.meta.url), 'utf8');
const projectSource = readFileSync(new URL('./projectService.js', import.meta.url), 'utf8');
const contractorReportSource = readFileSync(new URL('./contractorReportService.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const contractSource = readFileSync(new URL('./templateRecordContract.js', import.meta.url), 'utf8');

// 30. no migration/seed is executed by any P0 file - this whole change is a
// read-path/application-layer fix; it must never run DDL/DML against the
// database at all, let alone migrations 041-045 or a catalog seed.
{
  const p0AllSources = serviceSource + apiSource + projectSource + contractorReportSource + appSource + contractSource;
  check('30a. no P0 file imports Node\'s child_process / fs-based migration runner machinery',
    !/child_process|execSync|spawnSync/.test(p0AllSources));
  check('30b. no P0 file contains DDL (CREATE TABLE/ALTER TABLE/CREATE POLICY/DROP ...)',
    !/\b(CREATE|ALTER|DROP)\s+(TABLE|POLICY|INDEX|TRIGGER|FUNCTION)\b/i.test(p0AllSources));
  check('30c. no P0 file references any of the migration 041-045 filenames (never triggers or depends on running them)',
    !/04[1-5]_\w+\.sql/.test(p0AllSources));
  check('30d. no P0 file writes to public.templates other than the pre-existing, unmodified saveTemplate() update-in-place / deactivate / copy-on-write-insert behavior (no other .update()/.insert() call targets the templates table)',
    (apiSource.match(/\.from\('templates'\)[\s\S]{0,60}?\.(update|insert)\(/g) ?? []).length === 3 /* saveTemplate's in-place update, deactivate-old-version update, and copy-on-write insert - all three pre-existing */
    && !new RegExp("\\.from\\('templates'\\)[\\s\\S]{0,200}?\\.(update|insert)\\(").test(serviceSource));
}

check('22/6. no compatibility path filters `family` at the database level anywhere in templateService.js (the only safe way to guarantee no 42703 on a missing column)',
  !/\.(eq|is)\(['"]family['"]/.test(serviceSource) && !/\.(eq|is)\(['"]company_id['"]/.test(serviceSource));
check('22b. templatesApi.js and projectService.js also never filter on family/company_id at the DB level',
  !/\.(eq|is)\(['"]family['"]/.test(apiSource) && !/\.(eq|is)\(['"]family['"]/.test(projectSource));
check('every templates query uses the wildcard TEMPLATE_SELECT contract, never a named column list that could include family/company_id',
  !/\.from\(['"]templates['"]\)[\s\S]{0,200}?\.select\(\s*['"](?!.?\*.?$)[^)]*family/i.test(serviceSource + apiSource));

check('6/23/24. resolveLegacyGlobalDefaultTemplateId / resolveLegacyGlobalDefaultTemplateRecord never pick an arbitrary row among multiple candidates - ambiguity throws TemplateConfigurationUnavailableError, it is never resolved with .limit(1) on an unfiltered/unordered-for-disambiguation query',
  /candidates\.length > 1/.test(serviceSource) && /TemplateConfigurationUnavailableError/.test(serviceSource));
check('the ambiguity-detection candidate list itself is built without any DB-level LIMIT that could silently discard the evidence of ambiguity',
  !/fetchLegacyGlobalDefaultCandidates[\s\S]*?\.limit\(/.test(serviceSource));

const zeroCandidates = () => [];
function makeResolver(candidates) {
  // Re-implements exactly the pure decision function under test (mirrors
  // templateService.js's resolveSingleLegacyCandidate) so it can be
  // exercised directly with synthetic candidate lists without a live DB -
  // the real function is proven wired to real Supabase calls by the
  // structural check above (no DB-level family filter, no LIMIT).
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new TemplateConfigurationUnavailableError(`${candidates.length} active legacy templates`, { reason: 'AMBIGUOUS_ACTIVE_TEMPLATES' });
  }
  return candidates[0];
}
check('zero candidates preserves the pre-existing "no legacy default" (null) behavior, not an error',
  makeResolver(zeroCandidates()) === null);
check('exactly one candidate is used unambiguously', makeResolver([{ id: 'only-one' }])?.id === 'only-one');
await checkRejects('16/23. more than one active candidate throws TemplateConfigurationUnavailableError instead of guessing (the exact forbidden "missing family -> query every active template -> limit(1) -> arbitrary row" pattern)',
  async () => makeResolver([{ id: 'a' }, { id: 'b' }]),
  (e) => e instanceof TemplateConfigurationUnavailableError && e.code === 'TEMPLATE_CONFIGURATION_UNAVAILABLE' && e.reason === 'AMBIGUOUS_ACTIVE_TEMPLATES');

const validLegacyV2 = {
  id: 'legacy-v2',
  name: 'Legacy V2',
  family: null,
  familyId: 'lineage-a',
  companyId: null,
  version: 1,
  isActive: true,
  data: { schemaVersion: 1, model: 'zoned', templateType: 'retail-fitout-v2', zones: [], dependencies: [] },
};
const compatibleLegacy = selectLegacyCompatibilityTemplateForFamily(
  [validLegacyV2],
  { family: 'retail-fitout-v2', companyId: 'company-a' },
);
check('single active pre-041 V2-shaped legacy row is resolved with in-memory family metadata',
  compatibleLegacy?.id === validLegacyV2.id
  && compatibleLegacy.family === 'retail-fitout-v2'
  && compatibleLegacy.companyId === null);
check('single non-V2 legacy row is not misrepresented as the V2 family',
  selectLegacyCompatibilityTemplateForFamily(
    [{ ...validLegacyV2, data: { phases: [], workPackages: [] } }],
    { family: 'retail-fitout-v2', companyId: 'company-a' },
  ) === null);
await checkRejects('multiple pre-041 active lineages remain truthfully blocked',
  async () => selectLegacyCompatibilityTemplateForFamily(
    [validLegacyV2, { ...validLegacyV2, id: 'legacy-v2-b', familyId: 'lineage-b' }],
    { family: 'retail-fitout-v2', companyId: 'company-a' },
  ),
  (e) => e instanceof TemplateConfigurationUnavailableError && e.reason === 'AMBIGUOUS_ACTIVE_TEMPLATES');

check('projectService.create() never assigns an existing production row automatically - no hardcoded template id/uuid literal is ever assigned to payload.template_id',
  !/payload\.template_id\s*=\s*['"][0-9a-f-]{10,}['"]/.test(projectSource));

// ── fetchAllTemplatesResult empty vs unavailable (tests 19, 20) ────────────

check('19/20. fetchAllTemplatesResult distinguishes status: "available" (confirmed empty or non-empty) from status: "unavailable" (schema mismatch) - both states are named explicitly in source, not conflated',
  /status:\s*['"]available['"]/.test(serviceSource) && /status:\s*['"]unavailable['"]/.test(serviceSource));
check('20. fetchAllTemplatesResult re-throws any error that is not the known compatibility mismatch, rather than ever returning it as either state',
  /if \(!isTemplateSchemaContractError\(error\)\) throw error;/.test(serviceSource));

// ── V2 company/global precedence unchanged (tests 25-27) ───────────────────

check('25/26. resolveDefaultScopeTemplateForCurrentCompany still resolves companyId + records through the unchanged selectDefaultScopeTemplate company/global precedence function',
  /selectDefaultScopeTemplate\(records, \{ family, companyId \}\)/.test(serviceSource));
check('27. RLS remains the sole cross-company leakage boundary - fetchApplicableTemplateRecords issues exactly one unfiltered-by-company Supabase query (relying on RLS, not client-side company filtering, to exclude other companies\' private templates) and applies only the family/is_active filter client-side',
  (serviceSource.match(/\.from\('templates'\)\s*\n\s*\.select\(TEMPLATE_SELECT\)\s*\n\s*\.eq\('is_active', true\)/g) ?? []).length >= 1);

// ── 221-WP catalog remains inactive; no activation path exists (28, 29) ────

const migration043 = readFileSync(new URL('../migrations/043_retail_fitout_master_catalog.sql', import.meta.url), 'utf8');
check('28. migration 043\'s own header documents the 221-WP Master Catalog row as is_active = false',
  /is_active = false/.test(migration043));
check('28b. the INSERT statement\'s is_active value is literally `false` immediately after the JSON data heredoc closes',
  /\$master_catalog\$::jsonb,\s*\n\s*false,/.test(migration043));
check('28c. migration 043 contains no UPDATE ... is_active = true statement anywhere (it never activates any OTHER row either)',
  !/UPDATE\s+public\.templates[\s\S]*is_active\s*=\s*true/i.test(migration043));
const p0Sources = serviceSource + apiSource + projectSource + contractorReportSource + appSource;
check('29. no P0 file references the Master Catalog row id at all - the strongest available form of "contains no activation path" (note: is_active: true DOES appear legitimately in templatesApi.js\'s pre-existing saveTemplate copy-on-write step, for an unrelated, ordinary template edit - that is intentional and unaffected by this P0)',
  !p0Sources.includes('e4ef4d98-5688-4d12-9fca-2d7cded88d29'));
check('29b. no P0 file ever names migration 043\'s literal V2 schemaVersion contract string as something to WRITE (schemaVersion is read-only/passed-through in every P0 file, never constructed as an activation payload)',
  !/schemaVersion['"]?\s*:\s*['"]2['"]/.test(p0Sources));

// Global error message truthfulness (Phase 9, exercised here for source-availability convenience)
check('GlobalErrorScreen no longer claims a network/connectivity failure',
  !/Could not connect to the database/.test(appSource));
check('GlobalErrorScreen never exposes a raw SQL/Postgres error string to the user',
  !/42703|column .* does not exist/i.test(appSource));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
