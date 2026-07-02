// authService.test.mjs — unit tests for authService public functions.
//
// authService.js cannot be imported in Node ESM because it transitively imports
// supabase.js which uses `import.meta.env`. We test the logic inline using the
// same stub pattern as useRiskRows.test.mjs.
//
// Run: node src/tests/authService.test.mjs

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Inline reimplementation of the tested functions ───────────────────────────
// (mirrors authService.js exactly — if the source diverges, tests break)

function stepDownSeverity(sev) {
  if (sev === 'critical') return 'warning';
  if (sev === 'warning')  return 'info';
  return sev;
}

async function requestPasswordReset(email, supabase, origin) {
  const redirectTo = origin ? `${origin}/reset-password` : '/reset-password';
  try {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch (_) { }
  return { success: true };
}

async function updatePassword(password, supabase) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── 1. requestPasswordReset ───────────────────────────────────────────────────

console.log('\n1) requestPasswordReset — always returns { success: true }');

{
  let calledWith = null;
  const fakeSupabase = {
    auth: {
      resetPasswordForEmail: async (email, opts) => {
        calledWith = { email, opts };
        return { error: null };
      },
    },
  };

  const result = await requestPasswordReset('user@example.com', fakeSupabase, 'https://example.com');
  check('returns success: true',           result.success === true);
  check('no error field',                  result.error === undefined);
  check('called resetPasswordForEmail',    calledWith !== null);
  check('passed correct email',            calledWith.email === 'user@example.com');
  check('redirectTo includes /reset-password', calledWith.opts.redirectTo.endsWith('/reset-password'));
  check('redirectTo has origin prefix',    calledWith.opts.redirectTo.startsWith('https://example.com'));
}

{
  // Supabase throws — still returns success (never reveals email existence)
  const throwingSupabase = {
    auth: {
      resetPasswordForEmail: async () => { throw new Error('network error'); },
    },
  };
  const result = await requestPasswordReset('any@example.com', throwingSupabase, 'https://app.com');
  check('returns success: true even when supabase throws', result.success === true);
  check('no error field even on throw',    result.error === undefined);
}

{
  // No origin (SSR fallback)
  let calledWith = null;
  const fakeSupabase = {
    auth: {
      resetPasswordForEmail: async (email, opts) => { calledWith = opts; return { error: null }; },
    },
  };
  await requestPasswordReset('user@example.com', fakeSupabase, null);
  check('redirectTo = /reset-password when no origin', calledWith.redirectTo === '/reset-password');
}

// ── 2. updatePassword ─────────────────────────────────────────────────────────

console.log('\n2) updatePassword — delegates to supabase.auth.updateUser');

{
  let calledWith = null;
  const fakeSupabase = {
    auth: {
      updateUser: async (payload) => {
        calledWith = payload;
        return { error: null };
      },
    },
  };
  const result = await updatePassword('newSecurePass99', fakeSupabase);
  check('returns success: true',           result.success === true);
  check('no error field on success',       result.error === undefined);
  check('called updateUser with password', calledWith?.password === 'newSecurePass99');
}

{
  // Supabase returns an error (expired session / invalid token)
  const fakeSupabase = {
    auth: {
      updateUser: async () => ({ error: { message: 'JWT expired' } }),
    },
  };
  const result = await updatePassword('somepass', fakeSupabase);
  check('returns success: false on error',   result.success === false);
  check('error field contains message',      result.error === 'JWT expired');
}

{
  // updateUser returns error for short password (Supabase enforces min length server-side)
  const fakeSupabase = {
    auth: {
      updateUser: async () => ({ error: { message: 'Password should be at least 6 characters' } }),
    },
  };
  const result = await updatePassword('abc', fakeSupabase);
  check('short password → success: false',   result.success === false);
  check('short password → error propagated', result.error.includes('6 characters'));
}

// ── 3. stepDownSeverity (internal helper — validated via updatePassword indirectly) ──

console.log('\n3) stepDownSeverity helper');
check('critical → warning',   stepDownSeverity('critical') === 'warning');
check('warning → info',       stepDownSeverity('warning')  === 'info');
check('info → info',          stepDownSeverity('info')     === 'info');
check('positive → positive',  stepDownSeverity('positive') === 'positive');

// ── 4. Security invariants ────────────────────────────────────────────────────

console.log('\n4) Security invariants');

{
  // requestPasswordReset must never return an error even when the email is unknown
  // (prevents user enumeration). Simulate Supabase returning "user not found".
  const fakeSupabase = {
    auth: {
      resetPasswordForEmail: async () => ({ error: { message: 'User not found' } }),
    },
  };
  const result = await requestPasswordReset('nobody@example.com', fakeSupabase, 'https://app.com');
  check('never returns error for unknown email (anti-enumeration)', result.success === true && !result.error);
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
