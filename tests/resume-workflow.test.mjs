import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createResumeRecoveryEnvelope, duplicateResumeItem, moveResumeItem, normalizeResumeData, readResumeRecoveryEnvelope, resumeHasMeaningfulData } from '../src/utils/resumeData.js';

const complete = {
  title: 'Platform Résumé', template: 'Cv37', firstname: 'Asha', lastname: 'రావు', email: 'asha@example.com',
  summary: '<p>Engineer अनुभव ✓</p>', projects: [{ title: 'Payments', description: 'Long-term modernization' }],
  certifications: [{ title: 'AWS' }], achievements: [{ title: 'Award' }], references: [{ name: 'Ref' }],
  employments: [{ title: 'Engineer', company: 'Acme', startDate: '2020', endDate: 'Present', description: '<p>Built APIs</p>' }],
  education: [{ institution: 'University', qualification: 'M.Tech', startDate: '2016', endDate: '2020' }],
  skills: [{ skill: 'Node.js', rating: 80 }], languages: [{ language: 'తెలుగు', proficiency: 'Native' }],
  customSections: [{ id: 'volunteer', title: 'Volunteer', items: ['Mentor'] }],
  sectionOrder: ['heading', 'projects', 'employment', 'skills'], hiddenSections: ['references'],
};

test('canonical resume normalization preserves all legitimate sections, ordering, Unicode, and aliases', () => {
  const snapshot = structuredClone(complete);
  const result = normalizeResumeData(complete);
  assert.deepEqual(complete, snapshot);
  assert.equal(result.template, 'Cv37');
  assert.equal(result.lastname, 'రావు');
  assert.equal(result.employments[0].jobTitle, 'Engineer');
  assert.equal(result.employments[0].employer, 'Acme');
  assert.equal(result.educations[0].school, 'University');
  assert.equal(result.skills[0].name, 'Node.js');
  assert.equal(result.skills[0].skillName, 'Node.js');
  assert.equal(result.languages[0].name, 'తెలుగు');
  assert.equal(result.projects[0].title, 'Payments');
  assert.equal(result.certifications[0].title, 'AWS');
  assert.equal(result.customSections[0].title, 'Volunteer');
  assert.deepEqual(result.sectionOrder, ['heading', 'projects', 'employment', 'skills']);
  assert.deepEqual(result.hiddenSections, ['references']);
});

test('section entries can be reordered and duplicated immutably with deterministic persisted order', () => {
  const source = [{ id: 'a', jobTitle: 'First', date: 1 }, { id: 'b', jobTitle: 'Second', date: 2 }];
  const moved = moveResumeItem(source, 'b', -1);
  assert.deepEqual(moved.map(item => item.id), ['b', 'a']);
  assert.deepEqual(moved.map(item => item.date), [1, 2]);
  const duplicated = duplicateResumeItem(moved, 'b', { jobTitle: 'Second Copy' });
  assert.equal(duplicated.length, 3);
  assert.equal(duplicated[1].jobTitle, 'Second Copy');
  assert.match(duplicated[1].id, /^b-copy-/);
  assert.deepEqual(source, [{ id: 'a', jobTitle: 'First', date: 1 }, { id: 'b', jobTitle: 'Second', date: 2 }]);
});

test('template switching changes presentation metadata without dropping resume content', () => {
  const first = normalizeResumeData(complete);
  const switched = normalizeResumeData({ ...first, template: 'Cv51', colors: null });
  assert.equal(switched.template, 'Cv51');
  for (const key of ['employments', 'educations', 'skills', 'languages', 'projects', 'certifications', 'customSections']) {
    assert.deepEqual(switched[key], first[key], key);
  }
});

test('blank and malformed resumes produce valid deterministic state without false meaningful data', () => {
  const result = normalizeResumeData({ template: 'Unknown', skills: null, employments: 'bad', completedSteps: ['x', 2], __proto__: { admin: true } });
  assert.equal(result.template, 'Cv1');
  assert.deepEqual(result.skills, []);
  assert.deepEqual(result.employments, []);
  assert.deepEqual(result.completedSteps, [2]);
  assert.equal(resumeHasMeaningfulData(result), false);
  assert.equal(resumeHasMeaningfulData({ firstname: 'Asha' }), true);
});

test('builder persistence does not implicitly publish or write a cross-account global resume cache', async () => {
  const source = await fs.promises.readFile('src/components/BuildResume/BuildResume.jsx', 'utf8');
  assert.doesNotMatch(source, /setJsonPb\s*\(/);
  assert.doesNotMatch(source, /setItem\(['"]currentResumeItem/);
  assert.match(source, /publishResume\(/);
  assert.match(source, /saveResumeDraft\(/);
  const operations = await fs.promises.readFile('src/firestore/dbOperations.js', 'utf8');
  assert.match(operations, /setJsonPb\(resumeId, resumeObject, \{ isPublished = false \}/);
  assert.match(operations, /publicationMode: 'explicit'/);
});

test('recovery envelopes are account/resume scoped, expiring, and preserve large data', () => {
  const data = { ...complete, employments: Array.from({ length: 40 }, (_, index) => ({ jobTitle: `Role ${index}`, employer: '会社', description: '成果 '.repeat(100) })) };
  const envelope = createResumeRecoveryEnvelope({ userId: 'alice', resumeId: 'resume-1', revision: 7, data });
  const recovered = readResumeRecoveryEnvelope(JSON.stringify(envelope), { userId: 'alice', resumeId: 'resume-1' });
  assert.equal(recovered.revision, 7);
  assert.equal(recovered.data.employments.length, 40);
  assert.equal(readResumeRecoveryEnvelope(envelope, { userId: 'bob', resumeId: 'resume-1' }), null);
  assert.equal(readResumeRecoveryEnvelope({ ...envelope, savedAt: 0 }, { userId: 'alice', resumeId: 'resume-1' }), null);
});
