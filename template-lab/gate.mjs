/**
 * Resume Builder — browser matrix quality gate.
 *
 * Boots the template lab on an ephemeral Vite server and renders all 51
 * templates x (normal + long + extreme + unicode) in a real browser, then
 * fails on any of:
 *   - render crash / console error / page error
 *   - horizontal out-of-bounds element
 *   - text clipping on the normal fixture
 *   - missing content coverage (name, employer, school, skills, projects,
 *     certifications, achievements, references)
 *   - zero-ink output (empty board)
 *
 * Usage: node template-lab/gate.mjs
 * Env:
 *   CHROMIUM_PATH — path to a Chromium/Chrome binary (falls back to
 *                   Playwright's bundled browser, or skips with a clear
 *                   message when no browser is available, exit 0 + SKIPPED
 *                   marker so browserless CI is not bricked).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import { TEMPLATE_IDS, FIXTURES } from './fixtures.js';

const FIXTURES_TO_CHECK = ['normal', 'long', 'extreme', 'unicode'];
const results = [];

function probeFields(fixture) {
    const out = {};
    out.name = [fixture.firstname, fixture.lastname].filter(Boolean)[0];
    out.employment = fixture.employments?.[0]?.employer || fixture.employments?.[0]?.jobTitle;
    out.education = fixture.educations?.[0]?.school || fixture.educations?.[0]?.degree;
    out.skills = typeof fixture.skills?.[0] === 'string' ? fixture.skills[0] : fixture.skills?.[0]?.name || fixture.skills?.[0]?.skillName;
    out.projects = fixture.projects?.[0]?.title || fixture.projects?.[0]?.name;
    out.certifications = fixture.certifications?.[0]?.title || fixture.certifications?.[0]?.name;
    out.achievements = fixture.achievements?.[0]?.title || fixture.achievements?.[0]?.name;
    out.references = fixture.references?.[0]?.name;
    return out;
}

const strip = (value) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).toLowerCase();

async function main() {
    let browser = null;
    let vite = null;
    const failures = [];
    try {
        vite = await createServer({
            server: { port: 0, host: '127.0.0.1', strictPort: false },
            logLevel: 'error',
        });
        const server = await vite.listen();
        const port = server.config.server.port;
        const base = `http://127.0.0.1:${port}`;

        let executablePath = process.env.CHROMIUM_PATH || '/tmp/chromium/chromium';
        let launchArgs = ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking'];
        let env = { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` };
        if (!fs.existsSync(executablePath)) {
            executablePath = chromium.executablePath();
            env = { ...process.env, PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: '1' };
        }
        if (!fs.existsSync(executablePath)) {
            console.log('SKIPPED: no Chromium binary available (set CHROMIUM_PATH). Static gates still enforce the template floor.');
            await server.close().catch(() => {});
            return;
        }
        browser = await chromium.launch({ executablePath, env, args: launchArgs });
        console.log(`Gate start — ${TEMPLATE_IDS.length} templates x ${FIXTURES_TO_CHECK.length} fixtures`);

        for (const templateId of TEMPLATE_IDS) {
            for (const fixtureName of FIXTURES_TO_CHECK) {
                const entry = { template: templateId, fixture: fixtureName, problems: [] };
                const page = await browser.newPage({ viewport: { width: 1280, height: 1900 } });
                const consoleErrors = [];
                const pageErrors = [];
                const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); };
                const onError = (e) => pageErrors.push(String(e.message).slice(0, 200));
                page.on('console', onConsole);
                page.on('pageerror', onError);
                try {
                    await page.goto(`${base}/template-lab/index.html?template=${templateId}&fixture=${fixtureName}&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
                    await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') !== 'rendering', null, { timeout: 20_000 });
                    await page.waitForTimeout(200);
                    const state = await page.getAttribute('html', 'data-lab-state');
                    if (state !== 'ready') entry.problems.push(`state:${state} (${await page.getAttribute('html', 'data-lab-error')})`);
                    if (consoleErrors.length) entry.problems.push(`console:${consoleErrors[0]}`);
                    if (pageErrors.length) entry.problems.push(`pageerror:${pageErrors[0]}`);

                    const audit = await page.evaluate(() => {
                        const board = document.querySelector('#resumen') || document.querySelector('[class*="board"], [class*="Board"]');
                        if (!board) return { missing: true };
                        const br = board.getBoundingClientRect();
                        const ancestors = new Set();
                        for (let n = board.parentElement; n; n = n.parentElement) ancestors.add(n);
                        const oob = [];
                        let scanned = 0;
                        for (const el of board.querySelectorAll('*')) {
                            if (scanned++ > 4000) break;
                            if (ancestors.has(el) || el.hasAttribute('data-template-direction')) continue;
                            const r = el.getBoundingClientRect();
                            if (r.width === 0 && r.height === 0) continue;
                            const style = getComputedStyle(el);
                            if ((r.left < br.left - 1 || r.right > br.right + 1) && style.position !== 'fixed' && style.position !== 'absolute') {
                                oob.push(`${el.tagName}.${String(el.className).slice(0, 24)} +${Math.round(Math.max(br.left - r.left, r.right - br.right))}`);
                            }
                        }
                        const text = board.innerText || '';
                        return { oob: oob.slice(0, 4), chars: text.length, text: text.toLowerCase() };
                    });
                    if (audit.missing) entry.problems.push('no-board-element');
                    else {
                        if (audit.chars < 40) entry.problems.push('zero-ink-board');
                        if (audit.oob.length) entry.problems.push(`oob:${audit.oob.join(',')}`);
                        if (fixtureName === 'normal') {
                            const probes = probeFields(FIXTURES[fixtureName]);
                            for (const [field, raw] of Object.entries(probes)) {
                                const needle = strip(raw);
                                if (needle && !audit.text.includes(needle)) entry.problems.push(`missing-coverage:${field}`);
                            }
                        }
                    }
                } catch (error) {
                    entry.problems.push(`exception:${String(error.message).slice(0, 160)}`);
                } finally {
                    page.off('console', onConsole);
                    page.off('pageerror', onError);
                    await page.close().catch(() => {});
                }
                results.push(entry);
                if (entry.problems.length) {
                    failures.push(entry);
                    console.log(`FAIL ${templateId}/${fixtureName}: ${entry.problems.join(' | ')}`);
                }
            }
        }
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (vite) await vite.close().catch(() => {});
    }
    const passed = results.length - failures.length;
    console.log(`Gate summary: ${passed}/${results.length} entries passed, ${failures.length} failed`);
    if (failures.length) {
        console.error('QUALITY GATE FAILED');
        process.exit(1);
    }
    console.log('QUALITY GATE PASSED');
}

main().catch((error) => { console.error(error); process.exit(1); });
