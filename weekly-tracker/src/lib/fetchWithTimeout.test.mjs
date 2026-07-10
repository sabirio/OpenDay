// fetchWithTimeout.test.mjs — proves the root fix for the "app hangs on an
// infinite loading spinner" bug actually works: a stalled Supabase request
// gets aborted within the configured window instead of hanging forever.
// Zero-dependency, no network, no real 15s wait — uses a fake fetchImpl that
// mimics real fetch()'s AbortSignal behavior (rejects when the signal fires,
// otherwise never settles on its own).
// Run: node src/lib/fetchWithTimeout.test.mjs

import { createFetchWithTimeout } from './fetchWithTimeout.js';

// AbortSignal.timeout()'s internal timer is unref()'d in Node (by design —
// it shouldn't keep a server process alive on its own), so nothing else
// keeps this plain-node test script running long enough for it to fire.
// Doesn't affect production: the real app runs in a browser, which has no
// such concept. Kept alive here only for the duration of this file.
const keepAlive = setInterval(() => {}, 100);

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// A fake fetch that behaves like the real thing w.r.t. AbortSignal: it
// rejects when the signal fires, but otherwise never resolves/rejects on
// its own — simulating a genuinely stalled request (RLS hang, dropped
// connection, paused project).
function hangingFetch(input, init) {
  return new Promise((resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return; // hangs forever, nothing to react to
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

console.log('\n1) A stalled request is aborted within the configured timeout, not left hanging');
{
  const fetchWithTimeout = createFetchWithTimeout(50, hangingFetch);
  const start = Date.now();
  let threw = false;
  try {
    await fetchWithTimeout('https://example.test/rest/v1/profiles', {});
  } catch (err) {
    threw = true;
    check('rejection is an AbortError', err.name === 'AbortError');
  }
  const elapsed = Date.now() - start;
  check('the call rejects (does not hang forever)', threw === true);
  check('it aborts close to the configured timeout, not instantly and not never', elapsed >= 40 && elapsed < 1000);
}

console.log('\n2) A request that finishes before the timeout resolves normally, unaffected');
{
  const quickFetch = async (input, init) => {
    check('no signal has fired for a request that finishes on its own', init.signal.aborted === false);
    return { ok: true, url: input };
  };
  const fetchWithTimeout = createFetchWithTimeout(5000, quickFetch);
  const result = await fetchWithTimeout('https://example.test/rest/v1/profiles', {});
  check('resolves with the real response', result.ok === true && result.url === 'https://example.test/rest/v1/profiles');
}

console.log('\n3) An external abort signal (unrelated to the timeout) is still honored');
{
  const external = new AbortController();
  const fetchWithTimeout = createFetchWithTimeout(5000, hangingFetch); // long timeout — must not be what fires
  const promise = fetchWithTimeout('https://example.test/rest/v1/profiles', { signal: external.signal });
  let threw = false;
  const settled = promise.catch((err) => { threw = true; return err; });
  setTimeout(() => external.abort(), 20);
  const err = await settled;
  check('caller-supplied signal still aborts the request even when the timeout has not fired', threw === true);
  check('rejection is an AbortError', err?.name === 'AbortError');
}

clearInterval(keepAlive);
console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
