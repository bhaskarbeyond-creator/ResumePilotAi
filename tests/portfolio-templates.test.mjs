import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import {
  PORTFOLIO_TEMPLATE_IDS,
  convertResumeToPortfolio,
  createRichPortfolioFixture,
} from '../src/utils/portfolioData.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.com/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { default: WebCvRenderer } = await vite.ssrLoadModule('/src/components/PortfolioTemplates/WebCvRenderer.jsx');

after(async () => {
  await vite.close();
});

function markupFor(template, canonical) {
  return renderToStaticMarkup(React.createElement(WebCvRenderer, { canonical, templateKey: template }));
}

test('all four templates render the same master data without silent omissions', () => {
  const fixture = createRichPortfolioFixture();
  const needles = [
    'Priya Raman',
    'Principal Software Engineer',
    'priya.raman@example.com',
    'Northwind Labs',
    'Stanford University',
    'TypeScript',
    'Atlas Inference Mesh',
    'Certified Kubernetes Administrator',
    'Engineering Excellence Award',
    'Elena Voss',
    'Tamil',
    'Trail running',
    'Selected Advising',
    'Civic Tech Guild',
  ];
  for (const template of PORTFOLIO_TEMPLATE_IDS) {
    const html = markupFor(template, fixture);
    assert.match(html, new RegExp(`data-webcv-template="${template}"`));
    for (const needle of needles) {
      assert.match(html, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${template} missing ${needle}`);
    }
    assert.doesNotMatch(html, /Alex Cyber|Sofia Martinez|dev@terminal|lorem ipsum/i);
  }
});

test('empty sections are omitted and empty portfolios do not crash', () => {
  const html = markupFor('modernMinimal', convertResumeToPortfolio({ firstname: 'Only', lastname: 'Name', summary: 'Just a summary.' }));
  assert.match(html, /Only Name/);
  assert.match(html, /Just a summary/);
  assert.doesNotMatch(html, /id="experience"/);
  assert.doesNotMatch(html, /id="projects"/);
  assert.doesNotMatch(html, /id="skills"/);
  assert.doesNotMatch(markupFor('executive', {}), /Alex Cyber/);
});

test('four templates remain structurally distinct', () => {
  const fixture = createRichPortfolioFixture();
  const marks = PORTFOLIO_TEMPLATE_IDS.map((template) => markupFor(template, fixture));
  assert.match(marks[0], /webcv-modern/);
  assert.match(marks[1], /webcv-executive/);
  assert.match(marks[2], /webcv-creative/);
  assert.match(marks[3], /webcv-tech/);
  assert.notEqual(marks[0], marks[1]);
  assert.notEqual(marks[2], marks[3]);
});
