import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (label, ok) => ok ? (pass++, console.log(`  OK ${label}`)) : (fail++, console.error(`  FAIL ${label}`));
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(appRoot, 'scripts', 'staging', 'assertStagingTarget.mjs');
const vercelScript = path.join(appRoot, 'scripts', 'staging', 'assertVercelStagingTarget.mjs');
const run = (env) => spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, ...env } });
const runVercel = (env) => spawnSync(process.execPath, [vercelScript], { encoding: 'utf8', env: { ...process.env, ...env } });

check('guard rejects undefined environment', run({ DEPLOY_ENV: '', STAGING_PROJECT_REF: '', STAGING_ALLOWED_PROJECT_REFS: '' }).status !== 0);
check('guard rejects known production ref even if allowlisted', run({ DEPLOY_ENV: 'staging', STAGING_PROJECT_REF: 'szgbkeqornkdngoegyso', STAGING_SUPABASE_HOST: 'szgbkeqornkdngoegyso.supabase.co', STAGING_ALLOWED_PROJECT_REFS: 'szgbkeqornkdngoegyso' }).status !== 0);
check('guard rejects a target absent from explicit allowlist', run({ DEPLOY_ENV: 'staging', STAGING_PROJECT_REF: 'stage-ref', STAGING_SUPABASE_HOST: 'stage-ref.supabase.co', STAGING_ALLOWED_PROJECT_REFS: 'another-ref' }).status !== 0);
check('guard rejects production environment name', run({ DEPLOY_ENV: 'production', STAGING_PROJECT_REF: 'stage-ref', STAGING_SUPABASE_HOST: 'stage-ref.supabase.co', STAGING_ALLOWED_PROJECT_REFS: 'stage-ref' }).status !== 0);
check('guard rejects a hostname that does not match the staging ref', run({ DEPLOY_ENV: 'staging', STAGING_PROJECT_REF: 'stage-ref', STAGING_SUPABASE_HOST: 'other.supabase.co', STAGING_ALLOWED_PROJECT_REFS: 'stage-ref' }).status !== 0);
check('guard accepts only explicit staging plus matching host and allowlisted non-production ref', run({ DEPLOY_ENV: 'staging', STAGING_PROJECT_REF: 'stage-ref', STAGING_SUPABASE_HOST: 'stage-ref.supabase.co', STAGING_ALLOWED_PROJECT_REFS: 'stage-ref' }).status === 0);
check('Vercel guard rejects undefined target', runVercel({ DEPLOY_ENV: '' }).status !== 0);
check('Vercel guard rejects known production project and domain', runVercel({ DEPLOY_ENV: 'staging', STAGING_VERCEL_PROJECT_ID: 'prj_Ux8tzBDilA7Fef9kdGNRsNdzIXs3', STAGING_VERCEL_PROJECT_NAME: 'noryxapp', STAGING_VERCEL_HOST: 'www.openday.fit', STAGING_ALLOWED_VERCEL_PROJECT_IDS: 'prj_Ux8tzBDilA7Fef9kdGNRsNdzIXs3' }).status !== 0);
check('Vercel guard rejects project absent from allowlist', runVercel({ DEPLOY_ENV: 'staging', STAGING_VERCEL_PROJECT_ID: 'prj_stage', STAGING_VERCEL_PROJECT_NAME: 'openday-staging', STAGING_VERCEL_HOST: 'openday-staging.vercel.app', STAGING_ALLOWED_VERCEL_PROJECT_IDS: 'prj_other' }).status !== 0);
check('Vercel guard accepts explicit allowlisted staging target', runVercel({ DEPLOY_ENV: 'staging', STAGING_VERCEL_PROJECT_ID: 'prj_stage', STAGING_VERCEL_PROJECT_NAME: 'openday-staging', STAGING_VERCEL_HOST: 'openday-staging.vercel.app', STAGING_ALLOWED_VERCEL_PROJECT_IDS: 'prj_stage' }).status === 0);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
