import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTFOLIO_TEMPLATE_IDS, assertNoSilentDataLoss, buildPortfolioDocument, collectPortfolioFieldMatrix, convertResumeToPortfolio, createLargePortfolioFixture, extractCanonicalFromPuck, isLikelyPlaceholderPersona, normalizePortfolioData, portfolioHasContent, resolvePortfolioTemplate, sanitizeCanonicalPortfolio, switchPortfolioTemplate, visiblePortfolioSections } from '../src/utils/portfolioData.js';
import { normalizePublishedPortfolio } from '../src/components/PortfolioBuilder/portfolioSanitization.js';

const MASTER_RESUME = {
  title: 'Asha Rao — Staff Designer',
  firstname: 'Asha',
  lastname: 'Rao',
  occupation: 'Staff Product Designer',
  email: 'asha.rao@example.com',
  phone: '+91 98765 43210',
  city: 'Bengaluru',
  country: 'India',
  address: '42 Residency Road',
  postalcode: '560025',
  website: 'https://asharao.design',
  linkedin: 'https://linkedin.com/in/asharao',
  github: 'https://github.com/asharao',
  photo: 'https://cdn.example.com/asha.jpg',
  summary: 'Staff designer shaping trustworthy AI products for first-time internet users.',
  employments: [
    { jobTitle: 'Staff Product Designer', employer: 'Nimbus Health', begin: '2021', end: 'Present', description: 'Led the design system for a multilingual care app.' },
    { jobTitle: 'Senior Designer', employer: 'Lotus Payments', begin: '2018', end: '2021', description: 'Redesigned checkout and reduced drop-off by 18%.' },
  ],
  educations: [
    { school: 'NID Ahmedabad', degree: 'M.Des Communication Design', started: '2014', finished: '2016', description: 'Thesis on civic interfaces.' },
    { school: 'JJ School of Art', degree: 'B.F.A.', started: '2010', finished: '2014', description: 'Visual communication.' },
  ],
  skills: [
    { name: 'Product Design', rating: 95 },
    { name: 'Design Systems', rating: 90 },
    { name: 'Figma', rating: 92 },
    { name: 'Research', rating: 88 },
  ],
  projects: [
    { title: 'Care OS', description: 'Clinician workspace for rural telemedicine.', url: 'https://asharao.design/care', technologies: 'Figma, React' },
    { title: 'Lotus Checkout', description: 'Accessible one-page checkout.', url: 'https://asharao.design/lotus' },
  ],
  certifications: [
    { title: 'NN/g UX Certification', issuer: 'Nielsen Norman Group', date: '2020', description: 'Research methods.' },
  ],
  achievements: [
    { title: 'IXDA India Jury', description: 'Invited juror for public-interest design.' },
  ],
  references: [
    { name: 'Kabir Mehta', reference: 'Asha makes complex systems feel inevitable and kind.' },
  ],
  languages: [
    { name: 'English', level: 'Fluent' },
    { name: 'Kannada', level: 'Native' },
  ],
  hobbies: ['Carnatic music', 'Urban sketching'],
  customSections: [
    {
      title: 'Exhibitions',
      items: [{ title: 'Design Public', description: 'Installed a civic complaint kiosk in 2019.' }],
    },
  ],
};

test('convertResumeToPortfolio is one-way and lossless against master resume fields', () => {
  const original = structuredClone(MASTER_RESUME);
  const portfolio = convertResumeToPortfolio(MASTER_RESUME, { resumeId: 'resume-asha' });
  assert.deepEqual(MASTER_RESUME, original);
  const losses = assertNoSilentDataLoss(MASTER_RESUME, portfolio);
  assert.deepEqual(losses, []);
  assert.equal(portfolio.source.resumeId, 'resume-asha');
  assert.equal(portfolio.heading.fullName, 'Asha Rao');
  assert.equal(portfolio.projects[0].link, 'https://asharao.design/care');
  assert.equal(portfolio.projects[0].technologyList.includes('Figma'), true);
});

test('empty and partial resumes never invent placeholder personas', () => {
  const empty = convertResumeToPortfolio({});
  assert.equal(portfolioHasContent(empty), false);
  assert.equal(isLikelyPlaceholderPersona(empty), false);
  assert.equal(empty.heading.fullName, '');
  const headingOnly = convertResumeToPortfolio({ firstname: 'Nia', lastname: 'Okoye', email: 'nia@example.com' });
  assert.equal(headingOnly.heading.fullName, 'Nia Okoye');
  assert.equal(headingOnly.experiences.length, 0);
  assert.equal(isLikelyPlaceholderPersona(headingOnly), false);
  const visibility = visiblePortfolioSections(headingOnly);
  assert.equal(visibility.experience, false);
  assert.equal(visibility.projects, false);
});

test('alias fields collapse into the canonical schema once', () => {
  const portfolio = normalizePortfolioData({
    heading: { firstName: 'Sam', lastName: 'Iyer', title: 'CTO' },
    experience: [{ position: 'Director', company: 'Harbor', startDate: '2019', endDate: '2024', summary: 'Scaled platform.' }],
    educations: [{ institution: 'IIT Madras', qualification: 'B.Tech', begin: '2008', end: '2012' }],
    skills: [{ skill: 'Rust' }],
    projects: [{ name: 'Mesh', url: 'https://example.com/mesh', tech: 'Go, Rust' }],
    awards: [{ name: 'ACM', summary: 'Recognized work' }],
  });
  assert.equal(portfolio.heading.firstname, 'Sam');
  assert.equal(portfolio.heading.occupation, 'CTO');
  assert.equal(portfolio.experiences[0].jobTitle, 'Director');
  assert.equal(portfolio.experiences[0].employer, 'Harbor');
  assert.equal(portfolio.education[0].school, 'IIT Madras');
  assert.equal(portfolio.skills[0].name, 'Rust');
  assert.equal(portfolio.projects[0].title, 'Mesh');
  assert.equal(portfolio.achievements[0].title, 'ACM');
});

test('template switching preserves every canonical field', () => {
  const source = convertResumeToPortfolio(MASTER_RESUME);
  let current = source;
  const matrices = [];
  for (const template of [...PORTFOLIO_TEMPLATE_IDS, PORTFOLIO_TEMPLATE_IDS[0]]) {
    current = switchPortfolioTemplate(current, template);
    assert.equal(current.template, resolvePortfolioTemplate(template));
    matrices.push(collectPortfolioFieldMatrix(current));
  }
  for (const matrix of matrices.slice(1)) {
    assert.deepEqual(matrix, matrices[0]);
  }
});

test('published document stores canonical independently of resume and sanitizes XSS', () => {
  const poisoned = convertResumeToPortfolio({
    ...MASTER_RESUME,
    firstname: 'Asha <script>alert(1)</script>',
    website: 'javascript:alert(1)',
    summary: '<img src=x onerror=alert(1)>Safe summary',
  });
  const document = buildPortfolioDocument({ canonical: poisoned, template: 'executive', title: 'Asha Web CV' });
  assert.equal(document.renderer, 'webcv');
  assert.equal(document.canonical.heading.firstname.includes('<script>'), false);
  assert.equal(document.canonical.heading.website, '');
  assert.equal(document.canonical.summary.includes('<img'), false);
  const published = normalizePublishedPortfolio({
    title: document.title,
    theme: 'professional',
    data: document,
  }, {});
  assert.equal(published.data.renderer, 'webcv');
  assert.equal(published.data.canonical.heading.email, 'asha.rao@example.com');
  assert.equal(published.data.content.length, 0);
});

test('legacy puck extraction does not invent missing resume sections', () => {
  const extracted = extractCanonicalFromPuck({
    content: [
      { type: 'Hero', props: { name: 'Alex Cyber', title: 'Hacker', email: 'alex@cyber.dev' } },
      { type: 'About', props: { content: 'Neon placeholder' } },
    ],
  });
  assert.equal(isLikelyPlaceholderPersona(extracted), true);
  assert.equal(extracted.projects.length, 0);
});

test('large portfolios stay bounded', () => {
  const large = createLargePortfolioFixture();
  assert.equal(large.experiences.length, 20);
  assert.equal(large.skills.length, 30);
  assert.equal(large.projects.length, 20);
  const sanitized = sanitizeCanonicalPortfolio(large);
  assert.ok(JSON.stringify(sanitized).length > 1000);
});
