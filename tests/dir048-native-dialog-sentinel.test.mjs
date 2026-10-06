import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * DIR-048 invariant: the client ships ZERO native browser dialogs.
 *
 * WHY A STATIC SENTINEL
 *   `window.alert` / `window.confirm` / `window.prompt` are blocking,
 *   unthemeable, unsuppressible OS surfaces: they cannot be screenshot, cannot
 *   be reached as elements by the automation suite, steal focus, and break the
 *   app's visual continuity on mobile. The product contract replaces them with
 *   `CubaInlineNotice`, toasts, `CubaPromptDialog`, and `useConfirmDialog` —
 *   and this guard keeps a future edit from quietly reintroducing one.
 *
 * WHAT IS SCANNED
 *   Every `.js/.jsx/.mjs` file under `src/`, with comments stripped first: the
 *   migration itself is documented in prose ("replaces window.alert"), and that
 *   documentation must neither trip the guard nor satisfy it.
 *
 * WHAT IS (AND IS NOT) A VIOLATION
 *   - a bare `alert(` call is always native: this codebase has no local `alert`
 *     binding
 *   - explicit `window.alert(` / `window.confirm(` / `window.prompt(` are
 *     always native
 *   - a bound `prompt(` / `confirm(` is deliberately ALLOWED: those names are
 *     the public API of `usePromptDialog` / `useConfirmDialog`, which render
 *     themed in-product dialogs
 */
const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'src');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
});

const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/gm, '$1');

test('client source contains no live native browser dialog call', () => {
    const violations = [];
    for (const file of walk(SRC)) {
        const relative = path.relative(root, file).replace(/\\/g, '/');
        const live = stripComments(fs.readFileSync(file, 'utf8'));
        live.split('\n').forEach((line, index) => {
            if (/(?<![\w.$])alert\s*\(/.test(line)) violations.push(`${relative}:${index + 1} bare alert(`);
            if (/window\.(alert|confirm|prompt)\s*\(/.test(line)) violations.push(`${relative}:${index + 1} native window dialog`);
        });
    }
    assert.deepEqual(violations, [],
        `native browser dialogs found — replace with CubaInlineNotice / toast / CubaPromptDialog:\n${violations.join('\n')}`);
});

test('the sentinel actually detects a native dialog (self-check)', () => {
    const sample = [
        'const x = 1;',
        'alert("boom");',
        'window.confirm("sure?");',
        'usePromptDialog() /* window.prompt replaced */',
    ].join('\n');
    const live = stripComments(sample);
    assert.match(live, /(?<![\w.$])alert\s*\(/, 'bare alert must be detected');
    assert.match(live, /window\.(alert|confirm|prompt)\s*\(/, 'window dialogs must be detected');
    assert.doesNotMatch(live, /window\.prompt/, 'comment prose must be stripped before scanning');
});
