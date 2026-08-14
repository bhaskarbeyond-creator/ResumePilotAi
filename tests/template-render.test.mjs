import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { normalizeTemplateData } from '../src/cv-templates/templateUtils.js';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://app.example.com/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Image = dom.window.Image;

const minimal = { firstname: 'Asha', lastname: 'Rao', template: 'Cv1' };
const complete = {
  firstname: 'Bhaskar', lastname: 'రావు', occupation: 'Senior Platform Engineer',
  email: 'candidate@example.com', phone: '+91 98765 43210', city: 'Vijayawada', country: 'India', postalcode: '520001',
  website: 'https://example.com/a/very/long/profile/path', linkedin: 'https://linkedin.com/in/candidate', github: 'https://github.com/candidate',
  summary: '<p>Platform engineer building reliable, accessible and secure systems.</p>',
  employments: Array.from({ length: 4 }, (_, index) => ({ jobTitle: `Engineer ${index}`, employer: `Company ${index}`, begin: '2020', end: '2024', description: '<p>Delivered measurable improvements.</p>' })),
  educations: [{ school: 'University', degree: 'Master of Technology', started: '2014', finished: '2018', description: '<p>Computer Science</p>' }],
  skills: Array.from({ length: 12 }, (_, index) => ({ name: `Skill ${index}`, rating: 50 + index })),
  languages: [{ name: 'English', level: 'Fluent' }, { name: 'తెలుగు', level: 'Native' }],
  projects: [{ title: 'ResumePilot', description: 'Unicode ✓ and special characters & < >', url: 'https://example.com/project' }],
  components: [{ type: 'Paragraph', content: 'Dear Hiring Manager,' }, { type: 'List', name: 'Strengths', content: ['Reliable', 'Accessible'] }],
};
const large = {
  ...complete,
  firstname: 'A'.repeat(120),
  summary: `<p>${'Long multilingual summary अनुभव '.repeat(220)}</p>`,
  employments: Array.from({ length: 24 }, (_, index) => ({ jobTitle: `Role ${index} ${'X'.repeat(40)}`, employer: `Organization ${index}`, begin: `${2000 + index}`, end: 'Present', description: `<p>${'Detailed outcome. '.repeat(30)}</p>` })),
  educations: Array.from({ length: 8 }, (_, index) => ({ school: `University ${index}`, degree: `Degree ${index}`, started: '2010', finished: '2014' })),
  skills: Array.from({ length: 70 }, (_, index) => ({ skillName: `Capability ${index}`, rating: index % 101 })),
  languages: Array.from({ length: 12 }, (_, index) => ({ language: `Language ${index}`, proficiency: 'Professional' })),
};
const missingOptional = { firstname: 'Noor', email: 'noor@example.com', employments: [], educations: null, skills: undefined, languages: [] };
const fixtures = { minimal, complete, large, missingOptional };

test('every CV and cover template server-renders representative data without invalid output', { timeout: 120_000 }, async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const failures = [];
  const reactWarnings = [];
  const originalConsoleError = console.error;
  console.error = (...args) => reactWarnings.push(args.map(String).join(' '));
  let renderCount = 0;
  try {
    for (let number = 1; number <= 55; number += 1) {
      const isCover = number > 51;
      const templateNumber = isCover ? number - 51 : number;
      const id = `${isCover ? 'Cover' : 'Cv'}${templateNumber}`;
      const modulePath = isCover
        ? `/src/cv-templates/cover${templateNumber}/Cover${templateNumber}.jsx`
        : `/src/cv-templates/cv${templateNumber}/Cv${templateNumber}.jsx`;
      try {
        const module = await vite.ssrLoadModule(modulePath);
        const Component = module.default;
        for (const [fixtureName, fixture] of Object.entries(fixtures)) {
          try {
            const values = normalizeTemplateData({ ...fixture, template: id });
            const markup = renderToStaticMarkup(React.createElement(Component, { values, language: fixtureName === 'large' ? 'hi' : 'en' }));
            assert.ok(markup.length > 20, `${id}/${fixtureName} returned empty markup`);
            assert.doesNotMatch(markup, />\s*(?:undefined|NaN)\s*</, `${id}/${fixtureName} rendered invalid values`);
            renderCount += 1;
          } catch (error) {
            failures.push(`${id}/${fixtureName}: ${error.message}`);
          }
        }
      } catch (error) {
        failures.push(`${id}/module: ${error.message}`);
      }
    }
  } finally {
    console.error = originalConsoleError;
    await vite.close();
  }
  assert.equal(renderCount, 55 * Object.keys(fixtures).length);
  assert.deepEqual(failures, []);
  assert.deepEqual(reactWarnings, [], `templates emitted React warnings:\n${reactWarnings.join('\n')}`);
});
