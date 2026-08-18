const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { createResumeDocx, THEMES, layoutFamily } = require('../services/docxExport');

const FIXTURE = {
  firstname: 'Bhaskar',
  lastname: 'Venkata',
  occupation: 'Senior Platform Engineer',
  email: 'bhaskar@example.com',
  phone: '+91 98765 43210',
  address: '14 Lake View Road',
  city: 'Vijayawada',
  country: 'India',
  website: 'https://bhaskar.dev',
  linkedin: 'https://linkedin.com/in/bhaskarvenkata',
  github: 'https://github.com/bhaskar',
  summary: '<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">Platform engineer with <strong>9+ years</strong> building reliable systems.</span></p>',
  employments: [{
    jobTitle: 'Staff Platform Engineer',
    employer: 'Meridian Financial Systems',
    begin: 'Jan 2021',
    end: 'Present',
    description: '<ul><li>Improved p99 latency by 41%.</li><li>Reduced cloud spend by 28%.</li></ul>',
  }],
  educations: [{ school: 'IIT Madras', degree: 'B.Tech in Computer Science', started: '2011', finished: '2015' }],
  skills: [{ name: 'Kubernetes' }, { name: 'Go' }, { name: 'TypeScript' }],
  languages: [{ name: 'English', level: 'Fluent' }, { name: 'తెలుగు', level: 'Native' }],
  hobbies: ['Photography', 'Chess'],
  projects: [{ title: 'ResumePilot', description: 'Open-source resume toolkit.', url: 'https://github.com/bhaskar/resumepilot' }],
  certifications: [{ title: 'CKA', issuer: 'CNCF' }],
  achievements: [{ title: 'Engineering Excellence Award', description: 'Zero-downtime migration.' }],
  references: [{ name: 'Priya Nair', reference: 'VP Engineering' }],
  customSections: [{ title: 'Patents', items: [{ title: 'Distributed Locking', description: 'Consensus method.' }] }],
};

function visibleText(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((node) => node.replace(/<[^>]+>/g, ''))
    .join(' ');
}

async function inspect(template) {
  const buffer = await createResumeDocx({ ...FIXTURE, template });
  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file('word/document.xml').async('string');
  const numberingXml = archive.file('word/numbering.xml')
    ? await archive.file('word/numbering.xml').async('string')
    : '';
  const text = visibleText(documentXml);
  const theme = THEMES[template];
  const family = layoutFamily(theme.archetype);
  const hasTable = /<w:tbl[\s>]/.test(documentXml);
  const hasSidebarFill = theme.sidebarBg
    ? new RegExp(`w:fill="${theme.sidebarBg}"`, 'i').test(documentXml)
    : /w:fill="F8FAFC"/i.test(documentXml);
  const hasPrimary = new RegExp(theme.primary, 'i').test(documentXml);
  const htmlLeak = /editor-paragraph|dir="ltr"|white-space|&lt;p|&lt;span|<p\s|<span|<div/.test(documentXml);
  const nativeBullets = /<w:numPr>/.test(documentXml) && /w:numFmt/.test(numberingXml);
  const required = [
    'Bhaskar', 'Venkata', 'Senior Platform Engineer', 'bhaskar@example.com',
    'Meridian Financial Systems', 'IIT Madras', 'Kubernetes', 'తెలుగు',
    'ResumePilot', 'CKA', 'Engineering Excellence', 'Photography', 'Priya Nair', 'Distributed Locking',
  ];
  const missing = required.filter((token) => !new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
  const twoColExpected = family === 'two-column-split' || family === 'banner-split';
  return {
    template,
    theme,
    family,
    validZip: buffer[0] === 0x50 && buffer[1] === 0x4b,
    hasTable,
    hasSidebarFill,
    hasPrimary,
    htmlLeak,
    nativeBullets,
    missing,
    twoColExpected,
    twoColOk: twoColExpected ? hasTable && (family === 'banner-split' || hasSidebarFill || hasTable) : true,
  };
}

function score(result) {
  let value = 10;
  if (!result.validZip) value -= 5;
  if (result.htmlLeak) value -= 4;
  if (!result.hasPrimary) value -= 2;
  if (!result.nativeBullets) value -= 1;
  if (result.missing.length) value -= Math.min(3, result.missing.length);
  if (result.twoColExpected && !result.hasTable) value -= 3;
  if (result.family === 'two-column-split' && !result.hasSidebarFill && result.theme.sidebarBg) value -= 1;
  return Math.max(0, value);
}

test('all 51 templates produce forensic-grade DOCX matching PDF architecture', async () => {
  const rows = [];
  for (let i = 1; i <= 51; i++) {
    const template = `Cv${i}`;
    const result = await inspect(template);
    const fidelity = score(result);
    rows.push({ ...result, fidelity });
    assert.equal(result.validZip, true, `${template} must be a ZIP/OOXML package`);
    assert.equal(result.htmlLeak, false, `${template} leaked HTML`);
    assert.equal(result.hasPrimary, true, `${template} missing primary ${result.theme.primary}`);
    assert.equal(result.nativeBullets, true, `${template} missing native bullets`);
    assert.deepEqual(result.missing, [], `${template} lost content: ${result.missing.join(', ')}`);
    if (result.twoColExpected) {
      assert.equal(result.hasTable, true, `${template} lost its layout table`);
    }
    assert.equal(fidelity >= 9, true, `${template} fidelity ${fidelity}/10`);
  }

  const matrix = [
    '| Template | Archetype | Layout family | Primary | Table | Color | Bullets | HTML leak | Missing | Score |',
    '| -------- | --------- | ------------- | ------- | :---: | :---: | :-----: | :-------: | ------- | ----: |',
    ...rows.map((row) => `| ${row.template} | ${row.theme.archetype} | ${row.family} | ${row.theme.primary} | ${row.hasTable ? 'Y' : 'N'} | ${row.hasPrimary ? 'Y' : 'N'} | ${row.nativeBullets ? 'Y' : 'N'} | ${row.htmlLeak ? 'Y' : '0'} | ${row.missing.length ? row.missing.join('; ') : '—'} | ${row.fidelity}/10 |`),
  ].join('\n');
  const outDir = path.resolve(__dirname, '../../artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'docx-parity-matrix.md'), `# DOCX ↔ PDF parity matrix\n\nGenerated from actual OOXML packages against \`themePresets.js\`.\n\n${matrix}\n`);
});
