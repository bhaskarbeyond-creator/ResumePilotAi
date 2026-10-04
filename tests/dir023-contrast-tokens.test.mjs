// @ts-check
/**
 * DIR-023 regression guard: the audited token layer must stay compliant.
 *
 * WHY A STATIC GUARD IS NEEDED IN ADDITION TO THE CRAWLER
 * The live auditor (npm run audit:contrast) is the real proof, but it needs a
 * running server and a live Firebase identity. These assertions encode the same
 * maths offline so a regression is caught in CI in seconds, and so nobody can
 * quietly "fix" a token back to a failing value.
 *
 * Every expectation below is a value measured from a real crawl against the
 * live app, not a guess.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const TOKENS = path.join(SOURCE_ROOT, 'styles', 'cuba-tokens.css');
const PUBLIC_SITE = path.join(SOURCE_ROOT, 'components', 'Marketing', 'public-site.css');
const css = fs.readFileSync(TOKENS, 'utf8');
const publicSiteCss = fs.readFileSync(PUBLIC_SITE, 'utf8');

// Build the opacity census from the checked-out source instead of relying on a
// generated file under the ignored `.bridge/tmp/` directory. A clean clone and
// CI run must exercise the same source-derived contract without a warm workspace.
const OPACITY_UTILITY = /(?:[a-z][a-z0-9-]*:)*(?:bg|text|border|ring|divide|from|to|via|placeholder|outline)-[a-z]+(?:-\d{1,3})?\/\d{1,3}\b/g;
const SOURCE_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.mjs', '.ts', '.tsx']);

function collectOpacityClasses(directory = SOURCE_ROOT, found = new Set()) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectOpacityClasses(filename, found);
            continue;
        }
        if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
        const source = fs.readFileSync(filename, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/^\s*\/\/.*$/gm, ' ');
        for (const match of source.matchAll(OPACITY_UTILITY)) found.add(match[0]);
    }
    return [...found].sort();
}

const allOpacityClasses = collectOpacityClasses();

/* ---------------- W3C contrast maths (single sRGB transfer) --------------- */

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => (
    0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255)
);
const contrast = (fg, bg) => {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const hex = (h) => {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Reads `--name: #hex;` from the palette. */
const token = (name) => {
    const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    assert.ok(m, `token ${name} must be declared in cuba-tokens.css`);
    return hex(m[1]);
};

test('DIR-023: light-theme accent ink clears 4.5:1 on BOTH light surfaces', () => {
    const ink = token('--cuba-ink-accent');
    const onCard = contrast(ink, hex('#ffffff'));
    const onCanvas = contrast(ink, hex('#f4f5f9'));
    assert.ok(onCard >= 4.5, `--cuba-ink-accent on card must be >= 4.5:1, got ${onCard.toFixed(2)}`);
    assert.ok(onCanvas >= 4.5, `--cuba-ink-accent on canvas must be >= 4.5:1, got ${onCanvas.toFixed(2)}`);
});

test('DIR-023: dark-theme accent ink clears 4.5:1 on BOTH dark surfaces', () => {
    const dark = token('--cuba-dark-ink-accent');
    const onCanvas = contrast(dark, hex('#0d0f16'));
    const onCard = contrast(dark, hex('#15181f'));
    assert.ok(onCanvas >= 4.5, `dark accent on canvas must be >= 4.5:1, got ${onCanvas.toFixed(2)}`);
    assert.ok(onCard >= 4.5, `dark accent on card must be >= 4.5:1, got ${onCard.toFixed(2)}`);
});

test('DIR-023: the light correction must NOT be reused as the dark ink', () => {
    // Guards the mistake the token comment warns about: the light ink measures
    // only ~3.5:1 on the dark canvas, so one global value cannot serve both.
    const lightInk = token('--cuba-ink-accent');
    const darkInk = token('--cuba-dark-ink-accent');
    assert.notDeepEqual(lightInk, darkInk, 'light and dark accent inks must differ');
    assert.ok(
        contrast(lightInk, hex('#0d0f16')) < 4.5,
        'light ink is expected to FAIL on the dark canvas; if it now passes, '
        + 'the dark override is redundant and should be simplified',
    );
});

test('DIR-023: slate ramp remaps carry the doubled-class specificity fix', () => {
    // Tailwind precompiles `.text-slate-400` into its own `utilities` layer,
    // which outranks a plain rule in `components` even with !important. The
    // doubled selector is what makes these overrides reach the DOM at all.
    // Proven live: before this, getComputedStyle still returned Tailwind's raw
    // oklch() on an /admin/attention page.
    for (const step of ['400', '500', '600']) {
        assert.ok(
            css.includes(`.text-slate-${step}.text-slate-${step}`),
            `.text-slate-${step} must use the doubled selector or it will not apply`,
        );
    }
    assert.ok(css.includes('.bg-white.bg-white'), '.bg-white must use the doubled selector');
});

test('DIR-023: harmonization rules live in a layer Tailwind actually emits', () => {
    assert.ok(css.includes('@layer components'), 'the overrides must sit in @layer components');
    assert.ok(/@layer components\s*\{/.test(css), 'expected an @layer components block');
});

test('DIR-023: mapped ink tokens clear 4.5:1 on the surfaces they land on', () => {
    const muted = token('--cuba-ink-muted');
    const ink = token('--cuba-ink');
    assert.ok(contrast(muted, hex('#ffffff')) >= 4.5, '--cuba-ink-muted on white');
    assert.ok(contrast(muted, hex('#f1f5f9')) >= 4.5, '--cuba-ink-muted on #f1f5f9');
    assert.ok(contrast(ink, hex('#ffffff')) >= 4.5, '--cuba-ink on white');
});

test('DIR-023: public marketing surface declares a dark palette', () => {
    // The public site shipped a light-only palette: in dark mode it kept
    // --rp-blue at #1a73e8 (4.31:1 on its own #f8fafd surface) and light-only ink.
    assert.ok(
        /\[data-theme=['"]dark['"]\]\s*\{[\s\S]*--rp-surface-bg\s*:/.test(publicSiteCss),
        'public-site.css must re-declare its palette for dark mode',
    );
    assert.ok(
        /\[data-theme=['"]dark['"]\]\s*\{[\s\S]*--rp-text-body\s*:/.test(publicSiteCss),
        'public-site.css must re-point --rp-text-body for dark mode',
    );
});

test('DIR-023: opacity-modifier surfaces are mapped, not just the bare utility', () => {
    // The auditor proved the bare selector cannot see `bg-white/95` or
    // `bg-slate-50/50`: /dashboard/jobs still painted oklab(0.984 / 0.5) in dark.
    assert.ok(css.includes('.bg-white\\/95'), 'bg-white/95 modifier form must be mapped');
    assert.ok(css.includes('.bg-slate-50\\/50'), 'bg-slate-50/50 modifier form must be mapped');
});

/**
 * PASS 5 REGRESSION: the pastel block mapped the BARE utilities only.
 *
 * Tailwind compiles an opacity modifier to a DIFFERENT class name -- the built
 * bundle proves it emits `.bg-emerald-50\/70 { background-color:#ecfdf5b3 }`, and
 * #ecfdf5 is emerald-50. The doubled bare selector `.bg-emerald-50.bg-emerald-50`
 * therefore cannot match it, so `bg-emerald-50/70` (StepGuide) and
 * `border-emerald-200/90` kept painting a near-white plate on the dark shell.
 *
 * These assertions are derived from a census of src/, so they cannot be
 * satisfied by adding a selector for a class the app never renders.
 */
test('DIR-023: a reproducible source-derived opacity census is non-trivial', () => {
    assert.ok(
        allOpacityClasses.length > 100,
        `expected a real census, got ${allOpacityClasses.length} classes`,
    );
});

test('DIR-023: light-shade opacity fills carry the escaped-slash doubled selector', () => {
    // Spot-checks the exact classes the Lead reported from the live screen.
    for (const cls of [
        'bg-emerald-50\\/70',
        'border-emerald-200\\/90',
        'text-emerald-700\\/90',
        'bg-indigo-50\\/70',
        'border-emerald-200\\/80',
    ]) {
        assert.ok(
            css.includes(`.${cls}.${cls}`),
            `${cls} must use the doubled escaped-slash selector or Tailwind's own `
            + 'class wins and the pastel plate survives',
        );
    }
});

test('DIR-023: EVERY light-shade chromatic opacity class in src/ is mapped', () => {
    // The census is the contract: if a component adds bg-teal-50/60 tomorrow,
    // this fails until the block is regenerated, so the defect cannot reappear.
    const unesc = (s) => s.replace(/\\/g, '');
    const flat = unesc(css);
    const NEUTRAL = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
    const missing = [];
    for (const cls of allOpacityClasses) {
        const v = cls.match(/^(?:(hover|focus|active|disabled|checked):)?(.+)$/);
        const full = v[1] ? `${v[1]}:${v[2]}` : v[2];
        const m = full.match(
            /^(?:[a-z-]+:)?(bg|text|border|ring|divide|from|to|via|placeholder|outline)-([a-z]+)(?:-(\d{1,3}))?\/\d{1,3}$/,
        );
        if (!m) continue;
        const [, prop, fam, shade] = m;
        if (shade !== undefined && +shade > 300) continue;  // dark shades are fine
        if (fam === 'black' && ['bg', 'ring', 'from', 'via', 'to'].includes(prop)) continue; // dark scrim / shadow
        if (['current', 'inherit', 'transparent'].includes(fam)) continue; // context-driven, not a palette hue
        if (fam === 'white' && !['bg', 'border', 'ring', 'divide', 'outline'].includes(prop)) continue;
        if (NEUTRAL.includes(fam)) continue;                // themed NEUTRAL block
        if (!flat.includes(`.${full}.${full}`)) missing.push(cls);
    }
    assert.equal(missing.length, 0, `unmapped light-shade opacity classes: ${missing.join(', ')}`);
});

test('DIR-023: opacity fills never resolve to a light plate in dark mode', () => {
    // Guards the actual failure: a pastel fill is a near-white opaque colour.
    // Every dark-scoped fill in the block must be a translucent tint (rgba with
    // an alpha < 1) or a themed token -- never #ecfdf5-style opaque lightness.
    const seg = css.slice(css.indexOf('OPACITY-MODIFIER dark harmonization'));
    const fillDecls = [...seg.matchAll(/background-color:\s*([^;]+);/g)].map((m) => m[1]);
    assert.ok(fillDecls.length > 0, 'expected fill declarations in the block');
    for (const d of fillDecls) {
        if (/^#[0-9a-f]{3,8}$/i.test(d.trim())) {
            assert.fail(`opaque raw colour in a dark fill: ${d}`);
        }
        if (/^rgba\(/.test(d)) {
            const alpha = parseFloat(d.match(/,\s*([\d.]+)\s*\)/)[1]);
            assert.ok(alpha > 0 && alpha < 1, `fill alpha must be translucent, got ${d}`);
            assert.ok(alpha <= 0.35, `fill alpha must stay inside the measured envelope, got ${d}`);
        }
    }
});

test('DIR-023: dark-mode ink modifiers are dropped, never scaled down', () => {
    // text-*-700/90 fading a dark-mode ink is how it falls under 4.5:1, so the
    // block maps these to the bare ink rather than reproducing the alpha.
    const seg = css.slice(css.indexOf('OPACITY-MODIFIER dark harmonization'));
    const inkDecls = [...seg.matchAll(/^\s{4}color:\s*([^;]+);/gm)].map((m) => m[1]);
    assert.ok(inkDecls.length > 0, 'expected ink declarations in the block');
    for (const d of inkDecls) {
        assert.ok(!/rgba\(|color-mix|transparent/.test(d), `ink must be an opaque hex, got ${d}`);
    }
});

test('DIR-023: the auditor and its manifest are present and wired to npm', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    assert.equal(
        pkg.scripts['audit:contrast'],
        'node .bridge/evidence/universal-contrast-audit.mjs',
        'AC-5 requires the audit:contrast gate',
    );
    const evidence = path.join(process.cwd(), '.bridge', 'evidence');
    for (const file of [
        'universal-contrast-audit.mjs',
        'dir023-route-manifest.mjs',
        'dir023-contrast-engine.mjs',
        'dir023-paint-truth.mjs',
    ]) {
        assert.ok(fs.existsSync(path.join(evidence, file)), `missing ${file}`);
    }
});

test('DIR-023: the engine resolves colours through the browser, not a hand-rolled matrix', () => {
    // dir017 documented a double-gamma oklch bug from hand-rolled OKLab maths.
    // The engine must delegate colour-space resolution to a 1x1 canvas instead.
    const engine = fs.readFileSync(
        path.join(process.cwd(), '.bridge', 'evidence', 'dir023-contrast-engine.mjs'),
        'utf8',
    );
    assert.ok(
        /getContext\('2d'/.test(engine) && /getImageData/.test(engine),
        'the engine must resolve modern colour syntaxes via canvas getImageData',
    );
    assert.ok(
        /0\.2126/.test(engine) && /0\.7152/.test(engine) && /0\.0722/.test(engine),
        'the engine must apply the W3C luminance coefficients',
    );
});