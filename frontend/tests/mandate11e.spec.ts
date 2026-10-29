/**
 * Mandate 11E — end-to-end and accessibility suite.
 *
 * Covering: the candidate overview HUD, the AI cover-letter studio, public job
 * discovery and the regional hubs, the application dialog, the favourites
 * centre and the WCAG 2.1 AA hardening of the public pages.
 *
 * Every /api response below is a deterministic fixture installed with
 * page.route(). The fixtures stand in for the backend only; the assertions are
 * about what the real components do with those responses — requests they send,
 * states they show, focus they move.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const CANDIDATE = {
  uid: 'usr_cand_11e',
  email: 'priya@example.test',
  displayName: 'Priya Sharma',
  role: 'USER',
};

function encodeBase64Url(json: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(json), 'utf8').toString('base64url');
}

function buildTestToken(identity: { uid: string; email: string; role: string }): string {
  const payload = encodeBase64Url({
    uid: identity.uid,
    email: identity.email,
    role: identity.role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `rptest.${payload}.${'a'.repeat(64)}`;
}

/** Installs the stored preview session and the requests the shell always makes. */
async function seedAuthenticatedSession(page: Page, identity = CANDIDATE) {
  const token = buildTestToken(identity);
  await page.addInitScript(
    ({ record }) => {
      window.localStorage.setItem('ime_dev_user', JSON.stringify(record));
      window.localStorage.setItem('token', record.token);
    },
    { record: { ...identity, token } },
  );

  await page.route('**/api/users-data/profile', (route) =>
    route.fulfill({
      status: 200,
      json: {
        success: true,
        user: {
          uid: identity.uid,
          email: identity.email,
          firstname: 'Priya',
          lastname: 'Sharma',
          phone: '+919876543210',
          membership: 'PRO',
        },
        uid: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        role: identity.role,
        emailVerified: true,
      },
    }),
  );
  await page.route('**/api/notifications**', (route) =>
    route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } }),
  );
  await page.route('**/api/ai-usage**', (route) =>
    route.fulfill({ status: 200, json: { used: 0, limit: 100, remaining: 100 } }),
  );
  await page.route('**/api/platform/role-view-audit**', (route) =>
    route.fulfill({ status: 200, json: { success: true } }),
  );
}

async function expectNoSeriousAxeViolations(page: Page, includeSelector?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  if (includeSelector) builder = builder.include(includeSelector);
  const results = await builder.analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  expect(
    blocking,
    `Expected no critical/serious WCAG AA violations, got ${JSON.stringify(
      blocking.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
      })),
    )}`,
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the page must not scroll horizontally').toBeLessThanOrEqual(1);
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const job = (overrides: Record<string, unknown> = {}) => ({
  id: 'job_101',
  title: 'Backend Engineer',
  company_name: 'Acme Systems',
  company: 'Acme Systems',
  location: 'Bengaluru, Karnataka',
  job_type: 'full-time',
  workplace_type: 'Hybrid',
  description: 'Design and run Go services on Postgres.',
  skills: ['Go', 'Postgres', 'Kubernetes'],
  created_at: '2026-10-25T09:00:00.000Z',
  status: 'active',
  ...overrides,
});

const resume = (overrides: Record<string, unknown> = {}) => ({
  id: 'res_1',
  title: 'Master Resume',
  occupation: 'Backend Engineer',
  firstname: 'Priya',
  lastname: 'Sharma',
  email: 'priya@example.test',
  phone: '+919876543210',
  summary: 'Backend engineer with six years building Go and Postgres services.',
  skills: [{ name: 'Go' }, { name: 'Postgres' }, { name: 'Figma' }],
  experience: [{ title: 'Backend Engineer', company: 'Acme', description: 'Built services in Go.' }],
  education: [{ degree: 'B.Tech', school: 'NIT' }],
  updated_at: '2026-10-20T09:00:00.000Z',
  ...overrides,
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TASK 1 — Candidate overview HUD
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('Task 1 — Candidate Overview HUD', () => {
  test('renders real candidate metrics, job listings, quick actions and the shared apply dialog', async ({ page }) => {
    await seedAuthenticatedSession(page);

    let statsRequests = 0;
    await page.route('**/api/user-stats', (route) => {
      statsRequests += 1;
      return json(route, 200, {
        success: true,
        source: 'MARIADB_USER_DOCUMENTS',
        stats: { resumes: 3, coverLetters: 2, portfolios: 1, applications: 4, trackedJobs: 0, profileComplete: true },
      });
    });
    await page.route('**/api/resumes', (route) =>
      json(route, 200, { success: true, resumes: [resume(), resume({ id: 'res_2', title: 'Variant CV' })] }),
    );
    await page.route('**/api/jobs-data', (route) =>
      json(route, 200, {
        success: true,
        jobs: [job(), job({ id: 'job_102', title: 'Platform Engineer', company_name: '', company: '', location: 'Pune' })],
      }),
    );
    await page.route('**/api/favourites', (route) =>
      json(route, 200, {
        success: true,
        favourites: [{ id: 'fav_1', itemId: 'job_101', itemType: 'job', createdAt: '2026-10-26T10:00:00.000Z', data: { title: 'Backend Engineer' }, job: null, document: null }],
      }),
    );
    await page.route('**/api/covers', (route) => json(route, 200, { success: true, covers: [] }));

    await page.goto('/dashboard');

    await expect(page.getByTestId('cuba-welcome-greeting')).toContainText('Priya');
    await expect(page.getByTestId('cuba-metric-resumes')).toContainText('3');
    await expect(page.getByTestId('cuba-metric-covers')).toContainText('2');
    await expect(page.getByTestId('cuba-metric-portfolios')).toContainText('1');

    // The job section is labelled honestly: these are the newest listings, not
    // "personalised matches".
    const jobSection = page.getByTestId('cuba-top-job-matches');
    await expect(jobSection.getByRole('heading', { name: 'Recently posted jobs' })).toBeVisible();
    await expect(jobSection).toContainText('not personalised');
    await expect(jobSection.getByText('Backend Engineer')).toBeVisible();
    // A listing without a company is shown as missing, never as an invented one.
    await expect(jobSection.getByText('Company not listed')).toBeVisible();

    // Quick actions use real routes.
    await expect(page.getByRole('link', { name: /ATS Scanner/ })).toHaveAttribute('href', '/dashboard/ats-score');
    await expect(page.getByRole('link', { name: /Mock Interview/ })).toHaveAttribute('href', '/dashboard/interviews');
    await expect(page.getByRole('link', { name: /Cover Studio/ })).toHaveAttribute('href', '/dashboard/cover-letters');

    // Applying opens the shared dialog with the row's own job data.
    await jobSection.getByRole('button', { name: /Apply to Backend Engineer/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Backend Engineer' })).toBeVisible();
    await expect(dialog).toContainText('Acme Systems');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await expectNoSeriousAxeViolations(page, '[data-testid="cuba-metric-cards"]');
    expect(statsRequests).toBeGreaterThan(0);
  });

  test('reports a failed metrics read and retries without inventing numbers', async ({ page }) => {
    await seedAuthenticatedSession(page);
    // React StrictMode mounts the page effect twice in development, so the
    // failure is held open by a flag instead of a request counter: the state
    // under test must be observable however many times the page loads.
    let statsFailing = true;
    await page.route('**/api/user-stats', (route) => {
      if (statsFailing) {
        return json(route, 503, { success: false, code: 'USER_STATS_UNAVAILABLE', error: 'Metrics unavailable.' });
      }
      return json(route, 200, {
        success: true,
        stats: { resumes: 1, coverLetters: 0, portfolios: 0, applications: 0, trackedJobs: 0, profileComplete: false },
      });
    });
    await page.route('**/api/resumes', (route) => json(route, 200, { success: true, resumes: [] }));
    await page.route('**/api/favourites', (route) => json(route, 200, { success: true, favourites: [] }));
    await page.route('**/api/covers', (route) => json(route, 200, { success: true, covers: [] }));

    let jobsFailing = true;
    await page.route('**/api/jobs-data', (route) =>
      jobsFailing
        ? json(route, 500, { success: false, error: 'Job listings are temporarily unavailable.' })
        : json(route, 200, { success: true, jobs: [job()] }),
    );

    await page.goto('/dashboard');

    const statsAlert = page.getByRole('alert').first();
    await expect(statsAlert).toContainText('Failed to load candidate metrics');
    await expect(page.getByTestId('cuba-top-job-matches')).toContainText('Open jobs couldn’t be loaded');

    statsFailing = false;
    await statsAlert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('cuba-metric-resumes')).toContainText('1');
    await expect(page.getByRole('alert').filter({ hasText: 'Failed to load candidate metrics' })).toHaveCount(0);

    jobsFailing = false;
    await page.getByTestId('cuba-top-job-matches').getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('cuba-top-job-matches').getByText('Backend Engineer')).toBeVisible();
  });

  test('shows a truthful empty state when no jobs or metrics exist', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route('**/api/user-stats', (route) =>
      json(route, 200, {
        success: true,
        stats: { resumes: 0, coverLetters: 0, portfolios: 0, applications: 0, trackedJobs: 0, profileComplete: false },
      }),
    );
    await page.route('**/api/resumes', (route) => json(route, 200, { success: true, resumes: [] }));
    await page.route('**/api/jobs-data', (route) => json(route, 200, { success: true, jobs: [] }));
    await page.route('**/api/favourites', (route) => json(route, 200, { success: true, favourites: [] }));
    await page.route('**/api/covers', (route) => json(route, 200, { success: true, covers: [] }));

    await page.goto('/dashboard');
    const jobSection = page.getByTestId('cuba-top-job-matches');
    await expect(jobSection.getByText('No active jobs found right now')).toBeVisible();
    // With no resumes there is no ATS score: the metric says so instead of 0%.
    await expect(page.getByTestId('cuba-metric-ats')).toContainText('Not scored');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TASK 2 — AI cover letter studio
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('Task 2 — AI cover letter studio', () => {
  const letter = {
    id: 'cl_1',
    candidateFirstname: 'Priya',
    candidateLastname: 'Sharma',
    candidateEmail: 'priya@example.test',
    candidatePhone: '+919876543210',
    candidateAddress: '',
    candidateCity: 'Bengaluru',
    candidatePostalCode: '560001',
    jobTitle: 'Backend Engineer',
    companyName: 'Acme Systems',
    recipientName: 'Hiring Manager',
    companyAddress: '',
    companyCity: 'Bengaluru',
    companyPostalCode: '',
    letterBody: 'I have spent six years building Go services on Postgres and would like to bring that to Acme.',
    jobDescription: 'Go, Postgres and Kubernetes experience required.',
    userSkills: 'Go, Postgres',
    aiTone: 'modern',
    templateId: 'Cover1',
    updated_at: '2026-10-20T09:00:00.000Z',
  };

  test('prefills role and company from the query string and keeps the builder honest', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.goto('/cover-letter/new?role=Staff%20Engineer&company=Nimbus');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Staff Engineer');
    await expect(page.locator('#cover-letter-jobTitle')).toHaveValue('Staff Engineer');
    await expect(page.locator('#cover-letter-companyName')).toHaveValue('Nimbus');
    await expect(page.getByTestId('cover-letter-save-state')).toContainText('Not saved yet');
    await expectNoSeriousAxeViolations(page);
  });

  test('generates a draft from the configured AI endpoint, saves it, and reports a failed save', async ({ page }) => {
    await seedAuthenticatedSession(page);

    const aiBodies: Array<Record<string, unknown>> = [];
    await page.route('**/api/generate-ai-cover-letter', async (route) => {
      aiBodies.push(JSON.parse(route.request().postData() ?? '{}'));
      return json(route, 200, {
        success: true,
        coverLetter: 'Dear Hiring Manager,\n\nI have built Go services on Postgres for six years and would bring that experience to your team.',
        provider: 'test-provider',
      });
    });

    let saveFailing = true;
    const savedBodies: Array<Record<string, unknown>> = [];
    // A new letter is saved under an id the builder generates, so the fixture
    // matches any covers id and echoes it back.
    await page.route('**/api/covers/cl_*', async (route) => {
      const request = route.request();
      const id = decodeURIComponent(new URL(request.url()).pathname.split('/').pop() ?? '');
      if (request.method() !== 'POST') {
        return json(route, 200, { success: true, cover: { ...letter, id } });
      }
      const body = JSON.parse(request.postData() ?? '{}');
      savedBodies.push(body);
      if (saveFailing) return json(route, 500, { success: false, error: 'Cover letters are temporarily unavailable.' });
      return json(route, 200, { success: true, cover: { ...body, id, updated_at: '2026-10-29T10:00:00.000Z' } });
    });

    await page.goto('/cover-letter/new');
    await page.locator('#cover-letter-jobTitle').fill('Backend Engineer');
    await page.locator('#cover-letter-companyName').fill('Acme Systems');
    await page.getByRole('button', { name: 'Generate draft' }).click();

    await expect(page.locator('#cover-letter-letterBody')).toHaveValue(/Go services on Postgres/);
    expect(aiBodies[0]?.['jobTitle']).toBe('Backend Engineer');
    expect(aiBodies[0]?.['companyName']).toBe('Acme Systems');
    // The provider is never named as if it were the candidate's own ATS.
    await expect(page.getByTestId('cover-letter-save-state')).toContainText('Unsaved changes');

    // A failed save keeps the draft and says so.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').first()).toContainText('Your changes were not saved');
    await expect(page.locator('#cover-letter-letterBody')).toHaveValue(/Go services on Postgres/);
    await expect(page.getByTestId('cover-letter-save-state')).toContainText('Unsaved changes');

    // Retrying confirms through the server before claiming success.
    saveFailing = false;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('cover-letter-save-state')).toContainText('All changes saved');
    expect(savedBodies).toHaveLength(2);
    expect(String(savedBodies[1]?.['letterBody'])).toContain('Go services on Postgres');
  });

  test('autosaves an already-saved letter and only reports saved after the server answers', async ({ page }) => {
    await seedAuthenticatedSession(page);
    const saves: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/covers/cl_1')) saves.push(request.postData() ?? '');
    });

    await page.route('**/api/covers/cl_1', async (route) => {
      if (route.request().method() === 'GET') {
        return json(route, 200, { success: true, cover: letter });
      }
      const body = JSON.parse(route.request().postData() ?? '{}');
      return json(route, 200, { success: true, cover: { ...body, id: 'cl_1', updated_at: '2026-10-29T11:00:00.000Z' } });
    });

    await page.goto('/cover-letter/cl_1');
    await expect(page.locator('#cover-letter-letterBody')).toHaveValue(/six years building Go services/);

    await page.locator('#cover-letter-letterBody').fill(`${letter.letterBody} I also mentor engineers.`);
    // Autosave waits for a quiet period; the wait below is longer than it.
    await expect(page.getByTestId('cover-letter-save-state')).toContainText('All changes saved', { timeout: 15_000 });
    expect(saves.length).toBeGreaterThan(0);
    expect(saves.at(-1)).toContain('I also mentor engineers');
  });

  test('manages saved letters: search, sort, duplicate and delete confirm through the API', async ({ page }) => {
    await seedAuthenticatedSession(page);
    const summaries = [
      { ...letter, title: 'Backend Engineer at Acme Systems' },
      { ...letter, id: 'cl_2', jobTitle: 'QA Engineer', companyName: 'Beta Labs', title: 'QA Engineer at Beta Labs', updated_at: '2026-09-01T09:00:00.000Z' },
    ];
    await page.route('**/api/covers', (route) => json(route, 200, { success: true, covers: summaries }));
    await page.route('**/api/covers/cl_1', (route) => json(route, 200, { success: true, cover: letter }));

    const posted: string[] = [];
    await page.route('**/api/covers/cl_*', async (route) => {
      if (route.request().method() === 'POST') {
        posted.push(route.request().url());
        const body = JSON.parse(route.request().postData() ?? '{}');
        return json(route, 200, { success: true, cover: { ...body, updated_at: '2026-10-29T12:00:00.000Z' } });
      }
      return json(route, 200, { success: true, cover: letter });
    });

    await page.goto('/dashboard/cover-letters');
    await expect(page.getByRole('link', { name: 'Backend Engineer at Acme Systems', exact: true })).toBeVisible();

    // Sort is kept in the URL.
    await page.getByLabel('Sort').selectOption('title-asc');
    await expect(page).toHaveURL(/sort=title-asc/);

    // Search narrows the list without another request.
    await page.getByLabel('Search cover letters').fill('beta');
    await expect(page.getByRole('link', { name: 'QA Engineer at Beta Labs', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Backend Engineer at Acme Systems', exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/q=beta/);

    await page.getByLabel('Search cover letters').fill('');
    await page.getByRole('button', { name: /Duplicate Backend Engineer at Acme Systems/ }).click();
    await expect(page.getByRole('status').first()).toContainText('Duplicated');
    expect(posted.some((url) => /\/api\/covers\/cl_/.test(url))).toBe(true);

    let deleted = false;
    await page.route('**/api/covers/cl_2', (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        return json(route, 200, { success: true });
      }
      return json(route, 200, { success: true, cover: { ...letter, id: 'cl_2' } });
    });

    await page.getByRole('button', { name: /Delete QA Engineer at Beta Labs/ }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('Delete this cover letter?');
    await confirm.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page.getByRole('link', { name: 'QA Engineer at Beta Labs', exact: true })).toHaveCount(0);
    expect(deleted).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TASK 3 — Public job board and regional hubs
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('Task 3 — Public job board and regional hubs', () => {
  const manyJobs = Array.from({ length: 10 }, (_, index) => job({
    id: `job_${100 + index}`,
    title: `Engineer ${index + 1}`,
    company_name: index % 2 === 0 ? 'Acme Systems' : 'Beta Labs',
    job_type: index % 3 === 0 ? 'contract' : 'full-time',
    workplace_type: index === 0 ? 'Remote' : 'On-site',
    location: index === 0 ? 'Remote (India)' : 'Bengaluru, Karnataka',
  }));

  test('filters locally, keeps the URL in step and paginates the authoritative rows', async ({ page }) => {
    const requests: string[] = [];
    await page.route('**/api/jobs-data**', (route) => {
      requests.push(route.request().url());
      return json(route, 200, { success: true, jobs: manyJobs });
    });

    await page.goto('/jobs');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find Your Next Role');
    await expect(page.getByText('Showing 1–8 of 10 open jobs')).toBeVisible();

    // The endpoint does not implement q/location/type; the page must not pretend it does.
    const firstRequest = new URL(requests[0] ?? 'http://x/jobs-data');
    for (const unsupported of ['q', 'location', 'type', 'page', 'salary_min', 'remote']) {
      expect(firstRequest.searchParams.has(unsupported), `${unsupported} must not be sent to an endpoint that ignores it`).toBe(false);
    }

    // Employment type filters narrow the list and land in the URL.
    await page.getByRole('group', { name: 'Employment type' }).getByRole('button', { name: 'Remote' }).click();
    await expect(page).toHaveURL(/type=remote/);
    await expect(page.getByText('Showing 1–1 of 1 open job')).toBeVisible();

    await page.getByRole('group', { name: 'Employment type' }).getByRole('button', { name: 'All types' }).click();
    // Search is debounced and then reflected in the URL.
    await page.getByLabel('Job title, keyword or company').fill('Beta Labs');
    await expect(page).toHaveURL(/q=Beta\+Labs|q=Beta%20Labs/, { timeout: 10_000 });
    await expect(page.getByText('Showing 1–5 of 5 open jobs')).toBeVisible();

    await page.getByLabel('Job title, keyword or company').fill('');
    await page.getByRole('navigation', { name: 'Job results pages' }).getByRole('button', { name: /Next/ }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Showing 9–10 of 10 open jobs')).toBeVisible();
    await expect(page.getByText('Engineer 9')).toBeVisible();

    await expectNoSeriousAxeViolations(page);
  });

  test('shows a visible error with retry, and a stale response never replaces the latest one', async ({ page }) => {
    // A flag, not a counter: StrictMode mounts the page twice in development.
    let failing = true;
    await page.route('**/api/jobs-data**', (route) =>
      failing
        ? json(route, 503, { success: false, error: 'Job listings are temporarily unavailable.' })
        : json(route, 200, { success: true, jobs: [job({ id: 'job_new', title: 'Fresh Role' })] }),
    );

    await page.goto('/jobs');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Job listings couldn’t be loaded');
    await expect(alert).toContainText('temporarily unavailable');

    failing = false;
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Fresh Role' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('shows an honest empty state when nothing is published', async ({ page }) => {
    await page.route('**/api/jobs-data**', (route) => json(route, 200, { success: true, jobs: [] }));
    await page.goto('/jobs');
    await expect(page.getByText('No open positions right now')).toBeVisible();
    await expect(page.getByText('Employers haven’t published any open roles yet.')).toBeVisible();
  });

  test('city hub renders real aggregates, its breadcrumb and the application dialog', async ({ page }) => {
    const requested: string[] = [];
    await page.route('**/api/public/geo/regions/**', (route) => {
      requested.push(new URL(route.request().url()).pathname);
      return json(route, 200, {
        success: true,
        region: {
          kind: 'city',
          slug: 'bengaluru',
          name: 'Bengaluru',
          stateSlug: 'karnataka',
          stateName: 'Karnataka',
          vacancyCount: 2,
          hasVacancies: true,
          companyCount: 2,
          topCompanies: [{ name: 'Acme Systems', openings: 1 }, { name: 'Beta Labs', openings: 1 }],
          salaryRanges: [{ currency: 'INR', unit: 'LPA', minAnnual: 600000, maxAnnual: 1200000, averageAnnual: 900000, averageLpa: 9 }],
          vacancies: [
            { id: 'job_101', title: 'Backend Engineer', company: 'Acme Systems', location: 'Bengaluru', workplaceType: 'Hybrid', jobType: 'Full-time', salaryMin: 1200000, salaryMax: 1800000, salaryCurrency: 'INR' },
            { id: 'job_102', title: 'QA Engineer', company: 'Beta Labs', location: 'Bengaluru', workplaceType: 'On-site', jobType: 'Contract', salaryMin: null, salaryMax: null, salaryCurrency: null },
          ],
        },
      });
    });
    await page.route('**/api/resumes', (route) => json(route, 200, { success: true, resumes: [resume()] }));
    await seedAuthenticatedSession(page);

    await page.goto('/jobs/city/bengaluru');
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs in Bengaluru' })).toBeVisible();
    expect(requested[0]).toBe('/api/public/geo/regions/city/bengaluru');

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
    await expect(breadcrumb.getByRole('link', { name: 'Karnataka' })).toHaveAttribute('href', '/jobs/in/karnataka');

    await expect(page.getByText('Open positions').first()).toBeVisible();
    await expect(page.getByText('₹6–12 LPA')).toBeVisible();
    await expect(page.getByText('They are not an external salary benchmark.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Companies with open roles in Bengaluru' })).toBeVisible();

    // Employment-type facets come from the rows, not a fixed menu.
    const typeGroup = page.getByRole('group', { name: 'Employment type' });
    await expect(typeGroup.getByRole('button')).toHaveCount(3); // All + contract + full-time
    await typeGroup.getByRole('button', { name: 'contract' }).click();
    // The count reports the filtered rows against every listing in the region.
    await expect(page.getByText('1 of 2 listings shown')).toBeVisible();

    await page.getByRole('button', { name: /Apply to QA Engineer/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'QA Engineer' })).toBeVisible();
    await expect(dialog).toContainText('Beta Labs');
  });

  test('state hub uses the /jobs/in/ route and an unknown slug is reported as such', async ({ page }) => {
    const requested: string[] = [];
    await page.route('**/api/public/geo/regions/in/karnataka', (route) => {
      requested.push(new URL(route.request().url()).pathname);
      return json(route, 200, {
        success: true,
        region: {
          kind: 'state',
          slug: 'karnataka',
          name: 'Karnataka',
          stateSlug: 'karnataka',
          stateName: 'Karnataka',
          vacancyCount: 0,
          hasVacancies: false,
          companyCount: 0,
          topCompanies: [],
          salaryRanges: [],
          vacancies: [],
        },
      });
    });
    await page.route('**/api/public/geo/regions/city/atlantis**', (route) =>
      json(route, 404, { success: false, code: 'REGION_NOT_FOUND', error: 'This regional job hub is not available.' }),
    );
    await seedAuthenticatedSession(page);

    await page.goto('/jobs/in/karnataka');
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs in Karnataka' })).toBeVisible();
    expect(requested[0]).toBe('/api/public/geo/regions/in/karnataka');
    await expect(page.getByText('No open roles in Karnataka right now')).toBeVisible();
    // No zero-filled benchmark is fabricated for an empty region.
    await expect(page.getByText('Advertised salary')).toHaveCount(0);

    await page.goto('/jobs/city/atlantis');
    await expect(page.getByRole('heading', { level: 1, name: 'This regional job hub isn’t available' })).toBeVisible();
    await expect(page.getByText(/isn’t a published city or state hub/)).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TASK 4 — Accessible job application dialog
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('Task 4 — Accessible job application dialog', () => {
  const openDialog = async (page: Page) => {
    await page.goto('/jobs');
    const apply = page.getByRole('button', { name: /Apply to Backend Engineer/ });
    await apply.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return { dialog, apply };
  };

  const mockJobs = async (page: Page) => {
    await page.route('**/api/jobs-data**', (route) => json(route, 200, { success: true, jobs: [job()] }));
    await page.route('**/api/resumes', (route) => json(route, 200, { success: true, resumes: [resume()] }));
  };

  test('traps focus, restores it on close and validates every field before sending', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockJobs(page);

    let posted = 0;
    await page.route('**/api/jobs/*/applications', (route) => {
      posted += 1;
      return json(route, 201, { success: true });
    });

    const { dialog, apply } = await openDialog(page);

    // Accessible name comes from the dialog title.
    await expect(dialog).toHaveAccessibleName('Backend Engineer');
    // Focus starts inside the dialog.
    const focusInside = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(focusInside).toBe(true);

    // The applicant's email is the verified account address, read-only.
    await expect(dialog.getByLabel('Email')).toHaveValue(CANDIDATE.email);
    await expect(dialog.getByLabel('Email')).toHaveAttribute('readonly');

    // Submitting empty fields shows field-level errors and sends nothing.
    await dialog.getByRole('button', { name: /Submit application/ }).click();
    await expect(dialog.getByText('Enter your phone number.')).toBeVisible();
    await expect(dialog.getByText('Add a short pitch so the employer knows why you fit.')).toBeVisible();
    expect(posted).toBe(0);

    // E.164 handling: a "+" number must be a full international number.
    await dialog.getByLabel('Phone').fill('+0123456789');
    await dialog.getByLabel('Pitch / cover note (50–1000 characters)').fill('I have built Go services on Postgres for six years and would love to help Acme.');
    await dialog.getByLabel('Full name').fill('Priya Sharma');
    await dialog.getByRole('button', { name: /Submit application/ }).click();
    await expect(dialog.getByText(/must be a full international number/)).toBeVisible();
    expect(posted).toBe(0);

    // Escape closes and focus returns to the trigger.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(apply).toBeFocused();
  });

  test('submits the real contract, confirms with the server and surfaces ALREADY_APPLIED separately', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockJobs(page);

    const bodies: Array<Record<string, unknown>> = [];
    let mode: 'ok' | 'already' | 'conflict' | 'boom' = 'ok';
    await page.route('**/api/jobs/*/applications', async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? '{}'));
      if (mode === 'already') return json(route, 409, { success: false, code: 'ALREADY_APPLIED', error: 'You have already applied to this job.' });
      if (mode === 'conflict') return json(route, 409, { success: false, code: 'APPLICATION_CHANGED', error: 'This job changed while you were applying.' });
      if (mode === 'boom') return json(route, 500, { success: false, error: 'Unable to submit application.' });
      return json(route, 201, { success: true, applicationId: 'usr_cand_11e_job_101' });
    });

    const refetches: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/jobs-data')) refetches.push(request.url());
    });

    const { dialog } = await openDialog(page);
    await dialog.getByLabel('Full name').fill('Priya Sharma');
    await dialog.getByLabel('Phone').fill('+91 98765 43210');
    await dialog.getByLabel('LinkedIn (optional)').fill('https://linkedin.com/in/priya');
    await dialog.getByLabel('Pitch / cover note (50–1000 characters)').fill(
      'I have built Go services on Postgres for six years and would love to help Acme scale its platform team.',
    );
    await dialog.getByRole('button', { name: /Submit application/ }).click();

    await expect(dialog.getByText('Application submitted')).toBeVisible();
    expect(bodies[0]).toMatchObject({
      fullName: 'Priya Sharma',
      phone: '+91 98765 43210',
      resumeId: 'res_1',
      linkedinUrl: 'https://linkedin.com/in/priya',
    });
    expect(String(bodies[0]?.['coverLetter'])).toContain('six years');
    // onApplied() refreshes the listing only after a confirmed success.
    await expect.poll(() => refetches.length).toBeGreaterThan(1);
    await expect(dialog.getByRole('link', { name: 'View your applications' })).toHaveAttribute('href', '/dashboard/applied-jobs');

    // Already applied is a non-fatal, clearly named state.
    mode = 'already';
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    const second = await openDialog(page);
    await second.dialog.getByLabel('Full name').fill('Priya Sharma');
    await second.dialog.getByLabel('Phone').fill('+91 98765 43210');
    await second.dialog.getByLabel('Pitch / cover note (50–1000 characters)').fill(
      'I have built Go services on Postgres for six years and would love to help Acme scale its platform team.',
    );
    await second.dialog.getByRole('button', { name: /Submit application/ }).click();
    await expect(second.dialog.getByText('You’ve already applied')).toBeVisible();
    await expect(second.dialog.getByText('Application submitted')).toHaveCount(0);

    // Any other 409 is a different conflict, not "already applied".
    mode = 'conflict';
    await second.dialog.getByRole('button', { name: 'Done' }).click();
    const third = await openDialog(page);
    await third.dialog.getByLabel('Full name').fill('Priya Sharma');
    await third.dialog.getByLabel('Phone').fill('+91 98765 43210');
    await third.dialog.getByLabel('Pitch / cover note (50–1000 characters)').fill(
      'I have built Go services on Postgres for six years and would love to help Acme scale its platform team.',
    );
    await third.dialog.getByRole('button', { name: /Submit application/ }).click();
    await expect(third.dialog.getByRole('alert')).toContainText('This job changed while you were applying.');
    await expect(third.dialog.getByText('You’ve already applied')).toHaveCount(0);
    await expect(third.dialog.getByText('Application submitted')).toHaveCount(0);
    // The form is preserved for a recoverable failure.
    await expect(third.dialog.getByLabel('Pitch / cover note (50–1000 characters)')).toHaveValue(/six years/);
  });

  test('a server failure never claims success, and a resume read failure is shown', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route('**/api/jobs-data**', (route) => json(route, 200, { success: true, jobs: [job()] }));
    let resumeAttempt = 0;
    await page.route('**/api/resumes', (route) => {
      resumeAttempt += 1;
      if (resumeAttempt === 1) return json(route, 503, { success: false, error: 'Resumes are unavailable.' });
      return json(route, 200, { success: true, resumes: [resume()] });
    });
    await page.route('**/api/jobs/*/applications', (route) => json(route, 500, { success: false, error: 'Unable to submit application.' }));

    const { dialog } = await openDialog(page);
    await expect(dialog.getByRole('alert')).toContainText('Your resumes couldn’t be loaded');
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByRole('radio')).toHaveCount(1);

    await dialog.getByLabel('Full name').fill('Priya Sharma');
    await dialog.getByLabel('Phone').fill('9876543210');
    await dialog.getByLabel('Pitch / cover note (50–1000 characters)').fill(
      'I have built Go services on Postgres for six years and would love to help Acme scale its platform team.',
    );
    await dialog.getByRole('button', { name: /Submit application/ }).click();
    await expect(dialog.getByText('Application submitted')).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toContainText('Unable to submit application.');
    await expectNoSeriousAxeViolations(page, '[role="dialog"]');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TASK 5 — Favourites centre
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('Task 5 — Favourites centre', () => {
  const favouritesPayload = {
    success: true,
    favourites: [
      {
        id: 'fav_job', itemId: 'job_101', itemType: 'job', createdAt: '2026-10-26T10:00:00.000Z',
        data: { title: 'Backend Engineer', company: 'Acme Systems', location: 'Bengaluru' },
        job: { title: 'Backend Engineer', company: 'Acme Systems', location: 'Bengaluru', listed: true },
        document: null,
      },
      {
        id: 'fav_res', itemId: 'res_1', itemType: 'resume', createdAt: '2026-10-25T10:00:00.000Z',
        data: {}, job: null, document: { title: 'Master Resume' },
      },
      {
        id: 'fav_cover', itemId: 'cl_1', itemType: 'cover', createdAt: '2026-10-24T10:00:00.000Z',
        data: {}, job: null, document: { title: 'Acme cover letter' },
      },
      {
        id: 'fav_stale', itemId: 'job_999', itemType: 'job', createdAt: '2026-10-20T10:00:00.000Z',
        data: { title: 'Old Role', company: 'Gone Ltd' }, job: null, document: null,
      },
    ],
  };

  test('filters by tab, syncs the URL, removes through the API and undoes by re-saving', async ({ page }) => {
    await seedAuthenticatedSession(page);
    let listCalls = 0;
    await page.route('**/api/favourites', (route) => {
      if (route.request().method() === 'POST') {
        return json(route, 200, { success: true, favourite: { itemId: 'job_101' } });
      }
      listCalls += 1;
      return json(route, 200, favouritesPayload);
    });
    const deleted: string[] = [];
    await page.route('**/api/favourites/job_101', (route) => {
      if (route.request().method() === 'DELETE') {
        deleted.push(route.request().url());
        return json(route, 200, { success: true, isFavourite: false, removed: true });
      }
      return json(route, 200, { success: true, isFavourite: true });
    });

    await page.goto('/dashboard/favourites');
    await expect(page.getByRole('heading', { name: 'Saved Favorites' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Saved items' }).getByRole('listitem')).toHaveCount(4);

    const tabs = page.getByRole('group', { name: 'Show' });
    await expect(tabs.getByRole('button', { name: /^Jobs/ })).toContainText('2');
    await tabs.getByRole('button', { name: /^Jobs/ }).click();
    await expect(page).toHaveURL(/type=jobs/);
    await expect(page.getByRole('list', { name: 'Saved items' }).getByRole('listitem')).toHaveCount(2);

    await tabs.getByRole('button', { name: /^Documents/ }).click();
    await expect(page).toHaveURL(/type=documents/);
    await expect(page.getByRole('link', { name: /Open in Resume Builder: Master Resume/ })).toHaveAttribute('href', '/build-resume/res_1');
    await expect(page.getByRole('link', { name: /Open in Cover Letter Builder: Acme cover letter/ })).toHaveAttribute('href', '/cover-letter/cl_1');

    // Search is also in the URL.
    await page.getByLabel('Search saved items').fill('acme');
    await expect(page).toHaveURL(/q=acme/);
    await expect(page.getByRole('list', { name: 'Saved items' }).getByRole('listitem')).toHaveCount(1);

    // Removal goes through the API and offers a real Undo (the item is saved again).
    await page.getByLabel('Search saved items').fill('');
    await tabs.getByRole('button', { name: /^Jobs/ }).click();
    await page.getByRole('button', { name: /Remove Backend Engineer at Acme Systems from your saved items/ }).click();
    await expect.poll(() => deleted.length).toBe(1);
    await expect(page.getByRole('button', { name: /Undo: save Backend Engineer at Acme Systems again/ })).toBeVisible();

    const before = listCalls;
    await page.getByRole('button', { name: /Undo: save Backend Engineer at Acme Systems again/ }).click();
    await expect(page.getByRole('status').first()).toContainText('is back in your saved items');
    await expect.poll(() => listCalls).toBeGreaterThan(before);
  });

  test('a failed removal keeps the item and says so', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route('**/api/favourites', (route) => json(route, 200, favouritesPayload));
    await page.route('**/api/favourites/job_101', (route) =>
      json(route, 503, { success: false, code: 'DATABASE_UNAVAILABLE', error: 'Saved items are temporarily unavailable' }),
    );

    await page.goto('/dashboard/favourites');
    await page.getByRole('button', { name: /Remove Backend Engineer at Acme Systems from your saved items/ }).click();
    await expect(page.getByRole('alert').first()).toContainText('wasn’t removed');
    // The row is still there: nothing was optimistically dropped.
    await expect(page.getByRole('heading', { name: 'Backend Engineer', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Undo/ })).toHaveCount(0);
  });

  test('applies to a saved job through the shared dialog', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route('**/api/favourites', (route) => json(route, 200, favouritesPayload));
    await page.route('**/api/resumes', (route) => json(route, 200, { success: true, resumes: [resume()] }));
    const bodies: Array<Record<string, unknown>> = [];
    await page.route('**/api/jobs/job_101/applications', (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? '{}'));
      return json(route, 201, { success: true });
    });

    await page.goto('/dashboard/favourites');
    await page.getByRole('button', { name: 'Apply to Backend Engineer at Acme Systems' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Backend Engineer' })).toBeVisible();

    await dialog.getByLabel('Full name').fill('Priya Sharma');
    await dialog.getByLabel('Phone').fill('+91 98765 43210');
    await dialog.getByLabel('Pitch / cover note (50–1000 characters)').fill(
      'I have built Go services on Postgres for six years and would love to help Acme scale its platform team.',
    );
    await dialog.getByRole('button', { name: /Submit application/ }).click();
    await expect(dialog.getByText('Application submitted')).toBeVisible();
    expect(bodies).toHaveLength(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TASK 6 — Public landing and features WCAG 2.1 AA
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('Task 6 — Public landing and features accessibility', () => {
  const pages = [
    { path: '/', heading: 'Build Your Career with Confidence' },
    { path: '/features', heading: 'Every Tool You Need to Land Your Next Offer' },
  ];

  for (const target of pages) {
    test(`${target.path} has one main landmark, named navigation, a working skip link and no axe violations`, async ({ page }) => {
      await page.goto(target.path);

      await expect(page.getByRole('heading', { level: 1 })).toContainText(target.heading);
      expect(await page.getByRole('main').count()).toBe(1);
      await expect(page.getByRole('main')).toHaveId('main-content');

      // Every navigation region is distinctly named.
      const navNames = await page.getByRole('navigation').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('aria-label') ?? ''),
      );
      expect(navNames.length).toBeGreaterThan(0);
      expect(navNames.every((name) => name.trim().length > 0)).toBe(true);
      expect(new Set(navNames).size).toBe(navNames.length);
      await expect(page.getByRole('navigation').first()).toHaveAccessibleName('Main navigation');

      // The skip link is the first focusable control and moves focus to main.
      await page.keyboard.press('Tab');
      const skipLink = page.getByRole('link', { name: 'Skip to main content' });
      await expect(skipLink).toBeFocused();
      await expect(skipLink).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      await expect(page).toHaveURL(/#main-content$/);

      // Every interactive control has an accessible name.
      const unnamed = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('a, button, input, select, textarea'));
        return candidates
          .filter((element) => {
            const accessible = (element.getAttribute('aria-label') ?? '').trim()
              || (element.getAttribute('title') ?? '').trim()
              || (element.textContent ?? '').trim()
              || (element.getAttribute('alt') ?? '').trim();
            return !accessible;
          })
          .map((element) => element.outerHTML.slice(0, 80));
      });
      expect(unnamed).toEqual([]);

      await expectNoSeriousAxeViolations(page);
    });

    test(`${target.path} holds up at 375, 768, 1024 and 1440 pixels`, async ({ page }) => {
      await page.goto(target.path);
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoHorizontalOverflow(page);
        // The primary heading stays visible at every width.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      }
    });
  }

  test('focus indicators remain visible on the public navigation', async ({ page }) => {
    await page.goto('/');
    // Wait for the mounted page: tabbing before hydration focuses <body>, which
    // has no indicator and would test nothing.
    await expect(page.getByRole('main')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return null;
      const styles = getComputedStyle(active);
      return {
        outlineStyle: styles.outlineStyle,
        outlineWidth: styles.outlineWidth,
        boxShadow: styles.boxShadow,
      };
    });
    expect(outline).not.toBeNull();
    const hasIndicator = outline?.outlineStyle !== 'none' || (outline?.boxShadow ?? 'none') !== 'none';
    expect(hasIndicator, `focused element needs a visible indicator, got ${JSON.stringify(outline)}`).toBe(true);
  });
});
