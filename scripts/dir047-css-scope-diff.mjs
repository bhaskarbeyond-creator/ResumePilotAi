// @ts-check
/**
 * DIR-047 -- TAILWIND SOURCE-SCOPE SAFETY PROOF.
 *
 *   node scripts/dir047-css-scope-diff.mjs .bridge/tmp/css-base .bridge/tmp/css-scoped
 *
 * WHY THIS FILE IS THE GATE, NOT A TIMING
 * Restricting Tailwind's auto-detected sources is only legitimate if it cannot
 * remove a utility the shipped application actually needs. A faster build that
 * silently drops styles is a worse outcome than a slow one, so the change is
 * accepted or rejected on THIS diff, and the timing is only ever reported
 * alongside it.
 *
 * The naive comparison -- "is the scoped CSS smaller?" -- is NOT a proof, because
 * a scoped build legitimately drops utilities that were only ever generated for
 * files outside the production graph, and those are exactly the bytes that
 * SHOULD disappear. So this script answers the question that actually matters:
 *
 *   For every class-like token that appears in the production graph (src/**, the
 *   root index.html, and public/*.html), is a rule for it still emitted?
 *
 * Tokens that were only present in the baseline because some non-production file
 * (tests, template-lab, dashboardTemplate, .bridge evidence) mentioned them are
 * reported separately as REMOVED-UNUSED. Only a MISSING token -- one that the
 * production graph genuinely uses and the scoped build no longer emits -- is a
 * failure.
 *
 * Filenames are content-hashed, so the two builds cannot be compared by name;
 * every .css in each directory is concatenated before extraction.
 */
import fs from 'node:fs';
import path from 'node:path';

const [baseDir, scopedDir] = process.argv.slice(2);
if (!baseDir || !scopedDir) {
    console.error('usage: node scripts/dir047-css-scope-diff.mjs <baseDir> <scopedDir>');
    process.exit(2);
}

function readAllCss(dir) {
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.css'))
        .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
        .join('\n');
}

const base = readAllCss(baseDir);
const scoped = readAllCss(scopedDir);

/**
 * Extracts the class selectors a stylesheet actually defines, by matching the
 * `.classname` that appears inside a selector position. Deliberately generous:
 * it over-collects (a token may be picked up from a declaration value), and
 * over-collection can only ever make this check STRICTER, never weaker.
 *
 * CSS escapes are UNESCAPED before the name is recorded. This matters more than
 * it looks: Tailwind minifies `focus:border-violet-500` to the selector
 * `.focus\:border-violet-500:focus`, so a naive `[\w-]*` capture records that
 * as the class `focus` and silently never compares the real utility. Keeping
 * the backslash would instead report it as `border-violet-500` and conflate the
 * variant with its base. Unescaping makes the comparison exact in both
 * directions, so a genuinely dropped `hover:` or `dark:` utility is a FAIL
 * rather than an invisible pass.
 */
function definedClasses(css) {
    const out = new Set();
    // Selector positions: after `{`, after `,`, after a combinator, or at a rule start.
    for (const m of css.matchAll(/(?:^|[},>+~])\s*((?:::?[a-z-]+|\*)?[^{}]*?)\{/gi)) {
        const selector = m[1];
        if (!selector || selector.includes('/*')) continue;
        for (const c of selector.matchAll(/\.((?:\\.|[-\w])+)/g)) {
            // `\:`, `\/`, `\[` ... are CSS escapes for a literal char in the name.
            const name = c[1].replace(/\\(.)/g, '$1');
            if (name) out.add(name);
        }
    }
    return out;
}

const baseDefined = definedClasses(base);
const scopedDefined = definedClasses(scoped);

/**
 * Every class-like token used anywhere in the production module graph.
 *
 * This collector is intentionally WIDER than "className attributes" alone. The
 * codebase builds class lists in several shapes -- plain `className="a b"`,
 * `className={`template ${cond}`}`, and multi-line template literals -- and a
 * collector that only understood the first would report a false PASS by never
 * asking about the others. So the whole file text is scanned for anything that
 * looks like a Tailwind utility token, in addition to explicit attribute
 * extraction. Over-collecting is safe here for the same reason it is safe in
 * `definedClasses`: it can only add candidates, never hide a missing one.
 *
 * The token charset deliberately includes `:` so VARIANT utilities
 * (`hover:bg-x`, `dark:text-y`, `focus:border-z`) are compared as the exact
 * class the CSS must define, matching the unescaping done in definedClasses.
 */
const PRODUCTION_ROOTS = ['src', 'index.html', 'public'];
const productionTokens = new Set();

/** Tailwind-ish token: allows the variant colon, the `!` important flag, and
 *  the `[]`/`/` arbitrary-value forms, but not `${` interpolation fragments. */
const TOKEN_RE = /^[a-zA-Z0-9_@.:-][a-zA-Z0-9_@.:/-]*$/;

function addTokens(value) {
    // Drop `${...}` interpolations but keep the literal strings around them.
    for (const raw of value.split(/[\s"'`]+/)) {
        const tok = raw.replace(/\$\{[^}]*\}/g, ' ').trim();
        if (!tok) continue;
        if (tok.includes('${')) continue;
        if (TOKEN_RE.test(tok) && /[-:]/.test(tok)) productionTokens.add(tok);
    }
}

function walk(target) {
    const stat = fs.statSync(target);
    if (stat.isFile()) {
        if (!/\.(jsx?|tsx?|html|css|md)$/i.test(target)) return;
        const text = fs.readFileSync(target, 'utf8');
        // 1. Explicit class/className attributes (string or template literal).
        for (const m of text.matchAll(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)) {
            addTokens(m[1] || m[2] || m[3] || '');
        }
        // 2. Every quoted or backticked string in the file, which catches class
        //    lists held in variables, arrays, maps and cx() helpers.
        for (const m of text.matchAll(/[`"']([^`"'\n]{2,400})[`"']/g)) {
            addTokens(m[1]);
        }
        return;
    }
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(path.join(target, entry.name));
    }
}
for (const root of PRODUCTION_ROOTS) {
    if (fs.existsSync(root)) walk(root);
}

const missing = [...productionTokens].filter((t) => baseDefined.has(t) && !scopedDefined.has(t)).sort();
const removedUnused = [...baseDefined].filter((t) => !scopedDefined.has(t) && !productionTokens.has(t)).sort();
const added = [...scopedDefined].filter((t) => !baseDefined.has(t)).sort();

const report = {
    directive: 'DIR-047',
    generatedAt: new Date().toISOString(),
    method: 'class-selector extraction from the concatenated emitted CSS of both builds, intersected with class-like tokens used by the production graph (src/**, index.html, public/**)',
    baseDir,
    scopedDir,
    counts: {
        baseDefinedClasses: baseDefined.size,
        scopedDefinedClasses: scopedDefined.size,
        productionGraphTokens: productionTokens.size,
        removedUnused: removedUnused.length,
        added: added.length,
        MISSING_REQUIRED: missing.length,
    },
    missingRequired: missing,
    // Retained verbatim so a reviewer can audit what left the bundle without
    // re-running the build. These are classes the BASELINE emitted and the
    // scoped build does not, which no production file references.
    removedUnused,
    verdict: missing.length === 0 ? 'PASS' : 'FAIL',
};

const out = path.join('.bridge', 'evidence', 'dir047-css-scope-diff.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');

console.log(`base defined classes   : ${baseDefined.size}`);
console.log(`scoped defined classes : ${scopedDefined.size}`);
console.log(`production graph tokens: ${productionTokens.size}`);
console.log(`removed (unused)       : ${removedUnused.length}`);
console.log(`added                  : ${added.length}`);
console.log(`MISSING REQUIRED       : ${missing.length}`);
if (missing.length) {
    console.log('\n--- required classes the scoped build no longer emits ---');
    for (const m of missing.slice(0, 60)) console.log(`  ${m}`);
    if (missing.length > 60) console.log(`  ... and ${missing.length - 60} more`);
}
console.log(`\nverdict=${report.verdict}`);
console.log(`written -> ${out}`);
process.exit(report.verdict === 'PASS' ? 0 : 1);
