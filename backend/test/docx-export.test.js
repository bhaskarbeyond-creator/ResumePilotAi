const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { createResumeDocx } = require('../services/docxExport');

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
  for (const expected of ['Asha Rao', 'Professional Summary', 'Experience', 'Example Co', 'Education', 'Skills', 'JavaScript', 'Projects', 'Patents']) {
    assert.match(documentXml, new RegExp(expected));
  }
});

test('DOCX export successfully generates valid OOXML packages for all 51 templates', async () => {
  for (let i = 1; i <= 51; i++) {
    const templateName = `Cv${i}`;
    const buffer = await createResumeDocx({
      firstname: 'Candidate',
      lastname: String(i),
      template: templateName,
      summary: `Template ${templateName} summary`,
      employments: [{ jobTitle: 'Developer', employer: 'Corp' }]
    });
    assert.equal(buffer[0], 0x50, `${templateName} must start with PK zip header`);
    assert.equal(buffer[1], 0x4b, `${templateName} must start with PK zip header`);
    const archive = await JSZip.loadAsync(buffer);
    assert.ok(archive.file('word/document.xml'), `${templateName} must contain document.xml`);
  }
});

test('DOCX export correctly renders Unicode scripts (Telugu, Devanagari, European accents)', async () => {
  const buffer = await createResumeDocx({
    firstname: 'భాస్కర్',
    lastname: 'రావు',
    summary: 'वरिष्ठ सॉफ्टवेयर वास्तुकार',
    employments: [{ jobTitle: 'Lead Architect', employer: 'José María Núñez Enterprise' }]
  });
  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file('word/document.xml').async('string');
  assert.match(documentXml, /భాస్కర్/);
  assert.match(documentXml, /రావు/);
  assert.match(documentXml, /वरिष्ठ सॉफ्टवेयर वास्तुकार/);
  assert.match(documentXml, /José María Núñez/);
});

test('DOCX export bounds control characters and oversized individual text fields', async () => {
  const buffer = await createResumeDocx({ firstname: 'Safe\u0000Name', summary: 'x'.repeat(20_000) });
  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file('word/document.xml').async('string');
  assert.doesNotMatch(documentXml, /\u0000/);
  assert.ok(documentXml.length < 20_000);
});
