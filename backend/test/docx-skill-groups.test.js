// P002 C6: the candidate resume builder stored skills as `{ category, skills: [...] }`
// groups before it switched to the flat `{ name, category }` list every reader expects.
// Word exports of those resumes silently dropped every skill. These tests pin both
// shapes so a saved resume's skills always reach the exported document.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { createResumeDocx } = require('../services/docxExport');

async function documentText(input) {
  const zip = await JSZip.loadAsync(await createResumeDocx(input));
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<[^>]+>/g, ' ');
}

const base = { template: 'Cv1', firstname: 'Avery', lastname: 'Tester', occupation: 'QA Engineer' };

test('flat skills ({ name, category }) are exported', async () => {
  const text = await documentText({ ...base, skills: [{ name: 'Playwright', category: 'Testing' }, { name: 'TypeScript', category: 'Languages' }] });
  assert.match(text, /Playwright/);
  assert.match(text, /TypeScript/);
});

test('grouped skills saved by the earlier builder ({ category, skills: [...] }) are exported', async () => {
  const text = await documentText({
    ...base,
    skills: [
      { id: 'general', category: 'Testing', skills: ['Playwright', 'Cypress'] },
      { id: 'lang', category: 'Languages', skills: ['TypeScript'] },
    ],
  });
  for (const skill of ['Playwright', 'Cypress', 'TypeScript']) assert.match(text, new RegExp(skill));
});

test('grouped skills stored as a JSON string are exported', async () => {
  const text = await documentText({ ...base, skills: JSON.stringify([{ category: 'Testing', skills: ['Playwright'] }]) });
  assert.match(text, /Playwright/);
});

test('hidden skills stay hidden for both shapes', async () => {
  for (const skills of [[{ name: 'Playwright' }], [{ category: 'Testing', skills: ['Playwright'] }]]) {
    const text = await documentText({ ...base, skills, hiddenSections: ['skills'] });
    assert.doesNotMatch(text, /Playwright/);
  }
});
