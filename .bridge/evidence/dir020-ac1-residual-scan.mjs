/**
 * DIR-020 AC-1 RESIDUAL SCAN.
 *
 * Proves the two components the directive names no longer carry the legacy
 * palette/palette-adjacent utility classes they used before, and that they are
 * wired to the Cuba Executive tokens instead. A naive "grep for a hex colour"
 * would pass trivially, so this scans for the concrete Tailwind utility families
 * that made up the OLD JobTracker/AppliedJobs styling (slate/teal/indigo/stone
 * text+bg+border+ring utilities) plus any hardcoded hex/rgb colour literal.
 *
 * Exits non-zero if any legacy utility survives in either file.
 */
import fs from 'node:fs/promises';

const FILES = [
    'src/components/AppliedJobs/JobTracker.jsx',
    'src/components/AppliedJobs/AppliedJobs.jsx',
];

// Legacy families used by the pre-DIR-020 list view.
const LEGACY = [
    /\bslate-\d{2,3}\b/, /\bteal-\d{2,3}\b/, /\bindigo-\d{2,3}\b/, /\bstone-\d{2,3}\b/,
    /\bsky-\d{2,3}\b/, /\bcyan-\d{2,3}\b/, /\bemerald-\d{2,3}\b/, /\bviolet-\d{2,3}\b/,
];
const HEX_OR_RGB = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
// Tailwind arbitrary-value colour escapes such as [rgb(37,99,235)].
const ARBITRARY_COLOUR = /\[(rgba?|hsla?)\(/;

const findings = [];
const report = {};

/**
 * Blanks out comments across the WHOLE source while preserving line count and
 * line offsets, so the probe analyses CODE rather than prose and can still
 * report accurate line numbers.
 *
 * Without this, documenting "the legacy `border-t-slate-600` was replaced"
 * makes the scan flag its own explanation as a violation - a false positive
 * that would push future engineers toward deleting correct, useful comments.
 * Note this must run over the full source, not line by line: a multi-line
 * JSX comment cannot be matched by a single-line regex.
 */
function stripComments(source) {
    // Preserve newlines so reported line numbers stay accurate.
    const blank = (match) => match.replace(/[^\n]/g, ' ');
    return source
        .replace(/\/\*[\s\S]*?\*\//g, blank)          // /* ... */ and {/* ... */}
        .replace(/(^|[^:'"])\/\/[^\n]*/g, (match, lead) => lead + blank(match.slice(lead.length)));
}

for (const file of FILES) {
    const source = await fs.readFile(file, 'utf8');
    const code = stripComments(source);
    const lines = code.split('\n');
    const fileFindings = [];

    lines.forEach((line, index) => {
        const legacy = LEGACY.find((pattern) => pattern.test(line));
        const colour = HEX_OR_RGB.test(line) || ARBITRARY_COLOUR.test(line);
        if (legacy || colour) {
            fileFindings.push({
                line: index + 1,
                kind: legacy ? 'legacy-utility' : 'hardcoded-colour',
                text: line.trim().slice(0, 120),
            });
        }
    });

    report[file] = {
        lines: lines.length,
        cubaTokenRefs: (code.match(/--cuba-|cuba-btn-/g) || []).length,
        findings: fileFindings,
    };
    findings.push(...fileFindings.map((finding) => ({ file, ...finding })));
}

console.log(JSON.stringify({ report, findings, failures: findings.length }, null, 2));
process.exit(findings.length ? 1 : 0);