import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-094 — Cuba design-token integrity guard (Wave 3).
 *
 * WHY THIS EXISTS:
 *   Wave 3 of DIR-094 found `bg-[var(--cuba-surface)]` in
 *   src/components/BuildResume/components/InlineAtsGuidance.jsx. `--cuba-surface`
 *   is not defined anywhere in the stylesheets, so the declaration compiled to an
 *   empty value — a silently broken style that no type-check, ESLint rule, build
 *   error or unit test would ever catch. This suite makes that whole defect class
 *   impossible: every `var(--cuba-*)` reference in src/ must resolve to a token
 *   the stylesheets actually define.
 *
 * AC5 MAPPING NOTE:
 *   The DIR-094 brief (and spec §4.3) names `--cuba-bg-glass` / `--cuba-border-glass`.
 *   Neither exists. The real glass primitives are `--cuba-glass-bg`,
 *   `--cuba-glass-bg-strong`, `--cuba-glass-border`, `--cuba-glass-blur` and
 *   `--cuba-glass-shadow` (plus `--cuba-dark-glass-*` variants). This test pins the
 *   REAL tokens so the requirement stays bound to the shipped design system instead
 *   of spawning a parallel glass layer.
 */

const SRC = 'src';

async function walk(dir) {
    const out = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await walk(p));
        else if (/\.(jsx?|css)$/.test(entry.name)) out.push(p.replace(/\\/g, '/'));
    }
    return out;
}

const files = await walk(SRC);
const sources = await Promise.all(files.map(async (f) => [f, await fs.readFile(f, 'utf8')]));

const defined = new Set();
for (const [file, src] of sources) {
    if (!file.endsWith('.css')) continue;
    for (const m of src.matchAll(/(--cuba-[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
}

test('DIR-094 AC5: every var(--cuba-*) reference resolves to a defined token', () => {
    const broken = [];
    for (const [file, src] of sources) {
        for (const m of src.matchAll(/var\(\s*(--cuba-[a-z0-9-]+)/g)) {
            if (!defined.has(m[1])) broken.push(`${file} -> ${m[1]}`);
        }
    }
    assert.deepEqual(broken, [], `unresolved Cuba tokens:\n${broken.join('\n')}`);
});

test('DIR-094 AC5: the ATS guidance progress track uses a real surface token', async () => {
    const src = await fs.readFile('src/components/BuildResume/components/InlineAtsGuidance.jsx', 'utf8');
    // The undefined token must never come back.
    assert.doesNotMatch(src, /--cuba-surface\b/,
        'InlineAtsGuidance must not reference the undefined --cuba-surface token');
    // The track follows the established convention (see AtsScoreMeter.jsx).
    assert.match(src, /rounded-full bg-\[var\(--cuba-line\)\]/,
        'the ATS progress track must use the real --cuba-line surface token');
});

test('DIR-094 AC5: the real Cuba glass primitives exist', () => {
    const required = [
        '--cuba-glass-bg',
        '--cuba-glass-bg-strong',
        '--cuba-glass-border',
        '--cuba-glass-blur',
        '--cuba-glass-shadow',
    ];
    for (const token of required) {
        assert.ok(defined.has(token), `expected real glass token ${token} to be defined`);
    }
});
