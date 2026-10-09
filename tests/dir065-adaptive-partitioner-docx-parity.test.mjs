/**
 * DIR-065 — 10/10 adaptive smart partitioner (PDF footer overlap) and
 * high-fidelity DOCX<->PDF card parity.
 *
 * Pins the two defects this directive fixes so a future refactor cannot silently
 * reintroduce them:
 *   1. the partitioner charging grid cards as linear text (Projects ~36px) and the
 *      odd card of a row zero, so 5 projects + 5 certifications fast-pathed onto
 *      page 1 while the real DOM overflowed into the page footer; and
 *   2. DOCX projects/certifications rendering as linear entry headers and
 *      borderless bullets instead of the PDF's shaded, bordered 2-column cards.
 *
 * The heavy browser DOM census (real Chromium card-vs-footer geometry) is executed
 * separately by template-lab/census-probe.mjs and archived under template-lab/evidence/dir065/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from '../template-lab/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);

const { partitionResumeContent } = await import(
    new URL('../src/engine/hybrid/smartPartitioner.js', import.meta.url).href
);

test('DIR-065 S1: the partitioner pairs grid rows with Math.max(cardA, cardB) + gap', () => {
    const src = read('src/engine/hybrid/smartPartitioner.js');
    assert.match(src, /pairGridRows/, 'a shared row-paired estimator must exist');
    assert.match(src, /Math\.max\(heightOf\(first\), second \? heightOf\(second\) : 0\) \+ rowGap/,
        'each row must cost the taller card plus the row gap');
    assert.match(src, /GRID_ROW_GAP = 7/, 'the grid row gap must track the CSS 7px row gap');
});

test('DIR-065 S2: calibrated card minimums and dynamic >=36px footer clearance', () => {
    const src = read('src/engine/hybrid/smartPartitioner.js');
    assert.match(src, /PROJECT_CARD_MIN_PX = 65/, 'projects must floor at the measured 65px card');
    assert.match(src, /CERT_ROW_MIN_PX = 76/, 'certifications must floor at the measured 76px card');
    assert.match(src, /FOOTER_SAFETY_CLEARANCE = Math\.max\(36,/, 'the footer clearance must be dynamic and >=36px');
    // The old linear project estimate must be gone.
    assert.doesNotMatch(src, /28 \+ calcTextHeight\(textLen\) \+ \(index === 0 \? 26 : 8\)\s*\n\s*return \{ type: 'project'/,
        'the linear project estimate must be replaced');
});

test('DIR-065 S3: project cards are atomic like certification cards', () => {
    const css = read('src/engine/hybrid/smartEngine.css');
    assert.match(css, /\.smart-card-item\s*\{[\s\S]*?break-inside:\s*avoid/, '.smart-card-item must never split across pages');
    assert.match(css, /\.smart-cert-item\s*\{[\s\S]*?break-inside:\s*avoid/, '.smart-cert-item must never split across pages');
    assert.match(css, /\.smart-page-body\s*\{[\s\S]*?padding-bottom:/, '.smart-page-body needs a footer buffer');
});

test('DIR-065 S4: DOCX renders shaded, bordered project and certification cards', () => {
    const src = read('backend/services/docxExport.js');
    assert.match(src, /const CARD_FILL = 'F8FAFC'/, 'cards must use the #f8fafc fill');
    assert.match(src, /const CARD_BORDER_COLOR = 'E2E8F0'/, 'cards must use the #e2e8f0 border');
    assert.match(src, /function buildProjectCardCell/, 'projects must render as card cells');
    assert.match(src, /function buildCertCardCell/, 'certifications must render as card cells');
    assert.match(src, /shading: \{ fill: CARD_FILL \}/, 'card cells must be shaded');
    assert.match(src, /borders: CARD_BORDERS/, 'card cells must be bordered');
    assert.match(src, /margins: CARD_CELL_MARGINS/, 'card cells must be padded');
});

test('DIR-065 S5: buildModernSplitDocument enables 2-column card mode', () => {
    const src = read('backend/services/docxExport.js');
    const modern = src.slice(src.indexOf('function buildModernSplitDocument'), src.indexOf('function buildExecutiveBannerDocument'));
    assert.match(modern, /buildProjectsBlock\([\s\S]*?contentWidth/, 'modern-split projects must be card tables sized to the column');
    assert.match(modern, /buildCertificationsBlock\([\s\S]*?columns: 2/, 'modern-split certifications must use 2-column card mode');
});

test('DIR-065 S6: the census probe is pure Node with no native console or Windows tooling', () => {
    const src = read('template-lab/census-probe.mjs');
    assert.match(src, /smart-card-item, \.smart-cert-item/, 'the census must measure grid cards');
    assert.match(src, /smart-page-footer/, 'the census must compare against the page footer');
    assert.doesNotMatch(src, /child_process|execSync|execFileSync|spawn\(|detached:\s*true|winget|powershell/i,
        'the census must not spawn OS processes, native consoles or Windows tooling');
});

// ── Functional assertions (real module output, not just source text) ─────────

test('DIR-065 S1 (functional): a row is charged the TALLER card, not the row-start card', () => {
    const shortCert = { title: 'CCRN', issuer: 'AACN', date: '2018' };
    const tallCert = {
        title: 'A Very Long Certification Title That Wraps Across Several Lines In The Card',
        issuer: 'Long Issuer Name Institute',
        date: '2020',
    };
    const result = partitionResumeContent(
        { firstname: 'Babu', lastname: 'M', certifications: [shortCert, tallCert] },
        { archetype: 'minimal-ats', density: 'standard' }
    );
    const items = result.pages.flatMap((p) => p.flowItems).filter((i) => i.type === 'certification');
    const rowStart = items.find((i) => i.rowStart);
    const partner = items.find((i) => !i.rowStart);
    assert.ok(rowStart, 'the row-start card must exist');
    assert.ok(partner, 'the partner card must exist');
    assert.equal(partner.estHeight, 0, 'the partner card shares its row height');
    // Short card = 76px, tall card clamps at 88px, row gap = 7px, title margin = 28px.
    // The old estimator charged only the row-start card (76 + 7 = 83); the fix must
    // charge the taller partner instead.
    assert.ok(rowStart.estHeight >= 88 + 7,
        `the row must be charged the taller card (>=95px), got ${rowStart.estHeight}`);
});

test('DIR-065 S2 (functional): the 5+5 grid profile spills onto page 2, not the footer', () => {
    const result = partitionResumeContent({ ...FIXTURES.gridDense }, { archetype: 'minimal-ats', density: 'standard' });
    assert.ok(result.totalPages >= 2,
        `the tight 5-project + 5-certification profile must spill onto page 2, got ${result.totalPages} page(s)`);
    const flow = result.pages.flatMap((p) => p.flowItems);
    for (const item of flow.filter((i) => i.type === 'project' && i.rowStart)) {
        assert.ok(item.estHeight >= 65, `project row must reserve >=65px, got ${item.estHeight}`);
    }
    for (const item of flow.filter((i) => i.type === 'certification' && i.rowStart)) {
        assert.ok(item.estHeight >= 76, `cert row must reserve >=76px, got ${item.estHeight}`);
    }
    // The overflow page must carry real grid cards (never a blank page).
    const later = result.pages.slice(1).flatMap((p) => p.flowItems);
    assert.ok(later.some((i) => i.type === 'project' || i.type === 'certification'),
        'the overflow page must carry grid cards');
});

test('DIR-065 S4 (functional): DOCX emits shaded, bordered cards for the grid profile', async () => {
    const { createResumeDocx } = require(path.join(ROOT, 'backend', 'services', 'docxExport.js'));
    const JSZip = require(path.join(ROOT, 'backend', 'node_modules', 'jszip'));
    const buffer = await createResumeDocx({ ...FIXTURES.gridDense, template: 'Cv1' });
    const archive = await JSZip.loadAsync(buffer);
    const xml = await archive.file('word/document.xml').async('string');
    assert.match(xml, /w:fill="F8FAFC"/i, 'cards must be shaded #f8fafc');
    assert.match(xml, /w:color="E2E8F0"/i, 'cards must be bordered #e2e8f0');
    const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((n) => n.replace(/<[^>]+>/g, '')).join(' ');
    assert.match(text, /Clinical Quality Initiative 5/, 'the 5th project must survive into the DOCX');
    assert.match(text, /TNCC/, 'the 5th certification must survive into the DOCX');
    // A 2-column EQUAL-width card table must exist (distinct from the 34/66 sidebar split).
    const grids = [...xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)]
        .map((m) => [...m[1].matchAll(/w:w="(\d+)"/g)].map((c) => Number(c[1])));
    assert.ok(grids.some((cols) => cols.length === 2 && cols[0] === cols[1]),
        'a 2-column equal-width card table must exist');
});

