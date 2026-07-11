# Clean Install Certification

Certification date: 2026-07-10. Status: **PASS**.

Final repeat on 2026-07-11: an isolated `work/final-clean` copy excluded all dependency/build output and local environment files. `npm ci` installed 151 packages in 10 seconds with exit 0. From that installation: lint 0/0, typecheck PASS, architecture 25/25, tests 77/77 suites and 1835/1835 checks, and production-optimized local build PASS (443 modules). Package and lock files were unchanged.

## Method

Two isolated copies of the current working tree were created under `work/`, excluding dependency and build-output directories. Both retained the tracked `package-lock.json`; its SHA-256 remained `EBED2BD28A42FE7AA3EF3ABCDBCDED3357956B23A33A8A886D2591878552BA9B`. No dependency version or lockfile was changed.

| Run | Command | Result | Follow-up gate |
| --- | --- | --- | --- |
| A | `npm ci` | PASS; 151 packages; exit 0 | tests 76/76 and 1816/1816; typecheck PASS; architecture 25/25; build PASS; lint 0 errors / 26 pre-existing warnings |
| B | `npm ci` | PASS; 151 packages; exit 0 | typecheck PASS; build PASS |

The original workspace still has a Windows lock on its installed native Rolldown binding. The two isolated runs prove this is a workspace/process condition rather than a lockfile or application dependency defect. The final release gate must repeat `npm ci` after all code changes and requires lint to reach 0 warnings.
