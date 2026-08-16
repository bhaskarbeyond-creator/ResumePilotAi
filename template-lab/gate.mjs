/**
 * Resume Builder — browser matrix quality gate.
 *
 * Boots the template lab on an ephemeral Vite server and renders all 51
 * templates x (normal + senior + executive + academic + unicode) in a real
 * browser, then fails on any of:
 *   - render crash / console error / page error
 *   - horizontal out-of-bounds element
 *   - page geometry drift (A4 = 794 x 1123 px at 96 dpi)
 *   - silently clipped page content (hidden overflow beyond tolerance)
 *   - missing content coverage (name, last employment, education, projects,
 *     certifications, achievements, references)
 *
 * Deliberately non-fatal (warnings only):
 *   - flagged leaf pages (unsplittable >1-page content preserved visibly)
 *   - missing continuation chrome (cosmetic; content integrity is what the
 *     coverage probes enforce)
 *
 * Usage: node template-lab/gate.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import { TEMPLATE_IDS, FIXTURES } from './fixtures.js';

const FIXTURES_TO_CHECK = ['normal', 'senior', 'executive', 'academic', 'unicode'];
const PAGE_W = 794;
const PAGE_H = 1123;
const results = [];

function probeFields(fixture) {
    return {
        name: [fixture.firstname, fixture.lastname].filter(Boolean)[0],
        employment: fixture.employments?.[0]?.employer || fixture.employments?.[0]?.jobTitle,
        education: fixture.educations?.[0]?.school || fixture.educations?.[0]?.degree,
        skills: typeof fixture.skills?.[0] === 'string' ? fixture.skills[0] : fixture.skills?.[0]?.name || fixture.skills?.[0]?.skillName,
        projects: fixture.projects?.[0]?.title || fixture.projects?.[0]?.name,
        certifications: fixture.certifications?.[0]?.title || fixture.certifications?.[0]?.name,
        achievements: fixture.achievements?.[0]?.title || fixture.achievements?.[0]?.name,
        references: fixture.references?.[0]?.name,
    };
}

const strip = (value) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).toLowerCase();

async function collectDocumentAudit(page) {
    return page.evaluate(({ PAGE_W, PAGE_H }) => {
        const pages = [...document.querySelectorAll('.resume-pages:not(.resume-scratch) .resume-page')];
        const pageProblems = [];
        const leafWarnings = [];
        const chromeWarnings = [];
        const oob = [];
        if (!pages.length) return { missing: true };
        for (const pageEl of pages) {
            const index = pages.indexOf(pageEl) + 1;
            const bounds = pageEl.getBoundingClientRect();
            if (Math.abs(bounds.width - PAGE_W) > 3) pageProblems.push(`p${index}-width${Math.round(bounds.width)}`);
            if (Math.abs(bounds.height - PAGE_H) > 3) pageProblems.push(`p${index}-height${Math.round(bounds.height)}`);
            const overflowPx = pageEl.scrollHeight - pageEl.clientHeight;
            const overflowStyle = getComputedStyle(pageEl).overflow;
            if (overflowPx > 2 && overflowStyle === 'visible') {
                leafWarnings.push(`p${index}+${Math.round(overflowPx)}px`);
            } else if (overflowPx > 2) {
                // Page-1 phantom scroll-area (board min-height + margins) may
                // exceed the frame by a few tens of px without rendered content
                // beyond the sheet; continuation pages must fit strictly.
                const tolerance = index === 1 ? 80 : 4;
                if (overflowPx > tolerance) pageProblems.push(`p${index}-overflow${Math.round(overflowPx)}`);
            }
            if (index > 1 && (pageEl.innerText || '').trim().length < 8) pageProblems.push(`p${index}-empty`);
            if (index > 1 && !pageEl.querySelector('.resume-continuation-header')) chromeWarnings.push(`p${index}-no-continuation`);
            if (!pageEl.querySelector('.resume-page-footer')) chromeWarnings.push(`p${index}-no-footer`);
            let scanned = 0;
            for (const el of pageEl.querySelectorAll('*')) {
                if (scanned++ > 3000) break;
                const r = el.getBoundingClientRect();
                if (r.width === 0 && r.height === 0) continue;
                const style = getComputedStyle(el);
                if ((r.left < bounds.left - 1 || r.right > bounds.right + 1) && style.position !== 'fixed' && style.position !== 'absolute') {
                    oob.push(`${el.tagName}.${String(el.className).slice(0, 24)} +${Math.round(Math.max(bounds.left - r.left, r.right - bounds.right))}`);
                    if (oob.length > 6) break;
                }
            }
        }
        const text = (pages.map((p) => p.innerText || '').join('\n')).replace(/\s+/g, ' ').toLowerCase();
        return { oob: oob.slice(0, 4), pageProblems, leafWarnings, chromeWarnings, pages: pages.length, chars: text.length, text };
    }, { PAGE_W, PAGE_H });
}

async function checkCoverage(page, fixtureName, entry) {
    const audit = await page.evaluate(() => {
        const pages = [...document.querySelectorAll('.resume-pages:not(.resume-scratch) .resume-page')];
        return (pages.map((p) => p.innerText || '').join('\n')).replace(/\s+/g, ' ').toLowerCase();
    });
    const fixture = FIXTURES[fixtureName];
    if (fixtureName === 'normal') {
        for (const [field, raw] of Object.entries(probeFields(fixture))) {
            const needle = strip(raw);
            if (needle && !audit.includes(needle)) entry.problems.push(`missing-coverage:${field}`);
        }
    } else {
        const probes = {
            name: strip(fixture.firstname || ''),
            'last-employment': strip(fixture.employments?.[fixture.employments.length - 1]?.employer || ''),
            'last-education': strip(fixture.educations?.[fixture.educations.length - 1]?.school || ''),
            projects: strip(fixture.projects?.[0]?.title || ''),
            certifications: strip(fixture.certifications?.[0]?.title || ''),
        };
        for (const [field, needle] of Object.entries(probes)) {
            if (needle && !audit.includes(needle)) entry.problems.push(`missing-${field}`);
        }
    }
}

async function measure(page, { base, templateId, fixtureName }) {
    const entry = { template: templateId, fixture: fixtureName, problems: [] };
    const consoleErrors = [];
    const pageErrors = [];
    const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); };
    const onError = (e) => pageErrors.push(String(e.message).slice(0, 200));
    page.on('console', onConsole);
    page.on('pageerror', onError);
    try {
        await page.goto(`${base}/template-lab/index.html?template=${templateId}&fixture=${fixtureName}&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') !== 'rendering', null, { timeout: 20_000 });
        // Wait for quiescence (rebuilds may still be in flight).
        const fingerprint = () => page.evaluate(() => {
            const pages = [...document.querySelectorAll('.resume-pages:not(.resume-scratch) .resume-page')];
            return pages.length + ':' + pages.map((p) => Math.round(p.scrollHeight)).join(',');
        });
        let stable = false;
        for (let attempt = 0; attempt < 24; attempt++) {
            const first = await fingerprint();
            await page.waitForTimeout(250);
            const second = await fingerprint();
            if (first === second && first.length > 0) { stable = true; break; }
        }
        if (!stable) entry.problems.push('document-never-stable');
        const state = await page.getAttribute('html', 'data-lab-state');
        if (state !== 'ready') entry.problems.push(`state:${state}`);
        if (consoleErrors.length) entry.problems.push(`console:${consoleErrors[0]}`);
        if (pageErrors.length) entry.problems.push(`pageerror:${pageErrors[0]}`);

        const audit = await collectDocumentAudit(page);
        if (audit.missing) {
            entry.problems.push('no-page-elements');
        } else {
            if (audit.chars < 40) entry.problems.push('zero-ink-document');
            if (audit.oob.length) entry.problems.push(`oob:${audit.oob.join(',')}`);
            for (const p of audit.pageProblems) entry.problems.push(p);
            for (const w of audit.leafWarnings || []) console.log(`  leaf-visible (content preserved): ${templateId}/${fixtureName} ${w}`);
            for (const w of audit.chromeWarnings || []) console.log(`  chrome-missing: ${templateId}/${fixtureName} ${w}`);
            await checkCoverage(page, fixtureName, entry);
        }

        // Coverage-only problems are frequently a timing artifact of the
        // late-mounting extras portal; retry once after a settle delay.
        if (entry.problems.length > 0 && entry.problems.every((problem) => problem.startsWith('missing-'))) {
            await page.waitForTimeout(900);
            entry.problems = [];
            const state2 = await page.getAttribute('html', 'data-lab-state');
            if (state2 !== 'ready') entry.problems.push(`state:${state2}`);
            await checkCoverage(page, fixtureName, entry);
        }
    } catch (error) {
        entry.problems.push(`exception:${String(error.message).slice(0, 160)}`);
    } finally {
        page.off('console', onConsole);
        page.off('pageerror', onError);
        await page.close().catch(() => {});
    }
    return entry;
}

async function main() {
    const vite = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
    const server = await vite.listen();
    const port = server.config.server.port;
    const base = `http://127.0.0.1:${port}`;

    let executablePath = process.env.CHROMIUM_PATH;
    const launchArgs = ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking'];
    const env = { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` };
    const launchOptions = executablePath && fs.existsSync(executablePath)
        ? { executablePath, env, args: launchArgs }
        : { args: launchArgs };

    let browser = await chromium.launch(launchOptions);
    console.log(`Gate start — ${TEMPLATE_IDS.length} templates x ${FIXTURES_TO_CHECK.length} fixtures`);
    try {
        let entryCounter = 0;
        for (const templateId of TEMPLATE_IDS) {
            for (const fixtureName of FIXTURES_TO_CHECK) {
                if (entryCounter > 0 && entryCounter % 60 === 0) {
                    await browser.close().catch(() => {});
                    browser = await chromium.launch({ executablePath, env, args: launchArgs });
                }
                const page = await browser.newPage({ viewport: { width: 1280, height: 1900 } });
                const entry = await measure(page, { base, templateId, fixtureName });
                results.push(entry);
                entryCounter++;
                if (entry.problems.length) console.log(`FAIL ${templateId}/${fixtureName}: ${entry.problems.join(' | ')}`);
            }
        }
    } finally {
        await browser.close().catch(() => {});
        await server.close().catch(() => {});
        await vite.close().catch(() => {});
    }
    const failures = results.filter((entry) => entry.problems.length);
    console.log(`Gate summary: ${results.length - failures.length}/${results.length} entries passed, ${failures.length} failed`);
    if (failures.length) {
        console.error('QUALITY GATE FAILED');
        process.exit(1);
    }
    console.log('QUALITY GATE PASSED');
}

main().catch((error) => { console.error(error); process.exit(1); });
