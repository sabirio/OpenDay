import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass += 1; console.log(`  OK ${label}`); }
  else { fail += 1; console.error(`  FAIL ${label}`); }
};
const sql = readFileSync(new URL('../migrations/071_project_boq_excel_compatibility.sql', import.meta.url), 'utf8');

console.log('\nprojectBoqExcelCompatibilityMigration - Roadmap C.15');
check('migration adds one explicit import RPC without replacing the canonical native RPC',
  /CREATE OR REPLACE FUNCTION public\.import_project_boq_revision/.test(sql)
  && !/CREATE OR REPLACE FUNCTION public\.save_project_boq_revision/.test(sql));
check('import provenance is transaction-local',
  /set_config\('openday\.project_boq_revision_source', 'IMPORT', true\)/.test(sql));
check('source marker is applied before immutable version insertion completes',
  /BEFORE INSERT ON public\.project_boq_versions/.test(sql)
  && /NEW\.source_kind := 'IMPORT'/.test(sql));
check('import delegates authorization, validation, idempotency, and revision locking to the canonical save command',
  /RETURN public\.save_project_boq_revision\(/.test(sql));
check('wrapper is invoker security with an empty search path',
  /SECURITY INVOKER[\s\S]*SET search_path = ''/.test(sql));
check('trigger helper is not callable through the Data API',
  /REVOKE ALL ON FUNCTION private\.apply_project_boq_revision_source\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(sql));
check('import RPC is denied by default and granted only to authenticated callers',
  /REVOKE ALL ON FUNCTION public\.import_project_boq_revision[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(sql)
  && /GRANT EXECUTE ON FUNCTION public\.import_project_boq_revision[\s\S]*TO authenticated/.test(sql));
check('migration grants no direct table mutation', !/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*project_boq/is.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
