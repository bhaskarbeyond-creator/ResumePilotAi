import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('Preview, Finalize, and Dashboard still share the executeDocxDownload journey', async () => {
  const surfaces = [
    'src/components/BuildResume/BuildResume.jsx',
    'src/components/BuildResume/steps/FinalizeStep.jsx',
    'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx',
    'src/utils/docxDownload.js',
  ];
  for (const file of surfaces) {
    const source = await fs.readFile(file, 'utf8');
    if (file.endsWith('docxDownload.js')) {
      assert.match(source, /\/api\/export-docx/, `${file} must post to /api/export-docx`);
      assert.match(source, /toValidatedDocxBlob/, `${file} must validate ZIP/OOXML magic bytes`);
      assert.match(source, /resumeName/, `${file} must still send the selected template name`);
      continue;
    }
    assert.match(source, /executeDocxDownload/, `${file} must use the shared DOCX helper`);
  }

  const preview = await fs.readFile('src/components/BuildResume/PreviewModal.jsx', 'utf8');
  assert.match(preview, /onDownloadDocx/, 'Preview modal must expose Download Word');
});

test('backend DOCX route does not blindly trust client colors or resumeName', async () => {
  const source = await fs.readFile('backend/index.js', 'utf8');
  assert.match(source, /resolveExportTemplate/);
  assert.match(source, /Template mismatch/);
  assert.doesNotMatch(
    source,
    /colors:\s*req\.body\.colors\s*\|\|/,
    'client colors must not be forwarded as authoritative styling',
  );
});
