import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-076 — Command Palette Search Bar Focus Outline remediation.
 *
 * Pins the global focus-outline exception for seamless inputs, the explicit
 * override, and the palette input's data-seamless marker. Mirrors the
 * read-the-source convention of the sibling dir0xx suites.
 */

const CSS = 'src/index.css';
const PALETTE = 'src/components/cuba/CubaCommandPalette.jsx';
const read = (p) => fs.readFile(p, 'utf8');

test('AC1: index.css excludes seamless inputs from the global input focus outline', async () => {
    const css = await read(CSS);
    // The global input arm now exempts seamless inputs.
    assert.match(css, /input:not\(\[data-seamless='true'\]\):not\(\.cuba-seamless-input\):focus-visible/);
    // ...and an explicit override neutralises any outline / box-shadow / border.
    assert.match(css, /\.cuba-seamless-input:focus,\s*\.cuba-seamless-input:focus-visible\s*\{/);
    assert.match(css, /outline:\s*none !important;/);
    assert.match(css, /outline-offset:\s*0 !important;/);
    assert.match(css, /box-shadow:\s*none !important;/);
    assert.match(css, /border:\s*none !important;/);
    assert.match(css, /background:\s*transparent !important;/);
});

test('AC3: the other focus-visible arms are untouched', async () => {
    const css = await read(CSS);
    for (const sel of [
        'a[href]:focus-visible',
        'button:focus-visible',
        '[role="button"]:focus-visible',
        'select:focus-visible',
        'textarea:focus-visible',
    ]) {
        assert.ok(css.includes(sel), `${sel} must survive`);
    }
    // The global accent outline is preserved for every non-seamless control.
    assert.match(css, /outline:\s*2px solid #4f46e5 !important;/);
});

test('AC2: the palette input carries data-seamless and cuba-seamless-input', async () => {
    const src = await read(PALETTE);
    assert.match(src, /data-seamless="true"/);
    assert.match(src, /cuba-seamless-input/);
    // The borderless class string the dir073 / dir074 suites pin stays intact.
    assert.match(src, /border-0 bg-transparent text-sm text-cuba-ink outline-none ring-0/);
    assert.match(src, /focus:outline-none focus:ring-0 focus-visible:outline-none/);
    // The certified combobox contract survives.
    assert.match(src, /role="combobox"/);
    assert.match(src, /aria-activedescendant/);
});

test('AC4: the searchbar container is the sole unified focus ring', async () => {
    const src = await read(PALETTE);
    assert.match(src, /data-testid="cuba-command-searchbar"/);
    assert.match(src, /focus-within:ring-2 focus-within:ring-cuba-primary/);
});
