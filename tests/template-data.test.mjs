import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeTemplateData, validateTemplateData, formatDateRange, formatLanguages, formatLocation, getContrastTextColor, getTemplateDirection } from '../src/cv-templates/templateUtils.js';

const root = path.resolve(import.meta.dirname, '..');

test('all 51 CV and 4 cover template entry points exist', () => {
  for (let index = 1; index <= 51; index += 1) {
    assert.equal(fs.existsSync(path.join(root, `src/cv-templates/cv${index}/Cv${index}.jsx`)), true, `Cv${index}`);
  }
  for (let index = 1; index <= 4; index += 1) {
    assert.equal(fs.existsSync(path.join(root, `src/cv-templates/cover${index}/Cover${index}.jsx`)), true, `Cover${index}`);
  }
});

test('minimal and malformed resume data normalize to a complete immutable contract', () => {
  const original = { firstname: 'Asha', employments: null, skills: ['JavaScript'], languages: undefined, colors: null };
  const normalized = normalizeTemplateData(original);
  assert.equal(normalized.firstname, 'Asha');
  assert.deepEqual(normalized.employments, []);
  assert.equal(normalized.skills[0].name, 'JavaScript');
  assert.equal(normalized.skills[0].skillName, 'JavaScript');
  assert.deepEqual(normalized.languages, []);
  assert.equal(normalized.colors.primary, '#1E40AF');
  normalized.skills.sort(() => -1);
  assert.deepEqual(original.skills, ['JavaScript']);
});

test('legacy aliases bind consistently across employment, education, skill, language and contact fields', () => {
  const normalized = normalizeTemplateData({
    firstName: '李', lastName: '雷', postalCode: '100000', websiteUrl: 'https://例子.测试/路径',
    workExperiences: [{ title: 'Staff Engineer', company: 'Acme', startDate: '2020', endDate: 'Present', summary: 'Built systems' }],
    education: [{ institution: '大学', qualification: '工学硕士', startDate: '2014', endDate: '2018' }],
    skills: [{ skillName: '分布式系统', level: 120 }],
    languages: [{ language: '中文', proficiency: '母语' }],
  });
  assert.equal(normalized.name, '李 雷');
  assert.equal(normalized.postalcode, '100000');
  assert.equal(normalized.website, 'https://例子.测试/路径');
  assert.equal(normalized.employments[0].jobTitle, 'Staff Engineer');
  assert.equal(normalized.employments[0].employer, 'Acme');
  assert.equal(normalized.educations[0].school, '大学');
  assert.equal(normalized.skills[0].rating, 100);
  assert.equal(normalized.languages[0].name, '中文');
});

test('hidden sections affect presentation without deleting underlying builder data', () => {
  const source = { summary: 'Private summary', employments: [{ jobTitle: 'Engineer' }], skills: [{ name: 'Node.js' }], hiddenSections: ['summary', 'employment'] };
  const normalized = normalizeTemplateData(source);
  assert.equal(normalized.summary, '');
  assert.deepEqual(normalized.employments, []);
  assert.equal(normalized.skills.length, 1);
  assert.equal(source.summary, 'Private summary');
  assert.equal(source.employments.length, 1);
});

test('large and long resume diagnostics are deterministic without dropping entries', () => {
  const input = {
    summary: 'x'.repeat(5_000),
    employments: Array.from({ length: 25 }, (_, index) => ({ jobTitle: `Role ${index}` })),
    skills: Array.from({ length: 60 }, (_, index) => `Skill ${index}`),
    projects: Array.from({ length: 25 }, (_, index) => ({ title: `Project ${index}` })),
    website: `https://example.com/${'a'.repeat(2_100)}`,
  };
  const result = validateTemplateData(input);
  assert.equal(result.valid, true);
  assert.equal(result.value.employments.length, 25);
  assert.equal(result.value.skills.length, 60);
  assert.deepEqual(result.warnings.sort(), [
    'large-employment-history', 'large-projects-list', 'large-skills-list',
    'long-summary', 'long-website-url', 'missing-contact', 'missing-name'
  ].sort());
});

test('cover component lists normalize strings and arrays safely', () => {
  const normalized = normalizeTemplateData({
    components: [
      { type: 'List', title: 'Strengths', content: 'One; Two\nThree' },
      { type: 'Paragraph', content: ['Hello', 'world'] },
    ]
  });
  assert.deepEqual(normalized.components[0].content, ['One', 'Two', 'Three']);
  assert.equal(normalized.components[0].name, 'Strengths');
  assert.equal(normalized.components[1].content, 'Hello\nworld');
});

test('shared formatting handles dates, locations, languages, contrast, and RTL', () => {
  assert.equal(formatDateRange('Jan 2020', '', true), 'Jan 2020 – Present');
  assert.equal(formatDateRange('', '2024', false), '2024');
  assert.equal(formatLocation(', Vijayawada, 520001, India, .'), 'Vijayawada, 520001, India');
  assert.deepEqual(formatLanguages('English (Native); हिन्दी - Fluent'), [
    { name: 'English', level: 'Native' }, { name: 'हिन्दी', level: 'Fluent' }
  ]);
  assert.equal(getContrastTextColor('#ffffff'), '#1a202c');
  assert.equal(getContrastTextColor('#000000'), '#ffffff');
  assert.equal(getTemplateDirection('ur-IN'), 'rtl');
  assert.equal(getTemplateDirection('en-US'), 'ltr');
});
