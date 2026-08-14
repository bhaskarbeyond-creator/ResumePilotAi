import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const hygieneWarnings = {
  'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
  'no-empty': 'warn',
  'no-useless-escape': 'warn',
  'no-case-declarations': 'warn',
  'no-constant-binary-expression': 'warn',
  'no-control-regex': 'warn',
  'no-prototype-builtins': 'warn',
  'no-undef': 'warn',
  'no-extra-boolean-cast': 'warn',
  'no-duplicate-case': 'warn',
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
      // Legacy components are being incrementally migrated; these remain visible without
      // making security/build gates unusable for unrelated changes.
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
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
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: { sourceType: 'module' },
    },
    rules: { ...js.configs.recommended.rules, ...hygieneWarnings },
  },
]
