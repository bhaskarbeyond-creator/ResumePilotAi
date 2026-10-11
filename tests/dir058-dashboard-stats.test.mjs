import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-058 — candidate dashboard real metrics + multi-step onboarding.
 *
 * PROVEN DEFECTS this suite pins:
 *   1. `getStatesOfUser` was a hardcoded `return []`, so every dashboard counter
 *      was permanently 0 (DashboardHomepage.jsx:287, DashboardActions.jsx:32).
 *   2. `onboardingSteps` held exactly ONE hardcoded step with no real-data link.
 *   3. The hero card labelled "Job Applications" was fed the Kanban TRACKED-jobs
 *      count — a mislabel.
 */

const CLIENT_API = 'src/services/api/platform.js';
// The directive named backend/routes/platform.js, but that router is mounted at
// /api/platform and cannot serve the specified /api/user-stats path. The handler
// therefore lives in the router mounted at /api (alongside /stats, /favourites).
const BACKEND_ROUTE = 'backend/routes/miscData.js';
const DASHBOARD = 'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx';
const HERO = 'src/components/Candidate/CubaCandidateHero.jsx';
// DIR-094 RETARGET (see the note on the "Job Applications" card test below): DIR-091
// moved the four KPI cards out of the hero and into this presenter.
const CARDS = 'src/components/Candidate/CubaMetricCardRow.jsx';

const read = (file) => fs.readFile(file, 'utf8');

/* ── The stub is gone and the client is wired to the real endpoint ─────────── */

test('DIR-058: getStatesOfUser is no longer a hardcoded empty-array stub', async () => {
  const src = await read(CLIENT_API);
  const body = src.slice(src.indexOf('export async function getStatesOfUser'));
  assert.match(body.slice(0, 900), /apiJson\('\/api\/user-stats'\)/, 'must call the real endpoint');
  assert.doesNotMatch(body.slice(0, 300), /return \[\];/, 'the hardcoded [] stub must be gone');
  assert.match(body.slice(0, 1200), /apiError: true/, 'a failed read must be surfaced, not silently zeroed');
});

/* ── The backend route is owner-scoped and honest ──────────────────────────── */

test('DIR-058: GET /api/user-stats is owner-scoped and aggregates real documents', async () => {
  const src = await read(BACKEND_ROUTE);
  const start = src.indexOf("router.get('/user-stats'");
  assert.ok(start > -1, 'the /user-stats route must exist');
  const body = src.slice(start, start + 2600);
  assert.match(body, /req\.user\?\.uid/, 'the uid must come from the verified token');
  for (const method of ['getResumes', 'getCovers', 'getPortfolios', 'getApplications', 'getTrackedJobs']) {
    assert.match(body, new RegExp(`${method}\\(`), `must aggregate ${method}`);
  }
  assert.match(body, /applicantId: uid/, 'applications must be filtered to the caller');
  assert.match(body, /USER_STATS_UNAVAILABLE/, 'a read failure must return an honest error');
  assert.match(body, /503/, 'the failure path must be 503, never a fabricated zero');
  assert.doesNotMatch(body, /resumes: 0|applications: 0/, 'counts must never be hardcoded to 0');
});

/* ── The onboarding checklist is real and multi-step ───────────────────────── */

test('DIR-058: onboarding has the four mandated steps wired to real metrics', async () => {
  const src = await read(DASHBOARD);
  for (const key of ['key: "profile"', 'key: "resume"', 'key: "cover"', 'key: "application"']) {
    assert.ok(src.includes(key), `onboarding must declare ${key}`);
  }
  assert.match(src, /applyOnboardingProgress\(measured\)/, 'completion must be derived from measured counts');
  assert.match(src, /profileComplete === true/, 'the profile step must use the real profile signal');
  assert.match(src, /resumes > 0/, 'the resume step must use the real resume count');
  assert.match(src, /coverLetters > 0/, 'the cover step must use the real cover count');
  assert.match(src, /applications > 0/, 'the application step must use the real application count');
});

test('DIR-058: the dashboard renders measured metrics with an honest unavailable state', async () => {
  const src = await read(DASHBOARD);
  assert.match(src, /userStats: measured/, 'the dashboard must store the measured stats');
  assert.match(src, /unavailable: true/, 'a failed read must be marked unavailable');
  assert.match(src, /userStats\.applications === null \? '—'/, 'an unmeasured metric must render a dash, not a 0');
});

/* ── The hero card is no longer mislabelled ────────────────────────────────── */

test('DIR-058: the "Job Applications" card shows applications, not tracked jobs', async () => {
  // ── DIR-094 RETARGET — the assertion is MOVED, not deleted ──────────────────
  // DIR-091 moved the four KPI cards out of CubaCandidateHero and into the
  // CubaMetricCardRow presenter, so the `label="Job Applications"` anchor this test
  // looked for no longer exists in HERO. That made this test RED at HEAD, before any
  // DIR-094 change: reading the HEAD blob of CubaCandidateHero.jsx directly shows it
  // does not contain the anchor, and DIR-094 never modified that file.
  //
  // The ORIGINAL INTENT is unchanged and is what still gets asserted: the card
  // labelled "Job Applications" must show the REAL application count and must never
  // show the Kanban tracked-jobs count. The assertion now follows the card to the file
  // that actually renders it.
  const [hero, cards] = await Promise.all([read(HERO), read(CARDS)]);
  const start = cards.indexOf('label="Job Applications"');
  assert.ok(start > -1, 'the Job Applications card must exist');
  const card = cards.slice(start, start + 700);
  // DIR-093 S3 polished this into an honest em-dash placeholder for an unmeasured read.
  assert.match(card, /applications === null \? '--' : String\(applications\)/, 'the card must use the real application count');
  assert.doesNotMatch(card, /value=\{[^}]*trackedJobs[^}]*\}/, 'the card value must not be the tracked-jobs count');
  assert.match(hero, /getStatesOfUser/, 'the hero must load the real metrics');
});
