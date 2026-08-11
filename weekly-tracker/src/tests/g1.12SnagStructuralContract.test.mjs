import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, value) => value ? (pass++, console.log(`  OK ${name}`)) : (fail++, console.error(`  FAIL ${name}`));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const detail = read('../pages/snags/SnagDetailPage.jsx');
const observations = read('../components/snags/site/SiteSnagObservations.jsx');
const fieldList = read('../components/snags/mobile/SnagFieldListView.jsx');
const fieldCard = read('../components/snags/mobile/SnagFieldCard.jsx');
const service = read('../services/snags/snagService.js');
const workflow = read('../core/snags/workflow.js');
const foundation = read('../migrations/030_snag_list_foundation.sql');
const planMigration = read('../migrations/033_snag_private_plan_pinning.sql');
const captureMigration = read('../migrations/035_snag_canonical_field_capture.sql');

check('Captured and Published remain explicit, separate presentation states', detail.includes('Captured · private field draft') && detail.includes('Published · visible resolution workflow'));
check('single publication continues to use the canonical batchPublish command', detail.includes("type: 'batchPublish'") && detail.includes('snagIds: [snag.id]'));
check('master rows expose publication, responsibility, location, and canonical status', observations.includes('publication-badge') && observations.includes('site-snag-master-responsibility') && observations.includes('snag.locationLabel') && observations.includes('<SnagStatus'));
check('mobile cards expose publication visibility and canonical workflow status', fieldCard.includes('Private draft · visible only to PM/Admin') && fieldCard.includes('Published · visible in the resolution workflow') && fieldCard.includes('<SnagStatus'));
check('mobile quick views are rendered once from the canonical quick-view collection', !fieldList.includes("setFilters({ publicationState: 'CAPTURED' })") && fieldList.includes('SNAG_QUICK_VIEWS.map'));
check('UI derives actions from the canonical presentation/workflow facade', detail.includes('buildSnagListModel([snag], {}, actor)') && !detail.includes('TRANSITIONS'));
check('service preserves RPC ownership and does not write snag rows directly', service.includes("rpc('execute_snag_command'") && !/from\('snags'\)\.(insert|update|delete)/.test(service));
check('project-scoped numbering remains database-owned', /snag_number[\s\S]*project_id/.test(foundation) && !/snagNumber\s*\+\s*1/.test(detail + observations + fieldList + fieldCard));
check('plan revision and normalized coordinate ownership remain in canonical SQL', /plan_version_id/.test(planMigration) && /plan_x BETWEEN 0 AND 1/.test(planMigration) && /plan_y BETWEEN 0 AND 1/.test(planMigration));
check('responsibility remains stakeholder-owned and publication resolves the existing assignment', /stakeholder_id/.test(captureMigration) && /publishObservation/.test(workflow));
check('no Action, Risk, or Site Visit engine is introduced into Snag presentation', !/(ActionEngine|RiskEngine|SiteVisitEngine|createAction|createRisk|createSiteVisit)/.test(detail + observations + fieldList + fieldCard));
check('permission and RLS ownership remain outside page components', !/(rolePermissions\s*=|create policy|alter table.*disable row level security)/i.test(detail + observations + fieldList + fieldCard));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
