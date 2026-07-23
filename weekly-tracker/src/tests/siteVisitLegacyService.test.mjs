// siteVisitLegacyService.test.mjs - P0 fix regression: siteVisitService.create()
// (the legacy/non-Gantt PM Site Visit save path) must persist every canonical
// field the submission payload already carries, and the mapped read-back
// shape must expose exactly what ComparisonResultsView.jsx/SiteVisitComparison.jsx
// already read.
// Run: node src/tests/siteVisitLegacyService.test.mjs

import { register } from 'node:module';
function dataUrl(src) { return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`; }
const mockUrl = dataUrl(`export const supabase = globalThis.__siteVisitLegacyTest.supabase;`);
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '../lib/supabase' && context.parentURL?.endsWith('/services/siteVisitService.js')) {
    return { url: '${mockUrl}', shortCircuit: true };
  }
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

let lastInsertPayload = null;
// Simulates a real Postgres row: only the columns actually inserted come
// back non-default, exactly like the live schema's column defaults.
function fakeInsertedRow(payload) {
  return {
    id: 900500,
    project_id: payload.project_id,
    visit_date: payload.visit_date,
    submitted_at: null,
    pm_schedule_assessment: payload.pm_schedule_assessment ?? null,
    demolition_status: null,
    construction_statuses: {},
    testing_statuses: {},
    handover_statuses: {},
    photos: [],
    created_by: null,
    created_at: '2026-07-23T09:51:35.608Z',
    declaration_confirmed: payload.declaration_confirmed ?? false,
    observations: payload.observations ?? null,
    reference_report_id: payload.reference_report_id ?? null,
    pm_work_package_statuses: payload.pm_work_package_statuses ?? null,
    contractor_report_id: null,
    visited_by: payload.visited_by,
    overall_note: payload.overall_note ?? null,
    photo_urls: payload.photo_urls ?? [],
    updated_at: '2026-07-23T09:51:35.608Z',
  };
}

globalThis.__siteVisitLegacyTest = {
  supabase: {
    from(table) {
      return {
        insert(rows) {
          lastInsertPayload = rows[0];
          return {
            select() {
              return { async single() { return { data: fakeInsertedRow(lastInsertPayload), error: null }; } };
            },
          };
        },
      };
    },
    auth: { async getUser() { return { data: { user: { id: 'pm-a' } }, error: null }; } },
  },
};

const { create } = await import('../services/siteVisitService.js');

console.log('\nsiteVisitService.create - legacy (non-Gantt) field persistence (P0 fix)');

// The exact shape SiteVisitReport.jsx's submit() builds for the legacy branch.
const visit = {
  projectId: 950002,
  referenceReportId: '900310',
  visitDate: '2026-07-23',
  pmWorkPackageStatuses: {
    preconstruction: { 'Site setup & hoarding': { observedStatus: 'Completed', progress: 0, issueFound: false, riskLevel: 'None', comment: '', photo: null } },
  },
  pmScheduleAssessment: 'On Track',
  observations: 'Site walk confirms hoarding and setup complete.',
  declarationConfirmed: true,
  visitedBy: 'pm-a',
  photos: ['950002/2026-07/pm-evidence.jpg'],
  photoUrls: ['950002/2026-07/pm-evidence.jpg'],
  submittedAt: '2026-07-23T09:51:00.000Z',
};

const saved = await create(visit);

// 1. Every submitted canonical field is persisted (insert payload check).
check('inserts project_id', lastInsertPayload.project_id === 950002);
check('inserts visited_by', lastInsertPayload.visited_by === 'pm-a');
check('inserts visit_date', lastInsertPayload.visit_date === '2026-07-23');
check('inserts pm_schedule_assessment', lastInsertPayload.pm_schedule_assessment === 'On Track');
check('inserts declaration_confirmed as boolean true', lastInsertPayload.declaration_confirmed === true);
check('inserts reference_report_id as a number, not a string', lastInsertPayload.reference_report_id === 900310);
check('inserts observations (not silently dropped)', lastInsertPayload.observations === 'Site walk confirms hoarding and setup complete.');
check('inserts pm_work_package_statuses', lastInsertPayload.pm_work_package_statuses?.preconstruction?.['Site setup & hoarding']?.observedStatus === 'Completed');
check('inserts photo_urls', lastInsertPayload.photo_urls?.[0] === '950002/2026-07/pm-evidence.jpg');
check('does not touch overall_note (Gantt/atomic path column, left alone)', !('overall_note' in lastInsertPayload));

// 2. Every field reads back correctly (mapRow output, what ComparisonResultsView.jsx reads).
check('read-back: referenceReportId', saved.referenceReportId === 900310);
check('read-back: pmScheduleAssessment', saved.pmScheduleAssessment === 'On Track');
check('read-back: declarationConfirmed', saved.declarationConfirmed === true);
check('read-back: observations (raw column, read directly by ComparisonResultsView.jsx)', saved.observations === 'Site walk confirms hoarding and setup complete.');
check('read-back: pmWorkPackageStatuses (camelCase, was previously unmapped)', saved.pmWorkPackageStatuses?.preconstruction?.['Site setup & hoarding']?.observedStatus === 'Completed');
check('read-back: photoUrls (camelCase, was previously unmapped)', saved.photoUrls?.[0] === '950002/2026-07/pm-evidence.jpg');
check('read-back: visitDate', saved.visitDate === '2026-07-23');

// 3. Missing optional fields remain safe.
console.log('\nsiteVisitService.create - missing optional fields remain safe');
const minimalVisit = { projectId: 950003, visitedBy: 'pm-a', visitDate: '2026-07-24' };
const savedMinimal = await create(minimalVisit);
check('missing referenceReportId becomes null, not NaN/0', lastInsertPayload.reference_report_id === null);
check('missing declarationConfirmed becomes false, not undefined', lastInsertPayload.declaration_confirmed === false);
check('missing pmWorkPackageStatuses becomes {}, not null/undefined', typeof lastInsertPayload.pm_work_package_statuses === 'object' && lastInsertPayload.pm_work_package_statuses !== null);
check('missing observations becomes null safely', savedMinimal.observations === null);
check('empty-string referenceReportId (the "no comparison" dropdown option) becomes null, not 0/NaN', await (async () => {
  await create({ ...minimalVisit, referenceReportId: '' });
  return lastInsertPayload.reference_report_id === null;
})());

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
