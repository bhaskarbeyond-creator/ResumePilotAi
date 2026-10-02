// IME365 Cuba design system guards.
//
// These assertions are the CONTRACT, not documentation. They fail the build if
// the design system regresses into raw-hex sprawl, loses its accessibility
// affordances, or starts making claims the platform cannot actually verify.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

const TOKENS = read('src/styles/cuba-tokens.css');
const TAILWIND_ENTRY = read('src/tailwind.css');
const MAIN = read('src/main.jsx');
const cubaDir = 'src/components/cuba';

const PRIMITIVES = [
    'CubaAppShell', 'CubaCard', 'CubaStatCard', 'CubaBadge', 'CubaButton',
    'CubaPageHeader', 'CubaSkeleton', 'CubaEmptyState', 'CubaErrorState',
    'CubaModal', 'CubaDrawer', 'CubaField', 'AiEngineStatus', 'AiSurface',
    'CubaCommandPalette',
];

// ── sRGB relative luminance + WCAG contrast (real maths, not assertions of
//    intention — these are the ratios the browser will actually compute).
const hexToRgb = (hex) => {
    const v = hex.replace('#', '');
    const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const luminance = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
};

/** Reads `--name: #hex;` from a specific theme block. */
const token = (name, from = TOKENS) => {
    const m = from.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    return m ? m[1] : null;
};

describe('Cuba design tokens', () => {
    it('is imported by the Tailwind entry so @theme is actually processed', () => {
        // A `@theme` block in a plain CSS file is emitted literally and generates
        // no utilities. This regression already happened once and was caught by
        // inspecting the built CSS, so it is now guarded.
        assert.match(TAILWIND_ENTRY, /@import 'tailwindcss';/);
        assert.match(TAILWIND_ENTRY, /@import '\.\/styles\/cuba-tokens\.css';/);
        assert.doesNotMatch(MAIN, /import '\.\/styles\/cuba-tokens\.css';/);
    });

    it('bridges tokens to utilities through @theme inline, not a v3 config', () => {
        assert.match(TOKENS, /@theme inline \{/);
        // v4 must not be fed a v3 config: the repo's root tailwind.config.js is
        // inert (no @config directive), and this guards against reintroducing it.
        // Comments are stripped first so the explanatory prose in the token file
        // (which discusses @config) does not trip the assertion.
        const withoutComments = TOKENS.replace(/\/\*[\s\S]*?\*\//g, '');
        assert.doesNotMatch(withoutComments, /@config/);
        assert.doesNotMatch(TAILWIND_ENTRY.replace(/\/\*[\s\S]*?\*\//g, ''), /@config/);
    });

    it('declares every semantic role the components consume', () => {
        for (const name of [
            'cuba-primary', 'cuba-canvas', 'cuba-card', 'cuba-elevated',
            'cuba-line', 'cuba-line-strong', 'cuba-ink', 'cuba-ink-muted',
            'cuba-ink-subtle', 'cuba-success', 'cuba-info', 'cuba-warning',
            'cuba-danger', 'cuba-secondary', 'cuba-glass-bg', 'cuba-ai-ink',
        ]) {
            assert.match(TOKENS, new RegExp(`--${name}:`), `missing --${name}`);
        }
    });

    it('defines the sidebar, header and z-index geometry the shell depends on', () => {
        for (const name of [
            'cuba-sidebar-w', 'cuba-sidebar-w-collapsed', 'cuba-header-h',
            'cuba-z-drawer', 'cuba-z-modal', 'cuba-z-toast',
        ]) {
            assert.match(TOKENS, new RegExp(`--${name}:`), `missing --${name}`);
        }
        assert.match(TOKENS, /--cuba-sidebar-w:\s*260px/);
        assert.match(TOKENS, /--cuba-sidebar-w-collapsed:\s*72px/);
    });

    it('keeps modal above drawer above content', () => {
        const drawer = Number(TOKENS.match(/--cuba-z-drawer:\s*(\d+)/)[1]);
        const modal = Number(TOKENS.match(/--cuba-z-modal:\s*(\d+)/)[1]);
        const toast = Number(TOKENS.match(/--cuba-z-toast:\s*(\d+)/)[1]);
        assert.ok(drawer < modal, 'drawer must sit below the modal layer');
        assert.ok(modal < toast, 'toasts must sit above modals');
    });
});
describe('Cuba accessibility guarantees', () => {
    it('meets WCAG AA contrast on every light-theme text pair', () => {
        const pairs = [
            ['ink on card', 'cuba-ink', 'cuba-card'],
            ['ink on canvas', 'cuba-ink', 'cuba-canvas'],
            ['muted ink on card', 'cuba-ink-muted', 'cuba-card'],
            ['muted ink on canvas', 'cuba-ink-muted', 'cuba-canvas'],
            ['subtle ink on card', 'cuba-ink-subtle', 'cuba-card'],
            ['primary ink on card', 'cuba-primary-ink-strong', 'cuba-card'],
            ['success on card', 'cuba-success', 'cuba-card'],
            ['info on card', 'cuba-info', 'cuba-card'],
            ['warning on card', 'cuba-warning', 'cuba-card'],
            ['danger on card', 'cuba-danger', 'cuba-card'],
            ['on-primary on primary fill', 'cuba-on-primary', 'cuba-primary-fill'],
        ];
        for (const [label, fg, bg] of pairs) {
            const ratio = contrast(token(fg), token(bg));
            const min = label.includes('on-primary') ? 3.0 : 4.5;
            assert.ok(ratio >= min, `${label}: ${ratio.toFixed(2)}:1 fails AA (needs ${min})`);
        }
    });

    it('meets WCAG AA contrast on every dark-theme text pair', () => {
        // Dark republishes from --cuba-dark-*, so contrast is computed against
        // those declared values rather than the light ones.
        const dark = (name) => token(name.replace('cuba-', 'cuba-dark-')) || token(name);
        const pairs = [
            ['ink on card', 'cuba-ink', 'cuba-card'],
            ['ink on canvas', 'cuba-ink', 'cuba-canvas'],
            ['muted ink on card', 'cuba-ink-muted', 'cuba-card'],
            ['subtle ink on card', 'cuba-ink-subtle', 'cuba-card'],
            ['primary ink on card', 'cuba-primary-ink-strong', 'cuba-card'],
            ['success on card', 'cuba-success', 'cuba-card'],
            ['info on card', 'cuba-info', 'cuba-card'],
            ['warning on card', 'cuba-warning', 'cuba-card'],
            ['danger on card', 'cuba-danger', 'cuba-card'],
        ];
        for (const [label, fg, bg] of pairs) {
            const ratio = contrast(dark(fg), dark(bg));
            assert.ok(ratio >= 4.5, `dark ${label}: ${ratio.toFixed(2)}:1 fails AA`);
        }
    });

    it('uses an AA-safe ink for primary text while keeping the brand violet for fills', () => {
        // The brand violet #7366ff is 4.14:1 on white — fine for a button fill,
        // a fail for body text. `text-cuba-primary` must resolve to the darker
        // sibling, and the brand value must remain available as a fill.
        const brandInk = token('cuba-primary-ink-strong');
        assert.ok(brandInk, 'an AA-safe primary ink token must exist');
        assert.ok(contrast(brandInk, token('cuba-card')) >= 4.5);
        assert.ok(contrast(token('cuba-primary'), token('cuba-card')) < 4.5,
            'if the brand violet ever passes AA the split can be simplified');
        assert.match(TOKENS, /--color-cuba-primary-ink-strong/);
    });

    it('honours reduced motion, contrast and forced-colors preferences', () => {
        assert.match(TOKENS, /@media \(prefers-reduced-motion: reduce\)/);
        assert.match(TOKENS, /@media \(prefers-contrast: more\)/);
        assert.match(TOKENS, /@media \(forced-colors: active\)/);
    });

    it('never suppresses focus visibility', () => {
        assert.match(TOKENS, /\.cuba-focusable:focus-visible/);
        assert.doesNotMatch(TOKENS, /outline:\s*(none|0)\s*;?\s*\}/);
    });

    it('keeps the AI aurora bounded so it cannot create horizontal scroll', () => {
describe('Cuba component library', () => {
    it('ships every documented primitive', () => {
        for (const name of PRIMITIVES) {
            assert.ok(exists(path.join(cubaDir, `${name}.jsx`)), `missing ${name}.jsx`);
        }
    });

    it('exports every primitive from the public barrel', () => {
        const barrel = read(`${cubaDir}/index.js`);
        for (const name of PRIMITIVES) {
            assert.match(barrel, new RegExp(`\\b${name}\\b`), `${name} is not exported`);
        }
    });

    it('routes every overlay through the one shared accessibility contract', () => {
        const hook = read(`${cubaDir}/useDialogA11y.js`);
        for (const behaviour of [/Escape/, /returnFocusRef/, /scrollLocks/, /getFocusable/]) {
            assert.match(hook, behaviour, `dialog contract missing: ${behaviour}`);
        }
        // Both overlays must consume it, so they cannot drift apart.
        for (const overlay of ['CubaModal', 'CubaDrawer']) {
            const source = read(`${cubaDir}/${overlay}.jsx`);
            assert.match(source, /useDialogA11y/);
            assert.match(source, /role="dialog"/);
            assert.match(source, /aria-modal="true"/);
        }
    });

    it('gives form controls real label, hint and error association', () => {
        const field = read(`${cubaDir}/CubaField.jsx`);
        assert.match(field, /htmlFor=/);
        assert.match(field, /aria-invalid=/);
        assert.match(field, /aria-describedby=/);
        assert.match(field, /useId/, 'ids must be generated to stay unique per instance');
    });

    it('announces live regions instead of relying on colour or animation', () => {
        assert.match(read(`${cubaDir}/CubaErrorState.jsx`), /role="alert"/);
        assert.match(read(`${cubaDir}/CubaSkeleton.jsx`), /role="status"/);
        const palette = read(`${cubaDir}/CubaCommandPalette.jsx`);
        assert.match(palette, /role="combobox"/);
        assert.match(palette, /aria-activedescendant/);
    });

    it('provides a documentation showcase as the inspectable source of truth', () => {
        assert.ok(exists(`${cubaDir}/DesignSystemShowcase.jsx`));
describe('Cuba AI integrity — no fabricated telemetry', () => {
    const status = read(`${cubaDir}/aiStatus.js`);
    const beacon = read(`${cubaDir}/AiEngineStatus.jsx`);
    const hook = read('src/hooks/useAiEngineStatus.js');

    it('offers no online/healthy state and no latency field at all', () => {
        // §20: latency may only be shown when genuinely measured. The public
        // availability contract publishes none, so the vocabulary must not even
        // contain a slot for one.
        assert.doesNotMatch(status, /latencyMs/i);
        assert.doesNotMatch(beacon, /latencyMs/i);
        assert.doesNotMatch(status, /\bONLINE\b/);
    });

    it('renders no invented numbers, percentages or provider names', () => {
        assert.doesNotMatch(beacon, /\d+\s*%/);
        assert.doesNotMatch(beacon, /NVIDIA|OpenAI|Gemini|Anthropic/i);
        assert.doesNotMatch(beacon, /99\.9|240ms/);
    });

    it('derives status from the real public availability endpoint', () => {
        assert.match(hook, /\/api\/service-availability/);
        assert.match(hook, /payload\.success !== true/);
    });

    it('never upgrades an unknown or failed check into a healthy claim', () => {
        assert.match(hook, /setStatus\(AI_STATUS\.UNKNOWN\)/,
            'a failed check must land on UNKNOWN');
        assert.match(status, /DESCRIPTOR\[status\] \|\| DESCRIPTOR\[AI_STATUS\.UNKNOWN\]/);
    });

    it('uses the brand mark and states meaning to assistive technology', () => {
        assert.match(beacon, /✦/);
        assert.match(beacon, /cuba-sr-only/);
    });

    it('exposes only real, caller-supplied commands in the palette', () => {
        const palette = read(`${cubaDir}/CubaCommandPalette.jsx`);
        assert.doesNotMatch(palette, /label:\s*['"`]/,
            'the palette must not hardcode a built-in command list');
    });
});

describe('Cuba rollout safety', () => {
    const flag = read(`${cubaDir}/cubaShellFlag.js`);

    it('defaults to the verified legacy shell so no user is opted in silently', () => {
        assert.match(flag, /getCubaShellVariant = \(\) => readStored\(\) \|\| 'legacy'/);
    });

    it('is a presentation-only switch that grants no access', () => {
        // Comments are stripped: the file documents *why* it holds no
        // authorization logic, and that prose must not satisfy or trip the guard.
        const code = flag.replace(/\/\*[\s\S]*?\*\//g, '');
        assert.doesNotMatch(code, /permission|role|isAdmin|token|auth/i);
        assert.doesNotMatch(code, /fetch\(|axios/);
    });

    it('rolls back without a rebuild or redeploy', () => {
        assert.match(flag, /localStorage\.setItem/);
        assert.match(flag, /CUBA_SHELL_STORAGE_KEY/);
    });

    it('survives storage-disabled browsers', () => {
        assert.match(flag, /catch/);
    });
});

        assert.ok(exists('docs/CUBA_DESIGN_SYSTEM.md'));
    });

    it('mounts the showcase inside the session-guarded dashboard namespace', () => {
        const dashboardMain = read('src/components/Dashboard/DashboardMain/DashboardMain.jsx');
        assert.match(dashboardMain, /<Route path="design-system" element=\{<DesignSystemShowcase \/>/);
        // The showcase must not create a new unauthenticated surface.
        assert.doesNotMatch(MAIN, /path="\/design-system"/);
    });
});

        // An unbounded decorative blur is a known mobile defect in this codebase.
        assert.match(TOKENS, /\.cuba-ai-panel \{[\s\S]*?overflow: hidden;/);
        assert.match(TOKENS, /\.cuba-ai-panel::before \{[\s\S]*?pointer-events: none;/);
    });
});

