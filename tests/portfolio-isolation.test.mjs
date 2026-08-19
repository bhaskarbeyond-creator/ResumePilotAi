import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const WEB_CV_FILES = [
  'src/utils/portfolioData.js',
  'src/components/PortfolioBuilder/WebCvStudio.jsx',
  'src/components/PortfolioBuilder/CreateWebCvDialog.jsx',
  'src/components/PortfolioTemplates/WebCvRenderer.jsx',
  'src/components/PublicPortfolio/PublicPortfolio.jsx',
];

test('web cv adapter and studio never write resume documents', async () => {
  for (const file of WEB_CV_FILES) {
    const source = await fs.readFile(file, 'utf8');
    assert.doesNotMatch(source, /saveResumeDraft|publishResume|createResumeDraft|deleteResumeDraft/);
    assert.doesNotMatch(source, /collection\('resumes'\).*set\(/);
  }
});

test('certified resume pipeline is not imported by the web cv renderer', async () => {
  const renderer = await fs.readFile('src/components/PortfolioTemplates/WebCvRenderer.jsx', 'utf8');
  assert.doesNotMatch(renderer, /SmartResumeComposer|SmartPartitioner|cv-templates\/cv/);
  const adapter = await fs.readFile('src/utils/portfolioData.js', 'utf8');
  assert.match(adapter, /normalizeResumeData/);
  assert.match(adapter, /convertResumeToPortfolio/);
});
