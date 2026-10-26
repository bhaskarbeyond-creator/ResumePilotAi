/**
 * Lighthouse CI configuration — performance budgets per page class.
 *
 * ## What is budgeted, and how
 *
 * The product budgets (REC-020) are **LCP < 2.5 s, INP < 200 ms, CLS < 0.1** on a
 * throttled 4G connection and a mid-tier device. Lighthouse measures with mobile
 * emulation and simulated throttling (`formFactor: mobile`,
 * `throttlingMethod: simulate`), which is exactly that reference: the Lighthouse
 * mobile profile is a mid-tier Android-class device on a slow-4G shaped link.
 *
 * `INP` is a field metric and has no direct lab measurement; the lab proxy is
 * **Total Blocking Time** (Lighthouse's own documented stand-in), budgeted at the
 * same 200 ms. The interactive journey that exercises real input latency is the
 * Playwright engine suite (`tests/engine-*.spec.ts`), and the authenticated
 * console's LCP/CLS is asserted live in `tests/admin-console-ux.spec.ts`
 * ("Core Web Vitals stay inside the product budget").
 *
 * Page classes (`budgets/per-page-class.json`):
 *   `/`        — public landing
 *   `/login`   — auth surface
 *   `/blog`    — content listing
 *   `/pricing` — marketing/commerce entry
 * The authenticated admin console (`/adm`) is data-driven and sits behind auth;
 * its budget is enforced by the Playwright vitals test with a real session
 * (`admin-console-ux.spec.ts`), which is the gate that can see the real page.
 *
 * CI runs this via `npm run perf:budgets` (a `lighthouse` job in
 * `.github/workflows/quality-gate.yml`); a budget miss fails the build. It needs
 * a browser binary, like Playwright — see OI-TIER-1.
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run preview -- --port 4173 --strictPort',
      startServerReadyPattern: 'Local:',
      url: [
        'http://localhost:4173/',
        'http://localhost:4173/login',
        'http://localhost:4173/blog',
        'http://localhost:4173/pricing',
      ],
      numberOfRuns: 1,
      settings: {
        budgets: './budgets/per-page-class.json',
        formFactor: 'mobile',
        throttlingMethod: 'simulate',
        screenEmulation: {
          mobile: true,
          width: 360,
          height: 640,
          deviceScaleFactor: 2.625,
          disabled: false,
        },
      },
    },
    assert: {
      // The budgets file is the gate: every timing and resource budget in it is
      // an error when exceeded. Category scores are advisory on top of that.
      assertions: {
        'performance-budget': ['error', { minScore: 0.9 }],
        'resource-summary': ['error', { minScore: 0.9 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'categories:performance': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './lighthouse-results',
    },
  },
};
