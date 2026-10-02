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
});
