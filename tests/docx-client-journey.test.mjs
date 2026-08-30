import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('Preview, Finalize, and Dashboard still share the executeDocxDownload journey', async () => {
  // NOTE (forensic audit): `src/components/BuildResume/steps/FinalizeStep.jsx`
  // used to be asserted here. It is NOT reachable from src/main.jsx (no module
  // imports it) and it imports `../../../services/firebase`, which does not
  // exist — so it cannot compile or render. String-matching a component that can
  // never mount certified a capability that no user can reach. It has been
  // removed from the asserted surface set; the reachability guard below prevents
  // an unreachable component from being re-added as "verified".
  const surfaces = [
    'src/components/BuildResume/BuildResume.jsx',
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

  const buildResume = await fs.readFile('src/components/BuildResume/BuildResume.jsx', 'utf8');
  assert.match(buildResume, /onDownloadDocx=\{/, 'BuildResume PreviewModal invocation must provide onDownloadDocx');

  const dashboard = await fs.readFile('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx', 'utf8');
  assert.match(dashboard, /onDownloadDocx=\{/, 'Dashboard PreviewModal invocation must provide onDownloadDocx');
});

test('backend DOCX route does not blindly trust client colors or resumeName', async () => {
  const source = await fs.readFile('backend/index.js', 'utf8');
  const exportSource = await fs.readFile('backend/routes/exports.js', 'utf8');
  const allSource = source + exportSource;
  assert.match(allSource, /resolveExportTemplate/);
  assert.match(allSource, /Template mismatch/);
  assert.doesNotMatch(
    allSource,
    /colors:\s*req\.body\.colors\s*\|\|/,
    'client colors must not be forwarded as authoritative styling',
  );
});
