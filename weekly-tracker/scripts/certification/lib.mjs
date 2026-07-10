// Shared helpers for Sprint 4.5 certification scripts.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } from './env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadFixtureState() {
  try {
    return JSON.parse(readFileSync(path.join(__dirname, 'fixture-state.json'), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('FIXTURE STATE NOT FOUND: run `node scripts/certification/fixtures.mjs` first (after resetAndDeploy.mjs).');
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Preflight: is the local Supabase stack actually reachable? Every
 * certification script calls this before doing any real work, so a down
 * environment fails fast with an explicit, unambiguous message instead of
 * a raw connection-refused stack trace that could be mistaken for a
 * genuine test failure.
 */
export async function requireCertificationEnvironment() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
    if (!res.ok && res.status !== 404) throw new Error(`unexpected status ${res.status}`);
  } catch (err) {
    console.error(`\nSKIPPED — ENVIRONMENT UNAVAILABLE: local Supabase stack is not reachable at ${SUPABASE_URL}.`);
    console.error(`Run: npx supabase start (from weekly-tracker/), then node scripts/certification/resetAndDeploy.mjs && node scripts/certification/fixtures.mjs`);
    console.error(`(${err.message})\n`);
    process.exit(3); // distinct exit code: "environment unavailable", not "assertions failed"
  }
}

export function psql(sql) {
  return execFileSync(
    'psql',
    [DB_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '|', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` } }
  ).trim();
}

/** Ground-truth row count, bypassing RLS entirely (direct psql as the postgres superuser) — used to verify actual persisted state, independent of what any RLS-scoped client can see. */
export function countRows(table, whereSql) {
  const out = psql(`SELECT COUNT(*) FROM public.${table} WHERE ${whereSql};`);
  return Number(out);
}

export function queryOne(sql) {
  const out = psql(sql);
  return out === '' ? null : out;
}

let signInCache = new Map();

/** Authenticated supabase-js client for a fixture user, via a REAL signInWithPassword call (anon key), not the service-role client. */
export async function signInAs(email, password) {
  const cacheKey = email;
  if (signInCache.has(cacheKey)) return signInCache.get(cacheKey);
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`);
  signInCache.set(cacheKey, client);
  return client;
}

export function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function makeReporter(suiteName) {
  let pass = 0, fail = 0;
  const results = [];
  function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  OK ${name}`); }
    else { fail++; console.error(`  FAIL ${name}${detail ? ' -- ' + detail : ''}`); }
    results.push({ name, cond, detail });
  }
  function section(title) { console.log(`\n${title}`); }
  function summary() {
    console.log(`\n-- ${suiteName}: ${pass} passed, ${fail} failed --\n`);
    return { pass, fail, results };
  }
  return { check, section, summary, get fail() { return fail; } };
}
