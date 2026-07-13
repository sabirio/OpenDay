import { assertLocalTarget } from './localTargetGuard.mjs';

export const SUPABASE_URL = process.env.CERT_SUPABASE_URL;
export const ANON_KEY = process.env.CERT_SUPABASE_ANON_KEY;
export const SERVICE_ROLE_KEY = process.env.CERT_SUPABASE_SERVICE_ROLE_KEY;
export const DB_URL = process.env.CERT_DB_URL;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !DB_URL) {
  throw new Error('REFUSING CERTIFICATION: CERT_SUPABASE_URL, CERT_SUPABASE_ANON_KEY, CERT_SUPABASE_SERVICE_ROLE_KEY, and CERT_DB_URL must be process-scoped.');
}

assertLocalTarget({
  apiUrl: SUPABASE_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

export function isCertificationEnvironmentAvailable() {
  return true;
}
