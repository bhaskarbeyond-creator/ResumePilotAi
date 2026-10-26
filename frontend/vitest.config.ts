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
        // Session lifecycle: the expiry signal and the two dialogs a person reaches when a
        // session ends (`session-lifecycle.test.tsx`).
        'src/lib/session-events.ts',
        // The two second-factor surfaces. The *flow* needs a Firebase project (OI-UX-11); the
        // screens are exercised here and in `tests/mfa-panel.spec.ts`.
        'src/components/auth/mfa-challenge-panel.tsx',
        'src/components/auth/mfa-enrollment-panel.tsx',
        'src/components/auth/session-expired-dialog.tsx',
        'src/components/auth/logout-confirm-dialog.tsx',
        // The tab strip, extracted from `pages/admin/console.tsx` so the Home/End and
        // roving-focus rules are covered by the fast tier (see `admin-tabbar.test.tsx`).
        'src/components/admin/AdminTabBar.tsx',
        'src/components/admin/AdminAttentionTab.tsx',
        'src/components/admin/AdminUsersTab.tsx',
        // Rewritten from invented sample rows onto their real endpoints; each has a
        // component test that drives all four states.
        'src/components/admin/AdminSecurityTab.tsx',
        'src/components/admin/AdminHelpDeskTab.tsx',
        'src/components/admin/AdminQueuesTab.tsx',
        'src/components/admin/AdminModerationTab.tsx',
        'src/components/admin/AdminBlogManagementTab.tsx',
        'src/components/admin/AdminContentMarketingTab.tsx',
        'src/components/admin/AdminHealthTab.tsx',
        'src/components/admin/AdminOperationsTab.tsx',
      ],
      // Thresholds are the gate, not a report: `npm run test:unit:coverage` fails below them.
      // Raised by ADR-008 (Decision 1, Path A) from 80/75/75/80 after the tests that close the
      // gap landed; the numbers are the mandated floor, not the measured high-water mark.
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 95,
      },
    },
  },
});
