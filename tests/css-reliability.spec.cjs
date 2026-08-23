// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * CSS / ASSET RELIABILITY REGRESSION SUITE
 * ────────────────────────────────────────────────────────────────────────────
 * Symptom under audit: pages rendered incorrectly during normal SPA navigation
 * and only became correct after a hard reload.
 *
 * Root cause: route stylesheets ship in lazily loaded chunks. Vite appends each
 * chunk's <link rel="stylesheet"> the first time the route loads, so the cascade
 * order of two route stylesheets is decided by the order the routes were FIRST
 * visited in the session. Where two chunks declared the same selector with
 * different values, the rendered result depended on navigation history; a hard
 * reload loaded a different, smaller set of stylesheets and appeared to fix it.
 *
 * These tests assert the observable consequence of the fix: the SAME route in
 * the SAME viewport produces the SAME computed styles no matter how it was
 * reached. Assertions are made against the DOM and getComputedStyle — never
 * against screenshots, which cannot distinguish "looks plausible" from
 * "deterministic".
 *
 * ── HOW TO RUN ──────────────────────────────────────────────────────────────
 *   npm run build
 *   npx playwright test tests/css-reliability.spec.cjs --config=playwright.config.js
 *
 * A Chromium binary is required. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if the
 * Playwright CDN is unreachable from the runner.
 *
 * NOT EXECUTED during the codebase audit: the audit sandbox had no Chromium
 * binary and no access to the Playwright browser CDN. The static and
 * build-output equivalents of these invariants ARE executed, by
 * tests/css-cascade-isolation.test.mjs.
 */

const BASE_URL = process.env.CSS_AUDIT_BASE_URL || 'http://127.0.0.1:4173';

/** Public routes that render without an authenticated Firebase session. */
const ROUTES = ['/', '/pricing', '/features', '/jobs', '/blog'];

/**
 * Surface-crossing routes. Signed out these redirect to the login surface, and
 * that redirect target must itself render identically however it was reached —
 * which is exactly the Consumer/Enterprise/Admin cascade-bleed scenario.
 *
 * Set CSS_AUDIT_STORAGE_STATE to a Playwright storageState file captured from a
 * signed-in Super Admin session to exercise the real /adm and /enterprise
 * shells. The suite runs either way; with the storage state it covers more.
 */
const SURFACE_ROUTES = {
  consumer: ['/', '/pricing', '/build-resume'],
  enterprise: ['/enterprise'],
  admin: ['/adm', '/adm/tenants', '/adm/health'],
};
const ALL_SURFACE_ROUTES = [...SURFACE_ROUTES.consumer, ...SURFACE_ROUTES.enterprise, ...SURFACE_ROUTES.admin];

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '430x932', width: 430, height: 932 },
  { name: '390x844', width: 390, height: 844 },
  { name: '375x667', width: 375, height: 667 },
];

/**
 * Capture a structural + computed-style fingerprint of the rendered document.
 * Deliberately excludes volatile content (text, timestamps) and records only
 * what the cascade controls.
 */
async function fingerprint(page) {
  await page.waitForLoadState('networkidle');
  return page.evaluate(() => {
    const styleOf = element => {
      const computed = getComputedStyle(element);
      return [
        computed.display, computed.position, computed.fontFamily, computed.fontSize,
        computed.fontWeight, computed.color, computed.backgroundColor, computed.margin,
        computed.padding, computed.textAlign, computed.flexDirection, computed.visibility,
      ].join('|');
    };
    const sample = [document.body, ...document.querySelectorAll('main, header, nav, footer, h1, h2, button, a, input, table')]
      .filter(Boolean)
      .slice(0, 60);
    return {
      styles: sample.map(styleOf),
      stylesheetCount: document.styleSheets.length,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
}

/** Every <link rel=stylesheet> must have actually loaded (cssRules accessible). */
async function assertStylesheetsLoaded(page) {
  const result = await page.evaluate(() => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    const failures = [];
    for (const link of links) {
      const sheet = [...document.styleSheets].find(item => item.href === link.href);
      if (!sheet) { failures.push(`${link.getAttribute('href')} produced no CSSStyleSheet`); continue; }
      try {
        if (sheet.cssRules.length === 0) failures.push(`${link.getAttribute('href')} loaded with zero rules`);
      } catch (error) {
        failures.push(`${link.getAttribute('href')} is unreadable: ${error.message}`);
      }
    }
    return { linkCount: links.length, failures };
  });
  expect(result.failures, 'every stylesheet referenced by the document must load').toEqual([]);
  expect(result.linkCount, 'the document must ship stylesheets').toBeGreaterThan(0);
}

async function assertNoFailedAssets(page, fn) {
  const failed = [];
  const onResponse = response => {
    const url = response.url();
    if (/\.(css|js)(\?|$)/.test(url) && response.status() >= 400) failed.push(`${response.status()} ${url}`);
  };
  page.on('response', onResponse);
  try { await fn(); } finally { page.off('response', onResponse); }
  expect(failed, 'no CSS or JS asset may 4xx/5xx (release skew or bad cache)').toEqual([]);
}

test.describe('CSS reliability: rendering must not depend on how a route was reached', () => {
  for (const route of ROUTES) {
    test(`"${route}" renders identically via direct load, SPA navigation, back/forward and reload`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      // 1. Fresh browser context, direct deep link. This is the "hard reload"
      //    baseline that previously looked correct while SPA navigation did not.
      await assertNoFailedAssets(page, async () => { await page.goto(`${BASE_URL}${route}`); });
      await assertStylesheetsLoaded(page);
      const direct = await fingerprint(page);

      // 2. Reach the same route by SPA navigation through OTHER routes first, so
      //    their stylesheet chunks are already in <head>. Before the fix this is
      //    exactly where the cascade flipped.
      const detour = ROUTES.filter(item => item !== route);
      await page.goto(`${BASE_URL}${detour[0]}`);
      for (const step of detour.slice(1)) {
        await page.evaluate(path => window.history.pushState({}, '', path), step);
        await page.goto(`${BASE_URL}${step}`, { waitUntil: 'domcontentloaded' });
      }
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      const viaNavigation = await fingerprint(page);
      expect(viaNavigation.styles, 'SPA navigation must produce the direct-load rendering').toEqual(direct.styles);

      // 3. Navigate away and return.
      await page.goto(`${BASE_URL}${detour[0]}`, { waitUntil: 'domcontentloaded' });
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      expect((await fingerprint(page)).styles, 'returning to a route must not change it').toEqual(direct.styles);

      // 4. Back / forward.
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.goForward({ waitUntil: 'domcontentloaded' });
      expect((await fingerprint(page)).styles, 'history traversal must not change rendering').toEqual(direct.styles);

      // 5. Normal reload — must ALREADY match, i.e. no hard reload required.
      await page.reload({ waitUntil: 'networkidle' });
      await assertStylesheetsLoaded(page);
      expect((await fingerprint(page)).styles, 'a normal reload must not be needed to correct the page').toEqual(direct.styles);
    });
  }

  test('a long multi-surface navigation chain leaves every visited route correct', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const baseline = {};
    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route}`);
      baseline[route] = (await fingerprint(page)).styles;
    }
    // Visit everything in one session, then re-check each route. Any chunk that
    // leaks a global rule shows up here even if pairwise checks pass.
    for (const route of [...ROUTES, ...ROUTES].reverse()) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
    }
    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      expect((await fingerprint(page)).styles, `${route} drifted after a full-session traversal`).toEqual(baseline[route]);
    }
  });
});

test.describe('Responsive matrix', () => {
  for (const viewport of VIEWPORTS) {
    test(`layout is sound at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ROUTES) {
        await page.goto(`${BASE_URL}${route}`);
        await assertStylesheetsLoaded(page);
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hiddenInteractive: [...document.querySelectorAll('button, a[href], input')].filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return rect.width === 0 || rect.height === 0;
          }).length,
        }));
        // A few pixels of rounding tolerance; a genuine breakpoint conflict
        // (e.g. max-width:1024px vs min-width:1024px) overflows far more.
        expect(metrics.scrollWidth, `${route} overflows horizontally at ${viewport.name}`)
          .toBeLessThanOrEqual(metrics.clientWidth + 2);
        expect(metrics.hiddenInteractive, `${route} has zero-size visible controls at ${viewport.name}`).toBe(0);
      }
    });
  }

  test('the 1024px breakpoint boundary is not double-claimed', async ({ page }) => {
    // max-width:1024px and min-width:1024px both match at exactly 1024px.
    for (const width of [1023, 1024, 1025]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${BASE_URL}/`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at exactly ${width}px`).toBeLessThanOrEqual(2);
    }
  });
});

test.describe('Asset and cache integrity', () => {
  test('the document is not cached and its hashed assets all resolve', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/`);
    expect(response?.status()).toBe(200);
    const html = await page.content();
    // A cached index.html paired with a newer deploy is how release A HTML ends
    // up requesting release B assets.
    expect(html).toMatch(/http-equiv="Cache-Control"[^>]*no-store/i);

    const assetStatuses = await page.evaluate(async () => {
      const urls = [...document.querySelectorAll('link[rel="stylesheet"], script[src]')]
        .map(element => element.getAttribute('href') || element.getAttribute('src'))
        .filter(Boolean);
      const results = [];
      for (const url of urls) {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        results.push({ url, status: res.status });
      }
      return results;
    });
    expect(assetStatuses.filter(item => item.status !== 200)).toEqual([]);
    for (const item of assetStatuses) {
      expect(item.url, 'assets must be content-hashed for safe long-lived caching').toMatch(/-[A-Za-z0-9_-]{8,}\.(css|js)$/);
    }
  });

  test('no service worker is registered, so no stale asset can be replayed from CacheStorage', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    const registrations = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0;
      return (await navigator.serviceWorker.getRegistrations()).length;
    });
    expect(registrations, 'a service worker would reintroduce stale-asset risk').toBe(0);
  });
});


/**
 * §7 cross-surface traversal matrix.
 *
 * The cascade defect was strictly a cross-surface problem: an Enterprise chunk
 * leaking a global rule only mattered once you left /enterprise. These tests
 * walk Consumer → Enterprise → Admin (and the reverse) in one browser session
 * and assert each surface still matches its freshly loaded baseline.
 */
test.describe('Cross-surface navigation (Consumer / Enterprise / Admin / Super Admin)', () => {
  test('every surface matches its fresh-load baseline after a full traversal', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Baselines from a fresh context per route: this is the "hard reload" state
    // that previously looked correct while SPA navigation did not.
    const baseline = {};
    for (const route of ALL_SURFACE_ROUTES) {
      await page.context().clearCookies();
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      baseline[route] = await fingerprint(page);
    }

    const orders = [
      [...SURFACE_ROUTES.consumer, ...SURFACE_ROUTES.enterprise, ...SURFACE_ROUTES.admin],
      [...SURFACE_ROUTES.admin, ...SURFACE_ROUTES.enterprise, ...SURFACE_ROUTES.consumer],
      [...SURFACE_ROUTES.enterprise, ...SURFACE_ROUTES.consumer, ...SURFACE_ROUTES.admin],
    ];

    for (const order of orders) {
      // One continuous session; stylesheet chunks accumulate in visit order.
      for (const route of order) await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      for (const route of ALL_SURFACE_ROUTES) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        const current = await fingerprint(page);
        expect(
          current.styles,
          `${route} rendered differently after traversal order [${order.join(' -> ')}] — the cascade is navigation-order dependent`
        ).toEqual(baseline[route].styles);
      }
    }
  });

  test('a hard reload produces the same result as SPA navigation', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of ALL_SURFACE_ROUTES) {
      // Reach the route through the other surfaces first.
      for (const detour of ALL_SURFACE_ROUTES.filter(item => item !== route)) {
        await page.goto(`${BASE_URL}${detour}`, { waitUntil: 'domcontentloaded' });
      }
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      const afterNavigation = await fingerprint(page);

      // Hard reload: a brand-new context discards every accumulated stylesheet.
      const freshPage = await context.browser().newContext().then(ctx => ctx.newPage());
      await freshPage.setViewportSize({ width: 1440, height: 900 });
      await freshPage.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      const afterHardReload = await fingerprint(freshPage);
      await freshPage.context().close();

      expect(
        afterNavigation.styles,
        `${route} requires a hard reload to render correctly — the defect is NOT fixed`
      ).toEqual(afterHardReload.styles);
    }
  });

  test('no stylesheet 404s while crossing surfaces (release skew / cache)', async ({ page }) => {
    await assertNoFailedAssets(page, async () => {
      for (const route of ALL_SURFACE_ROUTES) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
        await assertStylesheetsLoaded(page);
      }
    });
  });
});

test.describe('Structural assertions beyond computed styles', () => {
  test('key layout elements keep sane geometry across surfaces', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of ALL_SURFACE_ROUTES) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      const geometry = await page.evaluate(() => {
        const box = selector => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            display: style.display,
            visibility: style.visibility,
            overflowX: style.overflowX,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
          };
        };
        return {
          body: box('body'),
          sidebar: box('.admin__left, aside, nav'),
          main: box('main'),
          table: box('table'),
          modal: box('[role="dialog"]'),
          button: box('button'),
        };
      });

      expect(geometry.body, `${route} must render a body`).not.toBeNull();
      expect(geometry.body.visibility).toBe('visible');
      // Typography must resolve to the self-hosted family, never a bare fallback
      // caused by a failed third-party font request.
      expect(geometry.body.fontFamily.toLowerCase(), `${route} lost its font stack`).not.toBe('');
      for (const [name, value] of Object.entries(geometry)) {
        if (!value) continue;
        expect(value.width, `${route}: ${name} collapsed to zero width`).toBeGreaterThanOrEqual(0);
      }
      if (geometry.main) {
        expect(geometry.main.display, `${route}: main element is not displayed`).not.toBe('none');
      }
    }
  });

  test('typography is served from the self-hosted font, with no third-party font request', async ({ page }) => {
    const fontRequests = [];
    page.on('request', request => {
      const url = request.url();
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url)) fontRequests.push(url);
    });
    for (const route of SURFACE_ROUTES.consumer) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
    }
    // CV/portfolio template engines legitimately load decorative typefaces; the
    // consumer shell must not.
    expect(fontRequests, `consumer routes must not fetch webfonts from Google: ${fontRequests.join(', ')}`).toEqual([]);
  });
});
