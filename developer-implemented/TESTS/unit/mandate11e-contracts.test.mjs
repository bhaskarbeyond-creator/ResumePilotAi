/**
 * Mandate 11E — pure contract tests for the candidate discovery surfaces.
 *
 * These tests import the real page modules (they are TypeScript/TSX), transpiled
 * on the fly by a small ESM loader built on the repository's own TypeScript
 * dependency, so the assertions exercise the shipped logic rather than a copy
 * of it. A minimal stub replaces src/lib/firebase.ts, because Firebase needs a
 * browser runtime and none of the tested functions touch it.
 *
 * Cross-platform paths: every filesystem path is derived with
 * fileURLToPath(import.meta.url); new URL(...).pathname is never used.
 */
import { createRequire, register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const currentFile = fileURLToPath(import.meta.url);
const frontendDir = path.resolve(path.dirname(currentFile), '../../../frontend');
const srcDir = path.join(frontendDir, 'src');
const typescriptEntry = pathToFileURL(path.join(frontendDir, 'node_modules/typescript/lib/typescript.js')).href;

const loaderCode = `
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcDir = ${JSON.stringify(srcDir)};
const tsModule = await import(${JSON.stringify(typescriptEntry)});
const ts = tsModule.default ?? tsModule;

const EXTENSIONS = ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const subPath = specifier.slice(2);
    for (const ext of EXTENSIONS) {
      const candidate = path.join(srcDir, subPath + ext);
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!existsSync(base)) {
      for (const ext of ['.ts', '.tsx', '.js']) {
        if (existsSync(base + ext)) return nextResolve(pathToFileURL(base + ext).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\\/src\\/lib\\/firebase\\.ts$/.test(url)) {
    return {
      format: 'module',
      shortCircuit: true,
      source: [
        'const noop = () => {};',
        'export const auth = { currentUser: null };',
        'export const app = null;',
        'export const db = null;',
        'export const isFirebaseConfigured = false;',
        'export const onAuthStateChanged = () => noop;',
        'export const signOut = async () => {};',
        'export const signInWithEmailAndPassword = async () => { throw new Error("firebase is stubbed in unit tests"); };',
        'export const createUserWithEmailAndPassword = signInWithEmailAndPassword;',
        'export const sendPasswordResetEmail = async () => { throw new Error("firebase is stubbed in unit tests"); };',
        'export const signInWithPopup = signInWithEmailAndPassword;',
        'export const GoogleAuthProvider = class {};',
        'export const FacebookAuthProvider = class {};',
        'export default { auth, app, db, isFirebaseConfigured, onAuthStateChanged, signOut };',
      ].join('\\n'),
    };
  }
  if (url.startsWith('file:') && (url.endsWith('.ts') || url.endsWith('.tsx'))) {
    const file = fileURLToPath(url);
    const source = readFileSync(file, 'utf8');
    const transpiled = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: false,
        esModuleInterop: true,
        isolatedModules: true,
      },
    });
    return { format: 'module', shortCircuit: true, source: transpiled.outputText };
  }
  return nextLoad(url, context);
}
`;

register(`data:text/javascript;base64,${Buffer.from(loaderCode, 'utf8').toString('base64')}`);

const portal = await import('../../../frontend/src/pages/jobs/portal.tsx');
const regional = await import('../../../frontend/src/pages/jobs/regional-hub.tsx');
const modal = await import('../../../frontend/src/components/jobs/job-application-modal.tsx');
const coverLetters = await import('../../../frontend/src/lib/cover-letters.ts');
const favouriteDisplay = await import('../../../frontend/src/lib/favourite-display.ts');
const apiClient = await import('../../../frontend/src/lib/api-client.ts');
// axios lives in the frontend workspace; resolve it from there, not from this file.
const requireFromFrontend = createRequire(path.join(frontendDir, 'package.json'));
const axios = requireFromFrontend('axios');
const React = requireFromFrontend('react');
const { renderToStaticMarkup } = requireFromFrontend('react-dom/server');
const routerEntry = pathToFileURL(path.join(frontendDir, 'node_modules/react-router-dom/dist/index.mjs')).href;

const listing = (overrides = {}) => ({
  id: 'job_1',
  title: 'Backend Engineer',
  company: 'Acme',
  location: 'Bengaluru',
  type: 'full-time',
  description: 'Build services in Go and Postgres.',
  skills: ['Go', 'Postgres'],
  postedAt: '2026-10-20T10:00:00.000Z',
  ...overrides,
});

/* ─── Task 3: public job discovery query handling ─────────────────────────── */

test('job discovery: URL parameters normalise safely', () => {
  const parsed = portal.normalizeDiscoveryQuery(new URLSearchParams({
    q: '  Senior   Engineer ',
    location: ' Bengaluru ',
    type: 'FULL-TIME',
    page: '3',
  }));
  assert.deepEqual(parsed, { q: 'Senior Engineer', location: 'Bengaluru', type: 'full-time', page: 3 });

  const invalid = portal.normalizeDiscoveryQuery(new URLSearchParams({ type: 'permanent', page: '-4' }));
  assert.deepEqual(invalid, { q: '', location: '', type: 'all', page: 1 });

  assert.equal(portal.parsePageParam('2'), 2);
  assert.equal(portal.parsePageParam('2.9'), 2);
  assert.equal(portal.parsePageParam('nope'), 1);
  assert.equal(portal.parsePageParam(null), 1);
  assert.equal(portal.parsePageParam('0'), 1);
  assert.equal(portal.parsePageParam(String(Number.MAX_SAFE_INTEGER)), 10_000);
});

test('job discovery: the address bar omits defaults and keeps unrelated parameters', () => {
  const base = new URLSearchParams('utm=linkedin&page=4');
  const defaults = portal.discoverySearchParams({ q: '', location: '', type: 'all', page: 1 }, base);
  assert.equal(defaults.toString(), 'utm=linkedin');

  const filtered = portal.discoverySearchParams({ q: 'Go', location: 'Pune', type: 'remote', page: 2 });
  assert.equal(filtered.get('q'), 'Go');
  assert.equal(filtered.get('location'), 'Pune');
  assert.equal(filtered.get('type'), 'remote');
  assert.equal(filtered.get('page'), '2');
});

test('job discovery: no filter is sent to an endpoint that cannot apply it', () => {
  // Verified in backend/routes/jobsData.js + MySQLRepository.getJobs: only
  // publicOnly/status/employerId/limit are honoured. Sending q/type/page would
  // look like server-side filtering while doing nothing.
  const params = portal.jobsRequestParams({ q: 'Go', location: 'Pune', type: 'contract', page: 2 });
  assert.deepEqual(params, {});
  for (const unsupported of ['q', 'location', 'type', 'salary_min', 'remote', 'page']) {
    assert.equal(Object.hasOwn(params, unsupported), false);
  }
});

test('job discovery: filters match keyword, location and employment type locally', () => {
  const jobs = [
    listing(),
    listing({ id: 'job_2', title: 'Designer', company: 'Studio', location: 'Pune', type: 'contract', skills: ['Figma'], description: 'Product design.' }),
    listing({ id: 'job_3', title: 'Support Lead', company: 'Remote Co', location: 'Distributed', type: 'unknown', workplace: 'Remote', skills: ['Zendesk'], description: 'Customer support.' }),
  ];
  const base = { q: '', location: '', type: 'all', page: 1 };
  assert.equal(portal.applyJobFilters(jobs, base).length, 3);
  assert.deepEqual(portal.applyJobFilters(jobs, { ...base, q: 'go' }).map((job) => job.id), ['job_1']);
  assert.deepEqual(portal.applyJobFilters(jobs, { ...base, q: 'REMOTE CO' }).map((job) => job.id), ['job_3']);
  assert.deepEqual(portal.applyJobFilters(jobs, { ...base, location: 'pune' }).map((job) => job.id), ['job_2']);
  assert.deepEqual(portal.applyJobFilters(jobs, { ...base, type: 'remote' }).map((job) => job.id), ['job_3']);
  assert.deepEqual(portal.applyJobFilters(jobs, { ...base, type: 'contract', location: 'pune' }).map((job) => job.id), ['job_2']);
  assert.deepEqual(portal.applyJobFilters(jobs, { ...base, q: 'nothing-matches' }), []);
});

test('job discovery: pagination is clamped and never reports a false range', () => {
  const jobs = Array.from({ length: 19 }, (_, index) => listing({ id: `job_${index}` }));
  const first = portal.paginateJobs(jobs, 1, 8);
  assert.equal(first.page, 1);
  assert.equal(first.pageCount, 3);
  assert.deepEqual([first.from, first.to, first.items.length], [1, 8, 8]);

  const last = portal.paginateJobs(jobs, 3, 8);
  assert.deepEqual([last.from, last.to, last.items.length], [17, 19, 3]);

  const beyond = portal.paginateJobs(jobs, 99, 8);
  assert.equal(beyond.page, 3);
  assert.equal(beyond.items.length, 3);

  const empty = portal.paginateJobs([], 2, 8);
  assert.deepEqual([empty.page, empty.pageCount, empty.from, empty.to, empty.items.length], [1, 1, 0, 0, 0]);
});

test('job discovery: a row without a date is never given an invented one', () => {
  assert.equal(portal.formatRelativeTime(''), 'Date not listed');
  assert.equal(portal.formatRelativeTime('not-a-date'), 'Date not listed');
  assert.equal(portal.formatRelativeTime('2099-01-01T00:00:00.000Z'), 'Date not listed');
  const now = Date.parse('2026-10-29T12:00:00.000Z');
  assert.equal(portal.formatRelativeTime('2026-10-29T09:00:00.000Z', now), 'Today');
  assert.equal(portal.formatRelativeTime('2026-10-28T09:00:00.000Z', now), 'Yesterday');
});

/* ─── Task 3: regional hubs ───────────────────────────────────────────────── */

test('regional hubs: the kind comes from the route the application actually serves', () => {
  assert.equal(regional.regionalKindFromPathname('/jobs/city/bengaluru'), 'city');
  assert.equal(regional.regionalKindFromPathname('/jobs/in/karnataka'), 'in');
  assert.equal(regional.regionalKindFromPathname('/jobs'), null);
  assert.equal(regional.regionalKindFromPathname('/jobs/city'), null);
  assert.equal(regional.regionSlugFromPathname('/jobs/city/delhi-ncr'), 'delhi-ncr');
  assert.equal(regional.regionSlugFromPathname('/jobs/in/tamil-nadu/'), 'tamil-nadu');
  assert.equal(regional.regionSlugFromPathname('/jobs/city/bengaluru'), 'bengaluru');
  assert.equal(regional.regionalHubPath('in', 'maharashtra'), '/jobs/in/maharashtra');
});

test('regional hubs: a payload without a region identity is an error, not an empty region', () => {
  assert.throws(() => regional.parseRegionResponse({ success: true }), /expected shape/);
  assert.throws(() => regional.parseRegionResponse({ region: { kind: 'city', slug: 'pune' } }), /expected shape/);
  assert.throws(() => regional.parseRegionResponse({ region: { kind: 'county', slug: 'pune', name: 'Pune' } }), /expected shape/);
});

test('regional hubs: real aggregates are mapped and unusable rows dropped', () => {
  const snapshot = regional.parseRegionResponse({
    success: true,
    region: {
      kind: 'city',
      slug: 'bengaluru',
      name: 'Bengaluru',
      stateSlug: 'karnataka',
      stateName: 'Karnataka',
      vacancyCount: 2,
      hasVacancies: true,
      companyCount: 2,
      topCompanies: [{ name: 'Acme', openings: 1 }, { name: '', openings: 3 }],
      salaryRanges: [{
        currency: 'inr', unit: 'LPA', minAnnual: 600000, maxAnnual: 1200000, averageAnnual: 900000, averageLpa: 9,
      }, { currency: 'not-a-currency', minAnnual: 1 }],
      vacancies: [
        { id: 'job_1', title: 'Backend Engineer', company: 'Acme', location: 'Bengaluru', workplaceType: 'Hybrid', jobType: 'Full-time', salaryMin: 600000, salaryMax: 1200000, salaryCurrency: 'INR' },
        { id: 'job_2', title: 'QA Engineer', company: 'Acme', location: 'Bengaluru', workplaceType: 'On-site', jobType: 'Contract', salaryMin: 0, salaryMax: null, salaryCurrency: 'INR' },
        { id: '', title: 'Broken row', company: 'Acme' },
      ],
    },
  });
  assert.equal(snapshot.vacancyCount, 2);
  assert.equal(snapshot.vacancies.length, 2);
  assert.equal(snapshot.vacancies[1].salaryMin, null);
  assert.equal(snapshot.salaryRanges.length, 1);
  assert.equal(snapshot.salaryRanges[0].currency, 'INR');
  assert.deepEqual(snapshot.topCompanies, [{ name: 'Acme', openings: 1 }]);
  assert.equal(snapshot.hasVacancies, true);
});

test('regional hubs: salary text states currency, period and never a benchmark', () => {
  assert.equal(
    regional.formatSalaryRange({ currency: 'INR', unit: 'LPA', minAnnual: 600000, maxAnnual: 1200000, averageAnnual: 900000, averageLpa: 9 }),
    '₹6–12 LPA',
  );
  assert.equal(
    regional.formatSalaryRange({ currency: 'INR', unit: 'LPA', minAnnual: 650000, maxAnnual: null, averageAnnual: null, averageLpa: null }),
    'From ₹6.5 LPA',
  );
  assert.equal(
    regional.formatSalaryRange({ currency: 'USD', unit: 'annual', minAnnual: 90000, maxAnnual: 120000, averageAnnual: null, averageLpa: null }),
    '$90,000–$120,000 a year',
  );
  assert.equal(
    regional.formatSalaryRange({ currency: 'USD', unit: 'annual', minAnnual: null, maxAnnual: null, averageAnnual: null, averageLpa: null }),
    'Salary not listed',
  );
});

test('regional hubs: type facets and search come from the returned rows only', () => {
  const vacancies = [
    { id: 'a', title: 'Backend Engineer', company: 'Acme', location: 'Bengaluru', workplaceType: 'Hybrid', jobType: 'Full-time', salaryMin: null, salaryMax: null, salaryCurrency: null },
    { id: 'b', title: 'QA Engineer', company: 'Acme', location: 'Bengaluru', workplaceType: '', jobType: 'Contract', salaryMin: null, salaryMax: null, salaryCurrency: null },
    { id: 'c', title: 'Data Engineer', company: 'Beta', location: 'Mysuru', workplaceType: '', jobType: 'Full-time', salaryMin: null, salaryMax: null, salaryCurrency: null },
  ];
  assert.deepEqual(regional.vacancyTypeOptions(vacancies), ['contract', 'full-time']);
  assert.equal(regional.filterVacancies(vacancies, '', 'all').length, 3);
  assert.deepEqual(regional.filterVacancies(vacancies, 'backend', 'all').map((v) => v.id), ['a']);
  assert.deepEqual(regional.filterVacancies(vacancies, 'beta', 'full-time').map((v) => v.id), ['c']);
  assert.deepEqual(regional.filterVacancies(vacancies, '', 'contract').map((v) => v.id), ['b']);
  assert.deepEqual(regional.vacancyTypeOptions([]), []);
});

/* ─── Task 4: application validators and failure mapping ──────────────────── */

test('application modal: email validation', () => {
  assert.equal(modal.isValidEmail('priya@example.test'), true);
  assert.equal(modal.isValidEmail(' priya.sharma+job@example.co.in '), true);
  assert.equal(modal.isValidEmail('priya@example'), false);
  assert.equal(modal.isValidEmail('priya.example.test'), false);
  assert.equal(modal.isValidEmail('priya @example.test'), false);
  assert.equal(modal.isValidEmail(''), false);
  assert.equal(modal.isValidEmail(`${'a'.repeat(250)}@x.io`), false);
});

test('application modal: phone validation is E.164-aware and aligned with the server', () => {
  assert.equal(modal.validatePhone('+91 98765 43210').ok, true);
  assert.equal(modal.validatePhone('+14155550123').ok, true);
  assert.equal(modal.validatePhone('9876543210').ok, true);
  assert.equal(modal.validatePhone('(555) 000-0000').ok, true);
  assert.equal(modal.validatePhone('+0123456789').ok, false, 'a leading + needs a valid country code');
  assert.equal(modal.validatePhone('+91 (98) 765 43210').ok, true);
  assert.equal(modal.validatePhone('+1-415-555-0123').ok, true);
  assert.equal(modal.validatePhone('abcdefgh').ok, false);
  assert.equal(modal.validatePhone('12 34').ok, false);
  assert.equal(modal.validatePhone('+1234567890123456').ok, false, 'more than 15 digits');
  assert.equal(modal.validatePhone('').ok, false);
});

test('application modal: the cover note is measured the way the server measures it', () => {
  assert.equal(modal.coverNoteLength('  <p>Hello   world</p>  '), 'Hello world'.length);
  assert.equal(modal.validateCoverNote(''), 'Add a short pitch so the employer knows why you fit.');
  assert.match(modal.validateCoverNote('Too short.'), /at least 50/);
  assert.equal(modal.validateCoverNote('x'.repeat(50)), null);
  assert.equal(modal.validateCoverNote('x'.repeat(1000)), null);
  assert.match(modal.validateCoverNote('x'.repeat(1001)), /limit is 1000/);
});

test('application modal: skill overlap is reported only when it can be measured', () => {
  const jobText = 'We build services in Go and Postgres. Experience with Kubernetes is a plus.';
  const overlap = modal.computeSkillOverlap(['Go', 'Postgres', 'Figma'], jobText);
  assert.equal(overlap.percent, 67);
  assert.deepEqual(overlap.matched, ['go', 'postgres']);
  assert.equal(overlap.considered.length, 3);

  assert.equal(modal.computeSkillOverlap([], jobText), null, 'no resume skills means no figure');
  assert.equal(modal.computeSkillOverlap(['Go'], ''), null, 'no job text means no figure');
  assert.equal(modal.computeSkillOverlap(['Go'], 'short'), null);
  assert.equal(modal.computeSkillOverlap(['Go', 'Go'], jobText).considered.length, 1, 'duplicates collapse');
});

test('application modal: only ALREADY_APPLIED is treated as already applied', () => {
  const axiosError = (status, data) => new axios.AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    { status, data, statusText: '', headers: {}, config: {} },
  );

  assert.deepEqual(
    modal.classifyApplicationFailure(axiosError(409, { code: 'ALREADY_APPLIED', error: 'Already applied.' })),
    { kind: 'already-applied', message: 'You’ve already applied to this job.' },
  );
  assert.equal(
    modal.classifyApplicationFailure(axiosError(409, { code: 'APPLICATION_CHANGED', error: 'This job changed.' })).kind,
    'conflict',
  );
  assert.equal(
    modal.classifyApplicationFailure(axiosError(404, { code: 'JOB_UNAVAILABLE', error: 'Job closed.' })).kind,
    'job-unavailable',
  );
  assert.equal(
    modal.classifyApplicationFailure(axiosError(404, { code: 'RESUME_NOT_FOUND', error: 'Resume missing.' })).kind,
    'resume-missing',
  );
  assert.equal(modal.classifyApplicationFailure(axiosError(413, { code: 'RESUME_TOO_LARGE' })).kind, 'resume-too-large');
  assert.equal(modal.classifyApplicationFailure(axiosError(403, { error: 'No verified email.' })).kind, 'email-unverified');
  assert.equal(modal.classifyApplicationFailure(axiosError(400, { error: 'Invalid.' })).kind, 'validation');
  assert.equal(modal.classifyApplicationFailure(axiosError(500, { error: 'Boom.' })).kind, 'server');
  assert.equal(modal.classifyApplicationFailure(new Error('offline')).kind, 'network');
  assert.equal(modal.APPLICATIONS_HREF, '/dashboard/applied-jobs');
});

/* ─── Task 2: cover-letter keyword coverage ───────────────────────────────── */

test('cover letters: keyword coverage is deterministic and never a promise about an ATS', () => {
  const jobDescription = 'We need a backend engineer with Go, Postgres and Kubernetes experience. '
    + 'You will design services, review code and mentor engineers.';
  const result = coverLetters.keywordCoverage(jobDescription, 'I run Postgres services and review code every day.');
  assert.ok(result);
  // Terms shorter than three characters ("Go") are not keywords, so the letter
  // has to mention the longer ones for them to count.
  assert.ok(result.matched.includes('postgres'));
  assert.ok(result.matched.includes('services'));
  assert.ok(result.missing.includes('kubernetes'));
  assert.ok(result.missing.includes('backend'));
  assert.equal(result.percent, Math.round((result.matched.length / (result.matched.length + result.missing.length)) * 100));
  assert.equal(result.tierLabel, result.percent >= 80 ? 'Strong ATS Match' : result.percent >= 60 ? 'Good ATS Match' : 'Low ATS Match');

  const repeat = coverLetters.keywordCoverage(jobDescription, 'I run Postgres services and review code every day.');
  assert.deepEqual(repeat, result, 'the same inputs give the same result');

  assert.equal(coverLetters.keywordCoverage('', 'Any letter text.'), null);
  assert.equal(coverLetters.keywordCoverage('the and of to', 'Any letter text.'), null, 'stop words alone yield nothing');
  assert.equal(coverLetters.keywordCoverage(jobDescription, '').percent, 0);
});

test('cover letters: a letter title is derived from real fields only', () => {
  assert.equal(coverLetters.letterTitle({ jobTitle: 'Backend Engineer', companyName: 'Acme' }), 'Backend Engineer at Acme');
  assert.equal(coverLetters.letterTitle({ jobTitle: '', companyName: 'Acme' }), 'Cover letter for Acme');
  assert.equal(coverLetters.letterTitle({ jobTitle: '', companyName: '' }), 'Untitled cover letter');
});

/* ─── Task 5: favourites filtering ────────────────────────────────────────── */

const favourite = (overrides) => ({
  id: 'fav_1', itemId: 'job_1', itemType: 'job', createdAt: '2026-10-21T09:00:00.000Z',
  data: {}, job: null, document: null, ...overrides,
});

test('favourites: the type filter normalises unknown values', () => {
  assert.equal(favouriteDisplay.parseFilter('jobs'), 'jobs');
  assert.equal(favouriteDisplay.parseFilter('documents'), 'documents');
  assert.equal(favouriteDisplay.parseFilter('all'), 'all');
  assert.equal(favouriteDisplay.parseFilter('resumes'), 'all');
  assert.equal(favouriteDisplay.parseFilter(null), 'all');
});

test('favourites: tabs and search match what the entry shows', () => {
  const job = favouriteDisplay.describeFavourite(favourite({
    job: { title: 'Backend Engineer', company: 'Acme', location: 'Bengaluru', listed: true },
  }));
  const resume = favouriteDisplay.describeFavourite(favourite({
    itemId: 'res_1', itemType: 'resume', document: { title: 'Master Resume' },
  }));
  const cover = favouriteDisplay.describeFavourite(favourite({
    itemId: 'cl_1', itemType: 'cover', document: { title: 'Acme letter' },
  }));

  assert.equal(favouriteDisplay.matchesFilter(job, 'jobs'), true);
  assert.equal(favouriteDisplay.matchesFilter(job, 'documents'), false);
  assert.equal(favouriteDisplay.matchesFilter(resume, 'documents'), true);
  assert.equal(favouriteDisplay.matchesFilter(cover, 'documents'), true);
  assert.equal(favouriteDisplay.matchesFilter(cover, 'all'), true);

  assert.equal(favouriteDisplay.matchesQuery(job, 'bengaluru'), true);
  assert.equal(favouriteDisplay.matchesQuery(job, 'ACME'), true);
  assert.equal(favouriteDisplay.matchesQuery(job, 'qa'), false);
  assert.equal(favouriteDisplay.matchesQuery(job, '   '), true);
  assert.deepEqual(
    favouriteDisplay.filterCounts([job, resume, cover]),
    { all: 3, jobs: 1, documents: 2 },
  );

  assert.equal(resume.open.href, '/build-resume/res_1');
  assert.equal(cover.open.href, '/cover-letter/cl_1');
  assert.equal(job.open, null);
  assert.equal(favouriteDisplay.favouriteName(job), 'Backend Engineer at Acme');
});

test('favourites: a job that is no longer listed is labelled as such, not invented', () => {
  const stale = favouriteDisplay.describeFavourite(favourite({
    data: { title: 'Saved role', company: 'Acme' },
  }));
  assert.equal(stale.state.tone, 'unavailable');
  assert.equal(stale.asSaved, true);
  assert.equal(stale.open, null);
  assert.equal(favouriteDisplay.describeFavourite(favourite({})).title, 'Saved job');
});

/* ─── Task 1 / shared: API error normalisation ────────────────────────────── */

test('api errors are normalised to one shape for every surface', () => {
  const nested = apiClient.normalizeError(new axios.AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    { status: 503, data: { error: { code: 'DATABASE_UNAVAILABLE', message: 'Try later.' } }, statusText: '', headers: {}, config: {} },
  ));
  assert.deepEqual({ status: nested.status, code: nested.code, message: nested.message }, {
    status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Try later.',
  });

  const flat = apiClient.normalizeError(new axios.AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    { status: 409, data: { code: 'ALREADY_APPLIED', error: 'Already applied.' }, statusText: '', headers: {}, config: {} },
  ));
  assert.equal(flat.status, 409);
  assert.equal(flat.code, 'ALREADY_APPLIED');
  assert.equal(flat.message, 'Already applied.');

  assert.equal(apiClient.normalizeError(new Error('boom')).code, 'CLIENT_ERROR');
  assert.equal(apiClient.normalizeError('not an error').code, 'UNKNOWN_ERROR');
});

/* ─── Task 6: the public pages render the required landmarks ─────────────────
 *
 * The Playwright suite exercises these pages in a real browser; this block is
 * the part that still runs where no browser binary is available: it server-
 * renders the actual page components and inspects the markup they produce.
 */

test('public pages render one main landmark, a skip link and distinctly named navigation', async () => {
  const { MemoryRouter } = await import(routerEntry);
  const { AuthProvider } = await import('../../../frontend/src/providers/auth-provider.tsx');
  const { LandingPage } = await import('../../../frontend/src/pages/landing.tsx');
  const { FeaturesPage } = await import('../../../frontend/src/pages/features/index.tsx');

  for (const [label, Page] of [['landing', LandingPage], ['features', FeaturesPage]]) {
    const html = renderToStaticMarkup(
      React.createElement(AuthProvider, null, React.createElement(MemoryRouter, null, React.createElement(Page))),
    );

    assert.equal((html.match(/<main/g) ?? []).length, 1, `${label}: exactly one main landmark`);
    assert.match(html, /<main[^>]*id="main-content"/, `${label}: the skip link target exists`);
    assert.equal((html.match(/<h1/g) ?? []).length, 1, `${label}: exactly one level-1 heading`);
    assert.match(html, /<h1[ >]/, `${label}: a level-1 heading is rendered`);
    assert.ok(html.includes('Skip to main content'), `${label}: skip link is present`);
    assert.match(html, /href="#main-content"/, `${label}: skip link points at the main landmark`);

    const navLabels = [...html.matchAll(/<nav[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(navLabels.length > 0, `${label}: navigation regions are named`);
    assert.equal(new Set(navLabels).size, navLabels.length, `${label}: each navigation region has its own name`);
    assert.ok(navLabels.includes('Main navigation'), `${label}: the primary navigation is named`);

    // Decorative icons must not reach assistive technology.
    const iconSvgs = [...html.matchAll(/<svg[^>]*class="[^"]*lucide[^"]*"[^>]*>/g)];
    assert.ok(iconSvgs.length > 0, `${label}: icons are rendered`);
    assert.ok(
      iconSvgs.every((match) => match[0].includes('aria-hidden="true"')),
      `${label}: every icon is aria-hidden`,
    );
  }
});
