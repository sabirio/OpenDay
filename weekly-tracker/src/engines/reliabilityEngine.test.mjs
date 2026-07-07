// reliabilityEngine.test.mjs - contractor reliability scoring source of truth.

import { computeContractorReliability } from './reliabilityEngine.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`OK ${label}`); }
  else { fail++; console.error(`FAIL ${label}`); }
}

const result = computeContractorReliability(['p1', 'p2', 'p3'], [
  { project_id: 'p1', status: 'critical' },
  { project_id: 'p1', status: 'warning' },
  { project_id: 'p1', status: 'ok' },
  { project_id: 'p2', status: 'warning' },
  { project_id: 'p2', status: 'ok' },
]);

check('returns a Map', result instanceof Map);
check('p1 critical count', result.get('p1').critical === 1);
check('p1 warning count', result.get('p1').warning === 1);
check('p1 ok count', result.get('p1').ok === 1);
check('p1 total count', result.get('p1').total === 3);
check('p1 reliability score = 67', result.get('p1').score === 67);
check('p2 reliability score = 100', result.get('p2').score === 100);
check('p3 no data score null', result.get('p3').score === null);

const camelResult = computeContractorReliability(['p4'], [
  { projectId: 'p4', status: 'critical' },
]);
check('accepts camelCase projectId rows from read-models', camelResult.get('p4').critical === 1);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
