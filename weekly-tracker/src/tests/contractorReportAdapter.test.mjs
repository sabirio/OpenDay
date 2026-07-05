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

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
