import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
    mapCandidateEntities,
    CANDIDATE_ENTITY_SEARCH_MIN_LENGTH,
} from '../src/components/Candidate/command/candidateEntitySearch.js';

/**
 * DIR-073 — Executive Command Palette & Search Pipeline UI/UX Overhaul.
 *
 * Pins the six mandates: the panelRef DOM-nesting fix, icon hydration, the
 * certified scrollbar, the segmented mode switcher (ARIA contract intact), the
 * grouped results + keyboard footer, and the candidate entity search. Mirrors
 * the read-the-source convention of tests/copilot-command-surface.test.mjs.
 */

const PALETTE = 'src/components/cuba/CubaCommandPalette.jsx';
const SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const PROVIDER = 'src/components/Candidate/command/candidateEntitySearch.js';
const read = (p) => fs.readFile(p, 'utf8');

test('S1: panelRef encapsulates the whole dialog (no premature close before the copilot surface)', async () => {
    const src = await read(PALETTE);
    // The premature `</div>` that used to sit immediately before the copilot
    // comment is gone, so the copilot surface now lives INSIDE the glass panel.
    assert.doesNotMatch(src, /<\/div>\s*\{\/\* ---- DIR-021: the copilot surface/);
    // Both the panel's and the wrapper's closing div precede the portal close.
    assert.match(src, /<\/div>\s*<\/div>\s*<\/CubaPortal>/);
    assert.equal((src.match(/<CubaPortal>/g) || []).length, 1);
    assert.equal((src.match(/<\/CubaPortal>/g) || []).length, 1);
});

test('S2: buildCommands carries the authentic icon onto every command', async () => {
    const [shell, palette] = await Promise.all([read(SHELL), read(PALETTE)]);
    assert.match(shell, /icon: item\.icon \|\| null/);
    assert.match(shell, /notifications: FiBell/);
    assert.match(shell, /favorites: FiStar/);
    // The palette renders it through a helper that accepts BOTH a component
    // reference (entity providers) and a React element (nav items).
    assert.match(palette, /const renderCommandIcon = \(icon\) =>/);
    assert.match(palette, /React\.createElement\(icon,/);
    assert.match(palette, /renderCommandIcon\(command\.icon\)/);
    assert.match(palette, /renderCommandIcon\(action\.icon\)/);
});

test('S3: every scroll container uses the certified cuba-scrollbar utility', async () => {
    const src = await read(PALETTE);
    const scrollers = src.match(/className="[^"]*overflow-y-auto[^"]*"/g) || [];
    assert.ok(scrollers.length >= 3, 'the palette has at least three scroll containers');
    for (const cls of scrollers) {
        assert.match(cls, /cuba-scrollbar/, `${cls} must use the certified scrollbar`);
    }
});

test('S4: the mode switcher is a segmented pill that keeps the certified ARIA contract', async () => {
    const src = await read(PALETTE);
    // The opt-in gate must still make the tablist its immediate child (dir021 pin).
    assert.match(src, /\{copilotEnabled && \(\s*<div role="tablist"/);
    assert.match(src, /aria-label="Command surface mode"/);
    assert.match(src, /data-testid=\{`cuba-mode-\$\{tab\.id\}`\}/);
    assert.match(src, /aria-selected=\{mode === tab\.id\}/);
    assert.match(src, /aria-controls="cuba-command-list"/);
    // Sleek executive treatment + keyboard accelerator badges.
    assert.match(src, /cuba-glass/);
    assert.match(src, /rounded-full/);
    assert.match(src, /kbd: '\/'/);
    assert.match(src, /kbd: 'Space'/);
});

test('S5: results are grouped into labelled sections with a keyboard hint bar', async () => {
    const src = await read(PALETTE);
    assert.match(src, /const groupedResults = useMemo\(/);
    assert.match(src, /data-testid="cuba-command-group"/);
    assert.match(src, /data-testid="cuba-command-hints"/);
    // The certified invariants survive: exactly two listbox ids, combobox a11y,
    // and no hardcoded command list (design-system guard).
    assert.equal((src.match(/id="cuba-command-list"/g) || []).length, 2);
    assert.match(src, /role="combobox"/);
    assert.match(src, /aria-activedescendant/);
    assert.doesNotMatch(src, /label:\s*['"`]/);
});

test('S6: candidate entity search surfaces real resumes / portfolios / cover letters', async () => {
    const [provider, shell] = await Promise.all([read(PROVIDER), read(SHELL)]);
    assert.match(provider, /getResumes\(\)/);
    assert.match(provider, /getPortfolios\(\)/);
    assert.match(provider, /getCovers\(\)/);
    assert.match(shell, /searchCandidateEntities/);
    assert.match(shell, /commandSearchProvider=\{entitySearch\}/);

    // Functional proof of the pure mapper.
    const hits = mapCandidateEntities({
        resumes: [{ id: 'r1', title: 'Senior Engineer CV' }],
        portfolios: [{ id: 'p1', title: 'Design Portfolio' }],
        covers: [{ id: 'c1', title: 'Google Cover Letter' }],
    }, 'engineer');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'entity-resume-r1');
    assert.equal(hits[0].to, '/build-resume');
    assert.ok(hits[0].label.includes('Senior Engineer CV'));

    // Non-matching term yields nothing; an empty input is never a wildcard.
    assert.equal(mapCandidateEntities({ resumes: [{ id: 'r1', title: 'X' }] }, 'zzz').length, 0);
    assert.deepEqual(mapCandidateEntities({}, ''), []);
    assert.equal(CANDIDATE_ENTITY_SEARCH_MIN_LENGTH, 2);
});
