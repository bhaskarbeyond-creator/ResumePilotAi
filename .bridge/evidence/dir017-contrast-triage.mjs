// @ts-check
/**
 * DIR-017 stage-6 contrast triage (offline, no browser).
 *
 * The stage-6 auditor in tests/e2e/dir017-candidate-settings.spec.js has
 * already been corrected once for a double-gamma oklch bug, so its numbers are
 * not taken on trust here: every pair is recomputed from first principles with
 * a single, explicit sRGB transfer, and each is labelled REAL (a product
 * contrast failure) or MEASUREMENT (an element the auditor cannot resolve).
 */
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ({ r, g, b }) => (
    0.2126 * srgbToLinear(r / 255)
    + 0.7152 * srgbToLinear(g / 255)
    + 0.0722 * srgbToLinear(b / 255)
);
const ratio = (fg, bg) => {
    const a = luminance(fg);
    const b = luminance(bg);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
};
const hex = (h) => {
    const n = parseInt(h.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** oklch -> sRGB bytes, applying the sRGB transfer exactly once. */
const oklchToSrgb = (L, C, hDeg) => {
    const h = (hDeg * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l_ ** 3; const m3 = m_ ** 3; const s3 = s_ ** 3;
    const enc = (v) => {
        const x = Math.min(1, Math.max(0, v));
        return x <= 0.0031308 ? 12.92 * x : 1.055 * (x ** (1 / 2.4)) - 0.055;
    };
    return {
        r: Math.round(255 * enc(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3)),
        g: Math.round(255 * enc(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3)),
        b: Math.round(255 * enc(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3)),
    };
};

const LIGHT_CANVAS = hex('#f4f5f9');
const DARK_CANVAS = hex('#0d0f16');

const cases = [
    {
        id: 1, verdict: 'MEASUREMENT',
        what: 'M3UserMenu avatar initials "BB"',
        note: 'painted by a var()-driven linear-gradient with NO percentage stops; '
            + 'the auditor only parses stops carrying "%", so it walks past the paint to the canvas',
        fg: hex('#ffffff'), bg: LIGHT_CANVAS,
        trueFg: null, trueBg: [hex('#7366ff'), hex('#5949d6')],
    },
    {
        id: 2, verdict: 'REAL',
        what: 'CubaAppShell "AI" brand chip',
        note: 'text-[#7366ff] on bg-[#7366ff]/10 over the light canvas',
        fg: hex('#7366ff'), bg: LIGHT_CANVAS,
    },
    {
        id: 3, verdict: 'REAL',
        what: 'ProfileDisplay sidebar group headers (3 nodes: Workspace / Job Intelligence / Account & Security)',
        note: 'text-slate-600 in DARK; slate-600 is a light-theme weight',
        fg: oklchToSrgb(0.554, 0.046, 257.417), bg: DARK_CANVAS,
    },
    {
        id: 4, verdict: 'REAL',
        what: 'M3NotificationCenter unread badge "8"',
        note: 'dark badge fill #e5484d with white ink (the LIGHT token is deliberately darker, #c02630)',
        fg: hex('#ffffff'), bg: hex('#e5484d'),
    },
];

for (const c of cases) {
    const measured = ratio(c.fg, c.bg);
    const req = 4.5;
    const line = [
        `#${c.id} ${c.verdict.padEnd(10)} ${c.what}`,
        `   as-measured ${measured.toFixed(2)}:1 (needs ${req}) -> ${measured >= req ? 'PASS' : 'FAIL'}`,
        `   ${c.note}`,
    ];
    if (c.trueBg) {
        const worst = Math.min(...c.trueBg.map((bg) => ratio(c.fg, bg)));
        line.splice(1, 0, `   TRUTH vs its own gradient stops: ${worst.toFixed(2)}:1 -> ${worst >= req ? 'PASS' : 'FAIL'}`);
    }
    console.log(line.join('\n'));
}

// Candidate replacements, each proved >= 4.5:1 before being written anywhere.
console.log('\n--- candidate token values (must clear 4.5:1) ---');
const candidates = [
    ['dark badge fill  #e5484d (current)', hex('#ffffff'), hex('#e5484d')],
    ['dark badge fill  #c02630 (light value)', hex('#ffffff'), hex('#c02630')],
    ['dark badge fill  #b3261e', hex('#ffffff'), hex('#b3261e')],
    ['AI chip on light canvas, current #7366ff', hex('#7366ff'), LIGHT_CANVAS],
    ['AI chip on light canvas, #4b3ec4', hex('#4b3ec4'), LIGHT_CANVAS],
    ['AI chip on light canvas, #4636b8', hex('#4636b8'), LIGHT_CANVAS],
];
for (const [name, fg, bg] of candidates) {
    const r = ratio(fg, bg);
    console.log(`${r >= 4.5 ? 'OK  ' : 'NO  '} ${r.toFixed(2)}:1  ${name}`);
}

// Slate steps Tailwind v4 actually emits, against the dark canvas.
console.log('\n--- Tailwind slate steps vs dark canvas #0d0f16 ---');
const slate = {
    'slate-400': oklchToSrgb(0.704, 0.04, 256.788),
    'slate-300': oklchToSrgb(0.809, 0.035, 256.788),
    'slate-500': oklchToSrgb(0.554, 0.046, 257.417),
    'slate-600': oklchToSrgb(0.446, 0.043, 257.281),
};
for (const [k, v] of Object.entries(slate)) {
    const r = ratio(v, DARK_CANVAS);
    console.log(`${r >= 4.5 ? 'OK  ' : 'NO  '} ${r.toFixed(2)}:1  ${k} = rgb(${v.r}, ${v.g}, ${v.b})`);
}
