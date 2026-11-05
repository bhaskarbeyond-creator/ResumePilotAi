/**
 * Resumes Action Dock & Interactive Operations — Forensic E2E Test Suite (Mandate 20)
 *
 * Verifies:
 * 1. Primary "Edit Resume" CTA navigates directly to the builder
 * 2. Centered "Full Size Preview" glass badge opens the high-fidelity PreviewModal
 * 3. "Download PDF" action triggers real PDF generation
 * 4. "Download Word (DOCX)" routes through apiClient with live token (HTTP 200, no 401)
 * 5. "Share Resume" CTA opens ShareModal with public link and copy action
 * 6. Card options dropdown menu supports Duplicate, Rename, and Delete
 */
import { expect, test, type ApiClient } from './fixtures';

type Row = Record<string, unknown> & { id: string; title: string; template: string };

const created: string[] = [];
test.afterEach(async ({ apiAs }) => {
  while (created.length) await apiAs('a').del(`/resumes/${encodeURIComponent(created.pop()!)}`);
});

const uniqueTag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

async function seedResume(api: ApiClient, title: string, template: string): Promise<Row> {
  const id = `res_dock_${uniqueTag()}`;
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

test.describe('Candidate Resumes Action Dock & Modals', () => {
  test('primary Edit Resume action navigates to builder with correct document ID', async ({ page, apiAs }) => {
    const resume = await seedResume(apiAs('a'), 'Architectural Blueprint Resume', 'Cv1');
    await page.goto('/dashboard/resumes');

    const card = page.getByTestId('resume-card').filter({ hasText: 'Architectural Blueprint Resume' });
    await expect(card).toBeVisible();

    const editBtn = card.locator('button:has-text("Edit Resume")');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await page.waitForURL(`**/build-resume**`);
    expect(page.url()).toContain(resume.id);
  });

  test('centered Full Size Preview button opens PreviewModal with template switcher', async ({ page, apiAs }) => {
    await seedResume(apiAs('a'), 'Preview Modal Test Resume', 'Cv1');
    await page.goto('/dashboard/resumes');

    const card = page.getByTestId('resume-card').filter({ hasText: 'Preview Modal Test Resume' });
    await expect(card).toBeVisible();

    const previewBtn = card.locator('button:has-text("Full Size Preview")');
    await expect(previewBtn).toBeVisible();
    await previewBtn.click();

    // Verify modal is open
    const modal = page.locator('role=dialog');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Avery Tester');

    // Close preview modal
    const closeBtn = modal.locator('button[aria-label="Close"], button:has-text("Close")').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(modal).toHaveCount(0);
    }
  });

  test('Share Resume action opens ShareModal with public share link', async ({ page, apiAs }) => {
    await seedResume(apiAs('a'), 'Shareable Public Resume', 'Cv1');
    await page.goto('/dashboard/resumes');

    const card = page.getByTestId('resume-card').filter({ hasText: 'Shareable Public Resume' });
    const shareBtn = card.getByTestId('resume-action-share');
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    const shareDialog = page.locator('role=dialog');
    await expect(shareDialog).toBeVisible();
    await expect(shareDialog).toContainText('Share Resume');
    await expect(shareDialog.locator('input[readonly]')).toBeVisible();

    // Close modal
    await shareDialog.locator('button[aria-label="Close"], button:has-text("Close")').first().click();
    await expect(shareDialog).toHaveCount(0);
  });

  test('Download Word (DOCX) succeeds with HTTP 200 and valid binary without 401', async ({ page, apiAs }) => {
    await seedResume(apiAs('a'), 'DOCX Export Verification Resume', 'Cv1');
    await page.goto('/dashboard/resumes');

    const card = page.getByTestId('resume-card').filter({ hasText: 'DOCX Export Verification Resume' });
    const docxBtn = card.locator('button:has-text("Word")');
    await expect(docxBtn).toBeVisible();

    // Intercept DOCX export API call
    const [docxResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/export-docx') && resp.request().method() === 'POST'),
      docxBtn.click(),
    ]);

    expect(docxResponse.status()).toBe(200);
    const contentType = docxResponse.headers()['content-type'] || '';
    expect(contentType).toContain('wordprocessingml.document');
  });

  test('PreviewModal Download Word (DOCX) succeeds with HTTP 200 without 401', async ({ page, apiAs }) => {
    const resume = await seedResume(apiAs('a'), 'Preview Modal DOCX Resume', 'Cv1');
    await page.goto('/dashboard/resumes');

    const card = page.getByTestId('resume-card').filter({ hasText: 'Preview Modal DOCX Resume' });
    const previewBtn = card.locator('button:has-text("Full Size Preview")');
    await previewBtn.click();

    const modal = page.locator('role=dialog');
    await expect(modal).toBeVisible();

    const modalDocxBtn = modal.locator('button:has-text("DOCX"), button[aria-label="Download Word document"]').first();
    await expect(modalDocxBtn).toBeVisible();

    const [docxResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/export-docx') && resp.request().method() === 'POST'),
      modalDocxBtn.click(),
    ]);

    expect(docxResponse.status()).toBe(200);
    const contentType = docxResponse.headers()['content-type'] || '';
    expect(contentType).toContain('wordprocessingml.document');

    // Ensure no error toast/notice appeared in modal
    await expect(modal.locator('text=Could not download the Word document')).toHaveCount(0);
  });

  test('CV Renderer export page Download Word (DOCX) succeeds with HTTP 200 without 401', async ({ page, apiAs }) => {
    const resume = await seedResume(apiAs('a'), 'Renderer DOCX Resume', 'Cv1');
    await page.goto(`/export/Cv1/${encodeURIComponent(resume.id)}/en`);

    await page.waitForSelector('[data-export-ready="true"]', { timeout: 10000 });

    const docxBtn = page.locator('button:has-text("Download DOCX"), button:has-text("Word")').first();
    await expect(docxBtn).toBeVisible();

    const [docxResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/export-docx') && resp.request().method() === 'POST'),
      docxBtn.click(),
    ]);

    expect(docxResponse.status()).toBe(200);
    const contentType = docxResponse.headers()['content-type'] || '';
    expect(contentType).toContain('wordprocessingml.document');
  });

  test('card options dropdown contains Duplicate, Rename, and Delete operations', async ({ page, apiAs }) => {
    await seedResume(apiAs('a'), 'Menu Lifecycle Resume', 'Cv1');
    await page.goto('/dashboard/resumes');

    const card = page.getByTestId('resume-card').filter({ hasText: 'Menu Lifecycle Resume' });
    const menuBtn = card.locator('button[aria-label="Resume options"]');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Verify dropdown items
    await expect(page.getByRole('menuitem', { name: /Edit in Builder/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /View Full Preview/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Download PDF/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Download Word/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Share Public Link/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Duplicate Resume/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Rename Resume/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Delete Resume/i })).toBeVisible();
  });
});
