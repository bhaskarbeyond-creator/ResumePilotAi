import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHeuristicResumeData,
  normalizeRawDataToTempJson,
} from '../src/services/resumeFieldMapper.js';

test('AI resume mapping leaves unsupported dates and proficiency fields unset', () => {
  const mapped = normalizeRawDataToTempJson({
    firstname: 'Asha',
    employments: [{ title: 'Engineer', company: 'Acme', startDate: '2020' }],
    skills: ['React', { name: 'Node.js' }],
    languages: ['English', { name: 'Spanish' }],
    _grounding: 'source-extracted',
  });

  assert.equal(mapped.employments[0].begin, '2020');
  assert.equal(mapped.employments[0].end, '');
  assert.equal(mapped.employments[0].current, false);
  assert.deepEqual(mapped.skills.map(skill => skill.rating), [null, null]);
  assert.deepEqual(mapped.languages.map(language => language.level), ['', '']);
  assert.equal(mapped.meta.aiUsed, true);
  assert.equal(mapped.meta.grounding, 'source-extracted');
});

test('local resume heuristics extract source text without inventing a summary, location, dates, or proficiency', () => {
  const parsed = extractHeuristicResumeData(`Asha Rao
asha@example.com
Vijayawada, India
Software Engineer

EXPERIENCE
Platform Engineer | Acme
Built APIs

EDUCATION
B.Tech Computer Science, Example University, 2020

SKILLS
React, Node.js

LANGUAGES
English
Spanish Intermediate`);

  assert.equal(parsed.summary, '');
  assert.equal(parsed.employments.length, 1);
  assert.equal(parsed.employments[0].city, '');
  assert.equal(parsed.employments[0].begin, '');
  assert.equal(parsed.employments[0].end, '');
  assert.equal(parsed.employments[0].current, false);
  assert.equal(parsed.educations.length, 1);
  assert.equal(parsed.educations[0].started, '');
  assert.equal(parsed.educations[0].finished, '');
  assert.deepEqual(parsed.skills.map(skill => skill.rating), [null, null]);
  assert.deepEqual(
    parsed.languages.map(language => [language.language, language.level]),
    [['English', ''], ['Spanish', 'Intermediate']]
  );
});
