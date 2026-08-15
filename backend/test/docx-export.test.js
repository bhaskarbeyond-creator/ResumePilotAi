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
  });
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  const archive = await JSZip.loadAsync(buffer);
  assert.ok(archive.file('[Content_Types].xml'));
  const documentXml = await archive.file('word/document.xml').async('string');
  for (const expected of ['Asha Rao', 'Professional Summary', 'Experience', 'Example Co', 'Education', 'Skills', 'JavaScript', 'Projects']) assert.match(documentXml, new RegExp(expected));
});

test('DOCX export bounds control characters and oversized individual text fields', async () => {
  const buffer = await createResumeDocx({ firstname: 'Safe\u0000Name', summary: 'x'.repeat(20_000) });
  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file('word/document.xml').async('string');
  assert.doesNotMatch(documentXml, /\u0000/);
  assert.ok(documentXml.length < 20_000);
});
