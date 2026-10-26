/**
 * Component and model tests — the tier that runs in seconds and needs no browser.
 *
 * The Playwright suite (`npm test`) is the browser tier; it needs a browser download and a
 * database-backed server, so it cannot run everywhere. This configuration covers the part of
 * the admin plane whose correctness is *behavioural but not pixel-dependent*: which state a
 * surface renders (loading / ready / empty / failed), whether a failed mutation is reported as
 * a failure, and whether the wire model is mapped honestly. Those are exactly the properties
 * whose absence produced the defects these tests now pin.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
    reporters: ['default'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/components/admin/admin-data-state.ts',
        'src/components/admin/use-admin-resource.ts',
        'src/components/admin/admin-users-model.ts',
        'src/components/admin/AdminDataState.tsx',
        'src/components/admin/AdminAttentionTab.tsx',
        'src/components/admin/AdminUsersTab.tsx',
      ],
      // Thresholds are the gate, not a report: `npm run test:unit:coverage` fails below them.
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 75,
        lines: 80,
      },
    },
  },
});
