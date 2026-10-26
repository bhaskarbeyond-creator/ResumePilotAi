/**
 * Resume Builder: AI summary, truthful save state, export and share
 * (directive P002, C6).
 *
 * Runs at all five profiles against the real backend. Before C6 the builder
 * showed "AI recommendations refreshed" after a request to a route that does
 * not exist, silently ignored the retired /api/generate-summary (HTTP 410),
 * always displayed "Saved", exported and shared a placeholder resume id
 * ("res-alex-001") and sent the DOCX request without the session token.
 * FAULT INJECTION is not needed here: the sandbox's real AI answer is the
 * documented unavailable contract, asserted as received.
 */
import fs from 'node:fs';
import JSZip from 'jszip';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Request } from '@playwright/test';
import { calculateAtsScore } from '../../src/lib/atsScore.js';
import { expect, isCompact, test, type ApiClient } from './fixtures';

type Row = Record<string, unknown> & { id: string; title: string; summary?: string };

const created: string[] = [];
test.afterEach(async ({ apiAs }) => {
  while (created.length) await apiAs('a').del(`/resumes/${encodeURIComponent(created.pop()!)}`);
});

const uniqueTag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

async function seedResume(api: ApiClient, fields: Record<string, unknown>): Promise<Row> {
  const id = `res_e2e_${uniqueTag()}`;
  const response = await api.post<{ resume: Row }>(`/resumes/${id}`, { title: `Builder Check ${id}`, template: 'Cv1', ...fields });
  expect(response.status, `seeding ${id}`).toBe(200);
  created.push(id);
  return response.body.resume;
}

const withHistory = {
  firstname: 'Avery', lastname: 'Tester', email: 'p002.candidate.a@example.test', phone: '5550100200',
  occupation: 'QA Engineer',
  summary: 'QA engineer with 6 years of experience automating browser tests for payment products.',
  employments: [{ jobTitle: 'QA Engineer', employer: 'Example Test Co', begin: '2021-01', end: '', description: 'Built a Playwright suite covering 120 checkout flows.' }],
};

const summaryBox = (page: Page) => page.getByRole('textbox', { name: 'Professional Summary' });

/** The guidance panel: inline in the right column from `lg` (1024 px), in the "Guidance" dialog below it. */
async function openGuidance(page: Page) {
  if (!isCompact(page)) return page.getByTestId('resume-builder-ai-assistant');
  await page.getByRole('button', { name: 'Guidance', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Resume guidance' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function saveWithShortcut(page: Page, id: string) {
  const saved = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/resumes/${id}`);
  await summaryBox(page).press('Control+s');
  expect((await saved).status()).toBe(200);
  await expect(saveState(page)).toHaveText('Saved', { timeout: 8000 });
}
const saveState = (page: Page) => page.getByTestId('builder-save-state');

function recordRequests(page: Page, path: string): Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === path) requests.push(request);
  });
  return requests;
}

const BUILDER_STEPS = ['heading', 'experience', 'education', 'skills', 'summary', 'template', 'certifications', 'achievements', 'projects', 'languages', 'references', 'custom', 'review'];

const storedSkills = (row: Row) => (typeof row.skills === 'string' ? JSON.parse(row.skills) : row.skills) as unknown;

async function downloadDocxText(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('menuitem', { name: /Download Word \(DOCX\)/ }).click();
  const download = await downloadPromise;
  const zip = await JSZip.loadAsync(fs.readFileSync(await download.path()));
  return (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, ' ');
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).include('#main-content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 5).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test.describe('Resume Builder (account A)', () => {
  test('summary suggestion uses generate-content; an unavailable answer never changes the summary', async ({ page, apiAs, guard }) => {
    guard.expectApiStatuses(502, 503);
    const row = await seedResume(apiAs('a'), withHistory);
    const aiRequests = recordRequests(page, '/api/generate-content');
    await page.goto(`/build-resume/${row.id}/summary`);
    await expect(summaryBox(page)).toHaveValue(String(row.summary));
    await expect(saveState(page)).toHaveText('Saved');

    const pending = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/generate-content');
    await page.getByRole('button', { name: 'Suggest a summary' }).click();
    const response = await pending;
    expect(aiRequests[0].postDataJSON()).toEqual({
      operation: 'generate-summary',
      payload: {
        existingText: row.summary,
        name: 'Avery Tester',
        jobTitle: 'QA Engineer',
        workHistory: [{ jobTitle: 'QA Engineer', employer: 'Example Test Co', description: 'Built a Playwright suite covering 120 checkout flows.' }],
        tone: 'balanced',
      },
    });
    const body = (await response.json().catch(() => ({}))) as { aiUnavailable?: boolean; summary?: string };
    if (response.status() >= 500 || body.aiUnavailable) {
      test.info().annotations.push({ type: 'environment', description: `No AI provider: HTTP ${response.status()}${body.aiUnavailable ? ', aiUnavailable=true' : ''}. Unavailable path exercised.` });
      await expect(page.getByTestId('summary-ai-status')).toContainText('AI generation is unavailable right now');
      await expect(page.getByTestId('summary-suggestion')).toHaveCount(0);
    } else {
      expect(response.status()).toBe(200);
      await expect(page.getByTestId('summary-suggestion')).toContainText(String(body.summary).trim());
    }
    await expect(summaryBox(page), 'the summary changes only when the candidate applies a suggestion').toHaveValue(String(row.summary));
    await expect(saveState(page)).toHaveText('Saved');
    // The fake per-section "Polish" action is gone.
    await expect(page.getByRole('button', { name: 'Polish', exact: true })).toHaveCount(0);
    await expect(page.getByText(/AI recommendations refreshed/)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('summary suggestion with thin content shows the server’s questions instead of text', async ({ page, apiAs }) => {
    const row = await seedResume(apiAs('a'), { firstname: 'Avery', lastname: 'Tester' });
    await page.goto(`/build-resume/${row.id}/summary`);
    await expect(summaryBox(page)).toHaveValue('');
    const pending = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/generate-content');
    await page.getByRole('button', { name: 'Suggest a summary' }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { requiresAnswer?: boolean; questions?: Array<{ question: string }> };
    expect(body.requiresAnswer).toBe(true);
    await expect(page.getByTestId('summary-ai-status')).toContainText('More detail is needed');
    const questions = page.getByRole('list', { name: 'Details to add' }).getByRole('listitem');
    await expect(questions).toHaveCount(body.questions!.length);
    await expect(questions.first()).toHaveText(body.questions![0].question);
    await expect(summaryBox(page)).toHaveValue('');
  });

  test('save state is truthful; saving persists; the live ATS score matches the stored row', async ({ page, apiAs }) => {
    const row = await seedResume(apiAs('a'), withHistory);
    await page.goto(`/build-resume/${row.id}/summary`);
    await expect(saveState(page)).toHaveText('Saved');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Edit Resume');
    // The step footer is shown from the `sm` breakpoint (640 px) up.
    if ((page.viewportSize()?.width ?? 0) >= 640) {
      await expect(page.getByTestId('builder-footer-save-state')).toHaveText('Saved');
    }

    const edited = `${row.summary} Mentors two junior testers.`;
    await summaryBox(page).fill(edited);
    await expect(saveState(page)).toHaveText('Unsaved changes');
    const saved = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/resumes/${row.id}`);
    await summaryBox(page).press('Control+s');
    expect((await saved).status()).toBe(200);
    await expect(saveState(page)).toHaveText('Saved', { timeout: 8000 });

    await page.reload();
    await expect(summaryBox(page)).toHaveValue(edited);
    await expect(saveState(page)).toHaveText('Saved');
    const stored = (await apiAs('a').get<{ resume: Row }>(`/resumes/${row.id}`)).body.resume;
    expect(stored.summary).toBe(edited);
    const expected = Math.round(calculateAtsScore(stored).qualityScore);
    await expect(page.getByTestId('builder-ats-score')).toContainText(`ATS: ${expected}/100`);
  });

  test('a new resume is "Not saved yet"; share and export ask for a save instead of using a placeholder id', async ({ page }) => {
    const exportRequests = recordRequests(page, '/api/export-docx');
    await page.goto('/build-resume?new=true');
    await expect(saveState(page)).toHaveText('Not saved yet');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('New Resume');

    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByTestId('builder-notice')).toContainText('Save the resume before sharing it.');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('menuitem', { name: /Download Word \(DOCX\)/ }).click();
    await expect(page.getByTestId('builder-notice')).toContainText('Save the resume before exporting it.');
    expect(exportRequests, 'no export request without a saved resume').toHaveLength(0);
    await expect(page.locator('body')).not.toContainText('res-alex-001');
  });

  test('DOCX export sends the session token and downloads the saved resume', async ({ page, apiAs, guard }) => {
    guard.expectApiStatuses(402);
    const row = await seedResume(apiAs('a'), withHistory);
    const exportRequests = recordRequests(page, '/api/export-docx');
    await page.goto(`/build-resume/${row.id}/summary`);
    await expect(saveState(page)).toHaveText('Saved');

    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/export-docx');
    const downloadPromise = page.waitForEvent('download').catch(() => null);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('menuitem', { name: /Download Word \(DOCX\)/ }).click();
    const response = await responsePromise;
    const request = exportRequests[0];
    expect(request.headers().authorization ?? '', 'the export must carry the session token').toMatch(/^Bearer \S+/);
    expect(request.postDataJSON()).toMatchObject({ resumeId: row.id });

    if (response.status() === 200) {
      const download = await downloadPromise;
      expect(download, 'a successful export downloads a file').not.toBeNull();
      const bytes = fs.readFileSync(await download!.path());
      expect(bytes.subarray(0, 2).toString('latin1'), 'DOCX files are ZIP containers').toBe('PK');
      await expect(page.getByTestId('builder-notice')).toContainText('Word file downloaded.');
    } else {
      expect(response.status()).toBe(402);
      await expect(page.getByTestId('builder-notice')).toContainText('The Word file could not be exported:');
    }
  });

  test('job description match compares real keywords; adding one is an explicit, unsaved edit', async ({ page, apiAs }) => {
    const row = await seedResume(apiAs('a'), { ...withHistory, skills: [{ id: 'general', category: 'Core Skills', skills: ['Playwright', 'TypeScript'] }] });
    await page.goto(`/build-resume/${row.id}/summary`);
    await expect(saveState(page)).toHaveText('Saved');
    // Store the builder's own serialization so the independent calculation below scores the same text.
    await saveWithShortcut(page, row.id);
    const stored = (await apiAs('a').get<{ resume: Row }>(`/resumes/${row.id}`)).body.resume;
    const jd = 'We are hiring a QA engineer with Playwright, TypeScript, Kubernetes and GraphQL experience. Docker is a plus.';
    const expected = calculateAtsScore(stored, { jobDescription: jd }).jdMatch;
    expect(expected.total, 'the job description must contain recognisable keywords').toBeGreaterThan(0);
    expect(expected.missing.length, 'the fixture needs at least one missing keyword').toBeGreaterThan(0);

    const panel = await openGuidance(page);
    await panel.getByRole('tab', { name: 'Match' }).click();
    await expect(panel.getByTestId('builder-jd-empty')).toBeVisible();
    await expect(panel.getByTestId('builder-jd-score')).toHaveCount(0);
    await expect(panel).not.toContainText('84%');

    await panel.getByRole('textbox', { name: 'Job description' }).fill(jd);
    await expect(panel.getByTestId('builder-jd-score')).toHaveText(`${expected.score}%`);
    await expect(panel.getByTestId('builder-jd-summary')).toContainText(`${expected.matched.length} of ${expected.total} keywords from the job description appear in this resume`);
    await expect(panel.getByRole('list', { name: 'Keywords found in this resume' }).getByRole('listitem')).toHaveText(expected.matched);
    const missingList = panel.getByRole('list', { name: 'Keywords not in this resume yet' });
    await expect(missingList.getByRole('listitem')).toHaveText(expected.missing);

    const saves = recordRequests(page, `/api/resumes/${row.id}`);
    const keyword = expected.missing[0];
    await missingList.getByRole('button', { name: `Add ${keyword} to skills` }).click();
    await expect(panel.getByRole('list', { name: 'Keywords found in this resume' })).toContainText(keyword);
    await expect(missingList.getByRole('button', { name: `Add ${keyword} to skills` })).toHaveCount(0);
    await expect(saveState(page)).toHaveText('Unsaved changes');
    expect(saves, 'adding a keyword never saves on its own').toHaveLength(0);
    const after = (await apiAs('a').get<{ resume: Row }>(`/resumes/${row.id}`)).body.resume;
    expect(JSON.stringify(after.skills)).not.toContain(keyword);
  });

  test('guidance panel: collapse, expand, hide and show work from the keyboard and keep focus; no fixed status badges', async ({ page, apiAs }) => {
    const row = await seedResume(apiAs('a'), withHistory);
    await page.goto(`/build-resume/${row.id}/summary`);
    const card = page.getByTestId('resume-builder-ai-assistant');
    await expect(card.getByRole('button', { name: 'Collapse resume guidance' })).toBeVisible();
    // The fixed status badges are gone ("Live ATS Checks" stays: those checks are recomputed on every edit).
    await expect(card.getByText('Live', { exact: true })).toHaveCount(0);
    await expect(card.getByText('Active', { exact: true })).toHaveCount(0);
    await expect(card).not.toContainText('AI Career Assistant');

    const collapse = card.getByRole('button', { name: 'Collapse resume guidance' });
    await collapse.focus();
    await page.keyboard.press('Enter');
    const expand = card.getByRole('button', { name: /^Resume guidance/ });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(expand).toBeFocused();
    await page.keyboard.press('Space');
    await expect(collapse).toBeFocused();
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');

    await card.getByRole('button', { name: 'Hide resume guidance' }).focus();
    await page.keyboard.press('Enter');
    const show = card.getByRole('button', { name: 'Show', exact: true });
    await expect(show).toBeFocused();
    await expect(card).toContainText('Resume guidance hidden');
    await page.keyboard.press('Enter');
    await expect(collapse).toBeFocused();
  });

  test('progress counts the 12 completable sections; no invented content or dead AI controls', async ({ page, apiAs }) => {
    const row = await seedResume(apiAs('a'), withHistory);
    await page.goto(`/build-resume/${row.id}/summary`);
    if (isCompact(page)) {
      await expect(page.getByRole('button', { name: /^View all sections, \d+\/12 complete$/ })).toBeVisible();
    } else {
      const progress = page.getByTestId('resume-builder-13-steps-trigger');
      await expect(progress).toContainText(/\d+ of 12/);
      const text = (await progress.textContent()) ?? '';
      const done = Number(/(\d+) of 12/.exec(text)![1]);
      expect(text).toContain(`${Math.round((done / 12) * 100)}%`);
    }
    await expect(page.getByRole('button', { name: 'Fill from profile' })).toBeVisible();
    await expect(page.getByText('Auto Fill with AI')).toHaveCount(0);

    await page.goto(`/build-resume/${row.id}/experience`);
    await expect(page.getByRole('heading', { name: /Work history|Work History|Experience/ }).first()).toBeVisible();
    await expect(page.getByText(/Metric Sample/)).toHaveCount(0);
    await expect(page.locator('#main-content')).not.toContainText('25% efficiency gain');

    await page.goto(`/build-resume/${row.id}/skills`);
    await expect(page.getByRole('heading', { name: 'Skills', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /AI Suggest/ })).toHaveCount(0);
  });

  test('skills: an earlier grouped row loads, saves in the shared flat shape, keeps its categories and reaches the Word export', async ({ page, apiAs }) => {
    // Rows saved by the builder before C6 hold { category, skills: [...] } groups.
    const row = await seedResume(apiAs('a'), {
      ...withHistory,
      skills: [
        { id: 'testing', category: 'Testing', skills: ['Playwright', 'Cypress'] },
        { id: 'languages', category: 'Languages', skills: ['TypeScript'] },
      ],
    });
    await page.goto(`/build-resume/${row.id}/skills`);
    const categories = page.getByRole('textbox', { name: 'Skill category name' });
    await expect(categories).toHaveCount(2);
    await expect(categories.nth(0)).toHaveValue('Testing');
    await expect(categories.nth(1)).toHaveValue('Languages');
    for (const skill of ['Playwright', 'Cypress', 'TypeScript']) await expect(page.getByRole('button', { name: `Remove ${skill}` })).toBeVisible();

    const saved = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/resumes/${row.id}`);
    await categories.nth(0).press('Control+s');
    expect((await saved).status()).toBe(200);
    await expect(saveState(page)).toHaveText('Saved', { timeout: 8000 });
    const stored = (await apiAs('a').get<{ resume: Row }>(`/resumes/${row.id}`)).body.resume;
    expect(storedSkills(stored), 'one { name, category } item per skill, the shape every reader expects').toEqual([
      { name: 'Playwright', category: 'Testing' },
      { name: 'Cypress', category: 'Testing' },
      { name: 'TypeScript', category: 'Languages' },
    ]);
    // The scorer now sees the skills (before C6 it counted a builder-saved resume as having none).
    expect(calculateAtsScore(stored).sections.find((section) => section.id === 'skills')?.score ?? 0).toBeGreaterThan(0);

    await page.reload();
    await expect(categories).toHaveCount(2);
    await expect(categories.nth(0)).toHaveValue('Testing');
    await expect(categories.nth(1)).toHaveValue('Languages');

    const text = await downloadDocxText(page);
    for (const skill of ['Playwright', 'Cypress', 'TypeScript']) expect(text, `the Word file lists ${skill}`).toContain(skill);
  });

  test('skills suggestion uses generate-content; unavailable response displays truthful notice without claiming all recommended skills are present', async ({ page, apiAs, guard }) => {
    guard.expectApiStatuses(502, 503);
    const row = await seedResume(apiAs('a'), withHistory);
    const aiRequests = recordRequests(page, '/api/generate-content');
    await page.goto(`/build-resume/${row.id}/skills`);
    await expect(page.getByRole('heading', { name: 'Skills', exact: true })).toBeVisible();
    await expect(saveState(page)).toHaveText('Saved');

    const pending = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/generate-content');
    await page.getByRole('button', { name: 'Suggest with AI' }).first().click();
    const response = await pending;

    expect(aiRequests.length).toBeGreaterThan(0);
    expect(aiRequests[0].postDataJSON()).toMatchObject({
      operation: 'generate-skills',
    });

    const body = (await response.json().catch(() => ({}))) as { aiUnavailable?: boolean; skills?: Array<{ name: string }> };
    const notice = page.getByTestId('skills-ai-notice');

    if (response.status() >= 500 || body.aiUnavailable) {
      test.info().annotations.push({
        type: 'environment',
        description: `No AI provider: HTTP ${response.status()}${body.aiUnavailable ? ', aiUnavailable=true' : ''}. Unavailable path exercised.`,
      });
      await expect(notice).toBeVisible();
      await expect(notice).not.toHaveText('You already have all recommended skills in your resume!');
    } else {
      expect(response.status()).toBe(200);
      if (body.skills && body.skills.length > 0) {
        await expect(page.getByText(/Recommended Skills for/)).toBeVisible();
      }
    }
  });

  test('entries without ids (older or imported rows) are edited and deleted one at a time; legacy field names load', async ({ page, apiAs }) => {
    const row = await seedResume(apiAs('a'), {
      ...withHistory,
      certifications: [{ name: 'ISTQB Foundation' }, { name: 'AWS Cloud Practitioner' }],
      languages: [{ name: 'English', level: 'C2' }],
    });
    await page.goto(`/build-resume/${row.id}/certifications`);
    const certNames = page.getByRole('textbox', { name: 'Certification Name' });
    await expect(certNames).toHaveCount(2);
    await certNames.nth(0).fill('ISTQB Advanced');
    await expect(certNames.nth(0)).toHaveValue('ISTQB Advanced');
    await expect(certNames.nth(1), 'editing one entry leaves the other unchanged').toHaveValue('AWS Cloud Practitioner');
    await page.getByRole('button', { name: 'Delete ISTQB Advanced' }).click();
    await expect(certNames).toHaveCount(1);
    await expect(certNames.nth(0), 'deleting one entry keeps the other').toHaveValue('AWS Cloud Practitioner');

    await page.goto(`/build-resume/${row.id}/languages`);
    await expect(page.getByRole('textbox', { name: 'Language' })).toHaveValue('English');
  });

  test('accessibility: every builder step has no axe WCAG 2.1 A/AA violations', async ({ page, apiAs }) => {
    test.setTimeout(120_000);
    const row = await seedResume(apiAs('a'), {
      ...withHistory,
      educations: [{ institution: 'Example University', degree: 'BSc' }],
      skills: [{ name: 'Playwright', category: 'Testing' }],
      projects: [{ name: 'Checkout suite', description: 'Browser tests' }],
      certifications: [{ name: 'ISTQB Foundation' }],
      languages: [{ name: 'English', level: 'C2' }],
    });
    for (const step of BUILDER_STEPS) {
      await page.goto(`/build-resume/${row.id}/${step}`);
      await expect(saveState(page), step).toHaveText('Saved');
      await test.step(step, () => expectNoAxeViolations(page));
    }
  });
});
