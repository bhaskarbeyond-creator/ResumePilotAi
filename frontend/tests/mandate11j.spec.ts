/**
 * Mandate 11J — end-to-end suite: Web CV builder, persistent drafts, section
 * visibility, the split-screen live preview, the revision-conflict workflow,
 * the module-disabled state, publication, the public portfolio, the showcase
 * gallery, sharing (clipboard + QR) and custom-domain verification.
 *
 * The application is not modified for testing and the server is not stubbed in
 * production code: every `/api` request is answered here with a fixture that
 * follows the real backend contracts (backend/routes/portfolios.js,
 * backend/services/publicPortfolio.js, backend/services/customDomains.js), and
 * authentication uses the preview identity the AuthProvider already supports.
 * Assertions are about observable behaviour — what the page shows, which request
 * it sends, and what stays unsent — never merely that an element exists.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* ─── Identity ─── */

const CANDIDATE = { uid: 'usr_cand_11j', email: 'priya@example.test', displayName: 'Priya Sharma', role: 'USER' };

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const previewToken = () =>
  `rptest.${b64url({ uid: CANDIDATE.uid, email: CANDIDATE.email, role: CANDIDATE.role, exp: Math.floor(Date.now() / 1000) + 3600 })}.${'b'.repeat(64)}`;

async function seedPreviewSession(page: Page) {
  await page.addInitScript((record) => {
    if (window.sessionStorage.getItem('m11j_seeded')) return;
    window.sessionStorage.setItem('m11j_seeded', '1');
    window.localStorage.setItem('ime_dev_user', JSON.stringify(record));
  }, { ...CANDIDATE, token: previewToken() });
}

/* ─── Portfolio fixtures (the real API contract) ─── */

type Visibility = {
  showExperience: boolean;
  showEducation: boolean;
  showProjects: boolean;
  showSkills: boolean;
  showContact: boolean;
};

interface StoredPortfolio {
  id: string;
  title: string;
  slug: string | null;
  isPublished: boolean;
  revision: number;
  publishedAt: string | null;
  updatedAt: string | null;
  renderer: string;
  templateKey: string;
  template: string;
  theme: string;
  seoTitle: string;
  seoDescription: string;
  description: string;
  tags: string[];
  visibility: Visibility;
  canonical: Record<string, unknown>;
  content: unknown[];
  root: { props: Record<string, unknown> };
  data?: unknown;
  [key: string]: unknown;
}

const ALL_VISIBLE: Visibility = {
  showExperience: true,
  showEducation: true,
  showProjects: true,
  showSkills: true,
  showContact: true,
};

function canonicalFor(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    template: 'modernMinimal',
    heading: {
      firstname: 'Priya',
      lastname: 'Sharma',
      fullName: 'Priya Sharma',
      occupation: 'Data analyst',
      email: 'priya@example.test',
      phone: '+91 90000 00000',
      city: 'Vijayawada',
      country: 'India',
      address: '12 Secret Lane',
      postalcode: '520001',
      website: 'https://priya.example.test',
      linkedin: '',
      github: '',
      photo: '',
    },
    summary: 'Analyst building accessible data products.',
    experiences: [
      { id: 'experience-1', jobTitle: 'Analyst', employer: 'IME365', begin: '2022', end: 'Present', description: 'Built dashboards.', date: 1, location: 'Remote' },
    ],
    education: [
      { id: 'education-1', school: 'Andhra University', degree: 'BSc Statistics', started: '2016', finished: '2019', description: '', date: 1 },
    ],
    skills: [{ id: 'skill-1', name: 'SQL', skillName: 'SQL', rating: 80, category: 'Data' }],
    projects: [{ id: 'project-1', title: 'Portfolio Studio', description: 'A Web CV builder.', link: 'https://example.test/p', technologies: 'React', technologyList: ['React'], image: '' }],
    certifications: [],
    achievements: [],
    references: [],
    languages: [],
    hobbies: [],
    customSections: [],
    extras: { tagline: 'Analyst', heroImage: '', seoTitle: '', seoDescription: '' },
    source: { resumeId: null, resumeTitle: '', ingestedAt: null },
    visibility: { ...ALL_VISIBLE },
    ...overrides,
  };
}

function storedPortfolio(overrides: Partial<StoredPortfolio> = {}): StoredPortfolio {
  const canonical = (overrides.canonical as Record<string, unknown>) ?? canonicalFor();
  return {
    id: 'portfolio_fixture01',
    title: 'Priya Sharma',
    slug: null,
    isPublished: false,
    revision: 4,
    publishedAt: null,
    updatedAt: '2026-10-20T09:30:00.000Z',
    renderer: 'webcv',
    templateKey: 'modernMinimal',
    template: 'modernMinimal',
    theme: 'minimal',
    seoTitle: 'Priya Sharma',
    seoDescription: 'Analyst building accessible data products.',
    description: 'Analyst building accessible data products.',
    tags: ['modernMinimal'],
    visibility: { ...ALL_VISIBLE },
    canonical,
    content: [],
    root: { props: { title: 'Priya Sharma' } },
    ...overrides,
  };
}

function publishedPortfolio(overrides: Partial<StoredPortfolio> = {}) {
  return storedPortfolio({
    id: 'portfolio_pub0001',
    slug: 'priya-sharma-ab12cd34',
    isPublished: true,
    publishedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  });
}

interface RecordedCall { method: string; path: string; body: any }

/**
 * Answers every /api request. Handlers follow the backend's documented shapes;
 * anything unmodelled is recorded and answered 404 so a test can prove a request
 * was (or was not) sent.
 */
class ApiFixture {
  readonly calls: RecordedCall[] = [];
  readonly unhandled: string[] = [];
  readonly portfolios = new Map<string, StoredPortfolio>();
  publicList: StoredPortfolio[] = [];
  moduleDisabled = false;
  domain: { domain: string; status: string; verificationToken?: string; verifiedAt?: string | null; lastError?: string | null } | null = null;
  domainVerifyResponse: { verified: boolean; status: string; reason?: string } = { verified: false, status: 'PENDING', reason: 'TXT_RECORD_MISSING' };
  resumes: Array<{ id: string; name: string }> = [];

  constructor(readonly page: Page) {}

  count(method: string, path: string) {
    return this.calls.filter((call) => call.method === method && call.path === path).length;
  }

  bodies(method: string, path: string) {
    return this.calls.filter((call) => call.method === method && call.path === path).map((call) => call.body);
  }

  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  }

  async install() {
    await this.page.route((url) => url.pathname.startsWith('/api/'), (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    this.calls.push({ method, path: url.pathname, body });

    const path = url.pathname.replace(/^\/api/, '');

    // Session check performed by the AuthProvider on every load.
    if (path === '/users-data/profile' && method === 'GET') {
      return this.json(route, 200, {
        user: { uid: CANDIDATE.uid, email: CANDIDATE.email, revision: 2, profile: { firstname: 'Priya', lastname: 'Sharma', email: CANDIDATE.email } },
      });
    }
    if (path === '/notifications-data') return this.json(route, 200, { notifications: [], unreadCount: 0 });
    // Shell chrome (quota badge) — unrelated to the portfolio surface.
    if (path === '/ai-usage') return this.json(route, 200, { used: 0, limit: 100, remaining: 100 });
    if (path === '/resumes' && method === 'GET') return this.json(route, 200, { resumes: this.resumes });

    // Module-disabled: exactly 403 + PORTFOLIO_MODULE_DISABLED.
    if (this.moduleDisabled && path.startsWith('/portfolios') && !path.startsWith('/portfolios/public')) {
      return this.json(route, 403, {
        success: false,
        code: 'PORTFOLIO_MODULE_DISABLED',
        error: 'Portfolio module is currently disabled by system administration.',
      });
    }

    /* Public routes first: /portfolios/public is not /portfolios/:id. */
    if (path === '/portfolios/public' && method === 'GET') {
      return this.json(route, 200, {
        success: true,
        portfolios: this.publicList.map((portfolio) => ({
          id: portfolio.id,
          title: portfolio.title,
          theme: portfolio.theme,
          slug: portfolio.slug,
          publishedAt: portfolio.publishedAt,
          metadata: { description: portfolio.description, tags: portfolio.tags, seoTitle: portfolio.seoTitle, seoDescription: portfolio.seoDescription },
          data: { renderer: 'webcv', templateKey: portfolio.templateKey, template: portfolio.template },
        })),
      });
    }
    if (path.startsWith('/portfolios/public/') && method === 'GET') {
      const slug = decodeURIComponent(path.slice('/portfolios/public/'.length));
      const portfolio = this.publicList.find((entry) => entry.slug === slug);
      if (!portfolio) {
        return this.json(route, 404, { success: false, code: 'PORTFOLIO_NOT_FOUND', error: 'Portfolio not found' });
      }
      // The server's allowlist projection: no userId, revision or billing.
      return this.json(route, 200, {
        success: true,
        portfolio: {
          id: portfolio.id,
          title: portfolio.title,
          theme: portfolio.theme,
          slug: portfolio.slug,
          isPublished: true,
          publishedAt: portfolio.publishedAt,
          metadata: { description: portfolio.description, tags: portfolio.tags, seoTitle: portfolio.seoTitle, seoDescription: portfolio.seoDescription },
          data: { content: [], root: { props: {} }, canonical: portfolio.canonical, templateKey: portfolio.templateKey, template: portfolio.template },
        },
      });
    }

    if (path === '/portfolios' && method === 'GET') {
      return this.json(route, 200, { success: true, portfolios: [...this.portfolios.values()] });
    }

    const domainMatch = /^\/portfolios\/([^/]+)\/custom-domain(?:\/verify)?$/.exec(path);
    if (domainMatch) {
      const isVerify = path.endsWith('/verify');
      if (method === 'POST' && !isVerify) {
        const raw = String((body as { domain?: string } | null)?.domain ?? '');
        this.domain = { domain: raw, status: 'PENDING', verificationToken: 'ime365-verify=fixture-token-value', verifiedAt: null };
        return this.json(route, 201, {
          success: true,
          domain: raw,
          verificationToken: this.domain.verificationToken,
          status: 'PENDING',
          expiresAt: '2026-11-01T00:00:00.000Z',
          instructions: `Add a DNS TXT record to ${raw} with the value shown.`,
          verificationRecord: { type: 'TXT', name: raw, value: this.domain.verificationToken },
        });
      }
      if (method === 'POST' && isVerify) {
        const verified = this.domainVerifyResponse.verified;
        if (verified && this.domain) this.domain.status = 'VERIFIED';
        return this.json(route, 200, {
          success: true,
          verified,
          domain: this.domain?.domain ?? 'alex-smith.dev',
          status: verified ? 'VERIFIED' : this.domainVerifyResponse.status,
          reason: this.domainVerifyResponse.reason,
          attemptsRemaining: 19,
        });
      }
      if (method === 'GET') {
        if (!this.domain) {
          return this.json(route, 404, { success: false, code: 'CUSTOM_DOMAIN_NOT_FOUND', error: 'No custom domain is registered for this portfolio.' });
        }
        return this.json(route, 200, {
          success: true,
          customDomain: {
            domain: this.domain.domain,
            status: this.domain.status,
            verifyAttempts: 1,
            expiresAt: '2026-11-01T00:00:00.000Z',
            verifiedAt: this.domain.verifiedAt ?? null,
            lastError: this.domain.lastError ?? null,
          },
        });
      }
    }

    const publishMatch = /^\/portfolios\/([^/]+)\/publish$/.exec(path);
    if (publishMatch && method === 'POST') {
      const id = decodeURIComponent(publishMatch[1]);
      const portfolio = this.portfolios.get(id);
      if (!portfolio) return this.json(route, 404, { success: false, code: 'PORTFOLIO_NOT_FOUND', error: 'Portfolio not found' });
      const slug = (body as { slug?: string } | null)?.slug;
      const isPublished = (body as { isPublished?: boolean } | null)?.isPublished !== false;
      if (isPublished && !slug) {
        return this.json(route, 400, { success: false, code: 'INVALID_PORTFOLIO_SLUG', error: 'A slug is required to publish.' });
      }
      if (isPublished && this.publicList.some((entry) => entry.slug === slug && entry.id !== id)) {
        return this.json(route, 409, { success: false, code: 'SLUG_ALREADY_EXISTS', error: 'That address is already claimed.' });
      }
      const updated: StoredPortfolio = {
        ...portfolio,
        slug: isPublished ? String(slug) : portfolio.slug,
        isPublished,
        publishedAt: isPublished ? '2026-10-29T08:00:00.000Z' : null,
      };
      this.portfolios.set(id, updated);
      if (isPublished) this.publicList = [...this.publicList.filter((entry) => entry.id !== id), updated];
      return this.json(route, 200, {
        success: true,
        portfolio: { id, slug: updated.slug, isPublished: updated.isPublished, publishedAt: updated.publishedAt, revision: updated.revision },
      });
    }

    const itemMatch = /^\/portfolios\/([^/]+)$/.exec(path);
    if (itemMatch) {
      const id = decodeURIComponent(itemMatch[1]);
      if (method === 'GET') {
        const portfolio = this.portfolios.get(id);
        if (!portfolio) return this.json(route, 404, { success: false, code: 'PORTFOLIO_NOT_FOUND', error: 'Portfolio not found' });
        return this.json(route, 200, { success: true, portfolio });
      }
      if (method === 'POST') {
        const payload = body as { portfolio?: Record<string, unknown>; expectedRevision?: unknown } | null;
        const expectedRevision = Number(payload?.expectedRevision);
        const existing = this.portfolios.get(id);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          return this.json(route, 400, { success: false, code: 'PORTFOLIO_REVISION_REQUIRED', error: 'A non-negative expectedRevision is required.' });
        }
        if (expectedRevision === 0 && existing) {
          return this.json(route, 409, { success: false, code: 'PORTFOLIO_CONFLICT', error: 'Portfolio already exists.', remoteRevision: existing.revision });
        }
        if (expectedRevision !== 0 && (!existing || existing.revision !== expectedRevision)) {
          return this.json(route, 409, {
            success: false,
            code: 'PORTFOLIO_CONFLICT',
            error: 'This portfolio was changed elsewhere.',
            remoteRevision: existing?.revision ?? 0,
          });
        }
        const document = payload?.portfolio ?? {};
        const saved: StoredPortfolio = {
          ...(existing ?? storedPortfolio({ id })),
          ...(document as Record<string, unknown>),
          id,
          revision: expectedRevision === 0 ? 1 : existing!.revision + 1,
          updatedAt: '2026-10-29T09:00:00.000Z',
        } as StoredPortfolio;
        this.portfolios.set(id, saved);
        return this.json(route, expectedRevision === 0 ? 201 : 200, { success: true, portfolio: saved });
      }
    }

    this.unhandled.push(`${method} ${path}`);
    return this.json(route, 404, { success: false, error: 'Not modelled by the mandate11j fixture' });
  }
}

/* ─── Page helpers ─── */

const builderTitle = (page: Page) => page.getByRole('textbox', { name: 'Title', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const preview = (page: Page) => page.getByRole('region', { name: 'Live preview of your portfolio' });

async function openBuilder(page: Page, fixture: ApiFixture, id = 'portfolio_fixture01') {
  if (!fixture.portfolios.has(id)) fixture.portfolios.set(id, storedPortfolio({ id }));
  await page.goto(`/dashboard/portfolio/${encodeURIComponent(id)}`);
  await expect(builderTitle(page)).toBeVisible();
}

async function expectNoAxeViolations(page: Page, scope = '#main-content') {
  const results = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await seedPreviewSession(page);
});

/* ─── 1. Loading a stored portfolio ─── */

test('an existing portfolio loads the values the server stored', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  fixture.portfolios.set('portfolio_fixture01', storedPortfolio({ title: 'Priya Sharma CV', revision: 4 }));
  await page.goto('/dashboard/portfolio/portfolio_fixture01');

  await expect(builderTitle(page)).toHaveValue('Priya Sharma CV');
  await expect(page.getByRole('heading', { level: 1, name: 'Priya Sharma CV' })).toBeVisible();
  await expect(page.getByLabel('Employer')).toHaveValue('IME365');
  // The preview renders from the same canonical document.
  await expect(preview(page).getByRole('heading', { level: 2, name: 'Priya Sharma' })).toBeVisible();
  await expect(preview(page).getByText('Analyst', { exact: true }).first()).toBeVisible();
  expect(fixture.count('GET', '/api/portfolios/portfolio_fixture01')).toBe(1);
  expect(fixture.unhandled.join(', '), 'no unmodelled API requests').toBe('');
});

/* ─── 2. Persistent draft creation ─── */

test('a new portfolio is persisted as a draft before the editor opens, and the id survives a refresh', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await page.goto('/dashboard/portfolio');
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolios' })).toBeVisible();

  await page.getByRole('button', { name: 'New portfolio' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('My Web CV');
  await dialog.getByRole('button', { name: 'Create draft' }).click();

  await page.waitForURL(/\/dashboard\/portfolio\/portfolio_[A-Za-z0-9_-]+$/);
  const createdId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);
  expect(createdId).toMatch(/^[A-Za-z0-9_-]{4,128}$/);

  const saveBody = fixture.bodies('POST', `/api/portfolios/${createdId}`)[0] as { expectedRevision: number; portfolio: Record<string, unknown> };
  expect(saveBody, 'the draft is created through the real save endpoint').toBeTruthy();
  expect(saveBody.expectedRevision, 'expectedRevision 0 means create').toBe(0);
  expect(saveBody.portfolio.isPublished, 'a new portfolio starts unpublished').toBe(false);
  expect(saveBody.portfolio.renderer).toBe('webcv');
  expect(fixture.portfolios.get(createdId)?.revision, 'the server persisted it').toBe(1);

  await expect(builderTitle(page)).toHaveValue('My Web CV');
  await page.reload();
  await expect(builderTitle(page)).toHaveValue('My Web CV');
  await expect(page.getByRole('heading', { level: 1, name: 'My Web CV' })).toBeVisible();
  expect(fixture.count('GET', `/api/portfolios/${createdId}`), 'reload reads the same record').toBe(2);
  expect([...fixture.portfolios.keys()], 'exactly one draft was created').toEqual([createdId]);
});

/* ─── 3. Visibility ─── */

test('hiding a section updates the live preview immediately and keeps the content', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  await expect(preview(page).getByText('IME365')).toBeVisible();
  const experienceToggle = page.getByLabel('Show Experience');
  await expect(experienceToggle).toBeChecked();

  await experienceToggle.uncheck();

  await expect(preview(page).getByText('IME365')).toHaveCount(0);
  await expect(preview(page).getByRole('heading', { level: 2, name: 'Experience', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Employer'), 'the content is kept, not deleted').toHaveValue('IME365');
  await expect(page.getByRole('status').filter({ hasText: 'Some sections are hidden' })).toBeVisible();

  // Contact details: hiding them removes every contact link from the preview.
  await page.getByLabel('Show Contact details').uncheck();
  await expect(preview(page).getByRole('link', { name: 'priya@example.test' })).toHaveCount(0);
  await expect(preview(page).getByRole('link', { name: '+91 90000 00000' })).toHaveCount(0);
  await expect(preview(page).getByText('Vijayawada, India')).toBeVisible();
});

test('visibility flags are saved with the document and restored on reload', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  await page.getByLabel('Show Projects').uncheck();
  await saveButton(page).click();
  await expect(page.getByText('All changes saved')).toBeVisible();

  const saved = fixture.bodies('POST', '/api/portfolios/portfolio_fixture01')[0] as { portfolio: { visibility: Visibility; canonical: { projects: unknown[] } } };
  expect(saved.portfolio.visibility.showProjects).toBe(false);
  expect(saved.portfolio.canonical.projects.length, 'the project itself is still stored').toBe(1);

  await page.reload();
  await expect(page.getByLabel('Show Projects')).not.toBeChecked();
  await expect(preview(page).getByText('Portfolio Studio')).toHaveCount(0);
});

/* ─── 4. Template and preview modes ─── */

test('choosing a template changes the live preview', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  await expect(preview(page).locator('.bg-surface').first()).toBeVisible();
  await page.getByRole('radio', { name: /Creative Dark/ }).check();

  // The creative-dark palette paints the preview canvas, and the choice is local
  // until Save (so an unsaved change is announced rather than silently kept).
  await expect(preview(page).locator('.bg-neutral-950').first()).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
});

test('the split-screen preview switches between desktop and mobile widths', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  const frame = preview(page).locator('[data-preview-width]');
  await expect(preview(page).getByRole('button', { name: 'Desktop' })).toHaveAttribute('aria-pressed', 'true');
  await expect(frame).toHaveAttribute('data-preview-width', 'desktop');
  const desktopWidth = (await frame.boundingBox())!.width;

  await preview(page).getByRole('button', { name: 'Mobile' }).click();
  await expect(frame).toHaveAttribute('data-preview-width', 'mobile');
  await expect(preview(page).getByRole('button', { name: 'Mobile' })).toHaveAttribute('aria-pressed', 'true');
  await expect(preview(page).getByText(/Previewing the phone layout/)).toBeVisible();
  const mobileWidth = (await frame.boundingBox())!.width;
  expect(mobileWidth).toBeLessThanOrEqual(375);
  expect(mobileWidth).toBeLessThan(desktopWidth);

  // Both modes keep the page free of horizontal overflow.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(preview(page)).toBeVisible();
  const phoneOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(phoneOverflow, 'no horizontal overflow on a 375px viewport').toBeLessThanOrEqual(1);
});

/* ─── 5. Concurrency ─── */

test('a 409 conflict keeps local edits and blocks saving until it is resolved', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  // Another tab saves first: the server revision moves on.
  fixture.portfolios.set('portfolio_fixture01', storedPortfolio({ id: 'portfolio_fixture01', revision: 5, title: 'Renamed elsewhere' }));

  await builderTitle(page).fill('My local title');
  await saveButton(page).click();

  // A 409 is never a silent failure: the conflict is announced and the candidate
  // gets the three explicit resolutions.
  const alert = page.getByRole('alert').filter({ hasText: 'saving is paused' });
  await expect(alert).toBeVisible();
  await expect(builderTitle(page), 'the local edit is intact').toHaveValue('My local title');
  await expect(saveButton(page), 'saving stays blocked').toBeDisabled();
  await expect(alert.getByRole('button', { name: 'Keep local & overwrite' })).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Inspect remote changes' })).toBeVisible();
  await expect(alert.getByRole('button', { name: /reload latest version/i })).toBeVisible();
  expect(fixture.portfolios.get('portfolio_fixture01')!.title, 'the server was not overwritten').toBe('Renamed elsewhere');

  // Repeated save clicks cannot bypass the conflict: no further save request is sent.
  const postCount = fixture.count('POST', '/api/portfolios/portfolio_fixture01');
  await saveButton(page).click({ force: true });
  await saveButton(page).click({ force: true });
  expect(fixture.count('POST', '/api/portfolios/portfolio_fixture01')).toBe(postCount);
  expect(fixture.portfolios.get('portfolio_fixture01')!.title).toBe('Renamed elsewhere');
});

test('the conflict dialog explains both versions and offers the three resolutions', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  fixture.portfolios.set('portfolio_fixture01', storedPortfolio({
    id: 'portfolio_fixture01',
    revision: 6,
    title: 'Renamed elsewhere',
    canonical: canonicalFor({ summary: 'A different summary written in another tab.' }),
  }));

  await builderTitle(page).fill('My local title');
  await saveButton(page).click();
  await page.getByRole('button', { name: 'Inspect remote changes' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /This portfolio changed elsewhere/ })).toBeVisible();
  await expect(dialog).toContainText('revision 4');
  await expect(dialog).toContainText('revision 6');
  await expect(dialog.getByRole('button', { name: /Keep local & overwrite/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Inspect remote changes/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Discard & reload/ })).toBeVisible();

  // Inspect shows the actual differences, not just a closed dialog.
  await dialog.getByRole('button', { name: /Inspect remote changes/ }).click();
  const table = dialog.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table).toContainText('Portfolio title');
  await expect(table).toContainText('My local title');
  await expect(table).toContainText('Renamed elsewhere');
  await expect(table).toContainText('About');
  await expect(table).toContainText('A different summary written in another tab.');

  // The dialog is keyboard-reachable and labelled.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('alert').filter({ hasText: 'saving is paused' })).toBeVisible();
  expect(fixture.portfolios.get('portfolio_fixture01')!.title, 'nothing was overwritten by inspecting').toBe('Renamed elsewhere');
});

test('Keep local & overwrite saves with the current server revision', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  fixture.portfolios.set('portfolio_fixture01', storedPortfolio({ id: 'portfolio_fixture01', revision: 6, title: 'Renamed elsewhere' }));
  await builderTitle(page).fill('My local title');
  await saveButton(page).click();
  await page.getByRole('button', { name: 'Keep local & overwrite' }).click();

  await expect(page.getByText('All changes saved')).toBeVisible();
  const bodies = fixture.bodies('POST', '/api/portfolios/portfolio_fixture01') as Array<{ expectedRevision: number; portfolio: { title: string } }>;
  expect(bodies.at(-1)!.expectedRevision, 'the overwrite uses the revision the server reported, not the stale one').toBe(6);
  expect(bodies.at(-1)!.portfolio.title).toBe('My local title');
  expect(fixture.portfolios.get('portfolio_fixture01')!.title).toBe('My local title');
  expect(fixture.portfolios.get('portfolio_fixture01')!.revision).toBe(7);
});

test('Discard & reload replaces local edits with the newest server version', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  await builderTitle(page).fill('Local edit that will be discarded');
  fixture.portfolios.set('portfolio_fixture01', storedPortfolio({ id: 'portfolio_fixture01', revision: 8, title: 'Server title now' }));
  await saveButton(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'saving is paused' })).toBeVisible();

  // A newer change lands before the decision: discarding must load that newest one.
  fixture.portfolios.set('portfolio_fixture01', storedPortfolio({ id: 'portfolio_fixture01', revision: 9, title: 'Newest server title' }));
  await page.getByRole('button', { name: /Discard changes and reload latest version/i }).click();

  await expect(builderTitle(page)).toHaveValue('Newest server title');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'saving is paused' })).toHaveCount(0);
  expect(fixture.count('POST', '/api/portfolios/portfolio_fixture01'), 'discarding writes nothing').toBe(1);
});

/* ─── 6. Module disabled ─── */

test('a 403 PORTFOLIO_MODULE_DISABLED shows the banner and removes editing', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  fixture.moduleDisabled = true;
  fixture.portfolios.set('portfolio_fixture01', storedPortfolio());

  await page.goto('/dashboard/portfolio/portfolio_fixture01');
  await expect(page.getByText('The portfolio module is currently disabled by system administration.')).toBeVisible();
  await expect(builderTitle(page), 'no editor is offered').toHaveCount(0);
  await expect(saveButton(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Publish/ })).toHaveCount(0);
  // Safe navigation is preserved.
  await expect(page.getByRole('link', { name: /See published portfolios/ })).toBeVisible();
});

test('the portfolio list also reports the disabled module without offering creation', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  fixture.moduleDisabled = true;
  await page.goto('/dashboard/portfolio');
  await expect(page.getByText('The portfolio module is currently disabled by system administration.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New portfolio' })).toHaveCount(0);
});

test('an unrelated 403 is not mistaken for the disabled module', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);
  await page.route('**/api/portfolios/portfolio_fixture01', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'PORTFOLIO_OWNER_MISMATCH', error: 'Cannot write another user’s portfolio.' }) })
      : route.fallback(),
  );

  await builderTitle(page).fill('Another title');
  await saveButton(page).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Cannot write another user’s portfolio.' })).toBeVisible();
  await expect(page.getByText('The portfolio module is currently disabled by system administration.')).toHaveCount(0);
  await expect(builderTitle(page), 'the editor is still available').toBeVisible();
});

/* ─── 7. Publication ─── */

test('the publish dialog validates the slug before calling the server', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Publish your portfolio' })).toBeVisible();

  const slug = dialog.getByLabel('URL Slug');
  await slug.fill('Not a Slug!');
  await expect(dialog.getByRole('alert')).toContainText('lowercase letters');
  await expect(dialog.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  expect(fixture.count('POST', '/api/portfolios/portfolio_fixture01/publish'), 'nothing was sent').toBe(0);

  await slug.fill('priya-sharma');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click();

  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  const publishBodies = fixture.bodies('POST', '/api/portfolios/portfolio_fixture01/publish') as Array<{ slug: string; isPublished: boolean }>;
  expect(publishBodies[0]).toEqual({ slug: 'priya-sharma', isPublished: true });
  expect(fixture.portfolios.get('portfolio_fixture01')!.isPublished).toBe(true);
});

/* ─── 8. Public portfolio ─── */

test('the public portfolio renders by slug with its own document title', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  fixture.publicList = [publishedPortfolio({ title: 'Priya Sharma', seoTitle: 'Priya Sharma — Data analyst' })];

  await page.goto('/portfolio/priya-sharma-ab12cd34');

  await expect(page.getByRole('heading', { level: 1, name: 'Priya Sharma' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Experience', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Priya Sharma — Data analyst · IME365');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/portfolio\/priya-sharma-ab12cd34$/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Analyst building accessible data products/);
  expect(fixture.count('GET', '/api/portfolios/public/priya-sharma-ab12cd34')).toBe(1);
});

test('the public page never renders private owner fields or hidden sections', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  const canonical = canonicalFor({
    visibility: { ...ALL_VISIBLE, showContact: false },
  });
  fixture.publicList = [publishedPortfolio({ canonical })];

  await page.goto('/portfolio/priya-sharma-ab12cd34');
  await expect(page.getByRole('heading', { level: 1, name: 'Priya Sharma' })).toBeVisible();

  const html = await page.locator('body').innerHTML();
  for (const secret of ['usr_cand_11j', 'usr_secret', '12 Secret Lane', '520001', 'priya@example.test', '+91 90000 00000']) {
    expect(html.toLowerCase().includes(secret.toLowerCase()), `the page must not expose ${secret}`).toBe(false);
  }
  await expect(page.getByRole('link', { name: 'priya@example.test' })).toHaveCount(0);
});

test('a missing or unpublished portfolio slug shows a not-found state', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  fixture.publicList = [];
  await page.goto('/portfolio/unknown-slug');
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolio not found' })).toBeVisible();
});

/* ─── 9. Gallery ─── */

const galleryFixture = (fixture: ApiFixture) => {
  fixture.publicList = [
    publishedPortfolio({ id: 'portfolio_pub0001', title: 'Priya Sharma', slug: 'priya-sharma-ab12cd34', description: 'Data analyst portfolio', tags: ['modernMinimal'] }),
    publishedPortfolio({ id: 'portfolio_pub0002', title: 'Arjun Rao', slug: 'arjun-rao-ffee0011', description: 'Backend engineer', tags: ['premiumTech'], templateKey: 'premiumTech', template: 'premiumTech', theme: 'dark' }),
    publishedPortfolio({ id: 'portfolio_pub0003', title: 'Meera Iyer', slug: 'meera-iyer-1234abcd', description: 'Design systems', tags: ['creativeDark'], templateKey: 'creativeDark', template: 'creativeDark', theme: 'creative' }),
  ];
};

test('the gallery lists published portfolios and filters by search and template', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  galleryFixture(fixture);

  await page.goto('/portfolios');
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolios' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Priya Sharma' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Arjun Rao' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Meera Iyer' })).toBeVisible();

  const search = page.getByLabel('Search');
  await search.fill('arjun');
  await expect(page.getByRole('heading', { level: 2, name: 'Arjun Rao' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Priya Sharma' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '1 of 3 portfolios match' })).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=arjun/);

  await search.fill('nobody');
  await expect(page.getByRole('heading', { name: 'No portfolios match' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filter' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Priya Sharma' })).toBeVisible();

  await page.getByLabel('Template').selectOption('creativeDark');
  await expect(page.getByRole('heading', { level: 2, name: 'Meera Iyer' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Arjun Rao' })).toHaveCount(0);
  await expect(page).toHaveURL(/template=creativeDark/);

  // One API call in total: filters are applied to the loaded page set.
  expect(fixture.count('GET', '/api/portfolios/public')).toBe(1);
});

test('gallery filters are read from the URL and survive a refresh', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  galleryFixture(fixture);

  await page.goto('/portfolios?q=engineer&template=premiumTech');
  await expect(page.getByLabel('Search')).toHaveValue('engineer');
  await expect(page.getByLabel('Template')).toHaveValue('premiumTech');
  await expect(page.getByRole('heading', { level: 2, name: 'Arjun Rao' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Priya Sharma' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel('Search')).toHaveValue('engineer');
  await expect(page.getByLabel('Template')).toHaveValue('premiumTech');
  await expect(page.getByRole('heading', { level: 2, name: 'Arjun Rao' })).toBeVisible();
});

test('an unknown template parameter is ignored rather than trusted', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  galleryFixture(fixture);

  await page.goto('/portfolios?template=not-a-template');
  await expect(page.getByLabel('Template')).toHaveValue('');
  await expect(page.getByRole('heading', { level: 2, name: 'Priya Sharma' })).toBeVisible();
});

/* ─── 10. Sharing ─── */

test('the share dialog copies the public link and announces the result', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture, 'portfolio_pub0001');
  fixture.portfolios.set('portfolio_pub0001', publishedPortfolio({ id: 'portfolio_pub0001' }));

  await page.reload();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Share your portfolio' })).toBeVisible();
  await expect(dialog.getByText('Published', { exact: true })).toBeVisible();

  const expectedUrl = new URL('/portfolio/priya-sharma-ab12cd34', page.url()).toString();
  await expect(dialog.getByLabel('Public link')).toHaveValue(expectedUrl);

  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Link copied to your clipboard.');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(expectedUrl);

  // Social targets are encoded and open away from this page.
  const linkedin = dialog.getByRole('link', { name: /Share on LinkedIn/ });
  await expect(linkedin).toHaveAttribute('href', /linkedin\.com\/sharing\/share-offsite\/\?url=https?%3A%2F%2F/);
  await expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer');
});

test('the share dialog refuses to report success when the clipboard fails', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture, 'portfolio_pub0001');
  fixture.portfolios.set('portfolio_pub0001', publishedPortfolio({ id: 'portfolio_pub0001' }));
  await page.reload();
  // Deny the clipboard write, as a browser without the permission would.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Copy link' }).click();

  await expect(dialog.getByRole('alert')).toContainText('could not be copied');
  await expect(dialog.getByRole('status')).toHaveText('');
});

test('the QR code encodes exactly the public URL shown', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture, 'portfolio_pub0001');
  fixture.portfolios.set('portfolio_pub0001', publishedPortfolio({ id: 'portfolio_pub0001' }));
  await page.reload();
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  const dialog = page.getByRole('dialog');
  const expectedUrl = new URL('/portfolio/priya-sharma-ab12cd34', page.url()).toString();
  const qr = dialog.getByRole('img', { name: `QR code linking to ${expectedUrl}` });
  await expect(qr).toBeVisible();
  await expect(qr.locator('path')).toHaveCount(1);
  const path = await qr.locator('path').getAttribute('d');
  expect(path!.length).toBeGreaterThan(500);
  // The viewBox covers the symbol plus a 2-module quiet zone; the side is
  // therefore (17 + 4·version) + 4 for some version in 1…13.
  const viewBox = (await qr.getAttribute('viewBox'))!.split(' ').map(Number);
  expect(viewBox[0]).toBe(-2);
  expect(viewBox[1]).toBe(-2);
  expect(viewBox[2]).toBe(viewBox[3]);
  expect((viewBox[2] - 4 - 17) % 4).toBe(0);
});

test('an unpublished portfolio offers publishing instead of a shareable link', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Draft — not public')).toBeVisible();
  await expect(dialog.getByLabel('Public link')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Publish portfolio' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Publish your portfolio' })).toBeVisible();
});

/* ─── 11. Custom domain ─── */

test('custom-domain validation rejects schemes, paths and trailing slashes without calling the API', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);
  await page.getByRole('button', { name: 'Custom domain' }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByLabel('Domain hostname');

  for (const [value, expected] of [
    ['https://alex-smith.dev', /without http:\/\/ or https:\/\//],
    ['http://alex-smith.dev', /without http:\/\/ or https:\/\//],
    ['alex-smith.dev/', /paths, ports, or query parameters/],
    ['alex-smith.dev/cv', /paths, ports, or query parameters/],
  ] as const) {
    await input.fill(value);
    await dialog.getByRole('button', { name: /Register domain/ }).click();
    await expect(dialog.getByRole('alert')).toContainText(expected);
    expect(fixture.count('POST', '/api/portfolios/portfolio_fixture01/custom-domain'), `nothing sent for ${value}`).toBe(0);
  }
  await expect(input).toHaveAttribute('aria-invalid', 'true');
});

test('a registered domain shows the TXT record the server issued and its real status', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);
  await page.getByRole('button', { name: 'Custom domain' }).click();
  const dialog = page.getByRole('dialog');

  await dialog.getByLabel('Domain hostname').fill('alex-smith.dev');
  await dialog.getByRole('button', { name: /Register domain/ }).click();

  await expect(dialog.getByText('Pending verification')).toBeVisible();
  await expect(dialog.getByText('alex-smith.dev', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('TXT record').first()).toBeVisible();
  await expect(dialog.getByText('ime365-verify=fixture-token-value')).toBeVisible();
  // No invented CNAME/A routing target; the limitation is stated.
  await expect(dialog.getByText('CNAME / A routing is not available')).toBeVisible();
  await expect(dialog.getByText(/TXT record only/)).toBeVisible();
  await expect(dialog.getByText(/domains\.ime365\.com/)).toHaveCount(0);

  // Verification is only ever reported from the server's answer.
  fixture.domainVerifyResponse = { verified: true, status: 'VERIFIED' };
  await dialog.getByRole('button', { name: /Check verification now/ }).click();
  await expect(dialog.getByText('Verified', { exact: true })).toBeVisible();
  expect(fixture.count('POST', '/api/portfolios/portfolio_fixture01/custom-domain/verify')).toBe(1);
});

test('a failed DNS lookup is reported as pending, never as verified', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);
  await page.getByRole('button', { name: 'Custom domain' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Domain hostname').fill('alex-smith.dev');
  await dialog.getByRole('button', { name: /Register domain/ }).click();

  fixture.domainVerifyResponse = { verified: false, status: 'PENDING', reason: 'TXT_RECORD_MISSING' };
  await dialog.getByRole('button', { name: /Check verification now/ }).click();

  await expect(dialog.getByText('Pending verification')).toBeVisible();
  await expect(dialog.getByText(/resolved no TXT record/)).toBeVisible();
  await expect(dialog.getByText('Verified', { exact: true })).toHaveCount(0);
});

/* ─── 12. Accessibility and layout ─── */

test('the builder, its preview and the conflict dialog pass axe at 1280px', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  await openBuilder(page, fixture);
  await expectNoAxeViolations(page);

  fixture.portfolios.set('portfolio_fixture01', storedPortfolio({ id: 'portfolio_fixture01', revision: 11 }));
  await builderTitle(page).fill('Local');
  await saveButton(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'saving is paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect remote changes' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoAxeViolations(page, '[role="dialog"]');

  // Focus stays inside the dialog while tabbing, and Escape does not resolve it.
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    expect(await page.getByRole('dialog').evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
});

test('the public portfolio and gallery pass axe at 1280px and 375px', async ({ page }) => {
  const fixture = new ApiFixture(page);
  await fixture.install();
  galleryFixture(fixture);
  await page.goto('/portfolio/priya-sharma-ab12cd34');
  await expect(page.getByRole('heading', { level: 1, name: 'Priya Sharma' })).toBeVisible();
  await expectNoAxeViolations(page, 'body');

  await page.setViewportSize({ width: 375, height: 812 });
  await expectNoAxeViolations(page, 'body');

  await page.goto('/portfolios');
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolios' })).toBeVisible();
  await expectNoAxeViolations(page, 'body');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
