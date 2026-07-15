import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const viewer = read('../pages/plans/PlanViewerPage.jsx');
const detail = read('../pages/snags/SnagDetailPage.jsx');
const list = read('../pages/snags/SnagListPage.jsx');
const create = read('../pages/snags/SnagCreatePage.jsx');
const management = read('../pages/plans/PlanManagementPage.jsx');

let pass = 0;
let fail = 0;
const check = (label, value) => value
  ? (pass++, console.log(`  OK ${label}`))
  : (fail++, console.error(`  FAIL ${label}`));

check('drawing uses explicit long-press capture with crosshair confirmation', /setTimeout\(.*450/.test(viewer) && /plan-capture-crosshair/.test(viewer) && /Confirm & open Observation/.test(viewer));
check('keyboard placement remains available', /event\.key==='Enter'/.test(viewer));
check('UI terminology is Observation while technical routes remain stable', /Observation/.test(viewer) && /Observations/.test(list) && /snags/.test(list));
check('Done remains captured and does not publish', /Done - keep Captured/.test(detail) && /completeCapture/.test(detail));
check('publish is an explicit separate action', /publishObservation/.test(detail) && /Publish Observation/.test(detail));
check('batch publish has explicit selection', /Publish selected/.test(list) && /type="checkbox"/.test(list));
check('trade and stakeholder are explicit selections', /Building trade/.test(detail) && /Responsible stakeholder/.test(detail));
check('duplicate and archive are explicit audited actions', /duplicateObservation/.test(detail) && /archiveObservation/.test(detail));
check('full form returns to same drawing revision and page', /planReturn/.test(create) && /placement=1&page=/.test(create) && /created=\$\{result\.snag\.id\}/.test(create));
check('captured detail Done returns to drawing context', /captureReturn/.test(detail) && /Back to drawing/.test(detail) && /created=\$\{snag\.id\}/.test(detail));
check('captured detail omits empty optional catalog ids', /if \(captureForm\.tradeId \|\| snag\.tradeId\) payload\.tradeId/.test(detail) && /if \(captureForm\.stakeholderId \|\| snag\.stakeholderId\) payload\.stakeholderId/.test(detail));
check('captured product command errors are visible', /command\.error \|\| product\.error/.test(detail) && /snagErrorMessage\(command\.error \|\| product\.error\)/.test(detail));
check('viewer preserves page query and placement after return', /initialPage=Number\(query\.get\('page'\)\)\|\|1/.test(viewer) && /query\.get\('created'\)/.test(viewer));
check('PDF upload remains plan-management only', /type="file" accept="application\/pdf,.pdf"/.test(management) && !/type="file" accept="application\/pdf,.pdf"/.test(create) && !/type="file" accept="application\/pdf,.pdf"/.test(detail));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
