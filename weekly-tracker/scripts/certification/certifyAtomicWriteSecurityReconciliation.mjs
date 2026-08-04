// Local-only runtime certification for migration 058. The shared preflight
// rejects every non-loopback Supabase/API or PostgreSQL target before access.

import { readFileSync } from 'node:fs';
import { makeReporter, psql, requireCertificationEnvironment } from './lib.mjs';
import { extractFunctionBody, normalizeLineEndings } from './sqlLineEndingNormalization.mjs';

await requireCertificationEnvironment();

const r = makeReporter('Migration 058 atomic-write security reconciliation');
const migration036 = readFileSync(new URL('../../src/migrations/036_contractor_report_legacy_wp_scope.sql', import.meta.url), 'utf8');
const migration028 = readFileSync(new URL('../../src/migrations/028_production_security_reconciliation.sql', import.meta.url), 'utf8');

const canonicalBody = extractFunctionBody(migration036, 'submit_contractor_report_atomic');
const canonicalSiteVisitBody = extractFunctionBody(migration028, 'submit_site_visit_atomic');

function rows(sql) {
  const output = psql(sql);
  return output ? output.split('\n').map(line => line.replace(/\r$/, '').split('|')) : [];
}

const signatureRows = rows(`
  SELECT p.proname, pg_get_function_identity_arguments(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('submit_contractor_report_atomic', 'submit_site_visit_atomic')
  ORDER BY p.proname, 2;
`);
r.check('both exact atomic RPC signatures exist exactly once',
  signatureRows.length === 2 &&
  signatureRows.some(([name, args]) => name === 'submit_contractor_report_atomic' && args === 'p_project_id bigint, p_report_date date, p_wp_progress jsonb, p_meta jsonb, p_client_request_id uuid') &&
  signatureRows.some(([name, args]) => name === 'submit_site_visit_atomic' && args === 'p_project_id bigint, p_contractor_report_id bigint, p_visit_date date, p_observations jsonb, p_meta jsonb, p_client_request_id uuid'),
  JSON.stringify(signatureRows));

const contractorMeta = rows(`
  SELECT pg_get_function_result(p.oid), l.lanname, p.prosecdef, p.provolatile,
         p.proisstrict, p.proparallel, r.rolname, array_to_string(p.proconfig, ',')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  JOIN pg_roles r ON r.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.oid = 'public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)'::regprocedure;
`)[0];
r.check('contractor RPC metadata remains canonical',
  JSON.stringify(contractorMeta) === JSON.stringify(['jsonb', 'plpgsql', 't', 'v', 'f', 'u', 'postgres', 'search_path=public']),
  JSON.stringify(contractorMeta));

const liveBody = normalizeLineEndings(
  psql(`SELECT prosrc FROM pg_proc WHERE oid = 'public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)'::regprocedure;`)
).trim();
r.check('live contractor RPC body equals migration 036 canonical body', liveBody === canonicalBody);

const liveSiteVisitBody = normalizeLineEndings(
  psql(`SELECT prosrc FROM pg_proc WHERE oid = 'public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)'::regprocedure;`)
).trim();
r.check('live site-visit RPC body remains the migration 028 canonical body', liveSiteVisitBody === canonicalSiteVisitBody);

const ownership = rows(`
  SELECT object_type, object_name, owner_name
  FROM (
    SELECT 'function' AS object_type, p.proname AS object_name, owner.rolname AS owner_name
    FROM pg_proc p
    JOIN pg_roles owner ON owner.oid = p.proowner
    WHERE p.oid IN (
      'public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)'::regprocedure,
      'public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)'::regprocedure
    )
    UNION ALL
    SELECT CASE c.relkind WHEN 'S' THEN 'sequence' ELSE 'table' END,
           c.relname, owner.rolname
    FROM pg_class c
    JOIN pg_roles owner ON owner.oid = c.relowner
    WHERE c.oid IN (
      'public.write_command_requests'::regclass,
      'public.write_command_requests_id_seq'::regclass
    )
  ) owned
  ORDER BY object_type, object_name;
`);
r.check('both RPCs, ledger table, and ledger sequence remain owned by postgres',
  ownership.length === 4 && ownership.every(([, , owner]) => owner === 'postgres'),
  JSON.stringify(ownership));

function functionAcl(signature) {
  return rows(`
    SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
           x.privilege_type, x.is_grantable
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
    LEFT JOIN pg_roles grantee ON grantee.oid = x.grantee
    WHERE p.oid = '${signature}'::regprocedure
      AND x.grantee <> p.proowner
    ORDER BY 1, 2;
  `);
}

// PUBLIC is a PostgreSQL pseudo-role, not a pg_roles row, so the has_*()
// functions reject the literal role name. `authenticator` is the fail-closed
// PUBLIC probe: this assertion pins it to NOINHERIT, and the raw ACL matrices
// below reject any direct authenticator grant. Its effective result therefore
// consists only of PUBLIC privileges. Named application roles are checked
// directly so inherited/predefined-role access is also detected.
const publicProbe = rows(`
  SELECT rolname, rolinherit, rolsuper
  FROM pg_roles
  WHERE rolname = 'authenticator';
`);
r.check('authenticator exists as a non-superuser NOINHERIT probe for effective PUBLIC privileges',
  JSON.stringify(publicProbe) === JSON.stringify([['authenticator', 'f', 'f']]),
  JSON.stringify(publicProbe));

const effectiveFunctionAcl = rows(`
  WITH role_matrix(role_ordinal, role_label, role_name) AS (
    VALUES (1,'PUBLIC','authenticator'), (2,'anon','anon'),
           (3,'authenticated','authenticated'), (4,'service_role','service_role')
  ), function_matrix(function_name, signature) AS (
    VALUES
      ('contractor','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)'),
      ('site_visit','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)')
  )
  SELECT role_label, function_name,
         has_function_privilege(role_name, signature, 'EXECUTE'),
         has_function_privilege(role_name, signature, 'EXECUTE WITH GRANT OPTION')
  FROM role_matrix CROSS JOIN function_matrix
  ORDER BY role_ordinal, function_name;
`);
r.check('effective function privileges match the membership-aware EXECUTE matrix with no grant options',
  JSON.stringify(effectiveFunctionAcl) === JSON.stringify([
    ['PUBLIC', 'contractor', 'f', 'f'], ['PUBLIC', 'site_visit', 'f', 'f'],
    ['anon', 'contractor', 'f', 'f'], ['anon', 'site_visit', 'f', 'f'],
    ['authenticated', 'contractor', 't', 'f'], ['authenticated', 'site_visit', 't', 'f'],
    ['service_role', 'contractor', 't', 'f'], ['service_role', 'site_visit', 't', 'f'],
  ]), JSON.stringify(effectiveFunctionAcl));

for (const signature of [
  'public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)',
  'public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)',
]) {
  const acl = functionAcl(signature);
  r.check(`${signature}: only authenticated/service_role have direct EXECUTE`,
    JSON.stringify(acl) === JSON.stringify([
      ['authenticated', 'EXECUTE', 'f'],
      ['service_role', 'EXECUTE', 'f'],
    ]), JSON.stringify(acl));
}

const sequenceAcl = rows(`
  SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
         x.privilege_type, x.is_grantable
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) x
  LEFT JOIN pg_roles grantee ON grantee.oid = x.grantee
  WHERE c.oid = 'public.write_command_requests_id_seq'::regclass
    AND x.grantee <> c.relowner
  ORDER BY 1, 2;
`);
r.check('ledger sequence grants only non-grantable SELECT/UPDATE/USAGE to service_role',
  JSON.stringify(sequenceAcl) === JSON.stringify([
    ['service_role', 'SELECT', 'f'],
    ['service_role', 'UPDATE', 'f'],
    ['service_role', 'USAGE', 'f'],
  ]), JSON.stringify(sequenceAcl));

const effectiveSequenceAcl = rows(`
  WITH role_matrix(role_ordinal, role_label, role_name) AS (
    VALUES (1,'PUBLIC','authenticator'), (2,'anon','anon'),
           (3,'authenticated','authenticated'), (4,'service_role','service_role')
  ), privilege_matrix(privilege_name) AS (
    VALUES ('SELECT'), ('UPDATE'), ('USAGE')
  )
  SELECT role_label, privilege_name,
         has_sequence_privilege(role_name, 'public.write_command_requests_id_seq', privilege_name),
         has_sequence_privilege(role_name, 'public.write_command_requests_id_seq', privilege_name || ' WITH GRANT OPTION')
  FROM role_matrix CROSS JOIN privilege_matrix
  ORDER BY role_ordinal, privilege_name;
`);
const expectedEffectiveSequenceAcl = [];
for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
  for (const privilege of ['SELECT', 'UPDATE', 'USAGE']) {
    expectedEffectiveSequenceAcl.push([role, privilege, role === 'service_role' ? 't' : 'f', 'f']);
  }
}
r.check('effective sequence privileges match the membership-aware matrix with no grant options',
  JSON.stringify(effectiveSequenceAcl) === JSON.stringify(expectedEffectiveSequenceAcl),
  JSON.stringify(effectiveSequenceAcl));

const tableAcl = rows(`
  SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
         x.privilege_type, x.is_grantable
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
  LEFT JOIN pg_roles grantee ON grantee.oid = x.grantee
  WHERE c.oid = 'public.write_command_requests'::regclass
    AND x.grantee <> c.relowner
  ORDER BY 1, 2;
`);
r.check('ledger table direct ACL preserves service_role 028 grants, removes MAINTAIN, and denies PUBLIC/anon/authenticated',
  JSON.stringify(tableAcl) === JSON.stringify([
    ['service_role', 'DELETE', 'f'],
    ['service_role', 'INSERT', 'f'],
    ['service_role', 'REFERENCES', 'f'],
    ['service_role', 'SELECT', 'f'],
    ['service_role', 'TRIGGER', 'f'],
    ['service_role', 'TRUNCATE', 'f'],
    ['service_role', 'UPDATE', 'f'],
  ]),
  JSON.stringify(tableAcl));

const effectiveTableAcl = rows(`
  WITH role_matrix(role_ordinal, role_label, role_name) AS (
    VALUES (1,'PUBLIC','authenticator'), (2,'anon','anon'),
           (3,'authenticated','authenticated'), (4,'service_role','service_role')
  ), privilege_matrix(privilege_name) AS (
    VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
           ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
  )
  SELECT role_label, privilege_name,
         has_table_privilege(role_name, 'public.write_command_requests', privilege_name),
         has_table_privilege(role_name, 'public.write_command_requests', privilege_name || ' WITH GRANT OPTION')
  FROM role_matrix CROSS JOIN privilege_matrix
  ORDER BY role_ordinal, privilege_name;
`);
const expectedEffectiveTableAcl = [];
for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
  for (const privilege of ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) {
    const allowed = role === 'service_role' && privilege !== 'MAINTAIN';
    expectedEffectiveTableAcl.push([role, privilege, allowed ? 't' : 'f', 'f']);
  }
}
r.check('effective table privileges match the membership-aware matrix, deny service_role MAINTAIN, and have no grant options',
  JSON.stringify(effectiveTableAcl) === JSON.stringify(expectedEffectiveTableAcl),
  JSON.stringify(effectiveTableAcl));

const tableGrantOptions = rows(`
  SELECT grantee.rolname, x.privilege_type
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(c.relacl) x
  JOIN pg_roles grantee ON grantee.oid = x.grantee
  WHERE c.oid = 'public.write_command_requests'::regclass
    AND grantee.rolname = 'service_role'
    AND x.is_grantable;
`);
r.check('service_role ledger-table privileges have no grant options', tableGrantOptions.length === 0, JSON.stringify(tableGrantOptions));

const rls = psql(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.write_command_requests'::regclass;`);
r.check('ledger RLS remains enabled and not forced', rls === 't|f', rls);

const policies = rows(`
  SELECT policyname, permissive, cmd, array_to_string(roles, ','),
         COALESCE(qual, ''), COALESCE(with_check, '')
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'write_command_requests'
  ORDER BY policyname;
`);
r.check('ledger policy count is exactly zero and exact policy set is empty',
  policies.length === 0, JSON.stringify(policies));

const summary = r.summary();
process.exitCode = summary.fail === 0 ? 0 : 1;
