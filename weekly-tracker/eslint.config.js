import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
