import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-056 SUB-056-4 — Saved Favorites & Bookmarks workspace.
 *
 * The defect this suite pins: `/dashboard/favorites` rendered a completely
 * blank white screen because the entire view was gated behind
 * `props.isFavoritesShowed === true`, which the `favorites` route never passed.
 * These tests fail loudly if that gate — or any replacement guarantee — regress.
 */

const FAVOURITES = 'src/components/Dashboard/DashboardFavourites/DashboardFavourites.jsx';
const DASH = 'src/components/Dashboard/DashboardMain/DashboardMain.jsx';

/** Strip comments so assertions test CODE, not prose that names the defect. */
const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const readFavourites = async () => stripComments(await fs.readFile(FAVOURITES, 'utf8'));

test('SUB-056-4: the blank-screen gate is gone — the view renders unconditionally', async () => {
  const code = await readFavourites();
  assert.doesNotMatch(code, /isFavoritesShowed/, 'the favorites route never passed this prop, so the view rendered nothing');
  assert.match(code, /export default MyComponent/, 'the component must still export a default');
});

test('SUB-056-4: it reads BOTH saved documents and saved jobs from the real API', async () => {
  const code = await readFavourites();
  assert.match(code, /getFavourites\(/, 'documents come from GET /api/favourites');
  assert.match(code, /getJobFavourites\(/, 'jobs come from GET /api/favourites?type=job');
  // Zero fabrication: no mock arrays or placeholder records.
  assert.doesNotMatch(code, /lorem|dummy|mockData|sampleData/i, 'the workspace must never invent rows');
});

test('SUB-056-4: the three filter tabs exist (All, Documents, Jobs)', async () => {
  const code = await readFavourites();
  for (const label of ["label: 'All'", "label: 'Documents'", "label: 'Jobs'"]) {
    assert.ok(code.includes(label), `missing filter tab ${label}`);
  }
  assert.match(code, /role="tablist"/, 'the tab strip must be exposed as a tablist');
  assert.match(code, /role="tabpanel"/, 'the panel must be exposed as a tabpanel');
});

test('SUB-056-4: deletion is optimistic, persisted and reported via toast', async () => {
  const code = await readFavourites();
  assert.match(code, /removeFromFavourites\(/, 'the removal must be persisted to the backend');
  assert.match(code, /setItems\(\(current\) => current\.filter/, 'the row must drop optimistically');
  assert.match(code, /setItems\(snapshot\)/, 'a failed removal must roll back');
  assert.match(code, /showToast\?\.\(/, 'the user must be told the real outcome');
});

test('SUB-056-4: rich Cuba UX states are wired (loading, empty, error + retry)', async () => {
  const code = await readFavourites();
  assert.match(code, /CubaLoadingState/, 'a real loading state is required');
  assert.match(code, /CubaEmptyState/, 'a real empty state is required');
  assert.match(code, /CubaErrorState/, 'a real error state is required');
  assert.match(code, /onRetry=\{handleRetry\}/, 'the error state must offer a working retry');
});

test('SUB-056-4: rows expose accessible Open / Remove controls', async () => {
  const code = await readFavourites();
  assert.match(code, /aria-label=\{`Open \$\{item\.title\}`\}/, 'the Open control needs an accessible name');
  assert.match(code, /aria-label=\{`Remove \$\{item\.title\} from favourites`\}/, 'the Remove control needs an accessible name');
});

test('SUB-056-4: the unreachable favourites modal wiring is removed from DashboardMain', async () => {
  const code = stripComments(await fs.readFile(DASH, 'utf8'));
  assert.doesNotMatch(code, /isFavoritesShowed/, 'the dead modal state must be gone');
  assert.doesNotMatch(code, /showFavorites/, 'the dead modal toggle must be gone');
  // ...but the REAL route must remain, and it must still pass showToast.
  assert.match(
    code,
    /<Route path="favorites" element=\{<DashboardFavourites showToast=\{this\.showToast\} \/>\} \/>/,
    'the favourites route must stay mounted and keep its toast channel',
  );
});

test('SUB-056-4: the dead modal stylesheet is removed with the modal', async () => {
  let exists = true;
  try {
    await fs.access('src/components/Dashboard/DashboardFavourites/DashboardFavourites.scss');
  } catch {
    exists = false;
  }
  assert.equal(exists, false, 'the modal-only stylesheet should not survive the modal removal');
});

test('SUB-056-4: every destination the workspace opens is a mounted route', async () => {
  const [favourites, dash, main] = await Promise.all([
    readFavourites(),
    fs.readFile(DASH, 'utf8'),
    fs.readFile('src/main.jsx', 'utf8'),
  ]);

  const exact = new Set();
  const wildcard = new Set();
  for (const m of main.match(/<Route path="(\/[^"]*)"/g) || []) {
    const raw = m.replace('<Route path="', '').replace(/"/g, '');
    if (raw.endsWith('/*')) wildcard.add(raw.slice(0, -2));
    else exact.add(raw);
  }
  for (const m of dash.match(/<Route path="([^"]*)"/g) || []) {
    const raw = m.replace('<Route path="', '').replace(/"/g, '');
    if (raw && raw !== '*') exact.add(`/dashboard/${raw}`.replace(/\/+$/, ''));
  }

  const isMounted = (path) => exact.has(path)
    || [...wildcard].some((p) => path === p || path.startsWith(`${p}/`))
    || [...exact].some((r) => path.startsWith(`${r}/`));

  for (const path of ['/dashboard/cover-letters', '/dashboard/jobs', '/dashboard/portfolios', '/build-resume/heading']) {
    assert.ok(isMounted(path), `${path} is not a mounted route — that would be a dead link`);
  }

  // The dynamic job-detail navigation must target a real route template.
  assert.match(
    favourites,
    /navigate\(`\/dashboard\/jobs\/portal\/\$\{encodeURIComponent\(item\.id\)\}`\)/,
    'job rows must open the real job-detail route',
  );
  assert.ok(exact.has('/dashboard/jobs/portal/:jobId'), 'the job-detail route template must be mounted');
});

