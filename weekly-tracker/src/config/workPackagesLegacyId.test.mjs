// workPackagesLegacyId.test.mjs - encode/decode contract for the P0 fix's
// legacy composite wp_id ("legacy::<group>::<task>"), used to give
// contractor_report_wps.wp_id (a single flat text column) a reversible
// identity for the legacy (non-Gantt) WP form's two-level shape.
// Run: node src/config/workPackagesLegacyId.test.mjs

import { WORK_PACKAGES, encodeLegacyWpTaskId, decodeLegacyWpTaskId } from './workPackages.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\nworkPackagesLegacyId - encode/decode round-trip');

check('encodes to the documented format', encodeLegacyWpTaskId('preconstruction', 'Site setup & hoarding') === 'legacy::preconstruction::Site setup & hoarding');
check('decodes back to the exact original pair', JSON.stringify(decodeLegacyWpTaskId(encodeLegacyWpTaskId('preconstruction', 'Site setup & hoarding'))) === JSON.stringify({ wpId: 'preconstruction', taskName: 'Site setup & hoarding' }));
check('round-trips every real WORK_PACKAGES group/task pair without loss', WORK_PACKAGES.every(wp => wp.tasks.every(task => {
  const decoded = decodeLegacyWpTaskId(encodeLegacyWpTaskId(wp.id, task.name));
  return decoded?.wpId === wp.id && decoded?.taskName === task.name;
})));

console.log('\nworkPackagesLegacyId - decode safety / non-legacy input');
check('a canonical (non-legacy) masterTaskLibrary-style id decodes to null', decodeLegacyWpTaskId('walls.framing') === null);
check('a plain arbitrary string decodes to null', decodeLegacyWpTaskId('totally.made.up.id') === null);
check('an empty string decodes to null', decodeLegacyWpTaskId('') === null);
check('null input decodes to null, does not throw', decodeLegacyWpTaskId(null) === null);
check('undefined input decodes to null, does not throw', decodeLegacyWpTaskId(undefined) === null);
check('a non-string input decodes to null, does not throw', decodeLegacyWpTaskId(12345) === null);
check('the bare prefix with nothing after it decodes to null (no "::" separator to find)', decodeLegacyWpTaskId('legacy::') === null);

console.log('\nworkPackagesLegacyId - collision resistance / delimiter safety');
// wpId is always drawn from the fixed WORK_PACKAGES catalog (8 short lowercase
// ids, never containing ':'), so decode's first-'::'-wins split can never
// misattribute part of a task name to the group id, even if a task name
// itself happens to contain '::' — proven directly rather than assumed.
check('no real WORK_PACKAGES group id contains the "::" delimiter (decode-safety invariant)', WORK_PACKAGES.every(wp => !wp.id.includes('::')));
const taskNameWithDelimiter = 'Weird : Task :: With Colons';
const trickyEncoded = encodeLegacyWpTaskId('preconstruction', taskNameWithDelimiter);
const trickyDecoded = decodeLegacyWpTaskId(trickyEncoded);
check('a task name containing "::" itself still round-trips correctly (group id never contains it, so the first split is always right)',
  trickyDecoded?.wpId === 'preconstruction' && trickyDecoded?.taskName === taskNameWithDelimiter);
check('a real catalog task name containing "/" round-trips correctly', JSON.stringify(decodeLegacyWpTaskId(encodeLegacyWpTaskId('mep', 'Audio / PA rough-in'))) === JSON.stringify({ wpId: 'mep', taskName: 'Audio / PA rough-in' }));

console.log('\nworkPackagesLegacyId - never collides with a canonical Gantt-style id');
// masterTaskLibrary.js / retailFitoutV2.js ids use single dots only
// (e.g. "walls.framing", "common.mep_backbone.electrical_panels") and never
// the "legacy::" prefix — encode always produces a string decodeLegacyWpTaskId
// on the canonical side would never mistake for one of its own ids.
check('encoded legacy ids always start with the reserved "legacy::" prefix, which no canonical catalog id uses',
  WORK_PACKAGES.every(wp => wp.tasks.every(task => encodeLegacyWpTaskId(wp.id, task.name).startsWith('legacy::'))));

console.log('\nworkPackagesLegacyId - determinism (not dependent on iteration/display order)');
check('encoding the same pair twice is byte-identical', encodeLegacyWpTaskId('mep', 'HVAC ducts') === encodeLegacyWpTaskId('mep', 'HVAC ducts'));
check('encoding is a pure function of its two arguments only, independent of WORK_PACKAGES array order',
  encodeLegacyWpTaskId('handover', 'Staff training') === 'legacy::handover::Staff training');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
