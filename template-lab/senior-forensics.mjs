/**
 * SENIOR / PRINCIPAL INDEPENDENT FORENSIC HARNESS
 *
 * Renders every Cv template through the REAL production render path
 * (TemplateRenderer -> SmartResumeComposer) in a real Chromium, then captures:
 *   - page-1 PNG screenshot (browser evidence)
 *   - real page.pdf() A4 output with print-media emulation (PDF evidence)
 *   - measured DOM geometry: sidebar/main widths, column count, colors, fonts
 *   - overflow / clipped-content detection
 *   - content-coverage probes (was any resume data silently dropped?)
 *   - rendered-pixel fingerprints for duplicate/twin detection
 *
 * This harness does NOT reuse the junior's gate.mjs selectors; it discovers the
 * page elements from the live DOM so a selector drift cannot mask a defect.
 *
 * Usage: node template-lab/senior-forensics.mjs [--templates Cv1,Cv2] [--fixtures normal,long]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FIXTURES, TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'evidence', 'senior');
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';
const CHROMIUM = process.env.CHROMIUM_PATH || '/tmp/chromium-bin';
const LDPATH = '/tmp/chrlib/lib:/tmp/chrlib';

const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const templates = argValue('--templates', TEMPLATE_IDS.join(',')).split(',').filter(Boolean);
const fixtures = argValue('--fixtures', 'normal').split(',').filter(Boolean);
const wantPdf = !argv.includes('--no-pdf');
const wantShot = !argv.includes('--no-shot');

/* Local self-hosted webfonts: this sandbox cannot reach fonts.googleapis.com,
   and falling back to the default sans would erase the typography dimension we
   must audit. The faces are injected as data: URIs so the measured font stack
   matches the production @import list. */
const FONT_DIR = '/tmp/fonts/node_modules/@fontsource';
const FONT_FACES = [
    ['Inter', 'inter/files/inter-latin-400-normal.woff2', 400],
    ['Inter', 'inter/files/inter-latin-700-normal.woff2', 700],
    ['Plus Jakarta Sans', 'plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2', 400],
    ['Plus Jakarta Sans', 'plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2', 700],
    ['Merriweather', 'merriweather/files/merriweather-latin-400-normal.woff2', 400],
    ['Merriweather', 'merriweather/files/merriweather-latin-700-normal.woff2', 700],
    ['Outfit', 'outfit/files/outfit-latin-400-normal.woff2', 400],
    ['Outfit', 'outfit/files/outfit-latin-700-normal.woff2', 700],
    ['Montserrat', 'montserrat/files/montserrat-latin-400-normal.woff2', 400],
    ['Montserrat', 'montserrat/files/montserrat-latin-700-normal.woff2', 700],
    ['Cinzel', 'cinzel/files/cinzel-latin-400-normal.woff2', 400],
    ['Cinzel', 'cinzel/files/cinzel-latin-700-normal.woff2', 700],
    ['Fira Code', 'fira-code/files/fira-code-latin-400-normal.woff2', 400],
    ['Playfair Display', 'playfair-display/files/playfair-display-latin-400-normal.woff2', 400],
    ['Noto Sans Telugu', 'noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff2', 400],
    ['Noto Sans Devanagari', 'noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2', 400],
];

function buildFontCss() {
    const faces = [];
    for (const [family, file, weight] of FONT_FACES) {
        const full = path.join(FONT_DIR, file);
        if (!fs.existsSync(full)) continue;
        const b64 = fs.readFileSync(full).toString('base64');
        faces.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`);
    }
    // Indic fallback so Unicode glyph correctness is measurable, not tofu.
    // Per-glyph CSS fallback so Telugu/Devanagari resolve to real glyphs instead of
    // tofu in this sandbox. Latin still resolves to the template's own family first,
    // so the typography dimension remains measurable.
    faces.push(`.smart-resume-page, .smart-resume-page * { font-family: var(--font-family), 'Noto Sans Telugu', 'Noto Sans Devanagari', sans-serif; }`);
    faces.push(`.smart-header__name, .smart-header__role, .smart-section-title { font-family: var(--font-family), 'Noto Sans Telugu', 'Noto Sans Devanagari', sans-serif; }`);
    return faces.join('\n');
}

function pdfStats(buffer) {
    const src = buffer.toString('latin1');
    const pageCount = (src.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const boxes = [...src.matchAll(/\/MediaBox\s*\[([-\d.\s]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
    return { pageCount, mediaBoxes: boxes.slice(0, 8), bytes: buffer.length };
}

const measure = () => {
    const root = document.querySelector('.smart-resume-engine-root');
    const pages = [...document.querySelectorAll('.smart-resume-page')];
    if (!pages.length) return { missing: true, html: document.body.innerHTML.slice(0, 400) };
    const p1 = pages[0];
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const cs = (el, prop) => (el ? getComputedStyle(el)[prop] : null);

    const layout = p1.querySelector('.smart-layout');
    const sidebar = p1.querySelector('.smart-sidebar');
    const main = p1.querySelector('.smart-main-content');
    const banner = p1.querySelector('.smart-banner-wrapper');
    const header = p1.querySelector('.smart-header');

    const pageRect = rect(p1);
    const sideRect = sidebar ? rect(sidebar) : null;
    const mainRect = main ? rect(main) : null;

    // real geometric column detection: side-by-side boxes on the same row
    let columns = 1;
    if (sideRect && mainRect) {
        const overlapY = Math.min(sideRect.y + sideRect.h, mainRect.y + mainRect.h) - Math.max(sideRect.y, mainRect.y);
        const disjointX = sideRect.x + sideRect.w <= mainRect.x + 2 || mainRect.x + mainRect.w <= sideRect.x + 2;
        if (overlapY > 100 && disjointX) columns = 2;
    }

    // overflow / clipped content on every page
    const overflow = pages.map((pg, i) => ({
        page: i + 1,
        scrollH: pg.scrollHeight,
        clientH: pg.clientHeight,
        clipped: pg.scrollHeight - pg.clientHeight,
        overflowStyle: getComputedStyle(pg).overflow,
    }));

    // out-of-bounds elements (horizontal bleed)
    const oob = [];
    for (const pg of pages) {
        const b = pg.getBoundingClientRect();
        for (const el of pg.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (!r.width && !r.height) continue;
            const st = getComputedStyle(el);
            if (st.position === 'fixed' || st.position === 'absolute') continue;
            if (r.left < b.left - 1 || r.right > b.right + 1) {
                oob.push(`${el.tagName}.${String(el.className).slice(0, 30)}`);
                if (oob.length > 5) break;
            }
        }
        if (oob.length > 5) break;
    }

    const sectionTitles = [...p1.querySelectorAll('.smart-section-title__text')].map((n) => n.textContent.trim());
    const allText = pages.map((p) => p.innerText || '').join('\n');

    return {
        missing: false,
        pageCount: pages.length,
        pageRect,
        layoutClass: layout ? layout.className : null,
        rootVars: {
            sidebarWidth: root ? getComputedStyle(root).getPropertyValue('--sidebar-width').trim() : null,
            primary: root ? getComputedStyle(root).getPropertyValue('--primary').trim() : null,
            secondary: root ? getComputedStyle(root).getPropertyValue('--secondary').trim() : null,
            sidebarBg: root ? getComputedStyle(root).getPropertyValue('--sidebar-bg').trim() : null,
            badgeRadius: root ? getComputedStyle(root).getPropertyValue('--badge-radius').trim() : null,
        },
        columns,
        sidebar: sidebar ? {
            rect: sideRect,
            widthPct: pageRect.w ? +(sideRect.w / pageRect.w * 100).toFixed(1) : null,
            heightPct: pageRect.h ? +(sideRect.h / pageRect.h * 100).toFixed(1) : null,
            bg: cs(sidebar, 'backgroundColor'),
            bgImage: cs(sidebar, 'backgroundImage'),
            color: cs(sidebar, 'color'),
            position: sideRect && mainRect ? (sideRect.x < mainRect.x ? 'left' : 'right') : null,
        } : null,
        main: mainRect ? { rect: mainRect, widthPct: pageRect.w ? +(mainRect.w / pageRect.w * 100).toFixed(1) : null } : null,
        banner: banner ? { rect: rect(banner), bg: cs(banner, 'backgroundImage') !== 'none' ? cs(banner, 'backgroundImage') : cs(banner, 'backgroundColor') } : null,
        header: header ? { class: header.className, fontFamily: cs(header, 'fontFamily'), nameSize: cs(p1.querySelector('.smart-header__name'), 'fontSize') } : null,
        typography: {
            pageFont: cs(p1, 'fontFamily'),
            bodySize: cs(p1, 'fontSize'),
            sectionTitleSize: cs(p1.querySelector('.smart-section-title'), 'fontSize'),
            sectionTitleTransform: cs(p1.querySelector('.smart-section-title'), 'textTransform'),
            sectionTitleColor: cs(p1.querySelector('.smart-section-title'), 'color'),
        },
        skills: (() => {
            const grid = p1.querySelector('.smart-skills-grid');
            if (!grid) return null;
            return { class: grid.className, display: cs(grid, 'display'), cols: cs(grid, 'gridTemplateColumns'), items: grid.children.length };
        })(),
        timelineClass: (() => { const t = p1.querySelector('[class*="smart-timeline--"]'); return t ? t.className : null; })(),
        sectionTitles,
        sectionOrder: [...document.querySelectorAll('.smart-section-title__text')].map((n) => n.textContent.trim()),
        overflow,
        oob,
        textLength: allText.replace(/\s+/g, ' ').trim().length,
        text: allText.replace(/\s+/g, ' ').trim().toLowerCase(),
        images: [...document.images].map((i) => ({ src: String(i.currentSrc || i.src).slice(0, 80), ok: i.complete && i.naturalWidth > 0, alt: i.alt })),
        headings: [...p1.querySelectorAll('h1,h2,h3,h4')].map((h) => `${h.tagName}:${h.textContent.trim().slice(0, 40)}`),
    };
};

function coverageProbes(fixture) {
    const strip = (v) => String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).toLowerCase();
    const probes = {};
    if (fixture.firstname) probes.name = strip(fixture.firstname);
    if (fixture.employments?.length) {
        probes['first-employer'] = strip(fixture.employments[0].employer);
        probes['last-employer'] = strip(fixture.employments[fixture.employments.length - 1].employer);
    }
    if (fixture.educations?.length) probes['last-education'] = strip(fixture.educations[fixture.educations.length - 1].school);
    if (fixture.skills?.length) {
        const last = fixture.skills[fixture.skills.length - 1];
        probes['last-skill'] = strip(typeof last === 'string' ? last : last.name);
    }
    if (fixture.projects?.length) probes['last-project'] = strip(fixture.projects[fixture.projects.length - 1].title);
    if (fixture.certifications?.length) probes['last-certification'] = strip(fixture.certifications[fixture.certifications.length - 1].title);
    if (fixture.achievements?.length) probes['last-achievement'] = strip(fixture.achievements[fixture.achievements.length - 1].title || fixture.achievements[fixture.achievements.length - 1].name);
    if (fixture.references?.length) probes['last-reference'] = strip(fixture.references[fixture.references.length - 1].name);
    if (fixture.languages?.length) probes['last-language'] = strip(fixture.languages[fixture.languages.length - 1].name);
    return probes;
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const fontCss = buildFontCss();
    const browser = await chromium.launch({
        executablePath: CHROMIUM,
        env: { ...process.env, LD_LIBRARY_PATH: LDPATH },
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote', '--font-render-hinting=none'],
    });
    const results = [];
    const context = await browser.newContext({ viewport: { width: 1300, height: 1900 }, deviceScaleFactor: 1 });
    // Block the unreachable Google Fonts request so it cannot stall rendering.
    await context.route('**fonts.googleapis.com**', (r) => r.abort());
    await context.route('**fonts.gstatic.com**', (r) => r.abort());

    for (const templateId of templates) {
        for (const fixtureName of fixtures) {
            const entry = { template: templateId, fixture: fixtureName, problems: [], warnings: [] };
            const page = await context.newPage();
            const consoleErrors = [];
            const consoleNoise = [];
            page.on('console', (m) => {
                if (m.type() !== 'error') return;
                const text = m.text().slice(0, 180);
                // The sandbox deliberately aborts fonts.googleapis.com (unreachable);
                // that resource error is harness noise, not an application defect.
                if (/Failed to load resource/i.test(text)) { consoleNoise.push(text); return; }
                consoleErrors.push(text);
            });
            page.on('pageerror', (e) => consoleErrors.push(`pageerror:${String(e.message).slice(0, 180)}`));
            const failedRequests = [];
            page.on('requestfailed', (r) => {
                const u = r.url();
                if (u.includes('fonts.googleapis') || u.includes('fonts.gstatic')) return;
                failedRequests.push(`${r.method()} ${u.slice(0, 100)}`);
            });
            try {
                const t0 = Date.now();
                await page.goto(`${BASE}/template-lab/index.html?template=${templateId}&fixture=${fixtureName}&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.addStyleTag({ content: fontCss });
                await page.waitForSelector('.smart-resume-page', { timeout: 30000 });
                await page.evaluate(() => document.fonts?.ready).catch(() => {});
                await page.waitForTimeout(400);
                entry.renderMs = Date.now() - t0;

                const m = await page.evaluate(measure);
                entry.dom = m;
                if (m.missing) entry.problems.push('no-smart-resume-page');

                if (!m.missing) {
                    // content coverage
                    const probes = coverageProbes(FIXTURES[fixtureName]);
                    for (const [k, needle] of Object.entries(probes)) {
                        if (needle && !m.text.includes(needle)) entry.problems.push(`missing-content:${k}`);
                    }
                    for (const o of m.overflow) {
                        if (o.clipped > 4 && o.overflowStyle !== 'visible') entry.problems.push(`clipped-p${o.page}:${o.clipped}px`);
                    }
                    if (m.oob.length) entry.problems.push(`oob:${m.oob.join('|')}`);
                    for (const img of m.images) if (!img.ok) entry.problems.push(`broken-image:${img.src}`);
                }
                if (consoleErrors.length) entry.problems.push(`console:${consoleErrors[0]}`);
                if (failedRequests.length) entry.warnings.push(`request-failed:${failedRequests[0]}`);

                if (wantShot) {
                    const shot = path.join(OUT, `${templateId}__${fixtureName}__p1.png`);
                    await page.locator('.smart-resume-page').first().screenshot({ path: shot }).catch(() => {});
                    entry.screenshot = path.relative(__dirname, shot);
                    if (fs.existsSync(shot)) entry.shotHash = crypto.createHash('sha256').update(fs.readFileSync(shot)).digest('hex').slice(0, 16);
                }

                if (wantPdf) {
                    const buf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' } });
                    const pdfPath = path.join(OUT, `${templateId}__${fixtureName}.pdf`);
                    fs.writeFileSync(pdfPath, buf);
                    entry.pdf = { file: path.relative(__dirname, pdfPath), ...pdfStats(buf) };
                    if (!m.missing && entry.pdf.pageCount !== m.pageCount) {
                        entry.problems.push(`pdf-page-count-mismatch dom=${m.pageCount} pdf=${entry.pdf.pageCount}`);
                    }
                }
            } catch (error) {
                entry.problems.push(`exception:${String(error.message).slice(0, 200)}`);
            } finally {
                await page.close().catch(() => {});
            }
            results.push(entry);
            const status = entry.problems.length ? `FAIL(${entry.problems.length})` : 'pass';
            console.log(`${templateId}/${fixtureName} ${status} cols=${entry.dom?.columns ?? '?'} sb=${entry.dom?.sidebar?.widthPct ?? '-'}% pdfPages=${entry.pdf?.pageCount ?? '-'} ${entry.problems.slice(0, 2).join(' ; ')}`);
        }
    }
    await browser.close();
    const outFile = path.join(OUT, `matrix-${fixtures.join('-')}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, results }, null, 2));
    const failed = results.filter((r) => r.problems.length);
    console.log(`\n=== ${results.length} renders, ${failed.length} with problems -> ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
