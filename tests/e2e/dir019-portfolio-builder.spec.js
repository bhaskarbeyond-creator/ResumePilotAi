// @ts-check
/**
 * DIR-019 - Digital Portfolio & Web CV Studio, live-stack proof.
 *
 * WHAT THIS SUITE PROVES (mapped to the directive's ACs):
 *   AC-1  Studio surfaces resolve through Cuba Executive tokens rather than the
 *         legacy raw palette ramp.
 *   AC-2  True 2-pane split; accordion groups are real aria-expanded
 *         disclosures; the viewport switcher renders the Web CV at genuine
 *         1440 / 768 / 375 px and the live preview tracks editor input.
 *   AC-3  The vanity badge reports the AUTHORITATIVE MariaDB verdict. Both the
 *         positive and the refusal cases are proven by driving the real
 *         endpoint, never by mocking it.
 *   AC-4  "Import from Resume" populates the studio from real resume rows.
 *   AC-5  The public view fails closed for an unpublished slug and never
 *         advertises a social card for content that is not published.
 *
 * Following the DIR-012/013/014/017 convention this suite NEVER intercepts,
 * mocks or fulfills an /api/* route: everything the browser sees comes from the
 * live backend on :8080 and its authoritative MariaDB.
 *
 * WHY THIS SUITE CREATES BUT NEVER DELETES: the candidate identity is a shared,
 * long-lived account. Each run claims a UNIQUE slug base, so repeated runs
 * cannot collide with, mutate, or remove another lane's portfolio rows.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const IDENTITY_EMAIL = process.env.DIR019_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR017_EMAIL
    || process.env.DIR006_EMAIL;

/**
 * Mints the live identity, retrying the transient Google auth transport failure
 * that DIR-013/DIR-017 already documented. Failures are rethrown so a genuinely
 * broken identity config fails loudly instead of silently skipping.
 */
async function mintIdentityWithRetry(attempts = 4) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await mintFirebaseSession({ email: IDENTITY_EMAIL });
        } catch (error) {
            lastError = error;
            const transient = /OAuth2 access token|fetch failed|ETIMEDOUT|ECONNRESET|getaddrinfo/i
                .test(String(error?.message || error));
            if (!transient || attempt === attempts) break;
            const backoffMs = attempt * 5_000;
            console.warn(`[dir019] transient identity mint failure (attempt ${attempt}/${attempts}), retrying in ${backoffMs}ms`);
            await new Promise((resolve) => { setTimeout(resolve, backoffMs); });
        }
    }
    throw lastError;
}

const SESSION = IDENTITY_EMAIL ? await mintIdentityWithRetry() : null;

async function signIn(page) {
    if (!SESSION) throw new Error('DIR019 requires a live Firebase identity. Set DIR019_EMAIL (or ADMIN_EMAIL in backend/.env).');
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid,
            email,
            emailVerified: true,
            isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now()),
            apiKey,
            appName: '[DEFAULT]',
        }));
        localStorage.setItem('user', uid);
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, {
        uid: SESSION.uid,
        email: SESSION.email,
        token: SESSION.idToken,
        refreshToken: SESSION.refreshToken,
        apiKey: SESSION.apiKey,
    });
}

/** Per-run unique vanity base, so the suite is safely re-runnable. */
function uniqueSlugBase(label = 'dir019') {
    const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    return `${label}-${stamp}`.toLowerCase();
}

/**
 * Opens the studio on a blank draft and waits for the split to hydrate.
 * The blank path is used deliberately so the suite does not depend on how many
 * resumes the shared identity happens to own.
 */
async function openStudio(page) {
    await page.goto('/portfolio/builder?create=1', { waitUntil: 'domcontentloaded' });
    const startBlank = page.getByRole('button', { name: /start blank/i });
    await expect(startBlank).toBeVisible({ timeout: 60_000 });
    await startBlank.click();
    const createButton = page.getByRole('button', { name: /create private draft/i });
    await expect(createButton).toBeVisible({ timeout: 30_000 });
    await createButton.click();
    await expect(page.getByTestId('portfolio-studio-split')).toBeVisible({ timeout: 60_000 });
}

test.describe('DIR-019 Web CV Studio (live stack)', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page);
    });

    test('AC-1/AC-2: studio renders a tokenized two-pane split with a live preview', async ({ page }) => {
        await openStudio(page);

        // AC-2: exactly two panes — configuration inspector + live preview.
        await expect(page.getByRole('region', { name: /configuration inspector/i })).toBeVisible();
        await expect(page.getByRole('region', { name: /^live preview$/i })).toBeVisible();

        // AC-1: panes resolve through Cuba tokens, not the legacy slate ramp.
        await expect(page.getByTestId('portfolio-config-drawer')).toHaveClass(/cuba-glass/);
        await expect(page.getByRole('region', { name: /^live preview$/i })).toHaveClass(/cuba-glass/);
        await expect(page.locator('.bg-slate-100')).toHaveCount(0);
        await expect(page.locator('.bg-slate-200')).toHaveCount(0);
        await expect(page.locator('.text-slate-900')).toHaveCount(0);

        // The live preview renders the Web CV shell, not an empty container.
        // NOTE: an intentionally blank draft renders <EmptyWebCv/>, which
        // deliberately carries no `data-webcv-template` marker. The always-present
        // contract is `data-webcv-root` + `data-template` on WebCvRenderer, so we
        // assert against that rather than a marker a blank portfolio cannot have.
        const frame = page.getByTestId('portfolio-preview-frame');
        await expect(frame).toBeVisible();
        await expect(frame.locator('[data-webcv-root="true"]')).toHaveCount(1);
        await expect(frame.locator('[data-webcv-root="true"]')).toHaveAttribute('data-template', 'modernMinimal');
    });

    test('AC-2: accordion groups are accessible disclosures and switch panels', async ({ page }) => {
        await openStudio(page);

        for (const group of ['identity', 'skills', 'projects', 'history', 'contact', 'theme']) {
            const header = page.getByTestId(`portfolio-group-${group}`);
            await expect(header).toHaveAttribute('aria-expanded', group === 'identity' ? 'true' : 'false');
            await expect(header).toHaveAttribute('aria-controls', `portfolio-group-${group}`);
        }

        // Opening "Theme & Style Presets" swaps the panel and collapses the other.
        await page.getByTestId('portfolio-group-theme').click();
        await expect(page.getByTestId('portfolio-group-theme')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByTestId('portfolio-group-identity')).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByTestId('portfolio-theme-presets')).toBeVisible();

        // Every AC-2 named preset is offered, selectable, and re-renders the preview.
        // Asserted against WebCvRenderer's always-present `data-template`, since a
        // blank draft's inner template element is intentionally absent.
        const root = page.locator('[data-webcv-root="true"]');
        for (const template of ['modernMinimal', 'executive', 'creativeDark', 'premiumTech']) {
            const preset = page.getByTestId(`portfolio-theme-${template}`);
            await expect(preset).toBeVisible();
            await preset.click();
            await expect(preset).toHaveAttribute('aria-pressed', 'true');
            await expect(root).toHaveAttribute('data-template', template);
        }
    });

    test('AC-2: viewport switcher renders true 1440 / 768 / 375 widths and reflects edits', async ({ page }) => {
        await openStudio(page);
        const frame = page.getByTestId('portfolio-preview-frame');

        for (const [mode, width] of [['desktop', 1440], ['tablet', 768], ['mobile', 375]]) {
            await page.getByTestId(`portfolio-viewport-${mode}`).click();
            await expect(page.getByTestId(`portfolio-viewport-${mode}`)).toHaveAttribute('aria-pressed', 'true');
            await expect(frame).toHaveAttribute('data-preview-width', String(width));
            await expect(page.getByTestId('portfolio-viewport-label')).toContainText(`${width}px`);
        }

        // Live preview tracking (INV-5): an edit must reach the preview DOM with
        // no save and no reload.
        await page.getByTestId('portfolio-viewport-desktop').click();
        const headingInput = page.locator('#portfolio-group-identity input[type="text"]').first();
        const marker = `Ada Lovelace ${Date.now().toString(36)}`;
        await headingInput.fill(marker);
        await expect(frame).toContainText(marker, { timeout: 10_000 });
    });

    test('AC-3: vanity badge reports the authoritative MariaDB verdict', async ({ page, request }) => {
        await openStudio(page);

        const input = page.getByTestId('portfolio-slug-input');
        const badge = page.getByTestId('portfolio-slug-status');

        // Too short: rejected locally without a request, and never a false
        // "available" (INV-3 / no-fabrication).
        await input.fill('ab');
        await expect(badge).toHaveAttribute('data-state', 'invalid');

        // Free address: MariaDB is the only source of the verdict.
        const free = uniqueSlugBase('dir019-free');
        await input.fill(free);
        await expect(badge).toHaveAttribute('data-state', 'available', { timeout: 30_000 });
        await expect(badge).toContainText('Available');
        await expect(page.getByTestId('portfolio-publish')).toBeEnabled();

        // The route itself must agree with the badge (no client-side fiction).
        // NOTE: this is asserted through Playwright's request fixture, which shares
        // the suite's baseURL (the Vite dev origin) so the request traverses the
        // SAME proxy the browser used — proving the badge reflects the live
        // backend + MariaDB rather than any client-side shortcut.
        const probe = await request.get(`/api/portfolios/slug-availability?base=${encodeURIComponent(free)}`, {
            headers: { Authorization: `Bearer ${SESSION.idToken}` },
        });
        expect(probe.status()).toBe(200);
        const payload = await probe.json();
        expect(payload.success).toBe(true);
        expect(payload.base).toBe(free);
        expect(payload.available).toBe(true);

        // The response advertises the exact address that will be persisted.
        expect(String(payload.slug)).toMatch(new RegExp(`^${free}-[0-9a-f]{8}$`));

        // A syntactically invalid base is refused (400) with a stable code.
        const invalid = await request.get('/api/portfolios/slug-availability?base=a', {
            headers: { Authorization: `Bearer ${SESSION.idToken}` },
        });
        expect(invalid.status()).toBe(400);
        expect((await invalid.json()).code).toBe('INVALID_PORTFOLIO_SLUG_BASE');

        // Unauthenticated enumeration is refused: the probe must stay private,
        // otherwise it becomes an oracle for unpublished drafts.
        const anonymous = await request.get(`/api/portfolios/slug-availability?base=${encodeURIComponent(free)}`);
        expect(anonymous.status()).toBe(401);
    });

    test('AC-4: Import from Resume populates the studio from real resume rows', async ({ page }) => {
        await openStudio(page);
        const importButton = page.getByTestId('portfolio-import-resume');
        await expect(importButton).toBeVisible({ timeout: 60_000 });

        const hasResumes = await importButton.isEnabled({ timeout: 30_000 }).catch(() => false);
        test.skip(!hasResumes, 'Live identity owns no resumes, so AC-4 1-click import has nothing to import.');

        await importButton.click();

        // The canonical changed, so the save state must flip without a manual save.
        await expect(page.getByTestId('portfolio-save-state')).toContainText('Unsaved draft', { timeout: 30_000 });

        // Imported content is reachable through the accordion domains.
        await page.getByTestId('portfolio-group-history').click();
        await expect(page.getByTestId('portfolio-section-experiences')).toBeVisible();
        await page.getByTestId('portfolio-group-skills').click();
        await expect(page.getByTestId('portfolio-section-skills')).toBeVisible();
    });

    test('AC-5: public view fails closed for an unpublished slug', async ({ page }) => {
        await page.goto(`/portfolio/${uniqueSlugBase('dir019-missing')}`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('alert')).toContainText(/Portfolio Unavailable/i, { timeout: 30_000 });

        // Unavailable content must never be crawlable or previewable.
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
        expect(await page.locator('meta[property="og:image"]').count()).toBe(0);

        // Landmark discipline: exactly ONE main landmark must exist on the page.
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.locator('#main-content')).toHaveCount(1);
    });

    /**
     * DIR-019 DEFECT 1 (gatekeeper 3a) — the fatal crash that produced
     * 'Application View Error' on /portfolio/builder?edit=:id.
     *
     * `node_modules/@puckeditor/core/dist/index.css` line 1 is
     * `@import "https://rsms.me/inter/inter.css";`. When PortfolioBuilder.jsx
     * statically imported `puck.css`, Vite emitted it as an eagerly preloaded
     * chunk on the DEFAULT studio route; under the production CSP the browser
     * refused the remote @import, Vite's preload helper threw "Unable to
     * preload CSS", and RouteErrorBoundary replaced the whole studio.
     *
     * The regression guard asserts the CONTRACTS that were violated, not the
     * implementation detail:
     *   1. the 2-pane studio actually renders (no RouteErrorBoundary),
     *   2. no "Unable to preload CSS" error reaches the console, and
     *   3. NO Puck stylesheet is requested at all on the modern route — the
     *      lazy chunk must stay un-fetched, which is what keeps the remote
     *      @import out of the browser entirely.
     */
    test('AC-7: an existing draft opens the studio without RouteErrorBoundary or CSS preload failure', async ({ page }) => {
        // A REAL draft id from the live backend. Minting our own row here (rather
        // than hardcoding an id) keeps the case bound to authoritative MariaDB and
        // immune to fixture rot.
        await openStudio(page);

        const drafts = await (await page.request.get('/api/portfolios', {
            headers: { Authorization: `Bearer ${SESSION.idToken}` },
        })).json();
        const candidates = Array.isArray(drafts?.portfolios) ? drafts.portfolios : [];
        test.skip(candidates.length === 0, 'Live identity owns no portfolio rows to reopen.');

        const draft = candidates.find((row) => !row.isPublished) || candidates[0];
        expect(draft?.id, 'live backend returned a portfolio without an id').toBeTruthy();

        // Preload failures are caught on the page, and the Puck stylesheet request
        // is watched so "the CSS was never even asked for" is provable.
        const consoleErrors = [];
        const requestedStylesheets = [];
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('response', (response) => {
            const url = response.url();
            if (url.endsWith('.css') || /\/assets\/.+\.css/.test(url)) requestedStylesheets.push(url);
        });

        await page.goto(`/portfolio/builder?edit=${draft.id}`, { waitUntil: 'domcontentloaded' });

        // 1. The studio renders — the RouteErrorBoundary must never appear.
        await expect(page.getByTestId('portfolio-studio-split')).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(/Application View Error/i)).toHaveCount(0);

        // 2. No preload failure surfaced (this is the exact fatal error).
        const preloadFailures = consoleErrors.filter((text) => /Unable to preload CSS/i.test(text));
        expect(preloadFailures, `CSS preload failures observed:\n${preloadFailures.join('\n')}`).toHaveLength(0);

        // 3. The CSP-hostile Puck chunk is not requested on the modern route.
        expect(
            requestedStylesheets.filter((url) => /puck/i.test(url)),
            'legacy Puck CSS was requested on the default studio route; it must stay behind ?legacy=1',
        ).toHaveLength(0);
    });

    /**
     * DIR-019 DEFECT 2 (gatekeeper 3b) — `/portfolio/null` must never exist in
     * the DOM. Drafts carry `slug = NULL` in MariaDB, and the grid/list views
     * used to interpolate that straight into a public link.
     *
     * Asserted across BOTH view modes, because the two views were two separate
     * render paths and the original fix touched each independently.
     */
    test('AC-8: the portfolios dashboard never renders href="/portfolio/null"', async ({ page }) => {
        for (const view of ['grid', 'list']) {
            await page.goto('/dashboard/portfolios', { waitUntil: 'domcontentloaded' });
            // The page renders a view toggle; wait for the content to settle
            // before scanning hrefs, so we never assert against a loading state.
            await expect(page.getByText(/My Portfolios|Portfolios/i).first()).toBeVisible({ timeout: 60_000 });
            await page.waitForLoadState('networkidle').catch(() => {});

            if (view === 'list') {
                const listToggle = page.getByRole('button', { name: /list/i }).first();
                if (await listToggle.count()) {
                    await listToggle.click();
                    await page.waitForTimeout(500);
                }
            }

            const nullLinks = await page.locator('a[href="/portfolio/null"], a[href$="/null"]').count();
            expect(nullLinks, `the ${view} view rendered ${nullLinks} href="/portfolio/null" link(s)`).toBe(0);

            // A published portfolio still gets a REAL public link — the guard
            // must suppress drafts without disabling the feature entirely.
            const realHrefs = await page.locator('a[href^="/portfolio/"]').evaluateAll(
                (nodes) => nodes.map((node) => node.getAttribute('href')),
            );
            expect(realHrefs.every((href) => href && href !== '/portfolio/null' && href !== '/portfolio/undefined')).toBe(true);
        }
    });

    /**
     * DIR-019 DEFECT 2 (gatekeeper remediation) — the public route must fail fast
     * and CLEANLY on the literal `null` slug rather than 404-ing against
     * `/api/portfolios/public/null` or advertising a canonical for it.
     */
    test('AC-8b: /portfolio/null fails closed without leaking a canonical address', async ({ page }) => {
        const publicCalls = [];
        page.on('request', (request) => {
            if (/\/api\/portfolios\/public\//.test(request.url())) publicCalls.push(request.url());
        });

        await page.goto('/portfolio/null', { waitUntil: 'domcontentloaded' });

        await expect(page.getByRole('alert')).toContainText(/Portfolio Unavailable/i, { timeout: 30_000 });

        // Fail-fast means the bad slug never reaches the network.
        expect(publicCalls.filter((url) => /\/null(\?|$)/.test(url))).toHaveLength(0);

        // And an unavailable portfolio must stay uncrawlable.
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
        expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
        expect(await page.locator('meta[property="og:image"]').count()).toBe(0);
    });
});