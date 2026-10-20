/**
 * Portfolios — /dashboard/portfolio (builder), /portfolios (gallery) and
 * /portfolio/:slug (public page) — at the five directive profiles.
 *
 * Real stack only: UI :4000 → Express :8080 → MariaDB bridge. The module gate is
 * real server configuration (public_config.modules.enablePortfolioModule, off by
 * default). Each group sets the state it needs with
 * scripts/dev-db/set-public-module.mjs, which only runs against a loopback sandbox
 * or test database, and the shipped default (off) is restored afterwards.
 *
 * Env for the helper (defaults match scripts/dev-db/README.md): E2E_DB_HOST,
 * E2E_DB_PORT, E2E_DB_USER, E2E_DB_PASSWORD, E2E_DB_NAME (ime365_sandbox).
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, test, tokenFor } from './fixtures';
import { buildDocument, emptyCanonical, type PortfolioCanonical } from '../../src/lib/portfolio-document';

type Account = 'a' | 'b';
const repoRoot = path.resolve(process.cwd(), '..');

function setPortfolioModule(enabled: boolean) {
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'dev-db', 'set-public-module.mjs'), '--module', 'enablePortfolioModule', '--value', String(enabled)], {
    env: {
      ...process.env,
      DB_HOST: process.env.E2E_DB_HOST || '127.0.0.1',
      DB_PORT: process.env.E2E_DB_PORT || '3306',
      DB_USER: process.env.E2E_DB_USER || 'root',
      DB_PASSWORD: process.env.E2E_DB_PASSWORD || '',
      DB_NAME: process.env.E2E_DB_NAME || 'ime365_sandbox',
    },
    stdio: 'pipe',
  });
}

async function settleAnimations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => undefined))));
}

/** Dialogs are portaled outside #main-content, so scan them with scope '[role="dialog"]'. */
async function expectNoAxeViolations(page: Page, scope = '#main-content') {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 5).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
}

const auth = (account: Account) => ({ Authorization: `Bearer ${tokenFor(account)}` });

interface Stored { id: string; title: string; revision: number; slug: string | null; isPublished: boolean; canonical?: PortfolioCanonical; templateKey?: string; renderer?: string }

async function clearPortfolios(request: APIRequestContext, account: Account) {
  const list = await request.get('/api/portfolios', { headers: auth(account) });
  expect(list.status(), `listing ${account}'s portfolios`).toBe(200);
  for (const portfolio of ((await list.json()) as { portfolios: Stored[] }).portfolios) {
    const removed = await request.delete(`/api/portfolios/${encodeURIComponent(portfolio.id)}`, { headers: auth(account), data: { expectedRevision: portfolio.revision } });
    expect(removed.status(), `deleting ${portfolio.id}`).toBe(200);
  }
}

const sampleCanonical = (): PortfolioCanonical => ({
  ...emptyCanonical('modernMinimal'),
  heading: { ...emptyCanonical().heading, firstname: 'Avery', lastname: 'Tester', fullName: 'Avery Tester', occupation: 'QA engineer', city: 'Pune', country: 'India' },
  summary: 'I test checkout flows end to end and automate the boring parts.',
  projects: [{ id: 'project-1', title: 'Checkout test suite', description: 'Browser tests for 120 payment flows.', link: 'https://example.test/suite', technologies: 'Playwright, TypeScript', technologyList: ['Playwright', 'TypeScript'], image: '' }],
});

async function seedPortfolio(request: APIRequestContext, account: Account, title: string, canonical = sampleCanonical()): Promise<Stored> {
  const id = `portfolio_e2e_${randomUUID().replace(/-/g, '')}`;
  const response = await request.post(`/api/portfolios/${id}`, { headers: auth(account), data: { expectedRevision: 0, portfolio: buildDocument({ canonical, title, isPublished: false }) } });
  expect(response.status(), `seeding ${id}`).toBe(201);
  return ((await response.json()) as { portfolio: Stored }).portfolio;
}

async function storedPortfolio(request: APIRequestContext, account: Account, id: string) {
  const response = await request.get(`/api/portfolios/${encodeURIComponent(id)}`, { headers: auth(account) });
  return { status: response.status(), body: response.status() === 200 ? ((await response.json()) as { portfolio: Stored }).portfolio : null };
}

/** The server issues `<normalized base>-<first 8 hex of sha256(portfolio id)>`. */
const expectedSlug = (base: string, id: string) => `${base}-${createHash('sha256').update(id).digest('hex').slice(0, 8)}`;

const main = (page: Page) => page.locator('#main-content');
const heading1 = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name });

test.describe('Portfolios — module turned off (the shipped default)', () => {
  test.beforeAll(() => setPortfolioModule(false));

  test('the builder explains the module is off and offers no editing; legacy paths redirect', async ({ page, guard }) => {
    guard.expectApiStatuses(403);
    for (const route of ['/dashboard/portfolio', '/dashboard/portfolios', '/portfolio/builder', '/dashboard/portfolio/portfolio_e2e_any']) {
      const response = page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/api/portfolios'));
      await page.goto(route);
      const answered = await response;
      expect(answered.status()).toBe(403);
      expect(((await answered.json()) as { code: string }).code).toBe('PORTFOLIO_MODULE_DISABLED');
      await expect(page.getByRole('heading', { level: 2, name: 'Portfolios are turned off' })).toBeVisible();
      if (route !== '/dashboard/portfolio/portfolio_e2e_any') await expect(page).toHaveURL(/\/dashboard\/portfolio$/);
    }
    await expect(page.getByRole('button', { name: 'New portfolio' })).toHaveCount(0);
    await expect(main(page).getByRole('textbox')).toHaveCount(0);
    await expect(main(page)).not.toContainText(/Live & Published|API route not found/);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await main(page).getByRole('link', { name: 'See published portfolios' }).click();
    await expect(heading1(page, 'Portfolios')).toBeVisible();
    await expect(page).toHaveURL(/\/portfolios$/);
  });

  test('public pages keep working while the module is off', async ({ page, guard }) => {
    guard.expectApiStatuses(404);
    const listed = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/portfolios/public');
    await page.goto('/portfolios');
    expect((await listed).status()).toBe(200);
    await expect(page.getByRole('status').filter({ hasText: /published portfolio/ })).toBeVisible();
    await expectNoAxeViolations(page);
    const missing = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/portfolios/public/no-such-address-1a2b3c4d');
    await page.goto('/portfolio/no-such-address-1a2b3c4d');
    expect((await missing).status()).toBe(404);
    await expect(heading1(page, 'Portfolio not found')).toBeVisible();
    await expect(main(page)).not.toContainText(/API route|Error:/);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});

test.describe('Portfolios — module turned on', () => {
  test.beforeAll(() => setPortfolioModule(true));
  test.afterAll(() => setPortfolioModule(false));
  const createdResumes: string[] = [];
  test.beforeEach(async ({ request }) => {
    await clearPortfolios(request, 'a');
    await clearPortfolios(request, 'b');
  });
  test.afterEach(async ({ request }) => {
    while (createdResumes.length) await request.delete(`/api/resumes/${createdResumes.pop()}`, { headers: auth('a') });
  });

  test('create a draft with validation, edit, save; the stored document persists across reload', async ({ page, request }) => {
    await page.goto('/dashboard/portfolio');
    await expect(page.getByRole('heading', { level: 2, name: 'You have no portfolios yet' })).toBeVisible();
    await expectNoAxeViolations(page);

    const newButton = page.getByRole('button', { name: 'New portfolio' });
    await newButton.click();
    const dialog = page.getByRole('dialog', { name: 'New portfolio' });
    await expect(dialog.getByRole('textbox', { name: 'Title', exact: true })).toBeFocused();
    await expect(dialog.getByText('You have no saved resumes yet.')).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /One of my saved resumes/ })).toBeDisabled();
    await expectNoAxeViolations(page, '[role="dialog"]');
    await dialog.getByRole('button', { name: 'Create draft' }).click();
    await expect(dialog.getByText('Give your portfolio a title.')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Title', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(newButton).toBeFocused();

    await newButton.click();
    await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('QA portfolio');
    await dialog.getByRole('radio', { name: /Executive/ }).check();
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/portfolios/portfolio_'));
    await dialog.getByRole('button', { name: 'Create draft' }).click();
    expect((await created).status()).toBe(201);
    await expect(page).toHaveURL(/\/dashboard\/portfolio\/portfolio_[A-Za-z0-9_-]+$/);
    const id = decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);
    await expect(heading1(page, 'QA portfolio')).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(page.getByText('All changes saved')).toBeVisible();

    await page.getByLabel('First name').fill('Avery');
    await page.getByLabel('Last name').fill('Tester');
    await page.getByLabel('Occupation').fill('QA engineer');
    await page.getByLabel('About').fill('I test checkout flows end to end.');
    await page.getByRole('button', { name: 'Add experience' }).click();
    await expect(page.getByRole('group', { name: 'Experience 1' }).getByLabel('Job title')).toBeFocused();
    await page.getByRole('group', { name: 'Experience 1' }).getByLabel('Job title').fill('QA engineer');
    await page.getByRole('group', { name: 'Experience 1' }).getByLabel('Employer').fill('Example Test Co');
    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('group', { name: 'Project 1' }).getByLabel('Project name').fill('Checkout test suite');
    await page.getByRole('group', { name: 'Project 1' }).getByLabel('Technologies').fill('Playwright, TypeScript');
    await page.getByRole('button', { name: 'Add skill' }).click();
    await page.getByRole('group', { name: 'Skill 1' }).getByLabel('Skill').fill('Accessibility testing');
    await page.getByRole('button', { name: 'Add education' }).click();
    await page.getByRole('button', { name: 'Remove education 1' }).click();
    await expect(page.getByRole('button', { name: 'Add education' })).toBeFocused();
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/portfolios/${id}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText('All changes saved')).toBeVisible();

    const { body: stored } = await storedPortfolio(request, 'a', id);
    expect(stored).toMatchObject({ title: 'QA portfolio', isPublished: false, slug: null, renderer: 'webcv', templateKey: 'executive', revision: 2 });
    expect(stored!.canonical!.heading).toMatchObject({ firstname: 'Avery', lastname: 'Tester', fullName: 'Avery Tester', occupation: 'QA engineer' });
    expect(stored!.canonical!.experiences.map((entry) => [entry.jobTitle, entry.employer])).toEqual([['QA engineer', 'Example Test Co']]);
    expect(stored!.canonical!.projects[0].technologyList).toEqual(['Playwright', 'TypeScript']);
    expect(stored!.canonical!.skills.map((skill) => skill.name)).toEqual(['Accessibility testing']);
    expect(stored!.canonical!.education).toEqual([]);

    await page.reload();
    await expect(page.getByLabel('First name')).toHaveValue('Avery');
    await expect(page.getByRole('group', { name: 'Experience 1' }).getByLabel('Employer')).toHaveValue('Example Test Co');
    await expect(page.getByRole('group', { name: 'Project 1' }).getByLabel('Technologies')).toHaveValue('Playwright, TypeScript');
    await expect(page.getByRole('radio', { name: /Executive/ })).toBeChecked();

    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.getByRole('region', { name: 'Preview of your portfolio' });
    await expect(preview.getByRole('heading', { level: 2, name: 'Avery Tester' })).toBeVisible();
    await expect(preview.getByRole('list', { name: 'Technologies used in Checkout test suite' })).toContainText('Playwright');
    await expectNoAxeViolations(page);

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/portfolio$/);
    await expect(page.getByRole('heading', { level: 2, name: 'QA portfolio' })).toBeVisible();
    await page.goForward();
    await expect(heading1(page, 'QA portfolio')).toBeVisible();
  });

  test('publish through the exact server address; public page, gallery search, unpublish and publish again', async ({ page, browser, request, context }) => {
    const seeded = await seedPortfolio(request, 'a', 'Avery Tester — QA');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/dashboard/portfolio/${seeded.id}`);
    const publish = page.getByRole('button', { name: 'Publish', exact: true });
    await publish.click();
    const dialog = page.getByRole('dialog', { name: 'Publish your portfolio' });
    const address = dialog.getByLabel('Address');
    await expect(address).toBeFocused();
    await expect(address).toHaveValue('avery-tester');
    const slug = expectedSlug('avery-tester', seeded.id);
    await expect(dialog.getByText(`Available: http://127.0.0.1:4000/portfolio/${slug}`)).toBeVisible();
    await expectNoAxeViolations(page, '[role="dialog"]');
    await address.fill('ab');
    await expect(dialog.getByText('Use at least 3 letters or numbers.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Publish' })).toBeDisabled();
    await address.fill('Avery Tester');
    await expect(dialog.getByText(`Available: http://127.0.0.1:4000/portfolio/${slug}`)).toBeVisible();
    const published = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/portfolios/${seeded.id}`);
    await dialog.getByRole('button', { name: 'Publish' }).click();
    expect((await published).status()).toBe(200);
    await expect(dialog).toBeHidden();
    const unpublish = page.getByRole('button', { name: 'Unpublish' });
    await expect(unpublish).toBeFocused();
    await expect(page.getByText('Published', { exact: true })).toBeVisible();
    const publicUrl = `http://127.0.0.1:4000/portfolio/${slug}`;
    await expect(main(page).getByRole('link', { name: new RegExp(publicUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);
    expect((await storedPortfolio(request, 'a', seeded.id)).body).toMatchObject({ isPublished: true, slug });

    // A visitor without an account sees the published page; owner fields never cross the boundary.
    const visitor = await browser.newContext({ baseURL: 'http://127.0.0.1:4000' });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/portfolio/${slug}`);
    await expect(visitorPage.getByRole('heading', { level: 1, name: 'Avery Tester' })).toBeVisible();
    await expect(visitorPage.getByText('I test checkout flows end to end and automate the boring parts.')).toBeVisible();
    await expect(visitorPage.getByRole('link', { name: /View Checkout test suite/ })).toHaveAttribute('href', 'https://example.test/suite');
    await expectNoHorizontalOverflow(visitorPage);
    await expectNoAxeViolations(visitorPage);
    const publicBody = (await (await request.get(`/api/portfolios/public/${slug}`)).json()) as { portfolio: Record<string, unknown> };
    expect(Object.keys(publicBody.portfolio).sort()).toEqual(['data', 'id', 'isPublished', 'metadata', 'publishedAt', 'slug', 'theme', 'title']);

    // The gallery lists it; search lives in the URL and survives reload.
    await visitorPage.goto('/portfolios');
    await expect(visitorPage.getByRole('heading', { level: 2, name: 'Avery Tester — QA' })).toBeVisible();
    await visitorPage.getByLabel('Search').fill('avery tester');
    await expect(visitorPage).toHaveURL(/q=avery\+tester|q=avery%20tester/);
    await visitorPage.reload();
    await expect(visitorPage.getByLabel('Search')).toHaveValue('avery tester');
    await expect(visitorPage.getByRole('heading', { level: 2, name: 'Avery Tester — QA' })).toBeVisible();
    await visitorPage.getByLabel('Search').fill('zz-no-match-zz');
    await expect(visitorPage.getByRole('heading', { level: 2, name: 'No portfolios match' })).toBeVisible();
    await visitorPage.getByRole('button', { name: 'Clear search and filter' }).click();
    await expect(visitorPage.getByLabel('Search')).toHaveValue('');
    await expectNoAxeViolations(visitorPage);
    await visitorPage.getByRole('link', { name: 'View Avery Tester — QA' }).click();
    await expect(visitorPage).toHaveURL(new RegExp(`/portfolio/${slug}$`));

    // Unpublish asks first; Escape keeps it published and returns focus.
    await unpublish.click();
    const confirm = page.getByRole('dialog', { name: 'Unpublish this portfolio?' });
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(confirm).toContainText(publicUrl);
    await page.keyboard.press('Escape');
    await expect(unpublish).toBeFocused();
    await unpublish.click();
    await confirm.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(publish).toBeFocused();
    await visitor.close();
    // Public responses carry Cache-Control max-age=60 (+ stale-while-revalidate), so a browser
    // that already viewed the page may keep a copy for a few minutes (the dialog says so).
    // Uncached observers see the change at once.
    expect((await request.get(`/api/portfolios/public/${slug}`)).status()).toBe(404);
    const freshVisitor = await browser.newContext({ baseURL: 'http://127.0.0.1:4000' });
    const freshPage = await freshVisitor.newPage();
    await freshPage.goto(`/portfolio/${slug}`);
    await expect(freshPage.getByRole('heading', { level: 1, name: 'Portfolio not found' })).toBeVisible();
    await freshVisitor.close();

    // Publishing again reuses the reserved address.
    await publish.click();
    const again = page.getByRole('dialog', { name: 'Publish again?' });
    await expect(again).toContainText(publicUrl);
    await again.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published', { exact: true })).toBeVisible();
    expect((await request.get(`/api/portfolios/public/${slug}`)).status()).toBe(200);
    const returning = await browser.newContext({ baseURL: 'http://127.0.0.1:4000' });
    const returningPage = await returning.newPage();
    await returningPage.goto(`/portfolio/${slug}`);
    await expect(returningPage.getByRole('heading', { level: 1, name: 'Avery Tester' })).toBeVisible();
    await returning.close();
  });

  test('a save from another tab is never overwritten: the conflict is explained and the latest version reloads', async ({ page, request, guard }) => {
    guard.expectApiStatuses(409);
    const seeded = await seedPortfolio(request, 'a', 'Conflict check');
    await page.goto(`/dashboard/portfolio/${seeded.id}`);
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Changed in this tab');
    // "Another tab" saves first, through the same API.
    const otherTab = await request.post(`/api/portfolios/${seeded.id}`, {
      headers: auth('a'),
      data: { expectedRevision: seeded.revision, portfolio: buildDocument({ canonical: sampleCanonical(), title: 'Saved in another tab', isPublished: false }) },
    });
    expect(otherTab.status()).toBe(200);
    const rejected = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/portfolios/${seeded.id}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await rejected).status()).toBe(409);
    const alert = main(page).getByRole('alert');
    await expect(alert).toContainText('This portfolio changed elsewhere');
    await expect(alert).toBeInViewport({ ratio: 1 });
    expect((await storedPortfolio(request, 'a', seeded.id)).body?.title).toBe('Saved in another tab');
    await expectNoAxeViolations(page);
    await alert.getByRole('button', { name: 'Reload latest version' }).click();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Saved in another tab');
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(main(page).getByRole('alert')).toHaveCount(0);
  });

  test('delete asks first and removes the record; another account can never read or change it', async ({ page, request, browser, guard }) => {
    guard.expectApiStatuses(404);
    const seeded = await seedPortfolio(request, 'a', 'Delete check');
    const path = `/api/portfolios/${seeded.id}`;
    expect((await request.get(path, { headers: auth('b') })).status()).toBe(404);
    expect((await request.post(path, { headers: auth('b'), data: { expectedRevision: seeded.revision, portfolio: { title: 'Taken over' } } })).status()).toBe(404);
    expect((await request.delete(path, { headers: auth('b'), data: { expectedRevision: seeded.revision } })).status()).toBe(404);
    expect((await request.get('/api/portfolios')).status()).toBe(401);
    expect((await storedPortfolio(request, 'a', seeded.id)).body?.title).toBe('Delete check');

    const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4000', storageState: 'test-results/.auth/candidate-b.json' });
    const otherPage = await other.newPage();
    await otherPage.goto(`/dashboard/portfolio/${seeded.id}`);
    await expect(otherPage.getByRole('heading', { level: 1, name: 'Portfolio not found' })).toBeVisible();
    await other.close();

    await page.goto('/dashboard/portfolio');
    const remove = page.getByRole('button', { name: 'Delete Delete check' });
    await remove.click();
    const dialog = page.getByRole('dialog', { name: 'Delete this portfolio?' });
    await expect(dialog).toContainText('“Delete check” will be deleted permanently.');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectNoAxeViolations(page, '[role="dialog"]');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(remove).toBeFocused();
    await remove.click();
    const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE');
    await dialog.getByRole('button', { name: 'Delete portfolio' }).click();
    expect((await deleted).status()).toBe(200);
    await expect(page.getByRole('status').filter({ hasText: '“Delete check” was deleted.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'You have no portfolios yet' })).toBeVisible();
    expect((await storedPortfolio(request, 'a', seeded.id)).status).toBe(404);
  });

  test('start from a saved resume: its details are copied into the new draft', async ({ page, request }) => {
    const resumeId = `res_e2e_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const resume = await request.post(`/api/resumes/${resumeId}`, {
      headers: auth('a'),
      data: {
        title: 'Portfolio source resume', template: 'Cv1', firstname: 'Riya', lastname: 'Sharma', email: 'p002.candidate.a@example.test', occupation: 'Data analyst',
        summary: 'Analyst who turns messy spreadsheets into weekly decisions.',
        employments: [{ jobTitle: 'Data analyst', employer: 'Example Test Co', begin: '2022-01', end: '', description: 'Owned the weekly sales report.' }],
        skills: [{ name: 'SQL', category: 'Tools' }],
      },
    });
    expect(resume.status()).toBe(200);
    createdResumes.push(resumeId);
    await page.goto('/dashboard/portfolio');
    await page.getByRole('button', { name: 'New portfolio' }).click();
    const dialog = page.getByRole('dialog', { name: 'New portfolio' });
    await expect(dialog.getByRole('radio', { name: /One of my saved resumes/ })).toBeChecked();
    const picker = dialog.getByRole('combobox', { name: 'Resume', exact: true });
    await expect(picker).toBeVisible();
    await picker.selectOption(resumeId);
    await expect(picker).toHaveValue(resumeId);
    await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('From my resume');
    await dialog.getByRole('button', { name: 'Create draft' }).click();
    await expect(heading1(page, 'From my resume')).toBeVisible();
    await expect(page.getByLabel('First name')).toHaveValue('Riya');
    await expect(page.getByLabel('Occupation')).toHaveValue('Data analyst');
    await expect(page.getByRole('group', { name: 'Experience 1' }).getByLabel('Employer')).toHaveValue('Example Test Co');
    await expect(page.getByRole('group', { name: 'Skill 1' }).getByLabel('Skill')).toHaveValue('SQL');
    await expect(page.getByText('Started from the resume “Portfolio source resume”.', { exact: false })).toBeVisible();
  });

  test('sections the builder does not edit survive a save and still render', async ({ page, request }) => {
    const canonical = {
      ...sampleCanonical(),
      certifications: [{ id: 'certification-1', title: 'ISTQB Foundation', issuer: 'ISTQB', date: '2021', description: '', link: '' }],
      languages: [{ id: 'language-1', name: 'Hindi', level: 'Native' }],
      hobbies: ['Chess'],
    };
    const seeded = await seedPortfolio(request, 'a', 'Kept sections', canonical);
    await page.goto(`/dashboard/portfolio/${seeded.id}`);
    const kept = page.getByRole('region', { name: 'Also included' });
    await expect(kept).toContainText('1 certification');
    await expect(kept).toContainText('1 language');
    await expect(kept).toContainText('1 interest');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Kept sections, renamed');
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/portfolios/${seeded.id}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).status()).toBe(200);
    const { body } = await storedPortfolio(request, 'a', seeded.id);
    expect(body?.title).toBe('Kept sections, renamed');
    expect(body?.canonical?.certifications.map((entry) => entry.title)).toEqual(['ISTQB Foundation']);
    expect(body?.canonical?.languages.map((entry) => [entry.name, entry.level])).toEqual([['Hindi', 'Native']]);
    expect(body?.canonical?.hobbies).toEqual(['Chess']);
    expect(body?.canonical?.projects.map((entry) => entry.title)).toEqual(['Checkout test suite']);
    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.getByRole('region', { name: 'Preview of your portfolio' });
    await expect(preview.getByRole('heading', { level: 3, name: 'Certifications' })).toBeVisible();
    await expect(preview).toContainText('ISTQB Foundation');
    await expect(preview).toContainText('Hindi · Native');
  });

  test('an earlier-editor portfolio is read-only here, publishes at the chosen address, and keeps its blocks', async ({ page, request, browser }) => {
    const id = `portfolio_e2e_${randomUUID().replace(/-/g, '')}`;
    const blocks = [{ type: 'Hero', props: { id: 'hero-1', title: 'Hello from blocks' } }];
    const seeded = await request.post(`/api/portfolios/${id}`, {
      headers: auth('a'),
      data: { expectedRevision: 0, portfolio: { title: 'Earlier editor page', renderer: 'puck', content: blocks, root: { props: { title: 'Earlier editor page', description: 'Built with blocks.' } }, description: 'Built with blocks.', isPublished: false } },
    });
    expect(seeded.status()).toBe(201);
    await page.goto(`/dashboard/portfolio/${id}`);
    await expect(page.getByText('Built with the earlier page editor', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish your portfolio' });
    await dialog.getByLabel('Address').fill('earlier-blocks');
    const slug = expectedSlug('earlier-blocks', id);
    await expect(dialog.getByText(`Available: http://127.0.0.1:4000/portfolio/${slug}`)).toBeVisible();
    await dialog.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published', { exact: true })).toBeVisible();
    const { body } = await storedPortfolio(request, 'a', id);
    expect(body).toMatchObject({ isPublished: true, slug, renderer: 'puck', title: 'Earlier editor page' });
    expect((body as unknown as { content: unknown[] }).content).toEqual(blocks);
    const visitor = await browser.newContext({ baseURL: 'http://127.0.0.1:4000' });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/portfolio/${slug}`);
    await expect(visitorPage.getByRole('heading', { level: 1, name: 'Earlier editor page' })).toBeVisible();
    await expect(visitorPage.getByText('built with an earlier page editor', { exact: false })).toBeVisible();
    await visitor.close();
  });
});
