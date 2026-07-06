// additionalWorksEngine.test.mjs — architecture-conformance pin.
// Run: node src/engines/additionalWorksEngine.test.mjs
//
// Extracted verbatim from WeeklyReports.jsx's local additionalWorksList
// useMemo (V3 audit follow-up to F1/F2/F3). Values below were captured from
// the pre-refactor page logic before the move — this test proves the
// extraction is byte-identical, not a logic change.
//
// Zero-dependency: no imports beyond the module under test.

import { computeAdditionalWorksSummary, parseAdditionalWorksCost, formatAdditionalWorksSum } from './additionalWorksEngine.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nparseAdditionalWorksCost');
{
  check("'1,200 USD' -> value 1200, currency USD",
    JSON.stringify(parseAdditionalWorksCost('1,200 USD')) === JSON.stringify({ value: 1200, currency: 'USD' }));
  check("'850.50 USD' -> value 850.5",
    parseAdditionalWorksCost('850.50 USD').value === 850.5);
  check('empty/falsy cost -> {value:0, currency:""}',
    JSON.stringify(parseAdditionalWorksCost(null)) === JSON.stringify({ value: 0, currency: '' }));
}

console.log('\nformatAdditionalWorksSum');
{
  check("2051 with USD -> '2 051 USD'", formatAdditionalWorksSum(2051, 'USD') === '2 051 USD');
  check("300 with no currency -> '300'", formatAdditionalWorksSum(300, '') === '300');
}

console.log('\ncomputeAdditionalWorksSummary — pinned against pre-refactor WeeklyReports.jsx output');
{
  const reports = [
    { reportingDate: '2026-01-05', additionalWorks: 'No' },
    { reportingDate: '2026-01-12', additionalWorks: 'Yes', additionalWorksCost: '1,200 USD', additionalWorksDescription: 'Extra wiring', additionalWorksParty: 'GC' },
    { reportingDate: '2026-01-19', additionalWorks: 'Yes', additionalWorksCost: '850.50 USD', additionalWorksDescription: 'Extra tiling', additionalWorksParty: 'PM' },
  ];
  const result = computeAdditionalWorksSummary(reports);

  check('excludes the "No" report entirely', result.entries.length === 2);
  check('num reflects position in the FULL sorted history, not sequential among "Yes" entries (2, then 3)',
    result.entries[0].num === 2 && result.entries[1].num === 3);
  check('costValue parsed correctly per entry',
    result.entries[0].costValue === 1200 && result.entries[1].costValue === 850.5);
  check("single-currency total pins to '2 051 USD'", result.total === '2 051 USD');

  const mixed = [
    { reportingDate: '2026-01-12', additionalWorks: 'Yes', additionalWorksCost: '100 USD' },
    { reportingDate: '2026-01-19', additionalWorks: 'Yes', additionalWorksCost: '200 EUR' },
  ];
  const mixedResult = computeAdditionalWorksSummary(mixed);
  check("mixed-currency total omits the currency suffix, pins to '300'", mixedResult.total === '300');

  const none = computeAdditionalWorksSummary([{ additionalWorks: 'No' }]);
  check('no additional-works entries -> empty list, null total',
    none.entries.length === 0 && none.total === null);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
