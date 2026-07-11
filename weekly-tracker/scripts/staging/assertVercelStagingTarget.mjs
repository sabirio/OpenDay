const required = ['DEPLOY_ENV', 'STAGING_VERCEL_PROJECT_ID', 'STAGING_VERCEL_PROJECT_NAME', 'STAGING_VERCEL_HOST', 'STAGING_ALLOWED_VERCEL_PROJECT_IDS'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`VERCEL STAGING GUARD REFUSED: missing ${missing.join(', ')}`);
  process.exit(1);
}

const env = process.env.DEPLOY_ENV.toLowerCase();
const id = process.env.STAGING_VERCEL_PROJECT_ID.trim();
const name = process.env.STAGING_VERCEL_PROJECT_NAME.trim().toLowerCase();
const host = process.env.STAGING_VERCEL_HOST.trim().toLowerCase();
const allowed = new Set(process.env.STAGING_ALLOWED_VERCEL_PROJECT_IDS.split(',').map((v) => v.trim()).filter(Boolean));
const productionIds = new Set(['prj_Ux8tzBDilA7Fef9kdGNRsNdzIXs3']);
const productionNames = new Set(['noryxapp']);
const productionHosts = new Set(['openday.fit', 'www.openday.fit']);

if (env !== 'staging' || productionIds.has(id) || productionNames.has(name) || productionHosts.has(host) || !allowed.has(id)) {
  console.error('VERCEL STAGING GUARD REFUSED: target is undefined, production, or not explicitly allowlisted');
  process.exit(1);
}
if (!host.endsWith('.vercel.app')) {
  console.error('VERCEL STAGING GUARD REFUSED: staging host must be a vercel.app hostname');
  process.exit(1);
}

console.log(`VERCEL STAGING GUARD PASS: ${name} (${id}) at ${host}`);
