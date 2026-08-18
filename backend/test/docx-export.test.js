const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { createResumeDocx, THEMES, getTemplateStyle } = require('../services/docxExport');

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
    customSections: [{ title: 'Patents', items: [{ title: 'Distributed Locking', description: 'Method for consensus.' }] }]
  });
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  const archive = await JSZip.loadAsync(buffer);
  assert.ok(archive.file('[Content_Types].xml'));
  const documentXml = await archive.file('word/document.xml').async('string');
  for (const expected of ['Asha Rao', 'Professional Summary', 'Example Co', 'Education', 'Skills', 'JavaScript', 'Projects', 'Patents']) {
    assert.match(documentXml, new RegExp(expected, 'i'));
  }
});

test('DOCX export strictly sanitizes raw editor HTML and prevents markup leakage', async () => {
  const rawHtmlSummary = '<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">Frontend Developer with 9+ years of experience in JavaScript and React.</span></p>';
  const rawHtmlEmployment = '<ul><li class="list-item">Architected microservices in Go</li><li>Reduced API latency by 40%</li></ul>';

  const buffer = await createResumeDocx({
    firstname: 'Bhaskar Babu',
    lastname: 'Madala',
    template: 'Cv1',
    summary: rawHtmlSummary,
    employments: [{ jobTitle: 'Lead Architect', employer: 'Beyond Technologies', description: rawHtmlEmployment }]
  });

  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file('word/document.xml').async('string');

  // Must contain the actual text
  assert.match(documentXml, /Frontend Developer with 9\+ years of experience/);
  assert.match(documentXml, /Architected microservices in Go/);
  assert.match(documentXml, /Reduced API latency by 40%/);

  // Must NOT contain raw editor HTML markup
  assert.doesNotMatch(documentXml, /editor-paragraph/);
  assert.doesNotMatch(documentXml, /dir="ltr"/);
  assert.doesNotMatch(documentXml, /white-space/);
  assert.doesNotMatch(documentXml, /<p\s/);
  assert.doesNotMatch(documentXml, /<span/);
  assert.doesNotMatch(documentXml, /<div/);
  assert.doesNotMatch(documentXml, /&lt;p/);
  assert.doesNotMatch(documentXml, /&lt;span/);
});

test('DOCX export renders authentic 2-column layout tables (<w:tbl>) for 2-column templates', async () => {
  // Cv1 is a 2-column split template
  const bufferCv1 = await createResumeDocx({
    firstname: 'Bhaskar',
    lastname: 'Madala',
    template: 'Cv1',
    email: 'bhaskar@example.com',
    skills: [{ name: 'React' }, { name: 'Node.js' }],
    languages: [{ name: 'Telugu', level: 'Native' }],
    summary: 'Senior Engineer',
    employments: [{ jobTitle: 'Tech Lead', employer: 'Beyond Tech', description: '• Built systems\n• Scaled APIs' }]
  });

  const archiveCv1 = await JSZip.loadAsync(bufferCv1);
  const xmlCv1 = await archiveCv1.file('word/document.xml').async('string');

  // Must contain an OpenXML table <w:tbl>
  assert.match(xmlCv1, /<w:tbl[\s>]/, 'Cv1 must contain a 2-column <w:tbl> layout');
  assert.match(xmlCv1, /<w:tc[\s>]/, 'Cv1 table must contain cells');

  // Both sidebar content and main content must be present
  assert.match(xmlCv1, /Skills/i);
  assert.match(xmlCv1, /React/i);
  assert.match(xmlCv1, /Languages/i);
  assert.match(xmlCv1, /Telugu/i);
  assert.match(xmlCv1, /Professional Summary/i);
  assert.match(xmlCv1, /Employment History/i);
});

test('DOCX export applies authentic template color identity (#EA580C for Cv1)', async () => {
  const styleCv1 = getTemplateStyle('Cv1');
  assert.equal(styleCv1.primary, 'EA580C', 'Cv1 primary color must be authentic orange EA580C');

  const buffer = await createResumeDocx({
    firstname: 'Bhaskar',
    lastname: 'Madala',
    template: 'Cv1',
    summary: 'Summary text'
  });

  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file('word/document.xml').async('string');
  assert.match(documentXml, /EA580C/i, 'Cv1 document XML must contain EA580C primary accent color');
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
      languages: [{ name: 'English', level: 'Fluent' }]
    });
    assert.equal(buffer[0], 0x50, `${templateName} must start with PK zip header`);
    assert.equal(buffer[1], 0x4b, `${templateName} must start with PK zip header`);
    const archive = await JSZip.loadAsync(buffer);
    assert.ok(archive.file('word/document.xml'), `${templateName} must contain document.xml`);

    const xml = await archive.file('word/document.xml').async('string');
    const style = getTemplateStyle(templateName);
    if (['modern-split', 'executive-banner', 'compact-euro', 'tech-grid'].includes(style.archetype)) {
      assert.match(xml, /<w:tbl[\s>]/, `${templateName} (${style.archetype} archetype) must contain <w:tbl>`);
    }
  }
});

test('DOCX export correctly renders Unicode scripts (Telugu, Devanagari, European accents)', async () => {
  const buffer = await createResumeDocx({
    firstname: 'భాస్కర్',
    lastname: 'రావు',
    summary: 'वरिष्ठ सॉफ्टवेयर वास्तुकार',
    employments: [{ jobTitle: 'Lead Architect', employer: 'José María Núñez Enterprise', description: '• నిర్మించిన వ్యవస్థలు' }]
  });
  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file('word/document.xml').async('string');
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
    educations: [{ degree: 'B.S. CS', school: 'MIT', startDate: '2016', endDate: '2020' }]
  };

  // 1. Modern Split (Cv1)
  const bufCv1 = await createResumeDocx({ ...sampleData, template: 'Cv1' });
  const xmlCv1 = await (await JSZip.loadAsync(bufCv1)).file('word/document.xml').async('string');
  assert.match(xmlCv1, /<w:tbl[\s>]/);
  assert.match(xmlCv1, /EA580C/i);

  // 2. Executive Banner (Cv8)
  const bufCv8 = await createResumeDocx({ ...sampleData, template: 'Cv8' });
  const xmlCv8 = await (await JSZip.loadAsync(bufCv8)).file('word/document.xml').async('string');
  assert.match(xmlCv8, /<w:shd w:fill="1E293B"\/>/i);

  // 3. Minimal ATS (Cv4)
  const bufCv4 = await createResumeDocx({ ...sampleData, template: 'Cv4' });
  const xmlCv4 = await (await JSZip.loadAsync(bufCv4)).file('word/document.xml').async('string');
  assert.match(xmlCv4, /Alex Morgan/);
  assert.match(xmlCv4, /Georgia|Merriweather/i);

  // 4. Tech Grid (Cv25)
  const bufCv25 = await createResumeDocx({ ...sampleData, template: 'Cv25' });
  const xmlCv25 = await (await JSZip.loadAsync(bufCv25)).file('word/document.xml').async('string');
  assert.match(xmlCv25, /Consolas/);
  assert.match(xmlCv25, /Technical Stack/i);

  // 5. Compact Euro (Cv40)
  const bufCv40 = await createResumeDocx({ ...sampleData, template: 'Cv40' });
  const xmlCv40 = await (await JSZip.loadAsync(bufCv40)).file('word/document.xml').async('string');
  assert.match(xmlCv40, /003399/);
  assert.match(xmlCv40, /WORK EXPERIENCE/i);
});
