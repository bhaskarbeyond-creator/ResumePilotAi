import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { normalizeResumeData, moveResumeItem, duplicateResumeItem } from '../src/utils/resumeData.js';
import { filterMeaningfulAchievements, filterMeaningfulReferences, filterMeaningfulCustomSections, filterMeaningfulProjects, filterMeaningfulCertifications, filterMeaningfulSkills, hasMeaningfulText } from '../src/engine/hybrid/utils/contentSanitizer.js';
import { partitionResumeContent } from '../src/engine/hybrid/smartPartitioner.js';
import docxPkg from '../backend/services/docxExport.js';

const { createResumeDocx } = docxPkg;
const localeRoot = path.resolve('src/locales');

function visibleText(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((node) => node.replace(/<[^>]+>/g, ''))
    .join(' ');
}

test('normalizeResumeData maps achievement, reference and custom-section aliases without inventing fields', () => {
  const result = normalizeResumeData({
    awards: [{ name: 'Gold Medal', summary: 'National olympiad.' }],
    references: [{ title: 'Ananya Iyer', description: 'VP Engineering' }],
    customSections: [{
      title: 'Volunteer',
      items: ['Mentor'],
      content: '',
    }, {
      title: 'Patents',
      content: '<p>Distributed locking method.</p>',
    }],
  });
  assert.equal(result.achievements[0].title, 'Gold Medal');
  assert.equal(result.achievements[0].description, 'National olympiad.');
  assert.equal(result.references[0].name, 'Ananya Iyer');
  assert.equal(result.references[0].reference, 'VP Engineering');
  assert.equal(result.customSections[0].items[0].title, 'Mentor');
  assert.equal(result.customSections[1].items[0].description, '<p>Distributed locking method.</p>');
});

test('empty, whitespace and HTML-blank records are dropped while partial valid records are kept', () => {
  const blank = [null, undefined, {}, { title: '' }, { title: '   ' }, { title: '<p></p>', description: '&nbsp;' }, { description: '<p><br></p>' }];
  assert.equal(filterMeaningfulAchievements(blank).length, 0);
  assert.equal(filterMeaningfulReferences([{ name: '' }, { reference: '   ' }, { name: '<p></p>' }]).length, 0);
  assert.equal(filterMeaningfulCustomSections([
    { title: 'Volunteer', items: [] },
    { title: 'Empty', items: [{ title: '', description: '<p></p>' }] },
    { title: '', content: '   ' },
  ]).length, 0);

  const partialAchievements = filterMeaningfulAchievements([{ title: 'PMP' }, { description: 'Shipped v2' }]);
  assert.equal(partialAchievements.length, 2);
  const partialRefs = filterMeaningfulReferences([{ name: 'Priya Nair' }, { reference: 'Available on request' }]);
  assert.equal(partialRefs.length, 2);
  const partialCustom = filterMeaningfulCustomSections([
    { title: 'Volunteer', items: [{ title: 'Mentor' }] },
    { title: 'Notes', content: 'Board advisor.' },
  ]);
  assert.equal(partialCustom.length, 2);
});

test('partitioner emits achievements, references and custom items in the certified order', () => {
  const values = {
    firstname: 'A', lastname: 'B',
    projects: [{ title: 'P1' }],
    certifications: [{ title: 'CKA' }],
    achievements: [{ title: 'Award A' }, { title: '', description: '<p></p>' }, { title: 'Award B' }],
    references: [{ name: 'Priya Nair' }, { name: '' }],
    customSections: [
      { id: 'vol', title: 'Volunteer', items: [{ title: 'Mentor' }, { title: '', description: '   ' }] },
      { id: 'empty', title: 'Empty', items: [] },
    ],
    skills: [{ name: 'Node.js' }],
  };
  const { pages } = partitionResumeContent(values, { archetype: 'minimal-ats' });
  const flow = pages.flatMap((page) => page.flowItems);
  const types = flow.map((item) => item.type);
  assert.equal(flow.filter((item) => item.type === 'achievement').length, 2);
  assert.equal(flow.filter((item) => item.type === 'reference').length, 1);
  assert.equal(flow.filter((item) => item.type === 'custom').length, 1);
  assert.ok(types.indexOf('project') < types.indexOf('certification'));
  assert.ok(types.indexOf('certification') < types.indexOf('achievement'));
  assert.ok(types.indexOf('achievement') < types.indexOf('reference'));
  assert.ok(types.indexOf('reference') < types.indexOf('custom'));
});

test('the Create Resume wizard exposes Achievements, References and Custom Sections without disturbing certified steps', () => {
  const source = fs.readFileSync('src/components/BuildResume/BuildResume.jsx', 'utf8');
  assert.match(source, /import AchievementsStep/);
  assert.match(source, /import ReferencesStep/);
  assert.match(source, /import CustomSectionsStep/);
  assert.match(source, /import ProjectsStep/);
  assert.match(source, /import CertificationsStep/);
  assert.match(source, /path="projects"/);
  assert.match(source, /path="certifications"/);
  assert.match(source, /path="achievements"/);
  assert.match(source, /path="references"/);
  assert.match(source, /path="custom"/);
  assert.match(source, /id: 6/);
  assert.match(source, /id: 7/);
  assert.match(source, /id: 8/);
  assert.match(source, /id: 9/);
  assert.match(source, /id: 10/);

  const achievements = fs.readFileSync('src/components/BuildResume/steps/AchievementsStep.jsx', 'utf8');
  const references = fs.readFileSync('src/components/BuildResume/steps/ReferencesStep.jsx', 'utf8');
  const custom = fs.readFileSync('src/components/BuildResume/steps/CustomSectionsStep.jsx', 'utf8');
  const projects = fs.readFileSync('src/components/BuildResume/steps/ProjectsStep.jsx', 'utf8');
  const certs = fs.readFileSync('src/components/BuildResume/steps/CertificationsStep.jsx', 'utf8');

  assert.match(achievements, /updateResumeData\(\{\s*achievements/m);
  assert.match(references, /updateResumeData\(\{\s*references/m);
  assert.match(custom, /updateResumeData\(\{\s*customSections/m);
  assert.match(projects, /updateResumeData\(\{\s*projects/m);
  assert.match(certs, /updateResumeData\(\{\s*certifications/m);

  for (const file of [achievements, references, custom, projects, certs]) {
    assert.match(file, /duplicateResumeItem/);
    assert.match(file, /moveResumeItem/);
  }

  // Dead fields must not be invented in the new editors.
  assert.doesNotMatch(achievements, /updateAchievement\([^)]+'issuer'/);
  assert.doesNotMatch(references, /updateReference\([^)]+'(email|phone|contact)'/);
  assert.doesNotMatch(custom, /updateItem\([^)]+'(date|url|link|subtitle)'/);
});

test('Projects and Certifications editors remain the certified field contract', () => {
  const projects = fs.readFileSync('src/components/BuildResume/steps/ProjectsStep.jsx', 'utf8');
  const certs = fs.readFileSync('src/components/BuildResume/steps/CertificationsStep.jsx', 'utf8');
  assert.match(projects, /updateProject\(project\.id, 'title'/);
  assert.match(projects, /updateProject\(project\.id, 'url'/);
  assert.match(projects, /updateProject\(project\.id, 'description'/);
  assert.match(certs, /updateCertification\(certification\.id, 'title'/);
  assert.match(certs, /updateCertification\(certification\.id, 'issuer'/);
  assert.match(certs, /updateCertification\(certification\.id, 'date'/);
  assert.doesNotMatch(certs, /updateCertification\([^)]+'url'/);
});

test('reorder and duplicate helpers stay immutable for the new section types', () => {
  const source = [
    { id: 'a', title: 'First', date: 1 },
    { id: 'b', title: 'Second', date: 2 },
  ];
  const moved = moveResumeItem(source, 'b', -1);
  assert.deepEqual(moved.map((item) => item.id), ['b', 'a']);
  const duplicated = duplicateResumeItem(moved, 'b', { title: 'Second Copy' });
  assert.equal(duplicated.length, 3);
  assert.equal(duplicated[1].title, 'Second Copy');
  assert.deepEqual(source.map((item) => item.id), ['a', 'b']);
});

test('DOCX OOXML keeps achievements, references and custom items in parity with the model', async () => {
  const buffer = await createResumeDocx({
    firstname: 'Asha', lastname: 'Rao', template: 'Cv1',
    achievements: [{ title: 'Excellence Award', description: 'Zero-downtime migration.' }],
    references: [{ name: 'Priya Nair', reference: 'VP Engineering' }],
    customSections: [{ title: 'Patents', items: [{ title: 'Distributed Locking', description: 'Consensus method.' }] }],
  });
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const text = visibleText(xml);
  assert.match(text, /Excellence Award/);
  assert.match(text, /Zero-downtime migration/);
  assert.match(text, /Priya Nair/);
  assert.match(text, /VP Engineering/);
  assert.match(text, /Patents/i);
  assert.match(text, /Distributed Locking/);
  assert.match(text, /Consensus method/);
  assert.equal(/editor-paragraph|dir="ltr"|<p\s|<span/.test(xml), false);
});

test('empty custom sections, achievements and references never print phantom DOCX headings', async () => {
  const buffer = await createResumeDocx({
    firstname: 'Alice', lastname: 'Smith', email: 'alice@example.com', template: 'Cv4',
    achievements: [{ title: '', description: '<p> </p>' }],
    references: [{ name: '', reference: '' }],
    customSections: [{ title: 'Volunteer Work', items: [] }, { title: 'Patents', items: [{ title: '', description: '<p></p>' }] }],
  });
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal(xml.includes('KEY ACHIEVEMENTS'), false);
  assert.equal(xml.includes('REFERENCES'), false);
  assert.equal(xml.includes('VOLUNTEER WORK'), false);
  assert.equal(xml.includes('PATENTS'), false);
});

test('partially populated extras keep legitimate titles and do not over-suppress', async () => {
  const buffer = await createResumeDocx({
    firstname: 'Alice', lastname: 'Smith', email: 'alice@example.com', template: 'Cv4',
    achievements: [{ title: 'Award A', description: '<p> </p>' }],
    references: [{ name: 'Priya Nair' }],
    customSections: [{ title: 'Volunteer', items: [{ title: 'Mentor' }] }],
  });
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const text = visibleText(xml);
  assert.match(text, /Award A/);
  assert.match(text, /Priya Nair/);
  assert.match(text, /Mentor/);
});

test('all 16 locales ship the new editor strings without English-only fallbacks', () => {
  const required = [
    'BuildResume.steps.languages',
    'BuildResume.steps.achievements',
    'BuildResume.steps.references',
    'BuildResume.steps.customSections',
    'PreviewModal.actions.downloadDocx',
    'PreviewModal.actions.generatingDocx',
    'resume.projects',
    'resume.certifications',
    'resume.achievements',
    'resume.references',
    'BuildResume.customSection.add',
    'AchievementsStep.title',
    'AchievementsStep.actions.addAchievement',
    'AchievementsStep.empty.title',
    'AchievementsStep.fields.title.label',
    'ReferencesStep.title',
    'ReferencesStep.actions.addReference',
    'ReferencesStep.empty.title',
    'ReferencesStep.fields.name.label',
    'CustomSectionsStep.title',
    'CustomSectionsStep.actions.addSection',
    'CustomSectionsStep.actions.addItem',
    'CustomSectionsStep.fields.sectionTitle.label',
    'CustomSectionsStep.fields.itemTitle.label',
    'ProjectsStep.title',
    'CertificationsStep.title',
  ];
  const flatten = (value, prefix = '', result = {}) => {
    for (const [key, child] of Object.entries(value)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, fullKey, result);
      else result[fullKey] = child;
    }
    return result;
  };
  const codes = fs.readdirSync(localeRoot).sort();
  assert.equal(codes.length, 16);
  for (const code of codes) {
    const locale = flatten(JSON.parse(fs.readFileSync(path.join(localeRoot, code, `${code}.json`), 'utf8')));
    for (const key of required) {
      assert.ok(locale[key], `${code} missing ${key}`);
      assert.notEqual(String(locale[key]).trim(), '', `${code} empty ${key}`);
    }
    if (code !== 'en') {
      assert.notEqual(locale['AchievementsStep.title'], 'Achievements', `${code} left AchievementsStep.title in English`);
      assert.notEqual(locale['ReferencesStep.title'], 'References', `${code} left ReferencesStep.title in English`);
      assert.notEqual(locale['BuildResume.steps.languages'], 'Languages', `${code} left BuildResume.steps.languages in English`);
    }
  }
});

test('skills 50/75/100 remain complete and ordered across Cv41 and Cv44', () => {
  for (const count of [50, 75, 100]) {
    const skills = Array.from({ length: count }, (_, index) => ({ name: `Skill ${String(index + 1).padStart(3, '0')}` }));
    const values = {
      firstname: 'Skill', lastname: 'Probe', email: 'skills@example.com',
      skills,
      employments: [{ jobTitle: 'Engineer', employer: 'Acme', begin: '2020', end: 'Present' }],
    };
    for (const theme of [
      { archetype: 'compact-euro', skillVariant: 'dots', density: 'standard' },
      { archetype: 'minimal-ats', skillVariant: 'dots', density: 'compact' },
    ]) {
      const kept = filterMeaningfulSkills(skills);
      assert.equal(kept.length, count);
      const result = partitionResumeContent(values, theme);
      const flat = result.pages.flatMap((page) => page.flowItems);
      const sidebar = result.pages[0].sidebar?.skills || [];
      const flowSkills = flat.filter((item) => item.type === 'skills').flatMap((item) => item.items || []);
      const rendered = [...sidebar, ...flowSkills].map((skill) => skill.name || skill.skillName);
      assert.equal(rendered.length, count, `${theme.archetype}/${count}: entered ${count} rendered ${rendered.length}`);
      assert.deepEqual(rendered, skills.map((skill) => skill.name));
      assert.equal(new Set(rendered).size, count);
    }
  }
});

test('hasMeaningfulText still treats HTML-only blanks as empty after the extras work', () => {
  assert.equal(hasMeaningfulText('<p></p>'), false);
  assert.equal(hasMeaningfulText('<p>&nbsp;</p>'), false);
  assert.equal(hasMeaningfulText('Award'), true);
  assert.equal(filterMeaningfulProjects([{ title: '', description: '<p></p>' }]).length, 0);
  assert.equal(filterMeaningfulCertifications([{ title: '', issuer: '', date: '' }]).length, 0);
});
