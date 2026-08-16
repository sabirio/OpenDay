import { readFileSync } from 'node:fs';
let pass = 0, fail = 0;
const check = (label, condition) => { if (condition) { pass++; console.log(`  OK ${label}`); } else { fail++; console.error(`  FAIL ${label}`); } };
const sql = readFileSync(new URL('../migrations/070_project_boq_execution_scope_mapping.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/executionScopeService.js', import.meta.url), 'utf8');
const orchestration = readFileSync(new URL('../core/boq/projectBoqOrchestration.js', import.meta.url), 'utf8');

console.log('\nprojectBoqExecutionScopeMappingMigration - Phase C.14');
check('Execution Scope records its BOQ revision source', /source_boq_version_id bigint/.test(sql) && /REFERENCES public\.project_boq_versions\(id\)/.test(sql));
check('PM and BOQ sources have an explicit shape constraint', /source_kind = 'PM_DISCIPLINE_SCOPE'[\s\S]*source_boq_version_id IS NULL/.test(sql) && /source_kind = 'BOQ_REVISION'[\s\S]*source_boq_version_id IS NOT NULL/.test(sql));
check('one BOQ revision maps at most once per project', /project_execution_scope_versions_boq_source_uniq/.test(sql));
check('mapping command is authenticated, PM/Admin and project-authorized', /auth\.uid\(\)/.test(sql) && /NOT IN \('pm', 'admin'\)/.test(sql) && /can_write_project\(p_project_id\) IS NOT TRUE/.test(sql));
check('command uses idempotency and optimistic scope revision', /boq\.materialize_execution_scope/.test(sql) && /EXECUTION_SCOPE_REVISION_CONFLICT/.test(sql));
check('BOQ project and ontology must match destination project', /BOQ_EXECUTION_SCOPE_SOURCE_MISMATCH/.test(sql));
check('BOQ Work Groups must stay inside PM-selected Disciplines', /BOQ_WORK_GROUP_OUTSIDE_PROJECT_DISCIPLINE_SCOPE/.test(sql));
check('detailed rows collapse by distinct Work Group', /count\(DISTINCT item\.work_group_id\)/.test(sql) && /SELECT DISTINCT[\s\S]*item\.work_group_id/.test(sql));
check('result explains the many-to-one collapse', /collapsedLineCount/.test(sql) && /boqLineCount/.test(sql) && /workGroupCount/.test(sql));
check('privileged function ACL is explicit', /REVOKE ALL ON FUNCTION public\.materialize_project_execution_scope_from_boq[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(sql) && /TO authenticated/.test(sql));
check('service and orchestration expose one atomic mapping command', /materializeExecutionScopeFromBoq/.test(service) && /commitBoqExecutionScopeMapping/.test(orchestration));
check('does not create Gantt activities or assume one line equals one task', !/project_gantt_tasks|schedule_activities/.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
