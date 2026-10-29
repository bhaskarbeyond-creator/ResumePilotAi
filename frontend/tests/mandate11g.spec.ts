/**
 * Fixture-backed browser coverage of the real dashboard and export renderer.
 * Network fixtures replace the unavailable backend/auth service, not the React
 * components. This is not a live-database integration test.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { TEMPLATES, TEMPLATE_CATEGORIES } from '../src/lib/template-catalog';
import { getLayoutSpec } from '../src/lib/template-layouts';

// The required command launches Playwright from the repository root. Resolve
// its test API from that same root, even when frontend has a separate install.
const rootRequire = createRequire(new URL('../../package.json', import.meta.url));
const { test, expect } = rootRequire('@playwright/test') as typeof import('@playwright/test');
const frontendRequire = createRequire(import.meta.url);
const fixtureFont = resolve(dirname(frontendRequire.resolve('pdfjs-dist/package.json')), 'standard_fonts/LiberationSans-Regular.ttf');

const representative = {
  id: 'resume-11g', name: 'Platform resume', title: 'Platform resume', template: 'Cv1',
  firstname: 'Asha', lastname: 'Rao', occupation: 'Software Architect',
  email: 'asha@example.test', phone: '+91 555 0100', city: 'Vijayawada', country: 'India',
  website: 'https://portfolio.example.test/asha', github: 'https://github.example.test/asha',
  summary: 'Architect of reliable services and inclusive products.',
  experience: [
    { id: 'role-1', position: 'Principal Engineer', company: 'Northstar Systems', startDate: '2021', endDate: '2025', description: '<ul><li>Delivered reliable platforms.</li><li>Mentored engineering teams.</li></ul>' },
    { id: 'role-2', position: 'Software Engineer', company: 'Bluebird Labs', startDate: '2017', endDate: '2021', description: 'Built secure services.' },
  ],
  education: [{ id: 'edu-1', degree: 'BSc', field: 'Computer Science', institution: 'State University', description: 'Research in distributed computing.' }],
  skills: [{ category: 'Engineering', skills: ['TypeScript', 'Cloud Architecture', 'Accessibility'] }],
  projects: [{ id: 'project-1', title: 'Project Phoenix', technologies: 'TypeScript, Kubernetes', url: 'https://example.test/phoenix', description: 'Shipped a developer platform.' }],
  certifications: [{ id: 'cert-1', name: 'Cloud Certification', issuer: 'Institute', credentialId: 'CERT-12345' }],
  languages: [{ id: 'lang-1', name: 'English', proficiency: 'Fluent' }],
  achievements: [{ id: 'ach-1', title: 'Innovation Award', description: 'Recognized for collaboration.' }],
  hobbies: ['Painting'], references: [{ id: 'ref-1', name: 'Reference Person', company: 'Northstar' }],
};

async function fixtures(context: BrowserContext, resume: Record<string, unknown> = representative) {
  const tokenPayload = Buffer.from(JSON.stringify({ uid: 'candidate-11g', email: 'asha@example.test', role: 'USER', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const token = `rptest.${tokenPayload}.${'a'.repeat(64)}`;
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('ime_dev_user', JSON.stringify({ token: value, displayName: 'Asha Rao' }));
      localStorage.setItem('token', value);
    } catch { /* Initial about:blank popups do not have a storage origin. */ }
    (window as unknown as { printCalls: number }).printCalls = 0;
    window.print = () => { (window as unknown as { printCalls: number }).printCalls++; };
  }, token);
  // The sandbox cannot reach Google Fonts. Return empty CSS so system fallback
  // fonts are exercised without hiding application console errors.
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/users-data/profile') return route.fulfill({ json: { user: { firstname: 'Asha', lastname: 'Rao' }, uid: 'candidate-11g', role: 'USER' } });
    if (path === '/api/export-render-data') return route.fulfill({ json: { data: resume } });
    if (path === '/api/resumes') return route.fulfill({ json: { resumes: [resume] } });
    if (path === '/api/resumes/resume-11g') return route.fulfill({ json: { resume } });
    return route.fulfill({ json: {} });
  });
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()} (${message.location().url})`); });
  return errors;
}

async function openExport(page: Page, id = 'Cv1') {
  await page.goto(`/export/${id}/resume-11g/en#renderToken=${'a'.repeat(43)}`);
  await expect(page.locator(`.resume-document[data-template-id="${id}"] .resume-pages`)).toHaveAttribute('data-compose-state', 'ready');
}

async function chooseExportTemplate(page: Page, id: string) {
  await page.locator('header.no-print select').selectOption(id.replace('Cv', ''));
  await expect(page.locator(`.resume-document[data-template-id="${id}"] .resume-pages`)).toHaveAttribute('data-compose-state', 'ready');
  await expect(page.locator(`.resume-page[data-template-id="${id}"]`).first()).toBeVisible();
}

async function assertPageGeometry(page: Page) {
  const diagnostics = await page.locator('.resume-pages .resume-page').evaluateAll(pages => pages.map(sheet => {
    const element = sheet as HTMLElement;
    const style = getComputedStyle(element);
    const columns = [...element.querySelectorAll<HTMLElement>('.resume-column')].map(column => ({
      height: column.clientHeight, scrollHeight: column.scrollHeight, width: column.clientWidth, scrollWidth: column.scrollWidth,
    }));
    const badStyles = [...element.querySelectorAll<HTMLElement>('*')].filter(child => {
      const css = getComputedStyle(child);
      return [css.width, css.height, css.top, css.left].some(value => /NaN|undefined/.test(value));
    }).length;
    return { width: element.offsetWidth, height: element.offsetHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, overflow: element.dataset.overflow, badStyles, columns, cssWidth: style.width };
  }));
  expect(diagnostics.length).toBeGreaterThan(0);
  for (const sheet of diagnostics) {
    expect(sheet.width, JSON.stringify(sheet)).toBeGreaterThan(0);
    expect(sheet.height / sheet.width).toBeCloseTo(297 / 210, 2);
    expect(sheet.scrollWidth, JSON.stringify(sheet)).toBeLessThanOrEqual(sheet.width + 1);
    expect(sheet.scrollHeight, JSON.stringify(sheet)).toBeLessThanOrEqual(sheet.height + 1);
    expect(sheet.overflow).toBeUndefined();
    expect(sheet.badStyles).toBe(0);
    for (const column of sheet.columns) {
      expect(column.scrollHeight, JSON.stringify(sheet)).toBeLessThanOrEqual(column.height + 1);
      expect(column.scrollWidth, JSON.stringify(sheet)).toBeLessThanOrEqual(column.width + 1);
    }
  }
  return diagnostics;
}

async function assertRenderedContrast(page: Page, id: string) {
  const samples = await page.locator('.resume-page').first().evaluate(sheet => {
    const rgb = (value: string) => {
      const match = value.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
      return match ? match.slice(1, 4).map(Number) : [255, 255, 255];
    };
    const luminance = (values: number[]) => values.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (foreground: string, background: string) => {
      const [a, b] = [luminance(rgb(foreground)), luminance(rgb(background))].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    };
    const results: Array<{ selector: string; ratio: number; foreground: string; background: string }> = [];
    const add = (selector: string, background: Element | null) => {
      const node = sheet.querySelector(selector);
      if (!node || !background) return;
      const fg = getComputedStyle(node).color;
      const style = getComputedStyle(background);
      const gradients = [...style.backgroundImage.matchAll(/rgba?\([^)]*\)/g)].map(match => match[0]);
      const bgs = gradients.length ? gradients : [style.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : style.backgroundColor];
      for (const bg of bgs) results.push({ selector, ratio: ratio(fg, bg), foreground: fg, background: bg });
    };
    const identity = sheet.querySelector('.resume-identity');
    for (const selector of ['.resume-identity h1', '.resume-identity .resume-occupation', '.resume-identity .resume-contact-row a']) add(selector, identity);
    for (const selector of ['.resume-main h2', '.resume-main h3', '.resume-main .resume-muted', '.resume-main p']) add(selector, sheet);
    const rail = sheet.querySelector('.resume-rail');
    for (const selector of ['.resume-rail h2', '.resume-rail h3', '.resume-rail .resume-muted', '.resume-rail .resume-skill']) add(selector, rail);
    return results;
  });
  expect(samples.length).toBeGreaterThan(3);
  for (const sample of samples) expect(sample.ratio, `${id} ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(4.5);
}

async function openGallery(page: Page) {
  await page.goto('/dashboard/resumes');
  await expect(page.getByTestId('template-gallery')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Metropolitan Navy' })).toBeEnabled();
}

test('100-template matrix executes the real renderer and checks geometry, sections and console', async ({ page, context }) => {
  test.setTimeout(240_000);
  await fixtures(context);
  const errors = collectErrors(page);
  await openExport(page);
  const outcomes: string[] = [];
  for (const template of TEMPLATES) {
    await chooseExportTemplate(page, template.id);
    await expect(page.locator('.resume-pages')).toContainText('Asha Rao');
    await expect(page.locator('.resume-pages')).toContainText('Northstar Systems');
    await expect(page.locator('.resume-pages')).toContainText('Project Phoenix');
    await expect(page.locator('.resume-page').first()).toHaveAttribute('data-archetype', template.archetype);
    await assertPageGeometry(page);
    await assertRenderedContrast(page, template.id);
    await expect(page.locator('.resume-page').first()).toHaveAttribute('data-layout-family', getLayoutSpec(template.id).family);
    outcomes.push(template.id);
    console.log(`renderer PASS ${template.id} ${template.archetype}`);
  }
  expect(outcomes).toEqual(Array.from({ length: 100 }, (_, index) => `Cv${index + 1}`));
  expect(errors).toEqual([]);
});

test('five archetypes render real sections, left/right rail, banner, ATS, project cards and date rails', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  await openExport(page);
  for (const id of ['Cv1', 'Cv8', 'Cv4', 'Cv25', 'Cv40']) {
    await chooseExportTemplate(page, id);
    const output = page.locator('.resume-pages');
    for (const text of ['Architect of reliable services', 'Principal Engineer', 'Software Engineer', 'State University', 'TypeScript', 'Project Phoenix', 'Cloud Certification', 'CERT-12345', 'English', 'Innovation Award']) await expect(output).toContainText(text);
    await assertPageGeometry(page);
  }
  await chooseExportTemplate(page, 'Cv1');
  await expect(page.locator('.resume-page [data-layout-rail]').first()).toBeVisible();
  const right = TEMPLATES.find(template => template.archetype === 'modern-split' && getLayoutSpec(template.id).aside === 'right');
  expect(right).toBeDefined();
  await chooseExportTemplate(page, right!.id);
  await expect(page.locator('.resume-page .resume-columns').first()).toHaveAttribute('data-sidebar-position', 'right');
  await chooseExportTemplate(page, 'Cv8');
  await expect(page.locator('.resume-page .resume-identity-executive-banner').first()).toBeVisible();
  await chooseExportTemplate(page, 'Cv4');
  await expect(page.locator('.resume-page [data-resume-column="rail"]')).toHaveCount(0);
  await chooseExportTemplate(page, 'Cv25');
  await expect(page.locator('.resume-page [data-project-card]').first()).toBeVisible();
  await chooseExportTemplate(page, 'Cv40');
  await expect(page.locator('.resume-page [data-date-rail="true"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('gallery filters compose with case-insensitive search and open the correct live template', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  await openGallery(page);
  const gallery = page.getByTestId('template-gallery');
  const cards = gallery.getByTestId('template-card');
  await expect(cards).toHaveCount(100);
  for (const category of TEMPLATE_CATEGORIES) {
    await gallery.getByRole('button', { name: category.label, exact: true }).click();
    const expected = category.id === 'all' ? TEMPLATES.length : TEMPLATES.filter(template => template.category === category.id).length;
    await expect(cards).toHaveCount(expected);
    await expect(gallery.getByRole('button', { name: category.label, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await gallery.getByRole('button', { name: 'Tech & AI' }).click();
  await page.getByLabel('Search templates').fill('  DEVOPS  ');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-template-id', 'Cv25');
  await page.getByLabel('Search templates').fill('not-a-template-11g');
  await expect(gallery.getByText(/No templates match these filters/)).toBeVisible();
  await page.getByLabel('Search templates').fill('');
  await expect(cards).toHaveCount(TEMPLATES.filter(template => template.category === 'creative').length);
  await gallery.getByRole('button', { name: 'All templates' }).click();
  await page.getByLabel('Search templates').fill('mEtRoPoLiTaN');
  await gallery.getByRole('button', { name: 'Preview Metropolitan Navy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Asha Rao' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.resume-document')).toHaveAttribute('data-template-id', 'Cv1');
  await expect(dialog.locator('.resume-pages')).toContainText('Northstar Systems');
  expect(errors).toEqual([]);
});

test('dialog focus, zoom bounds, fit, keyboard dismissal and live switching retain candidate data', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  await openGallery(page);
  await page.getByLabel('Search templates').fill('Metropolitan');
  const trigger = page.getByRole('button', { name: 'Preview Metropolitan Navy' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Asha Rao' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  const zoomIn = dialog.getByRole('button', { name: 'Zoom in' });
  const zoomOut = dialog.getByRole('button', { name: 'Zoom out' });
  await zoomIn.click();
  await expect(dialog.getByLabel('Preview zoom 110 percent')).toBeVisible();
  for (let i = 0; i < 4; i++) await zoomIn.click();
  await expect(dialog.getByLabel('Preview zoom 150 percent')).toBeVisible();
  await expect(zoomIn).toBeDisabled();
  for (let i = 0; i < 10; i++) await zoomOut.click();
  await expect(dialog.getByLabel('Preview zoom 50 percent')).toBeVisible();
  await expect(zoomOut).toBeDisabled();
  await dialog.getByRole('button', { name: 'Fit preview to width' }).click();
  const fitted = await dialog.locator('[data-preview-scale]').evaluate(element => Number.parseFloat((element as HTMLElement).style.zoom));
  const canvasWidth = await dialog.locator('[data-preview-canvas]').evaluate(element => element.clientWidth);
  expect(fitted).toBe(Math.max(50, Math.min(150, Math.floor(((canvasWidth - 48) / (210 * 96 / 25.4)) * 100))));
  expect(fitted).toBeGreaterThan(50);
  await dialog.getByRole('combobox', { name: 'Switch resume template' }).click();
  await page.getByRole('option', { name: /Cv25.*DevOps Terminal Tech/ }).click();
  await expect(dialog.locator('.resume-document')).toHaveAttribute('data-template-id', 'Cv25');
  await expect(dialog.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'ready');
  await expect(dialog.locator('.resume-pages')).toContainText('Asha Rao');
  await expect(dialog.locator('.resume-pages')).toContainText('Northstar Systems');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('controlled two-page document preserves ordered content and continuation geometry', async ({ page, context }) => {
  const resume = {
    ...representative,
    experience: Array.from({ length: 10 }, (_, index) => ({ id: `long-${index}`, position: `Role ${index}`, company: `Company ${index}`, startDate: '2010', endDate: '2020', description: `ROLE-${String(index).padStart(2, '0')}-END ` + 'Built dependable products and mentored colleagues. '.repeat(4) })),
  };
  await fixtures(context, resume);
  const errors = collectErrors(page);
  await openExport(page, 'Cv4');
  const pages = page.locator('.resume-pages .resume-page');
  await expect(pages).toHaveCount(2);
  const texts = await pages.allTextContents();
  for (let index = 0; index < 10; index++) expect(texts.join(' ').split(`ROLE-${String(index).padStart(2, '0')}-END`).length - 1).toBe(1);
  expect(texts[0]).toContain('ROLE-00-END');
  expect(texts[1]).toContain('ROLE-09-END');
  await expect(pages.nth(1).locator('.resume-continuation-header')).toContainText('Asha Rao — Curriculum Vitae');
  await expect(pages.nth(1).locator('.resume-continuation-header')).toContainText('Page 2');
  expect((await pages.last().locator('[data-resume-block]').count())).toBeGreaterThan(0);
  for (const block of await page.locator('.resume-page [data-resume-block]:has(> h2)').all()) {
    const data = await block.evaluate(element => ({ heading: element.querySelector('h2')?.textContent || '', text: element.textContent || '' }));
    expect(data.text.slice(data.heading.length).trim().length).toBeGreaterThan(0);
  }
  await assertPageGeometry(page);
  expect(errors).toEqual([]);
});

test('long rich text, many skills and long URLs survive pagination without clipping or duplication', async ({ page, context }) => {
  test.setTimeout(180_000);
  const words = Array.from({ length: 1500 }, (_, i) => `word${String(i).padStart(4, '0')}`).join(' ');
  const resume = {
    ...representative,
    summary: words,
    website: `https://example.test/${'unbroken'.repeat(70)}`,
    skills: Array.from({ length: 130 }, (_, i) => `Skill-${String(i).padStart(3, '0')}`),
    experience: Array.from({ length: 28 }, (_, i) => ({ id: `r${i}`, position: `Long role ${i}`, company: `Company ${i}`, description: `UNIQUE-ROLE-${String(i).padStart(2, '0')}-END ` + 'Accountable for service delivery. '.repeat(5) })),
  };
  await fixtures(context, resume);
  const errors = collectErrors(page);
  await openExport(page, 'Cv1');
  const sheets = page.locator('.resume-pages .resume-page');
  expect(await sheets.count()).toBeGreaterThan(3);
  const summary = (await page.locator('.resume-pages [data-section="summary"]').allTextContents()).join('').replace('Professional Profile', '').trim();
  expect(summary).toBe(words);
  const content = (await sheets.allTextContents()).join(' ');
  for (let i = 0; i < 130; i++) expect(content.split(`Skill-${String(i).padStart(3, '0')}`).length - 1).toBe(1);
  for (let i = 0; i < 28; i++) expect(content.split(`UNIQUE-ROLE-${String(i).padStart(2, '0')}-END`).length - 1).toBe(1);
  expect(content).toContain(resume.website);
  await assertPageGeometry(page);
  expect(errors).toEqual([]);
});

test('malformed optional data and unknown saved ID show an honest state and remain recoverable', async ({ page, context }) => {
  const resume = { id: 'resume-11g', name: 'Partial', template: 'Cv999', firstname: 'Asha', lastname: 'Rao', experience: [null, { position: 'Role', description: 'Present data' }], education: null, skills: [null, 'TypeScript'], languages: [null, 'English'], projects: 'malformed' };
  await fixtures(context, resume);
  const errors = collectErrors(page);
  await openGallery(page);
  await page.getByRole('button', { name: 'Resume options' }).click();
  await page.getByRole('menuitem', { name: 'View Full Preview' }).click();
  const dialog = page.getByRole('dialog', { name: 'Asha Rao' });
  await expect(dialog.getByRole('alert')).toContainText('Unsupported template layout');
  await expect(dialog.getByRole('button', { name: /supported template before exporting/i }).first()).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Switch resume template' }).click();
  await page.getByRole('option', { name: /Cv1.*Metropolitan Navy/ }).click();
  await expect(dialog.locator('.resume-pages')).toContainText('Present data');
  await expect(dialog.locator('.resume-pages')).toContainText('TypeScript');
  await expect(dialog.locator('.resume-pages')).toContainText('English');
  await assertPageGeometry(page);
  expect(errors).toEqual([]);
});

test('browser print action and generated A4 PDF retain content without dashboard controls', async ({ page, context }) => {
  const resume = { ...representative, experience: Array.from({ length: 10 }, (_, i) => ({ position: `Print Role ${i}`, company: `Print Company ${i}`, description: `PDF-MARKER-${String(i).padStart(2, '0')}-END ` + 'Reliable product delivery. '.repeat(12) })) };
  await fixtures(context, resume);
  const errors = collectErrors(page);
  await openGallery(page);
  await page.getByLabel('Search templates').fill('Harvard');
  await page.getByRole('button', { name: 'Preview Harvard Classic ATS' }).click();
  const dialog = page.getByRole('dialog', { name: 'Asha Rao' });
  const popupPromise = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Print preview' }).click();
  const popup = await popupPromise;
  const popupErrors = collectErrors(popup);
  await expect(popup).toHaveURL(/\/export\/Cv4\/resume-11g\/en/);
  await expect(popup.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'ready');
  await expect.poll(() => popup.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(1);
  await popup.locator('header.no-print').getByRole('button', { name: /Print/ }).click();
  expect(await popup.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(2);
  await popup.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (value: string) => { (window as unknown as { copiedLink: string }).copiedLink = value; return Promise.resolve(); } } }));
  await popup.getByRole('button', { name: 'Copy preview link' }).click();
  const copiedLink = await popup.evaluate(() => (window as unknown as { copiedLink: string }).copiedLink);
  expect(new URL(copiedLink).searchParams.has('print')).toBe(false);
  const sheetCount = await popup.locator('.resume-page').count();
  expect(sheetCount).toBeGreaterThan(1);
  await popup.emulateMedia({ media: 'print' });
  await expect(popup.locator('header.no-print')).toBeHidden();
  // Print media hides the measuring source: even a resize during printing must
  // retain the already-composed screen sheets instead of recomposing at 0px.
  await popup.evaluate(() => new Promise<void>(resolve => {
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(popup.locator('.resume-page')).toHaveCount(sheetCount);
  const pdf = await popup.pdf({ printBackground: true, preferCSSPageSize: true });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  expect(document.numPages).toBe(sheetCount);
  let extracted = '';
  for (let number = 1; number <= document.numPages; number++) {
    const pdfPage = await document.getPage(number);
    expect(pdfPage.view[2]).toBeCloseTo(595, 0);
    expect(pdfPage.view[3]).toBeCloseTo(842, 0);
    extracted += ' ' + (await pdfPage.getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ');
  }
  expect(extracted).toContain('Asha Rao');
  for (let i = 0; i < 10; i++) expect(extracted.split(`PDF-MARKER-${String(i).padStart(2, '0')}-END`).length - 1).toBe(1);
  expect(extracted).not.toContain('My Resumes');
  expect(extracted).not.toContain('Print / PDF');
  console.log(`Actual Chromium print-to-PDF: ${document.numPages} A4 pages, all 10 unique markers extracted.`);
  expect(errors).toEqual([]);
  expect(popupErrors).toEqual([]);
});

test('dialog exposes accessible names and has no serious WCAG A/AA violations', async ({ page, context }) => {
  await fixtures(context);
  await openGallery(page);
  await page.getByLabel('Search templates').fill('Metropolitan');
  await page.getByRole('button', { name: 'Preview Metropolitan Navy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Asha Rao' });
  await expect(dialog).toBeVisible();
  for (const name of ['Zoom in', 'Zoom out', 'Fit preview to width', 'Print preview', 'Share resume', 'Close']) await expect(dialog.getByRole('button', { name, exact: true })).toHaveCount(1);
  await expect(dialog.getByRole('combobox', { name: 'Switch resume template' })).toBeVisible();
  const results = await new AxeBuilder({ page }).include('[data-testid="cuba-preview-modal"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
  expect(serious.map(item => ({ id: item.id, help: item.help, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
});

test('the separate cover-letter builder renders all four real definitions without changing the body', async ({ page, context }) => {
  await fixtures(context);
  await context.route('**/api/covers/cl_11g', route => route.fulfill({ json: { cover: {
    id: 'cl_11g', candidateFirstname: 'Asha', candidateLastname: 'Rao', candidateEmail: 'asha@example.test',
    jobTitle: 'Software Architect', companyName: 'Northstar Systems', recipientName: 'Hiring Manager',
    letterBody: 'COVER-UNIQUE-TEXT: I build reliable services.', templateId: 'Cover1',
  } } }));
  const errors = collectErrors(page);
  await page.goto('/cover-letter/cl_11g');
  const choices = page.getByRole('radiogroup', { name: 'Cover letter template' });
  const names = ['Executive Classic', 'Modern Minimalist', 'Split Sidebar', 'Creative Accent'];
  for (let index = 0; index < names.length; index++) {
    const choice = choices.getByRole('radio', { name: new RegExp(names[index]) });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-checked', 'true');
    const paper = page.locator(`#cover-letter-preview [data-template="Cover${index + 1}"]`);
    await expect(paper).toContainText('Asha Rao');
    await expect(paper).toContainText('COVER-UNIQUE-TEXT: I build reliable services.');
    await expect(paper).toContainText('Northstar Systems');
    console.log(`separate cover builder PASS Cover${index + 1}`);
  }
  expect(errors).toEqual([]);
});

test('mobile viewport keeps the dialog controls reachable and the A4 canvas scrollable', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(context);
  const errors = collectErrors(page);
  await openGallery(page);
  await page.getByLabel('Search templates').fill('Metropolitan');
  await page.getByRole('button', { name: 'Preview Metropolitan Navy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Asha Rao' });
  for (const name of ['Zoom in', 'Zoom out', 'Fit preview to width', 'Print preview', 'Share resume', 'Download Word document', 'Close']) await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Switch resume template' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fit preview to width' }).click();
  await expect(dialog.getByLabel('Preview zoom 50 percent')).toBeVisible();
  const canvas = dialog.locator('[data-preview-canvas]');
  const metrics = await canvas.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflow: getComputedStyle(element).overflowX }));
  expect(metrics.overflow).toBe('auto');
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('export waits for a delayed real font and photo before announcing readiness', async ({ page, context }) => {
  const resume = { ...representative, photo: 'http://127.0.0.1:4017/__delayed-photo.png', showPhoto: true };
  await fixtures(context, resume);
  let releasePhoto!: () => void;
  let releaseFont!: () => void;
  const photoGate = new Promise<void>(resolve => { releasePhoto = resolve; });
  const fontGate = new Promise<void>(resolve => { releaseFont = resolve; });
  await context.route('**/__delayed-photo.png', async route => {
    await photoGate;
    // A valid, tiny PNG; the browser really decodes and loads it.
    await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR+4AAAAASUVORK5CYII=', 'base64') });
  });
  await context.route('**/__delayed-font.ttf', async route => {
    await fontGate;
    await route.fulfill({ contentType: 'font/ttf', path: fixtureFont });
  });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: `@font-face { font-family: 'Inter'; src: url('http://127.0.0.1:4017/__delayed-font.ttf') format('truetype'); font-style: normal; font-weight: 100 900; font-display: swap; }` }));
  const errors = collectErrors(page);
  try {
    await page.goto(`/export/Cv1/resume-11g/en#renderToken=${'a'.repeat(43)}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.resume-composer-source img')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loading');
    await expect(page.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'ready');
    await expect(page.locator('html')).not.toHaveAttribute('data-export-ready', 'true');
    releasePhoto();
    await expect.poll(() => page.locator('.resume-composer-source img').evaluate(image => (image as HTMLImageElement).complete)).toBe(true);
    await expect(page.locator('html')).not.toHaveAttribute('data-export-ready', 'true');
    releaseFont();
    await expect(page.locator('html')).toHaveAttribute('data-export-ready', 'true');
    await expect(page.locator('.resume-pages')).toContainText('Northstar Systems');
    await assertPageGeometry(page);
    expect(errors).toEqual([]);
  } finally {
    releasePhoto();
    releaseFont();
  }
});

test('long names and right-to-left export keep direction and readable A4 sheets', async ({ page, context }) => {
  const resume = { ...representative, firstname: 'أسماء طويلة للتجربة '.repeat(5), lastname: 'راو', summary: 'هذه بيانات سيرة ذاتية أصلية للتجربة.' };
  await fixtures(context, resume);
  const errors = collectErrors(page);
  await page.goto(`/export/Cv1/resume-11g/ar#renderToken=${'a'.repeat(43)}`);
  await expect(page.locator('.resume-document')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'ready');
  await expect(page.locator('.resume-pages')).toContainText('هذه بيانات سيرة ذاتية أصلية للتجربة.');
  await expect(page.locator('.resume-pages')).toContainText('Northstar Systems');
  await assertPageGeometry(page);
  expect(errors).toEqual([]);
});

test('unfit identity content is flagged and blocks the backend export-ready signal', async ({ page, context }) => {
  await fixtures(context, { ...representative, firstname: 'AnExtraordinarilyLongUnbrokenName'.repeat(400) });
  const errors = collectErrors(page);
  await page.goto(`/export/Cv4/resume-11g/en?print=1#renderToken=${'a'.repeat(43)}`);
  await expect(page.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'overflow');
  await expect(page.locator('.resume-compose-warning')).toContainText('too large to fit an A4 page');
  await expect(page.locator('html')).toHaveAttribute('data-export-error', /too large to fit/);
  await expect(page.locator('html')).not.toHaveAttribute('data-export-ready', 'true');
  await expect(page.locator('.resume-page[data-overflow="true"]').first()).toBeAttached();
  expect(await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(0);
  expect(errors).toEqual([]);
});

test('unsupported public templates retain the existing explicit not-available state', async ({ page, context }) => {
  await fixtures(context);
  await context.route('**/api/resumes/public/resume-11g', route => route.fulfill({ json: { resume: { ...representative, template: 'Cv999' }, publication: { isPublished: true } } }));
  const errors = collectErrors(page);
  await page.goto('/shared/resume-11g');
  await expect(page.getByTestId('shared-error')).toContainText('template this viewer does not support');
  await expect(page.locator('.resume-document')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('preview share uses saved publication state, not the locally selected design', async ({ page, context }) => {
  await fixtures(context);
  await context.route('**/api/resumes/resume-11g/publication', route => route.fulfill({ json: { isPublished: false, publicationRevision: 1 } }));
  await context.route('**/api/resumes/resume-11g/publish', route => route.fulfill({ json: { isPublished: true } }));
  const errors = collectErrors(page);
  await openGallery(page);
  await page.getByLabel('Search templates').fill('DevOps');
  await page.getByRole('button', { name: 'Preview DevOps Terminal Tech' }).click();
  const preview = page.getByRole('dialog', { name: 'Asha Rao' });
  await expect(preview.locator('.resume-document')).toHaveAttribute('data-template-id', 'Cv25');
  await expect(preview.getByRole('button', { name: 'Save this template before downloading Word.' })).toBeDisabled();
  await preview.getByRole('button', { name: 'Share resume' }).click();
  const share = page.getByRole('dialog', { name: 'Share Resume' });
  await expect(share).toBeVisible();
  await expect(share).toContainText('Cv1');
  await expect(share.getByTestId('share-url')).toHaveValue('');
  const toggle = share.getByRole('switch', { name: 'Publish this resume to a public link' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(share.getByTestId('share-error')).toContainText('did not return a share link');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(share.getByTestId('share-url')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('explicit skill ratings and credential IDs remain visible without invented ratings', async ({ page, context }) => {
  const resume = { ...representative, skillCategories: [{ category: 'Tech', skills: [{ name: 'Kotlin', rating: 4 }, 'Go'] }] };
  await fixtures(context, resume);
  const errors = collectErrors(page);
  await openExport(page, 'Cv1');
  await expect(page.locator('.resume-pages')).toContainText('Kotlin (4)');
  await expect(page.locator('.resume-pages')).toContainText('CERT-12345');
  const unscored = page.locator('.resume-page .resume-skill', { hasText: 'Go' });
  await expect(unscored).toHaveText('Go');
  expect(errors).toEqual([]);
});

test('long sanitized rich text preserves list and paragraph content across pages', async ({ page, context }) => {
  const list = Array.from({ length: 65 }, (_, index) => `<li>BULLET-${String(index).padStart(2, '0')}-END contributed reliable systems and documentation.</li>`).join('');
  const summary = `<p><strong>Beginning of rich text.</strong></p><ul>${list}</ul><p>End of rich text.</p><script>window.__unsafe11g = true</script><a href="javascript:alert(1)">unsafe link label</a>`;
  await fixtures(context, { ...representative, summary });
  const errors = collectErrors(page);
  await openExport(page, 'Cv4');
  const sheets = page.locator('.resume-page');
  expect(await sheets.count()).toBeGreaterThan(1);
  const content = (await sheets.allTextContents()).join(' ');
  for (let index = 0; index < 65; index++) expect(content.split(`BULLET-${String(index).padStart(2, '0')}-END`).length - 1).toBe(1);
  expect(content).toContain('Beginning of rich text.');
  expect(content).toContain('End of rich text.');
  expect(content).toContain('unsafe link label');
  expect(await page.evaluate(() => (window as unknown as { __unsafe11g?: boolean }).__unsafe11g)).toBeUndefined();
  await expect(page.locator('.resume-page script')).toHaveCount(0);
  await expect(page.locator('.resume-page a[href^="javascript:"]')).toHaveCount(0);
  await assertPageGeometry(page);
  expect(errors).toEqual([]);
});

test('an empty saved library never fabricates a candidate preview', async ({ page, context }) => {
  await fixtures(context);
  await context.route('**/api/resumes', route => route.fulfill({ json: { resumes: [] } }));
  const errors = collectErrors(page);
  await page.goto('/dashboard/resumes');
  const gallery = page.getByTestId('template-gallery');
  await expect(gallery.getByTestId('template-card')).toHaveCount(100);
  await expect(gallery.getByRole('button', { name: 'Preview Metropolitan Navy' })).toBeDisabled();
  await expect(page.getByText(/Save a resume to preview it/)).toBeVisible();
  await expect(page.locator('.resume-document')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('repeated preview switching updates composed pages without duplicated candidate content', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  await openGallery(page);
  await page.getByLabel('Search templates').fill('Metropolitan');
  await page.getByRole('button', { name: 'Preview Metropolitan Navy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Asha Rao' });
  for (const [id, name] of [['Cv25', 'DevOps Terminal Tech'], ['Cv8', 'Crown Executive Banner'], ['Cv40', 'Europass Classic Grid'], ['Cv1', 'Metropolitan Navy']]) {
    await dialog.getByRole('combobox', { name: 'Switch resume template' }).click();
    await page.getByRole('option', { name: new RegExp(`${id}.*${name}`) }).click();
    await expect(dialog.locator('.resume-document')).toHaveAttribute('data-template-id', id);
    await expect(dialog.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'ready');
    const text = (await dialog.locator('.resume-page').allTextContents()).join(' ');
    expect(text.split('Principal Engineer').length - 1).toBe(1);
  }
  expect(errors).toEqual([]);
});

test('hidden sections and photos remain suppressed in export and the public viewer', async ({ page, context }) => {
  const resume = {
    ...representative, summary: 'PRIVATE-HIDDEN-SUMMARY', skills: ['PRIVATE-HIDDEN-SKILL'],
    hiddenSections: ['summary', 'skills'], photo: 'https://example.test/private-photo.png', hidePhoto: true,
  };
  await fixtures(context, resume);
  await context.route('**/api/resumes/public/resume-11g', route => route.fulfill({ json: { resume, publication: { isPublished: true } } }));
  const errors = collectErrors(page);
  await openExport(page, 'Cv1');
  await expect(page.locator('.resume-pages')).not.toContainText('PRIVATE-HIDDEN-SUMMARY');
  await expect(page.locator('.resume-pages')).not.toContainText('PRIVATE-HIDDEN-SKILL');
  await expect(page.locator('.resume-document img')).toHaveCount(0);
  await expect(page.locator('.resume-pages')).toContainText('Northstar Systems');
  await page.goto('/shared/resume-11g');
  await expect(page.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'ready');
  await expect(page.locator('.resume-pages')).not.toContainText('PRIVATE-HIDDEN-SUMMARY');
  await expect(page.locator('.resume-pages')).not.toContainText('PRIVATE-HIDDEN-SKILL');
  await expect(page.locator('.resume-document img')).toHaveCount(0);
  await expect(page.locator('.resume-pages')).toContainText('Northstar Systems');
  expect(errors).toEqual([]);
});

test('malformed optional export collections retain valid records without an error screen', async ({ page, context }) => {
  await fixtures(context, { ...representative, experience: [null, {}, { position: 'Present role', company: 'Present company', description: 'Present evidence' }], education: [null, {}], projects: 'malformed' });
  const errors = collectErrors(page);
  await openExport(page, 'Cv1');
  await expect(page.locator('.resume-pages')).toContainText('Present evidence');
  await expect(page.locator('.resume-pages')).toContainText('Present company');
  await expect(page.locator('.resume-pages [data-section="education"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cannot Load Resume' })).toHaveCount(0);
  await assertPageGeometry(page);
  expect(errors).toEqual([]);
});

test('unsupported direct export ID fails closed without a React error boundary', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  for (const id of ['Cv999', 'NoSuchTemplate', 'Cv1junk', 'Cover5']) {
    await page.goto(`/export/${id}/resume-11g/en#renderToken=${'a'.repeat(43)}`);
    await expect(page.getByRole('alert')).toContainText('Unsupported template layout');
    await expect(page.locator('html')).toHaveAttribute('data-export-error', /Unsupported template/);
    await expect(page.locator('.resume-document')).toHaveCount(0);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('all four cover export variants use saved cover fields and the authenticated cover endpoint', async ({ page, context }) => {
  await fixtures(context);
  const cover = {
    id: 'resume-11g', candidateFirstname: 'Asha', candidateLastname: 'Rao', candidateEmail: 'asha@example.test',
    candidateAddress: '12 Real Street', candidateCity: 'Vijayawada', candidatePostalCode: '520001',
    jobTitle: 'Software Architect', recipientName: 'Hiring Manager', companyName: 'Northstar Systems',
    companyAddress: '10 Business Road', companyCity: 'Hyderabad', companyPostalCode: '500001',
    letterBody: 'REAL LETTER BODY: I build reliable products.\nI would value the opportunity to contribute.', templateId: 'Cover1',
  };
  let coverReads = 0;
  await context.route('**/api/covers/resume-11g', route => { coverReads++; return route.fulfill({ json: { cover } }); });
  const errors = collectErrors(page);
  await page.goto('/export/Cover1/resume-11g/en');
  await expect(page.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'ready');
  // React Strict Mode may perform two initial safe reads in development.
  const initialCoverReads = coverReads;
  expect(initialCoverReads).toBeGreaterThan(0);
  for (let index = 1; index <= 4; index++) {
    await page.locator('header.no-print select').selectOption(String(index));
    const paper = page.locator(`.resume-document[data-template-id="Cover${index}"] .resume-pages`);
    await expect(paper).toHaveAttribute('data-compose-state', 'ready');
    await expect(paper.locator(`.resume-page[data-template-id="Cover${index}"]`).first()).toBeVisible();
    for (const text of ['Asha Rao', 'REAL LETTER BODY: I build reliable products.', 'Northstar Systems', 'Hiring Manager', '10 Business Road', '12 Real Street']) await expect(paper).toContainText(text);
    await expect(paper).not.toContainText('Acme Innovations Corporation');
    await assertPageGeometry(page);
    console.log(`cover export PASS Cover${index}`);
  }
  expect(coverReads).toBe(initialCoverReads);
  expect(errors).toEqual([]);
});

test('gallery changes candidates without retaining previous content or zoom', async ({ page, context }) => {
  await fixtures(context);
  const second = { ...representative, id: 'resume-22', name: 'Second resume', firstname: 'Neha', lastname: 'Shah', summary: 'SECOND-CANDIDATE-ONLY', experience: [{ position: 'Researcher', company: 'Other Company', description: 'SECOND-DATA-ONLY' }] };
  await context.route('**/api/resumes', route => route.fulfill({ json: { resumes: [representative, second] } }));
  await context.route('**/api/resumes/resume-22', route => route.fulfill({ json: { resume: second } }));
  const errors = collectErrors(page);
  await openGallery(page);
  await page.getByLabel('Search templates').fill('Metropolitan');
  await page.getByRole('button', { name: 'Preview Metropolitan Navy' }).click();
  const firstDialog = page.getByRole('dialog', { name: 'Asha Rao' });
  await firstDialog.getByRole('button', { name: 'Zoom in' }).click();
  await expect(firstDialog.getByLabel('Preview zoom 110 percent')).toBeVisible();
  await firstDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Resume for preview').selectOption('resume-22');
  await page.getByRole('button', { name: 'Preview Metropolitan Navy' }).click();
  const secondDialog = page.getByRole('dialog', { name: 'Neha Shah' });
  await expect(secondDialog.getByLabel('Preview zoom 100 percent')).toBeVisible();
  await expect(secondDialog.locator('.resume-pages')).toContainText('SECOND-DATA-ONLY');
  await expect(secondDialog.locator('.resume-pages')).not.toContainText('Northstar Systems');
  expect(errors).toEqual([]);
});

test('one-time export token is redeemed once despite React Strict Mode effect replay', async ({ page, context }) => {
  await fixtures(context);
  let redemptions = 0;
  await context.route('**/api/export-render-data**', route => {
    redemptions++;
    return route.fulfill(redemptions === 1 ? { json: { data: representative } } : { status: 404, json: { error: 'Token already consumed' } });
  });
  const errors = collectErrors(page);
  await openExport(page, 'Cv1');
  await expect(page.locator('html')).toHaveAttribute('data-export-ready', 'true');
  await expect(page.locator('.resume-pages')).toContainText('Asha Rao');
  expect(redemptions).toBe(1);
  expect(errors).toEqual([]);
});

test('saved custom sections and extended education, project, certification and reference fields survive export and share', async ({ page, context }) => {
  const resume = {
    ...representative, address: 'ACTUAL ADDRESS', postalcode: 'POST-520001',
    education: [{ degree: 'MSc', institution: 'Actual School', location: 'EDUCATION LOCATION', description: 'Education details' }],
    projects: [{ title: 'Actual Project', description: 'Project details', startDate: 'PROJECT-START', endDate: 'PROJECT-END', liveUrl: 'https://example.test/live', githubUrl: 'https://example.test/project-repo' }],
    certifications: [{ name: 'Actual Certification', issuer: 'Actual Issuer', issueDate: 'ISSUED-2022', expiryDate: 'EXPIRES-2026', credentialId: 'ACTUAL-CREDENTIAL-ID', credentialUrl: 'https://example.test/credential' }],
    achievements: [{ title: 'Actual Achievement', date: 'ACHIEVEMENT-DATE', description: 'Achievement details' }],
    references: [{ name: 'Actual Reference', relationship: 'REFERENCE-RELATIONSHIP' }],
    customSections: [{ id: 'cs1', sectionTitle: 'VOLUNTEER LEADERSHIP', items: [{ id: 'ci1', title: 'Community lead', description: 'CUSTOM-SECTION-BODY' }] }],
  };
  await fixtures(context, resume);
  await context.route('**/api/resumes/public/resume-11g', route => route.fulfill({ json: { resume, publication: { isPublished: true } } }));
  const errors = collectErrors(page);
  const expected = ['ACTUAL ADDRESS', 'POST-520001', 'EDUCATION LOCATION', 'PROJECT-START', 'PROJECT-END', 'https://example.test/project-repo', 'ISSUED-2022', 'EXPIRES-2026', 'ACTUAL-CREDENTIAL-ID', 'https://example.test/credential', 'ACHIEVEMENT-DATE', 'REFERENCE-RELATIONSHIP', 'VOLUNTEER LEADERSHIP', 'Community lead', 'CUSTOM-SECTION-BODY'];
  await openExport(page, 'Cv1');
  for (const value of expected) await expect(page.locator('.resume-pages')).toContainText(value);
  await assertPageGeometry(page);
  await page.goto('/shared/resume-11g');
  await expect(page.locator('.resume-pages')).toHaveAttribute('data-compose-state', 'ready');
  for (const value of expected) await expect(page.locator('.resume-pages')).toContainText(value);
  await assertPageGeometry(page);
  expect(errors).toEqual([]);
});

test('controlled preview opened from the resume builder restores keyboard focus', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  await page.goto('/build-resume/resume-11g');
  const triggers = page.getByRole('button', { name: 'Preview', exact: true });
  const trigger = triggers.first();
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Asha Rao' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('optional sections were not supplied');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('malformed one-time export links show an error and never signal readiness', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  await page.goto('/export/Cv1/resume-11g/en#renderToken=bad');
  await expect(page.getByRole('heading', { name: 'Cannot Load Resume' })).toBeVisible();
  await expect(page.getByText('This export link is malformed. Request a new export.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-export-error', /malformed/);
  await expect(page.locator('html')).not.toHaveAttribute('data-export-ready', 'true');
  await expect(page.locator('.resume-document')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('long cover letters use cover continuation labels and retain the body across A4 pages', async ({ page, context }) => {
  const words = Array.from({ length: 1_100 }, (_, index) => `COVERWORD${String(index).padStart(4, '0')}`);
  await fixtures(context, { ...representative, letterBody: `<p>${words.join(' ')}</p>` });
  const errors = collectErrors(page);
  await openExport(page, 'Cover3');
  const sheets = await assertPageGeometry(page);
  expect(sheets.length).toBeGreaterThan(1);
  await expect(page.locator('.resume-page').nth(1)).toHaveAttribute('aria-label', 'Cover letter page 2');
  await expect(page.locator('.resume-page').nth(1).locator('.resume-continuation-header')).toContainText('Cover Letter');
  const text = await page.locator('.resume-pages').innerText();
  for (const marker of words) expect(text.split(marker).length - 1, marker).toBe(1);
  expect(errors).toEqual([]);
});

test('the composer applies same-template source style changes without stale pages', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  await openExport(page, 'Cv1');
  await page.locator('[data-resume-source]').evaluate(source => (source as HTMLElement).style.setProperty('--resume-primary', '#654321'));
  await expect.poll(() => page.locator('.resume-page').first().evaluate(sheet => (sheet as HTMLElement).style.getPropertyValue('--resume-primary'))).toBe('#654321');
  await assertPageGeometry(page);
  expect(errors).toEqual([]);
});


test('direct saved-resume preview rejects an unsupported persisted template', async ({ page, context }) => {
  await fixtures(context, { ...representative, template: 'UnknownTemplate' });
  const errors = collectErrors(page);
  await page.goto('/preview/resume-11g');
  await expect(page.getByRole('heading', { name: 'Cannot Load Resume' })).toBeVisible();
  await expect(page.getByText(/Unsupported template layout/)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-export-error', /Unsupported template/);
  await expect(page.locator('.resume-document')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('a copied private preview link uses the current export template', async ({ page, context }) => {
  await fixtures(context);
  const errors = collectErrors(page);
  await openExport(page, 'Cv1');
  await chooseExportTemplate(page, 'Cv2');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (value: string) => { (window as unknown as { copiedLink: string }).copiedLink = value; return Promise.resolve(); } } }));
  await page.getByRole('button', { name: 'Copy preview link' }).click();
  const copied = new URL(await page.evaluate(() => (window as unknown as { copiedLink: string }).copiedLink));
  expect(copied.pathname).toBe('/export/Cv2/resume-11g/en');
  expect(copied.hash).toBe('');
  expect(copied.searchParams.has('print')).toBe(false);
  expect(errors).toEqual([]);
});


test('the export honors a server-supplied watermark on every page and omits it when absent', async ({ page, context }) => {
  const resume = {
    ...representative, _watermark: { enableFreeWatermark: true, watermarkText: 'SUPPLIED WATERMARK', opacity: 0.18, position: 'diagonal' },
    experience: Array.from({ length: 12 }, (_, index) => ({ position: `Role ${index}`, company: `Company ${index}`, description: 'Detailed work. '.repeat(22) })),
  };
  await fixtures(context, resume);
  const errors = collectErrors(page);
  await openExport(page, 'Cv4');
  const sheets = page.locator('.resume-page');
  const count = await sheets.count();
  expect(count).toBeGreaterThan(1);
  await expect(page.locator('.resume-page .resume-watermark')).toHaveCount(count);
  for (const watermark of await page.locator('.resume-page .resume-watermark').all()) {
    await expect(watermark).toHaveAttribute('aria-hidden', 'true');
    await expect(watermark).toContainText('SUPPLIED WATERMARK');
  }
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  expect(document.numPages).toBe(count);
  for (let number = 1; number <= count; number++) {
    const content = (await (await document.getPage(number)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ');
    expect(content.replace(/\s+/g, '')).toContain('SUPPLIEDWATERMARK');
  }
  await context.route('**/api/export-render-data**', route => route.fulfill({ json: { data: { ...representative, _watermark: null } } }));
  await page.goto('about:blank');
  await openExport(page, 'Cv4');
  await expect(page.locator('.resume-page .resume-watermark')).toHaveCount(0);
  expect(errors).toEqual([]);
});
