/**
 * Mandate 11I browser verification. Real router/components/API client; controlled
 * route fixtures only at the network boundary. No production mock behavior.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

type Json = Record<string, unknown>;
type Call = { method: string; path: string; body: Json | null };
type FixtureApplication = {
  id: string; jobId: string; status: string; createdAt: string; updatedAt: string;
  applicantName: string; applicantEmail: string; applicantPhone: string; resumeId: string | null; coverLetter: string;
  job: { title: string; company: string; location: string; listed: boolean };
};
type FixtureJob = {
  id: string; title: string; company: string; status: string; location: string; workMode: string; salary: string;
  url: string; notes: string; dateApplied: string; deadline: string; contactPerson: string; contactEmail: string;
  interviewRound: string; interviewFormat: string; interviewAt: string; interviewLink: string;
  revision: number; createdAt: string; updatedAt: string;
};
const application = (overrides: Partial<FixtureApplication> = {}): FixtureApplication => ({
  id: 'app-1', jobId: 'job-1', status: 'pending', createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z',
  applicantName: 'Priya Sharma', applicantEmail: 'priya@example.test', applicantPhone: '+91 9876543210', resumeId: null,
  coverLetter: 'I build accessible products.', job: { title: 'Platform Engineer', company: 'Acme', location: 'Vijayawada', listed: true }, ...overrides,
});
const tracked = (overrides: Partial<FixtureJob> = {}): FixtureJob => ({
  id: 'tracker-1', title: 'Platform Engineer', company: 'Acme', status: 'applied', location: 'Vijayawada', workMode: 'Hybrid', salary: '₹18–22 LPA',
  url: 'https://jobs.example.test/role/42', notes: 'Prepare examples', dateApplied: '2026-10-20', deadline: '', contactPerson: 'Priya Raman', contactEmail: 'recruiter@example.test',
  interviewRound: '', interviewFormat: '', interviewAt: '', interviewLink: '', revision: 3,
  createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-21T10:00:00.000Z', ...overrides,
});
const interview = (overrides: Partial<FixtureJob> = {}) => tracked({
  id: 'tracker-interview', title: 'Engineer, II; Lead', company: 'Acme\\India', status: 'interview',
  interviewRound: 'Technical', interviewFormat: 'Video', interviewAt: '2026-11-03T10:30',
  interviewLink: 'https://meet.example.test/round-1', notes: 'Bring portfolio\nAsk; clarify, budget', ...overrides,
});
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };

async function signIn(page: Page) {
  const payload = Buffer.from(JSON.stringify({ uid: 'candidate-11i', email: 'candidate@example.test', role: 'USER', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const token = `rptest.${payload}.${'a'.repeat(64)}`;
  await page.addInitScript((record) => {
    localStorage.setItem('ime_dev_user', JSON.stringify(record)); localStorage.setItem('token', record.token);
  }, { token, uid: 'candidate-11i', email: 'candidate@example.test', displayName: 'Priya Sharma', role: 'USER' });
  await page.route('**/api/users-data/profile', (route) => json(route, 200, { uid: 'candidate-11i', email: 'candidate@example.test', displayName: 'Priya Sharma', role: 'USER', emailVerified: true }));
  await page.route('**/api/ai-usage**', (route) => json(route, 200, { usedToday: 0, effectiveLimit: 20, remainingToday: 20, plan: 'free' }));
  await page.route('**/api/notifications**', (route) => json(route, 200, { success: true, notifications: [] }));
  await page.route('**/api/notifications-data**', (route) => json(route, 200, { success: true, notifications: [] }));
}
interface Controls {
  applicationsGate?: Promise<void>; trackerGate?: Promise<void>; mutationGate?: Promise<void>;
  failWithdraw?: boolean; failDelete?: boolean; failCreate?: boolean; failPatch?: boolean;
  conflictOnce?: boolean; duplicateConflict?: boolean; slowFirstPatch?: boolean;
}
async function installApi(page: Page, initialJobs: FixtureJob[] = [], initialApplications: FixtureApplication[] = [], controls: Controls = {}) {
  const state = { jobs: structuredClone(initialJobs), applications: structuredClone(initialApplications), calls: [] as Call[], patchCount: 0, createCount: 0, firstPatchGate: deferred(), firstPatchStarted: deferred() };
  await page.route('**/api/jobs-data/**', async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const method = request.method(); const body = request.postDataJSON() ?? null;
    state.calls.push({ method, path, body });
    if (method === 'GET' && path.endsWith('/applications/list')) {
      await controls.applicationsGate; return json(route, 200, { success: true, applications: state.applications });
    }
    if (method === 'GET' && path.endsWith('/tracker')) {
      await controls.trackerGate; return json(route, 200, { success: true, jobs: state.jobs, columns: ['wishlist', 'applied', 'interview', 'offer', 'rejected'] });
    }
    if (method === 'DELETE' && path.includes('/applications/')) {
      if (controls.failWithdraw) return json(route, 500, { success: false, error: 'Withdrawal failed' });
      const id = decodeURIComponent(path.split('/').pop()!); state.applications = state.applications.filter((row) => row.id !== id);
      return json(route, 200, { success: true });
    }
    if (method === 'POST' && path.endsWith('/tracker')) {
      await controls.mutationGate;
      if (controls.failCreate) return json(route, 500, { success: false, error: 'Creation failed' });
      if (controls.duplicateConflict) {
        // A future edge/proxy duplicate guard: the following authoritative GET
        // exposes the record created by another session. The current repository
        // backend does not promise this behavior (see final limitations).
        state.jobs.unshift(tracked());
        return json(route, 409, { success: false, code: 'JOB_TRACKER_DUPLICATE', error: 'Already tracked' });
      }
      state.createCount += 1;
      const row = tracked({ ...body, id: `tracker-created-${state.createCount}`, revision: 1, createdAt: '2026-10-29T10:00:00.000Z', updatedAt: '2026-10-29T10:00:00.000Z' });
      state.jobs.unshift(row); return json(route, 201, { success: true, job: row });
    }
    if ((method === 'PATCH' || method === 'DELETE') && path.includes('/tracker/')) {
      const id = decodeURIComponent(path.split('/').pop()!); const current = state.jobs.find((row) => row.id === id);
      if (!current) return json(route, 404, { success: false, code: 'JOB_TRACKER_NOT_FOUND', error: 'Not found' });
      if (method === 'PATCH') {
        state.patchCount += 1;
        if (state.patchCount === 1 && controls.slowFirstPatch) { state.firstPatchStarted.resolve(); await state.firstPatchGate.promise; }
        else await controls.mutationGate;
        if (controls.conflictOnce) {
          controls.conflictOnce = false; current.status = 'offer'; current.notes = 'Updated in another tab'; current.revision += 1;
          return json(route, 409, { success: false, code: 'JOB_TRACKER_CONFLICT', error: 'Changed elsewhere', remoteRevision: current.revision });
        }
        if (controls.failPatch) return json(route, 500, { success: false, error: 'Update failed' });
      } else {
        await controls.mutationGate;
        if (controls.failDelete) return json(route, 500, { success: false, error: 'Delete failed' });
      }
      if (body?.expectedRevision !== current.revision) return json(route, 409, { success: false, code: 'JOB_TRACKER_CONFLICT', remoteRevision: current.revision });
      if (method === 'DELETE') { state.jobs = state.jobs.filter((row) => row.id !== id); return json(route, 200, { success: true }); }
      Object.assign(current, body); delete (current as Json).expectedRevision; current.revision += 1; current.updatedAt = '2026-10-29T11:00:00.000Z';
      return json(route, 200, { success: true, job: current });
    }
    return json(route, 404, { success: false, error: `Unfixtured endpoint: ${path}` });
  });
  return Object.assign(state, { state });
}
const card = (page: Page, id: string) => page.locator(`article[data-tracker-id="${id}"]`);
const stageColumn = (page: Page, stage: string) => page.locator(`section[data-stage="${stage}"]`);
async function openApplications(page: Page) { await page.goto('/dashboard/applied-jobs'); await expect(page.getByRole('heading', { name: 'Applied Jobs', level: 1 })).toBeVisible(); }
async function openTracker(page: Page) { await page.goto('/dashboard/job-tracker'); await expect(page.getByRole('heading', { name: 'Job Tracker', level: 1 })).toBeVisible(); }
async function editJob(page: Page, id: string, interviewAction = false) {
  await card(page, id).getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: interviewAction ? /Change interview|Schedule interview/ : 'Edit details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
let browserErrors: string[] = [];
test.beforeEach(async ({ page }) => { browserErrors = []; page.on('pageerror', (error) => browserErrors.push(error.message)); await signIn(page); });
test.afterEach(() => { expect(browserErrors, 'No uncaught browser errors').toEqual([]); });

test('A — real list envelope, skeleton, lifecycle filters, search, sort and refresh', async ({ page }) => {
  const gate = deferred();
  const rows = [application(), application({ id: 'app-2', jobId: 'job-2', status: 'interview_scheduled', createdAt: '2026-10-22T10:00:00Z', job: { title: 'Data Analyst', company: 'Zenith', location: 'Hyderabad', listed: true } }), application({ id: 'app-3', status: 'in_review', job: { title: 'Designer', company: 'Alpha', location: 'Remote', listed: true } })];
  const api = await installApi(page, [], rows, { applicationsGate: gate.promise });
  await page.goto('/dashboard/applied-jobs'); await expect(page.getByTestId('loading-skeleton')).toBeVisible(); gate.resolve();
  await expect(page.getByRole('list', { name: 'Applications', exact: true }).getByRole('article')).toHaveCount(3);
  await page.getByLabel('Status', { exact: true }).selectOption('interview');
  await expect(page.getByRole('article')).toHaveCount(1); await expect(page.getByRole('heading', { name: 'Data Analyst' })).toBeVisible();
  await expect(page).toHaveURL(/status=interview/);
  await page.getByLabel('Search applications').fill('zenith'); await expect(page).toHaveURL(/q=zenith/);
  await page.getByLabel('Sort by').selectOption('company'); await expect(page).toHaveURL(/sort=company/);
  await page.reload(); await expect(page.getByLabel('Status', { exact: true })).toHaveValue('interview'); await expect(page.getByLabel('Search applications')).toHaveValue('zenith');
  await expect(page.getByLabel('Sort by')).toHaveValue('company');
  expect(api.calls.filter((call) => call.path.endsWith('/applications/list')).length).toBeGreaterThan(1);
  expect(api.calls.every((call) => !call.path.endsWith('/applications'))).toBe(true);
});

test('A — unknown and reviewing remain in All; empty criteria are explained', async ({ page }) => {
  await installApi(page, [], [application({ status: 'future_step' }), application({ id: 'app-2', status: 'reviewing' })]);
  await openApplications(page); await expect(page.getByRole('article').filter({ hasText: 'Unknown status' })).toHaveCount(1); await expect(page.getByRole('article').filter({ hasText: 'Reviewing' })).toHaveCount(1);
  await page.getByLabel('Status', { exact: true }).selectOption('applied'); await expect(page.getByText('No applications match your current search and status criteria.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click(); await expect(page.getByRole('article')).toHaveCount(2);
});

test('B — withdrawal requires confirmation, cancel restores focus, success removes only confirmed record', async ({ page }) => {
  const gate = deferred(); const api = await installApi(page, [], [application(), application({ id: 'app-2', job: { title: 'Designer', company: 'Beta', location: '', listed: true } })], { mutationGate: gate.promise });
  await openApplications(page); const trigger = page.getByRole('button', { name: 'Withdraw application for Platform Engineer at Acme' }); await trigger.click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Platform Engineer'); await expect(dialog).toContainText('cannot be undone');
  expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('button', { name: 'Confirm withdrawal' }).click(); await expect(dialog.getByRole('button', { name: 'Withdrawing…' })).toBeDisabled();
  gate.resolve(); await expect(dialog).toBeHidden(); await expect(page.getByRole('heading', { name: 'Platform Engineer', exact: true })).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Designer' })).toBeVisible();
  expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
});

test('B — failed withdrawal preserves application and permits safe retry', async ({ page }) => {
  const api = await installApi(page, [], [application()], { failWithdraw: true }); await openApplications(page);
  await page.getByRole('button', { name: /^Withdraw application for/ }).click(); await page.getByRole('button', { name: 'Confirm withdrawal' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('could not be confirmed'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep application' }).click(); await expect(page.getByRole('heading', { name: 'Platform Engineer' })).toBeVisible();
  expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
});

test('C — Track Application maps real fields, coalesces repeated clicks and becomes Tracked', async ({ page }) => {
  const gate = deferred(); const api = await installApi(page, [], [application()], { mutationGate: gate.promise }); await openApplications(page);
  const button = page.getByRole('button', { name: 'Track application: Platform Engineer at Acme' }); await button.click(); await expect(button).toBeDisabled();
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); }); gate.resolve();
  await expect(page.getByRole('link', { name: 'Open in Job Tracker: Platform Engineer at Acme' })).toBeVisible(); await expect(page.getByText('Tracked · Applied')).toBeVisible();
  expect(api.createCount).toBe(1); const body = api.calls.find((call) => call.method === 'POST')!.body!;
  expect(body).toMatchObject({ title: 'Platform Engineer', company: 'Acme', location: 'Vijayawada', dateApplied: '2026-10-20', status: 'applied' });
  expect(body).not.toHaveProperty('applicationId'); expect(body).not.toHaveProperty('jobId');
});

test('C — existing tracker and server duplicate conflict do not create another record', async ({ page }) => {
  const api = await installApi(page, [tracked()], [application()]); await openApplications(page);
  await expect(page.getByRole('link', { name: /^Open in Job Tracker/ })).toBeVisible(); expect(api.createCount).toBe(0);
  await page.goto('/dashboard/job-tracker'); await expect(card(page, 'tracker-1')).toBeVisible();
  const second = await installApi(page, [], [application()], { duplicateConflict: true });
  await openApplications(page); await page.getByRole('button', { name: /^Track application:/ }).click();
  await expect(page.getByRole('link', { name: /^Open in Job Tracker/ })).toBeVisible(); expect(second.createCount).toBe(0);
});

test('C — failed tracking keeps application and allows retry', async ({ page }) => {
  const api = await installApi(page, [], [application()], { failCreate: true }); await openApplications(page);
  await page.getByRole('button', { name: /^Track application:/ }).click(); await expect(page.getByRole('alert')).toContainText('not confirmed as tracked');
  await expect(page.getByRole('heading', { name: 'Platform Engineer' })).toBeVisible(); await expect(page.getByRole('button', { name: /^Track application:/ })).toBeEnabled(); expect(api.createCount).toBe(0);
});

test('D — five distinct columns, correct counts, empty states and filtering @responsive', async ({ page }) => {
  await installApi(page, [tracked(), tracked({ id: 'tracker-2', title: 'Saved role', company: 'Beta', status: 'wishlist' }), interview()]); await openTracker(page);
  for (const label of ['Saved', 'Applied', 'Interviewing', 'Offer', 'Archived / Rejected']) await expect(page.getByRole('heading', { name: new RegExp(`^${label.replace('/', '\\/')} \\(`) })).toBeVisible();
  await expect(page.getByTestId('count-applied')).toHaveText('1'); await expect(page.getByTestId('count-offer')).toHaveText('0');
  await expect(stageColumn(page, 'offer')).toContainText('No jobs in this stage.');
  await page.getByLabel('Search tracked jobs').fill('Saved role'); await expect(page.getByTestId('count-wishlist')).toHaveText('1'); await expect(page.getByTestId('count-applied')).toHaveText('0');
  await expect(page.locator('article[data-tracker-id]')).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); expect(overflow).toBe(false);
});

test('E — keyboard selector and Advance persist canonical stages; terminal advance disabled', async ({ page }) => {
  const api = await installApi(page, [tracked({ status: 'wishlist' })]); await openTracker(page);
  await card(page, 'tracker-1').getByRole('button', { name: /^Advance .* to Applied/ }).click(); await expect(stageColumn(page, 'applied').locator('article')).toHaveCount(1);
  await card(page, 'tracker-1').getByLabel(/^Stage for/).selectOption('interview'); await expect(stageColumn(page, 'interview').locator('article')).toHaveCount(1);
  await expect(card(page, 'tracker-1').getByLabel(/^Stage for/)).toBeFocused();
  await card(page, 'tracker-1').getByLabel(/^Stage for/).selectOption('offer'); await expect(card(page, 'tracker-1').getByRole('button', { name: /^No next stage/ })).toBeDisabled();
  await card(page, 'tracker-1').getByLabel(/^Stage for/).selectOption('rejected'); await expect(card(page, 'tracker-1').getByRole('button', { name: /^No next stage/ })).toBeDisabled();
  expect(api.calls.filter((call) => call.method === 'PATCH').map((call) => call.body!.status)).toEqual(['applied', 'interview', 'offer', 'rejected']);
});

test('E — native drag handle moves a card without dragging action controls', async ({ page }) => {
  const api = await installApi(page, [tracked()]); await openTracker(page);
  await page.locator('#tracker-drag-tracker-1').dragTo(stageColumn(page, 'interview'));
  await expect(stageColumn(page, 'interview').locator('article[data-tracker-id="tracker-1"]')).toHaveCount(1);
  expect(api.calls.some((call) => call.method === 'PATCH' && call.body?.status === 'interview')).toBe(true);
});

test('E — optimistic movement is visible and failure restores the exact previous record', async ({ page }) => {
  const gate = deferred(); const api = await installApi(page, [tracked()], [], { mutationGate: gate.promise, failPatch: true }); await openTracker(page);
  await card(page, 'tracker-1').getByLabel(/^Stage for/).selectOption('interview');
  await expect(stageColumn(page, 'interview').locator('article')).toHaveCount(1); await expect(card(page, 'tracker-1').getByLabel(/^Stage for/)).toBeDisabled();
  gate.resolve(); await expect(page.getByRole('alert')).toContainText('could not be moved'); await expect(stageColumn(page, 'applied').locator('article')).toHaveCount(1);
  await expect(card(page, 'tracker-1')).toContainText('Prepare examples'); expect(api.state.jobs[0].revision).toBe(3);
});

test('E — 409 refreshes authoritative state and never retries the stale action', async ({ page }) => {
  const api = await installApi(page, [tracked()], [], { conflictOnce: true }); await openTracker(page);
  await card(page, 'tracker-1').getByLabel(/^Stage for/).selectOption('interview');
  await expect(page.getByRole('alert')).toContainText('latest version is shown'); await expect(stageColumn(page, 'offer').locator('article')).toHaveCount(1);
  await expect(card(page, 'tracker-1')).toContainText('Updated in another tab'); expect(api.state.patchCount).toBe(1); expect(api.state.jobs[0].revision).toBe(4);
});

test('E — rapid stage actions serialize revisions and delayed responses cannot regress state', async ({ page }) => {
  const api = await installApi(page, [tracked()], [], { slowFirstPatch: true }); await openTracker(page);
  await card(page, 'tracker-1').getByLabel(/^Stage for/).selectOption('interview'); await api.state.firstPatchStarted.promise;
  // The in-flight card is locked; repeated programmatic activation cannot dispatch a stale revision.
  await card(page, 'tracker-1').getByLabel(/^Stage for/).evaluate((element: HTMLSelectElement) => { element.value = 'offer'; element.dispatchEvent(new Event('change', { bubbles: true })); });
  api.state.firstPatchGate.resolve(); await expect(stageColumn(page, 'interview').locator('article')).toHaveCount(1);
  await card(page, 'tracker-1').getByLabel(/^Stage for/).selectOption('offer'); await expect(stageColumn(page, 'offer').locator('article')).toHaveCount(1);
  expect(api.calls.filter((call) => call.method === 'PATCH').map((call) => call.body!.expectedRevision)).toEqual([3, 4]); expect(api.state.jobs[0].revision).toBe(5);
});

test('F — create validates required fields, URL and length; valid data persists @responsive', async ({ page }) => {
  const api = await installApi(page); await openTracker(page); await page.getByRole('button', { name: 'Track a job', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Add to tracker' }).click();
  await expect(dialog.getByText('Enter the job title.', { exact: true })).toBeVisible(); await expect(dialog.getByText('Enter the company.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Job title').fill('x'.repeat(161)); await dialog.getByLabel(/^Company/).fill('ಅಕ್ಮೆ Technologies');
  await dialog.getByLabel('Job posting link').fill('javascript:alert(1)'); await dialog.getByRole('button', { name: 'Add to tracker' }).click();
  await expect(dialog.getByText(/at most 160 characters/)).toBeVisible(); await expect(dialog.getByText(/complete http:\/\/ or https/)).toBeVisible(); expect(api.createCount).toBe(0);
  await dialog.getByLabel('Job title').fill('Accessibility Engineer'); await dialog.getByLabel('Job posting link').fill('https://example.test/jobs/42');
  await dialog.getByLabel('Work mode').selectOption('Remote'); await dialog.getByRole('button', { name: 'Add to tracker' }).click();
  await expect(dialog).toBeHidden(); await expect(page.getByRole('heading', { name: 'Accessibility Engineer' })).toBeVisible(); expect(api.createCount).toBe(1);
  expect(api.state.jobs[0].company).toBe('ಅಕ್ಮೆ Technologies');
});

test('F — edit preloads data, failed save preserves values, conflict requires explicit review', async ({ page }) => {
  const api = await installApi(page, [tracked()], [], { failPatch: true }); await openTracker(page); await editJob(page, 'tracker-1');
  const dialog = page.getByRole('dialog'); await expect(dialog.getByLabel('Job title')).toHaveValue('Platform Engineer'); await dialog.getByLabel('Notes', { exact: true }).fill('My preserved draft');
  await dialog.getByRole('button', { name: 'Save changes' }).click(); await expect(dialog.getByRole('alert')).toBeVisible(); await expect(dialog.getByLabel('Notes', { exact: true })).toHaveValue('My preserved draft');
  api.state.calls.length = 0; await dialog.getByRole('button', { name: 'Cancel' }).click();
  const conflictApi = await installApi(page, [tracked()], [], { conflictOnce: true }); await editJob(page, 'tracker-1');
  await page.getByRole('dialog').getByLabel('Notes', { exact: true }).fill('Explicitly reviewed edit'); await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('region', { name: 'Latest version changed elsewhere' })).toBeVisible(); expect(conflictApi.state.patchCount).toBe(1);
  await page.getByRole('button', { name: 'Use latest version and keep my edits' }).click(); await expect(page.getByRole('dialog').getByLabel('Notes', { exact: true })).toHaveValue('Explicitly reviewed edit');
  await page.getByRole('button', { name: 'Save changes' }).click(); await expect(page.getByRole('dialog')).toBeHidden(); expect(conflictApi.state.patchCount).toBe(2); expect(conflictApi.state.jobs[0].notes).toBe('Explicitly reviewed edit');
});

test('G — deletion confirms, cancel has no request, failure preserves card and focus returns', async ({ page }) => {
  const api = await installApi(page, [tracked()], [], { failDelete: true }); await openTracker(page);
  await card(page, 'tracker-1').getByRole('button', { name: /^Actions for/ }).click(); await page.getByRole('menuitem', { name: 'Remove from tracker…' }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Platform Engineer'); await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click(); await expect(dialog).toBeHidden(); expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
  await expect(card(page, 'tracker-1').getByRole('button', { name: /^Actions for/ })).toBeFocused();
  await card(page, 'tracker-1').getByRole('button', { name: /^Actions for/ }).click(); await page.getByRole('menuitem', { name: 'Remove from tracker…' }).click();
  await dialog.getByRole('button', { name: 'Confirm removal' }).click(); await expect(dialog.getByRole('alert')).toBeVisible(); await dialog.getByRole('button', { name: 'Cancel' }).click(); await expect(card(page, 'tracker-1')).toBeVisible();
  const success = await installApi(page, [tracked()]); await card(page, 'tracker-1').getByRole('button', { name: /^Actions for/ }).click(); await page.getByRole('menuitem', { name: 'Remove from tracker…' }).click();
  await dialog.getByRole('button', { name: 'Confirm removal' }).click(); await expect(card(page, 'tracker-1')).toHaveCount(0); expect(success.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
});

test('H — all round/format options, required scheduling time and saved single-round contract', async ({ page }) => {
  const api = await installApi(page, [tracked({ status: 'interview' })]); await openTracker(page); await editJob(page, 'tracker-1', true);
  const dialog = page.getByRole('dialog');
  for (const round of ['Recruiter Screen', 'Technical', 'System Design', 'Behavioral', 'Hiring Manager']) await expect(dialog.getByLabel('Round', { exact: true }).getByRole('option', { name: round, exact: true })).toHaveCount(1);
  for (const format of ['Video', 'In-Person', 'Phone']) await expect(dialog.getByLabel('Format', { exact: true }).getByRole('option', { name: format, exact: true })).toHaveCount(1);
  await dialog.getByLabel('Round', { exact: true }).selectOption('System Design'); await dialog.getByLabel('Format', { exact: true }).selectOption('In-Person');
  await dialog.getByRole('button', { name: 'Save changes' }).click(); await expect(dialog.getByText('Enter the interview date and time.', { exact: true })).toBeVisible();
  await expect(dialog).toContainText('one round per job');
  await dialog.getByLabel('Date and time', { exact: true }).fill('2026-11-03T15:45'); await dialog.getByRole('button', { name: 'Save changes' }).click(); await expect(dialog).toBeHidden();
  await expect(card(page, 'tracker-1')).toContainText('System Design · In-Person'); await expect(card(page, 'tracker-1')).toContainText('03:45 pm');
  expect(api.state.jobs[0].interviewAt).toBe('2026-11-03T15:45');
});

test('I — valid interview downloads escaped RFC 5545 content; missing time has no download', async ({ page }) => {
  await installApi(page, [interview(), tracked()]); await openTracker(page);
  await expect(card(page, 'tracker-1').getByRole('button', { name: /Download interview calendar/ })).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download'); await card(page, 'tracker-interview').getByRole('button', { name: /Download interview calendar/ }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe('interview-acme-india-2026-11-03.ics');
  const content = await readFile((await download.path())!, 'utf8'); const unfolded = content.replace(/\r\n /g, '');
  expect(content.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true); expect(content.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect(unfolded).toContain('DTSTART:20261103T103000'); expect(unfolded).toContain('DTEND:20261103T113000'); expect(unfolded).toContain('SUMMARY:Interview: Engineer\\, II\\; Lead at Acme\\\\India');
  expect(unfolded).toContain('Ask\\; clarify\\, budget'); for (const line of content.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  await expect(page.getByRole('status').filter({ hasText: 'Calendar download initiated' })).toBeVisible();
});

test('J/K — board/list, search/sort, Back/Forward, refresh and unrelated URL parameters', async ({ page }) => {
  await installApi(page, [tracked(), tracked({ id: 'tracker-2', title: 'Designer', company: 'Beta' })]); await openTracker(page);
  await page.getByRole('button', { name: 'List', exact: true }).click(); await expect(page).toHaveURL(/view=list/); await expect(page.getByRole('list', { name: 'Tracked jobs', exact: true })).toBeVisible();
  await page.getByLabel('Search tracked jobs').fill('Designer'); await expect(page).toHaveURL(/q=Designer/); await page.getByLabel('Sort by').selectOption('company'); await expect(page).toHaveURL(/sort=company/);
  await page.goBack(); await expect(page.getByLabel('Sort by')).toHaveValue('stage'); await page.goForward(); await expect(page.getByLabel('Sort by')).toHaveValue('company');
  await page.reload(); await expect(page.getByLabel('Search tracked jobs')).toHaveValue('Designer'); await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Board', exact: true }).click(); await expect(page).toHaveURL(/view=board/);
  await page.goto('/dashboard/job-tracker?view=invalid&sort=invalid&tenant=personal'); await expect(page.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page).toHaveURL(/tenant=personal/);
  await page.getByLabel('Sort by').selectOption('deadline'); await expect(page).toHaveURL(/tenant=personal/);
});

test('K — Applied Jobs Back/Forward restores filters and search', async ({ page }) => {
  await installApi(page, [], [application(), application({ id: 'app-2', status: 'offered', job: { title: 'Designer', company: 'Zenith', location: '', listed: true } })]); await openApplications(page);
  await page.getByLabel('Status', { exact: true }).selectOption('offered'); await expect(page).toHaveURL(/status=offered/); await page.getByLabel('Search applications').fill('Zenith'); await expect(page).toHaveURL(/q=Zenith/);
  await page.goBack(); await expect(page.getByLabel('Search applications')).toHaveValue(''); await expect(page.getByLabel('Status', { exact: true })).toHaveValue('offered');
  await page.goForward(); await expect(page.getByLabel('Search applications')).toHaveValue('Zenith'); await page.goBack(); await page.goBack(); await expect(page.getByLabel('Status', { exact: true })).toHaveValue('all');
});

test('L — keyboard dialog operation, live announcements and mobile actions @responsive', async ({ page }) => {
  await installApi(page, [tracked()], [application({ id: 'app-2', jobId: 'job-2', job: { title: 'Untracked Designer', company: 'Beta', location: 'Remote', listed: true } })]); await openTracker(page);
  await page.getByRole('button', { name: 'Track a job', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden(); await expect(page.getByRole('button', { name: 'Track a job', exact: true })).toBeFocused();
  await card(page, 'tracker-1').getByLabel(/^Stage for/).focus(); await page.keyboard.press('Tab'); await expect(card(page, 'tracker-1').getByRole('button', { name: /^Advance/ })).toBeFocused();
  await openApplications(page); await expect(page.getByRole('button', { name: /^Track application:/ })).toBeVisible(); await expect(page.getByRole('button', { name: /^Withdraw application for/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('L — WCAG 2.1 AA automated checks on pages and confirmation/form dialogs', async ({ page }) => {
  await installApi(page, [tracked(), interview()], [application({ id: 'app-2', jobId: 'job-2', job: { title: 'Untracked role', company: 'Beta', location: '', listed: true } })]);
  const scan = async (include?: string) => {
    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    if (include) builder = builder.include(include);
    const results = await builder.analyze();
    expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
  };
  await openTracker(page); await scan('main');
  await page.getByRole('button', { name: 'Track a job', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await scan('[role="dialog"]');
  await page.keyboard.press('Escape');
  await openApplications(page); await scan('main');
  await page.getByRole('button', { name: /^Withdraw application for/ }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await scan('[role="dialog"]');
});

test('L — empty/error API states retain data and offer retry', async ({ page }) => {
  await page.route('**/api/jobs-data/tracker', (route) => json(route, 500, { success: false, error: 'Unavailable' })); await openTracker(page);
  await expect(page.getByRole('region', { name: 'Tracked jobs by stage' }).getByRole('alert')).toContainText('latest tracker could not be loaded'); await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.unroute('**/api/jobs-data/tracker'); await installApi(page); await page.getByRole('button', { name: 'Try again' }).click(); await expect(page.getByText('No tracked jobs yet')).toBeVisible();
});
