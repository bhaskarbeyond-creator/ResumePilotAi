/**
 * ATS scoring across Overview, ATS Score and Resumes (directive P002, C5).
 *
 * Runs at all five profiles against the real backend. Expected numbers are
 * computed with the deterministic scorer (src/lib/atsScore.js) on the resume
 * rows the API actually stores and returns, so the UI is checked against the
 * persisted data. Before C5 the UI showed "85%" (Overview), "undefined%" and
 * 0% readiness (ATS Score) and "Unscored" (Resumes) for the same rows.
 * FAULT INJECTION tests abort a browser request; nothing is fabricated.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { calculateAtsScore } from '../../src/lib/atsScore.js';
import {
  ACCOUNTS,
  expect,
  expectNoHorizontalOverflow,
  storageStatePath,
  test,
  type AccountKey,
  type ApiClient,
} from './fixtures';

type Row = Record<string, unknown> & { id: string; title: string };

const createdResumes: Array<{ account: AccountKey; id: string }> = [];
test.afterEach(async ({ apiAs }) => {
  while (createdResumes.length) {
    const { account, id } = createdResumes.pop()!;
    await apiAs(account).del(`/resumes/${encodeURIComponent(id)}`);
  }
});

const uniqueTag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

function strongResume(tag: string): Record<string, unknown> {
  return {
    title: `Senior QA Engineer ${tag}`,
    template: 'Cv1',
    firstname: 'Avery',
    lastname: 'Tester',
    email: ACCOUNTS.a.email,
    phone: '5550100200',
    occupation: 'Senior QA Engineer',
    city: 'Testville',
    country: 'Testland',
    summary: 'Senior QA engineer with 8 years of experience leading test automation for payment and banking products, mentoring engineers and improving release quality.',
    skills: [{ name: 'Playwright' }, { name: 'TypeScript' }, { name: 'SQL' }, { name: 'CI/CD' }, { name: 'API testing' }],
    employments: [
      {
        jobTitle: 'Senior QA Engineer', employer: 'Example Test Co', begin: '2021-01', end: '',
        description: '<ul><li>Led a team of 4 engineers building a Playwright suite that covers 120 checkout flows.</li><li>Reduced flaky tests by 40% by isolating test data per run.</li><li>Cut regression time from 6 hours to 45 minutes with parallel CI jobs.</li></ul>',
      },
      {
        jobTitle: 'QA Engineer', employer: 'Sample Labs', begin: '2017-03', end: '2020-12',
        description: '<ul><li>Automated 300 API tests for the payments service.</li><li>Introduced contract tests that caught 25 breaking changes before release.</li></ul>',
      },
    ],
    educations: [{ school: 'Example University', degree: 'BSc Computer Science', begin: '2013', end: '2017' }],
    certifications: [{ name: 'ISTQB Advanced Test Automation Engineer', issuer: 'ISTQB', date: '2020' }],
  };
}

function thinResume(tag: string): Record<string, unknown> {
  return { title: `Draft Resume ${tag}`, template: 'Cv2', firstname: 'Avery', lastname: 'Tester', summary: 'Tester.' };
}

/** Save through the public API and return the row the server stored. */
async function seedResume(api: ApiClient, account: AccountKey, fields: Record<string, unknown>): Promise<Row> {
  const id = `res_e2e_${uniqueTag()}`;
  const response = await api.post<{ success: boolean; resume: Row }>(`/resumes/${id}`, fields);
  expect(response.status, `seeding ${id}`).toBe(200);
  createdResumes.push({ account, id });
  expect(Object.prototype.hasOwnProperty.call(response.body.resume, 'data'), 'stored rows have no data column').toBe(false);
  return response.body.resume;
}

const quality = (row: Row) => Math.round(calculateAtsScore(row).qualityScore);

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).include('#main-content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 5).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test.describe('ATS scoring (account A)', () => {
  test('overview: average and best scores come from the stored resumes; profile status and plan are real', async ({ page, apiAs }) => {
    const api = apiAs('a');
    const tag = uniqueTag();
    await seedResume(api, 'a', thinResume(tag));
    await page.waitForTimeout(1100); // updated_at has one-second resolution; keep the strong resume newest
    const strong = await seedResume(api, 'a', strongResume(tag));

    const rows = (await api.get<{ resumes: Row[] }>('/resumes')).body.resumes;
    const scores = rows.map(quality);
    const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    const best = Math.max(...scores);
    expect(rows[0].id, 'the newest resume is the primary one').toBe(strong.id);
    expect([average, best], 'precondition: real scores differ from the old hard-coded value').not.toContain(85);
    const stats = (await api.get<{ stats: { profileComplete: boolean } }>('/user-stats')).body.stats;
    const membership = (await api.get<{ user: { membership: string } }>('/users-data/profile')).body.user.membership;

    await page.goto('/dashboard');
    const atsCard = page.getByTestId('cuba-metric-ats');
    await expect(atsCard).toContainText(`${average}%`);
    await expect(atsCard).toContainText(average >= 80 ? 'Ready to apply' : 'Target 80%+');
    await expect(page.getByTestId('cuba-copilot-hud')).toContainText(
      best >= 80 ? `Your best resume scores ${best}% on the ATS readiness check.` : `Your best resume scores ${best}%. Aim for 80% or higher.`,
    );
    await expect(page.getByText(`${quality(strong)}% ATS`, { exact: true })).toBeVisible();
    const profileCard = page.getByTestId('cuba-metric-profile');
    await expect(profileCard).toContainText(stats.profileComplete ? 'Complete' : 'Incomplete');
    await expect(profileCard, 'only a complete/incomplete flag is known; no percentage may be shown').not.toContainText('%');
    await expect(page.getByRole('link', { name: `${membership} plan` })).toBeVisible();
    await expect(page.getByText('Executive Candidate Plan')).toHaveCount(0);
    await expect(page.getByText(/Template:\s*Cv\d+/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ATS Score', exact: true })).toHaveAttribute('href', `/dashboard/ats-score?resume=${strong.id}`);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });

  test('ATS Score: scores the selected stored resume, keeps ?resume= on refresh, and checks job description terms', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const other = await seedResume(apiAs('a'), 'a', thinResume(tag));
    const row = await seedResume(apiAs('a'), 'a', strongResume(tag));
    const expected = calculateAtsScore(row);

    await page.goto(`/dashboard/ats-score?resume=${row.id}`);
    const select = page.getByLabel('Resume to check');
    await expect(select).toHaveValue(row.id);
    const check = page.getByRole('button', { name: 'Check resume' });
    await expect(check).toBeEnabled();
    await check.click();

    await expect(page.getByRole('heading', { name: `Results for “${row.title}”` })).toBeFocused();
    await expect(page.getByTestId('ats-total-score')).toHaveText(`${expected.totalScore}%`);
    await expect(page.getByTestId('ats-status')).toHaveText(expected.status.label);
    await expect(page.getByTestId('ats-jd-score')).toHaveCount(0);
    await expect(page.locator('[aria-label="Section scores"] > li')).toHaveCount(expected.sections.length);
    if (expected.improvements.length) await expect(page.getByText(expected.improvements[0].text, { exact: true })).toBeVisible();
    await expect(page.getByText('undefined')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const jd = 'We need a QA engineer with Playwright, TypeScript, Kubernetes and Terraform experience for payment systems.';
    const withJd = calculateAtsScore(row, { jobDescription: jd });
    await page.getByLabel('Job description', { exact: true }).fill(jd);
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByTestId('ats-jd-score')).toHaveText(`Job description match: ${withJd.jdMatch.score}%`);
    if (withJd.jdMatch.matched.length) await expect(page.getByRole('list', { name: 'Covered terms' }).getByRole('listitem')).toHaveCount(withJd.jdMatch.matched.length);
    if (withJd.jdMatch.missing.length) await expect(page.getByRole('list', { name: 'Missing terms' }).getByRole('listitem')).toHaveCount(withJd.jdMatch.missing.length);

    await page.reload();
    await expect(select).toHaveValue(row.id);
    await select.selectOption(other.id);
    await expect(page).toHaveURL(new RegExp(`[?&]resume=${other.id}`));
    await expect(page.getByTestId('ats-total-score')).toHaveCount(0);
    await page.getByRole('button', { name: 'Check resume' }).click();
    await expect(page.getByTestId('ats-total-score')).toHaveText(`${calculateAtsScore(other).totalScore}%`);
  });

  test('ATS Score: a failed resume load (FAULT INJECTION: request aborted) shows an error and never scores', async ({ page, apiAs, guard }) => {
    guard.allowConsole(/net::ERR_FAILED/);
    const row = await seedResume(apiAs('a'), 'a', strongResume(uniqueTag()));
    await page.route(`**/api/resumes/${row.id}`, (route) => route.abort('failed'));
    await page.goto(`/dashboard/ats-score?resume=${row.id}`);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('This resume could not be loaded');
    await expect(page.getByRole('button', { name: 'Check resume' })).toBeDisabled();
    await expect(page.getByTestId('ats-total-score')).toHaveCount(0);

    await page.unroute(`**/api/resumes/${row.id}`);
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('button', { name: 'Check resume' })).toBeEnabled();
    await page.getByRole('button', { name: 'Check resume' }).click();
    await expect(page.getByTestId('ats-total-score')).toHaveText(`${calculateAtsScore(row).totalScore}%`);
  });

  test('Resumes page: each card shows the stored resume’s real score instead of "unscored"', async ({ page, apiAs }) => {
    const row = await seedResume(apiAs('a'), 'a', strongResume(uniqueTag()));
    await page.goto('/dashboard/resumes');
    const badge = page.locator('[data-ats-bucket]').filter({ hasText: `ATS: ${quality(row)}/100` });
    await expect(badge.first()).toBeVisible();
    await expect(page.locator('[data-ats-bucket="unscored"]')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('accessibility: no axe WCAG 2.1 A/AA violations on the ATS Score page, before and after results', async ({ page, apiAs }) => {
    const row = await seedResume(apiAs('a'), 'a', strongResume(uniqueTag()));
    await page.goto(`/dashboard/ats-score?resume=${row.id}`);
    await expect(page.getByRole('button', { name: 'Check resume' })).toBeEnabled();
    await expectNoAxeViolations(page);
    await page.getByLabel('Job description', { exact: true }).fill('Playwright TypeScript Kubernetes');
    await page.getByRole('button', { name: 'Check resume' }).click();
    await expect(page.getByTestId('ats-total-score')).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe('ATS scoring (account B, no resumes)', () => {
  test.use({ storageState: storageStatePath('b') });

  test('overview and ATS Score never invent a score; another account’s resume id is not loaded', async ({ page, apiAs }) => {
    const resumes = (await apiAs('b').get<{ resumes: Row[] }>('/resumes')).body.resumes;
    expect(resumes, 'account B must have no resumes').toHaveLength(0);
    const foreign = await seedResume(apiAs('a'), 'a', strongResume(uniqueTag()));
    expect((await apiAs('b').get(`/resumes/${foreign.id}`)).status, 'API isolation').toBe(404);

    await page.goto('/dashboard');
    await expect(page.getByTestId('cuba-metric-ats')).toContainText('Not scored');
    await expect(page.getByTestId('cuba-copilot-hud')).toContainText('Create your first resume');
    await expect(page.getByText('85%')).toHaveCount(0);

    const requested: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(`/api/resumes/${foreign.id}`)) requested.push(request.url());
    });
    await page.goto(`/dashboard/ats-score?resume=${foreign.id}`);
    await expect(page.getByText('No saved resumes yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a resume' })).toHaveAttribute('href', '/build-resume');
    await expect(page.getByRole('button', { name: 'Check resume' })).toHaveCount(0);
    await expect(page.getByTestId('ats-total-score')).toHaveCount(0);
    expect(requested, 'the page must not request a resume outside the account’s list').toEqual([]);
    await expectNoHorizontalOverflow(page);
  });
});
