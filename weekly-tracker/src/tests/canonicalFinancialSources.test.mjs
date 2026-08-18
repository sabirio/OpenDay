import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../migrations/134_canonical_financial_sources.sql');
const editor = read('../components/projects/ProjectEditorModal.jsx');
const detail = read('../components/projects/ProjectDetailPane.jsx');
const projectService = read('../services/projectService.js');
const variationService = read('../services/variationService.js');
const variationCore = read('../core/variations/variationOrchestration.js');
const variationHook = read('../hooks/useProjectVariations.js');

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

check('Project editor owns Currency but no Budget or Actual Cost inputs',
  /Commercial settings/.test(editor) && /name="currencyCode"/.test(editor)
  && !/name="budget"|name="actualCost"/.test(editor));
check('Project details link to canonical commercial sources instead of legacy values',
  /Approved Budget Baseline/.test(detail) && /Cost Packages and Forecast/.test(detail)
  && /Project Closeout/.test(detail) && !/Final Cost Closeout/.test(detail)
  && !/project\.budget|project\.actualCost/.test(detail));
check('live project serialization cannot write legacy financial columns',
  !/budget:\s*project\.budget|actual_cost:\s*project\.actualCost/.test(projectService));
check('legacy project-level Forecast APIs are absent from application code',
  !/get_project_cost_forecast|create_project_cost_forecast|get_project_commercial_health/.test(variationService + variationCore + variationHook));
check('database removes authenticated writes to legacy project financial columns',
  /REVOKE INSERT, UPDATE ON TABLE public\.projects FROM authenticated/.test(migration)
  && /column_name NOT IN \('budget', 'actual_cost'\)/.test(migration));
check('Cost Closeout derives Forecast from Cost Packages',
  /project_cost_package_forecast_total/.test(migration)
  && !/SELECT forecast_final_cost INTO forecast FROM public\.project_cost_forecast_versions/.test(migration));
check('legacy project-level financial RPCs are closed',
  ['get_project_cost_forecast', 'create_project_cost_forecast', 'get_project_commercial_health']
    .every(name => new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}`).test(migration)));

console.log(`\nCanonical Financial Sources: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
