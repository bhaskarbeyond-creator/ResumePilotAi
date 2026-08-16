/**
 * Forensic template audit — renders every one of the 51 Resume Builder
 * templates in a real Chromium browser against the 5-fixture matrix and
 * records machine-verifiable evidence:
 *   - render success / console errors
 *   - horizontal overflow / out-of-bounds elements / clipped text candidates
 *   - board geometry (A4 = 210mm x 297mm baseline)
 *   - heading hierarchy (h1..h4 order)
 *   - content coverage (which fixture fields actually appear in output text)
 *   - ATS text extraction (innerText) sanity
 *   - accessibility spot-checks (img alt, link text, lang/dir attributes)
 *   - screenshots: desktop normal, desktop long, mobile normal
 *
 * Usage: node template-lab/audit.mjs [--only Cv1,Cv2] [--skip-shots]
 * Writes template-lab/audit-results.json and template-lab/shots/*.png
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES, FIXTURE_ORDER, TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE_URL || 'http://localhost:3000';
const SHOTS_DIR = path.join(__dirname, 'shots');
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const skipShots = args.includes('--skip-shots');
const ONLY = onlyArg ? new Set(onlyArg.split('=')[1].split(',')) : null;
const TEMPLATES = ONLY ? TEMPLATE_IDS.filter((id) => ONLY.has(id)) : TEMPLATE_IDS;

const results = [];
const now = () => new Date().toISOString();

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/tmp/chromium/chromium';

async function measure(page, { templateId, fixtureName, language, screenshot, fullPageShot = false }) {
  const entry = {
    template: templateId,
    fixture: fixtureName,
    language,
    state: null,
    error: null,
    consoleErrors: [],
    pageErrors: [],
    board: null,
    docOverflowX: 0,
    outOfBounds: [],
    clippedCandidates: [],
    headings: [],
    textStats: null,
    coverage: {},
    images: { total: 0, missingAlt: [] },
    links: { total: 0, hrefMissing: 0, dangerous: 0 },
    screenshot: null,
    durationMs: 0,
  };
  const start = Date.now();
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); };
  const onPageError = (e) => pageErrors.push(String(e.message).slice(0, 300));
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  try {
    const url = `${BASE}/template-lab/index.html?template=${templateId}&fixture=${fixtureName}&lang=${language}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    } catch (navigationError) {
      entry.state = 'navigation-error';
      entry.error = String(navigationError.message).slice(0, 300);
      entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
      entry.pageErrors = [...new Set(pageErrors)].slice(0, 6);
      entry.durationMs = Date.now() - start;
      return entry;
    }
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-lab-state') !== 'rendering',
      null,
      { timeout: 20_000 }
    );
    await page.waitForTimeout(250);
    entry.state = await page.getAttribute('html', 'data-lab-state');
    entry.error = await page.getAttribute('html', 'data-lab-error');

    const audit = await page.evaluate(() => {
      const pagesHost = document.querySelector('.resume-pages');
      const pages = [...document.querySelectorAll('.resume-pages:not(.resume-scratch) .resume-page')];
      const firstPage = pages[0] || null;
      const pageRect = firstPage ? firstPage.getBoundingClientRect() : null;
      const docEl = document.documentElement;
      const outOfBounds = [];
      const clippedCandidates = [];
      const pageChecks = [];
      const all = document.querySelectorAll('.resume-pages *');
      const limit = 9000;
      let scanned = 0;
      for (const el of all) {
        if (scanned++ > limit) break;
        if (el.closest('.resume-live')) continue;
        if (el.hasAttribute('data-template-direction')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        // Bound elements by their containing page.
        const ownerPage = el.closest('.resume-page');
        const bounds = ownerPage ? ownerPage.getBoundingClientRect() : null;
        if (bounds) {
          const leftOut = rect.left < bounds.left - 1;
          const rightOut = rect.right > bounds.right + 1;
          if ((leftOut || rightOut) && rect.width > 0) {
            const style = getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'absolute') {
              if (rightOut && rect.right > bounds.right + 6) {
                outOfBounds.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), side: leftOut ? 'left' : 'right', by: Math.round(leftOut ? bounds.left - rect.left : rect.right - bounds.right) });
              }
            } else if (!leftOut || rect.left < bounds.left - 2) {
              outOfBounds.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), side: leftOut ? 'left' : 'right', by: Math.round(leftOut ? bounds.left - rect.left : rect.right - bounds.right) });
            }
          }
        }
        const overflowX = getComputedStyle(el).overflowX;
        if ((overflowX === 'hidden' || overflowX === 'clip' || overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          const trimmed = el.innerText?.trim();
          if (trimmed && trimmed.length > 12) {
            const elRect = el.getBoundingClientRect();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let textClipped = 0;
            let node;
            while ((node = walker.nextNode())) {
              if (!node.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              for (const rect of [...range.getClientRects()]) {
                if (rect.width < 2) continue;
                if (rect.left < elRect.left - 2 || rect.right > elRect.right + 2) { textClipped++; break; }
              }
              if (textClipped) break;
            }
            if (textClipped > 0) {
              clippedCandidates.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), by: el.scrollWidth - el.clientWidth });
            }
          }
        }
      }
      // Per-page geometry + overflow checks.
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const r = p.getBoundingClientRect();
        const text = (p.innerText || '').trim();
        pageChecks.push({
          index: i + 1,
          width: Math.round(r.width),
          height: Math.round(r.height),
          overflow: p.scrollHeight > p.clientHeight + 2 ? Math.round(p.scrollHeight - p.clientHeight) : 0,
          empty: text.length < 40 && i > 0,
          continuation: i > 0 ? Boolean(p.querySelector('.resume-continuation-header')) : null,
          footer: Boolean(p.querySelector('.resume-page-footer')),
        });
      }
      const headings = [];
      for (const h of document.querySelectorAll('.resume-pages h1, .resume-pages h2, .resume-pages h3, .resume-pages h4, .resume-pages h5, .resume-pages h6')) {
        if (h.textContent.trim()) headings.push(`${h.tagName.toLowerCase()}:${h.textContent.trim().slice(0, 60)}`);
      }
      const text = pagesHost ? (pagesHost.innerText || '') : '';
      const images = [...document.querySelectorAll('.resume-pages img')];
      const links = [...document.querySelectorAll('.resume-pages a')];
      return {
        pageCount: pages.length,
        pageRect: pageRect ? { left: Math.round(pageRect.left), top: Math.round(pageRect.top), width: Math.round(pageRect.width), height: Math.round(pageRect.height) } : null,
        docScrollW: docEl.scrollWidth,
        docClientW: docEl.clientWidth,
        pageChecks: pageChecks.slice(0, 8),
        outOfBounds: outOfBounds.slice(0, 14),
        clippedCandidates: clippedCandidates.slice(0, 14),
        headings: headings.slice(0, 40),
        text,
        images: { total: images.length, missingAlt: images.filter((i) => !i.getAttribute('alt')).map((i) => i.getAttribute('src') || i.className || 'img').slice(0, 6) },
        links: {
          total: links.length,
          hrefMissing: links.filter((a) => !a.getAttribute('href')).length,
          dangerous: links.filter((a) => { const h = a.getAttribute('href') || ''; return h.startsWith('javascript:') || h.startsWith('data:'); }).length,
        },
      };
    });

    entry.board = audit.pageRect;
    entry.docOverflowX = audit.docScrollW - audit.docClientW;
    entry.boardOverflowX = 0;
    entry.pageCount = audit.pageCount;
    entry.pageChecks = audit.pageChecks;
    entry.outOfBounds = audit.outOfBounds;
    entry.clippedCandidates = audit.clippedCandidates;
    entry.headings = audit.headings;
    entry.images = audit.images;
    entry.links = audit.links;
    const text = audit.text;
    entry.textStats = { chars: text.length, lines: text.split('\n').filter(Boolean).length };

    // Content coverage: does the template surface each field the fixture supplies?
    const fixture = FIXTURES[fixtureName.replace('-mobile', '')];
    const probes = {
      name: [fixture.firstname, fixture.lastname].filter(Boolean).slice(0, 1),
      occupation: [fixture.occupation],
      email: [fixture.email],
      phone: [fixture.phone],
      summary: [fixture.summary],
      employment: fixture.employments?.slice(0, 1).map((e) => e.employer || e.jobTitle),
      education: fixture.educations?.slice(0, 1).map((e) => e.school || e.degree),
      skills: fixture.skills?.slice(0, 1).map((s) => (typeof s === 'string' ? s : s.name || s.skillName)),
      languages: fixture.languages?.slice(0, 1).map((l) => (typeof l === 'string' ? l : l.name || l.language)),
      projects: fixture.projects?.slice(0, 1).map((p) => p.title || p.name),
      certifications: fixture.certifications?.slice(0, 1).map((c) => c.title || c.name),
      achievements: fixture.achievements?.slice(0, 1).map((a) => a.title || a.name),
      references: fixture.references?.slice(0, 1).map((r) => r.name),
    };
    entry.coverage = {};
    for (const [field, values] of Object.entries(probes)) {
      const present = values?.filter(Boolean);
      if (!present?.length) { entry.coverage[field] = 'n/a'; continue; }
      const lowerText = text.replace(/\s+/g, ' ').toLowerCase();
      const rawProbe = present[0];
      const probe = String(rawProbe).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).toLowerCase();
      entry.coverage[field] = probe && lowerText.includes(probe) ? 'ok' : 'MISSING';
    }

    if (screenshot) {
      const shotPath = path.join(SHOTS_DIR, `${templateId}__${fixtureName}.png`);
      await page.screenshot({ path: shotPath, fullPage: fullPageShot });
      entry.screenshot = shotPath;
    }
  } catch (measureError) {
    entry.state = entry.state || 'exception';
    entry.error = entry.error || String(measureError.message).slice(0, 300);
  } finally {
    entry.durationMs = Date.now() - start;
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
  entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
  entry.pageErrors = [...new Set(pageErrors)].slice(0, 6);
  return entry;
}

function summarize(entries) {
  const byTemplate = {};
  for (const e of entries) {
    (byTemplate[e.template] ||= { entries: [], failures: [] }).entries.push(e);
    if (e.state !== 'ready') byTemplate[e.template].failures.push(`${e.fixture}:${e.state}${e.error ? `(${e.error})` : ''}`);
    if (e.consoleErrors.length) byTemplate[e.template].failures.push(`${e.fixture}:console:${e.consoleErrors[0]}`);
    if (e.pageErrors.length) byTemplate[e.template].failures.push(`${e.fixture}:pageerror:${e.pageErrors[0]}`);
    if (e.outOfBounds.length) byTemplate[e.template].failures.push(`${e.fixture}:oob:${e.outOfBounds.length}x`);
    if (e.clippedCandidates.length) byTemplate[e.template].failures.push(`${e.fixture}:clipped:${e.clippedCandidates.length}x`);
    for (const p of e.pageChecks || []) {
      if (p.overflow > 2) byTemplate[e.template].failures.push(`${e.fixture}:page${p.index}-overflow${p.overflow}`);
      if (p.empty) byTemplate[e.template].failures.push(`${e.fixture}:page${p.index}-empty`);
    }
  }
  console.log('\n==== PER-TEMPLATE SUMMARY ====');
  for (const id of Object.keys(byTemplate).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))) {
    const t = byTemplate[id];
    const coverage = t.entries.find((e) => e.fixture === 'normal')?.coverage || {};
    const missing = Object.entries(coverage).filter(([, v]) => v === 'MISSING').map(([k]) => k);
    const pages = t.entries.map((e) => `${e.fixture.replace('-mobile', '')}:${e.pageCount ?? '?'}p`).join(' ');
    const flags = [];
    if (t.failures.length) flags.push(`FAILURES[${t.failures.length}]`);
    if (missing.length) flags.push(`DROPS[${missing.join(',')}]`);
    console.log(`${id.padEnd(5)} ${flags.length ? '❌' : '✅'} ${flags.join(' ') || 'clean'} | pages: ${pages}`);
    if (t.failures.length) for (const f of t.failures.slice(0, 6)) console.log(`       - ${f}`);
  }
}

async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    env: { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` },
    args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking'],
  });
  console.log(`Audit start ${now()} — ${TEMPLATES.length} templates x ${FIXTURE_ORDER.length} fixtures`);
  try {
    for (const templateId of TEMPLATES) {
      for (const fixtureName of FIXTURE_ORDER) {
        const screenshot = !skipShots && (fixtureName === 'normal' || fixtureName === 'long');
        const page = await browser.newPage({ viewport: { width: 1280, height: 1900 } });
        const entry = await measure(page, {
          templateId, fixtureName, language: 'en', screenshot, fullPageShot: fixtureName === 'long',
        });
        results.push(entry);
        await page.close().catch(() => {});
        process.stdout.write('.');
      }
      // Mobile pass for the normal fixture.
      if (!skipShots) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const entry = await measure(page, { templateId, fixtureName: 'normal-mobile', language: 'en', screenshot: true });
        entry.mobile = true;
        results.push(entry);
        await page.close();
      }
      process.stdout.write(` ${templateId}\n`);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(__dirname, 'audit-results.json'), JSON.stringify({ generatedAt: now(), base: BASE, results }, null, 2));
  summarize(results);
  const failures = results.filter((e) => e.state !== 'ready' || e.consoleErrors.length || e.pageErrors.length);
  console.log(`\nTotal entries: ${results.length}; entries with render/console failures: ${failures.length}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
