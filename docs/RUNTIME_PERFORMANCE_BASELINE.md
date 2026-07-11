# Runtime Performance Baseline

Measured 2026-07-11 against a production-optimized Vite preview connected to local Supabase.

- Build: 443 transformed modules, 818 ms.
- Main CSS: 50.60 kB / 9.17 kB gzip.
- React vendor: 174.87 kB / 55.12 kB gzip.
- Engines: 129.74 kB / 36.49 kB gzip.
- Contractor Report in the final isolated clean build: 158.26 kB / 43.45 kB gzip, lazy-loaded. The original workspace build produced 384.40 kB / 102.05 kB gzip while using its pre-existing dependency directory; the clean `npm ci` result is the reproducible release baseline and avoids treating the dirty dependency tree as authoritative.
- Site Visit: 54.85 kB / 13.71 kB gzip.
- Dashboard: 66.97 kB / 16.82 kB gzip.
- Risk Dashboard: 74.14 kB / 15.13 kB gzip.

Production-preview browser runs completed field navigation, autosave/recovery, filters, modal interactions and error injection without missing chunks or post-unmount browser errors. Autosave is a 500 ms localStorage debounce; no request is issued per keystroke. Photo preview URLs are revoked on removal/unmount. PM renders one current WP instead of an entire long list.

No temporary production instrumentation was added. Exact React commit counts, payload byte totals and cold/warm navigation timings were not captured; those metrics are **not** claimed PASS. No optimization was applied without a measured defect, and Zod was not replaced for bundle size.
