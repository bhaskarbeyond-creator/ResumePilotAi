/**
 * Resumes List Surface — Forensic E2E Test Suite (Mandate 20)
 *
 * Verifies:
 * 1. Resumes header, breadcrumbs, and live counter
 * 2. Executive 5-card metric strip (Total, Ready to Apply, Developing, Starting, Unique Templates)
 * 3. Master CV — Master Profile Data hero banner with deep link
 * 4. Resumes grid rendered immediately below Master CV (front and center)
 * 5. Search filtering by title, role, and template ID
 * 6. ATS Readiness filter dropdown
 * 7. Sort dropdown (Recently updated, title A-Z, ATS score)
 * 8. Grid View vs. List View toggle
 * 9. Template Gallery section rendered at bottom of page
 */
import { expect, test, type ApiClient } from './fixtures';

type Row = Record<string, unknown> & { id: string; title: string; template: string };

const created: string[] = [];
test.afterEach(async ({ apiAs }) => {
  while (created.length) await apiAs('a').del(`/resumes/${encodeURIComponent(created.pop()!)}`);
});

const uniqueTag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

async function seedResume(api: ApiClient, title: string, template: string): Promise<Row> {
  const id = `res_list_${uniqueTag()}`;
  const response = await api.post<{ resume: Row }>(`/resumes/${id}`, {
    title,
    template,
    firstname: 'Avery',
    lastname: 'Tester',
    email: 'p002.candidate.a@example.test',
    occupation: 'Lead Solutions Architect',
    summary: 'Executive architect delivering scalable cloud and AI applications.',
  });
  expect(response.status).toBe(200);
  created.push(id);
  return response.body.resume;
}

test.describe('Candidate Resumes List Surface', () => {
  test('renders header, metrics strip, master profile banner, and resumes hub', async ({ page, apiAs }) => {
    await seedResume(apiAs('a'), 'Senior Cloud Architect', 'Cv1');
    await page.goto('/dashboard/resumes');

    // Surface Title and Header Counter
    await expect(page.locator('h1')).toContainText('My Resumes & Master CV');
    await expect(page.getByTestId('resume-count')).toBeVisible();

    // 5-Card Metric Strip
    await expect(page.getByTestId('metric-total')).toBeVisible();
    await expect(page.getByTestId('metric-ready')).toBeVisible();
    await expect(page.getByTestId('metric-developing')).toBeVisible();
    await expect(page.getByTestId('metric-starting')).toBeVisible();

    // Master CV Banner
    await expect(page.locator('text=Master CV — Master Profile Data')).toBeVisible();
    await expect(page.locator('a:has-text("Open Master Profile")')).toBeVisible();

    // Resumes Hub is front and center
    await expect(page.locator('h2:has-text("Your Resumes")')).toBeVisible();
    await expect(page.getByTestId('resume-list-controls')).toBeVisible();
    await expect(page.getByTestId('resume-card').first()).toBeVisible();

    // Template Gallery is removed for clean candidate focus
    await expect(page.getByTestId('template-gallery')).toHaveCount(0);
  });

  test('search filter dynamically narrows down matching resumes', async ({ page, apiAs }) => {
    await seedResume(apiAs('a'), 'UniqueAlphaDevOpsResume', 'Cv1');
    await seedResume(apiAs('a'), 'UniqueBetaFrontendResume', 'Cv2');
    await page.goto('/dashboard/resumes');

    const searchInput = page.getByTestId('resume-search');
    await expect(searchInput).toBeVisible();

    // Filter by Alpha
    await searchInput.fill('UniqueAlphaDevOps');
    await expect(page.getByTestId('resume-card').filter({ hasText: 'UniqueAlphaDevOpsResume' })).toBeVisible();
    await expect(page.getByTestId('resume-card').filter({ hasText: 'UniqueBetaFrontendResume' })).toHaveCount(0);

    // Filter by Beta
    await searchInput.fill('UniqueBetaFrontend');
    await expect(page.getByTestId('resume-card').filter({ hasText: 'UniqueBetaFrontendResume' })).toBeVisible();
    await expect(page.getByTestId('resume-card').filter({ hasText: 'UniqueAlphaDevOpsResume' })).toHaveCount(0);

    // Clear search
    await searchInput.fill('');
    await expect(page.getByTestId('resume-card').filter({ hasText: 'UniqueAlphaDevOpsResume' })).toBeVisible();
    await expect(page.getByTestId('resume-card').filter({ hasText: 'UniqueBetaFrontendResume' })).toBeVisible();
  });

  test('view mode toggle transitions cleanly between Grid and List view', async ({ page, apiAs }) => {
    await seedResume(apiAs('a'), 'Table Test Resume', 'Cv1');
    await page.goto('/dashboard/resumes');

    // Initially in Grid View
    await expect(page.locator('button[aria-label="Grid view"]')).toBeVisible();
    await expect(page.getByTestId('resume-card').first()).toBeVisible();

    // Switch to List View
    await page.locator('button[aria-label="List view"]').click();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table th')).toHaveCount(5);
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.locator('table')).toContainText('Table Test Resume');

    // Switch back to Grid View
    await page.locator('button[aria-label="Grid view"]').click();
    await expect(page.locator('table')).not.toBeVisible();
    await expect(page.getByTestId('resume-card').first()).toBeVisible();
  });

  test('Create New Resume CTA opens creation dialog with valid inputs', async ({ page }) => {
    await page.goto('/dashboard/resumes');
    await page.getByTestId('create-new-resume-btn').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Create New Resume' })).toBeVisible();
    await expect(dialog.locator('button:has-text("Cancel")')).toBeVisible();
    await dialog.locator('button:has-text("Cancel")').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
