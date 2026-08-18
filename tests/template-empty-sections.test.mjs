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
const { createResumeDocx, hasMeaningfulDocxText } = docxPkg;
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

/* ══════════════════════════════════════════════════════════════════════
   Added by senior review.

   The suite above proved the sanitizer, the partitioner and the DOCX builders
   suppress `''`, `{}` and `<p><br></p>`. It did NOT cover rich text whose only
   content is a SPACE — `<p> </p>`, `<p>   </p>`, `<p>&nbsp;</p>` — or a lone
   zero-width space. Those slipped past the DOCX pipeline (whose emptiness rule
   is separate from contentSanitizer's) and printed a real section heading plus
   a blank paragraph into word/document.xml, while the browser and the PDF
   correctly hid the section. Verified against actual OOXML before the fix.
   ══════════════════════════════════════════════════════════════════════ */
describe('Cross-pipeline emptiness parity (browser engine vs DOCX)', () => {
  const BLANK_CORPUS = [
    '', '   ', '\n', '\t', '\r\n   ',
    '<p></p>', '<p> </p>', '<p>   </p>', '<p>\n</p>',
    '<p><br></p>', '<p><br/></p>', '<p class="editor-paragraph"><br></p>',
    '<p>&nbsp;</p>', '&nbsp;', '&#160;', '\u00a0', '\u200b',
    '<span></span>', '<div></div>', '<strong></strong>', '<p><span></span></p>',
    '<ul></ul>', '<ul><li></li></ul>',
  ];
  const CONTENT_CORPUS = [
    'Platform engineer.', '0', 'X', '2024', 'C++ / C# — 100%',
    'https://example.com/a?b=1&c=2', 'first.last+tag@example.co.uk',
    '<p>Delivered results.</p>', '<p><strong>Bold</strong></p>', '<ul><li>One</li></ul>',
    'భాస్కర్ రావు', 'वरिष्ठ सॉफ्टवेयर वास्तुकार', 'José María Núñez',
    'Руководитель', 'Ελληνικά', '软件架构师', 'مهندس برمجيات', 'R&amp;D lead',
  ];

  test('L. the DOCX emptiness rule agrees with contentSanitizer on every blank form', () => {
    for (const value of BLANK_CORPUS) {
      assert.equal(hasMeaningfulText(value), false, `frontend treated ${JSON.stringify(value)} as content`);
      assert.equal(hasMeaningfulDocxText(value), false, `DOCX treated ${JSON.stringify(value)} as content`);
    }
  });

  test('M. the DOCX emptiness rule agrees with contentSanitizer on every real value', () => {
    for (const value of CONTENT_CORPUS) {
      assert.equal(hasMeaningfulText(value), true, `frontend discarded real content ${JSON.stringify(value)}`);
      assert.equal(hasMeaningfulDocxText(value), true, `DOCX discarded real content ${JSON.stringify(value)}`);
    }
  });

  test('N. whitespace-only rich text never prints a section heading into word/document.xml', async () => {
    const cases = ['<p> </p>', '<p>   </p>', '<p>&nbsp;</p>', '\u200b', '<p></p>'];
    for (const blank of cases) {
      const buffer = await createResumeDocx({
        template: 'Cv4',
        firstname: 'Alice', lastname: 'Smith', email: 'alice@example.com',
        summary: blank,
        employments: [{ description: blank }],
        educations: [{ description: blank }],
        projects: [{ description: blank }],
        achievements: [{ description: blank }],
      });
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml').async('string');
      for (const heading of ['PROFESSIONAL SUMMARY', 'EXPERIENCE', 'EMPLOYMENT HISTORY', 'EDUCATION', 'PROJECTS', 'KEY ACHIEVEMENTS']) {
        assert.equal(documentXml.includes(heading), false,
          `blank ${JSON.stringify(blank)} produced a "${heading}" heading in the DOCX`);
      }
    }
  });

  test('O. a record whose only populated field is a valid description is still exported', async () => {
    const buffer = await createResumeDocx({
      template: 'Cv4',
      firstname: 'Alice', lastname: 'Smith', email: 'alice@example.com',
      projects: [{ description: 'A genuinely described project with no title.' }],
    });
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml').async('string');
    assert(documentXml.includes('PROJECTS'), 'valid description-only project lost its section');
    assert(documentXml.includes('genuinely described project'), 'valid description text was dropped');
  });

  test('P. a valid record with an empty description keeps its section (no over-suppression)', async () => {
    const buffer = await createResumeDocx({
      template: 'Cv4',
      firstname: 'Alice', lastname: 'Smith', email: 'alice@example.com',
      employments: [{ jobTitle: 'Lead Engineer', employer: 'Acme', description: '<p> </p>' }],
      projects: [{ title: 'ResumePilot', description: '   ' }],
    });
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml').async('string');
    assert(documentXml.includes('EXPERIENCE'), 'valid employment with blank description was over-suppressed');
    assert(documentXml.includes('Lead Engineer'), 'job title lost');
    assert(documentXml.includes('PROJECTS'), 'valid project with blank description was over-suppressed');
    assert(documentXml.includes('ResumePilot'), 'project title lost');
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Added by senior review — page-capacity must include the section gap.

   The spacing work gave `.smart-flow-container` a real inter-section gap
   (11/14/18 px by density). The partitioner sums section heights to decide
   what fits on a page but did not charge that gap, so a nine-section
   single-column resume gained ~120 px of unaccounted height and the tail was
   cut off by the sheet's `overflow:hidden`. Measured with a real browser:
   16/51 templates clipped up to 123 px on the standard fixture.
   ══════════════════════════════════════════════════════════════════════ */
describe('Pagination accounts for the rendered section gap', () => {
  const SECTION_GAP = { compact: 11, standard: 14, spacious: 18 };
  // Mirrors smartPartitioner's documented capacities.
  const capacityFor = (archetype, pageIndex) => {
    if (pageIndex > 0) return 930;
    return (archetype === 'executive-banner' || archetype === 'tech-grid') ? 815 : 900;
  };
  const denseResume = {
    firstname: 'Gap', lastname: 'Probe', email: 'gap@example.com',
    summary: `<p>${'x'.repeat(300)}</p>`,
    employments: Array.from({ length: 5 }, (_, i) => ({
      jobTitle: `Role ${i}`, employer: `Company ${i}`, begin: '2020', end: '2021',
      description: `<p>${'y'.repeat(200)}</p>`,
    })),
    educations: [{ degree: 'B.Tech', school: 'IIT Madras' }],
    skills: Array.from({ length: 8 }, (_, i) => ({ name: `Skill ${i}` })),
    projects: [{ title: 'Alpha' }, { title: 'Beta' }],
    certifications: [{ title: 'CKA' }, { title: 'CKAD' }],
    achievements: [{ title: 'Award A' }, { title: 'Award B' }],
    references: [{ name: 'Priya Nair' }],
    languages: [{ name: 'English' }],
    hobbies: ['Chess'],
  };

  for (const archetype of ['minimal-ats', 'compact-euro', 'modern-split', 'executive-banner', 'tech-grid']) {
    for (const density of ['compact', 'standard', 'spacious']) {
      test(`Q. ${archetype}/${density}: no page is packed past capacity once section gaps are charged`, () => {
        const result = partitionResumeContent(denseResume, { archetype, density });
        result.pages.forEach((page, index) => {
          // Consecutive same-type items render as ONE section, so count groups.
          let groups = 0;
          let previous = null;
          for (const item of page.flowItems) {
            if (item.type !== previous) { groups += 1; previous = item.type; }
          }
          const contentHeight = page.flowItems.reduce((sum, item) => sum + (item.estHeight || 0), 0);
          const gapHeight = Math.max(0, groups - 1) * SECTION_GAP[density];
          const total = contentHeight + gapHeight;
          const capacity = capacityFor(archetype, index);
          assert.ok(
            total <= capacity,
            `${archetype}/${density} page ${index + 1}: ${Math.round(total)}px of content+gaps exceeds the ${capacity}px budget `
            + `(${Math.round(contentHeight)}px content + ${gapHeight}px gaps across ${groups} sections)`,
          );
        });
      });
    }
  }

  test('R. a denser section rhythm never yields fewer pages than a tighter one', () => {
    for (const archetype of ['minimal-ats', 'compact-euro', 'modern-split']) {
      const compact = partitionResumeContent(denseResume, { archetype, density: 'compact' }).totalPages;
      const spacious = partitionResumeContent(denseResume, { archetype, density: 'spacious' }).totalPages;
      assert.ok(spacious >= compact,
        `${archetype}: spacious produced ${spacious} pages but compact produced ${compact} — spacing is not being costed`);
    }
  });
});
