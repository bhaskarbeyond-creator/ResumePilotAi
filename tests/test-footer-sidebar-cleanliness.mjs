import test from 'node:test';
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

const { TEMPLATES, getTemplateMeta } = await vite.ssrLoadModule('/src/lib/template-catalog.ts');
const { SmartResumeDocument } = await vite.ssrLoadModule('/src/components/resume/smart-resume-document.tsx');

const sampleResume = {
  heading: {
    firstName: 'Bhaskar',
    lastName: 'Beyond',
    title: 'Senior Software Engineer',
    email: 'bhaskar@example.com',
    phone: '+1 555-0199',
    location: 'San Francisco, CA',
  },
  summary: '<p>Experienced software architect and engineer.</p>',
  experience: [
    {
      id: 'exp1',
      position: 'Staff Engineer',
      company: 'TechCorp',
      startDate: '2020',
      endDate: '2024',
      current: false,
      description: '<p>Built scalable distributed systems.</p>',
    },
  ],
  education: [
    {
      id: 'edu1',
      degree: 'B.S. Computer Science',
      institution: 'University of Engineering',
      startDate: '2016',
      endDate: '2020',
    },
  ],
  skillCategories: [
    {
      id: 'cat1',
      category: 'Core',
      skills: [{ name: 'React', rating: 90 }, { name: 'Node.js', rating: 85 }],
    },
  ],
  languages: [{ id: 'lang1', language: 'English', proficiency: 'Native' }],
  certifications: [{ id: 'cert1', name: 'AWS Certified Solutions Architect' }],
};

test('ALL templates are 100% free of internal template names, IDs, versions, and "Verified ATS" in sidebar & footer', async (t) => {
  for (const tmpl of TEMPLATES) {
    const meta = getTemplateMeta(tmpl.id);
    const html = renderToStaticMarkup(React.createElement(SmartResumeDocument, { resume: sampleResume, meta }));

    // 1. Must never contain 'Verified ATS'
    assert.doesNotMatch(
      html,
      /Verified\s*ATS/i,
      `Template ${tmpl.id} contains 'Verified ATS'`
    );

    // 2. Must never contain the template name (e.g. "Nordic Slate") in footer or sidebars
    assert.doesNotMatch(
      html,
      new RegExp(`(?:page-footer|MasterSidebar|AsideRail)[^>]*>[\\s\\S]*?${meta.name}`, 'i'),
      `Template ${tmpl.id} contains template name '${meta.name}' in footer or sidebar`
    );

    // 3. Must never contain parenthetical template id like "(Cv2)" in page footer
    assert.doesNotMatch(
      html,
      new RegExp(`\\(${meta.id}\\)`, 'i'),
      `Template ${tmpl.id} contains parenthetical ID '(${meta.id})' in document`
    );

    // 4. Must never contain version/edition badges like ":: v1.0" or "edition" in headers/bars
    assert.doesNotMatch(
      html,
      /::\s*v1\.0/i,
      `Template ${tmpl.id} contains version string ':: v1.0'`
    );

    assert.doesNotMatch(
      html,
      /edition<\/div>/i,
      `Template ${tmpl.id} contains 'edition' badge`
    );

    assert.doesNotMatch(
      html,
      /·\s*Fintech<\/div>/i,
      `Template ${tmpl.id} contains '· Fintech' tag`
    );
  }
  await vite.close();
});
