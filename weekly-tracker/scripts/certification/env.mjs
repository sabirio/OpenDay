// Sprint 4.5 certification — shared connection config for the LOCAL Supabase
// stack only. Every certification script imports its Supabase URL/keys from
// here rather than reading VITE_SUPABASE_URL directly, so there is exactly
// one place that can point at a database — and that place refuses to run
// against anything that isn't localhost.
//
// These are the standard, publicly-documented Supabase CLI local-dev demo
// keys (identical on every machine that runs `supabase start` — not a
// secret). They only work against a local stack; they are rejected by any
// real Supabase project's JWT verification.

export const SUPABASE_URL = process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321';
export const ANON_KEY = process.env.CERT_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE_ROLE_KEY = process.env.CERT_SUPABASE_SERVICE_ROLE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
export const DB_URL = process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Hard safety guard: refuse to run any certification script against
// anything that isn't a loopback address. This is the one thing standing
// between "isolated local test run" and "accidentally hitting a real
// project" if CERT_SUPABASE_URL is ever misconfigured.
function assertLocal(url, label) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`${label} is not a valid URL: ${url}`); }
  const host = parsed.hostname;
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLocal) {
    throw new Error(
      `REFUSING TO RUN: ${label} ("${url}") is not localhost. ` +
      'Sprint 4.5 certification scripts must only ever target a local Supabase stack. ' +
      'If you intended this, that is exactly the mistake this guard exists to catch.'
    );
  }
}

assertLocal(SUPABASE_URL, 'CERT_SUPABASE_URL');
assertLocal(DB_URL, 'CERT_DB_URL');

export function isCertificationEnvironmentAvailable() {
  return true; // guard above already threw if misconfigured; callers should still try/catch network calls
}
