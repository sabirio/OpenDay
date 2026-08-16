// contractorReportAdapter.test.mjs - legacy adapter contract.
// Run: node src/tests/contractorReportAdapter.test.mjs

import { adaptContractorReportToLegacy } from '../core/contractorReport/adaptContractorReportToLegacy.js';

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

// ── v2 (zoned) wp_id resolution — keyed by categoryId, not phaseId ──
console.log('\ncontractorReportAdapter - v2 (zoned) wp_id resolution');

const v2Adapted = adaptContractorReportToLegacy(
  { id: 509, project_id: 91, report_date: '2026-07-13' },
  [
    { wp_id: 'common.mep_backbone.electrical_panels', status: 'completed', progress_pct: 100 },
    { wp_id: 'common.mep_backbone.hvac_equipment', status: 'in_progress', progress_pct: 40 },
  ],
  'retail-fitout-v2',
);
const v1Adapted = adaptContractorReportToLegacy(
  { id: 510, project_id: 71, report_date: '2026-07-13' },
  [{ wp_id: 'demo.strip_out', status: 'completed', progress_pct: 100 }],
  null,
);

check('v2 wp_id groups under its categoryId (not phaseId/zoneId)',
  v2Adapted.workPackageStatuses['common.mep_backbone'] != null);
check('v2 group is keyed by the wp label, not the raw wp_id',
  v2Adapted.workPackageStatuses['common.mep_backbone']['Electrical Panels & Distribution']?.status === 'Completed');
check('v2 currentPhases resolves to the real category label',
  v2Adapted.currentPhases[0] === 'MEP Backbone Works');
check('v1 wp_id still groups under its phaseId when templateType is omitted/null',
  v1Adapted.workPackageStatuses['demolition'] != null);

console.log('\ncontractorReportAdapter - Work Group compatibility');
const ontologyVersionId = 'de782297-1166-41da-8f21-e3deef6609a7';
const workGroupId = 'cdd14a6b-d934-4be0-ac32-1654246776d9';
const workGroupAdapted = adaptContractorReportToLegacy(
  { id: 511, project_id: 91, report_date: '2026-07-14', work_ontology_version_id: ontologyVersionId },
  [{
    wp_id: 'project_wide.electrical.incoming_supply_interface',
    status: 'in_progress',
    progress_pct: 25,
    work_group_id: workGroupId,
  }],
  'retail-fitout-v2',
  [workGroupId, workGroupId],
);
check('report exposes its pinned ontology version', workGroupAdapted.workOntologyVersionId === ontologyVersionId);
check('report exposes unique progress Work Groups',
  workGroupAdapted.reportedWorkGroupIds.length === 1 && workGroupAdapted.reportedWorkGroupIds[0] === workGroupId);
check('report exposes unique risk Work Groups',
  workGroupAdapted.riskWorkGroupIds.length === 1 && workGroupAdapted.riskWorkGroupIds[0] === workGroupId);
check('individual progress entries retain canonical Work Group UUID',
  Object.values(workGroupAdapted.workPackageStatuses)
    .some(tasks => Object.values(tasks).some(task => task.workGroupId === workGroupId)));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
