/**
 * DIR-008 — deep-dive fidelity for the three templates named in the directive
 * (R-06 Cv34, R-07 Cv1, R-09 Cv25).
 *
 * These are structural assertions against the SSR output of the production
 * renderer, because browser screenshots are BLOCKED in this sandbox. Each test
 * names the legacy geometry and palette it protects:
 *
 *   Cv34 — white header, 5px three-stop #6c5ce7→#0f766e→#fd79a8 rule, circular
 *          avatar with a 3px teal border, right rail with percentage meters.
 *   Cv1  — tinted 5%-primary banner, 2.5px #1e40af avatar ring (with initials
 *          fallback), 34% information rail with labelled icon rows, skill pills.
 *   Cv25 — #274472 navy header, 4px #3d6485 avatar ring, 2:1 split with a
 *          #f5f7fa rail, five-box skill scales and CEFR language dots.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

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

const { getTemplateMeta } = await vite.ssrLoadModule('/src/lib/template-catalog.ts');
const { SmartResumeDocument } = await vite.ssrLoadModule('/src/components/resume/smart-resume-document.tsx');
const layouts = await vite.ssrLoadModule('/src/lib/template-layouts.ts');

const withPhoto = {
  heading: {
    firstName: 'Asha', lastName: 'Rao', title: 'Principal Platform Engineer',
    email: 'asha@example.com', phone: '+91 90000 00000', location: 'Vijayawada, India',
    linkedin: 'linkedin.com/in/asharao', github: 'github.com/asharao', website: 'asharao.dev',
    photo: 'https://images.example.com/asha.jpg', showPhoto: true,
  },
  summary: '<p>Platform engineer focused on reliability.</p>',
  experience: [{ id: 'e1', position: 'Staff Engineer', company: 'Meridian Bank', startDate: '2021', endDate: '', current: true, description: '<p>Led the ledger rebuild.</p>' }],
  education: [{ id: 'ed1', degree: 'B.Tech', field: 'Computer Science', institution: 'IIT Madras', startDate: '2011', endDate: '2015' }],
  skillCategories: [
    { id: 'c1', category: 'Platform', skills: [{ name: 'Kubernetes', rating: 92 }, { name: 'Go', rating: 85 }] },
    { id: 'c2', category: 'Data', skills: ['PostgreSQL', { name: 'Kafka', rating: 70 }] },
  ],
  languages: [
    { id: 'l1', language: 'English', proficiency: 'C1' },
    { id: 'l2', language: 'Telugu', proficiency: 'Native' },
    { id: 'l3', language: 'Hindi', proficiency: '' },
  ],
  certifications: [{ id: 'c', name: 'CKA', issuer: 'CNCF', issueDate: '2022' }],
  projects: [{ id: 'p1', title: 'MeshGate', description: 'Edge gateway.' }],
  achievements: [{ id: 'a1', title: 'Cloud Guild lead', description: 'Grew to 40 engineers.' }],
  references: [{ id: 'r1', name: 'Priya Nair', title: 'VP Engineering' }],
  customSections: [],
};

const withoutPhoto = {
  ...withPhoto,
  heading: { ...withPhoto.heading, photo: '', showPhoto: false },
};

function render(id, resume = withPhoto) {
  return renderToStaticMarkup(React.createElement(SmartResumeDocument, { resume, meta: getTemplateMeta(id) }));
}

test('catalog palettes for the deep dives match their legacy stylesheets', () => {
  const cv1 = getTemplateMeta('Cv1');
  assert.equal(cv1.primary, '#1e40af', 'Cv1 lost the legacy #1e40af avatar/section accent');
  assert.equal(cv1.secondary, '#475569', 'Cv1 lost the legacy slate secondary');

  const cv25 = getTemplateMeta('Cv25');
  assert.equal(cv25.primary, '#274472', 'Cv25 lost the legacy navy header');
  assert.equal(cv25.secondary, '#3d6485', 'Cv25 lost the legacy steel-blue accent');

  const cv34 = getTemplateMeta('Cv34');
  assert.equal(cv34.primary, '#6c5ce7', 'Cv34 lost the legacy purple name colour');
  assert.equal(cv34.secondary, '#0f766e', 'Cv34 lost the legacy teal rule/ring colour');
  assert.equal(cv34.accent, '#fd79a8', 'Cv34 lost the legacy pink gradient stop');

  // No two deep dives may share an identity palette.
  const pairs = [['Cv1', 'Cv25'], ['Cv1', 'Cv34'], ['Cv25', 'Cv34']];
  for (const [a, b] of pairs) {
    assert.notDeepEqual(
      [getTemplateMeta(a).primary, getTemplateMeta(a).secondary],
      [getTemplateMeta(b).primary, getTemplateMeta(b).secondary],
      `${a} and ${b} share an identity palette`
    );
  }
});

test('Cv34 renders the legacy white header, three-stop rule and teal-bordered avatar', () => {
  const html = render('Cv34');
  const meta = getTemplateMeta('Cv34');

  assert.match(html, /data-cv34-header="white"/);
  assert.match(html, /data-cv34-gradient="triple"/);
  const gradient = html.match(/linear-gradient\(to right, ([^)]+)\)/)?.[1] || '';
  const stops = gradient.split(',').map((stop) => stop.trim());
  assert.equal(stops.length, 3, `expected exactly three stops, got "${gradient}"`);
  assert.deepEqual(stops, [meta.primary, meta.secondary, meta.accent], 'gradient stops drifted from the legacy palette');

  assert.match(html, /border:3px solid #0f766e/i, 'avatar has no 3px legacy teal border');
  assert.match(html, /rounded-full/, 'avatar is not circular');
  assert.match(html, /data-layout-rail="cv34"/);
  assert.doesNotMatch(html, /Edition<\/span>/, 'the invented "Edition" badge is still rendered');
});

test('Cv34 skill meters show honest percentages and never fabricate ratings', () => {
  const html = render('Cv34');
  assert.match(html, /data-cv34-skills="percent-bars"/);
  assert.match(html, /Kubernetes/);
  assert.match(html, />92%</);
  assert.match(html, /width:92%/);
  assert.match(html, />85%</);
  assert.match(html, /PostgreSQL/);
  assert.doesNotMatch(html, /PostgreSQL[\s\S]{0,120}>0%</, 'a string skill was assigned a fabricated rating');
});

test('Cv1 keeps the legacy tinted card banner and labelled information rail', () => {
  const html = render('Cv1');
  assert.match(html, /data-cv1-layout="legacy-card"/);
  assert.match(html, /background-color:#1e40af0d/i, 'banner is not the legacy 5% primary tint');
  assert.match(html, /border-color:#1e40af33/i, 'banner is missing the 20% primary hairline');
  assert.match(html, /border:2\.5px solid #1e40af/i, 'avatar ring is not the legacy 2.5px #1e40af');
  assert.match(html, /data-layout-rail="cv1"/);
  assert.match(html, /Information/);
  assert.match(html, /Phone/);
  assert.match(html, /LinkedIn/);
  assert.match(html, /border-radius:9999px|rounded-full/, 'skill pills lost their pill radius');
  assert.doesNotMatch(html, /bg-slate-900/, 'Cv1 is still rendered as the invented dark rail');
});

test('Cv1 falls back to initials instead of a broken image', () => {
  const html = render('Cv1', withoutPhoto);
  assert.doesNotMatch(html, /<img[^>]+asha/i, 'a photo was rendered although showPhoto=false');
  assert.match(html, /AR/, 'initials fallback missing');
});

test('Cv25 restores the legacy navy header, steel-blue ring and box/dot scales', () => {
  const html = render('Cv25');
  assert.match(html, /data-cv25-structure="navy-header-main-rail"/);
  assert.match(html, /background-color:#274472/i, 'Cv25 header is not the legacy navy band');
  assert.match(html, /border:4px solid #3d6485/i, 'Cv25 avatar lost its 4px steel-blue frame');
  assert.match(html, /data-layout-rail="cv25"/);
  assert.match(html, /background-color:#f5f7fa/i, 'Cv25 rail is not the legacy #f5f7fa panel');

  // Five skill boxes per rated skill, five language dots per CEFR level.
  assert.ok((html.match(/h-1\.5 w-3 rounded-\[1px\]/g) || []).length >= 10, 'skill box scales missing');
  assert.ok((html.match(/size-1\.5 rounded-full/g) || []).length >= 10, 'language dots missing');
  assert.match(html, /aria-label="Kubernetes: 5 of 5"/);
  assert.match(html, /aria-label="English: C1"/);
  assert.match(html, /aria-label="Telugu: NATIVE"/);
  assert.doesNotMatch(html, /aria-label="Hindi: /, 'a language without proficiency invented a scale');
});

test('the three deep-dive templates remain structurally distinct', () => {
  const pairs = [['Cv1', 'Cv25'], ['Cv1', 'Cv34'], ['Cv25', 'Cv34']];
  for (const [a, b] of pairs) {
    assert.ok(layouts.layoutDistance(layouts.getLayoutSpec(a), layouts.getLayoutSpec(b)) >= 4, `${a} and ${b} are too similar`);
  }
});
