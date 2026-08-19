# OpenDay Security 148

This owner-only package removes authenticated Data API access from three
internal `SECURITY DEFINER` helpers and introduces an authorization-checked
schedule lifecycle RPC for the application.

## Staging

1. Run `RUN-STAGING-SECURITY-148.cmd` from the repository root.
2. Confirm the locked OpenDay Staging project and enter its Session pooler credentials.
3. Confirm that the command ends with `STAGING_SECURITY_148=PASS`.
4. Verify the application schedule screen before continuing to production.

## Production

1. Create and verify a fresh OpenDay Production backup.
2. Run `RUN-PRODUCTION-SECURITY-148.cmd` from the repository root.
3. Confirm the locked OpenDay Production project and enter its Session pooler credentials.
4. Confirm that the command ends with `PRODUCTION_SECURITY_148=PASS`.

Do not paste either SQL artifact into the Supabase SQL Editor. The package is
transactional, target-locked and hash-verified by the owner runner.
