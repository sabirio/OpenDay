// projectDetailDrawerModel.test.mjs — Simplification Phase 3D.1, Section 11/14.
// Focused on the withOpeningStatusLabel wiring added in this phase (the
// row.canonical.compatibility.projectSummary short-circuit branch — the
// cheapest fixture path that still exercises the real function).
//
// projectDetailDrawerModel.js transitively imports evaluateProjectState.js,
// which uses Vite-style extensionless imports; same append-.js loader as
// riskEngine.test.mjs / openingReadinessEngine.test.mjs.
import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    try {
      return await nextResolve(specifier + '.js', context);
    } catch {
      return nextResolve(specifier + '/index.js', context);
    }
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { buildProjectDetailDrawerModel } = await import('./projectDetailDrawerModel.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function rowWithCachedSummary({ scheduleOwnershipMode, readinessStatus }) {
  return {
    project: { id: 'p1', scheduleOwnershipMode },
    canonical: {
      compatibility: {
        projectSummary: {
          contractor: {}, pmVisit: {}, risk: {},
          opening: { status: readinessStatus, daysToOpening: 10, targetDate: '2027-01-01', blockerCount: 0, criticalBlockers: [], softBlockers: [] },
        },
      },
    },
  };
}

console.log('\nbuildProjectDetailDrawerModel — null/missing row');
{
  check('null row -> null', buildProjectDetailDrawerModel(null, []) === null);
}

console.log('\nbuildProjectDetailDrawerModel — attaches opening.statusLabel without mutating opening.status');
{
  const row = rowWithCachedSummary({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', readinessStatus: 'Not Assessable' });
  const summary = buildProjectDetailDrawerModel(row, []);
  check('opening.status is untouched (technical value preserved)', summary.opening.status === 'Not Assessable');
  check('opening.statusLabel carries the CONTRACTOR_MANAGED-aware wording', summary.opening.statusLabel === 'Awaiting Contractor Schedule');
}

console.log('\nbuildProjectDetailDrawerModel — AUTO_GENERATED passes readinessStatus through as the label');
{
  const row = rowWithCachedSummary({ scheduleOwnershipMode: 'AUTO_GENERATED', readinessStatus: 'Critical' });
  const summary = buildProjectDetailDrawerModel(row, []);
  check('statusLabel equals status for AUTO_GENERATED', summary.opening.statusLabel === 'Critical' && summary.opening.status === 'Critical');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
