// @ts-check
/**
 * DIR-009 WCAG close-out probe.
 *
 * THE QUESTION THIS ANSWERS EMPIRICALLY:
 *   .bridge/evidence/dir009-contrast.mjs reports one FAIL -- white on the raw
 *   brand violet #7366ff is 4.14:1, under the 4.5:1 AA bar for normal text.
 *   That number is only a DEFECT if #7366ff is actually painted as a SOLID FILL
 *   behind near-white text in the candidate portal. Using the raw brand colour
 *   for a focus ring, border, glow or the leading edge of a 135deg gradient is
 *   legitimate (non-text UI needs only 3:1, and the gradient's far end is what
 *   the text sits on). So this probe crawls every live candidate route and
 *   reports the ACTUAL painted combinations, rather than letting a static
 *   palette table imply a failure no user can ever see.
 *
 * It writes nothing to the database.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR009_WEB_ORIGIN || 'http://localhost:3000';
const OUT = path.join(process.cwd(), '.bridge', 'evidence', 'dir009-rawfill-probe.json');

const ROUTES = [
    '/dashboard',
    '/dashboard/applied-jobs',
    '/dashboard/job-tracker',
    '/dashboard/interview',
    '/dashboard/favorites',
    '/dashboard/settings',
    '/dashboard/jobs',
    '/dashboard/cover-letters',
    '/dashboard/portfolios',
    '/dashboard/analytics',
];

const emails = [
    process.env.DIR009_CANDIDATE_EMAIL,
    process.env.ADMIN_EMAIL,
].filter(Boolean);

let session = null;
for (const email of emails) {
    session = await mintFirebaseSession({ email });
    if (session) break;
}
if (!session) {
    console.error('FAIL: no live candidate identity');
    process.exit(1);
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
    const authUser = {
        uid,
        email,
        emailVerified: true,
        displayName: email.split('@')[0],
        isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
        createdAt: String(Date.now()),
        lastLoginAt: String(Date.now()),
        apiKey,
        appName: '[DEFAULT]',
    };
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
    localStorage.setItem('user', uid);
    localStorage.setItem('preferredLanguage', 'en');
    localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
    localStorage.setItem('ime365_privacy_consent_v1', 'denied');
}, {
    uid: session.uid, email: session.email, token: session.idToken,
    refreshToken: session.refreshToken, apiKey: session.apiKey,
});

const page = await context.newPage();

/** Runs INSIDE the page. */
const probe = () => {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const parseRgb = (s) => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map((n) => parseFloat(n));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + 0.05) / (y + 0.05);
    };
    const hex = ({ r, g, b }) =>
        '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };

    const findings = [];
    // Walk every element that renders its own direct text, because the
    // background that matters for a label is the one on its own node.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
        const t = walker.currentNode;
        if ((t.textContent || '').trim()) nodes.push(t.parentElement);
    }

    for (const el of new Set(nodes.filter(Boolean))) {
        if (!visible(el)) continue;
        const cs = getComputedStyle(el);
        const bg = parseRgb(cs.backgroundColor);
        if (!bg || bg.a === 0) continue; // transparent -> sits on an ancestor
        const fg = parseRgb(cs.color);
        if (!fg) continue;

        // Flag only the raw brand violet family as a SOLID fill. The rest of
        // the published palette already clears AA per the contrast table.
        const isBrandViolet = bg.r > 95 && bg.r < 135 && bg.b > 240 && bg.g > 85 && bg.g < 120;
        if (!isBrandViolet) continue;

        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const bar = large ? 3.0 : 4.5;
        const r = ratio(fg, bg);

        findings.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 120),
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
            bg: hex(bg),
            fg: hex(fg),
            fontSize: size,
            fontWeight: weight,
            ratio: Math.round(r * 100) / 100,
            bar,
            large,
            pass: r >= bar,
        });
    }
    return findings;
};