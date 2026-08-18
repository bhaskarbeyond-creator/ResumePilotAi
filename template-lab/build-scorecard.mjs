/**
 * Builds the final 51-template scorecard from collected forensic evidence.
 * Consumes the matrices written by senior-forensics.mjs, print-probe.mjs,
 * overflow-probe.mjs, visual-twins.mjs and the DOCX OOXML audit.
 *
 * Usage: node template-lab/build-scorecard.mjs > SCORECARD.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'evidence', 'senior');
const readJson = (file, fallback = null) => {
    const full = path.join(DIR, file);
    return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8')) : fallback;
};

const IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);
const matrixFile = fs.readdirSync(DIR).filter((f) => f.startsWith('matrix-') && f.includes('technical')).sort().pop();
const matrix = readJson(matrixFile, { results: [] });
const printRows = readJson('print-normal.json', []);
const twins = readJson('visual-twins-normal.json', { pairs: [] });
const docxAudit = readJson('docx/ooxml-audit.json', []);
const previewDir = path.resolve(__dirname, '..', 'src', 'assets', 'resumesNew');

const overflow = {};
for (const file of fs.readdirSync(DIR).filter((f) => f.startsWith('overflow-'))) {
    const fixture = file.replace('overflow-', '').replace('.json', '');
    overflow[fixture] = readJson(file, []);
}

const byTemplate = {};
for (const r of matrix.results) (byTemplate[r.template] = byTemplate[r.template] || []).push(r);

const twinIds = new Set();
for (const p of twins.pairs || []) {
    if (p.structural < 0.06 && p.colour < 0.02) { twinIds.add(p.a); twinIds.add(p.b); }
}

const rows = [];
for (const id of IDS) {
    const runs = byTemplate[id] || [];
    const normal = runs.find((r) => r.fixture === 'normal');
    const print = printRows.find((r) => r.template === id);
    const docx = docxAudit.find((r) => r.id === id);
    const previewFile = path.join(previewDir, `${id}.JPG`);
    const previewOk = fs.existsSync(previewFile) && (() => {
        const b = fs.readFileSync(previewFile);
        return b[0] === 0xff && b[1] === 0xd8 && b.length > 50_000 && b.length < 400_000;
    })();

    const clipped = Object.values(overflow).some((rowsForFixture) => {
        const row = rowsForFixture.find((r) => r.template === id);
        return row && row.pages.some((p) => p.cutCount > 0);
    });

    const problems = runs.flatMap((r) => r.problems || []);
    const pdfOk = runs.every((r) => r.pdf && r.dom && r.pdf.pageCount === r.dom.pageCount);
    const a4Ok = runs.every((r) => !r.pdf || r.pdf.mediaBoxes.every((b) => Math.abs(b[2] - 594.96) < 1.5 && Math.abs(b[3] - 841.92) < 1.5));

    const scoreParts = [
        problems.length === 0,        // render/browser
        !clipped,                     // content preservation
        pdfOk && a4Ok,                // pdf
        Boolean(print && print.problems.length === 0), // print
        previewOk,                    // preview
        Boolean(docx),                // docx
        !twinIds.has(id),             // visual identity
    ];
    const score = Math.round((scoreParts.filter(Boolean).length / scoreParts.length) * 100) / 10;

    rows.push({
        id,
        archetype: normal?.dom?.layoutClass?.includes('modern-split') ? (normal.dom.layoutClass.includes('reverse') ? 'modern-split (reverse)' : 'modern-split')
            : normal?.dom?.layoutClass?.includes('executive-banner') ? 'executive-banner'
                : normal?.dom?.layoutClass?.includes('compact-euro') ? 'compact-euro'
                    : normal?.dom?.layoutClass?.includes('minimal-ats') ? 'minimal-ats' : '?',
        columns: normal?.dom?.columns ?? '?',
        sidebar: normal?.dom?.sidebar ? `${normal.dom.sidebar.widthPct}% ${normal.dom.sidebar.position}` : '—',
        main: normal?.dom?.main ? `${normal.dom.main.widthPct}%` : '100%',
        primary: normal?.dom?.rootVars?.primary || '',
        renders: `${runs.filter((r) => (r.problems || []).length === 0).length}/${runs.length}`,
        pdf: pdfOk && a4Ok ? 'PASS' : 'FAIL',
        print: print ? (print.problems.length ? 'FAIL' : 'PASS') : 'n/a',
        preview: previewOk ? 'PASS' : 'FAIL',
        docx: docx ? `PASS (${docx.tables} tbl)` : 'n/a',
        clipped: clipped ? 'YES' : 'none',
        twin: twinIds.has(id) ? 'TWIN' : 'unique',
        score,
    });
}

const header = '| Template | Archetype | Cols | Sidebar | Main | Renders (10 profiles) | PDF | Print | Preview | DOCX | Clipped | Visual identity | Score |';
const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
console.log(header);
console.log(sep);
for (const r of rows) {
    console.log(`| ${r.id} | ${r.archetype} | ${r.columns} | ${r.sidebar} | ${r.main} | ${r.renders} | ${r.pdf} | ${r.print} | ${r.preview} | ${r.docx} | ${r.clipped} | ${r.twin} | ${r.score.toFixed(1)}/10 |`);
}
const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
console.log(`\nTemplates scoring 10.0: ${rows.filter((r) => r.score === 10).length}/51 — average ${avg.toFixed(2)}/10`);
console.log(`Exact pixel duplicates: ${(twins.pairs || []).filter((p) => p.exact).length}`);
console.log(`Visual twins: ${twinIds.size ? [...twinIds].join(', ') : 0}`);
