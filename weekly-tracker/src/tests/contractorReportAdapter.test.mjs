// contractorReportAdapter.test.mjs - legacy adapter contract.
// Run: node src/tests/contractorReportAdapter.test.mjs

import { adaptContractorReportToLegacy } from '../services/contractorReportAdapter.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\ncontractorReportAdapter - photo mapping contract');

const adapted = adaptContractorReportToLegacy({
  id: 501,
  project_id: 71,
  report_date: '2026-07-05',
  submitted_at: '2026-07-05T08:00:00.000Z',
  overall_progress: 72,
  submitted_by: '00000000-0000-4000-8000-000000000071',
  project_schedule_status: 'At Risk',
  photo_urls: ['71/2026-07/user_1.jpg', '', null, '71/2026-07/user_2.jpg'],
});

const adaptedNullPhotos = adaptContractorReportToLegacy({
  id: 502,
  project_id: 71,
  report_date: '2026-07-06',
  photo_urls: null,
});

const adaptedMissingPhotos = adaptContractorReportToLegacy({
  id: 503,
  project_id: 71,
  report_date: '2026-07-07',
});

check('maps contractor_reports.photo_urls to legacy photos', adapted.photos.length === 2);
check('keeps storage paths unchanged', adapted.photos[0] === '71/2026-07/user_1.jpg' && adapted.photos[1] === '71/2026-07/user_2.jpg');
check('null photo_urls becomes empty photos array', Array.isArray(adaptedNullPhotos.photos) && adaptedNullPhotos.photos.length === 0);
check('missing photo_urls becomes empty photos array', Array.isArray(adaptedMissingPhotos.photos) && adaptedMissingPhotos.photos.length === 0);

// ── P1.3: malformed/out-of-range numeric fields don't propagate NaN/garbage ──
console.log('\ncontractorReportAdapter - malformed numeric field contract (P1.3)');

const badOverall = adaptContractorReportToLegacy({
  id: 504, project_id: 71, report_date: '2026-07-08',
  overall_progress: 'not-a-number',
});
const nanOverall = adaptContractorReportToLegacy({
  id: 505, project_id: 71, report_date: '2026-07-09',
  overall_progress: NaN,
});
const outOfRangeOverall = adaptContractorReportToLegacy({
  id: 506, project_id: 71, report_date: '2026-07-10',
  overall_progress: 140,
});
const negativeOverall = adaptContractorReportToLegacy({
  id: 507, project_id: 71, report_date: '2026-07-11',
  overall_progress: -15,
});
const badWpProgress = adaptContractorReportToLegacy(
  { id: 508, project_id: 71, report_date: '2026-07-12' },
  [{ wp_id: 'demo.strip_out', status: 'in_progress', progress_pct: 'garbage' }],
);

check('non-numeric overall_progress string becomes 0, not NaN',
  badOverall.overallProgress === 0 && !Number.isNaN(badOverall.overallProgress));
check('literal NaN overall_progress becomes 0',
  nanOverall.overallProgress === 0);
check('overall_progress > 100 is clamped to 100',
  outOfRangeOverall.overallProgress === 100);
check('negative overall_progress is clamped to 0',
  negativeOverall.overallProgress === 0);
check('non-numeric wp progress_pct becomes 0 in workPackageStatuses, not a string',
  Object.values(badWpProgress.workPackageStatuses).every(tasks =>
    Object.values(tasks).every(t => typeof t.progress === 'number' && !Number.isNaN(t.progress))));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
