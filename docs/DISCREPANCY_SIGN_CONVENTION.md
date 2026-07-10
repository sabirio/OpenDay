# Discrepancy sign convention

Canonical convention:

```text
signedDifference = contractorProgress - pmVerifiedProgress
```

- Positive: contractor reports more progress than PM verified.
- Negative: PM verified more progress than contractor reports.
- `absoluteDifference`: magnitude only and never substitutes for direction.

Historical `site_visit_wps.discrepancy_delta` is written as `PM - contractor`. Sprint 3 does not change that write path or stored rows. `normalizePersistedDiscrepancyToCanonical(row, 'pm-minus-contractor')` is the single read-side adapter and explicitly inverts it. It also accepts already-canonical `'contractor-minus-pm'` sources without inversion.

Unknown conventions return `signedDifference:null` plus `UNKNOWN_DISCREPANCY_SIGN_CONVENTION`; the adapter never guesses from the value. Null values remain null. Source objects are not mutated.

Sprint 4 persistence: new atomic PM visits store `discrepancy_sign_convention='pm-minus-contractor'` and `discrepancy_version=1` on observation/summary rows and in the progress-history snapshot. Historical rows with null metadata explicitly fall back to the documented historical convention; they are not rewritten.
