import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/142_user_directory_roles_and_removal.sql', import.meta.url), 'utf8');
let passed = 0;
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  PASS ${name}`); };
const roles = ['Construction Manager','Lease Manager','Project Manager','Security Manager','IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager'];

check('all requested business roles are canonical', roles.every(role => sql.includes(`'${role}'`)));
check('business role and system access are independent fields', /job_role text/.test(sql) && /p_job_role text,p_access_role text/.test(sql));
check('active directory hides removed users', /profile\.is_active IS TRUE/.test(sql) && /role='Inactive'/.test(sql));
check('removal preserves historical user identity', /remove_admin_user/.test(sql) && !/DELETE FROM auth\.users|DELETE FROM public\.profiles/.test(sql));
check('admin cannot remove their own account', /ADMIN_CANNOT_REMOVE_SELF/.test(sql));
check('Project Team reads the business role from Users', /COALESCE\(profile\.job_role,profile\.role\)/.test(sql));
check('new commands are ACL closed and explicitly granted',
  /REVOKE ALL ON FUNCTION[\s\S]*public\.update_admin_user_profile/.test(sql)
    && /GRANT EXECUTE ON FUNCTION[\s\S]*public\.update_admin_user_profile/.test(sql));

console.log(`\nUser directory roles migration: ${passed} passed, 0 failed`);
