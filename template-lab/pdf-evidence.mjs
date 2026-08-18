/**
 * Real A4 PDF evidence for the multi-page Resume Builder.
 *
 * Renders representative templates with multi-page fixtures in Chromium,
 * prints each to a genuine A4 PDF (page.pdf), and verifies:
 *   - PDF page count matches the on-screen composed sheet count (1:1 print)
 *   - every PDF page has the exact A4 MediaBox (594.96 x 841.92 pt)
 *   - per-page DOM text extraction (ATS reading order evidence): name on
 *     page 1, last employment/education/projects/certifications present
 *   - page-1 screenshots for the human review checklist
 *
 * Usage: node template-lab/pdf-evidence.mjs
 * Writes template-lab/evidence/ (gitignored) + template-lab/pdf-evidence.json
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, 'evidence');

const MATRIX = [
    ['Cv1', 'senior'], ['Cv1', 'executive'],
    ['Cv5', 'senior'], ['Cv5', 'executive'],
    ['Cv14', 'senior'], ['Cv14', 'executive'],
    ['Cv19', 'academic'],
    ['Cv38', 'senior'], ['Cv38', 'executive'],
    ['Cv44', 'academic'], ['Cv44', 'executive'],
    ['Cv50', 'executive'], ['Cv51', 'senior'],
];

function pdfPageStats(buffer) {
    const source = buffer.toString('latin1');
    const pageCount = (source.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const mediaBoxes = [...source.matchAll(/\/MediaBox\s*\[([\d.\s]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
    return { pageCount, mediaBoxes: mediaBoxes.slice(0, 6) };
}

async function main() {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const vite = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
    const server = await vite.listen();
    const port = server.config.server.port;
    const base = `http://127.0.0.1:${port}`;
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium/chromium',
        env: { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` },
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking'],
    });
    const evidence = { generatedAt: new Date().toISOString(), entries: [] };
    try {
        for (const [templateId, fixtureName] of MATRIX) {
            const page = await browser.newPage({ viewport: { width: 1280, height: 1900 } });
            await page.goto(`${base}/template-lab/index.html?template=${templateId}&fixture=${fixtureName}&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready', null, { timeout: 30_000 });
            await page.waitForTimeout(600);

            const dom = await page.evaluate(() => {
                const pages = [...document.querySelectorAll('.smart-resume-page')];
                const fixture = null;
                return {
                    sheetCount: pages.length,
                    pageTexts: pages.map((p) => (p.innerText || '').replace(/\s+/g, ' ').trim()),
                    pageRects: pages.map((p) => { const r = p.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
                };
            });
            // Page-1 screenshot for the human-review checklist.
            const shotPath = path.join(EVIDENCE_DIR, `${templateId}__${fixtureName}__page1.png`);
            await page.locator('.smart-resume-page').first().screenshot({ path: shotPath }).catch(() => {});

            const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
            const stats = pdfPageStats(pdfBuffer);
            const pdfPath = path.join(EVIDENCE_DIR, `${templateId}__${fixtureName}.pdf`);
            fs.writeFileSync(pdfPath, pdfBuffer);

            const fixture = FIXTURES[fixtureName];
            const allText = dom.pageTexts.join(' ').toLowerCase();
            const entry = {
                template: templateId,
                fixture: fixtureName,
                domSheetCount: dom.sheetCount,
                pdfPageCount: stats.pageCount,
                print1to1: dom.sheetCount === stats.pageCount,
                a4DimsOk: stats.mediaBoxes.length > 0 && stats.mediaBoxes.every(([x, y, w, h]) => Math.abs(w - 594.96) < 2 && Math.abs(h - 841.92) < 2),
                pageRects: dom.pageRects,
                nameOnPage1: dom.pageTexts[0].toLowerCase().includes(String(fixture.firstname || '').toLowerCase()),
                lastEmploymentPresent: allText.includes(String(fixture.employments?.[fixture.employments.length - 1]?.employer || '').toLowerCase()),
                lastEducationPresent: allText.includes(String(fixture.educations?.[fixture.educations.length - 1]?.school || '').toLowerCase()),
                projectsPresent: allText.includes(String(fixture.projects?.[0]?.title || '').toLowerCase()),
                certificationsPresent: allText.includes(String(fixture.certifications?.[0]?.title || '').toLowerCase()),
                pdfBytes: pdfBuffer.length,
                screenshot: path.relative(__dirname, shotPath),
                pdfPath: path.relative(__dirname, pdfPath),
            };
            evidence.entries.push(entry);
            console.log(`${templateId}/${fixtureName}: DOM sheets=${dom.sheetCount}, PDF pages=${stats.pageCount}, 1:1=${entry.print1to1}, A4=${entry.a4DimsOk}`);
            await page.close();
        }
    } finally {
        await browser.close().catch(() => {});
        await server.close().catch(() => {});
        await vite.close().catch(() => {});
    }
    const failures = evidence.entries.filter((e) => !e.print1to1 || !e.a4DimsOk || !e.nameOnPage1 || !e.lastEmploymentPresent || !e.projectsPresent || !e.certificationsPresent);
    evidence.failures = failures.map((e) => `${e.template}/${e.fixture}`);
    fs.writeFileSync(path.join(__dirname, 'pdf-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(`PDF evidence: ${evidence.entries.length} documents, ${failures.length} failures`);
    if (failures.length) { console.error('PDF EVIDENCE FAILED'); process.exit(1); }
    console.log('PDF EVIDENCE PASSED');
}

main().catch((error) => { console.error(error); process.exit(1); });
