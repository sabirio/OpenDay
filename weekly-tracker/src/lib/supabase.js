import { createClient } from '@supabase/supabase-js';
import { createFetchWithTimeout } from './fetchWithTimeout.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
}

// Neither @supabase/postgrest-js nor @supabase/auth-js put a timeout on their
// underlying fetch() by default — a stalled request (RLS hang, dropped
// connection, paused project) leaves the caller's promise unresolved
// forever, with no error to catch and nothing visible in the console. This
// was the root cause of the app hanging on an infinite loading spinner:
// AuthContext's initial session/profile check awaited such a call and never
// got a result to flip `loading` to false.
//
// `global.fetch` is what supabase-js hands to EVERY sub-client (auth,
// postgrest/`.from()`, storage) — see SupabaseClient's constructor, which
// derives `this.fetch` from `settings.global.fetch` and passes it into all
// three. One AbortController-based timeout here bounds every Supabase call
// the app makes, app-wide, and actually aborts the real in-flight request
// (not just an app-level race that abandons a promise while the network
// call lingers in the background).
const REQUEST_TIMEOUT_MS = 15000;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: createFetchWithTimeout(REQUEST_TIMEOUT_MS) },
});
