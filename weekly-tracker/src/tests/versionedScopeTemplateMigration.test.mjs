import { readFileSync } from 'node:fs';
import {
  materializeRetailFitoutV2TemplateData,
  RETAIL_FITOUT_V2_TEMPLATE_ID,
} from '../domains/construction/templates/versionedScopeTemplate.js';

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
  new URL('../migrations/041_versioned_scope_templates.sql', import.meta.url),
  'utf8',
);
const generatedJson = migration.match(/\$scope_template\$\r?\n([\s\S]+?)\r?\n\$scope_template\$::jsonb/)?.[1];

console.log('\nversionedScopeTemplateMigration - additive schema and seed contract');
check('adds family and company_id without removing legacy columns',
  /ADD COLUMN IF NOT EXISTS family text/.test(migration)
  && /ADD COLUMN IF NOT EXISTS company_id text/.test(migration)
  && !/\bDROP COLUMN\b/i.test(migration));
check('adds owner/family version and active-default uniqueness',
  /templates_owner_family_version_uniq/.test(migration)
  && /templates_one_active_per_owner_family/.test(migration)
  && /NULLS NOT DISTINCT/.test(migration));
check('adds a non-backfilling template FK for new pins',
  /CONSTRAINT projects_template_id_fkey[\s\S]*REFERENCES public\.templates\(id\)[\s\S]*NOT VALID/.test(migration));
check('does not update or backfill any project row',
  !/UPDATE\s+public\.projects/i.test(migration)
  && !/INSERT\s+INTO\s+public\.projects/i.test(migration));
check('database trigger freezes referenced semantic data and identity',
  /prevent_referenced_template_semantic_change/.test(migration)
  && /REFERENCED_TEMPLATE_IMMUTABLE/.test(migration)
  && /NEW\.data IS DISTINCT FROM OLD\.data/.test(migration)
  && /NEW\.version IS DISTINCT FROM OLD\.version/.test(migration));
check('activation metadata remains mutable for copy-on-write default switching',
  !/NEW\.is_active IS DISTINCT FROM OLD\.is_active/.test(migration));
check('authenticated reads are limited to global, own-company, or global admin',
  /CREATE POLICY "templates_select"[\s\S]*company_id IS NULL[\s\S]*company_id = public\.current_company_id\(\)/.test(migration)
  && /TO authenticated/.test(migration));
check('company template writes require own-company Admin and global writes require global Admin',
  /CREATE POLICY "templates_insert"[\s\S]*public\.is_global_admin\(\)[\s\S]*public\.get_my_role\(\) = 'admin'[\s\S]*company_id = public\.current_company_id\(\)/.test(migration));
check('no anonymous template policy or grant is introduced',
  !/TO anon/.test(migration)
  && !/GRANT[\s\S]*TO anon/.test(migration));
check('seed uses the deterministic global V2 template id',
  migration.includes(`'${RETAIL_FITOUT_V2_TEMPLATE_ID}'`)
  && /'retail-fitout-v2',\s*\n\s*NULL,\s*\n\s*1/.test(migration));
check('embedded migration JSON exactly equals deterministic materialization',
  generatedJson != null
  && JSON.stringify(JSON.parse(generatedJson)) === JSON.stringify(materializeRetailFitoutV2TemplateData()));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
