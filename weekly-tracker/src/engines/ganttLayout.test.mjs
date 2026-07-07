// ganttLayout.test.mjs — F-11 regression: buildArrows()/calculateLayout()
// must pick the dependency-rule set matching the project's templateType,
// not always the v1 set. Before this fix, a v2 project's WP ids never
// matched any v1 rule, so calculateLayout().arrows was always empty for v2.
// Run: node src/engines/ganttLayout.test.mjs

import { calculateLayout } from './ganttLayout.js';
import { filterRulesForWPsV2 } from '../config/dependencyRulesV2.js';
import { V2_TEMPLATE_TYPE } from '../domains/construction/templates/retailFitoutV2.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// Two real v1 WPs connected by a real dependencyRules.js rule
// (demo.strip_out -> floor.screed).
function v1GanttResult() {
  return [
    { id: 'demo.strip_out', phaseId: 'demolition', phaseLabel: 'Demolition', phaseOrder: 1,
      earlyStart: new Date('2026-08-01'), earlyFinish: new Date('2026-08-03'), duration_days: 2 },
    { id: 'floor.screed', phaseId: 'floor_prep', phaseLabel: 'Floor Preparation', phaseOrder: 2,
      earlyStart: new Date('2026-08-04'), earlyFinish: new Date('2026-08-06'), duration_days: 2 },
  ];
}

// Two real v2 WPs connected by a real dependencyRulesV2.js rule
// (sales.flooring.waterproof -> sales.flooring.tile, 2-day cure lag).
function v2GanttResult() {
  return [
    { id: 'sales.flooring.waterproof', phaseId: 'sales', phaseLabel: 'Sales Area', phaseOrder: 1,
      earlyStart: new Date('2026-08-01'), earlyFinish: new Date('2026-08-03'), duration_days: 2 },
    { id: 'sales.flooring.tile', phaseId: 'sales', phaseLabel: 'Sales Area', phaseOrder: 1,
      earlyStart: new Date('2026-08-06'), earlyFinish: new Date('2026-08-08'), duration_days: 2 },
  ];
}

console.log('\ncalculateLayout — F-11: v2 project now gets real dependency arrows');
{
  const layout = calculateLayout(v2GanttResult(), 'month', 900, {}, [], {}, V2_TEMPLATE_TYPE);
  check('v2 templateType produces at least one arrow (was always 0 before the fix)',
    layout.arrows.length > 0);

  const expectedRules = filterRulesForWPsV2(v2GanttResult().map(w => w.id));
  check('v2 arrow count matches filterRulesForWPsV2() directly (the real v2 rule source, not a reinvented one)',
    layout.arrows.length === expectedRules.length);
  check('the v2 arrow actually connects the two real WPs from the rule (waterproof -> tile)',
    layout.arrows.some(a => a.fromWPId === 'sales.flooring.waterproof' && a.toWPId === 'sales.flooring.tile'));
}

console.log('\ncalculateLayout — F-11: v2 WP ids produce ZERO arrows when templateType is omitted (documents the pre-fix symptom)');
{
  const layoutNoType = calculateLayout(v2GanttResult(), 'month', 900, {}, [], {}, null);
  check('v2 WPs + no templateType -> 0 arrows (v1 rule set has no matching ids — this was the bug\'s exact mechanism)',
    layoutNoType.arrows.length === 0);
}

console.log('\ncalculateLayout — F-11: v1 project is byte-identical regardless of what templateType value a v1 caller passes');
{
  const layoutOmitted = calculateLayout(v1GanttResult(), 'month', 900, {}, [], {});
  const layoutNull     = calculateLayout(v1GanttResult(), 'month', 900, {}, [], {}, null);
  const layoutNamed    = calculateLayout(v1GanttResult(), 'month', 900, {}, [], {}, 'standard_with_demo');

  check('v1 still produces its real arrow (demo.strip_out -> floor.screed) with templateType omitted',
    layoutOmitted.arrows.length === 1 &&
    layoutOmitted.arrows[0].fromWPId === 'demo.strip_out' && layoutOmitted.arrows[0].toWPId === 'floor.screed');
  check('v1 result is byte-identical (JSON) whether templateType is omitted, explicitly null, or a named v1 template',
    JSON.stringify(layoutOmitted.arrows) === JSON.stringify(layoutNull.arrows) &&
    JSON.stringify(layoutOmitted.arrows) === JSON.stringify(layoutNamed.arrows));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
