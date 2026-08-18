import { readFileSync } from 'node:fs';
import {
  materializeWorkOntologyMigrationPayload,
  renderWorkOntologyMigration,
} from '../../scripts/generateWorkOntologyMigration.mjs';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  OK ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

const migration = readFileSync(
  new URL('../migrations/060_work_ontology_foundation.sql', import.meta.url),
  'utf8',
);
const payloadText = migration.match(/\$work_ontology\$\r?\n([\s\S]+?)\r?\n\$work_ontology\$::jsonb/)?.[1];
const payload = payloadText ? JSON.parse(payloadText) : null;
const expected = materializeWorkOntologyMigrationPayload();

console.log('\nworkOntologyMigration - versioned persistence, seed, and security contract');
check('generated migration is committed without drift', migration === renderWorkOntologyMigration());
check('adds six normalized ontology tables', [
  'work_ontology_versions',
  'work_ontology_departments',
  'work_ontology_disciplines',
  'work_ontology_work_groups',
  'work_ontology_boq_item_definitions',
  'work_ontology_execution_classifications',
].every(table => migration.includes(`CREATE TABLE IF NOT EXISTS public.${table}`)));
check('pins projects by restrictive nullable version FK without backfill',
  /ADD COLUMN IF NOT EXISTS work_ontology_version_id uuid/.test(migration)
  && /projects_work_ontology_version_id_fkey[\s\S]*ON DELETE RESTRICT[\s\S]*NOT VALID/.test(migration)
  && !/UPDATE\s+public\.projects/i.test(migration)
  && !/INSERT\s+INTO\s+public\.projects/i.test(migration));
check('supports owner-specific versions and one active version per owner',
  /work_ontology_versions_owner_version_uniq[\s\S]*NULLS NOT DISTINCT/.test(migration)
  && /work_ontology_versions_one_active_per_owner[\s\S]*WHERE is_active/.test(migration));
check('published and referenced semantics are immutable',
  /WORK_ONTOLOGY_VERSION_IMMUTABLE/.test(migration)
  && /WORK_ONTOLOGY_CONTENT_IMMUTABLE/.test(migration)
  && /OLD\.status <> 'DRAFT'/.test(migration)
  && /work_ontology_version_id = OLD\.id/.test(migration));
check('all ontology tables enable RLS',
  (migration.match(/ALTER TABLE public\.work_ontology_[a-z_]+ ENABLE ROW LEVEL SECURITY;/g) ?? []).length === 6);
check('authenticated reads are global, own-company, or global-admin only',
  /TO authenticated[\s\S]*public\.is_global_admin\(\)[\s\S]*company_id IS NULL[\s\S]*company_id = public\.current_company_id\(\)/.test(migration));
check('grants are explicit read-only and anonymous access is revoked',
  (migration.match(/GRANT SELECT ON TABLE public\.work_ontology_[a-z_]+ TO authenticated;/g) ?? []).length === 6
  && !/GRANT (?!SELECT)[^;]+TO authenticated/.test(migration)
  && /REVOKE ALL ON TABLE public\.work_ontology_versions FROM PUBLIC, anon, authenticated/.test(migration));
check('trigger helpers are not executable by API roles',
  (migration.match(/REVOKE ALL ON FUNCTION public\.prevent_immutable_work_ontology_[a-z_]+\(\) FROM PUBLIC, anon, authenticated;/g) ?? []).length === 2);
check('embedded seed exactly matches the application ontology',
  payload != null && JSON.stringify(payload) === JSON.stringify(expected));
check('seed contains 6 departments, 12 disciplines, 141 work groups, and 3 BOQ definitions',
  payload?.departments.length === 6
  && payload?.disciplines.length === 12
  && payload?.work_groups.length === 141
  && payload?.boq_item_definitions.length === 3);
check('all 221 execution packages have exactly one classification',
  payload?.execution_classifications.length === 221
  && new Set(payload.execution_classifications.map(item => item.execution_work_package_id)).size === 221);
check('classification totals remain explicit after the approved scope split',
  payload?.execution_classifications.filter(item => item.kind === 'MAPPED').length === 185
  && payload?.execution_classifications.filter(item => item.kind === 'DEFERRED').length === 22
  && payload?.execution_classifications.filter(item => item.kind === 'LIFECYCLE').length === 14);
check('temporarily excluded disciplines are absent from PM-selectable taxonomy',
  !payload?.disciplines.some(item => [
    'R100', 'K100', 'X100', 'T100',
  ].includes(item.code)));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
