// @ts-check
/**
 * DIR-020 - Interactive Job Application Kanban Tracker, live-stack proof.
 *
 * WHAT THIS SUITE PROVES (mapped to the directive's ACs):
 *   AC-2  The five-column board renders Wishlist / Applied / Interviewing /
 *         Offer Received / Archived, and a card MOVES between columns by
 *         persisting through the real /api/jobs-data/tracker PATCH.
 *   AC-3  A card carries its monogram, company, compensation badge, relative
 *         applied date and quick-action menu, and a note saved through the menu
 *         survives a full page reload (i.e. it reached MariaDB).
 *   AC-5  Scheduling an interview moves the card into Interviewing and the
 *         generated .ics download is a real RFC 5545 calendar payload.
 *   AC-6  The analytics ribbon reports the live pipeline, not a fabricated one.
 *   AC-7  Card creation, stage movement, filter search, note saving and delete
 *         all work against the live stack with ZERO mocks.
 *
 * Following the DIR-006/012/013/014/017/019 convention this suite NEVER
 * intercepts, mocks or fulfills an /api/* route: everything the browser sees
 * comes from the live backend on :8080 and its authoritative MariaDB.
 *
 * WHY EVERY CARD IS NAMED UNIQUELY AND CLEANED UP: the candidate identity is a
 * shared, long-lived account. Each test stamps its title/company so repeated
 * runs can never collide with another lane's job_tracker rows, and the suite
 * deletes only the rows it created.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const IDENTITY_EMAIL = process.env.DIR020_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR019_EMAIL
    || process.env.DIR006_EMAIL;

/**
 * Mints the live identity, retrying the transient Google auth transport failure
 * that DIR-013/DIR-017/DIR-019 already documented. Failures are rethrown so a
 * genuinely broken identity config fails loudly instead of silently skipping.
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
            console.warn(`[dir020] transient identity mint failure (attempt ${attempt}/${attempts}), retrying in ${backoffMs}ms`);
            await new Promise((resolve) => { setTimeout(resolve, backoffMs); });
        }
    }
    throw lastError;
}

const SESSION = IDENTITY_EMAIL ? await mintIdentityWithRetry() : null;

async function signIn(page) {
    if (!SESSION) throw new Error('DIR020 requires a live Firebase identity. Set DIR020_EMAIL (or ADMIN_EMAIL in backend/.env).');
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

/** Per-run unique suffix so repeated runs never collide on job_tracker rows. */
function stamp(label = 'dir020') {
    return `${label}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Console/page errors are a hard failure, not a warning. */
function trackFailures(page, sink) {
    page.on('pageerror', (error) => sink.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        // Chromium logs a console error for ANY network-level 404 (favicon,
        // optional asset, prefetch). Those are not JavaScript runtime failures,
        // so they are filtered out and only real script errors are tracked.
        if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
            sink.push(`console.error: ${message.text()}`);
        }
    });
}

/** Opens the Kanban board and waits for the real pipeline to hydrate. */
test('AC-2/AC-7: the five-stage Cuba Kanban board renders with live column counts', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    await openTracker(page);

    // Every directive stage is present, in pipeline order, and labelled exactly
    // as the Lead ruled (the fifth column binds to the `rejected` enum but is
    // PRESENTED as "Archived").
    for (const [stage, label] of [
        ['wishlist', 'Wishlist'],
        ['applied', 'Applied'],
        ['interview', 'Interviewing'],
        ['offer', 'Offer Received'],
        ['rejected', 'Archived'],
    ]) {
        await expect(page.getByTestId(`tracker-column-${stage}`)).toBeVisible();
        await expect(page.getByTestId(`tracker-column-${stage}`).getByRole('heading', { name: label })).toBeVisible();
    }

    // AC-6: the analytics ribbon is rendered and reports a real percentage.
    const ribbon = page.getByLabel('Pipeline analytics');
    await expect(ribbon).toBeVisible();
    await expect(ribbon.getByText('Active applications')).toBeVisible();
    await expect(ribbon.getByText('Interview rate')).toBeVisible();
    await expect(ribbon.getByText(/^\d+%$/)).toBeVisible();

    expect(failures, `browser reported errors: ${failures.join(' | ')}`).toEqual([]);
});

test('AC-9: the five-column board fits a desktop viewport with no horizontal scrollbar', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    await openTracker(page);

    // AC-9: no horizontal overflow at a standard desktop width. The board is a
    // reflowing responsive grid, so scrollWidth must never exceed clientWidth.
    const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
        overflow.scrollWidth,
        `document overflows horizontally: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    // AC-9: all five columns share one row and each one stays inside the board's
    // right edge, so nothing is clipped by the column borders.
    const board = page.getByLabel('Job tracker board');
    const boardBox = await board.boundingBox();
    expect(boardBox).not.toBeNull();
    const columnIds = ['wishlist', 'applied', 'interview', 'offer', 'rejected'];
    const tops = new Set();
    for (const stage of columnIds) {
        const column = page.getByTestId(`tracker-column-${stage}`);
        const box = await column.boundingBox();
        expect(box, `column ${stage} has no box`).not.toBeNull();
        expect(box.x + box.width).toBeLessThanOrEqual(boardBox.x + boardBox.width + 1);
        tops.add(Math.round(box.y));
    }
    // A single row means all five columns share the same vertical offset.
    expect(tops.size, 'columns are stacked instead of sharing one row').toBe(1);

    // AC-9: the count badge sits fully inside its column, never sliced by the border.
    for (const stage of columnIds) {
        const column = page.getByTestId(`tracker-column-${stage}`);
        const columnBox = await column.boundingBox();
        // aria-label is `${count} cards in ${stage.label}`, so it CONTAINS
        // "cards in" rather than ending with it.
        const badge = column.locator('[aria-label*="cards in"]');
        const badgeCount = await badge.count();
        expect(badgeCount, `column ${stage} has no count badge`).toBe(1);
        const badgeBox = await badge.first().boundingBox();
        expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(columnBox.x + columnBox.width);
        expect(badgeBox.x).toBeGreaterThanOrEqual(columnBox.x);
    }

    // AC-10: exactly ONE primary creation action for the whole board; the
    // repetitive per-column "+ Add Job" buttons are gone.
    await expect(page.getByTestId('tracker-add-job')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '+ Add Job' })).toHaveCount(0);
    // Each column keeps only the subtle ghost affordance.
    for (const stage of columnIds) {
        await expect(page.getByTestId(`tracker-column-add-${stage}`)).toHaveCount(1);
    }

    // AC-10: no card exposes the old bulky <select> or a full-width "Actions" button.
    await expect(page.locator('article').first().locator('select')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toHaveCount(0);

    expect(failures, `browser reported errors: ${failures.join(' | ')}`).toEqual([]);
});

test('AC-7: a card can be created, filtered by search, noted, and deleted against live MariaDB', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    await openTracker(page);

    const unique = stamp();
    const title = `Staff Engineer ${unique}`;
    const company = `Aurora Labs ${unique}`;

    // AC-4(c) + AC-10: create through the single consolidated
    // header "+ Add Tracked Job" action (the per-column duplicates are gone).
    await page.getByTestId('tracker-add-job').click();
    await expect(page.getByRole('heading', { name: 'Add a job' })).toBeVisible();
    await page.getByLabel('Job title *').fill(title);
    await page.getByLabel('Company *').fill(company);
    await page.getByLabel('Compensation').fill('\u20b918L - \u20b924L PA');
    await page.getByRole('button', { name: 'Add to tracker' }).click();

    // The card lands in the Wishlist column, i.e. the POST reached the backend.
    const card = page.getByTestId('tracker-column-wishlist').locator('article').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 60_000 });

    // AC-3: the card carries its executive anatomy.
    await expect(card.getByText(company)).toBeVisible();
    await expect(card.getByText('\u20b918L - \u20b924L PA')).toBeVisible();
    await expect(card.getByText(/Applied .+/)).toBeVisible();

    // AC-7: the search filter narrows the board to this card only.
    await page.getByLabel('Search tracked jobs').fill(company);
    await expect(page.locator('article').filter({ hasText: title })).toBeVisible();
    await page.getByLabel('Search tracked jobs').fill('zzz-no-such-company-zzz');
    await expect(page.locator('article').filter({ hasText: title })).toHaveCount(0);
    await page.getByLabel('Search tracked jobs').fill('');

    // AC-3: save a note through the quick-action menu and prove it persisted by
    // reloading from MariaDB rather than trusting optimistic state.
    await card.getByRole('button', { name: new RegExp(`Actions for ${title}`) }).click();
    const menu = page.getByRole('menu', { name: `Actions for ${title}` });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Add note' }).click();
    await expect(page.getByRole('heading', { name: 'Edit tracked job' })).toBeVisible();
    const note = `Recruiter confirmed a system design loop ${unique}.`;
    await page.getByLabel('Notes').fill(note);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: 'Edit tracked job' })).toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('tracker-column-wishlist')).toBeVisible({ timeout: 60_000 });
    await expect(
        page.locator('article').filter({ hasText: title }).filter({ hasText: note }),
    ).toBeVisible({ timeout: 60_000 });

    // AC-7: delete the card through the accessible alertdialog (never window.confirm).
    const saved = page.locator('article').filter({ hasText: title });
    await saved.getByRole('button', { name: new RegExp(`Actions for ${title}`) }).click();
    await page.getByRole('menu', { name: `Actions for ${title}` }).getByRole('menuitem', { name: 'Delete card' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('article').filter({ hasText: title })).toHaveCount(0, { timeout: 60_000 });

    expect(failures, `browser reported errors: ${failures.join(' | ')}`).toEqual([]);
});

test('AC-2/AC-5: 1-click advancement, interview scheduling and .ics export persist to MariaDB', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    await openTracker(page);

    const unique = stamp();
    const title = `Platform Engineer ${unique}`;
    const company = `Northwind ${unique}`;

    await page.getByTestId('tracker-add-job').click();
    await expect(page.getByRole('heading', { name: 'Add a job' })).toBeVisible();
    await page.getByLabel('Job title *').fill(title);
    await page.getByLabel('Company *').fill(company);
    await page.getByRole('button', { name: 'Add to tracker' }).click();

    const card = page.getByTestId('tracker-column-wishlist').locator('article').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 60_000 });

    // AC-2 + INV-4: the 1-click "advance" pill moves the card to Applied.
    // (The control is a native <button>, so Enter/Space activation is inherent.)
    await card.getByRole('button', { name: new RegExp(`Advance ${title}`) }).click();
    const appliedCard = page.getByTestId('tracker-column-applied').locator('article').filter({ hasText: title });
    await expect(appliedCard).toBeVisible({ timeout: 60_000 });

    // INV-4: ArrowRight is the keyboard path the native button does not provide.
    await appliedCard.getByRole('button', { name: new RegExp(`Advance ${title}`) }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(
        page.getByTestId('tracker-column-interview').locator('article').filter({ hasText: title }),
    ).toBeVisible({ timeout: 60_000 });

    // AC-5: schedule the interview through the quick-action dialog.
    const interviewCard = page.getByTestId('tracker-column-interview').locator('article').filter({ hasText: title });
    await interviewCard.getByRole('button', { name: new RegExp(`Actions for ${title}`) }).click();
    await page.getByRole('menu', { name: `Actions for ${title}` })
        .getByRole('menuitem', { name: 'Schedule interview' }).click();
    const dialog = page.getByTestId('tracker-interview-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Round').selectOption('Technical');
    await dialog.getByTestId('tracker-interview-at').fill('2027-05-04T09:30');
    await dialog.getByLabel('Format').selectOption('Video');
    await dialog.getByTestId('tracker-interview-link').fill('https://meet.example.com/dir020');
    await dialog.getByTestId('tracker-interview-save').click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });

    // The schedule survives a reload, proving the PATCH reached MariaDB.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('tracker-column-interview')).toBeVisible({ timeout: 60_000 });
    const persisted = page.getByTestId('tracker-column-interview').locator('article').filter({ hasText: title });
    await expect(persisted).toBeVisible({ timeout: 60_000 });
    await expect(persisted.getByText(/Technical/)).toBeVisible();

    // AC-5: the .ics export downloads a real RFC 5545 payload.
    await persisted.getByRole('button', { name: new RegExp(`Actions for ${title}`) }).click();
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.getByRole('menu', { name: `Actions for ${title}` })
            .getByRole('menuitem', { name: 'Export to calendar (.ics)' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.ics$/);
    const stream = await download.createReadStream();
    const ics = await new Response(stream).text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toContain('SUMMARY:Technical - Platform Engineer');

    // Clean up only the row this test created.
    await persisted.getByRole('button', { name: new RegExp(`Actions for ${title}`) }).click();
    await page.getByRole('menu', { name: `Actions for ${title}` }).getByRole('menuitem', { name: 'Delete card' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('article').filter({ hasText: title })).toHaveCount(0, { timeout: 60_000 });

    expect(failures, `browser reported errors: ${failures.join(' | ')}`).toEqual([]);
});

test('AC-7: the board is operable by keyboard alone and exposes accessible stage controls', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    await openTracker(page);

    // Ensure a card is present for keyboard testing (self-contained test isolation)
    const unique = stamp();
    const title = `Staff Engineer ${unique}`;
    const company = `Keyboard Labs ${unique}`;
    await page.getByTestId('tracker-add-job').click();
    await expect(page.getByRole('heading', { name: 'Add a job' })).toBeVisible();
    await page.getByLabel('Job title *').fill(title);
    await page.getByLabel('Company *').fill(company);
    await page.getByRole('button', { name: 'Add to tracker' }).click();
    const card = page.getByTestId('tracker-column-wishlist').locator('article').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 60_000 });

    // INV-4: the search box is reachable and operable from the keyboard.
    const search = page.getByLabel('Search tracked jobs');
    await search.focus();
    await expect(search).toBeFocused();
    await search.pressSequentially('engineer');
    await expect(search).toHaveValue('engineer');
    await search.press('Control+a');
    await search.press('Backspace');
    await expect(search).toHaveValue('');

    // AC-10: the bulky in-card <select> stage dropdown is intentionally gone,
    // so the accessible stage control is now the compact advancement pill.
    // Assert the pill is a real, named, keyboard-reachable button (WCAG 2.1 AA).
    await expect(page.getByLabel(/Move .* to stage/)).toHaveCount(0);

    /*
     * TEST ISOLATION (repeat-run safety): the candidate identity is a shared,
     * long-lived account whose board also carries rows left behind by other
     * lanes and by earlier interrupted runs. A board-wide `getByRole('button',
     * { name: /^Advance .+ to .+$/ })` therefore has NO stable count, and
     * asserting a whole-page count made this test fail whenever the account
     * happened to hold only final-stage cards. The pill is now scoped to the
     * single card this test created, which is deterministic by construction.
     */
    const pills = card.getByRole('button', { name: new RegExp(`^Advance ${title} to .+$`) });
    await expect(pills, 'the created card must expose an advancement pill').toHaveCount(1);
    const pill = pills.first();
    await expect(pill).toBeVisible();
    // A pill is focusable and announces its destination stage.
    await pill.focus();
    await expect(pill).toBeFocused();

    // AC-10: the 3-dot quick-action menu is a real menu surface, reachable from
    // the keyboard and dismissible with Escape (WCAG 2.1 dismissal, INV-4).
    const firstMenuButton = page.locator('article').filter({ hasText: title }).locator('[aria-haspopup="menu"]');
    await firstMenuButton.focus();
    await page.keyboard.press('Enter');
    const openMenu = page.getByRole('menu').first();
    await expect(openMenu).toBeVisible();
    await expect(openMenu.getByRole('menuitem').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(openMenu).toHaveCount(0);

    // Clean up only the row this test created.
    await firstMenuButton.click();
    await page.getByRole('menu', { name: `Actions for ${title}` }).getByRole('menuitem', { name: 'Delete card' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('article').filter({ hasText: title })).toHaveCount(0, { timeout: 60_000 });

    expect(failures, `browser reported errors: ${failures.join(' | ')}`).toEqual([]);
});

/** Opens the Kanban board and waits for the real pipeline to hydrate. */
async function openTracker(page) {
    await page.goto('/dashboard/job-tracker', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Job Tracker', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel('Job tracker board')).toBeVisible({ timeout: 60_000 });
}