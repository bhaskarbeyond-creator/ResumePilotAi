import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readRenderToken, hasRenderToken, RENDER_TOKEN_PATTERN } from '../src/components/Exporter/exportAccess.js';
import { isPdfBuffer, readExportErrorMessage, toValidatedPdfBlob, pdfFileName } from '../src/utils/pdfDownload.js';

const validToken = 'a'.repeat(43);

test('render tokens are recognised only in their exact server-issued shape', () => {
  assert.equal(readRenderToken(`#renderToken=${validToken}`), validToken);
  assert.equal(readRenderToken(`renderToken=${validToken}`), validToken);
  assert.equal(hasRenderToken(`#renderToken=${validToken}`), true);
  assert.match(validToken, RENDER_TOKEN_PATTERN);

  // Malformed, truncated, oversized, injected and absent values must fall through to
  // the authenticated code path rather than being treated as authorization.
  for (const hash of ['', '#', '#renderToken=', '#renderToken=short', `#renderToken=${'a'.repeat(44)}`,
    '#renderToken=../../metadata', '#renderToken=has spaces', '#other=value', null, undefined, 42]) {
    assert.equal(readRenderToken(hash), null, String(hash));
    assert.equal(hasRenderToken(hash), false, String(hash));
  }
});

test('the export route guard admits headless renders with a token and blocks anonymous humans', async () => {
  const guard = await fs.readFile('src/components/Exporter/RequireExportAccess.jsx', 'utf8');
  // A token-bearing request is admitted (the headless renderer has no Firebase session).
  assert.match(guard, /hasRenderToken/);
  // Anonymous, token-less access is still redirected to login.
  assert.match(guard, /Navigate to="\/login" replace/);
  assert.match(guard, /tokenPresent \|\| user/);

  const main = await fs.readFile('src/main.jsx', 'utf8');
  // Both CV and cover export routes use the export guard.
  assert.match(main, /\/export\/Cv\$\{num\}\/:resumeId\/:language`\} element=\{<RequireExportAccess/);
  assert.match(main, /\/export\/Cover\$\{num\}\/:resumeId\/:language`\} element=\{<RequireExportAccess/);
  // Every other private route keeps the unchanged session guard.
  for (const route of ['/dashboard/*', '/dashboard2/*', '/portfolio/builder', '/adm/*', '/blog-editor']) {
    assert.match(main, new RegExp(route.replace(/[/*]/g, match => `\\${match}`) + '[^\n]+RequireAuthenticated'), route);
  }
});

test('the exporter validates the render token before trusting it as authorization', async () => {
  const exporter = await fs.readFile('src/components/Exporter/Exporter.jsx', 'utf8');
  assert.match(exporter, /readRenderToken\(window\.location\.hash\)/);
  // The raw, unvalidated URLSearchParams read must be gone.
  assert.doesNotMatch(exporter, /URLSearchParams\(window\.location\.hash/);
  // Failures must fail closed with an explicit export-error signal for the renderer.
  assert.match(exporter, /data-export-error/);
});

test('PDF magic-byte validation accepts real PDFs and rejects JSON error bodies', async () => {
  const encoder = new TextEncoder();
  const pdf = encoder.encode('%PDF-1.7\n...binary...').buffer;
  assert.equal(isPdfBuffer(pdf), true);

  for (const payload of ['{"error":"boom"}', '', '%PD', '<html>error</html>']) {
    assert.equal(isPdfBuffer(encoder.encode(payload).buffer), false, payload);
  }
  assert.equal(isPdfBuffer(null), false);

  // The server's reason is surfaced instead of a generic failure string.
  assert.match(readExportErrorMessage(encoder.encode('{"error":"Resume not found"}').buffer), /Resume not found/);
  assert.match(readExportErrorMessage(encoder.encode('{"error":{"message":"Subscription required"}}').buffer), /Subscription required/);
  assert.match(readExportErrorMessage(encoder.encode('not json').buffer), /did not return a valid PDF/);
});

test('a non-PDF export body throws instead of being saved as a corrupt resume.pdf', async () => {
  const good = await toValidatedPdfBlob(new Blob([new TextEncoder().encode('%PDF-1.7 body')]));
  assert.equal(good.type, 'application/pdf');

  await assert.rejects(
    () => toValidatedPdfBlob(new Blob([new TextEncoder().encode('{"error":"ACTIVE_SUBSCRIPTION_REQUIRED"}')])),
    error => {
      assert.equal(error.code, 'EXPORT_NOT_PDF');
      assert.match(error.message, /ACTIVE_SUBSCRIPTION_REQUIRED/);
      return true;
    });
});

test('download filenames are safe across Unicode, empty, and hostile inputs', () => {
  assert.equal(pdfFileName('Asha', 'Rao'), 'Asha_Rao.pdf');
  assert.equal(pdfFileName('', ''), 'resume.pdf');
  assert.equal(pdfFileName(null, undefined), 'resume.pdf');
  assert.equal(pdfFileName('రావు', 'తెలుగు'), 'రావు_తెలుగు.pdf');
  // Path traversal and separators can never survive into the filename.
  for (const name of [pdfFileName('../../etc', 'passwd'), pdfFileName('a/b', 'c\\d'), pdfFileName('a:b*c?', 'd"e<f>')]) {
    assert.doesNotMatch(name, /[/\\:*?"<>|]/);
    assert.match(name, /\.pdf$/);
  }
  assert.equal(pdfFileName('x'.repeat(300), 'y'.repeat(300)).length <= 84, true);
});

test('every PDF download surface validates the payload before saving it', async () => {
  const surfaces = [
    'src/components/BuildResume/BuildResume.jsx',
    'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx',
    'src/components/Boards/board-step-filling/BoardFilling.jsx',
    'src/components/PublicResume/PublicResume.jsx',
  ];
  for (const path of surfaces) {
    const source = await fs.readFile(path, 'utf8');
    assert.match(source, /toValidatedPdfBlob/, `${path} must validate the PDF payload`);
    // Saving the raw axios blob straight to disk is what produced corrupt downloads.
    assert.doesNotMatch(source, /download\(\s*response\.data/, `${path} must not save an unvalidated blob`);
  }
});

test('export failures are surfaced to the user rather than silently swallowed', async () => {
  const board = await fs.readFile('src/components/Boards/board-step-filling/BoardFilling.jsx', 'utf8');
  assert.match(board, /downloadError/);
  assert.match(board, /role="alert"/);

  const dashboard = await fs.readFile('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx', 'utf8');
  const failureIndex = dashboard.search(/trackEvent\s*\(\s*["']download_failed["']/);
  assert.equal(failureIndex > -1, true, 'download_failed tracking must exist');
  const failureBlock = dashboard.slice(failureIndex, failureIndex + 600);
  assert.match(failureBlock, /showToast/, 'a failed download must notify the user');
});

test('success analytics are only emitted after a genuine PDF has been delivered', async () => {
  for (const path of ['src/components/BuildResume/BuildResume.jsx', 'src/components/Boards/board-step-filling/BoardFilling.jsx']) {
    const source = await fs.readFile(path, 'utf8');
    const validated = source.indexOf('toValidatedPdfBlob');
    const tracked = source.indexOf("trackEvent('download_document'");
    assert.equal(validated > -1 && tracked > validated, true, `${path} must validate before tracking success`);
  }
});

test('print styles remove application chrome without altering screen rendering', async () => {
  const css = await fs.readFile('src/cv-templates/css/globalTemplateEnhancements.css', 'utf8');
  const printBlock = css.slice(css.indexOf('8. Browser Print'));
  assert.match(printBlock, /@media print/);
  // Chrome that must not appear on paper.
  for (const selector of ['.public-resume > .head', '.no-print', '[data-print="hide"]', 'nav', '.privacy-consent-banner']) {
    assert.ok(printBlock.includes(selector), `${selector} must be hidden when printing`);
  }
  // On-screen preview scaling must be neutralized so print uses true A4 geometry.
  assert.match(printBlock, /transform: none !important/);
  // Scroll containers must not clip multi-page resumes to a single page.
  assert.match(printBlock, /overflow: visible !important/);
  // Document content inside the resume board is preserved.
  assert.match(printBlock, /button:not\(\.export-document button\)/);
  assert.match(css, /@page\s*\{[^}]*size: A4 portrait/);
});
