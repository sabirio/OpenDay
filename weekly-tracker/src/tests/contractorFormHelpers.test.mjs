// contractorFormHelpers.test.mjs — P2.1 required-field contract.
// Run: node src/tests/contractorFormHelpers.test.mjs
//
// formHelpers.js imports config/workPackages.js without an extension
// (Vite-style); same loader trick as riskEngine.test.mjs.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { validateContractorReport } = await import('../components/contractor/formHelpers.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function baseForm(overrides = {}) {
  return {
    reportingDate: '2026-07-06',
    currentPackages: ['demolition'],
    projectScheduleStatus: 'On Track',
    risks: [], riskOwners: [], riskScale: '', riskDescription: '',
    supportRequired: 'No', supportTypes: [], supportDescription: '',
    nextWeekTop3: '', weekAfterTop3: '',
    activitiesBlocked: 'No', delayReason: '',
    pendingIssues: '', finalComments: '',
    declarationConfirmed: true,
    ...overrides,
  };
}

console.log('\ncontractorFormHelpers - required field contract (P2.1)');

check('a fully filled form with a photo passes with no errors',
  validateContractorReport(baseForm(), ['71/photo.jpg']).length === 0);

check('nextWeekTop3/weekAfterTop3/pendingIssues/finalComments left blank do NOT block submit',
  validateContractorReport(baseForm({ nextWeekTop3: '', weekAfterTop3: '', pendingIssues: '', finalComments: '' }), ['71/photo.jpg']).length === 0);

check('missing reportingDate still blocks submit',
  validateContractorReport(baseForm({ reportingDate: '' }), ['71/photo.jpg']).some(e => /reporting date/i.test(e)));

check('no active work package still blocks submit',
  validateContractorReport(baseForm({ currentPackages: [] }), ['71/photo.jpg']).some(e => /work package/i.test(e)));

check('missing photo still blocks submit',
  validateContractorReport(baseForm(), []).some(e => /photo/i.test(e)));

check('unconfirmed declaration still blocks submit',
  validateContractorReport(baseForm({ declarationConfirmed: false }), ['71/photo.jpg']).some(e => /declaration/i.test(e)));

check('activitiesBlocked=Yes without a delay reason still blocks submit',
  validateContractorReport(baseForm({ activitiesBlocked: 'Yes', delayReason: '' }), ['71/photo.jpg']).some(e => /delay reason/i.test(e)));

check('At Risk schedule status without risk fields still blocks submit',
  validateContractorReport(baseForm({ projectScheduleStatus: 'At Risk' }), ['71/photo.jpg']).length > 0);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
