/**
 * Mandate 11J — contract tests for the Web CV portfolio document engine, the
 * portfolio API layer, custom-domain validation, the public DTO projection and
 * the share-dialog QR encoder.
 *
 * These tests import the REAL production modules
 * (`frontend/src/lib/portfolio-document.ts`, `frontend/src/lib/portfolio.ts`)
 * through Node's own TypeScript type-stripping and a `module.registerHooks`
 * resolver that maps the application's `@/…` alias onto `frontend/src`. The
 * browser-only Firebase module is replaced by a one-line stand-in (it is imported
 * by the shared API client but never used by the code under test), so nothing
 * about the logic being tested is re-implemented here.
 *
 * Runner: node --test developer-implemented/TESTS/unit/mandate11j-contracts.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../../../frontend/src/', import.meta.url));
const STUBS = new Map([
  // Browser-only identity provider: not exercised by anything under test.
  ['lib/firebase', 'export const auth = { currentUser: null };'],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const rest = specifier.slice(2);
      if (STUBS.has(rest)) return { url: `teststub:${rest}`, shortCircuit: true };
      const target = path.join(SRC, rest.endsWith('.ts') ? rest : `${rest}.ts`);
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('teststub:')) {
      return { format: 'module', shortCircuit: true, source: STUBS.get(url.slice('teststub:'.length)) };
    }
    return nextLoad(url, context);
  },
});

const documentApi = await import(pathToFileURL(path.join(SRC, 'lib/portfolio-document.ts')).href);
const portfolioApi = await import(pathToFileURL(path.join(SRC, 'lib/portfolio.ts')).href);
const { apiClient } = await import(pathToFileURL(path.join(SRC, 'lib/api-client.ts')).href);

const {
  DEFAULT_TEMPLATE,
  buildDocument,
  canonicalFromResume,
  canonicalWithVisibility,
  compareCanonical,
  defaultVisibility,
  documentWithVisibility,
  emptyCanonical,
  normalizeCanonical,
  normalizeVisibility,
  resolveTemplate,
  safeHttpUrl,
  templateMeta,
} = documentApi;

const {
  CUSTOM_DOMAIN_ROUTING_SUPPORTED,
  CUSTOM_DOMAIN_ROUTING_NOTE,
  PortfolioApiError,
  encodeQrMatrix,
  customDomainDnsRecords,
  mintPortfolioId,
  portfolioSaveEnvelope,
  publicPortfolioQr,
  publicPortfolioQrTarget,
  qrCapacityBytes,
  sanitizePublicPortfolioDto,
  savePortfolio,
  toPortfolioError,
  validateCustomDomain,
  validatePortfolioSlug,
} = portfolioApi;

/* ─── Fixtures ─── */

function richCanonical() {
  const canonical = emptyCanonical('executive');
  return {
    ...canonical,
    heading: {
      ...canonical.heading,
      firstname: 'Priya',
      lastname: 'Sharma',
      fullName: 'Priya Sharma',
      occupation: 'Data analyst',
      email: 'priya@example.test',
      phone: '+91 90000 00000',
      city: 'Vijayawada',
      country: 'India',
      address: '12 Private Street',
      postalcode: '520001',
      website: 'https://priya.example.test',
      linkedin: 'https://www.linkedin.com/in/priya',
      github: 'https://github.com/priya',
    },
    summary: 'Analyst with a focus on accessible data products.',
    experiences: [
      { id: 'experience-0', jobTitle: 'Analyst', employer: 'IME365', begin: '2022', end: 'Present', description: 'Built dashboards.', date: 1, location: 'Remote' },
    ],
    education: [
      { id: 'education-0', school: 'Andhra University', degree: 'BSc', started: '2016', finished: '2019', description: '', date: 1 },
    ],
    projects: [
      { id: 'project-0', title: 'Portfolio Studio', description: 'A Web CV builder.', link: 'https://example.test/p', technologies: 'React, TypeScript', technologyList: ['React', 'TypeScript'], image: '' },
    ],
    skills: [
      { id: 'skill-0', name: 'SQL', skillName: 'SQL', rating: 80, category: 'Data' },
    ],
  };
}

/** A document in the shape the portfolio API stores. */
function storedDocument(canonical, overrides = {}) {
  return {
    renderer: 'webcv',
    templateKey: canonical.template,
    template: canonical.template,
    canonical,
    content: [],
    root: { props: { title: 'Priya Sharma', description: canonical.summary } },
    title: 'Priya Sharma',
    description: canonical.summary,
    tags: [canonical.template],
    seoTitle: 'Priya Sharma',
    seoDescription: canonical.summary,
    theme: templateMeta(canonical.template).theme,
    visibility: canonical.visibility,
    isPublished: false,
    ...overrides,
  };
}

/* ─── 1. Identifier contract ─── */

test('mintPortfolioId produces an identifier the routing and API contracts accept', () => {
  const id = mintPortfolioId();
  assert.match(id, /^portfolio_[A-Za-z0-9_-]+$/, 'identifier is namespaced and URL/segment safe');
  assert.ok(id.length >= 4 && id.length <= 128, 'fits the backend :id contract (4–128 characters)');
  assert.ok(encodeURIComponent(id) === id, 'needs no escaping in the editor route');
  // The exact pattern backend/routes/portfolios.js enforces on :id.
  assert.match(id, /^[A-Za-z0-9_-]{4,128}$/);
});

test('mintPortfolioId is unique across repeated calls', () => {
  const ids = new Set(Array.from({ length: 250 }, () => mintPortfolioId()));
  assert.equal(ids.size, 250, 'no collisions across 250 generated identifiers');
});

test('the generated identifier survives a save/reload round trip unchanged', () => {
  const id = mintPortfolioId();
  const envelope = portfolioSaveEnvelope(id, storedDocument(richCanonical()), 0);
  assert.equal(envelope.id, id, 'the id used for the URL is the id written to the store');
  assert.equal(envelope.expectedRevision, 0, 'a new draft is created with revision 0');
});

/* ─── 2. Canonical normalisation ─── */

test('normalizeCanonical keeps every field of a valid document', () => {
  const canonical = normalizeCanonical(storedDocument(richCanonical()));
  assert.equal(canonical.template, 'executive');
  assert.equal(canonical.heading.fullName, 'Priya Sharma');
  assert.equal(canonical.heading.email, 'priya@example.test');
  assert.equal(canonical.summary, richCanonical().summary);
  assert.equal(canonical.experiences.length, 1);
  assert.equal(canonical.experiences[0].employer, 'IME365');
  assert.equal(canonical.education[0].school, 'Andhra University');
  assert.equal(canonical.projects[0].technologyList.length, 2);
  assert.equal(canonical.skills[0].skillName, 'SQL');
  assert.deepEqual(canonical.visibility, defaultVisibility());
});

test('normalizeCanonical tolerates every missing collection', () => {
  const canonical = normalizeCanonical({ heading: { firstname: 'Only' } });
  assert.deepEqual(canonical.experiences, [], 'missing experience array becomes empty');
  assert.deepEqual(canonical.education, [], 'missing education array becomes empty');
  assert.deepEqual(canonical.projects, [], 'missing project array becomes empty');
  assert.deepEqual(canonical.skills, [], 'missing skill array becomes empty');
  assert.deepEqual(canonical.certifications, []);
  assert.deepEqual(canonical.hobbies, []);
  assert.equal(canonical.heading.firstname, 'Only');
});

test('normalizeCanonical tolerates null, empty and legacy shapes without throwing', () => {
  assert.doesNotThrow(() => normalizeCanonical(null));
  assert.doesNotThrow(() => normalizeCanonical(undefined));
  assert.doesNotThrow(() => normalizeCanonical('not-a-document'));
  const legacy = normalizeCanonical({
    template: 'darkCyber',
    experiences: 'nonsense',
    skills: ['SQL', { skillName: 'Python' }, null],
    hobbies: 'Chess, Running',
    visibility: { showProjects: 'false', showSkills: null },
  });
  assert.equal(legacy.template, 'premiumTech', 'a legacy template id maps to a supported one');
  assert.deepEqual(legacy.experiences, [], 'a non-array becomes an empty list');
  assert.deepEqual(legacy.skills.map((skill) => skill.name), ['SQL', 'Python'], 'usable skills survive; junk is dropped');
  assert.deepEqual(legacy.hobbies, ['Chess', 'Running']);
  assert.equal(legacy.visibility.showProjects, false, "the legacy string 'false' hides the section");
  assert.equal(legacy.visibility.showSkills, true, 'an unusable value leaves the section visible');
});

test('normalizeCanonical is deterministic and idempotent', () => {
  const once = normalizeCanonical(storedDocument(richCanonical()));
  const twice = normalizeCanonical(once);
  assert.deepEqual(twice, once, 'normalising its own output changes nothing');
  assert.deepEqual(normalizeCanonical(storedDocument(richCanonical())), once, 'same input, same output');
});

test('the canonical document shape survives a JSON round trip (what the API stores)', () => {
  const canonical = normalizeCanonical(storedDocument(richCanonical()));
  assert.deepEqual(JSON.parse(JSON.stringify(canonical)), canonical);
});

/* ─── 3. Visibility projection ─── */

test('documentWithVisibility removes hidden experience from the rendered projection', () => {
  const canonical = { ...richCanonical(), visibility: { ...defaultVisibility(), showExperience: false } };
  const projected = documentWithVisibility(storedDocument(canonical), false);
  assert.deepEqual(projected.canonical.experiences, []);
  assert.equal(projected.visibility.showExperience, false);
});

test('documentWithVisibility removes hidden education', () => {
  const canonical = { ...richCanonical(), visibility: { ...defaultVisibility(), showEducation: false } };
  const projected = documentWithVisibility(storedDocument(canonical), false);
  assert.deepEqual(projected.canonical.education, []);
});

test('documentWithVisibility removes hidden projects', () => {
  const canonical = { ...richCanonical(), visibility: { ...defaultVisibility(), showProjects: false } };
  const projected = documentWithVisibility(storedDocument(canonical), false);
  assert.deepEqual(projected.canonical.projects, []);
});

test('documentWithVisibility removes hidden skills', () => {
  const canonical = { ...richCanonical(), visibility: { ...defaultVisibility(), showSkills: false } };
  const projected = documentWithVisibility(storedDocument(canonical), false);
  assert.deepEqual(projected.canonical.skills, []);
});

test('documentWithVisibility removes hidden contact details but keeps the person', () => {
  const canonical = { ...richCanonical(), visibility: { ...defaultVisibility(), showContact: false } };
  const projected = documentWithVisibility(storedDocument(canonical), false);
  const { heading } = projected.canonical;
  assert.equal(heading.email, '');
  assert.equal(heading.phone, '');
  assert.equal(heading.website, '');
  assert.equal(heading.linkedin, '');
  assert.equal(heading.github, '');
  assert.equal(heading.fullName, 'Priya Sharma', 'the name is not contact information');
  assert.equal(heading.city, 'Vijayawada');
});

test('hiding a section never deletes the stored content', () => {
  const canonical = { ...richCanonical(), visibility: { ...defaultVisibility(), showExperience: false, showContact: false } };
  const persisted = buildDocument({ canonical, title: 'Priya Sharma', isPublished: false });
  assert.equal(persisted.canonical.experiences.length, 1, 'the saved document still holds the experience entry');
  assert.equal(persisted.canonical.heading.email, 'priya@example.test', 'the saved document still holds the email');
  assert.equal(persisted.visibility.showExperience, false, 'the flag travels with the document');
  const projection = canonicalWithVisibility(persisted.canonical);
  assert.deepEqual(projection.experiences, [], 'only the projection drops it');
});

test('the visibility projection is idempotent and never mutates its input', () => {
  const canonical = { ...richCanonical(), visibility: { ...defaultVisibility(), showProjects: false } };
  const frozen = JSON.stringify(canonical);
  const once = canonicalWithVisibility(canonical);
  const twice = canonicalWithVisibility(once);
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(canonical), frozen, 'the input document is untouched');
});

test('a document saved before visibility existed reads as fully visible', () => {
  const legacy = storedDocument(richCanonical());
  delete legacy.canonical.visibility;
  delete legacy.visibility;
  const canonical = normalizeCanonical(legacy);
  assert.deepEqual(canonical.visibility, defaultVisibility());
  assert.equal(canonical.experiences.length, 1, 'nothing is hidden by a missing flag');
});

/* ─── 4. Resume → portfolio mapping ─── */

test('canonicalFromResume maps the supported resume fields', () => {
  const canonical = canonicalFromResume({
    id: 'resume-42',
    name: 'Priya Sharma CV',
    title: 'Data analyst',
    heading: { firstName: 'Priya', lastName: 'Sharma', title: 'Data analyst', email: 'priya@example.test' },
    phone: '+91 90000 00000',
    city: 'Vijayawada',
    country: 'India',
    summary: 'Analyst.',
    experiences: [{ jobTitle: 'Analyst', employer: 'IME365', startDate: '2022' }],
    education: [{ institution: 'Andhra University', degree: 'BSc' }],
    skills: ['SQL', 'Python'],
  }, 'creativeDark');

  assert.equal(canonical.template, 'creativeDark');
  assert.equal(canonical.heading.firstname, 'Priya');
  assert.equal(canonical.heading.lastname, 'Sharma');
  assert.equal(canonical.heading.fullName, 'Priya Sharma');
  assert.equal(canonical.heading.occupation, 'Data analyst');
  assert.equal(canonical.heading.email, 'priya@example.test');
  assert.equal(canonical.heading.phone, '+91 90000 00000');
  assert.equal(canonical.summary, 'Analyst.');
  assert.equal(canonical.experiences[0].employer, 'IME365');
  assert.equal(canonical.experiences[0].begin, '2022');
  assert.equal(canonical.education[0].school, 'Andhra University');
  assert.deepEqual(canonical.skills.map((skill) => skill.name), ['SQL', 'Python']);
  assert.equal(canonical.source.resumeId, 'resume-42');
  assert.equal(canonical.source.resumeTitle, 'Priya Sharma CV');
});

test('canonicalFromResume tolerates an incomplete resume record', () => {
  const canonical = canonicalFromResume({ id: 'resume-bare' });
  assert.equal(canonical.heading.fullName, '');
  assert.deepEqual(canonical.experiences, []);
  assert.deepEqual(canonical.skills, []);
  assert.equal(canonical.template, DEFAULT_TEMPLATE);
});

/* ─── 5. Template metadata ─── */

test('templateMeta recognises every supported template', () => {
  assert.equal(templateMeta('modernMinimal').name, 'Modern Minimal');
  assert.equal(templateMeta('executive').theme, 'professional');
  assert.equal(templateMeta('creativeDark').theme, 'creative');
  assert.equal(templateMeta('premiumTech').theme, 'dark');
});

test('unknown and malformed template ids fall back safely', () => {
  assert.equal(resolveTemplate('does-not-exist'), DEFAULT_TEMPLATE);
  assert.equal(resolveTemplate(null), DEFAULT_TEMPLATE);
  assert.equal(resolveTemplate(42), DEFAULT_TEMPLATE);
  assert.equal(resolveTemplate('terminal'), 'premiumTech', 'legacy ids keep their documented meaning');
  assert.equal(templateMeta(undefined).id, DEFAULT_TEMPLATE);
});

/* ─── 6. Custom-domain validation and DNS instructions ─── */

test('custom domains reject schemes, paths, query strings, fragments and trailing slashes', () => {
  assert.equal(validateCustomDomain('http://alex-smith.dev').valid, false);
  assert.equal(validateCustomDomain('HTTPS://alex-smith.dev').valid, false, 'scheme detection is case-insensitive');
  assert.equal(validateCustomDomain('alex-smith.dev/').valid, false);
  assert.equal(validateCustomDomain('alex-smith.dev/cv').valid, false);
  assert.equal(validateCustomDomain('alex-smith.dev?x=1').valid, false);
  assert.equal(validateCustomDomain('alex-smith.dev#top').valid, false);
  assert.equal(validateCustomDomain('alex-smith.dev:8443').valid, false);
  assert.equal(validateCustomDomain('alex smith.dev').valid, false);
  assert.equal(validateCustomDomain('localhost').valid, false);
  assert.equal(validateCustomDomain('192.168.0.1').valid, false);
  assert.equal(validateCustomDomain('').valid, false);
});

test('a clean fully-qualified domain is accepted and normalised', () => {
  const result = validateCustomDomain('  Alex-Smith.DEV ');
  assert.equal(result.valid, true);
  assert.equal(result.domain, 'alex-smith.dev', 'lower-cased for the DNS claim');
  assert.equal(validateCustomDomain('cv.alex-smith.dev').domain, 'cv.alex-smith.dev');
});

test('DNS instructions use the TXT record the backend actually issues', () => {
  const records = customDomainDnsRecords({
    domain: 'alex-smith.dev',
    recordType: 'TXT',
    host: 'alex-smith.dev',
    verificationToken: 'ime365-verify=token-value',
    status: 'PENDING',
    instructions: null,
    verifiedAt: null,
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'TXT');
  assert.equal(records[0].host, 'alex-smith.dev', 'the claimed hostname, as the server returns it');
  assert.equal(records[0].value, 'ime365-verify=token-value');
  assert.deepEqual(customDomainDnsRecords(null), [], 'no config, no invented record');
});

test('the deployment does not claim a CNAME/A routing target it cannot verify', () => {
  assert.equal(CUSTOM_DOMAIN_ROUTING_SUPPORTED, false, 'the backend verifies TXT ownership only');
  assert.match(CUSTOM_DOMAIN_ROUTING_NOTE, /TXT record only/);
  assert.equal(/domains\.ime365\.com/.test(CUSTOM_DOMAIN_ROUTING_NOTE), false, 'no hardcoded, unsupported routing host');
});

test('a registration without a verification token produces no DNS record to display', () => {
  assert.deepEqual(customDomainDnsRecords({ domain: 'a.dev', recordType: 'TXT', host: null, verificationToken: '', status: 'PENDING', instructions: null, verifiedAt: null }), []);
});

/* ─── 7. Public DTO safety ─── */

const publicEnvelope = (overrides = {}) => ({
  success: true,
  portfolio: {
    id: 'portfolio_abc123',
    slug: 'priya-sharma-ab12cd34',
    title: 'Priya Sharma',
    theme: 'professional',
    isPublished: true,
    publishedAt: '2026-10-01T10:00:00.000Z',
    metadata: { description: 'Analyst', tags: ['executive'], seoTitle: 'Priya Sharma', seoDescription: 'Analyst' },
    data: {
      content: [],
      root: { props: {} },
      canonical: {
        template: 'executive',
        heading: {
          firstname: 'Priya', lastname: 'Sharma', fullName: 'Priya Sharma', occupation: 'Data analyst',
          email: 'priya@example.test', phone: '+91 90000 00000', city: 'Vijayawada', country: 'India',
          address: '12 Private Street', postalcode: '520001', photo: '',
          website: 'https://priya.example.test', linkedin: '', github: '',
        },
        summary: 'Analyst',
        experiences: [], education: [], skills: [], projects: [],
      },
    },
    ...overrides,
  },
});

test('the public DTO keeps only published, publicly renderable fields', () => {
  const dto = sanitizePublicPortfolioDto(publicEnvelope());
  assert.equal(dto.id, 'portfolio_abc123');
  assert.equal(dto.slug, 'priya-sharma-ab12cd34');
  assert.equal(dto.metadata.seoTitle, 'Priya Sharma');
  assert.equal(dto.isPublished, true);
});

test('the public DTO never carries the owner id, revision or billing data', () => {
  const dto = sanitizePublicPortfolioDto(publicEnvelope({
    userId: 'usr_secret',
    user_id: 'usr_secret',
    revision: 17,
    billing: { customerId: 'cus_1' },
    billingSnapshot: { amount: 100 },
    customerSnapshot: { email: 'billing@example.test' },
    gstin: 'GST123',
    extra_data: { private: true },
  }));
  const serialized = JSON.stringify(dto);
  for (const secret of ['usr_secret', 'revision', 'billingSnapshot', 'cus_1', 'GST123', 'billing@example.test', 'extra_data']) {
    assert.equal(serialized.includes(secret), false, `public DTO must not expose ${secret}`);
  }
  assert.equal(Object.hasOwn(dto, 'userId'), false);
  assert.equal(Object.hasOwn(dto, 'revision'), false);
  assert.equal(Object.hasOwn(dto, 'billing'), false);
});

test('the public DTO drops the street address and postal code', () => {
  const dto = sanitizePublicPortfolioDto(publicEnvelope());
  const serialized = JSON.stringify(dto);
  assert.equal(serialized.includes('12 Private Street'), false);
  assert.equal(serialized.includes('520001'), false);
  assert.equal(dto.data.canonical.heading.city, 'Vijayawada', 'city/country remain available');
});

test('unpublished drafts and malformed responses cannot pass as public', () => {
  assert.throws(() => sanitizePublicPortfolioDto(publicEnvelope({ isPublished: false })), PortfolioApiError);
  assert.throws(() => sanitizePublicPortfolioDto(null), PortfolioApiError);
  assert.throws(() => sanitizePublicPortfolioDto({ portfolio: { id: '', slug: '' } }), PortfolioApiError);
  try {
    sanitizePublicPortfolioDto(publicEnvelope({ isPublished: false }));
  } catch (error) {
    assert.equal(error.status, 404, 'an unpublished portfolio is indistinguishable from a missing one');
    assert.equal(error.code, 'PORTFOLIO_NOT_FOUND');
  }
});

test('hidden sections are absent from the public DTO, not merely hidden by CSS', () => {
  const envelope = publicEnvelope();
  envelope.portfolio.data.canonical.visibility = {
    showExperience: true, showEducation: true, showProjects: true, showSkills: true, showContact: false,
  };
  envelope.portfolio.data.canonical.experiences = [{ id: 'e1', jobTitle: 'Analyst', employer: 'IME365' }];
  const dto = sanitizePublicPortfolioDto(envelope);
  assert.equal(dto.data.canonical.heading.email, '', 'hidden contact details are not in the client state');
  assert.equal(dto.data.canonical.heading.phone, '');
  assert.equal(JSON.stringify(dto).includes('priya@example.test'), false);
  assert.equal(dto.data.canonical.experiences.length, 1, 'a visible section is preserved');
});

/* ─── 8. Save envelope and error mapping ─── */

test('a save envelope carries the expected revision', () => {
  const envelope = portfolioSaveEnvelope('portfolio_abc123', { title: 'T', theme: 'dark' }, 7);
  assert.equal(envelope.expectedRevision, 7);
  assert.equal(envelope.portfolio.title, 'T');
  assert.equal(envelope.id, 'portfolio_abc123');
});

test('a missing, negative, fractional or unsafe revision is refused before any request', () => {
  for (const revision of [undefined, null, '', -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2, 'abc']) {
    assert.throws(
      () => portfolioSaveEnvelope('portfolio_abc123', {}, revision),
      (error) => error instanceof PortfolioApiError && error.code === 'PORTFOLIO_REVISION_REQUIRED',
      `revision ${String(revision)} must be refused`,
    );
  }
  assert.throws(
    () => portfolioSaveEnvelope('bad id!', {}, 1),
    (error) => error instanceof PortfolioApiError && error.code === 'INVALID_PORTFOLIO_ID',
  );
  assert.throws(
    () => portfolioSaveEnvelope('portfolio_abc123', null, 1),
    (error) => error instanceof PortfolioApiError && error.code === 'INVALID_PORTFOLIO_ENVELOPE',
  );
});

test('savePortfolio sends exactly the contract the backend reads', async () => {
  const captured = [];
  const originalAdapter = apiClient.defaults.adapter;
  apiClient.defaults.adapter = async (config) => {
    captured.push({ method: config.method, url: config.url, data: JSON.parse(config.data) });
    return {
      data: { success: true, portfolio: { id: 'portfolio_abc123', title: 'T', revision: 8, slug: null, isPublished: false } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  try {
    const saved = await savePortfolio('portfolio_abc123', { title: 'T', theme: 'dark' }, 7);
    assert.equal(saved.revision, 8, 'the server revision is returned to the caller');
    assert.equal(captured.length, 1);
    assert.equal(captured[0].method, 'post');
    assert.equal(captured[0].url, '/portfolios/portfolio_abc123');
    assert.deepEqual(Object.keys(captured[0].data).sort(), ['expectedRevision', 'portfolio']);
    assert.equal(captured[0].data.expectedRevision, 7);
    assert.equal(captured[0].data.portfolio.title, 'T');
  } finally {
    apiClient.defaults.adapter = originalAdapter;
  }
});

test('a 409 is surfaced as a conflict carrying the server revision', async () => {
  const originalAdapter = apiClient.defaults.adapter;
  apiClient.defaults.adapter = async (config) => {
    const error = new Error('Request failed with status code 409');
    error.isAxiosError = true;
    error.config = config;
    error.response = {
      status: 409,
      data: { success: false, code: 'PORTFOLIO_CONFLICT', error: 'Portfolio was changed', remoteRevision: 9 },
      headers: {},
      config,
    };
    throw error;
  };
  try {
    await assert.rejects(
      () => savePortfolio('portfolio_abc123', { title: 'T' }, 7),
      (error) => {
        assert.ok(error instanceof PortfolioApiError);
        assert.equal(error.status, 409);
        assert.equal(error.conflict, true);
        assert.equal(error.remoteRevision, 9, 'the newer revision is available to the conflict dialog');
        return true;
      },
    );
  } finally {
    apiClient.defaults.adapter = originalAdapter;
  }
});

test('the module-disabled state is recognised only by its exact error code', () => {
  const disabled = new PortfolioApiError(403, 'PORTFOLIO_MODULE_DISABLED', 'disabled');
  assert.equal(disabled.moduleDisabled, true);
  assert.equal(disabled.conflict, false);

  const unrelated = new PortfolioApiError(403, 'PORTFOLIO_OWNER_MISMATCH', 'Cannot write another user’s portfolio.');
  assert.equal(unrelated.moduleDisabled, false, 'an unrelated 403 keeps its own message');

  const wrongStatus = new PortfolioApiError(400, 'PORTFOLIO_MODULE_DISABLED', 'disabled');
  assert.equal(wrongStatus.moduleDisabled, false, 'the code alone is not enough; it must be a 403');

  const plainForbidden = new PortfolioApiError(403, 'FORBIDDEN', 'Forbidden');
  assert.equal(plainForbidden.moduleDisabled, false);
});

test('slug validation matches the publishing contract', () => {
  assert.equal(validatePortfolioSlug('priya-sharma').valid, true);
  assert.equal(validatePortfolioSlug('Priya').valid, false, 'uppercase is rejected');
  assert.equal(validatePortfolioSlug('ab').valid, false, 'too short');
  assert.equal(validatePortfolioSlug('-leading').valid, false);
  assert.equal(validatePortfolioSlug('trailing-').valid, false);
  assert.equal(validatePortfolioSlug('double--hyphen').valid, false);
  assert.equal(validatePortfolioSlug('admin').valid, false, 'reserved system path');
});

/* ─── 9. Share-link safety and QR encoding ─── */

test('portfolio URLs are built from the public route and encoded', () => {
  const url = portfolioApi.publicPortfolioUrl('priya-sharma-ab12cd34');
  assert.match(url, /\/portfolio\/priya-sharma-ab12cd34$/);
  assert.equal(portfolioApi.publicPortfolioQrTarget(''), '', 'no slug, no target');
  assert.equal(portfolioApi.publicPortfolioQrTarget(null), '');
});

test('safe link helpers allow only web and mail links', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,<script>'), null);
  assert.equal(safeHttpUrl('https://example.test/a'), 'https://example.test/a');
  assert.equal(safeHttpUrl('example.test'), 'https://example.test/');
});

test('the QR encoder encodes exactly the canonical public URL', () => {
  const url = 'https://ime365.example/portfolio/priya-sharma-ab12cd34';
  const matrix = encodeQrMatrix(url);
  assert.ok(matrix, 'a normal portfolio URL fits a supported version');
  assert.equal(matrix.text, url, 'the encoded payload is the URL itself');
  assert.equal(matrix.size, 17 + 4 * matrix.version);
  assert.equal(matrix.modules.length, matrix.size);
  assert.equal(matrix.modules[0].length, matrix.size);
  assert.equal(matrix.version, 4, 'a 55-byte URL fits version 4 at level L');
});

test('the QR matrix is a structurally valid symbol', () => {
  const matrix = encodeQrMatrix('https://ime365.example/portfolio/priya-sharma-ab12cd34');
  const { modules, size } = matrix;
  // Finder patterns: 7x7 with a 1-module light separator inside.
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const distance = Math.max(Math.abs(row - 3), Math.abs(column - 3));
        assert.equal(modules[top + row][left + column], distance !== 2, `finder pixel ${row},${column}`);
      }
    }
  }
  // Timing patterns alternate, starting and ending dark.
  for (let index = 8; index < size - 8; index += 1) {
    assert.equal(modules[6][index], index % 2 === 0, 'horizontal timing pattern');
    assert.equal(modules[index][6], index % 2 === 0, 'vertical timing pattern');
  }
  assert.equal(modules[size - 8][8], true, 'the always-dark module is set');
  assert.ok(matrix.mask >= 0 && matrix.mask <= 7);
});

test('QR capacity is honest about what it can encode', () => {
  assert.ok(qrCapacityBytes(1) < qrCapacityBytes(10));
  assert.equal(encodeQrMatrix(''), null, 'empty text produces no symbol');
  assert.equal(encodeQrMatrix('x'.repeat(600)), null, 'text beyond version 13 is refused, not truncated');
  const longest = encodeQrMatrix('x'.repeat(qrCapacityBytes(13)));
  assert.ok(longest, 'exactly at capacity still encodes');
});

test('the share QR is built from the public URL, and refuses to invent one', () => {
  // Under Node there is no configured public base URL and no browser origin, so
  // the canonical URL is not absolute and no QR is produced. The dialog shows the
  // "cannot be generated" message instead of encoding a relative path as if it
  // were a link a phone could open.
  assert.equal(portfolioApi.publicPortfolioUrl('priya-sharma-ab12cd34'), '/portfolio/priya-sharma-ab12cd34');
  assert.equal(publicPortfolioQrTarget('priya-sharma-ab12cd34'), '');
  assert.equal(publicPortfolioQr('priya-sharma-ab12cd34'), null);

  // Given the absolute URL the browser would use, the encoded payload is exactly
  // that URL and nothing else.
  const absolute = 'https://ime365.example/portfolio/priya-sharma-ab12cd34';
  const matrix = encodeQrMatrix(absolute);
  assert.equal(matrix.text, absolute);
  assert.equal(JSON.stringify(matrix).includes('@'), false, 'no private data is embedded in the symbol');
});

/* ─── 10. Conflict comparison ─── */

test('the conflict comparison lists exactly the fields that differ', () => {
  const local = richCanonical();
  const remote = { ...richCanonical(), summary: 'A different summary.', template: 'creativeDark' };
  const differences = compareCanonical(
    { title: 'Priya Sharma', canonical: local },
    { title: 'Priya Sharma', canonical: remote },
  );
  const keys = differences.map((difference) => difference.key);
  assert.deepEqual(keys.sort(), ['summary', 'template']);
  assert.equal(differences.find((difference) => difference.key === 'template').local, 'Executive');
  assert.equal(differences.find((difference) => difference.key === 'template').remote, 'Creative Dark');
  assert.deepEqual(compareCanonical({ title: 'Same', canonical: local }, { title: 'Same', canonical: local }), []);
});

test('visibility differences are reported as shown/hidden', () => {
  const local = { ...richCanonical(), visibility: { ...defaultVisibility(), showContact: false } };
  const differences = compareCanonical(
    { title: 'Priya', canonical: local },
    { title: 'Priya', canonical: richCanonical() },
  );
  const contact = differences.find((difference) => difference.key === 'visibility.showContact');
  assert.equal(contact.local, 'Hidden');
  assert.equal(contact.remote, 'Shown');
});

/* ─── 11. Utility surface used by the pages ─── */

test('normalizeVisibility only hides on an explicit false', () => {
  assert.deepEqual(normalizeVisibility(undefined), defaultVisibility());
  assert.equal(normalizeVisibility({ showExperience: false }).showExperience, false);
  assert.equal(normalizeVisibility({ showExperience: 0 }).showExperience, true, 'a non-boolean never hides content');
  assert.equal(normalizeVisibility({ showExperience: 'no' }).showExperience, true);
});
