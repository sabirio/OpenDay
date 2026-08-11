// The one local-only handoff from Supabase CLI status to the guarded
// certification environment. Child processes receive values through `env`,
// never interpolated into a shell command.
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

export function certificationEnvironmentFromStatus(status, inherited = process.env) {
  const apiUrl = status?.API_URL;
  const dbUrl = status?.DB_URL;
  const api = new URL(apiUrl);
  if (apiUrl !== api.href.replace(/\/$/, '') && apiUrl !== api.href) throw new Error('Local Supabase API URL must not contain shell quoting or whitespace.');
  return {
    ...inherited,
    LOCAL_FIXTURE_MODE: '1',
    LOCAL_SUPABASE_PROJECT_ID: 'weekly-tracker',
    CERT_SUPABASE_URL: apiUrl,
    CERT_SUPABASE_ANON_KEY: status.ANON_KEY,
    CERT_SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    CERT_DB_URL: dbUrl,
    VITE_SUPABASE_URL: apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  };
}

function main() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  // Windows cannot exec a .cmd file directly through execFileSync (EINVAL).
  // The command is static; no environment value is interpolated into it.
  const statusCommand = process.platform === 'win32'
    ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npx.cmd supabase status --output json']]
    : ['npx', ['supabase', 'status', '--output', 'json']];
  const stdout = execFileSync(statusCommand[0], statusCommand[1], { cwd, encoding: 'utf8' });
  const env = certificationEnvironmentFromStatus(JSON.parse(stdout));
  const child = process.platform === 'win32'
    ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd run cert:reset:r1-reporting:local']]
    : ['npm', ['run', 'cert:reset:r1-reporting:local']];
  const result = spawnSync(child[0], child[1], { cwd, env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
