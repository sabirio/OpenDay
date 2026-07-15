const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

function isHostedSupabaseHost(hostname) {
  return hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.com');
}

export function assertLocalTarget({ apiUrl, dbUrl, enabled, projectId }) {
  if (enabled !== '1') throw new Error('REFUSING LOCAL FIXTURES: LOCAL_FIXTURE_MODE=1 is required.');
  if (projectId !== 'weekly-tracker') throw new Error('REFUSING LOCAL FIXTURES: LOCAL_SUPABASE_PROJECT_ID must be weekly-tracker.');

  let api, db;
  try { api = new URL(apiUrl); } catch { throw new Error('REFUSING LOCAL FIXTURES: malformed API URL.'); }
  try { db = new URL(dbUrl); } catch { throw new Error('REFUSING LOCAL FIXTURES: malformed database URL.'); }

  if (api.username || api.password) throw new Error('REFUSING LOCAL FIXTURES: API URL must not contain credentials.');
  if (isHostedSupabaseHost(api.hostname) || isHostedSupabaseHost(db.hostname)) {
    throw new Error('REFUSING LOCAL FIXTURES: hosted Supabase URLs are not allowed.');
  }
  if (!LOOPBACK_HOSTS.has(api.hostname) || api.protocol !== 'http:' || api.port !== '54321') {
    throw new Error('REFUSING LOCAL FIXTURES: API must be http 127.0.0.1/localhost on port 54321.');
  }
  if (!LOOPBACK_HOSTS.has(db.hostname) || !['postgres:', 'postgresql:'].includes(db.protocol) || db.port !== '54322') {
    throw new Error('REFUSING LOCAL FIXTURES: database must be PostgreSQL 127.0.0.1/localhost on port 54322.');
  }
  if (db.pathname !== '/postgres' || !db.username) {
    throw new Error('REFUSING LOCAL FIXTURES: expected local database name postgres and an explicit database user.');
  }
  return { apiUrl: api.href.replace(/\/$/, ''), dbUrl: db.href };
}
