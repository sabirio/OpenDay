# PM Site Visit Stabilization Plan

1. Reuse the shared upload component/state contract and the established versioned-key/draft envelope conventions; keep PM observation semantics in PM-specific models.
2. Add a pure PM workflow reducer plus selectors and unit tests.
3. Add a versioned PM draft adapter with user/project/visit/source isolation, stale/corrupt handling, request ID, position, and filter recovery.
4. Require explicit Continue/Discard recovery before autosave or submit.
5. Add one-item mobile navigation with previous/next and useful all/incomplete/completed/discrepant filters; filters never mutate observations.
6. Preserve current Gantt status/progress scale. Do not add a new Gantt N/A database value; retain legacy `Not Applicable` behavior only in the compatibility path.
7. Add review counts and make incomplete/discrepant items directly reachable.
8. Integrate shared upload items/paths and block submit while pending.
9. Replace submit booleans with reducer state; retain the same request ID on retry and surface replay as success.
10. Add validation focus/live status, keyboard controls, beforeunload guard, and 44 px mobile targets.
11. Remove warnings in changed PM/shared files without broad disables.
12. Run PM, shared-upload, and Contractor regression tests, full gates, and live mobile verification if the in-app browser is available.

Untouched: Site Visit RPC, schema/migrations/RLS, canonical PM progress, discrepancy sign, progress history, dashboards, risk/readiness, and production data.
