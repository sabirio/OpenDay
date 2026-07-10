# PM verified progress semantics

Decision: retain **Variant A — simple observed average** for Sprint 3.

`PM verified progress` means the arithmetic mean of finite `observed_progress` values from the latest PM site visit for active-scope work packages that were actually observed.

- Denominator: count of observed, active, non-null WP observations; not the full project scope.
- Unobserved WP: excluded, not treated as zero.
- `N/A` / out-of-scope WP: excluded through canonical scope.
- Partial visits: describe only the inspected subset; confidence/coverage remains a separate fact.
- Zones: zone identity does not change the denominator.
- Missing/zero weights: irrelevant to the official formula.
- Missing observations: result is `null`.
- Rounding: two decimal places.

Why unweighted: existing PM UI and alignment semantics are item/observation based, not commercial/progress-weight based; persisted site-visit rows contain observed progress but no frozen canonical weight snapshot. Applying current template weights to a historical/partial visit would imply verification coverage the PM did not perform and could change when template/scope changes. Canonical WP weights remain available for project progress, but there is no historical official weighted PM aggregate to preserve.

Variant B was evaluated but rejected for Sprint 3. It may be introduced only with a persisted visit-time weight/scope snapshot and an explicit product decision. Tests cover partial scope, missing observations, out-of-scope rows, numeric strings and zones/areas normalization.

