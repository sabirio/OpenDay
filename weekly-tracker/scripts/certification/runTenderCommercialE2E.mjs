import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertLocalTarget } from './localTargetGuard.mjs';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5178';

function localEnvironment() {
  const envFile = path.resolve('.env.development.local');
  const localDev = Object.fromEntries((existsSync(envFile) ? readFileSync(envFile, 'utf8') : '').split(/\r?\n/)
    .map(line => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map(match => [match[1], match[2]]));
  const values = {
    API_URL: process.env.CERT_SUPABASE_URL || process.env.VITE_SUPABASE_URL || localDev.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
    DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    ANON_KEY: process.env.CERT_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || localDev.VITE_SUPABASE_ANON_KEY,
  };
  if (!values.ANON_KEY) {
    throw new Error('REFUSING E2E: local Supabase publishable key is unavailable.');
  }
  assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
  return {
    ...process.env,
    VITE_SUPABASE_URL: values.API_URL,
    VITE_SUPABASE_ANON_KEY: values.ANON_KEY,
    CERT_DB_URL: values.DB_URL,
    LOCAL_FIXTURE_MODE: '1',
    LOCAL_SUPABASE_PROJECT_ID: 'weekly-tracker',
    PLAYWRIGHT_SKIP_WEBSERVER: '1',
    PLAYWRIGHT_BASE_URL: baseURL,
  };
}

async function isAnswering(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try { await fetch(url, { signal: controller.signal }); return true; }
  catch { return false; }
  finally { clearTimeout(timer); }
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isAnswering(url)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Tender commercial E2E server did not start at ${url}.`);
}

function killOwnedTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { /* already stopped */ } }
}

async function main() {
  const env = localEnvironment();
  if (await isAnswering(baseURL)) {
    throw new Error(`REFUSING E2E: ${baseURL} is already occupied; the targeted run requires an owned server.`);
  }
  const logDirectory = mkdtempSync(path.join(tmpdir(), 'openday-tender-e2e-'));
  const logFd = openSync(path.join(logDirectory, 'vite.log'), 'a');
  const viteCli = path.resolve('node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', new URL(baseURL).port, '--strictPort'], {
    env,
    stdio: ['ignore', logFd, logFd],
    shell: false,
    detached: process.platform !== 'win32',
  });
  let exitCode = 1;
  try {
    await waitForServer(baseURL);
    const result = spawnSync(npx, ['playwright', 'test', 'tests/e2e/tender-commercial-spine.spec.js', '--workers=1'], {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    exitCode = result.status ?? 1;
  } finally {
    killOwnedTree(server.pid);
  }
  process.exit(exitCode);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
