// masterCatalogContent.test.mjs — Slice 5D: materialization of the APPROVED
// 221-WP Retail Fit-Out Master Catalog as an inactive, non-default
// templates.version=2 candidate. Pure/source-level (no live DB — the
// migration's persisted-payload equivalence is verified by extracting the
// embedded JSON from the migration file itself, mirroring
// versionedScopeTemplateMigration.test.mjs's own convention). Full live-row
// certification against the local database is Phase 21's job.
//
// Run: node src/domains/construction/templates/masterCatalogContent.test.mjs

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  MASTER_CATALOG_GROUPS,
  MASTER_CATALOG_DEFAULT_SCOPE_WORK_PACKAGE_IDS,
  ALL_MASTER_CATALOG_WORK_PACKAGES,
} from './retailFitoutMasterCatalog.js';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  materializeRetailFitoutV2TemplateData,
  isMasterCatalogTemplateData,
  validateMasterCatalogTemplateData,
  getTemplateContractVersion,
  MASTER_CATALOG_SCHEMA_VERSION,
  SCOPE_TEMPLATE_SCHEMA_VERSION,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_FAMILY_ID,
  RETAIL_FITOUT_V2_TEMPLATE_ID,
  RETAIL_FITOUT_V2_WP_ID_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID,
  RETAIL_FITOUT_MASTER_CATALOG_VERSION,
  RETAIL_FITOUT_MASTER_CATALOG_WP_ID_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DEFAULT_SCOPE_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_SEMANTIC_SHA256,
  resolveProjectScopeTemplate,
  selectDefaultScopeTemplate,
} from './versionedScopeTemplate.js';
import { buildNewProjectDraft } from '../../../core/projects/scope/newProjectScopeOrchestration.js';
import { getDefaultScopeWorkPackageIds } from './versionedScopeTemplate.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const data = materializeRetailFitoutMasterCatalogTemplateData();
const allWPs = data.zones.flatMap(z => z.categories.flatMap(c => c.workPackages));
const groupCounts = data.zones.map(z => ({
  id: z.id,
  categories: z.categories.length,
  core: z.categories.flatMap(c => c.workPackages).filter(wp => wp.catalogClass === 'core').length,
  optional: z.categories.flatMap(c => c.workPackages).filter(wp => wp.catalogClass === 'optional').length,
  specialized: z.categories.flatMap(c => c.workPackages).filter(wp => wp.catalogClass === 'specialized').length,
  total: z.categories.flatMap(c => c.workPackages).length,
}));

console.log('\n1-11. Exact catalog metrics (source materializer)');
check('1. exact catalog count = 221', allWPs.length === 221);
check('2. categories = 26', data.zones.reduce((s, z) => s + z.categories.length, 0) === 26);
check('3. groups = 3', data.zones.length === 3);
check('4. Core = 78', allWPs.filter(wp => wp.catalogClass === 'core').length === 78);
check('5. Optional = 114', allWPs.filter(wp => wp.catalogClass === 'optional').length === 114);
check('6. Specialized = 29', allWPs.filter(wp => wp.catalogClass === 'specialized').length === 29);
check('7. default scope = 78', data.defaultScope.workPackageIds.length === 78);
check('11. expected group/category counts (by group)',
  JSON.stringify(groupCounts) === JSON.stringify([
    { id: 'project_wide', categories: 12, core: 41, optional: 56, specialized: 22, total: 119 },
    { id: 'sales', categories: 8, core: 24, optional: 35, specialized: 5, total: 64 },
    { id: 'boh', categories: 6, core: 13, optional: 23, specialized: 2, total: 38 },
  ]));

console.log('\n8-10. Uniqueness / existence validation');
{
  const defaultIds = data.defaultScope.workPackageIds;
  check('8. default IDs unique', new Set(defaultIds).size === defaultIds.length);
  const catalogIdSet = new Set(allWPs.map(wp => wp.id));
  check('9. all default IDs exist in the catalog', defaultIds.every(id => catalogIdSet.has(id)));
  const allIds = allWPs.map(wp => wp.id);
  check('10. all WP IDs unique (221 of 221)', new Set(allIds).size === allIds.length && allIds.length === 221);
}

console.log('\nStructural + application-layer validation (isMasterCatalogTemplateData / validateMasterCatalogTemplateData)');
check('structurally valid Master Catalog template', isMasterCatalogTemplateData(data));
check('zero validation issues (defaultScope/catalogClass all well-formed)', validateMasterCatalogTemplateData(data).length === 0);
check('no category is empty', data.zones.every(z => z.categories.every(c => c.workPackages.length > 0)));
check('every WP belongs to exactly one category/zone (flat count matches nested count)',
  ALL_MASTER_CATALOG_WORK_PACKAGES.length === 221);

console.log('\n12-14. Fingerprints + source/persisted equivalence');
{
  const wpIds = allWPs.map(wp => wp.id);
  const wpFingerprint = createHash('sha256').update(wpIds.join('\n')).digest('hex');
  check('12. catalog source fingerprint matches frozen constant', wpFingerprint === RETAIL_FITOUT_MASTER_CATALOG_WP_ID_SHA256);
  const defaultFingerprint = createHash('sha256').update(data.defaultScope.workPackageIds.join('\n')).digest('hex');
  check('default-scope fingerprint matches frozen constant', defaultFingerprint === RETAIL_FITOUT_MASTER_CATALOG_DEFAULT_SCOPE_SHA256);
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]));
    return v;
  }
  const semanticSubset = {
    schemaVersion: data.schemaVersion,
    zones: data.zones.map(z => ({
      id: z.id, label: z.label,
      categories: z.categories.map(c => ({
        id: c.id, label: c.label,
        workPackages: c.workPackages.map(wp => ({ id: wp.id, label: wp.label, catalogClass: wp.catalogClass })),
      })),
    })),
    defaultScope: { workPackageIds: [...data.defaultScope.workPackageIds] },
  };
  const semanticFingerprint = createHash('sha256').update(JSON.stringify(canon(semanticSubset))).digest('hex');
  check('normalized semantic fingerprint matches frozen constant', semanticFingerprint === RETAIL_FITOUT_MASTER_CATALOG_SEMANTIC_SHA256);

  const migration = readFileSync(
    new URL('../../../migrations/043_retail_fitout_master_catalog.sql', import.meta.url),
    'utf8',
  );
  const generatedJson = migration.match(/\$master_catalog\$\r?\n([\s\S]+?)\r?\n\$master_catalog\$::jsonb/)?.[1];
  check('13. persisted migration payload is present and parses as JSON', generatedJson != null && JSON.parse(generatedJson) != null);
  const persisted = generatedJson != null ? JSON.parse(generatedJson) : null;
  check('14. source <-> persisted migration payload equivalence (exact)',
    persisted != null && JSON.stringify(persisted) === JSON.stringify(data));
  check('migration inserts exactly ONE row (single VALUES tuple)',
    (migration.match(/INSERT INTO public\.templates/g) ?? []).length === 1);
  check('migration is additive-only (no UPDATE/DELETE, no ALTER, no RLS/policy statements)',
    !/\bUPDATE\s+public\./i.test(migration)
    && !/\bDELETE\s+FROM\b/i.test(migration)
    && !/\bALTER\s+TABLE\b/i.test(migration)
    && !/\bCREATE\s+POLICY\b/i.test(migration)
    && !/\bDROP\s+POLICY\b/i.test(migration));
  check('migration never touches public.projects',
    !/INSERT\s+INTO\s+public\.projects/i.test(migration) && !/UPDATE\s+public\.projects/i.test(migration));
  check('18. candidate is inserted as is_active = false (non-default)', /false,\s*\n\s*'[0-9a-f-]+',\s*\n\s*'retail-fitout-v2',\s*\n\s*NULL,\s*\n\s*2\s*\n\)/.test(migration));
  check('migration seeds templates.version = 2 for the candidate', migration.includes(`\n  ${RETAIL_FITOUT_MASTER_CATALOG_VERSION}\n)`));
  check('migration reuses the SAME family_id as v1 (same lineage, not a new family)',
    migration.includes(`'${RETAIL_FITOUT_V2_FAMILY_ID}'`));
  check('migration reuses the SAME family text as v1', migration.includes(`'${RETAIL_FITOUT_V2_FAMILY}'`));
  check('migration seeds the deterministic candidate template id', migration.includes(`'${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}'`));
}

console.log('\n15-17. Template contract identity');
check('15. data.schemaVersion = 2', data.schemaVersion === MASTER_CATALOG_SCHEMA_VERSION && data.schemaVersion === 2);
check('16. RETAIL_FITOUT_MASTER_CATALOG_VERSION (templates.version) = 2', RETAIL_FITOUT_MASTER_CATALOG_VERSION === 2);
check('17. family unchanged (same routing family as v1)', data.templateType === RETAIL_FITOUT_V2_FAMILY);
check('template version (2) and data.schemaVersion (2) are numerically equal by coincidence only, tracked as separate constants',
  RETAIL_FITOUT_MASTER_CATALOG_VERSION !== SCOPE_TEMPLATE_SCHEMA_VERSION
  && getTemplateContractVersion(data) === MASTER_CATALOG_SCHEMA_VERSION);

console.log('\n19-20. v1 protection + normal-default-resolver safety');
{
  const v1Data = materializeRetailFitoutV2TemplateData();
  const v1WpIds = v1Data.zones.flatMap(z => z.categories.flatMap(c => c.workPackages.map(wp => wp.id)));
  const v1Fingerprint = createHash('sha256').update(v1WpIds.join('\n')).digest('hex');
  check('20. existing v1 fingerprint unchanged', v1Fingerprint === RETAIL_FITOUT_V2_WP_ID_SHA256);
  check('v1 still 91 WPs / 23 categories / 3 zones', v1WpIds.length === 91 && v1Data.zones.reduce((s, z) => s + z.categories.length, 0) === 23 && v1Data.zones.length === 3);
  check('v1 schemaVersion is still 1 (untouched by this slice)', v1Data.schemaVersion === SCOPE_TEMPLATE_SCHEMA_VERSION);

  // 19. selectDefaultScopeTemplate() is the REAL function templateService.js
  // uses (fed active-only records in production, since fetchApplicableTemplateRecords
  // filters is_active=true at the query level) — proven here with BOTH v1
  // (active) and the v2 candidate (inactive) present in the candidate pool.
  const v1Record = { id: RETAIL_FITOUT_V2_TEMPLATE_ID, family: RETAIL_FITOUT_V2_FAMILY, familyId: RETAIL_FITOUT_V2_FAMILY_ID, companyId: null, version: 1, isActive: true, data: v1Data };
  const v2CandidateRecord = { id: RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID, family: RETAIL_FITOUT_V2_FAMILY, familyId: RETAIL_FITOUT_V2_FAMILY_ID, companyId: null, version: 2, isActive: false, data };
  const resolvedDefault = selectDefaultScopeTemplate([v1Record, v2CandidateRecord], { family: RETAIL_FITOUT_V2_FAMILY, companyId: null });
  check('19. normal default resolver still returns v1 even with the v2 candidate present', resolvedDefault?.id === RETAIL_FITOUT_V2_TEMPLATE_ID);

  // The real production query (templateService.fetchApplicableTemplateRecords)
  // filters is_active=true BEFORE selectDefaultScopeTemplate ever runs, so the
  // candidate is structurally excluded even earlier than this call proves.
  const activeOnlyPool = [v1Record, v2CandidateRecord].filter(r => r.isActive);
  check('candidate is excluded from the active-only pool the real query produces', activeOnlyPool.length === 1 && activeOnlyPool[0].id === RETAIL_FITOUT_V2_TEMPLATE_ID);
}

console.log('\n21-24. Temporary explicit pin / default materialization / immutability / catalogClass survival');
{
  const candidateRecord = { id: RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID, family: RETAIL_FITOUT_V2_FAMILY, familyId: RETAIL_FITOUT_V2_FAMILY_ID, companyId: null, version: 2, isActive: false, data };
  const resolved = resolveProjectScopeTemplate({ templateId: candidateRecord.id, scopeTemplate: candidateRecord });
  check('21. temporary explicit pin resolves all 221 catalog WPs', resolved?.workPackages?.length === 221);

  const draft = buildNewProjectDraft({}, candidateRecord);
  check('22. default materialization gives exactly 78', draft.scope.workPackages.length === 78);

  const originalSnapshot = JSON.stringify(data.defaultScope.workPackageIds);
  draft.scope.workPackages.push('injected-id');
  draft.scope.workPackages.length = 0;
  check('23. project custom selection does not mutate template.data.defaultScope', JSON.stringify(data.defaultScope.workPackageIds) === originalSnapshot);
  check('getDefaultScopeWorkPackageIds returns a fresh array each call (not the template\'s own reference)',
    getDefaultScopeWorkPackageIds(data) !== data.defaultScope.workPackageIds);

  const byClass = {};
  for (const wp of resolved.workPackages) byClass[wp.catalogClass] = (byClass[wp.catalogClass] ?? 0) + 1;
  check('24. catalogClass survives read/resolve through resolveProjectScopeTemplate (78/114/29 unchanged)',
    byClass.core === 78 && byClass.optional === 114 && byClass.specialized === 29);
}

console.log('\n25. No defaultSelected duplicate truth');
check('25. no work package carries a defaultSelected field anywhere in the catalog',
  allWPs.every(wp => !Object.prototype.hasOwnProperty.call(wp, 'defaultSelected')));
check('MASTER_CATALOG_GROUPS (raw source) also carries no defaultSelected field',
  MASTER_CATALOG_GROUPS.flatMap(g => g.categories.flatMap(c => c.workPackages)).every(wp => !('defaultSelected' in wp)));
check('default selection is derivable ONLY via defaultScope.workPackageIds membership (spot check: a known non-default id is absent)',
  !MASTER_CATALOG_DEFAULT_SCOPE_WORK_PACKAGE_IDS.includes('common.mep_backbone.fire_hose_cabinet'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
