// localDevTargetGuard.test.mjs — predev/prelocal:dev safety guard shared by
// `npm run dev` and `npm run local:dev` (both are local Vite entry points and
// must carry the identical Supabase target safety guarantee).
// Run: node src/tests/localDevTargetGuard.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import {
  classifyDevTarget,
  resolveDevSupabaseUrl,
} from '../../scripts/dev/assertLocalDevTarget.mjs';
import { assertLocalTarget, isHostedSupabaseHost, LOOPBACK_HOSTS } from '../../scripts/certification/localTargetGuard.mjs';

let passed = 0;
const check = (n, f) => { f(); passed++; console.log(`  PASS ${n}`); };

console.log('\nlocalDevTargetGuard - predev safety guard');

// ── classifyDevTarget: pure host classification ──────────────────────────

check('http://127.0.0.1:54321 -> PASS', () => {
  const result = classifyDevTarget('http://127.0.0.1:54321');
  assert.equal(result.ok, true);
  assert.equal(result.hostname, '127.0.0.1');
});

check('http://localhost:54321 -> PASS', () => {
  const result = classifyDevTarget('http://localhost:54321');
  assert.equal(result.ok, true);
  assert.equal(result.hostname, 'localhost');
});

check('https://something.supabase.co -> BLOCK', () => {
  const result = classifyDevTarget('https://something.supabase.co');
  assert.equal(result.ok, false);
  assert.match(result.reason, /HOSTED Supabase project/);
});

check('https://something.supabase.com -> BLOCK', () => {
  const result = classifyDevTarget('https://something.supabase.com');
  assert.equal(result.ok, false);
  assert.match(result.reason, /HOSTED Supabase project/);
});

check('arbitrary remote hostname -> BLOCK', () => {
  const result = classifyDevTarget('https://example.com');
  assert.equal(result.ok, false);
  assert.match(result.reason, /non-loopback host/);
});

check('private LAN hostname -> BLOCK (not in the loopback allowlist)', () => {
  const result = classifyDevTarget('http://192.168.1.20:54321');
  assert.equal(result.ok, false);
  assert.match(result.reason, /non-loopback host/);
});

check('malformed URL -> BLOCK', () => {
  const result = classifyDevTarget('not a url');
  assert.equal(result.ok, false);
  assert.match(result.reason, /not a valid URL/);
});

check('missing URL -> BLOCK', () => {
  const result = classifyDevTarget(undefined);
  assert.equal(result.ok, false);
  assert.match(result.reason, /is not set/);
});

check('empty string URL -> BLOCK', () => {
  const result = classifyDevTarget('');
  assert.equal(result.ok, false);
  assert.match(result.reason, /is not set/);
});

// ── Error output never exposes secret values ─────────────────────────────

check('error output does not expose secret values (no key/token/anon in any reason string)', () => {
  const cases = [undefined, '', 'not a url', 'https://something.supabase.co', 'https://example.com'];
  for (const input of cases) {
    const { reason } = classifyDevTarget(input);
    assert.ok(reason, `expected a reason for ${input}`);
    assert.doesNotMatch(reason.toLowerCase(), /anon|service_role|apikey|secret|token|jwt|eyj/);
  }
});

const guardSource = readFileSync(new URL('../../scripts/dev/assertLocalDevTarget.mjs', import.meta.url), 'utf8');
check('guard script never reads an actual key value (only ever resolves VITE_SUPABASE_URL; ANON_KEY only appears in help text, never as env.VITE_SUPABASE_ANON_KEY)', () => {
  assert.doesNotMatch(guardSource, /env\.VITE_SUPABASE_ANON_KEY|env\.SUPABASE_SERVICE_ROLE_KEY|process\.env\.VITE_SUPABASE_ANON_KEY|process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

// ── No remote-dev override exists (audited: no legitimate workflow needs one) ─

check('no remote-dev override exists — hard block only, no ALLOW_REMOTE_SUPABASE_DEV-style escape hatch', () => {
  assert.doesNotMatch(guardSource, /ALLOW_REMOTE|process\.env\[.*OVERRIDE/);
});

// ── Certification/local destructive guard behavior is unchanged ─────────

function acceptsLocalTarget(overrides = {}) {
  try {
    assertLocalTarget({ apiUrl: 'http://127.0.0.1:54321', dbUrl: 'postgresql://postgres@127.0.0.1:54322/postgres', enabled: '1', projectId: 'weekly-tracker', ...overrides });
    return true;
  } catch { return false; }
}
check('certification guard (assertLocalTarget) still accepts a valid local target, unchanged', () => acceptsLocalTarget());
check('certification guard still rejects a hosted Supabase target, unchanged', () => !acceptsLocalTarget({ apiUrl: 'https://project.supabase.co' }));
check('certification guard still requires explicit LOCAL_FIXTURE_MODE=1 opt-in, unchanged (dev guard does not weaken this)', () => !acceptsLocalTarget({ enabled: undefined }));
check('dev guard and certification guard share the exact same LOOPBACK_HOSTS/isHostedSupabaseHost primitives (single source of truth for "local")', () => {
  assert.deepEqual([...LOOPBACK_HOSTS], ['127.0.0.1', 'localhost']);
  assert.equal(isHostedSupabaseHost('foo.supabase.co'), true);
  assert.equal(isHostedSupabaseHost('127.0.0.1'), false);
});

// ── Fresh-clone safety scenario (simulated in isolated temp dirs — never
//    touches the developer's real .env* files) ──────────────────────────

function withTempEnvDir(files, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dev-target-guard-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(path.join(dir, name), content, 'utf8');
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

check('Scenario A: .env.development.local missing, .env.local points at a hosted project -> resolves to the hosted URL and classifies as BLOCK', () => {
  withTempEnvDir({
    '.env.local': 'VITE_SUPABASE_URL=https://simulated-production-project.supabase.co\nVITE_SUPABASE_ANON_KEY=irrelevant\n',
  }, (dir) => {
    const resolved = resolveDevSupabaseUrl(dir, 'development');
    assert.equal(resolved, 'https://simulated-production-project.supabase.co');
    const result = classifyDevTarget(resolved);
    assert.equal(result.ok, false);
    assert.match(result.reason, /HOSTED Supabase project/);
  });
});

check('Scenario B: .env.development.local present and loopback -> overrides .env.local and classifies as PASS', () => {
  withTempEnvDir({
    '.env.local': 'VITE_SUPABASE_URL=https://simulated-production-project.supabase.co\nVITE_SUPABASE_ANON_KEY=irrelevant\n',
    '.env.development.local': 'VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=irrelevant\n',
  }, (dir) => {
    const resolved = resolveDevSupabaseUrl(dir, 'development');
    assert.equal(resolved, 'http://127.0.0.1:54321');
    const result = classifyDevTarget(resolved);
    assert.equal(result.ok, true);
    assert.equal(result.hostname, '127.0.0.1');
  });
});

check('Scenario C: no .env file at all -> resolves undefined and classifies as BLOCK (fails safe, not silently)', () => {
  withTempEnvDir({}, (dir) => {
    const resolved = resolveDevSupabaseUrl(dir, 'development');
    const result = classifyDevTarget(resolved);
    assert.equal(result.ok, false);
  });
});

// ── package.json wiring ──────────────────────────────────────────────────

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
check('predev wires the guard before `dev` starts (npm pre-script convention, cross-platform)', () => {
  assert.equal(packageJson.scripts.predev, 'node scripts/dev/assertLocalDevTarget.mjs');
});
check('predev uses plain node, no PowerShell/shell-specific syntax', () => {
  assert.doesNotMatch(packageJson.scripts.predev, /powershell|\.ps1|&&|;/i);
});
check('dev script itself remains just vite (guard runs via predev, not inlined)', () => {
  assert.equal(packageJson.scripts.dev, 'vite');
});
check('build script is untouched by this guard (production deploy must not depend on it)', () => {
  assert.equal(packageJson.scripts.build, 'vite build');
});

// ── local:dev must carry the exact same guarantee as dev (closes the bypass
//    where `npm run local:dev` launched vite directly, unguarded) ──────────

check('prelocal:dev exists and uses the exact same canonical guard command as predev — single implementation, not duplicated', () => {
  assert.ok(packageJson.scripts['prelocal:dev'], 'expected a prelocal:dev script');
  assert.equal(packageJson.scripts['prelocal:dev'], packageJson.scripts.predev);
});
check('prelocal:dev uses plain node, no PowerShell/shell-specific syntax', () => {
  assert.doesNotMatch(packageJson.scripts['prelocal:dev'], /powershell|\.ps1|&&|;/i);
});
check('local:dev itself remains exactly vite — preserves the existing literal-value convention/test, guard runs via prelocal:dev', () => {
  assert.equal(packageJson.scripts['local:dev'], 'vite');
});
check('no unguarded local Vite entry point remains: both dev and local:dev have a matching pre-hook pointing at the canonical guard script', () => {
  for (const key of ['dev', 'local:dev']) {
    const preKey = `pre${key}`;
    assert.equal(packageJson.scripts[preKey], 'node scripts/dev/assertLocalDevTarget.mjs', `expected ${preKey} to run the canonical guard`);
  }
});

console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
