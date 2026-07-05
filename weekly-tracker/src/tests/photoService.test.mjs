// photoService.test.mjs - private photo signing/removal contract.
// Run: node src/tests/photoService.test.mjs

import { register } from 'node:module';

function moduleDataUrl(src) {
  return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`;
}

const supabaseMockUrl = moduleDataUrl(`
export const supabase = globalThis.__photoServiceTest.supabase;
`);

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === '../lib/supabase' &&
    context.parentURL?.endsWith('/services/photoService.js')
  ) {
    return { url: '${supabaseMockUrl}', shortCircuit: true };
  }
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;

register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const calls = [];
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args);

globalThis.__photoServiceTest = {
  signedData: [],
  signedError: null,
  removeData: [],
  removeError: null,
  supabase: {
    storage: {
      from(bucket) {
        calls.push({ operation: 'from', bucket });
        return {
          async createSignedUrls(paths, ttl) {
            calls.push({ operation: 'createSignedUrls', paths, ttl });
            return {
              data: globalThis.__photoServiceTest.signedData,
              error: globalThis.__photoServiceTest.signedError,
            };
          },
          async remove(paths) {
            calls.push({ operation: 'remove', paths });
            return {
              data: globalThis.__photoServiceTest.removeData,
              error: globalThis.__photoServiceTest.removeError,
            };
          },
        };
      },
    },
  },
};

const { getSignedPhotoUrl, getSignedPhotoUrls, removePhotoPaths } = await import('../services/photoService.js');

console.log('\nphotoService - private photo URL contract');

globalThis.__photoServiceTest.signedData = [
  { path: '71/2026-07/user_1.jpg', signedUrl: 'https://signed/one' },
  { path: '71/2026-07/user_2.jpg', signedUrl: 'https://signed/two' },
];

let result = await getSignedPhotoUrls([
  '71/2026-07/user_1.jpg',
  'https://cdn.example.com/already.jpg',
  '71/2026-07/user_2.jpg',
], 900);

const signedCall = calls.find((call) => call.operation === 'createSignedUrls');
check('signs storage paths in one batch request', calls.filter((call) => call.operation === 'createSignedUrls').length === 1);
check('uses site-photos bucket', calls.some((call) => call.operation === 'from' && call.bucket === 'site-photos'));
check('does not send existing http URLs for signing', signedCall?.paths.length === 2 && !signedCall.paths.some((path) => path.startsWith('http')));
check('passes ttl to Supabase signing', signedCall?.ttl === 900);
check('returns existing http URLs as usable image URLs', result.some((item) => item.path.startsWith('https://') && item.signedUrl === item.path));
check('returns signed storage URLs', result.some((item) => item.signedUrl === 'https://signed/one') && result.some((item) => item.signedUrl === 'https://signed/two'));

calls.length = 0;
warnings.length = 0;
globalThis.__photoServiceTest.signedData = [
  { path: '71/2026-07/user_1.jpg', signedUrl: 'https://signed/one' },
  { path: '71/2026-07/missing.jpg', error: { message: 'not found' } },
];

result = await getSignedPhotoUrls(['71/2026-07/user_1.jpg', '71/2026-07/missing.jpg']);
check('partial signing failure does not throw', Array.isArray(result));
check('partial signing failure returns signed subset', result.length === 1 && result[0].signedUrl === 'https://signed/one');
check('partial signing failure is warned', warnings.length > 0);

calls.length = 0;
globalThis.__photoServiceTest.signedData = [{ path: '71/2026-07/user_1.jpg', signedUrl: 'https://signed/one' }];
const singleUrl = await getSignedPhotoUrl('71/2026-07/user_1.jpg');
check('single URL helper returns signed URL string', singleUrl === 'https://signed/one');

calls.length = 0;
globalThis.__photoServiceTest.removeData = [{ name: '71/2026-07/user_1.jpg' }];
const removeResult = await removePhotoPaths(['71/2026-07/user_1.jpg', 'https://cdn.example.com/already.jpg']);
const removeCall = calls.find((call) => call.operation === 'remove');
check('removePhotoPaths removes only storage paths', removeCall?.paths.length === 1 && removeCall.paths[0] === '71/2026-07/user_1.jpg');
check('removePhotoPaths returns without error on success', removeResult.error === null);

console.warn = originalWarn;

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
