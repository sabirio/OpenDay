import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_DB_URL as DB_URL } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFile = path.resolve(
  __dirname, '..', '..', 'src', 'migrations',
  '154_platform_entitlement_control_plane.test.sql',
);

execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', testFile], {
  stdio: 'inherit',
  env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` },
});
console.log('Platform Entitlement Control Plane certification passed through 154.');
