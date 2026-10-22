import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('real browser PDF/DOCX extraction stays local and corrupt binaries fail closed', async ({ page }) => {
  await page.goto('/login');
  for (const extension of ['pdf', 'docx']) {
    const bytes = [...readFileSync(`frontend/tests/fixtures/synthetic-resume.${extension}`)];
    const text = await page.evaluate(async ({ bytes, extension }) => {
      const modulePath = '/src/lib/ai-content.ts';
      const { extractFileText } = await import(modulePath);
      return extractFileText(new File([new Uint8Array(bytes)], `synthetic.${extension}`));
    }, { bytes, extension });
    expect(text).toContain('Python developer');
    expect(text).not.toContain('%PDF');
  }
  for (const fixture of ['entity-resume.docx', 'oversized-resume.docx']) {
    const bytes = [...readFileSync(`frontend/tests/fixtures/${fixture}`)];
    const rejected = await page.evaluate(async bytes => {
      const modulePath = '/src/lib/ai-content.ts';
      const { extractFileText } = await import(modulePath);
      try { await extractFileText(new File([new Uint8Array(bytes)], 'unsafe.docx')); return false; }
      catch { return true; }
    }, bytes);
    expect(rejected).toBe(true);
  }
  for (const extension of ['pdf', 'docx', 'doc']) {
    const message = await page.evaluate(async extension => {
      const modulePath = '/src/lib/ai-content.ts';
      const { extractFileText } = await import(modulePath);
      try { await extractFileText(new File(['corrupt binary'], `bad.${extension}`)); return 'UNSAFE_FALLBACK'; }
      catch (error) { return error instanceof Error ? error.message : 'rejected'; }
    }, extension);
    expect(message).not.toBe('UNSAFE_FALLBACK');
  }
});
