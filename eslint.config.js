import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const hygieneWarnings = {
  'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]|motion', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-useless-escape': 'warn',
  'no-case-declarations': 'error',
  'no-constant-binary-expression': 'error',
  'no-control-regex': 'off', // Required: security sanitizers deliberately strip ASCII control characters (\x00-\x1f)
  'no-prototype-builtins': 'error',
  'no-undef': 'error',
  'no-extra-boolean-cast': 'error',
  'no-duplicate-case': 'error',
}

export default [
  {
    ignores: [
      'dist/**', 'node_modules/**', 'scratch/**', 'coverage/**',
      'backend/Backend/**', 'backend/frontend-example.js', 'backend/check_log_script.js',
    ],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...hygieneWarnings,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.jest } },
  },
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: { sourceType: 'commonjs' },
    },
    rules: { ...js.configs.recommended.rules, ...hygieneWarnings },
  },
  {
    files: ['backend/test/**/*.js', 'tests/**/*.{js,mjs}', 'template-lab/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { sourceType: 'module' },
    },
    rules: { ...js.configs.recommended.rules, ...hygieneWarnings },
  },
]
