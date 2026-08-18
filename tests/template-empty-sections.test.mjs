import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { partitionResumeContent } from '../src/engine/hybrid/smartPartitioner.js';
import {
  hasMeaningfulText,
  filterMeaningfulEmployments,
  filterMeaningfulEducations,
  filterMeaningfulSkills,
  filterMeaningfulProjects,
  filterMeaningfulCertifications,
  filterMeaningfulAchievements,
  filterMeaningfulReferences,
  filterMeaningfulLanguages,
  filterMeaningfulHobbies,
} from '../src/engine/hybrid/utils/contentSanitizer.js';
import docxPkg from '../backend/services/docxExport.js';
const { createResumeDocx } = docxPkg;
import JSZip from 'jszip';

describe('Meaningful Content Detection & Sanitization', () => {
  test('A. hasMeaningfulText detects blank, whitespace, and formatting-only HTML as empty', () => {
    assert.equal(hasMeaningfulText(null), false);
    assert.equal(hasMeaningfulText(undefined), false);
    assert.equal(hasMeaningfulText(''), false);
    assert.equal(hasMeaningfulText('   \n\t  '), false);
    assert.equal(hasMeaningfulText('<p></p>'), false);
    assert.equal(hasMeaningfulText('<p><br></p>'), false);
    assert.equal(hasMeaningfulText('<p class="editor-paragraph"><br></p>'), false);
    assert.equal(hasMeaningfulText('<p>&nbsp;</p>'), false);
    assert.equal(hasMeaningfulText('<p>   &nbsp; \n <br> </p>'), false);
    assert.equal(hasMeaningfulText('<div><span>   </span></div>'), false);
    
    assert.equal(hasMeaningfulText('Hello World'), true);
    assert.equal(hasMeaningfulText('<p>Real summary paragraph</p>'), true);
    assert.equal(hasMeaningfulText('<p>   Bullet point <strong>highlight</strong> </p>'), true);
  });

  test('B. filterMeaningfulEmployments suppresses empty records', () => {
    const emptyRecords = [
      {},
      { jobTitle: '', employer: '', city: '', description: '' },
      { jobTitle: '   ', description: '<p><br></p>' },
      { description: '<p class="editor-paragraph"><br></p>' },
    ];
    assert.deepEqual(filterMeaningfulEmployments(emptyRecords), []);

    const validRecords = [
      { jobTitle: 'Software Engineer', employer: 'Tech Corp' },
      { employer: 'Acme Inc', description: '<p>Built high-scale pipelines</p>' }
    ];
    assert.equal(filterMeaningfulEmployments(validRecords).length, 2);
  });

  test('C. filterMeaningfulEducations suppresses empty records', () => {
    const emptyRecords = [
      {},
      { school: '', degree: '', description: '<p></p>' },
      { school: '   ', city: '' }
    ];
    assert.deepEqual(filterMeaningfulEducations(emptyRecords), []);

    const validRecords = [{ school: 'Stanford University', degree: 'B.S. Computer Science' }];
    assert.equal(filterMeaningfulEducations(validRecords).length, 1);
  });

  test('D. filterMeaningfulSkills suppresses empty strings and empty objects', () => {
    const emptySkills = ['', '   ', null, undefined, {}, { name: '' }, { skillName: '  ' }];
    assert.deepEqual(filterMeaningfulSkills(emptySkills), []);

    const validSkills = ['React', { name: 'Node.js', rating: 90 }, { skillName: 'Kubernetes' }];
    assert.equal(filterMeaningfulSkills(validSkills).length, 3);
  });

  test('E. filterMeaningfulProjects suppresses empty records', () => {
    const emptyProjects = [
      {},
      { title: '', description: '<p></p>', url: '' },
      { name: '   ', link: '' }
    ];
    assert.deepEqual(filterMeaningfulProjects(emptyProjects), []);

    const validProjects = [{ title: 'ResumePilot', description: 'AI Resume Builder' }];
    assert.equal(filterMeaningfulProjects(validProjects).length, 1);
  });

  test('F. filterMeaningfulCertifications suppresses empty records', () => {
    const emptyCerts = ['', '  ', {}, { title: '', issuer: '' }, { name: '   ' }];
    assert.deepEqual(filterMeaningfulCertifications(emptyCerts), []);

    const validCerts = ['AWS Solutions Architect', { title: 'CKA', issuer: 'CNCF' }];
    assert.equal(filterMeaningfulCertifications(validCerts).length, 2);
  });

  test('G. filterMeaningfulLanguages suppresses empty records', () => {
    const emptyLanguages = ['', '  ', {}, { name: '' }, { language: '   ' }];
    assert.deepEqual(filterMeaningfulLanguages(emptyLanguages), []);

    const validLanguages = ['English', { name: 'Spanish', level: 'Fluent' }];
    assert.equal(filterMeaningfulLanguages(validLanguages).length, 2);
  });

  test('H. filterMeaningfulHobbies suppresses empty strings and arrays', () => {
    assert.deepEqual(filterMeaningfulHobbies(''), []);
    assert.deepEqual(filterMeaningfulHobbies('<p><br></p>'), []);
    assert.deepEqual(filterMeaningfulHobbies(['', '   ', {}]), []);

    assert.equal(filterMeaningfulHobbies('Photography').length, 1);
    assert.equal(filterMeaningfulHobbies(['Photography', { name: 'Chess' }]).length, 2);
  });
});

describe('Smart Partitioner Conditional Section Suppression', () => {
  const minimalResume = {
    firstname: 'Jane',
    lastname: 'Doe',
    email: 'jane@example.com',
    occupation: 'Software Engineer',
  };

  test('I. Fully empty optional sections are never emitted in page flowItems or sidebar', () => {
    const resumeWithEmptySections = {
      ...minimalResume,
      summary: '<p class="editor-paragraph"><br></p>',
      employments: [{}, { jobTitle: '', description: '' }],
      educations: [{ school: '   ', degree: '' }],
      skills: ['', '   ', { name: '' }],
      projects: [{ title: '', description: '<p></p>' }],
      certifications: [{}],
      languages: ['', {}],
      hobbies: '<p>&nbsp;</p>',
      achievements: [{}],
      references: [{}],
    };

    const theme = { archetype: 'modern-split', density: 'standard' };
    const result = partitionResumeContent(resumeWithEmptySections, theme);

    assert.equal(result.totalPages, 1);
    const p1 = result.pages[0];

    // Flow items must be completely empty since no main flow sections exist
    assert.deepEqual(p1.flowItems, []);

    // Sidebar items must all be empty
    assert.deepEqual(p1.sidebar.skills, []);
    assert.deepEqual(p1.sidebar.hobbies, []);
    assert.deepEqual(p1.sidebar.certifications, []);
    assert.deepEqual(p1.sidebar.languages, []);
  });

  test('J. Populated -> Empty -> Populated sections flow upward without orphan spacing', () => {
    const mixedResume = {
      ...minimalResume,
      summary: '<p>Experienced developer with focus on backend systems.</p>',
      employments: [], // Empty
      educations: [{ school: 'MIT', degree: 'B.S. Computer Science' }], // Populated
      skills: [], // Empty
      projects: [{ title: 'Open Source CLI', description: 'Fast developer tooling' }], // Populated
      certifications: [], // Empty
    };

    const theme = { archetype: 'minimal-ats', density: 'standard' };
    const result = partitionResumeContent(mixedResume, theme);

    assert.equal(result.totalPages, 1);
    const flowItems = result.pages[0].flowItems;

    // Emitted types must strictly contain only the 3 populated sections in order
    const emittedTypes = [...new Set(flowItems.map((i) => i.type))];
    assert.deepEqual(emittedTypes, ['summary', 'education', 'project']);
  });
});

describe('DOCX Conditional Section Suppression', () => {
  test('K. DOCX export contains ZERO empty section headings for blank optional sections', async () => {
    const resumeWithBlankOptionalSections = {
      firstname: 'Alice',
      lastname: 'Smith',
      email: 'alice@example.com',
      occupation: 'Product Manager',
      summary: '<p class="editor-paragraph"><br></p>', // Empty
      employments: [{ jobTitle: 'Lead PM', employer: 'Tech Corp', begin: '2020', end: '2023' }],
      educations: [{ school: '', degree: '' }], // Empty
      skills: ['', '   '], // Empty
      projects: [{ title: '', description: '' }], // Empty
      certifications: [{}], // Empty
      hobbies: '', // Empty
      references: [{}], // Empty
    };

    const docxBuf = await createResumeDocx({ ...resumeWithBlankOptionalSections, template: 'Cv1' });
    const zip = await JSZip.loadAsync(docxBuf);
    const documentXml = await zip.file('word/document.xml').async('string');

    // Populated section must exist (DOCX renders headings in uppercase)
    assert(documentXml.includes('EMPLOYMENT HISTORY'), 'DOCX must contain Employment History');
    assert(documentXml.includes('Lead PM'), 'DOCX must contain job title');

    // Blank sections must NOT exist in DOCX OOXML (neither uppercase nor title case)
    assert(!documentXml.includes('PROFESSIONAL SUMMARY') && !documentXml.includes('Professional Summary'), 'DOCX must not contain empty Professional Summary heading');
    assert(!documentXml.includes('EDUCATION') && !documentXml.includes('Education'), 'DOCX must not contain empty Education heading');
    assert(!documentXml.includes('KEY SKILLS') && !documentXml.includes('Key Skills'), 'DOCX must not contain empty Skills heading');
    assert(!documentXml.includes('PROJECTS') && !documentXml.includes('Projects'), 'DOCX must not contain empty Projects heading');
    assert(!documentXml.includes('CERTIFICATIONS') && !documentXml.includes('Certifications'), 'DOCX must not contain empty Certifications heading');
    assert(!documentXml.includes('HOBBIES') && !documentXml.includes('Hobbies'), 'DOCX must not contain empty Hobbies heading');
    assert(!documentXml.includes('REFERENCES') && !documentXml.includes('References'), 'DOCX must not contain empty References heading');
  });
});

