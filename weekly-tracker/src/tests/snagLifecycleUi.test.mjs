// snagLifecycleUi.test.mjs - P0 fix: exposes the existing canonical Snag
// lifecycle (ASSIGNED -> IN_PROGRESS -> READY_FOR_REVIEW -> CLOSED, defined
// in core/snags/workflow.js + the execute_snag_command RPC and already
// exhaustively engine-tested in core/snags/snagWorkflow.test.mjs) through
// SnagDetailPage.jsx. This file does NOT re-test the engine/RPC contract —
// it proves the UI wiring reuses that exact contract rather than inventing a
// second one, using the same source-text-assertion convention
// snagFieldCaptureUi.test.mjs already established for this page.
import { readFileSync } from 'node:fs';

const detail = readFileSync(new URL('../pages/snags/SnagDetailPage.jsx', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../core/snags/workflow.js', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('../core/presentation/snagPresentationModel.js', import.meta.url), 'utf8');
const observations = readFileSync(new URL('../components/snags/site/SiteSnagObservations.jsx', import.meta.url), 'utf8');
const workspaceEngine = readFileSync(new URL('../engines/contractorWorkspaceEngine.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const check = (label, value) => value
  ? (pass++, console.log(`  OK ${label}`))
  : (fail++, console.error(`  FAIL ${label}`));

console.log('\nsnagLifecycleUi - Contractor actions reuse the canonical actions set, no second status machine');

// 1/2. ASSIGNED exposes Start Work; wired to the canonical action, not a new one.
check('Start work is gated by the canonical startSnagWork action (not a hardcoded status check)', /actions\.has\('startSnagWork'\)/.test(detail) && /Start work/.test(detail));
check('Start work invokes execute(\'startSnagWork\') — the same command dispatcher every other action on this page uses', /execute\('startSnagWork'\)/.test(detail));

// 4/5. IN_PROGRESS exposes Ready for Review; wired to the canonical action.
check('Ready for review is gated by the canonical markSnagReadyForReview action', /actions\.has\('markSnagReadyForReview'\)/.test(detail) && /Ready for review/.test(detail));
check('Ready for review invokes execute(\'markSnagReadyForReview\')', /execute\('markSnagReadyForReview'\)/.test(detail));

// 7/8. Contractor never sees Close/Approve; cannot execute a PM transition
// through this UI — both buttons are gated by canonical PM-only actions that
// getAvailableSnagActions() (engine-tested) never returns for a CONTRACTOR
// actor, so there is no code path in this file that could show them to one.
check('Approve & close is gated by the canonical approveAndCloseSnag action only', /actions\.has\('approveAndCloseSnag'\)/.test(detail) && /Approve & close/.test(detail));
check('Reject is gated by the canonical rejectSnag action only', /actions\.has\('rejectSnag'\)/.test(detail));
check('no role-literal branch (e.g. role===\'PM\') gates any of the four lifecycle buttons — visibility derives only from the canonical actions Set', !/role\s*===\s*['"]PM['"][^)]*\?[^:]*(Start work|Ready for review|Approve|Reject)/.test(detail));
check('the four lifecycle command types are never sent through any path other than the shared execute() dispatcher', [...detail.matchAll(/execute\('(startSnagWork|markSnagReadyForReview|approveAndCloseSnag|rejectSnag)'/g)].length === 4);

console.log('\nsnagLifecycleUi - Reject requires a reason, matches the canonical engine contract exactly');
check('workflow.js requires a reason for rejectSnag (engine contract this UI must match)', /rejectSnag:\s*\{[^}]*reason:\s*true/.test(workflow));
check('the Reject form requires non-empty text before it can submit', /required value=\{rejectReason\}/.test(detail) && /!rejectReason\.trim\(\)/.test(detail));
check('the reason is sent as payload.reason, the exact field name the engine/RPC expects', /execute\('rejectSnag',\s*\{\s*reason:\s*rejectReason\.trim\(\)\s*\}\)/.test(detail));
check('rejectSnag resolves to IN_PROGRESS in the canonical engine — no new REJECTED status exists', /rejectSnag:\s*\{[^}]*to:\s*'IN_PROGRESS'/.test(workflow) && !/'REJECTED'/.test(workflow));

console.log('\nsnagLifecycleUi - activity/evidence remain visible, no parallel logging mechanism');
check('SnagHistory (existing, previously unused, event-formatting component) is now rendered on the detail page', /import SnagHistory from/.test(detail) && /<SnagHistory events=\{events\}/.test(detail));
check('history events are the same ones already fetched by useSnagDetail — no second fetch/store introduced', /const \{ snag, evidence, events \} = detail\.data;/.test(detail));
check('the presentation layer already labels the exact events this lifecycle produces (reused, not reinvented)', /SNAG_STATUS_CHANGED:'Workflow advanced'/.test(presentation) && /SNAG_REJECTED:'Returned for correction'/.test(presentation) && /SNAG_CLOSED:'Observation closed'/.test(presentation));
check('EvidenceSection (existing evidence store) is still the only evidence UI on this page — no second evidence component added', (detail.match(/<EvidenceSection/g) || []).length === 2 && !/snag_evidence|createEvidence|new.*[Ee]vidence.*[Tt]able/.test(detail));

console.log('\nsnagLifecycleUi - PM discoverability reuses the existing Ready for review quick view (no new PM dashboard)');
check('SNAG_QUICK_VIEWS already includes a Ready for review filter', /label:'Ready for review',filters:\{status:'READY_FOR_REVIEW'\}/.test(presentation));
check('the Observations tab already renders every SNAG_QUICK_VIEWS entry as a clickable filter', /SNAG_QUICK_VIEWS\.map\(\(view\)/.test(observations));
check('no new PM review page/route was introduced for this task (existing Site Snag Observations tab is reused)', !/SnagReviewPage|ReviewCenter|SnagReviewQueue/.test(detail + observations + presentation));

console.log('\nsnagLifecycleUi - Contractor Workspace actionable-count semantics were audited, not blindly changed');
check('contractorWorkspaceEngine.js still derives actionability from the canonical getAvailableSnagActions selector, not a hand-rolled status list', /getAvailableSnagActions\(snag, actor\)\.length === 0/.test(workspaceEngine));
check('CLOSED is confirmed non-actionable at the engine level (getAvailableSnagActions returns no transitions once CLOSED for any role)', /!\['CLOSED', 'CANCELLED'\]\.includes\(state\.status\)/.test(workflow));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
