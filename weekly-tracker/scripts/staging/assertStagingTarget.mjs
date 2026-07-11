const required = ['DEPLOY_ENV', 'STAGING_PROJECT_REF', 'STAGING_SUPABASE_HOST', 'STAGING_ALLOWED_PROJECT_REFS'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`STAGING GUARD REFUSED: missing ${missing.join(', ')}`);
  process.exit(1);
}

const environment = process.env.DEPLOY_ENV.toLowerCase();
const projectRef = process.env.STAGING_PROJECT_REF.trim();
const stagingHost = process.env.STAGING_SUPABASE_HOST.trim().toLowerCase();
const allowed = new Set(process.env.STAGING_ALLOWED_PROJECT_REFS.split(',').map((v) => v.trim()).filter(Boolean));
const productionDenylist = new Set(['szgbkeqornkdngoegyso']);
const productionHostDenylist = new Set(['szgbkeqornkdngoegyso.supabase.co', 'openday.fit']);

if (environment !== 'staging') {
  console.error(`STAGING GUARD REFUSED: DEPLOY_ENV must equal staging, received ${environment}`);
  process.exit(1);
}
if (productionDenylist.has(projectRef)) {
  console.error('STAGING GUARD REFUSED: target is the known production project');
  process.exit(1);
}
if (productionHostDenylist.has(stagingHost)) {
  console.error('STAGING GUARD REFUSED: hostname is a known production identifier');
  process.exit(1);
}
if (stagingHost !== `${projectRef}.supabase.co`) {
  console.error('STAGING GUARD REFUSED: hostname does not match the explicit staging project ref');
  process.exit(1);
}
if (!allowed.has(projectRef)) {
  console.error('STAGING GUARD REFUSED: project ref is not in the explicit staging allowlist');
  process.exit(1);
}

console.log(`STAGING GUARD PASS: explicit staging target ${projectRef}`);
