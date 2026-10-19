/**
 * DIR-008 — realistic fixtures and optional-field robustness (R-10, R-11, R-43, R-44).
 *
 * The layout suite already proves that 100 templates render base/long/empty
 * resumes. This suite attacks the fields people actually mistype or omit:
 * a 70-character name with no spaces, mixed scripts (Devanagari, CJK, Arabic),
 * emoji, long unbroken URLs, null strings, and every optional section missing
 * in turn. A resume must still render — without clipping, literal markup or
 * `undefined` — or the renderer must fail visibly rather than silently shrink.
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

const FRONTEND = path.join(process.cwd(), 'frontend');
const vite = await createServer({ root: FRONTEND, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
after(async () => { await vite.close(); });

const { TEMPLATES, getTemplateMeta } = await vite.ssrLoadModule('/src/lib/template-catalog.ts');
const { SmartResumeDocument } = await vite.ssrLoadModule('/src/components/resume/smart-resume-document.tsx');
const { normalizeResumeToDocument } = await vite.ssrLoadModule('/src/lib/resume-view-model.ts');

const CV_IDS = TEMPLATES.map((entry) => entry.id);

const realistic = {
  heading: {
    firstName: 'Venkata Subrahmanya Bhaskara Suryanarayana',
    lastName: 'Ravipudi-Chowdary-Naidu',
    title: 'Principal Platform & Site Reliability Engineer',
    email: 'venkata.subrahmanya.ravipudi.chowdary@very-long-corporate-domain.example.com',
    phone: '+91 90000 00000',
    location: 'Vijayawada, Andhra Pradesh, India',
    linkedin: 'linkedin.com/in/venkata-subrahmanya-ravipudi-chowdary-naidu-2026',
    github: 'github.com/venkata-subrahmanya-ravipudi',
    website: 'https://venkata-subrahmanya-ravipudi-chowdary.engineering.example.com/portfolio',
    photo: '', showPhoto: false,
  },
  summary: '<p>బహుభాషా engineer with <strong>9 years</strong> building 分散系统 and reliable platforms — 信頼性, موثوقية, 🚀.</p>',
  experience: [{
    id: 'e1',
    position: 'Staff Platform Engineer & Reliability Lead',
    company: 'Meridian Financial Technologies International',
    location: 'Hyderabad / Remote',
    startDate: '2021-04',
    endDate: '',
    current: true,
    description: '<p>Led a 40-person migration to a zero-trust mesh, cutting p99 latency by 63% while sustaining 99.99% availability across 14 regions; mentored 11 engineers, established the reliability review guild, and authored the incident-response programme that reduced MTTR from 48 minutes to 9 minutes.</p>',
  }],
  education: [{
    id: 'ed1', degree: 'B.Tech', field: 'Computer Science and Engineering', institution: 'National Institute of Technology, Warangal',
    startDate: '2011', endDate: '2015', gpa: '8.9',
  }],
  skillCategories: [{
    id: 'c1', category: 'Platform & Reliability',
    skills: ['Kubernetes', 'Istio', 'Terraform', 'Go', 'TypeScript', 'PostgreSQL', 'Kafka', 'OpenTelemetry', 'Prometheus', 'Grafana', 'ArgoCD', 'Crossplane'],
  }],
  certifications: [{ id: 'c', name: 'Certified Kubernetes Administrator', issuer: 'CNCF', issueDate: '2023-05' }],
  languages: [{ id: 'l1', language: 'English', proficiency: 'C1' }, { id: 'l2', language: 'తెలుగు', proficiency: 'Native' }],
  projects: [{ id: 'p1', title: 'MeshGate', description: 'Edge gateway with mTLS.', technologies: 'Rust, Envoy' }],
  achievements: [{ id: 'a1', title: 'Cloud Guild lead', description: 'Grew the guild to 40 engineers.' }],
  hobbies: ['Carnatic violin'],
  references: [{ id: 'r1', name: 'Priya Nair', title: 'VP Engineering', company: 'Meridian' }],
};

function render(id, resume) {
  const meta = getTemplateMeta(id);
  return renderToStaticMarkup(React.createElement(SmartResumeDocument, { resume: normalizeResumeToDocument(resume), meta }));
}

test('a realistic multilingual fixture renders in every template without clipping markers', { timeout: 180_000 }, () => {
  const failures = [];
  for (const id of CV_IDS) {
    try {
      const html = render(id, realistic);
      assert.ok(html.includes('smart-resume-page'), `${id}: no A4 sheet`);
      assert.doesNotMatch(html, />\s*(?:undefined|NaN|null)\s*</, `${id}: invalid value rendered`);
      assert.doesNotMatch(html, /\[object Object\]/, `${id}: object coerced into text`);
      assert.doesNotMatch(html, /Unsupported template layout/, `${id}: fell back`);
      assert.doesNotMatch(html, /&lt;p class="editor-paragraph"/, `${id}: raw markup leaked as text`);
      assert.doesNotMatch(html, /<script/i, `${id}: script tag survived sanitisation`);
      assert.ok(html.includes('Ravipudi-Chowdary-Naidu'), `${id}: lost the candidate name`);
      assert.ok(html.includes('తెలుగు'), `${id}: lost multilingual content`);
    } catch (error) {
      failures.push(`${id}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('long unbroken identities wrap instead of relying on overflow clipping', async () => {
  const html = render('Cv1', realistic);
  assert.match(html, /break-words/, 'identity text is not word-breaking');
  const css = (await import('node:fs')).readFileSync(path.join(FRONTEND, 'src/index.css'), 'utf8');
  const sheetRule = css.slice(css.indexOf('.smart-resume-page h1'));
  assert.match(sheetRule.slice(0, 600), /overflow-wrap:\s*anywhere/, 'the sheet has no long-token wrapping rule');
  assert.match(html, /whitespace-nowrap/, 'date tokens must opt out of wrapping');
  assert.match(html, /2021-04 – Present/, 'a current role must render its date range');
});

test('every optional section can be missing in turn without breaking a render', { timeout: 180_000 }, () => {
  const optional = ['summary', 'experience', 'education', 'skillCategories', 'certifications', 'languages', 'projects', 'achievements', 'hobbies', 'references'];
  const failures = [];
  for (const section of optional) {
    for (const variant of [undefined, null, '', [], '   ']) {
      const resume = { ...realistic, [section]: variant };
      for (const id of ['Cv1', 'Cv4', 'Cv34', 'Cv75', 'Cv100']) {
        try {
          const html = render(id, resume);
          assert.doesNotMatch(html, />\s*(?:undefined|NaN)\s*</, `${id}/${section}=${JSON.stringify(variant)}: invalid value`);
        } catch (error) {
          failures.push(`${id}/${section}=${JSON.stringify(variant)}: ${error.message}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('a resume with only a name still renders in all 100 templates', { timeout: 180_000 }, () => {
  const minimal = { heading: { firstName: 'Asha' } };
  const failures = [];
  for (const id of CV_IDS) {
    try {
      const html = render(id, minimal);
      assert.ok(html.includes('Asha'), `${id}: lost the only field`);
      assert.doesNotMatch(html, />\s*(?:undefined|NaN)\s*</, `${id}: invalid value`);
    } catch (error) {
      failures.push(`${id}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('untrusted rich text is neutralised before it reaches the document', () => {
  const hostile = {
    ...realistic,
    summary: '<p>Engineer</p><script>alert(1)</script><img src=x onerror="alert(2)">',
    experience: [{ ...realistic.experience[0], description: '<p onclick="x()">Led</p><iframe src="https://evil.example"></iframe>' }],
  };
  const html = render('Cv34', hostile);
  assert.doesNotMatch(html, /<script|onerror|onclick|<iframe|<img/i);
  assert.match(html, /Led/);
});
