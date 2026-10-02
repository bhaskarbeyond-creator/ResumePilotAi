import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function walk(dir) {
    let files = [];
    for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            if (item !== 'node_modules' && item !== 'dist' && item !== '.git') {
                files = files.concat(walk(full));
            }
        } else if (full.endsWith('.css') || full.endsWith('.scss')) {
            files.push(full);
        }
    }
    return files;
}

function walkSource(dir) {
    let files = [];
    for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            if (item !== 'node_modules' && item !== 'dist' && item !== '.git') {
                files = files.concat(walkSource(full));
            }
        } else if (/\.(jsx?|mjs|cjs)$/.test(item)) {
            files.push(full);
        }
    }
    return files;
}

/**
 * Case-sensitive import-resolution guard.
 *
 * WHY THIS EXISTS: five source files imported `../Common/ContextSwitcher`
 * while the directory on disk is `components/common`. Windows and macOS are
 * case-insensitive by default, so `npm run build` passed locally while
 * BOTH CI workflows (.github/workflows/quality-gate.yml and
 * production-release.yml) run `npm run build` on ubuntu-24.04, where the
 * module cannot resolve and the build fails. A local green build therefore
 * proved nothing about the shipped artifact.
 *
 * NOTE: `fs.existsSync` CANNOT be used here — on Windows it is itself
 * case-insensitive and would report the mismatched path as present, making
 * this guard a false green. Every segment is therefore compared against the
 * real directory entry names from readdirSync, so the mismatch fails here on
 * Windows exactly as it fails on the Linux build agents.
 */
describe('Case-sensitive import resolution guard', () => {
    it('resolves every relative import in src/ with exact on-disk casing', () => {
        const files = walkSource(path.join(root, 'src'));
        const offenders = [];
        const SOURCE_EXTS = ['.js', '.jsx', '.mjs', '.cjs'];

        const listDir = (dir) => {
            try { return fs.readdirSync(dir); } catch { return null; }
        };

        for (const file of files) {
            const source = fs.readFileSync(file, 'utf8');
            const importPattern = /(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g;
            let match;
            while ((match = importPattern.exec(source)) !== null) {
                const spec = match[1];
                const segments = spec.split('/').filter((s) => s && s !== '.');
                if (segments[0] !== '..') continue; // only relative parent imports can leave the file's own folder tree this way
                const rel = path.relative(root, file).replace(/\\/g, '/');

                let currentDir = path.dirname(file);
                for (let i = 0; i < segments.length; i += 1) {
                    const segment = segments[i];
                    const isLast = i === segments.length - 1;

                    // `..` is a traversal instruction, not a directory entry, so it
                    // must never be matched against readdir output.
                    if (segment === '..') { currentDir = path.dirname(currentDir); continue; }

                    const entries = listDir(currentDir);
                    if (entries === null) { currentDir = null; break; }

                    const exact = entries.find((e) => e === segment);
                    const fuzzy = entries.find((e) => e.toLowerCase() === segment.toLowerCase());

                    if (!exact && fuzzy) {
                        offenders.push(`${rel}: '${spec}' -> segment '${segment}' is '${fuzzy}' on disk (case differs)`);
                        currentDir = null;
                        break;
                    }
                    if (!exact) {
                        if (!isLast) { currentDir = null; break; }
                        // Last segment may omit the extension: match the stem exactly.
                        const stemOk = entries.some((e) => {
                            const dot = e.lastIndexOf('.');
                            const stem = dot > 0 ? e.slice(0, dot) : e;
                            return stem === segment && SOURCE_EXTS.includes(e.slice(dot));
                        });
                        if (!stemOk) { currentDir = null; break; }
                        currentDir = null;
                        break;
                    }

                    const candidate = path.join(currentDir, exact);
                    if (isLast) {
                        let ok = false;
                        try { ok = fs.statSync(candidate).isFile(); } catch { ok = false; }
                        if (!ok) {
                            const dirEntries = listDir(candidate);
                            ok = Array.isArray(dirEntries) && dirEntries.some((e) => SOURCE_EXTS.includes(path.extname(e)));
                        }
                        if (!ok) { currentDir = null; break; }
                        currentDir = null;
                        break;
                    }

                    const candidateEntries = listDir(candidate);
                    if (candidateEntries === null) { currentDir = null; break; }
                    currentDir = candidate;
                }
            }
        }

        assert.deepEqual(offenders, [], 'Case-mismatched relative imports break the Linux CI build:\n' + offenders.join('\n'));
    });
});

describe('Unlayered CSS & Utility Isolation Architecture Guard', () => {
    it('prohibits raw top-level .hidden rules that sabotage Tailwind v4 @layer utilities', () => {
        const files = walk(path.join(root, 'src'));
        const violations = [];

        for (const file of files) {
            if (file.endsWith('tailwind.css') || file.endsWith('index.css')) continue;
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            let depth = 0;
            lines.forEach((line, idx) => {
                const trimmed = line.trim();
                if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

                if (depth === 0) {
                    // Check for unscoped .hidden rule
                    if (/^\.hidden(\s*\{|,)/.test(trimmed)) {
                        violations.push({ file: path.relative(root, file), line: idx + 1, code: trimmed });
                    }
                }
                const openMatches = (trimmed.match(/\{/g) || []).length;
                const closeMatches = (trimmed.match(/\}/g) || []).length;
                depth += openMatches - closeMatches;
            });
        }

        assert.equal(
            violations.length,
            0,
            `Found unlayered top-level .hidden rules that override Tailwind v4 layers: ${JSON.stringify(violations, null, 2)}`
        );
    });

    it('prohibits rogue top-level display, margin, gap, and transition utilities outside @layer', () => {
        const files = walk(path.join(root, 'src'));
        const forbiddenPatterns = [
            /^\.flex(\s*\{|,)/,
            /^\.grid(\s*\{|,)/,
            /^\.block(\s*\{|,)/,
            /^\.inline-flex(\s*\{|,)/,
            /^\.mt-\d+(\s*\{|,)/,
            /^\.gap-\d+(\s*\{|,)/,
            /^\.transition-transform(\s*\{|,)/,
            /^\.card(\s*\{|,)/,
        ];
        const violations = [];

        for (const file of files) {
            if (file.endsWith('tailwind.css') || file.endsWith('index.css')) continue;
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            let depth = 0;
            lines.forEach((line, idx) => {
                const trimmed = line.trim();
                if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

                if (depth === 0) {
                    for (const pat of forbiddenPatterns) {
                        if (pat.test(trimmed)) {
                            violations.push({ file: path.relative(root, file), line: idx + 1, code: trimmed });
                        }
                    }
                }
                const openMatches = (trimmed.match(/\{/g) || []).length;
                const closeMatches = (trimmed.match(/\}/g) || []).length;
                depth += openMatches - closeMatches;
            });
        }

        assert.equal(
            violations.length,
            0,
            `Found unlayered utility declarations that collide with Tailwind v4: ${JSON.stringify(violations, null, 2)}`
        );
    });

    it('verifies ActionFilling, LanguagePicker, and DashboardSettings have properly scoped selectors', () => {
        const actionFillingScss = fs.readFileSync(path.join(root, 'src/components/Actions/action-step-filling/ActionFilling.scss'), 'utf8');
        assert.doesNotMatch(actionFillingScss, /^\.hidden\s*\{/m, 'ActionFilling.scss must not have unscoped .hidden');
        assert.match(actionFillingScss, /\.additionalnfo\.hidden/m, 'ActionFilling.scss must scope to .additionalnfo.hidden');

        const langPickerScss = fs.readFileSync(path.join(root, 'src/components/Form/language-picker/LanguagePicker.scss'), 'utf8');
        assert.doesNotMatch(langPickerScss, /^\.hidden\s*\{/m, 'LanguagePicker.scss must not have unscoped .hidden');
        assert.match(langPickerScss, /\.languageDropDown\.hidden/m, 'LanguagePicker.scss must scope to .languageDropDown.hidden');

        const langPickerCss = fs.readFileSync(path.join(root, 'src/components/Form/css/LanguagePicker.css'), 'utf8');
        assert.doesNotMatch(langPickerCss, /^\.hidden\s*\{/m, 'LanguagePicker.css must not have unscoped .hidden');

        const appCss = fs.readFileSync(path.join(root, 'src/App.css'), 'utf8');
        assert.doesNotMatch(appCss, /^\.card\s*\{/m, 'App.css must not have unscoped .card');
    });

    it('verifies ProfileDisplay and Admin sidebar inline style tags are strictly scoped to legacy shell', () => {
        const profileDisplayJsx = fs.readFileSync(path.join(root, 'src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx'), 'utf8');
        assert.doesNotMatch(
            profileDisplayJsx,
            /<style>[\s\S]*?^\s*\.dashboardContentWrapper\s*,/m,
            'ProfileDisplay.jsx must not have unscoped .dashboardContentWrapper selector'
        );
        assert.match(
            profileDisplayJsx,
            /\[data-shell-variant="legacy"\]\s+\.dashboardContentWrapper/m,
            'ProfileDisplay.jsx must scope .dashboardContentWrapper to legacy shell variant'
        );

        const adminSidebarJsx = fs.readFileSync(path.join(root, 'src/components/admin/sidebar/sidebar.jsx'), 'utf8');
        assert.doesNotMatch(
            adminSidebarJsx,
            /<style>[\s\S]*?^\s*\.dashboardContentWrapper\s*,/m,
            'admin/sidebar.jsx must not have unscoped .dashboardContentWrapper selector'
        );
        assert.match(
            adminSidebarJsx,
            /\[data-shell-variant="legacy"\]\s+\.dashboardContentWrapper/m,
            'admin/sidebar.jsx must scope .dashboardContentWrapper to legacy shell variant'
        );

        const appShellScss = fs.readFileSync(path.join(root, 'src/components/AppShell/AuthenticatedAppShell.scss'), 'utf8');
        assert.doesNotMatch(
            appShellScss,
            /^\.dashboardWrapper\s*\{/m,
            'AuthenticatedAppShell.scss must not have unscoped .dashboardWrapper selector'
        );
        assert.match(
            appShellScss,
            /\[data-shell-variant="legacy"\]\.dashboardWrapper/m,
            'AuthenticatedAppShell.scss must scope .dashboardWrapper to legacy variant'
        );
    });

    it('renders a single h1 and no heading-level skips on public marketing surfaces', () => {
    // A document must expose exactly one h1, and heading levels must not skip
    // (h2 -> h4 breaks screen-reader navigation by heading). These assertions
    // pin the semantic fixes made to the landing, features and gallery pages.
    const pricing = fs.readFileSync(path.join(root, 'src/components/Marketing/elements/HomepagePricing.jsx'), 'utf8');
    const footer = fs.readFileSync(path.join(root, 'src/components/Marketing/elements/HomepageFooter.jsx'), 'utf8');
    const hero = fs.readFileSync(path.join(root, 'src/components/Marketing/elements/HomepageHero.jsx'), 'utf8');
    const features = fs.readFileSync(path.join(root, 'src/components/Features/Features.jsx'), 'utf8');
    const gallery = fs.readFileSync(path.join(root, 'src/components/PortfolioGallery/PortfolioGallery.jsx'), 'utf8');

    // The pricing section is a sibling of the hero, not a second page-level h1.
    assert.doesNotMatch(pricing, /<h1[\s>]/, 'HomepagePricing must not emit a second h1');
    assert.match(pricing, /<h2[^>]*>\s*Simple, Powerful Plans for Every Stage/);

    // Footer column groups follow h2 sections; h4 skipped a level.
    assert.doesNotMatch(footer, /<h4[\s>]/, 'HomepageFooter must not skip to h4 column headings');
    assert.match(footer, /<h2[^>]*>\s*Product/);
    assert.match(footer, /<h2[^>]*>\s*Legal/);

    // A candidate name inside a decorative resume mockup is not a heading.
    assert.doesNotMatch(hero, /<h4[^>]*>\s*Jordan Vance/);

    // Feature cards under the page h1 must be h2, not a skipping h3.
    assert.doesNotMatch(features, /<h3 className="text-lg font-bold text-gray-900 group-hover/);

    // Empty-state message is not a heading.
    assert.doesNotMatch(gallery, /<h3[^>]*>\s*No portfolios found/);
});

it('verifies all 4 portal shells initialize Cuba state synchronously without frame 0 legacy mounts', () => {
        const authShellJsx = fs.readFileSync(path.join(root, 'src/components/AppShell/AuthenticatedAppShell.jsx'), 'utf8');
        assert.match(authShellJsx, /useState\(\(\)\s*=>\s*isCubaShellEnabled\(\)\)/, 'AuthenticatedAppShell must initialize synchronously');

        const employerPortalJsx = fs.readFileSync(path.join(root, 'src/components/EmployerPortal/EmployerPortal.jsx'), 'utf8');
        assert.match(employerPortalJsx, /useState\(\(\)\s*=>\s*isCubaShellEnabled\(\)\)/, 'EmployerPortal must initialize synchronously');

        const adminJsx = fs.readFileSync(path.join(root, 'src/components/admin/Admin.jsx'), 'utf8');
        assert.match(adminJsx, /useState\(\(\)\s*=>\s*isCubaShellEnabled\(\)\)/, 'Admin must initialize synchronously');

        const enterpriseJsx = fs.readFileSync(path.join(root, 'src/enterprise/EnterpriseConsole.jsx'), 'utf8');
        assert.match(enterpriseJsx, /useState\(\(\)\s*=>\s*isCubaShellEnabled\(\)\)/, 'EnterpriseConsole must initialize synchronously');
    });

    it('verifies CubaAppShell enforces w-full on root and main elements', () => {
        const cubaAppShellJsx = fs.readFileSync(path.join(root, 'src/components/cuba/CubaAppShell.jsx'), 'utf8');
        assert.match(cubaAppShellJsx, /className="w-full flex min-h-screen flex-col bg-cuba-canvas text-cuba-ink"/, 'CubaAppShell root must have w-full');
        assert.match(cubaAppShellJsx, /<main id="cuba-main-content"[^>]*className="w-full min-w-0 flex-1 overflow-x-hidden"/, 'CubaAppShell main must have w-full');
    });
});
