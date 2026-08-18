import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const service = readFileSync(new URL('../services/projectBoqService.js', import.meta.url), 'utf8');
const orchestration = readFileSync(new URL('../core/boq/projectBoqOrchestration.js', import.meta.url), 'utf8');

console.log('\nprojectBoqFoundationService - Phase C.11');
check('read service exposes roots, revisions and immutable items', /loadProjectBoqs/.test(service) && /loadProjectBoqVersions/.test(service) && /loadProjectBoqVersionItems/.test(service));
check('service reads computed line total instead of calculating it', /lineTotal: row\.line_total/.test(service) && !/quantity\s*\*\s*unitRate/.test(service));
check('writes use the canonical native/import RPC pair selected by provenance',
  /supabase\.rpc\(rpcName/.test(service)
  && /'import_project_boq_revision'/.test(service)
  && /'save_project_boq_revision'/.test(service));
check('orchestration validates payload before I/O', orchestration.indexOf('buildProjectBoqRevisionPayload') < orchestration.indexOf('saveProjectBoqRevision(projectId'));
check('orchestration creates one idempotency request id', /createClientRequestId\(\)/.test(orchestration));
check('native and imported revisions share one persistence contract with distinct provenance RPCs',
  /sourceKind === 'IMPORT' \? 'import_project_boq_revision' : 'save_project_boq_revision'/.test(service));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
