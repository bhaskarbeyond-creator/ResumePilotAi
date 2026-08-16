/**
 * Resume Builder — static quality gates (no browser required).
 * These run in every product test suite and enforce the enterprise floor:
 *   G1. Exactly 51 Resume Builder templates exist; the 4 cover letters are excluded.
 *   G2. No fabricated placeholder personal data in template fallbacks.
 *   G3. No silent text-clipping pattern (nowrap + hidden + ellipsis on text) in template SCSS.
 *   G4. Every dangerouslySetInnerHTML sink is sanitized.
 *   G5. Canonical resume documents never persist presentation colors.
 *   G6. No stray unregistered template folders.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildCanonicalResumeDocument, normalizeResumeData } from '../src/utils/resumeData.js';

const root = path.resolve(import.meta.dirname, '..');
const cvDirs = fs.readdirSync(path.join(root, 'src/cv-templates')).filter((name) => /^cv\d+$/.test(name)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
const coverDirs = fs.readdirSync(path.join(root, 'src/cv-templates')).filter((name) => /^cover\d+$/.test(name)).sort();
const jsxFiles = (() => {
    const files = [];
    for (let i = 1; i <= 51; i++) files.push(path.join(root, `src/cv-templates/cv${i}/Cv${i}.jsx`));
    return files;
})();
const scssFiles = (() => {
    const files = [];
    for (let i = 1; i <= 51; i++) {
        const dir = path.join(root, `src/cv-templates/cv${i}`);
        const candidates = [`Cv${i}.scss`, `cv${i}.scss`];
        const found = candidates.map((name) => path.join(dir, name)).find((file) => fs.existsSync(file));
        if (found) files.push(found);
    }
    return files;
})();

test('G1: exactly 51 Resume Builder template folders with entry points; 4 cover letters excluded', () => {
    assert.deepEqual(cvDirs, Array.from({ length: 51 }, (_, i) => `cv${i + 1}`));
    assert.deepEqual(coverDirs, ['cover1', 'cover2', 'cover3', 'cover4']);
    for (const file of jsxFiles) assert.equal(fs.existsSync(file), true, file);
});

test('G6: no stray unregistered template folders', () => {
    for (const name of cvDirs) {
        const number = Number(name.slice(2));
        assert.ok(number >= 1 && number <= 51, `unregistered folder cv-templates/${name}`);
    }
});

test('G2: no fabricated placeholder personal data in template fallbacks', () => {
    const forbidden = ['01/04/1964', "'Female'", "'Italian'", "'Bhaskar Babu'", "'John Doe'", "'Jane Doe'"];
    for (const file of jsxFiles) {
        const source = fs.readFileSync(file, 'utf8');
        for (const needle of forbidden) {
            assert.ok(!source.includes(needle), `${file} contains fabricated fallback ${needle}`);
        }
    }
});

test('G3: no silent text-clipping pattern in template SCSS', () => {
    for (const file of scssFiles) {
        const source = fs.readFileSync(file, 'utf8');
        // A text element that is nowrap + overflow hidden + ellipsis silently
        // truncates user content (contact details, skills, names).
        const nowrap = source.includes('white-space: nowrap');
        const clip = source.includes('text-overflow: ellipsis');
        if (nowrap && clip) {
            assert.fail(`${file} combines white-space:nowrap with text-overflow:ellipsis — user content is silently truncated`);
        }
    }
});

test('G4: every dangerouslySetInnerHTML sink uses sanitizeRichText', () => {
    for (const file of jsxFiles) {
        const source = fs.readFileSync(file, 'utf8');
        const sinks = (source.match(/dangerouslySetInnerHTML/g) || []).length;
        const sanitized = (source.match(/sanitizeRichText/g) || []).length;
        assert.ok(sanitized >= sinks, `${file} has ${sinks} HTML sinks but only ${sanitized} sanitizeRichText calls`);
    }
});

test('G5: canonical resume documents never persist presentation colors', () => {
    const document = buildCanonicalResumeDocument({
        firstname: 'Asha',
        lastname: 'Rao',
        colors: { primary: '#ff0000', secondary: '#00ff00' },
        template: 'Cv3',
    }, 'Cv7');
    assert.equal(document.template, 'Cv7');
    assert.equal(document.colors, undefined, 'palette must be stripped from the persisted document');
    assert.equal(document.firstname, 'Asha');
    // The preview-facing normalizer still honors colors for legacy rendering.
    const preview = normalizeResumeData({ colors: { primary: '#ff0000' } });
    assert.equal(preview.colors.primary, '#ff0000');
});

test('G7: template entry points are the only JSX modules in each folder (no dead exports drift)', () => {
    for (let i = 1; i <= 51; i++) {
        const dir = path.join(root, `src/cv-templates/cv${i}`);
        for (const file of fs.readdirSync(dir)) {
            if (file.endsWith('.jsx') && !file.endsWith('Export.jsx')) {
                assert.ok(file === `Cv${i}.jsx`, `unexpected module ${file} in cv${i}`);
            }
        }
    }
});
