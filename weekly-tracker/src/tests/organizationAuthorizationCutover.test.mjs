import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/150_organization_authorization_cutover.sql', import.meta.url), 'utf8');
const canAccessProject = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.can_access_project'),
  migration.indexOf('CREATE OR REPLACE FUNCTION public.has_project_capability'),
);
const canWriteProject = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.can_write_project'),
  migration.indexOf('CREATE OR REPLACE FUNCTION public.can_admin_project'),
);
let passed = 0;

function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('\norganizationAuthorizationCutover');

check('legacy profile identity has one synchronized primary membership',
  /ADD COLUMN is_primary boolean NOT NULL DEFAULT false/.test(migration)
    && /organization_memberships_one_primary_per_user_idx/.test(migration)
    && /sync_profile_primary_organization/.test(migration));
check('profile reassignment fails for unknown organizations and retires old primary access',
  /ORGANIZATION_AUTH_UNKNOWN_PROFILE_COMPANY/.test(migration)
    && /OLD\.company_id IS DISTINCT FROM NEW\.company_id/.test(migration)
    && /status = 'INACTIVE'/.test(migration));
check('suspended organizations fail closed in the canonical membership helper',
  /organization_row\.status = 'ACTIVE'/.test(migration));
check('platform superadmin no longer depends on profile role or null company',
  /is_global_admin\(\)[\s\S]*private\.is_platform_superadmin\(auth\.uid\(\)\)/.test(migration));
check('current tenant compatibility key resolves through primary membership',
  /current_company_id\(\)[\s\S]*membership\.is_primary[\s\S]*membership\.status = 'ACTIVE'/.test(migration));
check('project read access intersects organization and project membership',
  /can_view_own_project_row\([\s\S]*p_organization_id uuid/.test(migration)
    && /has_active_organization_membership/.test(migration)
    && /is_active_project_member/.test(migration));
check('project management helpers use organization_id rather than profile company',
  /v_project\.organization_id/.test(canAccessProject)
    && /SELECT organization_id,created_by/.test(canWriteProject)
    && !/profile\.company_id/.test(canAccessProject)
    && !/profile\.company_id/.test(canWriteProject));
check('project self-row policy receives organization_id directly for INSERT RETURNING safety',
  /projects_select[\s\S]*can_view_own_project_row\(id,company_id,organization_id\)/.test(migration));
check('template and ontology root reads use canonical organization policies',
  /templates_select[\s\S]*organization_id/.test(migration)
    && /work_ontology_versions_select[\s\S]*organization_id/.test(migration));
check('private profile synchronization is not browser executable',
  /REVOKE ALL ON FUNCTION private\.sync_profile_primary_organization\(\)[\s\S]*PUBLIC,anon,authenticated,service_role/.test(migration));

console.log(`organizationAuthorizationCutover: ${passed}/10 checks passed`);
