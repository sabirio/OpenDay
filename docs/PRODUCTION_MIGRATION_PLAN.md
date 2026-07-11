# Production Migration Plan

Prepared only; execution is blocked until backup readiness and explicit owner approval.

1. Prove a current restorable backup or PITR capability and record restore ownership.
2. Reconfirm production/staging fingerprints.
3. Capture read-only production migration/schema baseline.
4. Compare against expected `000`, `010`, `012–027`; 011 remains excluded.
5. Dry-run only exact missing append-only migrations; stop on destructive SQL or drift.
6. Present exact migrations, affected objects, risks and frontend commit for manual approval.
7. After approval, migrate DB, verify old frontend health, then deploy exact approved commit.

No migration repair or ad hoc SQL is authorized.
