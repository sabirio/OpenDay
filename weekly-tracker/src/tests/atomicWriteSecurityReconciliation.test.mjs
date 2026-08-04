import { readFileSync } from 'node:fs';
import { extractFunctionDefinition, maskExactlyOnce, normalizeLineEndings, stripLineComments } from '../../scripts/certification/sqlLineEndingNormalization.mjs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const migration036 = readFileSync(new URL('../migrations/036_contractor_report_legacy_wp_scope.sql', import.meta.url), 'utf8');
const migration058 = readFileSync(new URL('../migrations/058_reconcile_atomic_write_security_and_contractor_rpc.sql', import.meta.url), 'utf8');
const runtimeCertification = readFileSync(new URL('../../scripts/certification/certifyAtomicWriteSecurityReconciliation.mjs', import.meta.url), 'utf8');
const productionRemediationSuite = readFileSync(new URL('../../../scripts/tests/production-remediation.tests.ps1', import.meta.url), 'utf8');
const canonicalContract = JSON.parse(readFileSync(new URL('../../../scripts/contracts/canonical-security-contract.json', import.meta.url), 'utf8'));
const migrationExecutorDoc = readFileSync(new URL('../../../docs/PRODUCTION_MIGRATION_EXECUTOR.md', import.meta.url), 'utf8');
const remediationRunbook = readFileSync(new URL('../../../docs/PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md', import.meta.url), 'utf8');
const active058 = stripLineComments(migration058);
const topLevel058 = maskExactlyOnce(active058, extractFunctionDefinition(active058, 'submit_contractor_report_atomic'), 'CANONICAL_CONTRACTOR_FUNCTION_DEFINITION');

console.log('\nsqlLineEndingNormalization - detector self-test against synthetic fixtures');

function buildSyntheticSource(eol) {
  return [
    'CREATE OR REPLACE FUNCTION public.synthetic_fn(p_id bigint)',
    'RETURNS void',
    'LANGUAGE plpgsql',
    'AS $$',
    'BEGIN',
    '  INSERT INTO public.synthetic_ledger(id) VALUES (p_id);',
    '  NULL;',
    'END;',
    '$$;',
  ].join(eol) + eol;
}
// Doubled CRLF ("\r\r\n") reproduces a real, isolated finding: this
// environment's Windows psql.exe client has been observed to double an
// already-CRLF migration file's line endings when applying it, so a live
// pg_proc.prosrc value can legitimately contain "\r\r\n" even though the
// source .sql file on disk only ever had a single "\r\n" per line.
const syntheticLf = buildSyntheticSource('\n');
const syntheticCrlf = buildSyntheticSource('\r\n');
const syntheticDoubledCrlf = buildSyntheticSource('\r\r\n');

for (const [label, source] of [['LF', syntheticLf], ['CRLF', syntheticCrlf], ['doubled CRLF', syntheticDoubledCrlf]]) {
  const def = extractFunctionDefinition(source, 'synthetic_fn');
  check(`${label}: contractor-style body extraction succeeds`, def !== null);
  check(`${label}: extraction matches the LF baseline (line endings alone never change the result)`,
    def === extractFunctionDefinition(syntheticLf, 'synthetic_fn'));
  const masked = maskExactlyOnce(source, def, 'PLACEHOLDER');
  check(`${label}: masking occurs exactly once`, masked.split('PLACEHOLDER').length - 1 === 1);
  check(`${label}: no false-positive top-level INSERT INTO after masking`, !/INSERT\s+INTO/i.test(masked));
}

check('mixed: LF expected vs CRLF actual body extraction matches after normalization',
  extractFunctionDefinition(syntheticLf, 'synthetic_fn') === extractFunctionDefinition(syntheticCrlf, 'synthetic_fn'));
check('mixed: CRLF expected vs LF actual body extraction matches after normalization',
  extractFunctionDefinition(syntheticCrlf, 'synthetic_fn') === extractFunctionDefinition(syntheticLf, 'synthetic_fn'));
check('mixed: LF expected vs doubled-CRLF actual body extraction matches after normalization',
  extractFunctionDefinition(syntheticLf, 'synthetic_fn') === extractFunctionDefinition(syntheticDoubledCrlf, 'synthetic_fn'));
check('mixed: normalizeLineEndings alone is idempotent across LF/CRLF/doubled-CRLF variants of the same content',
  normalizeLineEndings(syntheticLf) === normalizeLineEndings(syntheticCrlf) &&
  normalizeLineEndings(syntheticCrlf) === normalizeLineEndings(syntheticDoubledCrlf));

check('fail-closed: masking throws instead of silently no-opping when the needle is absent from the source',
  (() => { try { maskExactlyOnce(syntheticLf, 'NOT PRESENT ANYWHERE IN SOURCE', 'X'); return false; } catch { return true; } })());
check('fail-closed: masking throws when the needle appears more than once',
  (() => {
    const duplicated = syntheticLf + '\n' + syntheticLf;
    const def = extractFunctionDefinition(duplicated, 'synthetic_fn');
    try { maskExactlyOnce(duplicated, def, 'X'); return false; } catch { return true; }
  })());
check('fail-closed: masking throws on an empty/absent needle rather than masking nothing',
  (() => { try { maskExactlyOnce(syntheticLf, null, 'X'); return false; } catch { return true; } })());
check('fail-closed: extraction returns null, not a false match, when the function is entirely absent',
  extractFunctionDefinition(syntheticLf, 'nonexistent_fn_xyz') === null);
check('fail-closed: normalization never erases a genuine semantic difference, only line-ending noise',
  extractFunctionDefinition(syntheticLf, 'synthetic_fn') !== extractFunctionDefinition(syntheticLf.replace('p_id bigint', 'p_id text'), 'synthetic_fn'));
check('fail-closed: a top-level mutation OUTSIDE the masked function body is still detected, not hidden by masking',
  (() => {
    const withOutsideMutation = syntheticLf + '\nINSERT INTO public.other_table(x) VALUES (1);\n';
    const def = extractFunctionDefinition(withOutsideMutation, 'synthetic_fn');
    const masked = maskExactlyOnce(withOutsideMutation, def, 'PLACEHOLDER');
    return /INSERT\s+INTO/i.test(masked);
  })());

console.log('\natomicWriteSecurityReconciliation - migration 058 static contract');

check('058 is transactionally atomic', /^BEGIN;$/m.test(active058) && /^COMMIT;$/m.test(active058));
check('058 contractor RPC definition is byte-for-byte canonical migration 036 SQL',
  extractFunctionDefinition(migration058, 'submit_contractor_report_atomic') === extractFunctionDefinition(migration036, 'submit_contractor_report_atomic'));
check('058 does not replace the site-visit RPC body',
  !/CREATE OR REPLACE FUNCTION public\.submit_site_visit_atomic/.test(active058));

for (const signature of [
  'submit_contractor_report_atomic\\(bigint,date,jsonb,jsonb,uuid\\)',
  'submit_site_visit_atomic\\(bigint,bigint,date,jsonb,jsonb,uuid\\)',
]) {
  check(`${signature} clears PUBLIC/anon/authenticated/service_role before re-grant`,
    new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM PUBLIC, anon, authenticated, service_role;`).test(active058));
  check(`${signature} grants plain EXECUTE only to authenticated and service_role`,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated, service_role;`).test(active058));
}

check('058 deterministically clears every application-role sequence privilege',
  /REVOKE ALL ON SEQUENCE public\.write_command_requests_id_seq\s+FROM PUBLIC, anon, authenticated, service_role;/.test(active058));
check('058 restores only service_role USAGE/SELECT/UPDATE on the ledger sequence',
  /GRANT USAGE, SELECT, UPDATE ON SEQUENCE public\.write_command_requests_id_seq\s+TO service_role;/.test(active058));
check('058 removes only service_role MAINTAIN from the ledger table',
  /REVOKE MAINTAIN ON TABLE public\.write_command_requests FROM service_role;/.test(active058));

check('058 has no grant option', !/WITH GRANT OPTION/i.test(active058));
check('058 has no table/function drop, data mutation, role/default-privilege, policy, RLS, ownership, or schema mutation',
  !/\b(DROP\s+(?:TABLE|FUNCTION)|INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|CREATE\s+ROLE|ALTER\s+ROLE|ALTER\s+DEFAULT\s+PRIVILEGES|CREATE\s+POLICY|DROP\s+POLICY|ENABLE\s+ROW\s+LEVEL\s+SECURITY|DISABLE\s+ROW\s+LEVEL\s+SECURITY|OWNER\s+TO|ALTER\s+TABLE|CREATE\s+TABLE)\b/i.test(topLevel058));
check('058 touches only the approved objects and canonical contractor dependencies', (() => {
  const objectRefs = [...active058.matchAll(/public\.(\w+)/g)].map(match => match[1]);
  const allowed = new Set([
    'submit_contractor_report_atomic', 'submit_site_visit_atomic',
    'write_command_requests', 'write_command_requests_id_seq',
    'project_gantt_tasks', 'submit_contractor_report', 'progress_history',
  ]);
  return objectRefs.every(name => allowed.has(name));
})());

console.log('\natomicWriteSecurityReconciliation - executable certification guards');

check('runtime certification retains raw ACL inspection', /aclexplode/i.test(runtimeCertification));
check('runtime certification checks effective function privileges', /has_function_privilege/i.test(runtimeCertification));
check('runtime certification checks effective sequence privileges', /has_sequence_privilege/i.test(runtimeCertification));
check('runtime certification checks effective table privileges', /has_table_privilege/i.test(runtimeCertification));
check('runtime certification checks effective grant-option state', /WITH GRANT OPTION/i.test(runtimeCertification));
check('runtime certification probes PUBLIC through a NOINHERIT non-superuser role',
  /authenticator/i.test(runtimeCertification) && /rolinherit/i.test(runtimeCertification) && /rolsuper/i.test(runtimeCertification));
check('runtime certification compares the exact pg_policies set',
  /FROM pg_policies/i.test(runtimeCertification) && /policies\.length === 0/.test(runtimeCertification));
check('runtime certification preserves the canonical site RPC body from migration 028',
  /028_production_security_reconciliation\.sql/.test(runtimeCertification)
    && /submit_site_visit_atomic/.test(runtimeCertification));
check('runtime certification expects service_role table privileges except MAINTAIN',
  /role === 'service_role'/.test(runtimeCertification) && /privilege !== 'MAINTAIN'/.test(runtimeCertification));
check('runtime certification fails closed when any assertion fails',
  /process\.exitCode\s*=\s*summary\.fail === 0 \? 0 : 1/.test(runtimeCertification));

check('production remediation suite derives canonical file count instead of fixing a number',
  !/migrationFiles\.Count\s+-eq\s+\d+/.test(productionRemediationSuite));
check('production remediation suite does not treat migration 029 as the canonical endpoint',
  !/Select-Object\s+-Last\s+1\)[^\r\n]*029_production_acl_followup/.test(productionRemediationSuite));
const canonicalEndpoint = canonicalContract.canonicalMigrationPath.included.at(-1);
check('documentation and executable contract agree on canonical endpoint 041',
  canonicalEndpoint === '041_versioned_scope_templates.sql'
    && migrationExecutorDoc.includes(canonicalEndpoint)
    && remediationRunbook.includes('migration 041'));
check('documentation keeps local migration 058 certification separate from remote approval',
  /058[\s\S]{0,220}(?:does not|not)[\s\S]{0,80}(?:approve|authorize)[\s\S]{0,80}(?:remote|staging|production)/i.test(remediationRunbook));

console.log(`\n-- atomicWriteSecurityReconciliation: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
