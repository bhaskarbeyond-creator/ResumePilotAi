const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const {
  createResumeDocx,
  THEMES,
  getTemplateStyle,
  parseRichTextToParagraphs,
  stripAllHtmlTags,
  resolveExportTemplate,
  layoutFamily,
  ARCHETYPES,
} = require('../services/docxExport');

const RICH_SAMPLE = {
  firstname: 'Bhaskar Babu',
  lastname: 'Madala',
  occupation: 'Lead Architect',
  email: 'bhaskar@example.com',
  phone: '+91 85550 35068',
  city: 'Hyderabad',
  country: 'India',
  website: 'https://bhaskar.dev',
  linkedin: 'https://linkedin.com/in/bhaskar',
  github: 'https://github.com/bhaskar',
  summary: '<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">Frontend Developer with <strong>9+ years</strong> of experience in <em>JavaScript</em> and <u>React</u>.</span></p>',
  employments: [{
    jobTitle: 'Lead Architect',
    employer: 'Beyond Technologies',
    begin: '2021',
    end: 'Present',
    currentWork: true,
    description: '<ul><li class="list-item">Architected microservices in Go</li><li>Reduced API latency by 40%</li></ul>',
  }],
  educations: [{ degree: 'B.Tech', school: 'Example University', started: '2011', finished: '2015' }],
  skills: [{ name: 'JavaScript' }, { name: 'React' }, { name: 'Node.js' }],
  languages: [{ name: 'Telugu', level: 'Native' }, { name: 'English', level: 'Fluent' }],
  projects: [{ title: 'ResumePilot', description: 'Career platform.', url: 'https://github.com/bhaskar/resumepilot' }],
  certifications: [{ name: 'AWS Certified', issuer: 'Amazon' }, { title: 'CKA', issuer: 'CNCF' }],
  achievements: [{ title: 'Engineering Excellence', description: 'Zero-downtime migration.' }],
  hobbies: ['Photography', 'Chess'],
  references: [{ name: 'Priya Nair', reference: 'VP Engineering' }],
  customSections: [{ title: 'Patents', items: [{ title: 'Distributed Locking', description: 'Method for consensus.' }] }],
};

async function loadDoc(buffer) {
  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file('word/document.xml').async('string');
  const numberingXml = archive.file('word/numbering.xml')
    ? await archive.file('word/numbering.xml').async('string')
    : '';
  const stylesXml = archive.file('word/styles.xml')
    ? await archive.file('word/styles.xml').async('string')
    : '';
  return { archive, documentXml, numberingXml, stylesXml };
}

function visibleText(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((node) => node.replace(/<[^>]+>/g, ''))
    .join(' ');
}

test('DOCX export is a valid Word package containing meaningful resume sections', async () => {
  const buffer = await createResumeDocx({
    firstname: 'Asha', lastname: 'Rao', email: 'asha@example.com', phone: '+91 99999 99999',
    summary: 'Product engineer building reliable systems.',
    employments: [{ jobTitle: 'Engineer', employer: 'Example Co', description: 'Built accessible products.' }],
    educations: [{ degree: 'B.Tech', school: 'Example University' }],
    skills: [{ name: 'JavaScript' }, { name: 'Accessibility' }],
    projects: [{ title: 'ResumePilot', description: 'Career platform.' }],
    languages: [{ name: 'English', level: 'Native' }],
    certifications: [{ name: 'AWS Certified', issuer: 'Amazon' }],
    customSections: [{ title: 'Patents', items: [{ title: 'Distributed Locking', description: 'Method for consensus.' }] }],
  });
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  const { archive, documentXml } = await loadDoc(buffer);
  assert.ok(archive.file('[Content_Types].xml'));
  for (const expected of ['Asha Rao', 'Professional Summary', 'Example Co', 'Education', 'Skills', 'JavaScript', 'Projects', 'Patents']) {
    assert.match(documentXml, new RegExp(expected, 'i'));
  }
});

test('DOCX export strictly sanitizes raw editor HTML and prevents markup leakage', async () => {
  const buffer = await createResumeDocx({
    ...RICH_SAMPLE,
    template: 'Cv1',
  });
  const { documentXml } = await loadDoc(buffer);
  assert.match(documentXml, /Frontend Developer with/);
  assert.match(documentXml, /9\+ years/);
  assert.match(documentXml, /Architected microservices in Go/);
  assert.match(documentXml, /Reduced API latency by 40%/);
  assert.doesNotMatch(documentXml, /editor-paragraph/);
  assert.doesNotMatch(documentXml, /dir="ltr"/);
  assert.doesNotMatch(documentXml, /white-space/);
  assert.doesNotMatch(documentXml, /<p\s/);
  assert.doesNotMatch(documentXml, /<span/);
  assert.doesNotMatch(documentXml, /<div/);
  assert.doesNotMatch(documentXml, /&lt;p/);
  assert.doesNotMatch(documentXml, /&lt;span/);
  assert.doesNotMatch(visibleText(documentXml), /class=/);
});

test('rich text becomes native Word formatting rather than stripped plaintext only', async () => {
  const buffer = await createResumeDocx({ template: 'Cv4', summary: '<p>A <strong>bold</strong> and <em>italic</em> and <u>under</u> <a href="https://example.com">link</a>.</p>' });
  const { archive, documentXml } = await loadDoc(buffer);
  const rels = await archive.file('word/_rels/document.xml.rels').async('string');
  assert.match(documentXml, /<w:b\b/);
  assert.match(documentXml, /<w:i\b/);
  assert.match(documentXml, /<w:u\b/);
  assert.match(documentXml, /<w:hyperlink\b/);
  assert.match(rels, /https:\/\/example\.com/);
  assert.match(visibleText(documentXml), /bold/);
  assert.match(visibleText(documentXml), /italic/);
  assert.match(visibleText(documentXml), /link/);
});

test('DOCX export renders authentic 2-column layout tables (<w:tbl>) for 2-column templates', async () => {
  const bufferCv1 = await createResumeDocx({ ...RICH_SAMPLE, template: 'Cv1' });
  const { documentXml: xmlCv1 } = await loadDoc(bufferCv1);
  assert.match(xmlCv1, /<w:tbl[\s>]/, 'Cv1 must contain a 2-column <w:tbl> layout');
  assert.match(xmlCv1, /<w:tc[\s>]/, 'Cv1 table must contain cells');
  assert.match(xmlCv1, /w:fill="F8FAFC"/i, 'Cv1 sidebar background must be present');
  assert.match(xmlCv1, /Skills/i);
  assert.match(xmlCv1, /React/i);
  assert.match(xmlCv1, /Languages/i);
  assert.match(xmlCv1, /Telugu/i);
  assert.match(xmlCv1, /Professional Summary/i);
  assert.match(xmlCv1, /Employment History/i);
});

test('DOCX export applies authentic template color identity from the PDF theme preset for Cv1', async () => {
  const styleCv1 = getTemplateStyle('Cv1');
  assert.equal(styleCv1.primary, '1E3A8A', 'Cv1 primary color must match PDF Metropolitan Navy 1E3A8A');
  assert.equal(styleCv1.name, 'Metropolitan Navy');
  assert.equal(styleCv1.archetype, 'modern-split');

  const buffer = await createResumeDocx({ firstname: 'Bhaskar', lastname: 'Madala', template: 'Cv1', summary: 'Summary text' });
  const { documentXml } = await loadDoc(buffer);
  assert.match(documentXml, /1E3A8A/i, 'Cv1 document XML must apply 1E3A8A to visible runs');
  assert.doesNotMatch(documentXml, /EA580C/i, 'Cv1 must not use the junior-invented orange');
});

test('client-supplied colors cannot override the authoritative theme palette', async () => {
  const buffer = await createResumeDocx({
    firstname: 'Bhaskar',
    lastname: 'Madala',
    template: 'Cv1',
    summary: 'Summary text',
    colors: { primary: 'FF00FF', secondary: '00FF00', sidebarBg: '000000' },
  });
  const { documentXml } = await loadDoc(buffer);
  assert.match(documentXml, /1E3A8A/i);
  assert.doesNotMatch(documentXml, /FF00FF/i);
  assert.doesNotMatch(documentXml, /00FF00/i);
});

test('DOCX export successfully generates valid OOXML packages for all 51 templates', async () => {
  for (let i = 1; i <= 51; i++) {
    const templateName = `Cv${i}`;
    const buffer = await createResumeDocx({
      firstname: 'Candidate',
      lastname: String(i),
      template: templateName,
      summary: `Template ${templateName} summary`,
      employments: [{ jobTitle: 'Developer', employer: 'Corp', description: '• Work 1\n• Work 2' }],
      skills: [{ name: 'Skill A' }, { name: 'Skill B' }],
      languages: [{ name: 'English', level: 'Fluent' }],
    });
    assert.equal(buffer[0], 0x50, `${templateName} must start with PK zip header`);
    assert.equal(buffer[1], 0x4b, `${templateName} must start with PK zip header`);
    const { archive, documentXml } = await loadDoc(buffer);
    assert.ok(archive.file('word/document.xml'), `${templateName} must contain document.xml`);
    const style = getTemplateStyle(templateName);
    if (['modern-split', 'executive-banner', 'compact-euro', 'tech-grid'].includes(style.archetype)) {
      assert.match(documentXml, /<w:tbl[\s>]/, `${templateName} (${style.archetype} archetype) must contain <w:tbl>`);
    }
    assert.match(documentXml, new RegExp(style.primary, 'i'), `${templateName} must apply primary ${style.primary}`);
  }
});

test('DOCX export correctly renders Unicode scripts (Telugu, Devanagari, European accents)', async () => {
  const buffer = await createResumeDocx({
    firstname: 'భాస్కర్',
    lastname: 'రావు',
    summary: 'वरिष्ठ सॉफ्टवेयर वास्तुकार',
    employments: [{ jobTitle: 'Lead Architect', employer: 'José María Núñez Enterprise', description: '• నిర్మించిన వ్యవస్థలు' }],
  });
  const { documentXml } = await loadDoc(buffer);
  assert.match(documentXml, /భాస్కర్/);
  assert.match(documentXml, /రావు/);
  assert.match(documentXml, /वरिष्ठ सॉफ्टवेयर वास्तुकार/);
  assert.match(documentXml, /José María Núñez/);
  assert.match(documentXml, /నిర్మించిన వ్యవస్థలు/);
});

test('DOCX export renders distinct layout structures for all 5 archetypes', async () => {
  const sampleData = {
    firstname: 'Alex',
    lastname: 'Morgan',
    occupation: 'Lead Engineer',
    summary: 'Experienced developer building resilient systems.',
    skills: [{ name: 'React' }, { name: 'Node.js' }, { name: 'Go' }],
    employments: [{ jobTitle: 'Architect', employer: 'Tech Corp', startDate: '2020', endDate: 'Present', description: '• Led teams' }],
    educations: [{ degree: 'B.S. CS', school: 'MIT', startDate: '2016', endDate: '2020' }],
  };

  const bufCv1 = await createResumeDocx({ ...sampleData, template: 'Cv1' });
  const xmlCv1 = (await loadDoc(bufCv1)).documentXml;
  assert.match(xmlCv1, /<w:tbl[\s>]/);
  assert.match(xmlCv1, /1E3A8A/i);
  assert.match(xmlCv1, /w:fill="F8FAFC"/i);

  const bufCv8 = await createResumeDocx({ ...sampleData, template: 'Cv8' });
  const xmlCv8 = (await loadDoc(bufCv8)).documentXml;
  assert.match(xmlCv8, /<w:shd w:fill="1E293B"\/>/i);

  const bufCv4 = await createResumeDocx({ ...sampleData, template: 'Cv4' });
  const xmlCv4 = (await loadDoc(bufCv4)).documentXml;
  assert.match(xmlCv4, /Alex Morgan/);
  assert.match(xmlCv4, /Georgia|Merriweather/i);
  assert.doesNotMatch(xmlCv4, /w:fill="F8FAFC"/i, 'ATS templates must not grow a sidebar fill');

  const bufCv25 = await createResumeDocx({ ...sampleData, template: 'Cv25' });
  const xmlCv25 = (await loadDoc(bufCv25)).documentXml;
  assert.match(xmlCv25, /<w:tbl[\s>]/, 'Tech-grid PDF architecture is a 2-column split');
  assert.match(xmlCv25, /0F172A/i);
  assert.match(xmlCv25, /Skills/i);

  const bufCv40 = await createResumeDocx({ ...sampleData, template: 'Cv40' });
  const xmlCv40 = (await loadDoc(bufCv40)).documentXml;
  assert.match(xmlCv40, /003399/);
  assert.match(xmlCv40, /WORK EXPERIENCE/i);
});

test('native Word numbering is emitted for bullets', async () => {
  const buffer = await createResumeDocx({
    template: 'Cv1',
    firstname: 'Asha',
    lastname: 'Rao',
    skills: [{ name: 'Go' }, { name: 'Rust' }],
    employments: [{ jobTitle: 'Engineer', employer: 'Co', description: '<ul><li>First</li><li>Second</li></ul>' }],
  });
  const { documentXml, numberingXml, archive } = await loadDoc(buffer);
  assert.ok(archive.file('word/numbering.xml'), 'numbering.xml must exist');
  assert.match(numberingXml, /w:abstractNum|w:numFmt/);
  assert.match(documentXml, /<w:numPr>/);
  assert.match(documentXml, /<w:ilvl /);
});

test('two-column templates stay two-column and ATS stays single-column', async () => {
  const split = ['Cv1', 'Cv2', 'Cv9', 'Cv25', 'Cv26'];
  const ats = ['Cv4', 'Cv12', 'Cv18', 'Cv38', 'Cv44'];
  for (const template of split) {
    const xml = (await loadDoc(await createResumeDocx({ ...RICH_SAMPLE, template }))).documentXml;
    assert.match(xml, /<w:tbl[\s>]/, `${template} must keep a layout table`);
    assert.match(xml, /w:fill="/i, `${template} must shade the sidebar`);
  }
  for (const template of ats) {
    const xml = (await loadDoc(await createResumeDocx({ ...RICH_SAMPLE, template }))).documentXml;
    assert.doesNotMatch(xml, /w:fill="F8FAFC"/i, `${template} must not invent a split sidebar`);
    assert.match(visibleText(xml), /Professional Summary|Experience|Skills/i);
  }
});

test('content cannot disappear across archetypes', async () => {
  const required = ['Bhaskar Babu Madala', 'Lead Architect', 'Beyond Technologies', 'Example University', 'JavaScript', 'Telugu', 'ResumePilot', 'AWS Certified', 'Engineering Excellence', 'Photography', 'Priya Nair', 'Distributed Locking'];
  for (const template of ['Cv1', 'Cv4', 'Cv8', 'Cv25', 'Cv40']) {
    const xml = (await loadDoc(await createResumeDocx({ ...RICH_SAMPLE, template }))).documentXml;
    const text = visibleText(xml);
    for (const token of required) {
      assert.match(text, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${template} lost "${token}"`);
    }
  }
});

test('theme registry stays synchronized with the PDF themePresets source', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/engine/hybrid/themePresets.js'), 'utf8');
  for (let i = 1; i <= 51; i++) {
    const id = `Cv${i}`;
    const block = src.split(`${id}:`)[1];
    assert.ok(block, `frontend preset missing ${id}`);
    const primary = (block.match(/primary:\s*'#([0-9a-fA-F]{6})'/) || [])[1];
    const archetype = (block.match(/archetype:\s*ARCHETYPES\.([A-Z_]+)/) || [])[1];
    assert.ok(primary, `${id} frontend primary`);
    assert.equal(THEMES[id].primary, primary.toUpperCase(), `${id} primary drifted from PDF preset`);
    const expectedArchetype = {
      MODERN_SPLIT: 'modern-split',
      EXECUTIVE_BANNER: 'executive-banner',
      MINIMAL_ATS: 'minimal-ats',
      TECH_GRID: 'tech-grid',
      COMPACT_EURO: 'compact-euro',
    }[archetype];
    assert.equal(THEMES[id].archetype, expectedArchetype, `${id} archetype drifted from PDF preset`);
  }
});

test('resolveExportTemplate rejects client spoofing and mismatch', () => {
  assert.equal(resolveExportTemplate({ template: 'Cv7' }, 'Cv7'), 'Cv7');
  assert.equal(resolveExportTemplate({ template: 'Cv7' }, ''), 'Cv7');
  assert.throws(() => resolveExportTemplate({ template: 'Cv7' }, 'Cv1'), /TEMPLATE_MISMATCH/);
  assert.throws(() => resolveExportTemplate({}, 'Cv99'), /INVALID_TEMPLATE/);
  assert.throws(() => resolveExportTemplate({}, '../etc/passwd'), /INVALID_TEMPLATE/);
});

test('layoutFamily maps archetypes the way the PDF composer does', () => {
  assert.equal(layoutFamily(ARCHETYPES.MODERN_SPLIT), 'two-column-split');
  assert.equal(layoutFamily(ARCHETYPES.TECH_GRID), 'two-column-split');
  assert.equal(layoutFamily(ARCHETYPES.EXECUTIVE_BANNER), 'banner-split');
  assert.equal(layoutFamily(ARCHETYPES.MINIMAL_ATS), 'single-column');
  assert.equal(layoutFamily(ARCHETYPES.COMPACT_EURO), 'date-gutter');
});

test('HTML parser never returns raw tags and stripAllHtmlTags is complete', () => {
  const html = '<p class="editor-paragraph" dir="ltr"><span style="color:red">Hello</span></p>';
  assert.equal(stripAllHtmlTags(html), 'Hello');
  const paras = parseRichTextToParagraphs(html, { font: 'Calibri', primary: '111827' });
  assert.equal(paras.length > 0, true);
});

test('long dense resumes stay valid OOXML without dropping later sections', async () => {
  const dense = {
    template: 'Cv1',
    firstname: 'Alexandrina-Elizabeth',
    lastname: 'Montgomery-Featherstonehaugh',
    occupation: 'Global Vice President of Engineering',
    email: 'alex@enterprise-multinational-conglomerate.org',
    summary: 'A'.repeat(1200),
    employments: Array.from({ length: 12 }, (_, i) => ({
      jobTitle: `Architect ${i + 1}`,
      employer: `Global Corp ${i + 1}`,
      begin: `${2010 + i}`,
      end: `${2011 + i}`,
      description: `<ul><li>${'Delivered measurable outcomes. '.repeat(8)}</li><li>Second bullet</li></ul>`,
    })),
    educations: Array.from({ length: 4 }, (_, i) => ({ degree: `Degree ${i}`, school: `University ${i}` })),
    skills: Array.from({ length: 24 }, (_, i) => ({ name: `Skill ${i}` })),
    certifications: Array.from({ length: 8 }, (_, i) => ({ title: `Cert ${i}`, issuer: 'Org' })),
    projects: Array.from({ length: 6 }, (_, i) => ({ title: `Project ${i}`, description: 'Long project text' })),
    languages: [{ name: 'English', level: 'Native' }, { name: 'తెలుగు', level: 'Native' }],
  };
  const buffer = await createResumeDocx(dense);
  const { documentXml, archive } = await loadDoc(buffer);
  assert.ok(archive.file('word/document.xml'));
  assert.match(documentXml, /Architect 12/);
  assert.match(documentXml, /Skill 23/);
  assert.match(documentXml, /Cert 7/);
  assert.match(documentXml, /Project 5/);
  assert.doesNotMatch(documentXml, /editor-paragraph/);
});

test('Cv1 split uses the PDF 34/66 column architecture without overflowing nested tables', async () => {
  const { documentXml, archive } = await loadDoc(await createResumeDocx({ ...RICH_SAMPLE, template: 'Cv1' }));
  const grids = [...documentXml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)]
    .map((match) => [...match[1].matchAll(/w:w="(\d+)"/g)].map((col) => Number(col[1])));
  assert.ok(grids.length >= 1, 'Cv1 must emit a layout table');
  assert.equal(grids[0].length, 2, 'Cv1 first table must be a two-column split');
  const sidebar = grids[0][0];
  const hero = grids[0][1];
  const ratio = sidebar / (sidebar + hero);
  assert.equal(ratio > 0.32 && ratio < 0.36, true, `sidebar ratio must be ~34%, got ${ratio}`);
  for (const grid of grids.slice(1)) {
    const width = grid.reduce((sum, value) => sum + value, 0);
    assert.equal(width <= hero + 80, true, `nested table width ${width} overflows hero column ${hero}`);
  }
  const text = visibleText(documentXml).toUpperCase();
  assert.equal(text.indexOf('AWS CERTIFIED') < text.indexOf('PROFESSIONAL SUMMARY'), true, 'typical-length certs belong in the sidebar like the PDF partitioner');
  const rels = await archive.file('word/_rels/document.xml.rels').async('string');
  assert.match(rels, /https:\/\/github\.com\/bhaskar\/resumepilot/);
});

test('cover letters remain valid editable OOXML', async () => {
  const buffer = await createResumeDocx({
    template: 'Cover1',
    firstname: 'Priya',
    lastname: 'Nambiar',
    email: 'priya@example.com',
    recipientName: 'Hiring Committee',
    recipientCompany: 'Global Innovations Inc.',
    coverLetterContent: '<p>I am writing to express my strong enthusiasm.</p>',
  });
  const { documentXml } = await loadDoc(buffer);
  assert.match(documentXml, /Priya Nambiar/);
  assert.match(documentXml, /Hiring Committee/);
  assert.match(documentXml, /strong enthusiasm/);
  assert.doesNotMatch(documentXml, /<p>/);
});
