import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}
const page = readFileSync(new URL('../pages/ContractorSchedule.jsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../components/schedule/ContractorScheduleSetupEditor.jsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../hooks/useContractorScheduleSetup.js', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/contractorScheduleService.js', import.meta.url), 'utf8');
const orchestration = readFileSync(new URL('../core/contractorSchedule/contractorScheduleSetupOrchestration.js', import.meta.url), 'utf8');

console.log('\ncontractorScheduleSetupUi - canonical setup workflow');
check('Contractor Schedule loads the canonical setup hook',
  /useContractorScheduleSetup/.test(page) && /executionScope/.test(page));
check('unconfigured canonical projects see Setup before Gantt',
  page.indexOf('editingScheduleSetup ?') < page.indexOf('tasks.length === 0 ?'));
check('configured projects can reopen Schedule Setup', /Edit Schedule Setup/.test(page));
check('setup edits participate in the unsaved-changes guard',
  /useUnsavedChangesGuard\(dirty \|\| scheduleSetup\.dirty\)/.test(page));
check('load failure is fail-closed instead of silently using legacy tasks',
  /scheduleDraftAvailable = !scheduleSetup\.loading && !scheduleSetup\.error/.test(page)
  && /Couldn't load the current Execution Scope/.test(page));
check('legacy projects retain the existing schedule path',
  /!scheduleSetup\.executionScope \|\| scheduleSetup\.configured/.test(page));
check('editor supports adding activities and selecting multiple Work Groups',
  /\+ Add activity/.test(editor) && /type="checkbox"/.test(editor));
check('writes go through the single atomic RPC',
  /save_contractor_schedule_setup/.test(service)
  && /buildScheduleSetupSavePayload/.test(hook)
  && /commitContractorScheduleSetup/.test(hook)
  && /createClientRequestId/.test(orchestration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
