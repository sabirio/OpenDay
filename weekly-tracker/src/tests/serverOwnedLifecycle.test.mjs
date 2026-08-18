import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const sql = read('../migrations/137_server_owned_project_budget_lifecycle.sql');
const projectEditor = read('../components/projects/ProjectEditorModal.jsx');
const projectService = read('../services/projectService.js');
const budgetUi = read('../components/budget/DepartmentalBudgetWorkspace.jsx');
const budgetHook = read('../hooks/useProjectBudget.js');
const budgetService = read('../services/budgetService.js');

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

check('Project status is absent from general project editing and serialization',
  !/Project Status|onProjectPatch\(.*projectStatus/.test(projectEditor)
  && !/project_status:\s*project\.projectStatus|projectStatus:\s*project\.projectStatus/.test(projectService));
check('Project status has a database contract and authenticated column writes are revoked',
  /projects_status_contract_check/.test(sql)
  && /REVOKE INSERT\(project_status\), UPDATE\(project_status\)/.test(sql));
check('sealed historical record is the project completion command',
  /historical_record_complete_project/.test(sql)
  && /COMPLETED_FROM_SEALED_HISTORY/.test(sql)
  && /PROJECT_STATUS_REQUIRES_LIFECYCLE_COMMAND/.test(sql));
check('Project lifecycle events are immutable and access-controlled',
  /PROJECT_LIFECYCLE_EVENT_IMMUTABLE/.test(sql)
  && /project_lifecycle_events_read/.test(sql));
check('Budget save derives status and cannot submit',
  /v_next_status := CASE WHEN p_amount IS NULL THEN 'NOT_STARTED' ELSE 'IN_PROGRESS' END/.test(sql)
  && /BUDGET_SUBMIT_REQUIRES_SECTION_COMMAND/.test(sql));
check('Budget section submission is a dedicated atomic command',
  /submit_project_budget_discipline/.test(sql)
  && /budget\.submit_discipline/.test(sql)
  && /event_type[\s\S]*'SUBMITTED'/.test(sql));
check('Budget UI uses the dedicated submit command',
  /submit=\{editor\.submitContributions\}/.test(budgetUi)
  && /await submit\(group\.disciplineId, submitInputs\)/.test(budgetUi)
  && /commitBudgetDisciplineSubmission/.test(budgetHook)
  && /submit_project_budget_discipline/.test(budgetService));

console.log(`\nServer-owned Lifecycle: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
