import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import * as path from 'node:path';
import { assertLocalTarget } from './localTargetGuard.mjs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// This canonical full-suite run must talk to an exclusively-owned, freshly
// started dev server — never a reused one — so results are deterministic
// and the process this script spawns is unambiguously the process it later
// tears down. See PHASE 5E.1 audit: playwright.config.js's own
// `reuseExistingServer: true` is appropriate for ad hoc/manual Playwright
// invocations (fast local iteration), but this script bypasses it entirely
// via PLAYWRIGHT_SKIP_WEBSERVER, matching the pattern .github/workflows/ci.yml
// already uses for its own (production-preview) server.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

function localSupabaseEnvironment() {
  const status = execFileSync(npx, ['--yes', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: process.platform === 'win32',
  });
  const values = Object.fromEntries(
    status
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );

  if (!values.API_URL || !values.DB_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) {
    throw new Error('REFUSING E2E: local Supabase status did not provide the required endpoints and keys.');
  }

  assertLocalTarget({
    apiUrl: values.API_URL,
    dbUrl: values.DB_URL,
    enabled: '1',
    projectId: 'weekly-tracker',
  });

  return {
    ...process.env,
    VITE_SUPABASE_URL: values.API_URL,
    VITE_SUPABASE_ANON_KEY: values.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
    CERT_SUPABASE_URL: values.API_URL,
    CERT_SUPABASE_ANON_KEY: values.ANON_KEY,
    CERT_SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
    CERT_DB_URL: values.DB_URL,
    LOCAL_FIXTURE_MODE: '1',
    LOCAL_SUPABASE_PROJECT_ID: 'weekly-tracker',
  };
}

async function isServerAnswering(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(url, { attempts, intervalMs }) {
  for (let i = 0; i < attempts; i++) {
    if (await isServerAnswering(url, 2_000)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

// Only ever called with a PID this script itself spawned — never used to
// guess at or reap unrelated processes (other tools' Chromium/browser
// sessions, a developer's own separately-run `npm run dev`, etc.).
function killOwnedProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    // Best-effort — the process may already have exited on its own.
  }
}

let ownedServerPid = null;
let torndown = false;
function teardownOwnedServer() {
  if (torndown) return;
  torndown = true;
  if (ownedServerPid) {
    console.log('Tearing down the owned dev server...');
    killOwnedProcessTree(ownedServerPid);
  }
}

process.on('SIGINT', () => { teardownOwnedServer(); process.exit(130); });
process.on('SIGTERM', () => { teardownOwnedServer(); process.exit(143); });

async function main() {
  const env = localSupabaseEnvironment();
  console.log('Full E2E target proved local. Restoring canonical UI fixtures...');
  execFileSync(npm, ['run', 'cert:reset:ui'], { env, stdio: 'inherit', shell: process.platform === 'win32' });

  console.log('Canonical fixtures ready. Verifying local Auth/database preflight...');
  execFileSync(process.execPath, ['scripts/certification/playwrightPreflight.mjs'], { env, stdio: 'inherit' });

  console.log(`Verifying ${BASE_URL} is free before starting an owned dev server...`);
  if (await isServerAnswering(BASE_URL, 1_500)) {
    throw new Error(
      `REFUSING E2E: something is already answering at ${BASE_URL}. This certification run requires an ` +
      'exclusively-owned, freshly-started server so results are deterministic — reusing an unknown existing ' +
      'process is exactly the failure mode this script now refuses. Stop whatever is bound there and retry; ' +
      'this script will not attempt to identify or terminate it.',
    );
  }

  console.log('Port free. Starting an owned, fresh Vite dev server for this run...');
  // Deliberately NOT under test-results/ — Playwright resets its own
  // outputDir at the start of every run, which would silently unlink this
  // file (and any bytes still in flight) the moment the suite starts,
  // defeating "preserve diagnostics on failure" for exactly the failure
  // mode (the server never became ready) that most needs this log.
  const logPath = path.join(process.cwd(), 'dev-server.log');
  mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = openSync(logPath, 'a');
  const devServer = spawn(npm, ['run', 'dev', '--', '--host', '127.0.0.1'], {
    env,
    stdio: ['ignore', logFd, logFd],
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  });
  ownedServerPid = devServer.pid;

  let exitCode = 1;
  try {
    const ready = await waitForServer(BASE_URL, { attempts: 60, intervalMs: 1_000 });
    if (!ready) {
      throw new Error(
        `REFUSING E2E: the owned dev server never answered at ${BASE_URL} within 60s. ` +
        `See ${logPath} for its output.`,
      );
    }

    // Additive, opt-in only: forwarding extra CLI args (e.g. a specific spec
    // file path) lets an investigation target a subset of the suite while
    // still getting the exact same fresh/owned/deterministic lifecycle as
    // the full canonical run. With no args (the normal `npm run test:e2e:all`
    // invocation), behavior is unchanged — the full suite still runs.
    const extraArgs = process.argv.slice(2);
    console.log('Owned dev server ready. Running the complete suite with exclusive access to shared mutable fixtures...');
    const result = spawnSync(npx, ['playwright', 'test', '--workers=1', ...extraArgs], {
      env: { ...env, PLAYWRIGHT_SKIP_WEBSERVER: '1', PLAYWRIGHT_BASE_URL: BASE_URL },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    // A non-zero exit here means tests failed, which is a normal, reportable
    // outcome — not an infrastructure error — so it is not thrown.
    exitCode = result.status ?? 1;
  } finally {
    teardownOwnedServer();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err.message || err);
  teardownOwnedServer();
  process.exit(1);
});
