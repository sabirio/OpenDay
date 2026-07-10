// AbortController-based fetch timeout wrapper. Extracted out of supabase.js
// so it's testable without VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (see
// supabase.js for why this exists — no Supabase client library puts a
// timeout on its underlying fetch() by default).
//
// `fetchImpl` defaults to the global fetch; tests inject a fake so the abort
// wiring can be verified without a real network call or a real 15s wait.
export function createFetchWithTimeout(timeoutMs, fetchImpl = fetch) {
  return function fetchWithTimeout(input, init) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    return fetchImpl(input, { ...init, signal });
  };
}
