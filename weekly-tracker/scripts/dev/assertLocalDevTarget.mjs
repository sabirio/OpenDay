// Predev safety guard for `npm run dev`.
//
// weekly-tracker/.env.local is real, gitignored, developer-machine config
// that currently points at the live production Supabase project — nothing
// in its filename signals that. Vite's own env precedence for `vite`/mode
// "development" is process.env > .env.development.local > .env.local >
// .env.development > .env, so a machine WITHOUT .env.development.local
// silently falls through to .env.local and starts the local frontend
// against production (this already happened once — see
// docs/INCIDENT_2026-07-10_PRODUCTION_SIDE_EFFECT.md, a different script,
// same root cause). This guard resolves the exact same target Vite's dev
// server would (via Vite's own loadEnv(), not a hand-rolled dotenv parser)
// and refuses to let `npm run dev` start unless that target is loopback.
//
// Deliberately independent of scripts/certification/localTargetGuard.mjs's
// assertLocalTarget() — that function's contract (LOCAL_FIXTURE_MODE=1,
// LOCAL_SUPABASE_PROJECT_ID=weekly-tracker, exact port 54321/54322 pinning)
// exists to gate DESTRUCTIVE database resets/fixtures behind deliberate
// opt-in; starting a dev server is not that, and forcing the same opt-in
// dance here would be the wrong UX for an everyday workflow. This guard
// reuses only the shared host-classification primitives (LOOPBACK_HOSTS,
// isHostedSupabaseHost) so both guards agree on what "local" means, without
// weakening or bypassing the certification guard's own stricter contract.
//
// No override exists. Audited: no workflow in this repository runs `npm run
// dev` (the local Vite frontend) against staging/production — staging E2E
// (playwright.staging.config.js) tests the already-deployed staging URL
// directly and never starts a local dev server. Per that finding, this
// guard hard-blocks rather than adding an escape hatch.
//
// Run: node scripts/dev/assertLocalDevTarget.mjs (wired as `predev` in package.json)

import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { LOOPBACK_HOSTS, isHostedSupabaseHost } from '../certification/localTargetGuard.mjs';

const DEV_MODE = 'development';

/**
 * Resolves VITE_SUPABASE_URL exactly as Vite's own dev server would for
 * `mode` in `envDir` — same precedence, including real process.env overrides.
 */
export function resolveDevSupabaseUrl(envDir = process.cwd(), mode = DEV_MODE) {
  const env = loadEnv(mode, envDir, '');
  return env.VITE_SUPABASE_URL;
}

/**
 * Pure classification — never logs, never exits. Returns { ok: true, hostname }
 * or { ok: false, reason }. `reason` never includes the URL's userinfo/query
 * (there is none to begin with for a bare Supabase URL) and this function
 * never touches or reads any key, only the URL.
 */
export function classifyDevTarget(rawUrl) {
  if (!rawUrl) {
    return { ok: false, reason: 'VITE_SUPABASE_URL is not set for the resolved development environment.' };
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `VITE_SUPABASE_URL is not a valid URL: "${rawUrl}"` };
  }
  if (isHostedSupabaseHost(url.hostname)) {
    return { ok: false, reason: `VITE_SUPABASE_URL resolves to a HOSTED Supabase project (${url.hostname}) — refusing to start the local dev server against it.` };
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    return { ok: false, reason: `VITE_SUPABASE_URL resolves to a non-loopback host (${url.hostname}) — only 127.0.0.1/localhost are allowed for local development.` };
  }
  return { ok: true, hostname: url.hostname };
}

function main() {
  const resolvedUrl = resolveDevSupabaseUrl();
  const result = classifyDevTarget(resolvedUrl);

  if (result.ok) {
    console.log(`[assertLocalDevTarget] OK — development Supabase target is loopback (${result.hostname}).`);
    return;
  }

  console.error('\nBLOCKED: local development Supabase target could not be proven safe.');
  console.error(`  ${result.reason}`);
  console.error('  Fix: create/check weekly-tracker/.env.development.local with:');
  console.error('    VITE_SUPABASE_URL=http://127.0.0.1:54321');
  console.error('    VITE_SUPABASE_ANON_KEY=<local Supabase anon key — from "npx supabase status">');
  console.error('  (weekly-tracker/.env.local is not a safe default — see its own risk in');
  console.error('   docs/INCIDENT_2026-07-10_PRODUCTION_SIDE_EFFECT.md.)\n');
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
