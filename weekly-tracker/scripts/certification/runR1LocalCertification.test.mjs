import assert from 'node:assert/strict';
import { certificationEnvironmentFromStatus } from './runR1LocalCertification.mjs';

const source = { API_URL: 'http://127.0.0.1:54321', DB_URL: 'postgresql://postgres@127.0.0.1:54322/postgres', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's' };
const env = certificationEnvironmentFromStatus(source, { CERT_SUPABASE_URL: 'https://stale.invalid' });
assert.equal(env.CERT_SUPABASE_URL, source.API_URL);
assert.equal(env.VITE_SUPABASE_URL, source.API_URL);
assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, source.SERVICE_ROLE_KEY);
assert.equal(new URL(env.CERT_SUPABASE_URL).hostname, '127.0.0.1');
assert.throws(() => certificationEnvironmentFromStatus({ ...source, API_URL: '"http://127.0.0.1:54321"' }));
assert.throws(() => certificationEnvironmentFromStatus({ ...source, API_URL: 'http://127.0.0.1:54321\n' }));
console.log('runR1LocalCertification: PASS');
