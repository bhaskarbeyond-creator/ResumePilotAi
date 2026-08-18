/**
 * SECTION-SPACING FORENSIC PROBE
 *
 * Answers, from computed styles and real bounding boxes (never from source):
 *   1. Which element actually controls the gap between two sections?
 *   2. Is the declared density scale (11 / 14 / 18 px) really applied, or is it
 *      shadowed by another rule in the cascade?
 *   3. What is the MEASURED distance from the bottom of the previous section's
 *      last ink to the top of the next section's heading?
 *   4. Is the spacing double-applied anywhere (margin + gap stacking)?
 *   5. Is the rhythm consistent across every section transition?
 *
 * Usage: node template-lab/spacing-probe.mjs [--templates Cv1,Cv4] [--fixture normal]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';
const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const templates = arg('--templates', 'Cv1,Cv8,Cv4,Cv25,Cv40').split(',');
const fixture = arg('--fixture', 'normal');

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'],
});
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1900 } });
await ctx.route('**fonts.g**', (r) => r.abort());

const rows = [];
for (const templateId of templates) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/template-lab/index.html?template=${templateId}&fixture=${fixture}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.smart-resume-page', { timeout: 30000 });
    await page.waitForTimeout(300);

    const data = await page.evaluate(() => {
        const sheet = document.querySelector('.smart-resume-page');
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const varOf = (el, name) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : '');

        const flow = sheet.querySelector('.smart-flow-container');
        const main = sheet.querySelector('.smart-main-content');
        const sidebar = sheet.querySelector('.smart-sidebar');
        const layout = sheet.querySelector('.smart-layout');
        const firstSection = sheet.querySelector('.smart-section');

        // Measured transitions: for each consecutive pair of sections inside the
        // main flow, distance from the LAST ink of section N to the TOP of the
        // heading of section N+1.
        const lastInkBottom = (el) => {
            let bottom = el.getBoundingClientRect().top;
            const walk = (node) => {
                for (const child of node.children) {
                    const r = child.getBoundingClientRect();
                    if (r.height > 0 && (child.textContent || '').trim()) bottom = Math.max(bottom, r.bottom);
                    walk(child);
                }
            };
            walk(el);
            return bottom;
        };

        const measureIn = (container, label) => {
            if (!container) return [];
            const sections = [...container.children].filter((c) => c.classList.contains('smart-section'));
            const out = [];
            for (let i = 0; i < sections.length - 1; i++) {
                const prev = sections[i];
                const next = sections[i + 1];
                const heading = next.querySelector('.smart-section-title');
                if (!heading) continue;
                const prevInk = lastInkBottom(prev);
                const headTop = heading.getBoundingClientRect().top;
                out.push({
                    container: label,
                    from: (prev.querySelector('.smart-section-title__text') || {}).textContent || '?',
                    to: (next.querySelector('.smart-section-title__text') || {}).textContent || '?',
                    gapPx: +(headTop - prevInk).toFixed(1),
                    boxGapPx: +(next.getBoundingClientRect().top - prev.getBoundingClientRect().bottom).toFixed(1),
                });
            }
            return out;
        };

        return {
            density: sheet.getAttribute('data-density'),
            archetype: sheet.getAttribute('data-archetype'),
            vars: {
                '--smart-section-gap': varOf(sheet, '--smart-section-gap'),
                '--smart-sidebar-gap': varOf(sheet, '--smart-sidebar-gap'),
                '--density-gap': varOf(sheet, '--density-gap'),
                '--density-section-gap': varOf(sheet, '--density-section-gap'),
                '--density-sidebar-gap': varOf(sheet, '--density-sidebar-gap'),
            },
            computed: {
                sheetFontSize: cs(sheet).fontSize,
                sheetLineHeight: cs(sheet).lineHeight,
                flowDisplay: flow ? cs(flow).display : null,
                flowGap: flow ? cs(flow).rowGap : null,
                mainGap: main ? cs(main).rowGap : null,
                sidebarGap: sidebar ? cs(sidebar).rowGap : null,
                layoutGap: layout ? cs(layout).rowGap : null,
                sectionInnerGap: firstSection ? cs(firstSection).rowGap : null,
                sectionMarginBottom: firstSection ? cs(firstSection).marginBottom : null,
                sectionMarginTop: firstSection ? cs(firstSection).marginTop : null,
                titleMarginBottom: sheet.querySelector('.smart-section-title') ? cs(sheet.querySelector('.smart-section-title')).marginBottom : null,
            },
            mainFlowSections: flow ? [...flow.children].filter((c) => c.classList.contains('smart-section')).length : 0,
            transitions: [...measureIn(flow, 'main-flow'), ...measureIn(sidebar, 'sidebar')],
        };
    });

    rows.push({ template: templateId, fixture, ...data });
    console.log(`\n### ${templateId}  density=${data.density}  archetype=${data.archetype}`);
    console.log(`  vars      : section-gap=${data.vars['--smart-section-gap'] || '(unset)'}  density-gap=${data.vars['--density-gap'] || '(unset)'}  density-section-gap=${data.vars['--density-section-gap'] || '(unset)'}`);
    console.log(`  computed  : flow.gap=${data.computed.flowGap}  main.gap=${data.computed.mainGap}  sidebar.gap=${data.computed.sidebarGap}  section.innerGap=${data.computed.sectionInnerGap}`);
    console.log(`  font      : ${data.computed.sheetFontSize} / ${data.computed.sheetLineHeight}   title mb=${data.computed.titleMarginBottom}  section mb=${data.computed.sectionMarginBottom}`);
    console.log(`  measured transitions (prev last ink -> next heading top):`);
    for (const t of data.transitions) {
        console.log(`     ${String(t.container).padEnd(9)} ${String(t.from).slice(0, 22).padEnd(24)} -> ${String(t.to).slice(0, 22).padEnd(24)} gap=${String(t.gapPx).padStart(6)}px  (box gap ${t.boxGapPx}px)`);
    }
    await page.close();
}
await browser.close();
fs.mkdirSync(path.join(__dirname, 'evidence', 'senior'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'evidence', 'senior', `spacing-${fixture}.json`), JSON.stringify(rows, null, 2));

const all = rows.flatMap((r) => r.transitions.filter((t) => t.container === 'main-flow').map((t) => t.gapPx));
if (all.length) {
    console.log(`\nMAIN-FLOW TRANSITIONS: n=${all.length} min=${Math.min(...all)}px max=${Math.max(...all)}px`);
}
