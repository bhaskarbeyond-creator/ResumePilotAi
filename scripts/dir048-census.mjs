#!/usr/bin/env node
/**
 * DIR-048 missing-options / defect census.
 *
 * WHY THIS EXISTS
 *   The directive's gate is "zero native dialogs, zero Invalid Date, zero dead
 *   controls". A gate that is only asserted inside a Playwright run can be
 *   satisfied by never visiting the offending route. This script scans the
 *   SOURCE instead, so the census is exhaustive rather than sampled, and it is
 *   the same scan the static sentinel test enforces.
 *
 * WHAT IT REPORTS
 *   1. native-dialogs  — window.alert / window.confirm / window.prompt and the
 *                        bare global forms, anywhere under src/
 *   2. invalid-date    — literal "Invalid date"/"Invalid Date" render strings
 *   3. dead-buttons    — <button> JSX openings with no onClick / type=submit /
 *                        form action in the same element (heuristic, reported
 *                        for human review, never auto-failed)
 *
 * Exit code 1 only when a HARD rule (1 or 2) still has hits. Rule 3 is
 * advisory: a JSX heuristic cannot prove intent, so it never fails a build.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src');

const NATIVE_DIALOG = /window\s*\.\s*(alert|confirm|prompt)\s*\(|(?<![.\w'"$])(alert|confirm|prompt)\s*\(/;
const INVALID_DATE = /['"`>]Invalid [Dd]ate/;
const BUTTON_OPEN = /<button\b/;
const HAS_HANDLER = /onClick|onPointerDown|onMouseDown|type=["']submit["']|htmlFor|formAction/;

/**
 * Comment detection covers line comments, block-comment continuations AND JSX
 * comments (the brace + slash + star form), so documentation ABOUT the ban is
 * never counted as a violation of it. A JSX comment opener is missed by a plain
 * line/block comment test, which is why it is listed explicitly below.
 *
 * NOTE: this comment deliberately spells out the JSX opener in words. Writing the
 * literal characters would close this block comment early and break the module.
 */
const isCommentLine = (line) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line);

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (/\.(jsx|js)$/.test(entry.name)) {
            yield full;
        }
    }
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

const findings = { 'native-dialogs': [], 'invalid-date': [], 'dead-buttons': [] };

for (const file of walk(TARGET)) {
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
        const at = `${rel(file)}:${index + 1}`;
        if (!isCommentLine(line)) {
            // Cuba's own promise-based hooks ARE the replacement for the native
            // dialogs and are always awaited, so `await prompt({...})` and
            // `await confirm({...})` must never be counted as violations — doing
            // so would punish the fix instead of the defect.
            const dialogLine = line.replace(/\bawait\s+(confirm|prompt)\s*\(/g, 'cuba$1(');
            if (NATIVE_DIALOG.test(dialogLine)) findings['native-dialogs'].push(`${at}: ${line.trim().slice(0, 160)}`);
            if (INVALID_DATE.test(line)) findings['invalid-date'].push(`${at}: ${line.trim().slice(0, 160)}`);
        }
        if (BUTTON_OPEN.test(line) && !HAS_HANDLER.test(line)) {
            // Look ahead: a JSX attribute may sit on the following lines.
            const window = lines.slice(index, index + 6).join(' ');
            if (!HAS_HANDLER.test(window)) findings['dead-buttons'].push(`${at}: ${line.trim().slice(0, 160)}`);
        }
    });
}

const hard = ['native-dialogs', 'invalid-date'];
console.log('=== DIR-048 CENSUS (src/) ===');
for (const [rule, hits] of Object.entries(findings)) {
    const tag = hard.includes(rule) ? 'HARD' : 'ADVISORY';
    console.log(`\n[${tag}] ${rule}: ${hits.length} hit(s)`);
    hits.forEach((hit) => console.log(`  - ${hit}`));
}

const hardHits = hard.reduce((total, rule) => total + findings[rule].length, 0);
console.log(`\n=== HARD RULE VIOLATIONS: ${hardHits} ===`);
process.exit(hardHits > 0 ? 1 : 0);
