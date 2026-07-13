import { register } from 'node:module';

const loaderSrc = `export async function resolve(s,c,n){if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/)){try{return await n(s+'.js',c)}catch{return n(s+'/index.js',c)}}return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { buildCanonicalProjectSnapshot, runOpenDayOrchestrator } = await import('../index.js');
const { computeZoneWeights } = await import('../../projects/weights/computeZoneWeights.js');
const { retailFitoutV2 } = await import('../../../domains/construction/templates/retailFitoutV2.js');

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\nCore stabilization adversarial invariants');

const duplicateWpInput = {
  project: { id: 7, scope: { workPackageIds: ['wp-a'] } },
  workPackages: [
    { id: 'wp-a', label: 'First authoritative record' },
    { id: 'wp-a', label: 'Conflicting duplicate' },
  ],
};
const duplicateSnapshot = buildCanonicalProjectSnapshot(duplicateWpInput, { calculatedAt: '2026-07-13T00:00:00Z' });
check('duplicate work-package IDs are represented once', duplicateSnapshot.workPackages.length === 1);
check('first work-package record wins deterministically', duplicateSnapshot.workPackages[0]?.label === 'First authoritative record');
check('duplicate work-package correction is diagnosed', duplicateSnapshot.warnings.some(w => w.code === 'DUPLICATE_WORK_PACKAGE_DROPPED'));

for (const raw of [null, undefined, '', 'not-a-number', -Infinity, Infinity, -10, 0, 10]) {
  const weights = computeZoneWeights(retailFitoutV2, { sales: raw, boh: 100 });
  check(`zone weights stay finite and bounded for ${String(raw)}`,
    Object.values(weights).every(value => Number.isFinite(value) && value >= 0 && value <= 100));
  check(`zone weights sum to 100 for ${String(raw)}`,
    Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 100) < 0.001);
}

const emptyA = runOpenDayOrchestrator({ project: { id: 'empty' }, workPackages: [] }, { calculatedAt: '2026-07-13T00:00:00Z' });
const emptyB = runOpenDayOrchestrator({ project: { id: 'empty' }, workPackages: [] }, { calculatedAt: '2026-07-13T00:00:00Z' });
check('empty orchestration is byte-deterministic', JSON.stringify(emptyA) === JSON.stringify(emptyB));
check('empty orchestration exposes only finite numeric progress', Object.values(emptyA.progress).filter(v => typeof v === 'number').every(Number.isFinite));
check('empty orchestration progress remains bounded', emptyA.progress.overallProgress >= 0 && emptyA.progress.overallProgress <= 100);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
