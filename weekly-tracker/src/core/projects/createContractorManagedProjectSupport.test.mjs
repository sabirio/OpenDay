// createContractorManagedProjectSupport.test.mjs — Simplification Phase 3D.2.
// Pure-logic tests for the two non-network pieces of the atomic Create
// Project command: resolving the explicit active-Scope WP id list the RPC
// requires (no "null = everything" convenience server-side), and classifying
// the RPC's own canonical error vocabulary into safe application errors.
// Deliberately split from createContractorManagedProjectCommand.js, which
// statically imports services/projectService.js -> lib/supabase.js (needs
// import.meta.env / a real Vite runtime) and so can never load under this
// repo's plain-node *.test.mjs runner. The RPC call itself (the command's
// happy/DB path) is certified end-to-end against a real Postgres instance by
// scripts/certification/certifyCreateContractorManagedProject.mjs — no
// Supabase/network mocking is introduced here.

import { resolveActiveScopeWPIds, classifyCreateError } from './createContractorManagedProjectSupport.js';
import { ZONED_SCOPE_MODEL } from '../../domains/construction/templates/versionedScopeTemplate.js';
import { V2_TEMPLATE_TYPE } from '../../domains/construction/templates/retailFitoutV2.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function zonedTemplateData() {
  return {
    model: ZONED_SCOPE_MODEL,
    templateType: V2_TEMPLATE_TYPE,
    zones: [
      {
        id: 'zone-1',
        label: 'Zone 1',
        categories: [
          {
            id: 'cat-1',
            label: 'Category 1',
            workPackages: [
              { id: 'wp-a', label: 'WP A' },
              { id: 'wp-b', label: 'WP B' },
            ],
          },
        ],
      },
      {
        id: 'zone-2',
        label: 'Zone 2',
        categories: [
          { id: 'cat-2', label: 'Category 2', workPackages: [{ id: 'wp-c', label: 'WP C' }] },
        ],
      },
    ],
    dependencies: [],
  };
}

function pinnedProject(scope) {
  return {
    templateId: 'tpl-1',
    scopeTemplate: { id: 'tpl-1', family: V2_TEMPLATE_TYPE, data: zonedTemplateData() },
    scope,
  };
}

console.log('\nresolveActiveScopeWPIds: no scope = every active WP in the resolved template');
{
  const ids = resolveActiveScopeWPIds(pinnedProject(null));
  check('returns all 3 template WPs', ids.length === 3);
  check('contains wp-a, wp-b, wp-c', ['wp-a', 'wp-b', 'wp-c'].every(id => ids.includes(id)));
}

console.log('\nresolveActiveScopeWPIds: explicit scope.workPackages filters to that subset');
{
  const ids = resolveActiveScopeWPIds(pinnedProject({ workPackages: ['wp-a', 'wp-c'] }));
  check('returns exactly the selected WPs', ids.length === 2 && ids.includes('wp-a') && ids.includes('wp-c'));
  check('excludes the unselected WP', !ids.includes('wp-b'));
}

console.log('\nresolveActiveScopeWPIds: zone-filtered scope narrows to that zone\'s WPs');
{
  const ids = resolveActiveScopeWPIds(pinnedProject({ zones: ['zone-1'] }));
  check('returns only zone-1\'s WPs', ids.length === 2 && ids.includes('wp-a') && ids.includes('wp-b'));
  check('excludes zone-2\'s WP', !ids.includes('wp-c'));
}

console.log('\nresolveActiveScopeWPIds: no resolvable template never fabricates a WP list');
{
  const ids = resolveActiveScopeWPIds({ templateId: null, scopeTemplate: null, scope: null });
  check('returns an empty array, not a guessed/hardcoded list', Array.isArray(ids) && ids.length === 0);
}

console.log('\nclassifyCreateError: every canonical server error code maps to a safe message');
{
  const cases = [
    'EMPTY_SCOPE: at least one active Scope work package is required',
    'STORE_CODE_REQUIRED: store code is required',
    'INVALID_WORK_PACKAGE: a Scope work package id must not be null',
    'DUPLICATE_WORK_PACKAGE: each Scope work package may appear only once',
    'WORK_PACKAGE_OUT_OF_TEMPLATE: every Scope work package must belong to the resolved template',
    'PROJECT_CODE_CONFLICT: a project with this store code already exists',
    'TEMPLATE_NOT_CONFIGURED: no active retail-fitout-v2 scope template is available',
    'NOT_AUTHORIZED: caller cannot create a project for this company',
  ];
  for (const message of cases) {
    const code = message.split(':')[0];
    const result = classifyCreateError({ message }, 'project.create_contractor_managed', 'req-1');
    check(`${code} is classified with matching code`, result?.code === code);
    check(`${code} carries a non-empty safe message that is not the raw server text`, !!result?.message && result.message !== message);
    check(`${code} preserves operation and requestId`, result.operation === 'project.create_contractor_managed' && result.requestId === 'req-1');
    check(`${code} preserves the original error as cause`, result.cause?.message === message);
  }
  check('PROJECT_CODE_CONFLICT is retryable (a fresh store code can succeed)',
    classifyCreateError({ message: 'PROJECT_CODE_CONFLICT: x' }, 'op', 'r').retryable === true);
  check('EMPTY_SCOPE is not retryable as-is (the same payload would fail again)',
    classifyCreateError({ message: 'EMPTY_SCOPE: x' }, 'op', 'r').retryable === false);
}

console.log('\nclassifyCreateError: unrecognized errors fall through (null) to the generic classifier');
{
  const result = classifyCreateError({ message: 'connection reset' }, 'op', 'r');
  check('returns null for an unrecognized message', result === null);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
