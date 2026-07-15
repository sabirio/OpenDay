import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/033_snag_private_plan_pinning.sql', import.meta.url), 'utf8');
let pass = 0;
let fail = 0;
const check = (name, value) => {
  if (value) {
    pass++;
    console.log(`  OK ${name}`);
  } else {
    fail++;
    console.error(`  FAIL ${name}`);
  }
};

check('page number is forward-only', /ADD COLUMN plan_page_number integer/.test(sql));
check('complete normalized pin constraint exists', /snags_plan_location_complete[\s\S]*plan_x BETWEEN 0 AND 1[\s\S]*plan_y BETWEEN 0 AND 1/.test(sql));
check('project and page trigger exists', /validate_snag_plan_location[\s\S]*PLAN_PROJECT_MISMATCH[\s\S]*INVALID_PLAN_PAGE/.test(sql));
check('one active plan per project', /UNIQUE INDEX snag_plan_versions_one_active_per_project/.test(sql));
check('many observations can share one revision and page', !/CREATE\s+UNIQUE\s+INDEX[^\n]+ON\s+public\.snags\s*\([^)]*plan_version_id[^)]*plan_page_number/i.test(sql));
check('dedicated private PDF bucket', /VALUES\('snag-plans','snag-plans',false,20971520,ARRAY\['application\/pdf'\]\)/.test(sql));
check('storage reads use project access', /snag_plans_read[\s\S]*can_access_project/.test(sql));
check('upload checks actor and project write access', /snag_plans_upload[\s\S]*auth\.uid[\s\S]*can_write_project/.test(sql));
check('registration verifies stored object', /register_snag_plan_version[\s\S]*FROM storage\.objects[\s\S]*PLAN_UPLOAD_MISSING/.test(sql));
check('plan commands are idempotent', /execute_snag_plan_command[\s\S]*snag_command_requests[\s\S]*IDEMPOTENCY_CONFLICT/.test(sql));
check('historical pins are never remapped', !sql.match(/UPDATE public\.snags SET plan_version_id[^;]*set_snag_plan_lifecycle/i));
check('least privilege grants', /REVOKE ALL[\s\S]*FROM PUBLIC,anon[\s\S]*GRANT EXECUTE[\s\S]*TO authenticated/.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
