import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const sql = readFileSync(new URL('../migrations/068_project_boq_work_group_aggregation.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/projectBoqService.js', import.meta.url), 'utf8');

console.log('\nprojectBoqWorkGroupAggregationMigration - Phase C.12');
check('creates one read-only Work Group totals projection', /CREATE OR REPLACE VIEW public\.project_boq_work_group_totals/.test(sql));
check('view runs with caller permissions so BOQ table RLS remains effective', /WITH \(security_invoker = true\)/.test(sql));
check('groups a specific immutable BOQ version', /item\.boq_version_id/.test(sql) && /GROUP BY[\s\S]*item\.boq_version_id/.test(sql));
check('uses canonical ontology hierarchy and order', /work_ontology_work_groups/.test(sql) && /work_ontology_disciplines/.test(sql) && /display_order/.test(sql));
check('counts standard, custom, priced and unpriced lines', ['standard_line_count', 'custom_line_count', 'priced_line_count', 'unpriced_line_count'].every(field => sql.includes(field)));
check('totals database-generated line_total instead of recalculating quantity times rate', /sum\(item\.line_total\)/i.test(sql) && !/item\.quantity\s*\*\s*item\.unit_rate/.test(sql));
check('retains an explicit incomplete-pricing signal', /bool_and\(item\.unit_rate IS NOT NULL\)/.test(sql));
check('view ACL is explicit and read-only', /REVOKE ALL ON TABLE public\.project_boq_work_group_totals[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(sql) && /GRANT SELECT ON TABLE public\.project_boq_work_group_totals TO authenticated/.test(sql));
check('service reads the canonical projection', /loadProjectBoqWorkGroupTotals/.test(service) && /from\('project_boq_work_group_totals'\)/.test(service));
check('service preserves database totals and commercial coverage fields', /pricedTotal: row\.priced_total/.test(service) && /unpricedLineCount: row\.unpriced_line_count/.test(service));
check('does not implement C.14 Execution Scope mapping', !/execution_scope|executionScope/i.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
