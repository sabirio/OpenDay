import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/133_project_access_alignment.sql', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
const check = (label, condition) => {
  if (condition) { passed += 1; console.log(`  PASS ${label}`); }
  else { failed += 1; console.error(`  FAIL ${label}`); }
};

check('generic internal read requires an active Project Team membership',
  /v_role NOT IN\('pm','consultant','approver','executive'\)/.test(sql)
  && /public\.is_active_project_member\(p_project_id,auth\.uid\(\)\)/.test(sql));
check('Contractor access remains assignment and company scoped',
  /v_role='contractor'[\s\S]*p_project_id=ANY\(v_assignments::bigint\[\]\)[\s\S]*v_company=v_project_company/.test(sql));
check('Admin access remains company scoped with an explicit global profile path',
  /v_role='admin'[\s\S]*v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company/.test(sql));
check('Project Team writes reject Contractor disguised as Function Owner',
  /FUNCTION_OWNER'[\s\S]*v_organization_role NOT IN\('pm','consultant','approver','executive'\)/.test(sql)
  && /project_team_profile_role_guard/.test(sql));
check('Budget owner candidates come from active Project Team memberships',
  /FROM public\.project_team_memberships membership[\s\S]*membership\.starts_on<=CURRENT_DATE/.test(sql)
  && /membership\.project_role IN\('PM','FUNCTION_OWNER','EXECUTIVE'\)/.test(sql));
check('Budget assignment revalidates the same active membership boundary',
  /NOT EXISTS\([\s\S]*public\.project_team_memberships membership[\s\S]*membership\.user_id=p_owner_user_id[\s\S]*membership\.project_role IN\('PM','FUNCTION_OWNER','EXECUTIVE'\)/.test(sql));
check('legacy Viewer role is absent from the correction', !/viewer/i.test(sql));
check('security-definer API is closed and regranted only to authenticated',
  /REVOKE ALL ON FUNCTION public\.can_view_own_project_row/.test(sql)
  && /GRANT EXECUTE ON FUNCTION public\.can_view_own_project_row[\s\S]*TO authenticated/.test(sql));

console.log(`\nProject access alignment migration: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
