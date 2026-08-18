import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const sql = read('../migrations/140_project_risk_action_provenance.sql');
const service = read('../services/riskActionService.js');
const core = read('../core/risks/riskActionOrchestration.js');
let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

check('Source reference supports all governed origins with project-scoped foreign keys',
  ['CONTRACTOR_REPORT','SITE_VISIT','SNAG','VARIATION','MANUAL'].every(kind => sql.includes(`'${kind}'`))
  && /FOREIGN KEY\(contractor_report_id,project_id\)/.test(sql)
  && /FOREIGN KEY\(snag_id,project_id\)/.test(sql));
check('Risk and action owners are Project Team memberships',
  (sql.match(/FOREIGN KEY\(owner_membership_id,project_id\)/g) || []).length === 2
  && /assert_active_project_membership/.test(sql));
check('Risk and action transitions are server-owned optimistic commands',
  /transition_project_risk/.test(sql) && /PROJECT_RISK_REVISION_CONFLICT/.test(sql)
  && /transition_project_action/.test(sql) && /PROJECT_ACTION_REVISION_CONFLICT/.test(sql));
check('Provenance and lifecycle events are immutable',
  /PROJECT_PROVENANCE_EVENT_IMMUTABLE/.test(sql)
  && /project_risk_events_immutable/.test(sql) && /project_action_events_immutable/.test(sql));
check('Variation can link to the causal action and original source',
  /source_action_id/.test(sql) && /source_reference_id/.test(sql)
  && /link_project_variation_provenance/.test(sql));
check('Browser uses orchestration services instead of direct table writes',
  /get_project_risk_register/.test(service) && /create_project_action/.test(service)
  && /createClientRequestId/.test(core) && !/\.from\(/.test(service));

console.log(`\nRisk / Action Provenance: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
