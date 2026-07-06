import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // .agents/ is external tooling (e.g. skill scripts) that can get materialized
  // into the project root by the dev environment — it's untracked, not part of
  // this app's source, and isn't written to this project's lint standards.
  globalIgnores(['dist', '.agents']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Honour the intentional-unused convention: a leading underscore marks a
      // variable/arg/caught-error that is deliberately not read.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // set-state-in-effect flags the standard "async fetch in effect -> setState in
      // the .then / loading-flag" pattern used across this app. All current cases are
      // guarded (no render loops). Kept as a warning so it stays visible without
      // blocking CI; revisit if a data-loading refactor (react-query/SWR) lands.
      'react-hooks/set-state-in-effect': 'warn',
      // Wave 4/5: workPackages.js / reportWeights.js are legacy (pre-Gantt) data
      // sources — see TEMPLATE_MODEL.md. This warns on every matching import,
      // including the already-audited legacy-fallback usages (WeeklyReports.jsx,
      // ContractorReport.jsx, SiteVisitReport.jsx, etc.) — it's a standing reminder
      // for anyone adding a *new* import, not a signal those existing ones are wrong.
      'no-restricted-imports': ['warn', {
        patterns: [
          {
            group: ['**/config/workPackages', '**/config/workPackages.js'],
            message: 'LEGACY: Use masterTaskLibrary or constructionRetailV1 instead. See src/config/TEMPLATE_MODEL.md.',
          },
          {
            group: ['**/config/reportWeights', '**/config/reportWeights.js'],
            message: 'LEGACY: Use constructionRetailV1 weights instead. See src/config/TEMPLATE_MODEL.md.',
          },
        ],
      }],
    },
  },
  {
    // Node-context files (not browser): one-off ops scripts, the unit-test
    // runner, and Playwright e2e specs. These legitimately use process, Buffer,
    // __dirname, etc. Add Node globals so they aren't flagged as no-undef.
    files: [
      'tests/e2e/**/*.js',
      'src/tests/**/*.js',
      'src/migrations/**/*.js',
      'playwright.config.js',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
