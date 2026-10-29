/**
 * Mandate 11I runtime contract tests. Import the shipped TypeScript helpers,
 * transpiled by the repository's TypeScript dependency. Only Firebase's browser
 * identity provider is stubbed; HTTP assertions use the real Axios client with a
 * deterministic adapter. No source-text matching or copied business logic.
 */
import { createRequire, register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../frontend');
const srcDir = path.join(frontendDir, 'src');
const typescriptEntry = pathToFileURL(path.join(frontendDir, 'node_modules/typescript/lib/typescript.js')).href;
const loaderCode = `
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const tsModule = await import(${JSON.stringify(typescriptEntry)});
const ts = tsModule.default ?? tsModule;
const src = ${JSON.stringify(srcDir)};
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    for (const extension of ['.ts', '.tsx', '.js']) {
      const file = path.join(src, specifier.slice(2) + extension);
      if (existsSync(file)) return nextResolve(pathToFileURL(file).href, context);
    }
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('/lib/firebase.ts')) return { format: 'module', shortCircuit: true, source: 'export const auth = { currentUser: null };' };
  if (url.startsWith('file:') && /\\.tsx?$/.test(url)) {
    const file = fileURLToPath(url);
    const result = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    return { format: 'module', shortCircuit: true, source: result.outputText };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`);
const applications = await import('../../../frontend/src/lib/applications.ts');
const applicationDisplay = await import('../../../frontend/src/lib/application-display.ts');
const tracker = await import('../../../frontend/src/lib/job-tracker.ts');
const display = await import('../../../frontend/src/lib/job-tracker-display.ts');
const { apiClient } = await import('../../../frontend/src/lib/api-client.ts');
const requireFrontend = createRequire(path.join(frontendDir, 'package.json'));
const axios = requireFrontend('axios');

const application = (overrides = {}) => ({
  id: 'app-1', jobId: 'job-1', status: 'pending', createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z',
  applicantName: 'Priya Sharma', applicantEmail: 'priya@example.test', applicantPhone: '', resumeId: null, coverLetter: '',
  job: { title: 'Platform Engineer', company: 'Acme', location: 'Vijayawada', listed: true }, ...overrides,
});
const job = (overrides = {}) => ({
  ...tracker.EMPTY_TRACKER_FIELDS, id: 'tracker-1', title: 'Platform Engineer', company: 'Acme', status: 'applied',
  revision: 3, createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z', ...overrides,
});
function http(t, handler) {
  const calls = [];
  const original = apiClient.defaults.adapter;
  apiClient.defaults.adapter = async (config) => {
    calls.push(config);
    const body = config.data ? JSON.parse(config.data) : null;
    try {
      const result = await handler(config, body, calls.length);
      if (result.response) throw result;
      return { data: result.data, status: result.status ?? 200, statusText: 'OK', headers: {}, config };
    } catch (error) {
      if (error?.response) throw new axios.AxiosError(error.message || 'Request failed', 'ERR_BAD_REQUEST', config, null, { ...error.response, config, headers: {} });
      throw error;
    }
  };
  t.after(() => { apiClient.defaults.adapter = original; });
  return calls;
}
const conflict = { message: 'Changed elsewhere', response: { status: 409, data: { success: false, code: 'JOB_TRACKER_CONFLICT', remoteRevision: 8 } } };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

for (const [raw, expected] of [
  ['pending', 'APPLIED'], ['applied', 'APPLIED'], ['submitted', 'APPLIED'], ['reviewing', 'REVIEWING'], ['in_review', 'REVIEWING'],
  ['interview', 'INTERVIEW_SCHEDULED'], ['interview_scheduled', 'INTERVIEW_SCHEDULED'], ['accepted', 'OFFERED'], ['offered', 'OFFERED'],
  ['rejected', 'REJECTED'], ['declined', 'REJECTED'], [' OFFERED ', 'OFFERED'], ['unknown', 'UNKNOWN'], ['', 'UNKNOWN'], [null, 'UNKNOWN'], [{}, 'UNKNOWN'],
]) test(`lifecycle: ${String(raw)} → ${expected}`, () => assert.equal(applications.lifecycleStatusFor(raw), expected));

test('application parsing preserves raw status and never guesses pending for unknown/null', () => {
  assert.equal(applications.toApplication({ id: 'a', status: 'CUSTOM_STEP' }).status, 'CUSTOM_STEP');
  assert.equal(applications.toApplication({ id: 'a', status: null }).status, '');
});
test('company search is case-insensitive and trimmed', () => assert.equal(applicationDisplay.matchesQuery(application(), '  aCmE '), true));
test('title and location search compose with lifecycle filters', () => {
  const row = application({ status: 'in_review' });
  assert.equal(applicationDisplay.matchesQuery(row, 'platform vijayawada'), false);
  assert.equal(applicationDisplay.matchesQuery(row, 'PLATFORM'), true);
  assert.equal(applicationDisplay.matchesFilter(row, 'reviewing'), true);
  assert.equal(applicationDisplay.matchesFilter(row, 'applied'), false);
});
test('all includes unknown and reviewing; unknown is never filtered as applied', () => {
  for (const status of ['unknown', 'reviewing', null]) {
    const row = application({ status });
    assert.equal(applicationDisplay.matchesFilter(row, 'all'), true);
    assert.equal(applicationDisplay.matchesFilter(row, 'applied'), false);
  }
});
test('date sort is deterministic and invalid/missing dates go last without mutation', () => {
  const rows = [application({ id: 'invalid', createdAt: 'bad' }), application({ id: 'old', createdAt: '2026-01-01' }), application({ id: 'new', createdAt: '2026-12-01' }), application({ id: 'missing', createdAt: '' })];
  const before = structuredClone(rows);
  assert.deepEqual(applicationDisplay.sortApplications(rows, 'date').map((row) => row.id), ['new', 'old', 'invalid', 'missing']);
  assert.deepEqual(rows, before);
});
test('equal date and company values preserve original ordering', () => {
  const rows = [application({ id: 'first' }), application({ id: 'second' })];
  assert.deepEqual(applicationDisplay.sortApplications(rows, 'date').map((row) => row.id), ['first', 'second']);
  assert.deepEqual(applicationDisplay.sortApplications(rows, 'company').map((row) => row.id), ['first', 'second']);
});
test('company sorting is case-insensitive and does not mutate', () => {
  const rows = [application({ id: 'z', job: { ...application().job, company: 'zen' } }), application({ id: 'a', job: { ...application().job, company: 'Alpha' } })];
  const before = structuredClone(rows);
  assert.deepEqual(applicationDisplay.sortApplications(rows, 'company').map((row) => row.id), ['a', 'z']);
  assert.deepEqual(rows, before);
});
test('lifecycle summary counts every normalized state', () => {
  const summary = applicationDisplay.statusSummary([application(), application({ status: 'declined' }), application({ status: 'weird' })]);
  assert.equal(summary.counts.APPLIED, 1); assert.equal(summary.counts.REJECTED, 1); assert.equal(summary.counts.UNKNOWN, 1);
});
test('applications use the actual list envelope and propagate cancellation signal', async (t) => {
  const controller = new AbortController();
  const calls = http(t, () => ({ data: { success: true, applications: [application()] } }));
  const rows = await applications.listApplications(controller.signal);
  assert.equal(rows.length, 1); assert.equal(calls[0].url, '/jobs-data/applications/list'); assert.equal(calls[0].signal, controller.signal);
});
test('malformed application envelopes fail instead of becoming an empty list', async (t) => {
  http(t, () => ({ data: { success: true } }));
  await assert.rejects(applications.listApplications(), /unexpected response/);
});
test('withdrawal uses DELETE and requires success confirmation', async (t) => {
  const calls = http(t, () => ({ data: { success: true } }));
  assert.equal(await applications.withdrawApplication({ id: 'app / 1' }), 'withdrawn');
  assert.equal(calls[0].method, 'delete'); assert.equal(calls[0].url, '/jobs-data/applications/app%20%2F%201');
});
test('withdrawal 404 is already gone; server failure is not success', async (t) => {
  http(t, () => ({ response: { status: 500, data: { error: 'failed' } } }));
  await assert.rejects(applications.withdrawApplication({ id: 'app-1' }), /could not be confirmed/);
});

test('only the five canonical tracker stages are accepted', () => {
  for (const stage of ['wishlist', 'applied', 'interview', 'offer', 'rejected']) assert.equal(tracker.isTrackerStage(stage), true);
  for (const stage of ['saved', 'offered', 'archived', '', null]) assert.equal(tracker.isTrackerStage(stage), false);
});
test('invalid server stage/revision is rejected, not guessed into wishlist/revision 1', () => {
  assert.throws(() => tracker.toTrackedJob(job({ status: archivedPlaceholder() })), /invalid record/);
  assert.throws(() => tracker.toTrackedJob(job({ revision: 0 })), /invalid record/);
});
function archivedPlaceholder() { return 'archived'; }
test('work mode, round and format allow only documented values', () => {
  for (const workMode of tracker.WORK_MODES) assert.equal(tracker.validateTracker(job({ workMode })).workMode, undefined);
  assert.ok(tracker.validateTracker(job({ workMode: 'Anywhere' })).workMode);
  for (const interviewRound of tracker.INTERVIEW_ROUNDS) assert.equal(tracker.validateTracker(job({ interviewRound, interviewFormat: 'Video', interviewAt: '2026-11-03T10:30' })).interviewRound, undefined);
  assert.ok(tracker.validateTracker(job({ interviewRound: 'Final' })).interviewRound);
  for (const interviewFormat of tracker.INTERVIEW_FORMATS) assert.equal(tracker.validateTracker(job({ interviewFormat, interviewRound: 'Technical', interviewAt: '2026-11-03T10:30' })).interviewFormat, undefined);
  assert.ok(tracker.validateTracker(job({ interviewFormat: 'Email' })).interviewFormat);
});
test('required title/company and maximum lengths are enforced without truncation', () => {
  const errors = tracker.validateTracker(tracker.EMPTY_TRACKER_FIELDS);
  assert.ok(errors.title); assert.ok(errors.company);
  const long = tracker.normalizeTrackerFields({ ...tracker.EMPTY_TRACKER_FIELDS, title: 'x'.repeat(161), company: 'सह्याद्री Technologies' });
  assert.equal(long.title.length, 161); assert.ok(tracker.validateTracker(long).title); assert.equal(long.company, 'सह्याद्री Technologies');
});
test('URL validation rejects javascript, data and malformed URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'ftp://example.test/job', 'not a url']) assert.ok(tracker.validateTracker(job({ url })).url);
  assert.equal(tracker.validateTracker(job({ url: 'https://example.test/jobs/42?source=board' })).url, undefined);
});
test('contact email and real calendar dates are validated', () => {
  assert.ok(tracker.validateTracker(job({ contactEmail: 'bad@' })).contactEmail);
  assert.ok(tracker.validateTracker(job({ dateApplied: '2026-02-30' })).dateApplied);
  assert.ok(tracker.validateTracker(job({ interviewAt: '2026-11-03T25:00' })).interviewAt);
});
test('notes normalize CRLF and controls but keep intentional line breaks', () => {
  const fields = tracker.normalizeTrackerFields(job({ notes: '  one\r\ntwo\u0000three\r\n\r\nend  ' }));
  assert.equal(fields.notes, 'one\ntwo three\n\nend');
});
test('partial interview details require a complete round, format and time', () => {
  const errors = tracker.validateTracker(job({ status: 'interview', interviewRound: 'Technical' }));
  assert.ok(errors.interviewFormat); assert.ok(errors.interviewAt);
  assert.deepEqual(tracker.validateTracker(job({ status: 'interview' })), {});
});
test('chronological advancement stops at offer and never advances rejected', () => {
  assert.equal(tracker.nextStage('wishlist'), 'applied'); assert.equal(tracker.nextStage('applied'), 'interview');
  assert.equal(tracker.nextStage('interview'), 'offer'); assert.equal(tracker.nextStage('offer'), null); assert.equal(tracker.nextStage('rejected'), null);
});
test('duplicate detection prefers shared application identifier over title fallback', () => {
  const exactIdentity = job({ id: 'identity', applicationId: 'app-1', title: 'Different', company: 'Different' });
  const similar = job({ id: 'similar' });
  assert.equal(applications.findTrackedJob(application(), [similar, exactIdentity]).id, 'identity');
});
test('duplicate detection prefers stable job identifier and rejects conflicting identity', () => {
  assert.equal(applications.findTrackedJob(application(), [job({ id: 'wrong', jobId: 'other' }), job({ id: 'right', jobId: 'job-1' })]).id, 'right');
  assert.equal(applications.findTrackedJob(application(), [job({ jobId: 'other' })]), undefined);
});
test('canonical URL matching retains meaningful identifiers and ignores tracking parameters', () => {
  const row = application({ job: { ...application().job, url: 'https://JOBS.example.test:443/jobs/Role-42?b=2&utm_source=x&a=1#apply' } });
  const saved = job({ url: 'https://jobs.example.test/jobs/Role-42?a=1&b=2' });
  assert.equal(applications.findTrackedJob(row, [saved]).id, saved.id);
  assert.equal(applications.findTrackedJob(row, [job({ url: 'https://jobs.example.test/jobs/Role-43?a=1&b=2' })]), undefined);
});
test('title/company fallback normalizes case and whitespace only', () => {
  assert.ok(applications.findTrackedJob(application(), [job({ title: '  PLATFORM   ENGINEER ', company: 'ACME' })]));
  assert.equal(applications.findTrackedJob(application(), [job({ title: 'Platform Engineer II' })]), undefined);
});
test('tracking maps actual fields to applied and coalesces concurrent calls', async (t) => {
  const gate = deferred(); let created = 0;
  const calls = http(t, async (config, body) => {
    if (config.method === 'get') return { data: { success: true, jobs: [] } };
    created += 1; await gate.promise;
    return { status: 201, data: { success: true, job: { ...job({ id: 'created' }), ...body, revision: 1 } } };
  });
  const first = applications.trackApplication(application()); const second = applications.trackApplication(application());
  assert.equal(first, second); gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(created, 1); assert.equal(a.outcome, 'added'); assert.equal(b.job.id, 'created');
  const postCall = calls.find((call) => call.method === 'post'); const body = JSON.parse(postCall.data);
  assert.equal(body.status, 'applied'); assert.equal(body.dateApplied, '2026-10-20'); assert.equal(body.company, 'Acme'); assert.equal(body.location, 'Vijayawada');
  assert.equal('applicationId' in body, false); assert.equal('jobId' in body, false);
});
test('existing tracked application does not issue POST', async (t) => {
  const calls = http(t, () => ({ data: { success: true, jobs: [job()] } }));
  assert.equal((await applications.trackApplication(application())).outcome, 'existing');
  assert.equal(calls.filter((call) => call.method === 'post').length, 0);
});
test('create conflict reconciles an existing record rather than fabricating success', async (t) => {
  let gets = 0;
  http(t, (config) => {
    if (config.method === 'get') { gets += 1; return { data: { success: true, jobs: gets > 1 ? [job()] : [] } }; }
    return conflict;
  });
  assert.equal((await applications.trackApplication(application())).outcome, 'existing');
});

test('optimistic plan captures the complete original record and revision', () => {
  const original = job({ notes: 'keep me', interviewAt: '2026-11-03T10:30' });
  const plan = tracker.planStageMove(original, 'interview');
  assert.equal(plan.expectedRevision, 3); assert.deepEqual(plan.previous, original); assert.equal(plan.optimistic.status, 'interview'); assert.equal(original.status, 'applied');
});
test('rollback restores the exact previous record, not only its stage', () => {
  const plan = tracker.planStageMove(job({ notes: 'original' }), 'offer');
  assert.deepEqual(tracker.rollbackTrackedJob([plan.optimistic], plan), [plan.previous]);
});
test('409 is classified as a revision conflict with remote revision', async (t) => {
  http(t, () => conflict);
  await assert.rejects(tracker.updateTrackedJob(job(), { status: 'offer' }), (error) => tracker.isRevisionConflict(error) && error.remoteRevision === 8);
});
test('stage PATCH sends expectedRevision and preserves unrelated response fields', async (t) => {
  const calls = http(t, () => ({ data: { success: true, job: job({ status: 'interview', revision: 4, notes: 'server note' }) } }));
  const result = await tracker.updateTrackedJob(job(), { status: 'interview' });
  assert.equal(calls[0].method, 'patch'); assert.deepEqual(JSON.parse(calls[0].data), { status: 'interview', expectedRevision: 3 });
  assert.equal(result.notes, 'server note'); assert.equal(result.revision, 4);
});
test('an older revision cannot overwrite a newer cached record', () => {
  const newer = job({ revision: 5, status: 'offer' });
  assert.deepEqual(tracker.reconcileTrackedJob([newer], job({ revision: 4, status: 'interview' })), [newer]);
});
test('per-record queue serializes rapid actions and uses the newly saved revision', async (t) => {
  const gate = deferred(); let finishFirst; let firstStarted;
  const firstFinished = new Promise((resolve) => { finishFirst = resolve; });
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const calls = http(t, async (_config, body) => {
    if (body.expectedRevision === 3) { firstStarted(); await gate.promise; finishFirst(); }
    return { data: { success: true, job: job({ status: body.status, revision: body.expectedRevision + 1 }) } };
  });
  const first = tracker.updateTrackedJob(job(), { status: 'interview' });
  await started;
  const second = tracker.updateTrackedJob(job({ status: 'interview', revision: 4 }), { status: 'offer' });
  assert.equal(calls.length, 1); gate.resolve(); await firstFinished;
  await Promise.all([first, second]);
  assert.deepEqual(calls.map((call) => JSON.parse(call.data).expectedRevision), [3, 4]);
});
test('failed stage move rolls back and 409 refreshes once without automatic retry', async (t) => {
  let current = job(); const writes = [];
  const calls = http(t, (config) => {
    if (config.method === 'get') return { data: { success: true, jobs: [job({ status: 'offer', revision: 8 })] } };
    return conflict;
  });
  const result = await tracker.moveTrackedJobStage(current, 'interview', {
    read: () => current, write: (value) => { current = value; writes.push(value); },
    rollback: (plan) => { current = plan.previous; writes.push(plan.previous); },
    remove: () => { current = undefined; }, refresh: async () => { current = job({ status: 'offer', revision: 8 }); },
  });
  assert.equal(result.kind, 'failed'); assert.equal(result.refreshed, true); assert.equal(current.revision, 8); assert.equal(current.status, 'offer');
  assert.equal(writes[0].status, 'interview'); assert.equal(writes[1].status, 'applied');
  assert.equal(calls.filter((call) => call.method === 'patch').length, 1);
});
test('overlapping authoritative snapshots preserve pending records and newer unrelated edits', () => {
  const pending = job({ id: 'pending', status: 'offer', revision: 3 });
  const newer = job({ id: 'other', revision: 9, notes: 'local edit' });
  const merged = display.reconcileTrackerSnapshot([job({ id: 'pending', status: 'applied' }), job({ id: 'other', revision: 8 })], [pending, newer], new Set(['pending']));
  assert.equal(merged[0].status, 'offer'); assert.equal(merged[1].revision, 9); assert.equal(merged[1].notes, 'local edit');
});
test('delete sends the captured revision in the DELETE body', async (t) => {
  const calls = http(t, () => ({ data: { success: true } }));
  await tracker.deleteTrackedJob(job());
  assert.equal(calls[0].method, 'delete'); assert.deepEqual(JSON.parse(calls[0].data), { expectedRevision: 3 });
});

const calendarJob = () => job({ status: 'interview', title: 'Engineer, II; Lead', company: 'Acme\\India', interviewRound: 'Technical', interviewFormat: 'Video', interviewAt: '2026-11-03T10:30', interviewLink: 'https://meet.example.test/a?x=1', notes: 'Bring portfolio\nAsk; clarify, budget' });
const unfold = (content) => content.replace(/\r\n /g, '');
test('calendar has required VCALENDAR/VEVENT structure and CRLF endings', () => {
  const file = display.interviewCalendarFile(calendarJob(), new Date('2026-10-29T12:00:00Z'));
  assert.ok(file.content.startsWith('BEGIN:VCALENDAR\r\n')); assert.ok(file.content.endsWith('END:VCALENDAR\r\n'));
  assert.equal(/[^\r]\n|\r[^\n]/.test(file.content), false);
  for (const property of ['VERSION:2.0', 'PRODID:', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:', 'DTSTAMP:', 'DTSTART:', 'DTEND:', 'SUMMARY:', 'DESCRIPTION:', 'END:VEVENT']) assert.ok(unfold(file.content).includes(property));
});
test('calendar DTSTART/DTEND match saved time and the documented one-hour duration', () => {
  const content = unfold(display.interviewCalendarFile(calendarJob()).content);
  assert.ok(content.includes('DTSTART:20261103T103000\r\n')); assert.ok(content.includes('DTEND:20261103T113000\r\n'));
  assert.ok(content.includes('DTSTAMP:')); assert.ok(fileEndsInICS(display.interviewCalendarFile(calendarJob()).filename));
});
function fileEndsInICS(filename) { return filename.endsWith('.ics') && filename.includes('2026-11-03'); }
test('calendar escapes commas, semicolons, backslashes and newlines', () => {
  assert.equal(display.icsEscape('a,b;c\\d\r\ne'), 'a\\,b\\;c\\\\d\\ne');
  const content = unfold(display.interviewCalendarFile(calendarJob()).content);
  assert.ok(content.includes('SUMMARY:Interview: Engineer\\, II\\; Lead at Acme\\\\India'));
  assert.ok(content.includes('Ask\\; clarify\\, budget'));
});
test('calendar folds every line to 75 UTF-8 octets without splitting code points', () => {
  const content = display.interviewCalendarFile(job({ notes: 'భారతదేశం '.repeat(100), interviewAt: '2026-11-03T10:30' })).content;
  const encoder = new TextEncoder();
  for (const line of content.split('\r\n')) assert.ok(encoder.encode(line).length <= 75);
  assert.ok(unfold(content).includes('భారతదేశం'));
});
test('calendar floating wall-clock output is deterministic across process time zones', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'UTC'; const utc = display.interviewCalendarFile(calendarJob()).content;
    process.env.TZ = 'Asia/Kolkata'; const india = display.interviewCalendarFile(calendarJob()).content;
    assert.equal(utc, india);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('calendar is unavailable for missing or malformed interview time', () => {
  assert.equal(display.interviewCalendarFile(job()), null);
  assert.equal(display.interviewCalendarFile(job({ interviewAt: '2026-02-30T10:30' })), null);
});
test('calendar UID is stable for the same saved interview', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  assert.equal(display.interviewCalendarFile(calendarJob(), now).content, display.interviewCalendarFile(calendarJob(), now).content);
});

test('Applied Jobs URL parses documented filters and safe fallbacks', () => {
  assert.deepEqual(applicationDisplay.parseApplicationURL(new URLSearchParams('status=interview&q=acme&sort=company')), { status: 'interview', q: 'acme', sort: 'company' });
  assert.deepEqual(applicationDisplay.parseApplicationURL(new URLSearchParams('status=bogus&sort=bogus')), { status: 'all', q: '', sort: 'date' });
});
test('tracker URL accepts board/list and rejects invalid view', () => {
  assert.equal(display.parseView('board'), 'board'); assert.equal(display.parseView('list'), 'list'); assert.equal(display.parseView('grid'), 'board');
});
test('URL search/sort round-trip preserves unrelated parameters', () => {
  const state = { view: 'list', q: ' senior engineer ', sort: 'deadline' };
  const params = display.trackerURLParameters(new URLSearchParams('tenant=personal&utm_source=email'), state);
  assert.equal(params.get('tenant'), 'personal'); assert.equal(params.get('utm_source'), 'email');
  assert.deepEqual(display.parseTrackerURL(params), { ...state, q: 'senior engineer' });
  const applied = applicationDisplay.applicationURLParameters(new URLSearchParams('tab=mine'), { status: 'offered', q: 'acme', sort: 'company' });
  assert.equal(applied.get('tab'), 'mine'); assert.deepEqual(applicationDisplay.parseApplicationURL(applied), { status: 'offered', q: 'acme', sort: 'company' });
});
test('invalid wall-clock values never shift into the following month', () => {
  assert.equal(display.localDateTime('2026-02-30T10:30'), null);
  assert.equal(display.localDate('2026-04-31'), null);
  assert.equal(display.localDateTime('2026-11-03T10:30').getHours(), 10);
});
test('tracker sorting includes stage/company/deadline and keeps missing deadlines last', () => {
  const rows = [job({ id: 'none' }), job({ id: 'late', deadline: '2026-12-01' }), job({ id: 'soon', deadline: '2026-11-01' })];
  assert.deepEqual(display.sortJobs(rows, 'deadline').map((row) => row.id), ['soon', 'late', 'none']);
  assert.equal(display.sortJobs(rows, 'stage').length, 3); assert.equal(display.sortJobs(rows, 'company').length, 3);
});
