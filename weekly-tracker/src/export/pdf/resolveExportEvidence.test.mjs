// resolveExportEvidence.test.mjs
// Same Supabase-mocking convention as src/tests/photoService.test.mjs: a
// custom loader substitutes a fake `supabase` only for the one import site
// that needs it (photoService.js's `../lib/supabase`), so this test never
// touches a real Supabase project and stays a true unit test.

import { register } from 'node:module';

function moduleDataUrl(src) {
  return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`;
}

const supabaseMockUrl = moduleDataUrl(`
export const supabase = globalThis.__resolveExportEvidenceTest.supabase;
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
  else { fail++; console.error(`  FAIL ${label}`); }
}

const calls = [];
globalThis.__resolveExportEvidenceTest = {
  signedData: [],
  supabase: {
    storage: {
      from(bucket) {
        calls.push({ operation: 'from', bucket });
        return {
          async createSignedUrls(paths, ttl) {
            calls.push({ operation: 'createSignedUrls', paths, ttl });
            return { data: globalThis.__resolveExportEvidenceTest.signedData, error: null };
          },
        };
      },
    },
  },
};

const { resolveExportEvidence } = await import('./resolveExportEvidence.js');

console.log('\nresolveExportEvidence');

check('empty input resolves to an empty array without calling storage', await (async () => {
  calls.length = 0;
  const result = await resolveExportEvidence([]);
  return Array.isArray(result) && result.length === 0 && calls.length === 0;
})());

check('null/non-array input resolves to an empty array', await (async () => {
  const result = await resolveExportEvidence(null);
  return Array.isArray(result) && result.length === 0;
})());

globalThis.__resolveExportEvidenceTest.signedData = [
  { path: 'project-1/2026-07-14/photo1.jpg', signedUrl: 'https://signed.example/one?token=abc' },
  { path: 'project-1/2026-07-14/photo2.jpg', signedUrl: 'https://signed.example/two?token=def' },
];

check('resolves real paths into {path, url} pairs using the existing signed-URL service', await (async () => {
  calls.length = 0;
  const result = await resolveExportEvidence(['project-1/2026-07-14/photo1.jpg', 'project-1/2026-07-14/photo2.jpg']);
  return result.length === 2 &&
    result[0].path === 'project-1/2026-07-14/photo1.jpg' && result[0].url === 'https://signed.example/one?token=abc' &&
    result[1].url === 'https://signed.example/two?token=def';
})());

check('uses the same private bucket as the on-screen PhotoGallery (site-photos)', calls.some(c => c.operation === 'from' && c.bucket === 'site-photos'));
check('does not request a longer-than-default TTL (URLs stay short-lived, not a workaround for permanent public links)', calls.every(c => c.operation !== 'createSignedUrls' || c.ttl === undefined || c.ttl <= 3600));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
