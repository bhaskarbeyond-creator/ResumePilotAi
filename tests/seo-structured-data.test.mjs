import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const structuredDataSource = await readFile(new URL('../src/services/seo/structuredData.js', import.meta.url), 'utf8');
const structuredDataUrl = `data:text/javascript;base64,${Buffer.from(structuredDataSource).toString('base64')}`;
const {
  buildBreadcrumbSchema,
  buildFaqPageSchema,
  buildJobPostingSchema,
  buildOrganizationSchema,
  safeJsonLd,
  safeSchemaUrl,
  schemaDate,
  schemaText,
} = await import(structuredDataUrl);

const { HOMEPAGE_FAQS } = await import('../src/components/Marketing/elements/faqData.js');

test('structured-data text and URLs reject active markup and unsafe schemes', () => {
  assert.equal(schemaText('<script>alert(1)</script>Platform <b>Engineer</b>'), 'Platform Engineer');
  assert.equal(safeSchemaUrl('javascript:alert(1)', 'https://ime365.com'), '');
  assert.equal(safeSchemaUrl('//cdn.example.test/card.png', 'https://ime365.com'), 'https://cdn.example.test/card.png');
  assert.equal(safeSchemaUrl('/job/42', 'https://ime365.com'), 'https://ime365.com/job/42');
});

test('schema dates are serialized only when they parse as real dates', () => {
  assert.equal(schemaDate('2026-10-04T00:00:00.000Z'), '2026-10-04T00:00:00.000Z');
  assert.equal(schemaDate('not-a-date'), undefined);
  assert.equal(schemaDate(null), undefined);
});

test('BlogPosting serialization is escaped and only confirmed author/date facts are included', async () => {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: 'Engineer </script><script>alert(1)</script>',
    author: { '@type': 'Person', name: schemaText('A. Author', 160) },
    datePublished: '2026-09-20T10:00:00.000Z',
  };
  const serialized = safeJsonLd(schema);
  assert.doesNotMatch(serialized, /<\/script|<script>/i);
  assert.match(serialized, /\\u003c/);
  assert.equal(JSON.parse(serialized).author.name, 'A. Author');

  const blog = await readFile(new URL('../src/components/Blog/BlogPost/BlogPost.jsx', import.meta.url), 'utf8');
  assert.match(blog, /isPublished && \(/);
  assert.match(blog, /safeJsonLd\(/);
  assert.doesNotMatch(blog, /author:\s*\{\s*'@type': 'Person',\s*name: post\.authorName \|\| 'IME365 Editorial Team'/);
  assert.match(blog, /meta\[property="og:image"\]/);
  assert.match(blog, /twitter:image/);
  assert.match(blog, /post\.publishedAt \|\| post\.published_at/);
  assert.match(blog, /element\.removeAttribute\('data-route-seo-owner'\)/);
  assert.doesNotMatch(blog, /IME365 Editorial Team|Default Author|defaultCategory/i);

  const routeSeo = await readFile(new URL('../src/components/RouteSeo.jsx', import.meta.url), 'utf8');
  assert.match(routeSeo, /data-route-seo-owner="route"/);
  assert.match(routeSeo, /document\.head\.querySelectorAll\('\[data-route-seo-owner="route"\]'\)/);
});

test('JobPosting schema is omitted for inactive or expired postings and sanitizes eligible public facts', () => {
  const now = Date.parse('2026-10-04T00:00:00.000Z');
  const base = {
    id: 'job-42',
    status: 'active',
    title: 'Platform Engineer',
    description: '<p>Build safe platform infrastructure.</p>',
    company_name: 'Northwind Labs',
    location: 'Bengaluru, Karnataka, India',
    job_type: 'Full-time',
    workplace_type: 'Hybrid',
    created_at: '2026-09-01T12:00:00Z',
    expires_at: '2026-11-01T12:00:00Z',
    company_url: 'javascript:alert(1)',
  };
  const valid = buildJobPostingSchema(base, { canonicalUrl: 'https://ime365.com/jobs/portal/job-42', now });
  assert.equal(valid['@type'], 'JobPosting');
  assert.equal(valid.title, 'Platform Engineer');
  assert.equal(valid.jobLocation.address.addressLocality, 'Bengaluru, Karnataka');
  assert.equal(valid.jobLocation.address.addressCountry, 'IN');
  assert.equal(valid.employmentType, 'FULL_TIME');
  assert.equal(Object.hasOwn(valid.hiringOrganization, 'sameAs'), false);
  assert.equal(buildJobPostingSchema({ ...base, status: 'draft' }, { canonicalUrl: 'https://ime365.com/jobs/portal/job-42', now }), null);
  assert.equal(buildJobPostingSchema({ ...base, expires_at: '2026-10-01T00:00:00Z' }, { canonicalUrl: 'https://ime365.com/jobs/portal/job-42', now }), null);
  assert.equal(buildJobPostingSchema(base, { canonicalUrl: 'javascript:alert(1)', now }), null);
});

test('FAQ, breadcrumb, and organization schemas use supplied visible facts and safe canonical URLs', () => {
  const faqSchema = buildFaqPageSchema(HOMEPAGE_FAQS);
  assert.equal(faqSchema.mainEntity.length, HOMEPAGE_FAQS.length);
  assert.deepEqual(faqSchema.mainEntity.map(item => item.name), HOMEPAGE_FAQS.map(item => item.q));
  const crumbs = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://ime365.com/' },
    { name: '<b>Jobs</b>', url: 'https://ime365.com/jobs' },
  ], 'https://ime365.com');
  assert.equal(crumbs.itemListElement[1].name, 'Jobs');
  const organization = buildOrganizationSchema({ branding: { brandName: 'IME365' }, geoSeo: { canonicalUrl: 'https://ime365.com' } }, 'https://ime365.com');
  assert.equal(organization.url, 'https://ime365.com/');
  assert.equal(buildOrganizationSchema({}, 'javascript:alert(1)'), null);
});

test('regional route metadata fails closed and page copy uses the live regional API', async () => {
  const [routeSeo, page, blogData] = await Promise.all([
    readFile(new URL('../src/components/RouteSeo.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/JobsListings/RegionalJobsPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../backend/routes/blogData.js', import.meta.url), 'utf8'),
  ]);
  assert.match(routeSeo, /geoSeo\.enableGeoSeo !== true/);
  assert.match(routeSeo, /region\.hasVacancies/);
  assert.match(routeSeo, /noindex,follow/);
  assert.match(routeSeo, /buildBreadcrumbSchema/);
  assert.match(page, /getRegionalHub/);
  assert.match(page, /region\.vacancies/);
  assert.match(page, /region\.salaryRanges/);
  assert.match(page, /region\.vacancyCount/);
  assert.doesNotMatch(page, /mock|placeholder vacancy|demo job/i);
  assert.match(blogData, /const category = p\.category \|\| p\.categoryName \|\| ''/);
  assert.match(blogData, /const publishedAt = p\.publishedAt \|\| p\.published_at \|\| p\.created_at \|\| p\.createdAt \|\| null/);
  assert.doesNotMatch(blogData, /publishedAt =[^;]*new Date\(\)\.toISOString\(\)/);
});
