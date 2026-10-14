// Isolated rendering/output audit, NOT an authenticated download journey.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import docx from '../backend/services/docxExport.js';
import { candidateBrowserOptions } from './helpers/candidate-browser-runtime.mjs';
import { ALL_TEMPLATE_IDS, FIXTURES } from '../template-lab/fixtures.js';

const output = 'artifacts/candidate-audit-20261014/templates';
await fs.mkdir(output, { recursive: true });
const server = await createServer({ cacheDir: 'node_modules/.vite-candidate-templates', server: { host: '0.0.0.0', port: 0 }, logLevel: 'error' });
let browser, runtime;
const results = [];
try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    runtime = await candidateBrowserOptions();
    browser = await chromium.launch(runtime.options);
    const queue = ALL_TEMPLATE_IDS.flatMap(template => ['normal', 'minimal', 'long', 'unicode'].map(fixture => ({ template, fixture })));
    async function worker() {
        const context = await browser.newContext({ viewport: { width: 1024, height: 1000 } });
        await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        const page = await context.newPage();
        let errors = [];
        let diagnostics = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
        page.on('requestfailed', request => { if (request.url().startsWith(base)) diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`); });
        while (queue.length) {
            const { template, fixture } = queue.shift();
            const result = { template, fixture, mode: 'SIMULATED fixture; real production renderer', status: 'FAIL' };
            errors = []; diagnostics = [];
            try {
                await page.goto(`${base}/template-lab/index.html?template=${template}&fixture=${fixture}&lang=en`);
                await page.waitForFunction(() => document.documentElement.dataset.labState === 'ready' && !document.querySelector('.resume-scratch'), null, { timeout: 30000 });
                await page.evaluate(() => document.fonts.ready);
                // Require a stable composed DOM, not just the lab's early onReady callback.
                await page.waitForFunction(() => {
                    const signature = document.getElementById('lab-root').innerText + document.getElementById('lab-root').scrollHeight;
                    if (window.auditSignature !== signature) { window.auditSignature = signature; window.auditStable = performance.now(); return false; }
                    return performance.now() - window.auditStable > 800 && !document.querySelector('.resume-scratch');
                });
                assert.equal(await page.locator('[data-lab-crash]').count(), 0, `Template error boundary: ${diagnostics.join('; ')}`);
                assert.deepEqual(errors, []);
                const text = await page.locator('#lab-root').innerText();
                assert.ok(text.includes(FIXTURES[fixture].firstname), 'candidate name missing from rendered document');
                assert.ok(!/\b(?:undefined|NaN)\b/.test(text), 'invalid placeholder in document');
                result.characters = text.length;
                result.domPages = await page.locator('.smart-resume-page').count();
                if (template.startsWith('Cv')) assert.ok(result.domPages > 0, 'missing composed page');
                if (fixture === 'normal') {
                    await page.screenshot({ path: `${output}/${template}.png`, fullPage: true });
                    const pdf = await page.pdf({ path: `${output}/${template}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
                    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
                    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
                    const document = await task.promise;
                    result.pdfPages = document.numPages;
                    let pdfText = '';
                    for (let number = 1; number <= document.numPages; number++) {
                        const pdfPage = await document.getPage(number);
                        pdfText += (await pdfPage.getTextContent()).items.map(item => item.str).join(' ');
                    }
                    await task.destroy();
                    assert.ok(pdfText.includes(FIXTURES.normal.firstname), 'candidate name missing from parsed PDF');
                    result.pdfTextCharacters = pdfText.length;
                    if (template.startsWith('Cv')) {
                        const buffer = await docx.createResumeDocx({ ...FIXTURES.normal, template, resumeName: template });
                        await fs.writeFile(`${output}/${template}.docx`, buffer);
                        const zip = await JSZip.loadAsync(buffer);
                        const xml = await zip.file('word/document.xml').async('string');
                        assert.ok(xml.includes(FIXTURES.normal.firstname), 'candidate name missing from DOCX');
                        assert.ok(xml.includes('Meridian Financial Systems'), 'employment missing from DOCX');
                        result.docxBytes = buffer.length;
                    } else result.docx = 'NOT TESTED: cover-specific DOCX contract not established';
                }
                result.status = 'PASS';
            } catch (error) {
                result.error = error.message; result.diagnostics = diagnostics;
                await page.screenshot({ path: `${output}/${template}-${fixture}-failure.png`, fullPage: true });
            }
            results.push(result);
            console.log(`${result.status} ${template}/${fixture}${result.error ? ': ' + result.error : ''}`);
        }
        await context.close();
    }
    await Promise.all(Array.from({ length: 3 }, worker));
} finally {
    await browser?.close(); await runtime?.cleanup(); await server.close();
    results.sort((a, b) => a.template.localeCompare(b.template, undefined, { numeric: true }) || a.fixture.localeCompare(b.fixture));
    await fs.writeFile(`${output}/manifest.json`, JSON.stringify({ limitations: 'No real auth, database, export endpoint, file download/MIME check, visual parity or complete glyph/clipping assessment. PDF is Chromium print of lab; DOCX invokes generator directly.', results }, null, 2));
}
console.log(`${results.filter(r => r.status === 'PASS').length}/${results.length} passed`);
if (results.length !== 220 || results.some(r => r.status === 'FAIL')) process.exitCode = 1;
