import { execFileSync } from 'node:child_process';

const LOOPBACK = new Set(['127.0.0.1', 'localhost']);
const PROJECT_ID = 'p1-restored-production-rehearsal';
const DISPOSABLE_CONTAINER = /^p1-equivalence-[0-9a-f]{10}$/;
const REMOTE_MARKERS = ['.supabase.co', '.supabase.com', 'szgbkeqornkdngoegyso'];

function parseLoopbackUrl(label, raw, protocols) {
  if (!raw) throw new Error(`REFUSING P1 REHEARSAL: ${label} is required.`);
  let url;
  try { url = new URL(raw); } catch { throw new Error(`REFUSING P1 REHEARSAL: ${label} is not a valid URL.`); }
  if (!protocols.includes(url.protocol) || !LOOPBACK.has(url.hostname) || !url.port) {
    throw new Error(`REFUSING P1 REHEARSAL: ${label} must use ${protocols.join('/')} on an explicit loopback port.`);
  }
  return url;
}

export function assertP1RehearsalTarget(env = process.env) {
  if (env.LOCAL_FIXTURE_MODE !== '1') throw new Error('REFUSING P1 REHEARSAL: LOCAL_FIXTURE_MODE=1 is required.');
  if (env.LOCAL_SUPABASE_PROJECT_ID !== PROJECT_ID) throw new Error(`REFUSING P1 REHEARSAL: LOCAL_SUPABASE_PROJECT_ID must be ${PROJECT_ID}.`);

  const frontend = parseLoopbackUrl('PLAYWRIGHT_BASE_URL', env.PLAYWRIGHT_BASE_URL, ['http:']);
  const api = parseLoopbackUrl('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL, ['http:']);
  const auth = parseLoopbackUrl('P1_AUTH_URL', env.P1_AUTH_URL, ['http:']);
  const rest = parseLoopbackUrl('P1_POSTGREST_URL', env.P1_POSTGREST_URL, ['http:']);
  const db = parseLoopbackUrl('CERT_DB_URL', env.CERT_DB_URL, ['postgres:', 'postgresql:']);
  if (db.pathname !== '/postgres') throw new Error('REFUSING P1 REHEARSAL: database must be postgres.');

  const container = env.P1_DISPOSABLE_DB_CONTAINER || '';
  if (!DISPOSABLE_CONTAINER.test(container)) throw new Error('REFUSING P1 REHEARSAL: disposable database container identity is invalid.');
  const inspected = execFileSync('docker', ['inspect', '--format', '{{.State.Running}}|{{json .NetworkSettings.Ports}}', container], { encoding: 'utf8' }).trim();
  if (!inspected.startsWith('true|') || !inspected.includes(`\"HostIp\":\"127.0.0.1\"`) || !inspected.includes(`\"HostPort\":\"${db.port}\"`)) {
    throw new Error('REFUSING P1 REHEARSAL: database URL does not match the running loopback-only disposable container.');
  }

  const endpointEntries = Object.entries(env).filter(([key]) => /(URL|URI|HOST|SUPABASE|DATABASE|POSTGRES|PROJECT_REF)/i.test(key));
  const remote = endpointEntries.find(([, value]) => REMOTE_MARKERS.some(marker => String(value).toLowerCase().includes(marker)));
  if (remote) throw new Error(`REFUSING P1 REHEARSAL: remote/production marker found in ${remote[0]}.`);

  return { frontend, api, auth, rest, db, container, projectId: PROJECT_ID };
}
