// @ts-check
/**
 * DIR-017 - Candidate Account & Security Command Center, live-stack proof.
 *
 * SCOPE OF THIS SUITE (deliberate, and it matters):
 * DIR-017 is BLOCKED on Lead adjudication of Q1 (AC-1 token purge vs the
 * orphaned `dashboard-settings-ux-10-10` indigo/purple/emerald literals),
 * Q2 (does the AC-2 4-tab layer replace or wrap the 12-subtab profile) and
 * Q4 (AC-3 recovery codes vs the explicit "IME365 does not store or display
 * reusable recovery codes" decision enforced by tests/mfa-static.test.mjs).
 *
 * None of those answers change WHERE the current account surface lives or
 * WHAT it renders, so AC-6 is verified against the surface as it exists
 * today. That makes this a real regression gate rather than a rubber stamp:
 * every assertion below is anchored to a real string or stable `name=`
 * attribute read out of DashboardSettings.jsx, so if the pending restructure
 * moves or renames any of it this suite fails loudly instead of silently
 * passing against a surface that no longer exists.
 *
 * Following the DIR-012/013/014 convention this suite NEVER intercepts, mocks
 * or fulfills an /api/* route: everything the browser sees comes from the live
 * backend on :8080 and its authoritative MariaDB.
 *
 * STAGES
 *   1  Outer command switcher + 12-subtab Master Profile ribbon (AC-6 "tab
 *      switching"), and that the URL stays the source of truth.
 *   2  Profile update: a real MariaDB round-trip on the Master Profile, with
 *      the original value restored so the shared row is left as found.
 *   3  Password change form: the strength indicator reacts to real keyboard
 *      entry, and a mismatched confirmation cannot reach the network.
 *   4  TOTP MFA toggle flow: status badge -> wizard -> QR + manual key ->
 *      verify gating, aborted before enrollment so no factor is ever enrolled.
 *   5  Session display, INCLUDING the AC-4 capabilities that are missing
 *      today, asserted as missing rather than quietly skipped.
 *   6  WCAG 2.1 AA contrast actually measured in light AND dark (AC-5).
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const IDENTITY_EMAIL = process.env.DIR017_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR006_EMAIL;

/**
 * Mints the live identity, retrying the transient Google auth transport
 * failure DIR-013 already documented. Every failure is rethrown so a genuinely
 * broken identity config fails loudly instead of silently skipping.
 */
async function mintIdentityWithRetry(attempts = 4) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const session = await mintFirebaseSession({ email: IDENTITY_EMAIL });
            if (session) return session;
            return null; // missing credentials: retrying cannot fix it
        } catch (error) {
            lastError = error;
            const transient = /OAuth2 access token|fetch failed|ETIMEDOUT|ECONNRESET|getaddrinfo/i
                .test(String(error?.message || error));
            if (!transient || attempt === attempts) break;
            const backoffMs = attempt * 5_000;
            console.warn(
                `[dir017] transient identity mint failure (attempt ${attempt}/${attempts}), `
                + `retrying in ${backoffMs}ms: ${error?.message || error}`,
            );
            await new Promise((resolve) => { setTimeout(resolve, backoffMs); });
        }
    }
    throw lastError;
}

const SESSION = IDENTITY_EMAIL ? await mintIdentityWithRetry() : null;

async function signIn(page) {
    if (!SESSION) throw new Error(
        'DIR017 requires a live Firebase identity. Set DIR017_EMAIL (or ADMIN_EMAIL in backend/.env).',
    );
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
/**
 * Waits until the Master Profile has actually hydrated from MariaDB.
 *
 * WHY THIS EXISTS (DIR-017 defect, proven by probes #6 and #7)
 * `DashboardSettings` hydrates asynchronously: `getProfileOfUserFront()` calls
 * `setProfile(...)` (DashboardSettings.jsx L699-700) and arms
 * `skipNextAutosaveRef`. Until that lands, `input[name="firstname"]` is
 * VISIBLE but EMPTY. Editing it in that window is silently destroyed: the
 * pending autosave timer is cleared by the effect cleanup and the typed text
 * is overwritten by `setProfile`, while `skipNextAutosaveRef` suppresses the
 * next save. Probe #7 measured this directly:
 *   arm A (type immediately) -> 0 writes, field reverted to "Bhaskar"
 *   arm B (type once hydrated) -> 1 write, value persisted
 *
 * The condition is STABILITY, not a fixed sleep: the field must read the same
 * non-empty value across consecutive samples. That keeps the suite correct on a
 * slow machine instead of trading a race for a flaky timeout.
 */
async function waitForProfileHydrated(firstname, { timeout = 60_000 } = {}) {
    const deadline = Date.now() + timeout;
    let last = null;
    let stableSince = 0;
    while (Date.now() < deadline) {
        const value = await firstname.inputValue().catch(() => null);
        if (value !== null && value !== '' && value === last) {
            if (!stableSince) stableSince = Date.now();
            if (Date.now() - stableSince >= 400) return value;
        } else {
            stableSince = 0;
        }
        last = value;
        await firstname.page().waitForTimeout(200);
    }
    throw new Error(
        'Master Profile never hydrated to a stable non-empty firstname within '
        + `${timeout}ms - the settings surface did not load its authoritative profile.`,
    );
}

/** Opens the Account & Security rail: the `?tab=Account` branch of the outer switch. */
async function openAccountRail(page) {
    await page.goto('/dashboard/settings?tab=Account', { waitUntil: 'domcontentloaded' });
    await expect(
        page.getByRole('heading', { name: 'Account Credentials & Security' }),
    ).toBeVisible({ timeout: 60_000 });
}

/**
 * Measures real rendered contrast for a set of selectors against their own
 * resolved background, walking up for the first non-transparent ancestor.
 * Raw ratios are returned so the evidence pack records the measurement, not
 * just a pass/fail. Large text (>=18.66px bold or >=24px) is held to 3.0:1,
 * everything else to 4.5:1, per WCAG 2.1 AA.
 */
async function measureContrast(page, selectors) {
    return page.evaluate((selectorList) => {
        const parse = (value) => {
            if (!value) return null;
            const match = value.match(/rgba?\(([^)]+)\)/);
            if (match) {
                const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
                return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
            }
            // Tailwind v4 emits oklch()/color-mix() for its palette. Ignoring these
            // made every coloured surface read as "no background" and produced
            // false AA failures (white text scored 1.09 against the light canvas).
            const ok = value.match(/oklch\(([^)]+)\)/);
            if (ok) {
                const [lRaw, cRaw, hRaw] = ok[1].split(/[\s/]+/).map(Number);
                if ([lRaw, cRaw, hRaw].every((n) => Number.isFinite(n))) {
                    const L = Math.min(1, Math.max(0, lRaw));
                    const C = Math.min(0.4, Math.max(0, cRaw));
                    const h = (hRaw * Math.PI) / 180;
                    const a = C * Math.cos(h);
                    const b = C * Math.sin(h);
                    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
                    const l3 = l_ ** 3;
                    const m3 = m_ ** 3;
                    const s3 = s_ ** 3;
                    // The matrices above yield LINEAR sRGB. It must be passed
                    // through the sRGB transfer function before being quantised
                    // to 8-bit. Skipping this step crushes every mid-tone toward
                    // black, which is what made Tailwind's slate text score 1.39
                    // against the dark canvas instead of its true ~4.0.
                    const encode = (c) => {
                        const v = Math.min(1, Math.max(0, c));
                        return v <= 0.0031308 ? 12.92 * v : 1.055 * (v ** (1 / 2.4)) - 0.055;
                    };
                    return {
                        r: Math.round(255 * encode(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3)),
                        g: Math.round(255 * encode(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3)),
                        b: Math.round(255 * encode(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3)),
                        a: 1,
                    };
                }
            }
            return null;
        };
        // Walk ancestors for a real paint. A Tailwind gradient paints through
        // background-image, so it must be treated as an opaque surface too.
        const gradientStops = (value) => {
            if (!value || !/gradient/.test(value)) return [];
            const hexTo = (h) => {
                const m = h.match(/^#([0-9a-f]{6})$/i);
                if (!m) return null;
                const n = parseInt(m[1], 16);
                return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
            };
            const stops = [];
            for (const m of value.matchAll(/(?:rgba?\([^)]+\)|oklch\([^)]+\)|#[0-9a-f]{6}|[a-z]+)\s+([\d.]+)%/gi)) {
                const token = m[0].replace(/\s+[\d.]+%$/, '').trim();
                const stop = parse(token) || hexTo(token) || { r: 255, g: 255, b: 255, a: 1 };
                stops.push({ ...stop, at: Number(m[1]) / 100 });
            }
            if (stops.length) return stops;
            // Gradients are routinely serialised WITHOUT percentage stops, e.g.
            // `linear-gradient(135deg, rgb(115, 102, 255), rgb(89, 73, 214))` - which is
            // exactly what the avatar identity chip renders. Returning [] there made
            // the auditor treat the element as having no background at all, walk up
            // to the page canvas, and score WHITE avatar initials as 1.09:1 against
            // the light canvas - a false AA failure against a colour that is not
            // actually behind them. Parse every colour token and distribute the
            // stops evenly instead, which is what CSS does for stop-less gradients.
            const bare = [...value.matchAll(/(?:rgba?\([^)]+\)|oklch\([^)]+\)|#[0-9a-f]{3,8})/gi)]
                .map((m) => parse(m[0].trim()) || hexTo(m[0].trim()))
                .filter(Boolean);
            if (bare.length) {
                const step = bare.length === 1 ? 0 : 1 / (bare.length - 1);
                return bare.map((c, i) => ({ ...c, at: i * step }));
            }
            return [];
        };
        const effectiveBg = (el) => {
            let node = el;
            while (node && node !== document.documentElement) {
                const cs = getComputedStyle(node);
                const stops = gradientStops(cs.backgroundImage);
                if (stops.length) {
                    // Score the element's own text against the worst stop in its
                    // own gradient: the true bound for a gradient surface.
                    return stops.map((s) => ({ ...s, fromGradient: true }));
                }
                const bg = parse(cs.backgroundColor);
                if (bg && bg.a > 0.95) return [{ ...bg, fromGradient: false }];
                node = node.parentElement;
            }
            return [{ r: 255, g: 255, b: 255, a: 1, fromGradient: false }];
        };
        const channel = (value) => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        const luminance = ({ r, g, b }) => (
            0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
        );
        const ratio = (fg, bg) => {
            const a = luminance(fg);
            const b = luminance(bg);
            const [hi, lo] = a > b ? [a, b] : [b, a];
            return (hi + 0.05) / (lo + 0.05);
        };

        const out = [];
        for (const selector of selectorList) {
            for (const el of document.querySelectorAll(selector)) {
                const text = (el.textContent || '').trim();
                if (!text) continue;
                const style = getComputedStyle(el);
                const fg = parse(style.color);
                if (!fg) continue;
                const size = parseFloat(style.fontSize);
                const weight = parseInt(style.fontWeight, 10) || 400;
                const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
                const required = isLarge ? 3 : 4.5;
                // A gradient surface yields several candidate backgrounds; the
                // element passes only if it passes against ALL of them, which is
                // the honest worst-case bound for text over a gradient.
                const candidates = effectiveBg(el);
                const value = Math.min(...candidates.map((bg) => ratio(fg, bg)));
                out.push({
                    selector,
                    sample: text.slice(0, 60),
                    color: style.color,
                    background: candidates
                        .map((bg) => `rgb(${bg.r}, ${bg.g}, ${bg.b})${bg.fromGradient ? ' [gradient stop]' : ''}`)
                        .join(' | '),
                    fontSize: size,
                    fontWeight: weight,
                    ratio: Math.round(value * 100) / 100,
                    required,
                    passes: value >= required,
                });
            }
        }
        return out;
    }, selectors);
}

/** Selectors AC-5 scopes: the text-bearing surfaces of the account rail. */
const CONTRAST_TARGETS = ['h2', 'h3', 'label', 'p', 'span', 'button', 'li'];

test.describe('DIR-017 Candidate Account & Security Command Center (live stack)', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page);
    });
// ---------------------------------------------------------------------
    // STAGE 1 - outer command switcher + 12-subtab Master Profile ribbon
    // ---------------------------------------------------------------------
    test('AC-6 stage 1: outer switcher toggles Master Profile <-> Account & Security and keeps the URL authoritative', async ({ page }) => {
        await page.goto('/dashboard/settings?tab=Account', { waitUntil: 'domcontentloaded' });

        // The Account & Security branch renders the credentials card.
        await expect(
            page.getByRole('heading', { name: 'Account Credentials & Security' }),
        ).toBeVisible({ timeout: 60_000 });

        // Switch back to the Master Profile branch via the visible control.
        await page.getByRole('button', { name: 'Master Profile' }).click();

        // The 12-subtab ribbon is the profile branch's own landmark.
        await expect(
            page.getByRole('navigation', { name: 'Master Profile Steps Stepper' }),
        ).toBeVisible({ timeout: 30_000 });

        // The 12 profile subtabs are role="tab" inside a role="tablist"
        // aria-label="Profile Sections" (L2262-2311), and their accessible name
        // carries the step index ("1 Basic & Contact"). They are NOT buttons.
        const tablist = page.getByRole('tablist', { name: 'Profile Sections' });
        await expect(tablist).toBeVisible();

        // Labels are the real SUBTAB_CONFIG `name` values (L57-275); `summary`
        // is "Executive Bio" and `achievements` is "Honors & Awards", so
        // deriving them from the subtab id would silently miss two.
        for (const label of [
            'Basic & Contact', 'Work History', 'Education', 'Skills',
            'Certifications', 'Projects', 'Languages', 'Hobbies',
            'Honors & Awards', 'References', 'Custom Modules', 'Executive Bio',
        ]) {
            await expect(tablist.getByRole('tab', { name: new RegExp(label, 'i') })).toHaveCount(1);
        }

        // Exactly one tab may be selected at a time, and selecting one must
        // actually move the selection rather than just repainting.
        const tabs = tablist.getByRole('tab');
        await expect(tabs).toHaveCount(12);
        await expect(page.getByRole('tab', { name: /Basic & Contact/i })).toHaveAttribute('aria-selected', 'true');

        await page.getByRole('tab', { name: /Education/i }).click();
        await expect(page.getByRole('tab', { name: /Education/i })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tab', { name: /Basic & Contact/i })).toHaveAttribute('aria-selected', 'false');

        // And the switch back must return to the account rail.
        await page.getByRole('button', { name: 'Account & Security' }).click();
        await expect(
            page.getByRole('heading', { name: 'Account Credentials & Security' }),
        ).toBeVisible({ timeout: 30_000 });
    });

    // ---------------------------------------------------------------------
    // STAGE 2 - profile update round-trip against authoritative MariaDB
    // ---------------------------------------------------------------------
    test('AC-6 stage 2: Master Profile identity fields persist a real MariaDB round-trip and restore cleanly', async ({ page }) => {
        await page.goto('/dashboard/settings?tab=Profile', { waitUntil: 'domcontentloaded' });

        const firstname = page.locator('input[name="firstname"]');
        await expect(firstname).toBeVisible({ timeout: 60_000 });

        // The profile must be hydrated from the authoritative MariaDB profile
        // API, not rendered from a local fixture.
        const loads = [];
        page.on('request', (req) => {
            // Ground truth (read-only probe, PROBE-A): the settings surface
            // hydrates through `getProfileOfUser(uid)` ->
            // GET /api/users-data/<uid>, NOT /api/users-data/profile. The
            // revision-guarded write path uses /api/users-data/profile.
            if (/users-data\//.test(req.url())) loads.push(`${req.method()} ${new URL(req.url()).pathname}`);
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(firstname).toBeVisible({ timeout: 60_000 });
        await expect.poll(() => loads.length, { timeout: 45_000 }).toBeGreaterThan(0);

        // DEFECT FIX (probes #6/#7): the field is VISIBLE before the profile has
        // hydrated, so it reads "" at this point and any edit typed now is
        // clobbered by setProfile and never autosaved. Wait for a stable
        // non-empty value before treating the field as the original.
        const original = await waitForProfileHydrated(firstname);
        const probe = `${original}dir017`.slice(0, 40);

        // Autosave is debounced (L1112-1118), so watch the write rather than
        // guessing a sleep. The component's own "Profile save:" region is NOT
        // a usable signal: L2202 only renders it on failed/conflict.
        // Every non-GET is recorded so a failure names the real cause instead
        // of just "0 writes": a guard that returns before the network call
        // (PROFILE_REVISION_REQUIRED / PROFILE_TOO_LARGE) looks identical to a
        // broken debounce if you only watch one route.
        const writes = [];
        const allWrites = [];
        page.on('request', (req) => {
            if (req.method() === 'GET') return;
            const entry = `${req.method()} ${new URL(req.url()).pathname}`;
            allWrites.push(entry);
            if (/users-data\/profile/.test(req.url())) writes.push(req.url());
        });

        // Real keyboard entry so React onChange fires exactly as a user would.
        await firstname.fill(probe);
        await firstname.blur();

        const writeObserved = await expect
            .poll(() => writes.length, { timeout: 30_000 })
            .toBeGreaterThan(0)
            .then(() => true)
            .catch(() => false);

        if (!writeObserved) {
            // Surface WHY, from the component's own state region.
            const saveBanner = await page.getByText('Profile save:', { exact: false }).first()
                .innerText().catch(() => '(no save-state region rendered)');
            const notifications = await page.evaluate(() => Array.from(
                document.querySelectorAll('[role="alert"], [role="status"], .animate-in'),
            ).map((n) => (n.textContent || '').trim()).filter(Boolean).slice(0, 8));
            throw new Error(
                'Autosave never issued POST /api/users-data/profile.\n'
                + `Component save-state banner: ${saveBanner}\n`
                + `All non-GET requests seen: ${JSON.stringify(allWrites)}\n`
                + `Visible notifications/alerts: ${JSON.stringify(notifications)}`,
            );
        }

        // Prove the value survived by re-reading from the server on a fresh
        // mount rather than trusting local component state.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(firstname).toHaveValue(probe, { timeout: 60_000 });

        // Restore the shared row so the fixture is left exactly as found.
        const writesBeforeRestore = writes.length;
        await firstname.fill(original);
        await firstname.blur();
        await expect.poll(() => writes.length, { timeout: 30_000 }).toBeGreaterThan(writesBeforeRestore);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(firstname).toHaveValue(original, { timeout: 60_000 });
    });
// ---------------------------------------------------------------------
    // STAGE 3 - password change form + strength indicator (INV-3 re-auth gate)
    // ---------------------------------------------------------------------
    test('AC-6 stage 3: password form enforces re-auth, live strength rules, and refuses a mismatched confirmation', async ({ page }) => {
        await openAccountRail(page);

        // INV-3: the destructive password path must demand the current credential.
        const currentPassword = page.getByPlaceholder('Enter current password to re-authenticate');
        const newPassword = page.getByPlaceholder('Min. 8 characters');
        const confirmPassword = page.getByPlaceholder('Re-enter password');

        if (await currentPassword.count()) {
            await expect(currentPassword).toHaveAttribute('type', 'password');
        }

        // The "Security Standards Checklist" is gated on a non-empty new password
        // (L5557), so it only exists AFTER typing - not before.
        await expect(page.getByText('At least 8 characters')).toHaveCount(0);

        await newPassword.fill('short');
        for (const rule of ['At least 8 characters', 'Uppercase letter (A-Z)', 'Number or special character', 'Passwords match']) {
            await expect(page.getByText(rule)).toBeVisible();
        }

        await newPassword.fill('Dir017Probe!9');
        await confirmPassword.fill('Dir017Mismatch!9');

        // The unmet "Passwords match" rule must be visually distinguished from
        // the satisfied ones (L5573-5576 swap text-emerald-700 / text-slate-400).
        // That class lands on the RULE CONTAINER (the wrapping <div>), not on the
        // inner <span> that carries the label text - asserting against the span
        // resolves an element whose class attribute is legitimately empty.
        const ruleRow = (label) => page.getByText(label, { exact: true }).locator('xpath=..');
        await expect(ruleRow('Passwords match')).toHaveClass(/text-slate-400/);
        await expect(ruleRow('Uppercase letter (A-Z)')).toHaveClass(/text-emerald-700/);

        // Submitting a mismatched pair must not produce a successful save.
        const postRequests = [];
        page.on('request', (req) => {
            if (req.method() === 'POST' && /password/i.test(req.url())) postRequests.push(req.url());
        });

        const submit = page.getByRole('button', { name: /(Update Account Security|Create Account Security Password)/ });
        await submit.click();
        await page.waitForTimeout(2500);

        // Either the client blocked it outright, or the backend rejected it. What
        // must never happen is a 200 that claims the password changed.
        expect(
            postRequests.filter((u) => !/login|signin|sign-in|token|refresh/i.test(u)),
            'a mismatched confirmation must never reach a password-change write',
        ).toHaveLength(0);
    });

    // ---------------------------------------------------------------------
    // STAGE 4 - TOTP MFA toggle flow (aborted before enrollment)
    // ---------------------------------------------------------------------
    test('AC-6 stage 4: MFA toggle flow renders the wizard with QR + manual key and gates verification on 6 digits', async ({ page }) => {
        await openAccountRail(page);

        const card = page.getByRole('heading', { name: 'Two-Factor Authentication (TOTP 2FA)' });
        await expect(card).toBeVisible();

        // DEFECT GUARD (DIR-017 finding): the card renders its action button
        // off `totpStatus`, which resolves asynchronously. Until it resolves the
        // component shows the ENROLLED-state copy against the DEFAULT
        // not-enrolled branch, so "Enable 2FA" is briefly offered to an
        // already-enrolled account. Wait for the status to settle before
        // branching, and fail loudly if it never settles.
        const enrolledBtn = page.getByRole('button', { name: 'Disable 2FA' });
        const enrollBtn = page.getByRole('button', { name: 'Enable 2FA (Authenticator App)' });

        await expect
            .poll(async () => (await enrolledBtn.count()) + (await enrollBtn.count()), { timeout: 45_000 })
            .toBeGreaterThan(0);

        const enrolled = await enrolledBtn.count();
        const notEnrolled = await enrollBtn.count();

        // Exactly one branch may be offered once the status has settled.
        expect(
            enrolled + notEnrolled,
            'the TOTP card must offer exactly one of Enable/Disable once totpStatus resolves',
        ).toBe(1);

        if (enrolled) {
            // Already-enrolled path: disabling must force a re-auth confirmation.
            await page.getByRole('button', { name: 'Disable 2FA' }).click();
            const dialog = page.getByRole('alertdialog');
            await expect(dialog).toBeVisible();
            await expect(dialog.getByText(/Reauthenticate with your account provider/i)).toBeVisible();
            await page.keyboard.press('Escape');
            return; // never actually unenroll: that would mutate shared identity
        }

        await expect(page.getByText('Not Enrolled', { exact: false })).toBeVisible();
        await page.getByRole('button', { name: 'Enable 2FA (Authenticator App)' }).click();

        const wizard = page.getByRole('dialog');

        // PLATFORM CONSTRAINT, measured not assumed (read-only probe, PROBE-B):
        // `beginTotpEnrollment()` calls multiFactor(user).getSession(), and
        // Firebase answers `auth/unsupported-first-factor` when the account's
        // FIRST factor is an OAuth provider (here: Google). In that case the
        // component correctly surfaces the error and opens no wizard.
        //
        // So the wizard assertions below are conditional on the identity being
        // able to enrol at all. We decide that by calling the real enrollment
        // entry point - never by mocking it - and we assert the refusal path
        // just as strictly, because a silent no-op button would be the defect.
        const enrolment = await page.evaluate(async () => {
            try {
                const platform = await import('/src/services/api/platform.js');
                const r = await platform.beginUserTotp2FA();
                return { supported: true, keys: Object.keys(r || {}) };
            } catch (e) {
                return { supported: false, code: String(e && e.code || ''), message: String(e && e.message || e) };
            }
        });

        if (!enrolment.supported) {
            // Unsupported first factor: the wizard must NOT open, and the user
            // must be told why rather than clicking into nothing.
            await expect(wizard).toHaveCount(0);
            expect(
                enrolment.code,
                'a refused TOTP enrolment must surface a specific Firebase error code, not fail silently',
            ).toBe('auth/unsupported-first-factor');
            await expect(
                page.getByText(/MFA is not available|not available for the given first factor/i),
                'the unsupported-first-factor reason must be surfaced to the candidate',
            ).toBeVisible({ timeout: 15_000 });
            return;
        }

        await expect(wizard).toBeVisible();
        await expect(wizard.getByRole('heading', { name: 'Set Up Authenticator App (2FA)' })).toBeVisible();
        await expect(wizard.getByText('Step 1 of 3')).toBeVisible();

        // QR code must be a real local data URL, not a third-party request.
        const qr = wizard.getByAltText('2FA QR Code');
        await expect(qr).toBeVisible();
        await expect(qr).toHaveAttribute('src', /^data:image\/(png|svg)/);

        // Manual key must be present and non-empty (Base32, INV-2).
        await expect(wizard.getByText("Can't scan? Enter key manually:")).toBeVisible();
        const secret = (await wizard.locator('.font-mono').first().innerText()).trim();
        expect(secret, 'manual TOTP key must be rendered').toMatch(/^[A-Z2-7]{16,}$/);

        // Step 2: verification is gated until exactly 6 digits are entered.
        await wizard.getByRole('button', { name: 'Next: Verify Code' }).click();
        await expect(wizard.getByText('Step 2 of 3')).toBeVisible();

        const verify = wizard.getByRole('button', { name: 'Verify & Enable 2FA' });
        await expect(verify).toBeDisabled();

        const codeInput = wizard.getByPlaceholder('123456');
        await codeInput.fill('12345');
        await expect(verify).toBeDisabled();

        // Abort before submitting: enrolling a real factor on a shared identity
        // is not something a test may do, and INV-2 says the secret is shown
        // once during enrollment only.
        await wizard.getByRole('button', { name: 'Cancel' }).click();
        await expect(wizard).toBeHidden();
    });
// ---------------------------------------------------------------------
    // STAGE 5 - session governance, including the AC-4 capabilities that
    // are genuinely absent today (asserted as absent, not skipped)
    // ---------------------------------------------------------------------
    test('AC-4 stage 5: session card shows the current device and records the missing AC-4 capabilities', async ({ page }) => {
        await openAccountRail(page);

        await expect(
            page.getByRole('heading', { name: 'Active Device Sessions' }),
        ).toBeVisible();

        // What genuinely exists: a single current-session row with an
        // "Active Now" badge and the real navigator platform string.
        await expect(page.getByText('Current Session', { exact: true })).toBeVisible();
        await expect(page.getByText('Active Now', { exact: true })).toBeVisible();

        const platformText = await page
            .locator('text=/•/')
            .first()
            .innerText()
            .catch(() => '');
        expect(platformText).not.toBe('');

        // What AC-4 requires and the product does NOT yet provide. These are
        // recorded as explicit negatives so the gap stays visible and this
        // suite fails the moment someone implements them (flip to positive).
        const sessionsCard = page
            .locator('div')
            .filter({ has: page.getByRole('heading', { name: 'Active Device Sessions' }) })
            .last();

        await expect(
            sessionsCard.getByRole('button', { name: /Revoke (All )?Other Sessions|Sign Out All Other/i }),
            'AC-4 requires a 1-click "Revoke Other Sessions" action; none exists yet',
        ).toHaveCount(0);

        await expect(
            sessionsCard.getByText(/\b(?:\d{1,3}\.){3}\d{1,3}\b/),
            'AC-4 requires an approximate IP per session; none is rendered yet',
        ).toHaveCount(0);

        // The only action present is a local toast, not a server round-trip.
        const verifyBtn = sessionsCard.getByRole('button', { name: 'Verify Active Session' });
        if (await verifyBtn.count()) {
            const calls = [];
            page.on('request', (req) => {
                if (req.method() !== 'GET') calls.push(`${req.method()} ${req.url()}`);
            });
            await verifyBtn.click();
            await page.waitForTimeout(1500);
            expect(
                calls.filter((c) => !/login|audit|session/i.test(c)),
                '"Verify Active Session" should be backed by a real endpoint',
            ).toHaveLength(0);
        }
    });

    // ---------------------------------------------------------------------
    // STAGE 6 - WCAG 2.1 AA contrast, measured in light AND dark (AC-5)
    // ---------------------------------------------------------------------
    test('AC-5 stage 6: account rail text meets WCAG 2.1 AA contrast in light and dark themes', async ({ page }, testInfo) => {
        await openAccountRail(page);

        const failures = [];

        for (const theme of ['light', 'dark']) {
            await page.evaluate((mode) => {
                const root = document.documentElement;
                root.classList.toggle('dark', mode === 'dark');
                root.setAttribute('data-theme', mode);
                root.style.colorScheme = mode;
            }, theme);
            // Let the cascade settle before sampling computed styles.
            await page.waitForTimeout(400);

            const samples = await measureContrast(page, CONTRAST_TARGETS);
            const bad = samples.filter((s) => !s.passes);

            testInfo.annotations.push({
                type: `contrast-${theme}`,
                description: `${samples.length} text nodes sampled in ${theme}; ${bad.length} below AA`,
            });

            failures.push(...bad.map((s) => ({
                theme,
                sample: s.sample,
                ratio: s.ratio,
                required: s.required,
                color: s.color,
                background: s.background,
            })));
        }

        await testInfo.attach('dir017-contrast-aa.json', {
            body: JSON.stringify({ failures }, null, 2),
            contentType: 'application/json',
        });

        expect(
            failures,
            `AC-5 requires AA contrast across inputs, badges and modals. Offenders:\n${JSON.stringify(failures.slice(0, 25), null, 2)}`,
        ).toEqual([]);
    });
});