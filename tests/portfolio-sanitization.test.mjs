import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePublishedPortfolio,
  sanitizePortfolioImageUrl,
  sanitizePortfolioText,
  sanitizePortfolioUrl,
} from '../src/components/PortfolioBuilder/portfolioSanitization.js';

test('portfolio links preserve useful destinations and reject executable or ambiguous URLs', () => {
  assert.equal(sanitizePortfolioUrl('https://example.com/work?q=résumé'), 'https://example.com/work?q=r%C3%A9sum%C3%A9');
  assert.equal(sanitizePortfolioUrl('/projects/example'), '/projects/example');
  assert.equal(sanitizePortfolioUrl('#contact'), '#contact');
  assert.equal(sanitizePortfolioUrl('mailto:hello@example.com'), 'mailto:hello@example.com');
  assert.equal(sanitizePortfolioUrl('tel:+919876543210'), 'tel:+919876543210');
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,test', '//evil.example/path', 'http://insecure.example', 'https://user:secret@example.com', 'https://example.com/%0d%0aInjected']) {
    assert.equal(sanitizePortfolioUrl(unsafe), '#', unsafe);
  }
});

test('portfolio images allow HTTPS, relative, and inert raster data while rejecting active formats', () => {
  assert.equal(sanitizePortfolioImageUrl('https://cdn.example.com/photo.webp'), 'https://cdn.example.com/photo.webp');
  assert.equal(sanitizePortfolioImageUrl('/uploads/photo.png'), '/uploads/photo.png');
  assert.equal(sanitizePortfolioImageUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(sanitizePortfolioImageUrl('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(sanitizePortfolioImageUrl('javascript:alert(1)'), '');
  assert.equal(sanitizePortfolioImageUrl('http://cdn.example.com/photo.jpg'), '');
});

test('published portfolio normalization is immutable, bounded, Unicode-safe, and type allowlisted', () => {
  const original = {
    id: 'portfolio-1',
    title: 'Asha <script>alert(1)</script> రావు',
    theme: 'dark',
    metadata: { seoTitle: 'Asha Portfolio', seoDescription: 'Design & engineering', tags: ['తెలుగు', 'UX'] },
    data: {
      root: { props: { title: 'My <b>Portfolio</b>' } },
      content: [
        {
          type: 'Projects',
          props: {
            projects: [{ title: 'Résumé ✓', link: 'https://example.com/work', image: 'https://cdn.example.com/work.png' }],
            primaryButtonLink: 'javascript:alert(1)',
            description: '<img src=x onerror=alert(1)>Safe text',
          },
        },
        { type: 'UnregisteredWidget', props: { content: 'must not render' } },
      ],
    },
  };
  const snapshot = structuredClone(original);
  const normalized = normalizePublishedPortfolio(original, { Projects: { defaultProps: {} } });

  assert.deepEqual(original, snapshot);
  assert.equal(normalized.data.content.length, 1);
  assert.equal(normalized.title, 'Asha  రావు');
  assert.equal(normalized.data.root.props.title, 'My Portfolio');
  assert.equal(normalized.data.content[0].props.projects[0].title, 'Résumé ✓');
  assert.equal(normalized.data.content[0].props.projects[0].link, 'https://example.com/work');
  assert.equal(normalized.data.content[0].props.projects[0].image, 'https://cdn.example.com/work.png');
  assert.equal(normalized.data.content[0].props.primaryButtonLink, '#');
  assert.equal(normalized.data.content[0].props.description, 'Safe text');
});

test('malformed portfolio data fails closed and oversized collections are capped', () => {
  assert.equal(normalizePublishedPortfolio(null, {}), null);
  assert.equal(normalizePublishedPortfolio({ data: null }, {}), null);
  const components = Array.from({ length: 240 }, (_, index) => ({ type: 'About', props: { title: `Section ${index}` } }));
  const normalized = normalizePublishedPortfolio({ title: 'Large', data: { content: components } }, { About: { defaultProps: {} } });
  assert.equal(normalized.data.content.length, 200);
  assert.equal(sanitizePortfolioText(` नमस्ते ${'x'.repeat(12000)}`).length, 10000);
});
