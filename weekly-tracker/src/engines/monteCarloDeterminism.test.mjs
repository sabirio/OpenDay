import assert from 'node:assert/strict';
import { register } from 'node:module';
const loaderSrc = `export async function resolve(s,c,n){if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/)){try{return await n(s+'.js',c)}catch{return n(s+'/index.js',c)}}return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });
const { computeMonteCarloForecast } = await import('./monteCarloEngine.js');

const project = { id: 'p1', targetOpeningDate: '2026-12-01' };
const reports = [
  { id: 'r1', reportingDate: '2026-01-01' },
  { id: 'r2', reportingDate: '2026-01-08' },
  { id: 'r3', reportingDate: '2026-01-15' },
];
const points = [10, 20, 35];
const options = { asOf: '2026-01-15T00:00:00.000Z', overrideProgressPoints: points };
const original = structuredClone(reports);
const first = computeMonteCarloForecast(project, reports, null, options);
const second = computeMonteCarloForecast(project, reports, null, options);

assert.deepEqual(first, second, 'identical evidence must produce an identical forecast');
assert.deepEqual(reports, original, 'forecast must not mutate reports');
assert.equal(Number.isFinite(first.pOnTime), true);
assert.equal(computeMonteCarloForecast(project, reports, null, { ...options, asOf: 'invalid' }).diagnostic, 'INVALID_AS_OF');
console.log('monteCarloDeterminism: 4 passed, 0 failed');
