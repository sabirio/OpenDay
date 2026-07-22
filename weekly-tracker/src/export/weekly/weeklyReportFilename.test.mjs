import { buildWeeklyReportFilename } from './weeklyReportFilename.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nbuildWeeklyReportFilename');

check('produces the expected deterministic name', buildWeeklyReportFilename({ storeCode: 'AA0011', reportingDate: '2026-07-14' }) === 'OpenDay_Weekly_Report_AA0011_2026-07-14.pdf');
check('same input always produces the same filename', buildWeeklyReportFilename({ storeCode: 'AA0011', reportingDate: '2026-07-14' }) === buildWeeklyReportFilename({ storeCode: 'AA0011', reportingDate: '2026-07-14' }));
check('falls back to submittedAt when reportingDate is absent', buildWeeklyReportFilename({ storeCode: 'AA0011', submittedAt: '2026-07-14T09:00:00.000Z' }) === 'OpenDay_Weekly_Report_AA0011_2026-07-14.pdf');
check('sanitizes spaces and slashes in store code', buildWeeklyReportFilename({ storeCode: 'AA 0011/B', reportingDate: '2026-07-14' }) === 'OpenDay_Weekly_Report_AA_0011_B_2026-07-14.pdf');
check('sanitizes path-traversal-style input rather than passing it through', !buildWeeklyReportFilename({ storeCode: '../../etc/passwd', reportingDate: '2026-07-14' }).includes('..'));
check('missing store code falls back to a safe placeholder, not a blank/invalid name', buildWeeklyReportFilename({ storeCode: '', reportingDate: '2026-07-14' }) === 'OpenDay_Weekly_Report_Project_2026-07-14.pdf');
check('missing date falls back to a safe placeholder', buildWeeklyReportFilename({ storeCode: 'AA0011' }) === 'OpenDay_Weekly_Report_AA0011_undated.pdf');
check('always ends in .pdf', buildWeeklyReportFilename({ storeCode: 'AA0011', reportingDate: '2026-07-14' }).endsWith('.pdf'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
