// Phase 8 — public frontend, responsive discipline and certification guards.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const HEADER = read('src/components/cuba/CubaPublicHeader.jsx');
const TOKENS = read('src/styles/cuba-tokens.css');
const SHOWCASE = read('src/components/cuba/DesignSystemShowcase.jsx');
const FLAG = read('src/components/cuba/cubaShellFlag.js');
const MAIN = read('src/main.jsx');
const APP_SHELL = read('src/components/cuba/CubaAppShell.jsx');

const { PUBLIC_NAV_LINKS, PUBLIC_AUTH_LINKS } = await import('../src/components/cuba/publicNavigation.js');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Public routes main.jsx actually mounts. */
function publicRoutes() {
    const routes = new Set();
    for (const m of MAIN.match(/<Route path="(\/[^"]*)"/g) || []) {
        routes.add(m.replace(/<Route path="/, '').replace(/"/g, '').replace(/\/\*$/, ''));
    }
    return routes;
}

describe('Public navigation integrity (§16, §28)', () => {
    it('points every marketing link at a mounted route or an on-page anchor', () => {
        const routes = publicRoutes();
        for (const link of PUBLIC_NAV_LINKS) {
            if (link.to.startsWith('/#')) continue; // existing on-page anchor
            assert.ok(routes.has(link.to), `public link ${link.to} is not a mounted route`);
        }
    });

    it('keeps the public surface free of private namespaces', () => {
        for (const link of [...PUBLIC_NAV_LINKS, ...PUBLIC_AUTH_LINKS]) {
            assert.ok(!link.to.startsWith('/admin'), `${link.id} leaks admin`);
            assert.ok(!link.to.startsWith('/adm'), `${link.id} leaks the /adm alias`);
            assert.ok(!link.to.startsWith('/org'), `${link.id} leaks organization`);
            assert.ok(!link.to.startsWith('/employer'), `${link.id} leaks the recruiter portal`);
            assert.ok(!link.to.startsWith('/platform'), `${link.id} leaks the /platform alias`);
        }
    });

    it('makes no product claim the platform cannot back', () => {
        const code = strip(HEADER);
        // No invented social proof, ratings, user counts or guarantees (§28).
        for (const forbidden of [
            /\d+\+?\s*(users|customers|resumes created)/i,
            /\b\d\.0(\s|\/)\s*5\b/,
            /\bguaranteed\b/i,
            /\bno\.?1\b/i,
            /99\.9/,
        ]) {
            assert.doesNotMatch(code, forbidden, `public header must not assert ${forbidden}`);
        }
    });
});

describe('Public header accessibility and responsive discipline (§36, §37)', () => {
    it('labels its navigation landmark', () => {
        assert.match(HEADER, /<nav aria-label="Primary"/);
    });

    it('exposes a real disclosure with state', () => {
        assert.match(HEADER, /aria-expanded=\{open\}/);
        assert.match(HEADER, /aria-controls="cuba-public-menu"/);
        assert.match(HEADER, /aria-label=\{open \? 'Close menu' : 'Open menu'\}/);
    });

    it('marks the current page rather than relying on colour', () => {
        assert.match(HEADER, /aria-current=\{isActive\(link\.to\) \? 'page' : undefined\}/);
    });

    it('closes the mobile menu on Escape', () => {
        assert.match(HEADER, /event\.key === 'Escape'/);
    });

    it('collapses the link row below lg and keeps the bar non-overflowing', () => {
        assert.match(HEADER, /hidden min-w-0 flex-1 items-center gap-1 lg:flex/);
        assert.match(HEADER, /truncate rounded-cuba-sm text-base font-bold/);
        assert.match(HEADER, /lg:hidden/);
        assert.match(HEADER, /h-16/);
    });

    it('applies glass only to the floating bar, not to link content', () => {
        assert.match(HEADER, /cuba-glass sticky top-0/);
        assert.doesNotMatch(strip(HEADER), /backdrop-blur-\[/);
    });

    it('is reachable in the live showcase so it is not dead code', () => {
        assert.match(SHOWCASE, /import CubaPublicHeader from '\.\/CubaPublicHeader'/);
        assert.match(SHOWCASE, /<CubaPublicHeader currentPath="\/pricing" \/>/);
    });
});

describe('Design system responsive and motion discipline (§27, §36)', () => {
    it('honours reduced motion for the AI beacon', () => {
        assert.match(TOKENS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none/);
    });

    it('keeps content columns able to shrink so tables scroll internally', () => {
        assert.match(HEADER, /min-w-0/);
        assert.match(APP_SHELL, /min-w-0 flex-1 overflow-x-hidden/);
    });
});

describe('Frozen template invariant (§8)', () => {
    it('never imports the resume template engine from the design system', () => {
        const cubaFiles = fs.readdirSync(path.join(root, 'src/components/cuba'));
        for (const file of cubaFiles) {
            if (!file.endsWith('.js') && !file.endsWith('.jsx')) continue;
            const source = read(`src/components/cuba/${file}`);
            assert.doesNotMatch(
                source,
                /TemplateRenderer|cv-templates|docxParityMatrix|exportService|atsScore/i,
                `${file} must not touch the frozen template/export engine`,
            );
        }
    });

    it('keeps the rollout flag free of template concerns', () => {
        assert.doesNotMatch(FLAG, /template/i);
    });
});
