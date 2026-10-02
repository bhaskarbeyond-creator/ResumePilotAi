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
