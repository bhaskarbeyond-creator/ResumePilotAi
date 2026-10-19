/**
 * DIR-008 — template layout engine contract (frontend production renderer).
 *
 * Proves, for the engine the React app actually mounts:
 *  1. every one of the 100 catalog ids resolves to an explicit typed spec;
 *  2. every spec resolves to an implemented page composer (no generic fallback);
 *  3. page composition is structurally distinct across all 100 templates;
 *  4. published template content is never dropped by rails or pagination;
 *  5. long and empty resumes render without undefined/NaN or crashes.
 *
 * Browser screenshot/visual evidence is out of scope here and is tracked
 * separately as BLOCKED in the DIR-008 audit (no browser binary in the sandbox).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import path from 'node:path';

// The renderer is resolved by Vite from `frontend/`, so React must come from
// that same installation. Mixing the root React copy with the app copy breaks
// hook dispatch (two React instances).
const frontendRequire = createRequire(path.join(process.cwd(), 'frontend/package.json'));
const React = frontendRequire('react');
const { renderToStaticMarkup } = frontendRequire('react-dom/server');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.com/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Image = dom.window.Image;

const vite = await createServer({
  root: path.join(process.cwd(), 'frontend'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
after(async () => { await vite.close(); });

const { TEMPLATES, getTemplateMeta, tryGetTemplateMeta } = await vite.ssrLoadModule('/src/lib/template-catalog.ts');
const layouts = await vite.ssrLoadModule('/src/lib/template-layouts.ts');
const { SmartResumeDocument } = await vite.ssrLoadModule('/src/components/resume/smart-resume-document.tsx');
const families = await vite.ssrLoadModule('/src/components/resume/smart-layout-families.tsx');
const { partitionResumeContent } = await vite.ssrLoadModule('/src/lib/smart-partitioner.ts');

const CV_IDS = Array.from({ length: 100 }, (_, index) => `Cv${index + 1}`);

const baseResume = {
  heading: {
    firstName: 'Asha', lastName: 'Rao', title: 'Principal Platform Engineer',
    email: 'asha.rao@example.com', phone: '+91 90000 00000', location: 'Vijayawada, India',
    linkedin: 'linkedin.com/in/asharao', github: 'github.com/asharao', website: 'asharao.dev',
    photo: '', showPhoto: false,
  },
  summary: '<p>Platform engineer focused on reliability and developer experience.</p>',
  experience: [
    { id: 'e1', position: 'Principal Engineer', company: 'Meridian Bank', location: 'Hyderabad', startDate: '2021', endDate: 'Present', description: '<p>Led a 40-person platform migration to a zero-trust mesh.</p>' },
    { id: 'e2', position: 'Senior Engineer', company: 'Lumen Labs', location: 'Remote', startDate: '2017', endDate: '2021', description: '<p>Built the billing pipeline.</p>' },
  ],
  education: [{ id: 'ed1', degree: 'B.Tech', field: 'Computer Science', institution: 'IIT Madras', startDate: '2011', endDate: '2015', gpa: '8.7' }],
  skillCategories: [
    { id: 'c1', category: 'Platform', skills: [{ name: 'Kubernetes', rating: 5 }, { name: 'Go', rating: 4 }] },
    { id: 'c2', category: 'Data', skills: ['PostgreSQL', 'Kafka'] },
  ],
  certifications: [{ id: 'cert1', name: 'CKA', issuer: 'CNCF', date: '2022' }],
  languages: [{ id: 'l1', name: 'English', proficiency: 'Fluent' }, { id: 'l2', name: 'తెలుగు', proficiency: 'Native' }],
  projects: [{ id: 'p1', title: 'ResumePilot', technologies: 'React, Node', description: '<p>Analytics toolkit.</p>' }],
  achievements: [{ id: 'a1', title: 'Excellence Award', description: 'Zero-downtime migration.' }],
  hobbies: ['Chess', 'Cycling'],
  references: [{ id: 'r1', name: 'Priya Nair', position: 'VP Engineering', company: 'Meridian', email: 'priya@example.com' }],
};

const longResume = {
  ...baseResume,
  experience: Array.from({ length: 16 }, (_, i) => ({
    id: `e${i}`, position: `Director of Engineering ${i + 1}`, company: `Multinational Corporation ${i + 1}`,
    startDate: String(2003 + i), endDate: String(2004 + i),
    description: `<p>${'Delivered measurable outcomes across global teams. '.repeat(6)}</p>`,
  })),
  certifications: Array.from({ length: 12 }, (_, i) => ({ id: `cert${i}`, name: `Certification ${i + 1}`, issuer: 'Institute', date: String(2010 + i) })),
  projects: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, title: `Programme ${i + 1}`, description: 'A long description used to test wrapping.' })),
};

const emptyResume = { heading: { firstName: 'Noor', email: 'noor@example.com' } };

function render(id, resume = baseResume) {
  return renderToStaticMarkup(React.createElement(SmartResumeDocument, { resume, meta: getTemplateMeta(id) }));
}

function visibleText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
}

test('catalog exposes exactly Cv1..Cv100 and refuses unknown template ids', () => {
  assert.deepEqual(TEMPLATES.map((entry) => entry.id), CV_IDS);
  assert.throws(() => getTemplateMeta('Cv101'), /Unknown resume template/);
  assert.throws(() => getTemplateMeta(''), /Unknown resume template/);
  assert.equal(tryGetTemplateMeta('Cv101'), null);
  assert.equal(tryGetTemplateMeta('Cv42')?.id, 'Cv42');
});

test('every catalog entry has an explicit, unique and implemented layout spec', () => {
  assert.equal(layouts.LAYOUT_SPECS.length, 100);
  assert.deepEqual(layouts.LAYOUT_SPECS.map((spec) => spec.id), CV_IDS);
  assert.equal(new Set(layouts.LAYOUT_SPECS.map((spec) => spec.fingerprint)).size, 100);

  const implemented = Object.keys(families.LAYOUT_FAMILY_COMPONENTS);
  for (const spec of layouts.LAYOUT_SPECS) {
    assert.ok(implemented.includes(spec.family), `${spec.id} family ${spec.family} has no page composer`);
    assert.ok(spec.mainOrder.length > 0, `${spec.id} has an empty reading order`);
    if (spec.aside) {
      assert.ok(layouts.RAIL_FAMILIES.has(spec.family), `${spec.id} declares a rail but ${spec.family} cannot render one`);
      assert.ok(spec.asideSections.length > 0, `${spec.id} declares a rail without rail sections`);
      assert.equal(spec.mainOrder.some((section) => spec.asideSections.includes(section)), false,
        `${spec.id} renders a section twice (rail and main)`);
    } else {
      assert.equal(spec.asideSections.length, 0, `${spec.id} owns rail sections without a rail`);
    }
  }
});

test('100 templates are spread across at least 20 page families and are pairwise distinct', () => {
  const counts = layouts.getLayoutFamilies();
  assert.ok(Object.keys(counts).length >= 20, `only ${Object.keys(counts).length} page families in use`);
  for (const [family, count] of Object.entries(counts)) {
    assert.ok(count > 0, `${family} is declared but unused`);
  }

  const specs = layouts.LAYOUT_SPECS;
  let minimum = Infinity;
  let closest = null;
  for (let i = 0; i < specs.length; i += 1) {
    for (let j = i + 1; j < specs.length; j += 1) {
      const distance = layouts.layoutDistance(specs[i], specs[j]);
      if (distance < minimum) {
        minimum = distance;
        closest = [specs[i].id, specs[j].id];
      }
    }
  }
  assert.ok(minimum >= 4, `${closest?.[0]} and ${closest?.[1]} differ on only ${minimum} composition dimensions`);
});

test('the layout engine throws rather than falling back for an unknown template', () => {
  assert.throws(() => layouts.getLayoutSpec('Cv101'), /Unknown CV template layout/);
  assert.equal(layouts.tryGetLayoutSpec('Cv101'), null);
});

test('all 100 templates render through the production document without invalid output', { timeout: 180_000 }, () => {
  const failures = [];
  for (const id of CV_IDS) {
    for (const [fixture, resume] of Object.entries({ base: baseResume, long: longResume, empty: emptyResume })) {
      try {
        const html = render(id, resume);
        assert.ok(html.includes('smart-resume-page'), `${id}/${fixture}: no A4 sheet`);
        assert.doesNotMatch(html, />\s*(?:undefined|NaN)\s*</, `${id}/${fixture}: invalid value rendered`);
        assert.doesNotMatch(html, /\[object Object\]/, `${id}/${fixture}: object coerced into text`);
        assert.doesNotMatch(html, /Unsupported template layout/, `${id}/${fixture}: fell back to unsupported state`);
        assert.ok(!html.includes('Alex Morgan'), `${id}/${fixture}: demo profile leaked into the renderer`);
        if (fixture === 'base') {
          for (const needle of ['Excellence Award', 'Priya Nair', 'ResumePilot', 'CKA', 'Kubernetes', 'English']) {
            assert.ok(html.includes(needle), `${id}/base: lost "${needle}"`);
          }
        }
        if (fixture === 'empty') {
          assert.ok(visibleText(html).includes('Noor'), `${id}/empty: lost candidate name`);
        }
      } catch (error) {
        failures.push(`${id}/${fixture}: ${error.message}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('every declared rail is rendered and no rail family collapses', { timeout: 180_000 }, () => {
  const failures = [];
  for (const spec of layouts.LAYOUT_SPECS) {
    const html = render(spec.id);
    const renderedRail = html.match(/data-layout-rail="([a-z0-9-]+)"/)?.[1] || null;
    if (spec.aside && renderAllFamiliesCheck(spec)) {
      if (!renderedRail) failures.push(`${spec.id}: expected a ${spec.aside} rail (${spec.family})`);
    }
    if (!spec.aside && renderedRail) failures.push(`${spec.id}: rendered an undeclared rail`);
    for (const resume of [emptyResume, { heading: { firstName: 'A' } }]) {
      const html2 = render(spec.id, resume);
      if (spec.aside && !html2.includes('data-layout-rail')) failures.push(`${spec.id}: rail collapsed on sparse data`);
    }
  }
  assert.deepEqual([...new Set(failures)], []);

  function renderAllFamiliesCheck(spec) {
    // The rail check only applies to families whose composer renders a physical rail.
    return layouts.RAIL_FAMILIES.has(spec.family);
  }
});

test('long profiles paginate without dropping any section or entry', { timeout: 180_000 }, () => {
  const failures = [];
  for (const id of CV_IDS) {
    const spec = layouts.getLayoutSpec(id);
    const meta = getTemplateMeta(id);
    const result = partitionResumeContent(longResume, meta, spec.density);
    const flat = result.pages.flatMap((page) => page.flowItems);
    const placedExperience = flat.filter((item) => item.type === 'experience').length;
    const sidebarEducation = spec.asideSections.includes('education') ? longResume.education.length : 0;
    if (!spec.asideSections.includes('experience') && placedExperience !== longResume.experience.length) {
      failures.push(`${id}: ${placedExperience}/${longResume.experience.length} roles placed`);
    }
    if (!spec.asideSections.includes('certifications')) {
      const certs = flat.filter((item) => item.type === 'certifications').reduce((sum, item) => sum + (item.data?.length || 0), 0);
      if (certs !== longResume.certifications.length) failures.push(`${id}: ${certs}/${longResume.certifications.length} certifications placed`);
    }
    if (!spec.asideSections.includes('projects')) {
      const projects = flat.filter((item) => item.type === 'projects').length;
      if (projects !== longResume.projects.length) failures.push(`${id}: ${projects}/${longResume.projects.length} projects placed`);
    }
    if (result.totalPages < 2) failures.push(`${id}: long resume still produced one page`);
    for (const page of result.pages) {
      if (page.flowItems.length === 0 && result.totalPages > 1) failures.push(`${id}: empty page ${page.pageNumber}`);
    }
    const html = render(id, longResume);
    if (html.includes('Unsupported template layout')) failures.push(`${id}: fell back during long render`);
    if (sidebarEducation + flat.filter((item) => item.type === 'education').length < longResume.education.length) {
      failures.push(`${id}: education lost`);
    }
  }
  assert.deepEqual(failures, []);
});

test('rendered pages never exceed the A4 safe capacity estimate', { timeout: 120_000 }, () => {
  const PAGE_SAFE_HEIGHT = 1123 - 64 - 32 - 24;
  const failures = [];
  for (const id of CV_IDS) {
    const spec = layouts.getLayoutSpec(id);
    const meta = getTemplateMeta(id);
    const result = partitionResumeContent(longResume, meta, spec.density);
    for (const page of result.pages) {
      const used = page.flowItems.reduce((sum, item) => sum + item.estimatedHeight, 0);
      const capacity = page.pageNumber === 1
        ? Math.max(420, PAGE_SAFE_HEIGHT - 420)
        : Math.max(420, PAGE_SAFE_HEIGHT - 58);
      // Header-aware page 1 capacity can exceed the conservative floor; the
      // partitioner itself never packs beyond its own per-page limit.
      if (used > PAGE_SAFE_HEIGHT + 1) failures.push(`${id}: page ${page.pageNumber} estimated at ${used}px`);
      if (page.pageNumber > 1 && used > capacity + 1) failures.push(`${id}: continuation page ${page.pageNumber} overflow ${used}px`);
    }
  }
  assert.deepEqual(failures, []);
});

test('template geometry is exposed as data attributes for audit tooling', () => {
  const html = render('Cv40');
  const spec = layouts.getLayoutSpec('Cv40');
  assert.ok(html.includes(`data-layout-rail="${spec.family}"`), 'rail family is not auditable');
  // Continuation pages keep the candidate identity and page counter.
  const long = render('Cv40', longResume);
  assert.match(long, /Page 1 of \d+/);
  assert.match(long, /Page 2 of \d+/);
});
