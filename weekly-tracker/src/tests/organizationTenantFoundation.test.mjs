import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/149_organization_tenant_foundation.sql', import.meta.url), 'utf8');
let passed = 0;

function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('\norganizationTenantFoundation');

check('organization, membership and platform-role concepts are separate tables',
  /CREATE TABLE public\.organizations\(/.test(migration)
    && /CREATE TABLE public\.organization_memberships\(/.test(migration)
    && /CREATE TABLE public\.platform_user_roles\(/.test(migration));
check('platform superadmin is not added to the customer profile role',
  /platform_role text NOT NULL CHECK\(platform_role = 'PLATFORM_SUPERADMIN'\)/.test(migration)
    && !/UPDATE public\.profiles SET role\s*=\s*'PLATFORM_SUPERADMIN'/.test(migration));
check('commercial entitlements do not reuse project authorization capabilities',
  !/ALTER TABLE public\.project_capability_catalog/.test(migration)
    && !/INSERT INTO public\.project_capability_catalog/.test(migration));
check('all current organization-owned company columns participate in the backfill',
  ['profiles', 'projects', 'templates', 'work_ontology_versions', 'import_jobs', 'admin_user_change_events']
    .every((table) => migration.includes(`FROM public.${table}`)));
check('business records receive an indexed organization bridge',
  ['projects', 'templates', 'work_ontology_versions', 'import_jobs', 'admin_user_change_events']
    .every((table) => migration.includes(`ALTER TABLE public.${table} ADD COLUMN organization_id uuid`))
    && ['projects_organization_idx', 'templates_organization_idx',
      'work_ontology_versions_organization_idx', 'import_jobs_organization_idx',
      'admin_user_change_events_organization_idx']
      .every((indexName) => migration.includes(`CREATE INDEX ${indexName}`)));
check('legacy company and organization identities are kept in lockstep',
  /sync_legacy_company_organization/.test(migration)
    && /ORGANIZATION_TENANT_IDENTITY_MISMATCH/.test(migration)
    && /organization_company_parity_check/.test(migration));
check('new exposed-schema tables have RLS and explicit least-privilege grants',
  ['organizations', 'organization_memberships', 'platform_user_roles']
    .every((table) => migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`))
    && /GRANT SELECT ON TABLE public\.organizations,public\.organization_memberships TO authenticated/.test(migration)
    && !/GRANT (?:ALL|INSERT|UPDATE|DELETE)[\s\S]*organization/.test(migration));
check('organization reads are member scoped and platform roles are not directly exposed',
  /organizations_member_read/.test(migration)
    && /organization_memberships_scoped_read/.test(migration)
    && /has_active_organization_membership/.test(migration)
    && /GRANT EXECUTE ON FUNCTION private\.is_platform_superadmin\(uuid\)[\s\S]*TO authenticated/.test(migration)
    && /has_table_privilege\('authenticated','public\.platform_user_roles','SELECT,INSERT,UPDATE,DELETE'\)/.test(migration));
check('the context RPC authenticates and returns only caller memberships',
  /get_my_organization_context\(\)[\s\S]*auth\.uid\(\)[\s\S]*ERRCODE = '28000'/.test(migration)
    && /membership\.user_id = v_user_id/.test(migration));
check('authorization never trusts user-editable auth metadata',
  !/user_metadata|raw_user_meta_data|auth\.jwt\(\)/i.test(migration));

console.log(`organizationTenantFoundation: ${passed}/10 checks passed`);
