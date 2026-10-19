/**
 * DIR-008 — Master CV initialisation (D-03 / R-13…R-16).
 *
 * The Master CV is the single source of truth that seeds a new resume. These
 * tests pin the contract the builder depends on:
 *   - the sanitised, revisioned `profile` projection wins over the flat user
 *     row, which is only a legacy fallback;
 *   - default sync never overwrites an answer the candidate already gave, and
 *     `preserveExisting: false` is the explicit replace path;
 *   - every list is mapped into the builder's canonical entry shape, so the
 *     editors bind and the document renders (a wrong field name here used to
 *     produce invisible sections);
 *   - an empty Master CV reports empty instead of claiming success;
 *   - the reported revision is the one the values actually came from.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'vite';

const FRONTEND = path.join(process.cwd(), 'frontend');

const vite = await createServer({
  root: FRONTEND,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
after(async () => { await vite.close(); });

const { applyMasterProfile, describeMasterSync, describeMasterCompleteness } = await vite.ssrLoadModule('/src/lib/master-profile.ts');

const blankDraft = () => ({
  heading: {
    firstName: '', lastName: '', title: '', email: '', phone: '', location: '',
    city: '', country: '', website: '', linkedin: '', github: '', photo: '',
  },
  summary: '',
  experience: [],
  education: [],
  skillCategories: [],
  certifications: [],
  languages: [],
  projects: [],
  achievements: [],
  references: [],
  customSections: [],
});

function fullProfile(overrides = {}) {
  return {
    user: {
      uid: 'u-1',
      email: 'flat@example.com',
      firstname: 'Flat',
      lastname: 'Row',
      revision: 2,
      profile: {
        email: 'maya@example.com',
        firstname: 'Maya',
        lastname: 'Iyer',
        jobTitle: 'Staff Platform Engineer',
        phone: '+91 90000 00000',
        city: 'Vijayawada',
        country: 'India',
        website: 'https://maya.dev',
        linkedinUrl: 'https://linkedin.com/in/maya',
        githubUrl: 'https://github.com/maya',
        summary: 'Platform engineer with 9 years scaling distributed systems.',
        revision: 7,
        workExperiences: [
          { id: 'w1', company: 'Acme Cloud', position: 'Staff Engineer', startDate: '2021-04', endDate: '', current: false, description: 'Led the control plane.' },
        ],
        education: [
          { id: 'e1', institution: 'NIT Warangal', degree: 'B.Tech', field: 'Computer Science', startDate: '2011', endDate: '2015', gpa: '8.9' },
        ],
        skills: [
          { name: 'TypeScript', category: 'Languages' },
          { name: 'Go', category: 'Languages' },
          { name: 'Kubernetes', category: 'Infrastructure' },
        ],
        certifications: [
          { id: 'c1', name: 'CKA', issuer: 'CNCF', issueDate: '2023-05', expiryDate: '2026-05', credentialId: 'CKA-123', credentialUrl: 'https://credly.com/cka' },
        ],
        languages: [
          { id: 'l1', language: 'English', proficiency: 'C1' },
          { id: 'l2', language: 'Telugu', proficiency: 'Native' },
          { id: 'l3', language: 'Hindi', proficiency: 'Conversational' },
        ],
        projects: [
          { id: 'p1', title: 'MeshGate', description: 'Edge gateway.', technologies: 'Rust, Envoy', liveUrl: 'https://mesh.example', githubUrl: 'https://github.com/maya/mesh', startDate: '2022', endDate: '2023' },
        ],
        achievements: [
          { id: 'a1', title: 'Cloud Guild lead', description: 'Grew guild to 40 engineers.', date: '2024' },
        ],
        references: [
          { id: 'r1', name: 'Ravi Kumar', position: 'VP Engineering', company: 'Acme Cloud', email: 'ravi@acme.example', phone: '+91 90000 00001', relationship: 'Former manager' },
        ],
        customSections: [
          { id: 's1', title: 'Publications', items: [{ id: 's1i1', title: 'Scaling Control Planes', description: 'ACM Queue, 2023' }] },
        ],
        hobbies: ['Carnatic violin', 'Trail running'],
        ...overrides,
      },
    },
  };
}

test('the revisioned profile projection wins over the flat user row', () => {
  const result = applyMasterProfile(fullProfile(), blankDraft());
  assert.equal(result.draft.heading.firstName, 'Maya');
  assert.equal(result.draft.heading.lastName, 'Iyer');
  assert.equal(result.draft.heading.email, 'maya@example.com');
  assert.equal(result.draft.heading.title, 'Staff Platform Engineer');
  assert.equal(result.draft.heading.location, 'Vijayawada, India');
  assert.equal(result.draft.heading.city, 'Vijayawada');
  assert.equal(result.draft.heading.country, 'India');
  assert.equal(result.sourceRevision, 7);
});

test('a legacy payload without a profile projection still initialises from the flat row', () => {
  const legacy = {
    user: {
      uid: 'u-2',
      firstname: 'Legacy',
      lastname: 'Candidate',
      email: 'legacy@example.com',
      jobTitle: 'Analyst',
      revision: 3,
      employments: [{ company: 'Old Co', position: 'Analyst' }],
    },
  };
  const result = applyMasterProfile(legacy, blankDraft());
  assert.equal(result.draft.heading.firstName, 'Legacy');
  assert.equal(result.draft.experience.length, 1);
  assert.equal(result.draft.experience[0].company, 'Old Co');
  assert.equal(result.sourceRevision, 3);
});

test('default sync fills blank sections and preserves answers the candidate already gave', () => {
  const draft = blankDraft();
  draft.summary = 'My own words, written before the Master CV existed.';
  draft.heading.firstName = 'Custom';
  draft.heading.email = 'custom@example.com';
  draft.skillCategories = [{ id: 'own', category: 'Own', skills: ['SQL'] }];

  const result = applyMasterProfile(fullProfile(), draft);

  assert.equal(result.draft.summary, 'My own words, written before the Master CV existed.');
  assert.equal(result.draft.heading.firstName, 'Custom');
  assert.equal(result.draft.heading.email, 'custom@example.com');
  assert.deepEqual(result.draft.skillCategories, [{ id: 'own', category: 'Own', skills: ['SQL'] }]);
  assert.equal(result.draft.experience.length, 1, 'blank experience is filled');
  assert.ok(result.preserved.includes('Professional summary'));
  assert.ok(result.preserved.includes('Skills'));
  assert.ok(result.applied.includes('Work experience'));
  assert.equal(result.empty, false);
});

test('preserveExisting:false is the explicit replace path', () => {
  const draft = blankDraft();
  draft.summary = 'Old summary';
  draft.heading.firstName = 'Old';
  draft.experience = [{ id: 'x', company: 'Old Co', position: 'Dev' }];

  const result = applyMasterProfile(fullProfile(), draft, { preserveExisting: false });

  assert.equal(result.draft.summary, 'Platform engineer with 9 years scaling distributed systems.');
  assert.equal(result.draft.heading.firstName, 'Maya');
  assert.equal(result.draft.experience.length, 1);
  assert.equal(result.draft.experience[0].company, 'Acme Cloud');
  assert.deepEqual(result.preserved, []);
});

test('experience and education are mapped to the builder entry shape', () => {
  const result = applyMasterProfile(fullProfile(), blankDraft());
  assert.deepEqual(result.draft.experience[0], {
    id: 'w1',
    company: 'Acme Cloud',
    position: 'Staff Engineer',
    location: '',
    startDate: '2021-04',
    endDate: '',
    current: false,
    description: 'Led the control plane.',
  });
  const education = result.draft.education[0];
  assert.equal(education.institution, 'NIT Warangal');
  assert.equal(education.degree, 'B.Tech');
  assert.equal(education.field, 'Computer Science');
  assert.equal(education.gpa, '8.9');
});

test('flat profile skills are grouped into builder skill categories', () => {
  const result = applyMasterProfile(fullProfile(), blankDraft());
  assert.deepEqual(result.draft.skillCategories, [
    { id: 'master-skill-cat-0', category: 'Languages', skills: ['TypeScript', 'Go'] },
    { id: 'master-skill-cat-1', category: 'Infrastructure', skills: ['Kubernetes'] },
  ]);
});

test('certifications, projects, achievements and references bind to editor fields', () => {
  const result = applyMasterProfile(fullProfile(), blankDraft());
  assert.deepEqual(result.draft.certifications[0], {
    id: 'c1',
    name: 'CKA',
    issuer: 'CNCF',
    credentialId: 'CKA-123',
    issueDate: '2023-05',
    expiryDate: '2026-05',
    credentialUrl: 'https://credly.com/cka',
  });
  const project = result.draft.projects[0];
  assert.equal(project.title, 'MeshGate');
  assert.equal(project.githubUrl, 'https://github.com/maya/mesh');
  assert.equal(project.startDate, '2022');
  assert.equal(project.endDate, '2023');
  assert.equal(project.technologies, 'Rust, Envoy');
  assert.equal(result.draft.achievements[0].date, '2024');
  assert.deepEqual(result.draft.references[0], {
    id: 'r1',
    name: 'Ravi Kumar',
    title: 'VP Engineering',
    company: 'Acme Cloud',
    email: 'ravi@acme.example',
    phone: '+91 90000 00001',
    relationship: 'Former manager',
  });
});

test('languages use the CEFR control and never invent a proficiency', () => {
  const result = applyMasterProfile(fullProfile(), blankDraft());
  assert.deepEqual(result.draft.languages.map((l) => [l.language, l.proficiency]), [
    ['English', 'C1'],
    ['Telugu', 'Native'],
    ['Hindi', ''],
  ]);
});

test('custom sections map to sectionTitle and interests survive as a custom section', () => {
  const result = applyMasterProfile(fullProfile(), blankDraft());
  const publications = result.draft.customSections.find((s) => s.sectionTitle === 'Publications');
  assert.ok(publications, 'publications section mapped');
  assert.deepEqual(publications.items, [
    { id: 's1i1', title: 'Scaling Control Planes', description: 'ACM Queue, 2023' },
  ]);
  const interests = result.draft.customSections.find((s) => s.sectionTitle === 'Interests');
  assert.ok(interests, 'interests are not dropped');
  assert.deepEqual(interests.items.map((i) => i.title), ['Carnatic violin', 'Trail running']);
});

test('an empty Master CV reports empty, leaves the draft untouched, and never claims success', () => {
  const draft = blankDraft();
  const snapshot = JSON.parse(JSON.stringify(draft));
  const result = applyMasterProfile({ user: { uid: 'u-3', profile: { revision: 4 } } }, draft);
  assert.equal(result.empty, true);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.draft, snapshot);
  assert.equal(result.sourceRevision, 4);
  assert.match(describeMasterSync(result), /Master CV has no saved content/i);
});

test('sync on an already-complete resume reports preservation instead of a no-op success', () => {
  const draft = JSON.parse(JSON.stringify(applyMasterProfile(fullProfile(), blankDraft()).draft));
  const result = applyMasterProfile(fullProfile(), draft);
  assert.equal(result.empty, true);
  assert.deepEqual(result.applied, []);
  assert.ok(result.preserved.length > 0);
  assert.match(describeMasterSync(result), /nothing needed to be copied/i);
});

test('the success message names the sections copied and the source revision', () => {
  const result = applyMasterProfile(fullProfile(), blankDraft());
  const message = describeMasterSync(result);
  assert.match(message, /Copied /);
  assert.match(message, /Master CV revision 7/);
  assert.match(message, /Work experience/);
});

test('whitespace-only content counts as blank, but real content does not', () => {
  const draft = blankDraft();
  draft.summary = '   ';
  const result = applyMasterProfile(fullProfile(), draft);
  assert.equal(result.draft.summary.trim().length > 0, true);
  assert.equal(result.draft.summary, 'Platform engineer with 9 years scaling distributed systems.');
});

test('completeness counts only sections with real content', () => {
  const full = describeMasterCompleteness(fullProfile());
  assert.equal(full.total, 11);
  assert.equal(full.filled, 11);
  assert.equal(full.percent, 100);
  assert.deepEqual(full.missing, []);
  assert.equal(full.revision, 7);
  assert.equal(full.empty, false);

  const partial = describeMasterCompleteness({
    user: {
      profile: {
        firstname: 'Maya',
        email: 'maya@example.com',
        summary: '   ',
        skills: [{ name: 'Go', category: 'Languages' }],
      },
    },
  });
  assert.equal(partial.filled, 2, 'contact + skills only');
  assert.ok(partial.missing.includes('Professional summary'));
  assert.ok(partial.missing.includes('Work experience'));
  assert.equal(partial.percent, 18);
});

test('a fresh account is reported as empty instead of partially complete', () => {
  const empty = describeMasterCompleteness({ user: { profile: { revision: 0 } } });
  assert.equal(empty.filled, 0);
  assert.equal(empty.percent, 0);
  assert.equal(empty.empty, true);
  assert.equal(empty.total, 11);
});

test('last-updated timestamps are surfaced only when the value parses', () => {
  const dated = describeMasterCompleteness({ user: { profile: { revision: 2, updatedAt: '2026-09-01T10:00:00.000Z' } } });
  assert.equal(dated.updatedAt, '2026-09-01T10:00:00.000Z');
  const garbage = describeMasterCompleteness({ user: { profile: { revision: 2, updatedAt: 'not-a-date' } } });
  assert.equal(garbage.updatedAt, null);
});
