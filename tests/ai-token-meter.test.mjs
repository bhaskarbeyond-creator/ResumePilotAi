// IME365 AI allowance meter guards.
//
// These assertions are the CONTRACT, not documentation. They fail if the
// menubar meter ever starts showing a number the platform did not measure,
// starts reading another user's allowance, re-implements quota maths that only
// the server may own, or gets mounted under the quota-consuming /api/ai prefix.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ROUTES = read('backend/routes/ai.js');
const HOOK = read('src/hooks/useAiTokenUsage.js');
const METER = read('src/components/cuba/AiTokenMeter.jsx');
const SHELL = read('src/components/cuba/CubaAppShell.jsx');
const USER_MENU = read('src/components/cuba/M3UserMenu.jsx');

// Strip HTML numeric entities (e.g. the ✦ glyph written as an entity) so the
// design-token scan cannot mistake a character reference for a hex colour.
const withoutEntities = (src) => src.replace(/&#\d+;/g, '');

describe('AI allowance meter — backend contract', () => {
    it('exposes the caller\'s own allowance at /ai-usage', () => {
        assert.match(ROUTES, /router\.get\('\/ai-usage'/);
    });

    it('is never mounted under the quota-consuming /api/ai prefix', () => {
        // `/api/ai` is wrapped in aiAccountLimiter + enforceDailyAiQuota, so a
        // meter declared there would consume the very allowance it reports.
        assert.doesNotMatch(ROUTES, /router\.(get|post)\('\/ai\/usage'/);
        assert.match(ROUTES, /deliberately NOT under `\/api\/ai`/);
    });

    it('delegates to the single server-side entitlement resolver', () => {
        assert.match(ROUTES, /getUserAiEntitlement/);
        // No second, disagreeing implementation of the quota ladder.
        assert.doesNotMatch(ROUTES.slice(ROUTES.indexOf("router.get('/ai-usage'")), /DEFAULT_GLOBAL_QUOTAS|dailyRequests/);
    });

    it('is authenticated and derives the uid from the verified token only', () => {
        assert.match(ROUTES, /const requireAuthLazy = \(req, res, next\) => require\('\.\.\/security\/auth'\)\.requireAuth\(req, res, next\)/);
        assert.match(ROUTES, /router\.get\('\/ai-usage', requireAuthLazy/);
        assert.match(ROUTES, /const uid = req\.user\?\.uid/);
        // A caller must never be able to name someone else's uid.
        const handler = ROUTES.slice(ROUTES.indexOf("router.get('/ai-usage'"));
        assert.doesNotMatch(handler, /req\.(query|body|params)\.(uid|userId|id)\b/);
    });

    it('fails closed instead of inventing a figure', () => {
        const handler = ROUTES.slice(ROUTES.indexOf("router.get('/ai-usage'"));
        assert.match(handler, /error\.status \|\| 503/);
        assert.match(handler, /AI_USAGE_UNAVAILABLE/);
    });

    it('opts into graceful multi-tenant resolution for the telemetry readout', () => {
        // DIR-106: the menubar meter is a TELEMETRY read, not an execution. It
        // asks the resolver to select the caller's primary organization instead
        // of failing closed with 400 when no X-Tenant-Id is sent. Execution paths
        // never pass this flag, so the quota gate stays strict.
        const handler = ROUTES.slice(ROUTES.indexOf("router.get('/ai-usage'"));
        assert.match(handler, /allowAmbiguousSelection: true/);
    });
});

describe('AI allowance meter — client contract', () => {
    it('reads only the server-authoritative endpoint through the shared auth boundary', () => {
        assert.match(HOOK, /const USAGE_URL = '\/api\/ai-usage'/);
        assert.match(HOOK, /authenticatedJsonRequest\(USAGE_URL/);
        assert.doesNotMatch(HOOK, /[^h]fetch\(/);
    });

    it('treats an unreadable ledger as UNKNOWN, never as headroom', () => {
        assert.match(HOOK, /AI_USAGE_STATUS\.UNAVAILABLE/);
        assert.match(HOOK, /setStatus\(AI_USAGE_STATUS\.UNAVAILABLE\)/);
        assert.doesNotMatch(HOOK, /Math\.random|Math\.round\(.*percent|hardcod/i);
    });

    it('renders nothing rather than a placeholder when unavailable', () => {
        assert.match(METER, /if \(!enabled \|\| status !== AI_USAGE_STATUS\.READY\) return null;/);
    });

    it('uses Cuba design tokens only — no raw hex colours', () => {
        assert.doesNotMatch(withoutEntities(METER), /#[0-9a-fA-F]{3,8}\b/);
        assert.doesNotMatch(withoutEntities(HOOK), /#[0-9a-fA-F]{3,8}\b/);
        assert.match(METER, /border-cuba-line/);
        assert.match(METER, /bg-cuba-card/);
    });

    it('is accessible: real text, a tooltip, and an sr-only description', () => {
        assert.match(METER, /data-testid="ai-token-meter"/);
        assert.match(METER, /cuba-sr-only/);
        assert.match(METER, /title=\{/);
        assert.match(METER, /text-cuba-ink-subtle/);
    });
});

describe('AI allowance meter — single surface (no duplication)', () => {
    it('is NOT duplicated inside the account menu', () => {
        assert.doesNotMatch(USER_MENU, /cuba-user-menu-ai-allowance/);
        assert.doesNotMatch(USER_MENU, /AI requests today/);
    });

    it('keeps the menu free of the meter, so the two can never drift', () => {
        assert.doesNotMatch(USER_MENU, /useAiTokenUsage/);
        assert.doesNotMatch(USER_MENU, /from '\.\/AiTokenMeter'/);
        assert.doesNotMatch(USER_MENU, /formatAiRequestCount/);
        assert.doesNotMatch(USER_MENU, /api\/ai-usage/);
    });

    it('keeps the formatter private to the one surface that renders it', () => {
        assert.match(METER, /const formatAiRequestCount = /);
        assert.doesNotMatch(METER, /export const formatAiRequestCount/);
    });
});

describe('AI allowance meter — menubar wiring', () => {
    it('is imported and rendered in the Cuba application shell', () => {
        assert.match(SHELL, /import AiTokenMeter from '\.\/AiTokenMeter'/);
        assert.match(SHELL, /<AiTokenMeter enabled=\{Boolean\(user\)\}/);
    });

    it('sits on the menubar immediately beside the message icon', () => {
        assert.match(
            SHELL,
            /<AiTokenMeter enabled=\{Boolean\(user\)\} className="hidden sm:inline-flex" \/>\s*<M3NotificationCenter/,
        );
    });

    it('renders the directive wording: Usage: XXX/XXX', () => {
        assert.match(METER, /Usage: /);
        // A plain count, never an abbreviation the reader has to decode.
        assert.match(METER, /formatAiRequestCount\(usedToday\)\}\/\{formatAiRequestCount\(effectiveLimit\)/);
        // The word "token" must not reach the RENDERED COPY. Identifiers and
        // testids legitimately carry it (the component is AiTokenMeter), so the
        // assertion is scoped to the visible label region.
        const visibleCopy = METER.slice(
            METER.indexOf('<span aria-hidden="true" className="whitespace-nowrap">'),
            METER.indexOf('<span className="cuba-sr-only">'),
        );
        assert.ok(visibleCopy.length > 0, 'the visible label region must exist');
        assert.doesNotMatch(visibleCopy, /tokens?/i);
        assert.match(visibleCopy, /Usage: /);
        // The unit was removed from the chrome on request — it must NOT come
        // back into the visible label, but must survive in the announced copy.
        // The sr-only span interpolates `${label}`, so the literal wording lives
        // in the `label` const; assert there, not inside the span.
        assert.doesNotMatch(visibleCopy, /req\/day/);
        assert.match(METER, /AI requests left today/);
        assert.match(METER, /AI allowance used up/);
    });

    it('never renders for a signed-out viewer', () => {
        assert.match(SHELL, /enabled=\{Boolean\(user\)\}/);
    });
});
